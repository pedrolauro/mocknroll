import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Config } from '../config';
import { parseDataFile } from './data';
import { transformEnvironmentName } from './utils';

/**
 * Persisted metadata describing the single background daemon. Written by the
 * parent process right after spawning the detached child.
 */
export type DaemonState = {
  pid: number;
  ports: number[];
  dataFiles: string[];
  logFile: string;
  startedAt: string;
  watch: boolean;
};

/**
 * Whether the background daemon mode is supported on the given platform.
 *
 * Detach/stop/status rely on the POSIX detached-process and signal model,
 * which does not apply on Windows in v1. The guard lets the commands emit a
 * clear "not supported yet" message instead of spawning orphan processes or
 * sending signals that would silently fail.
 */
export const isBackgroundSupported = (
  platform: NodeJS.Platform = process.platform
): boolean => platform !== 'win32';

/**
 * Read and parse the daemon state file. Returns null when there is no state
 * file or when it cannot be parsed.
 */
export const readState = (): DaemonState | null => {
  if (!existsSync(Config.stateFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(Config.stateFile, 'utf-8')) as DaemonState;
  } catch {
    return null;
  }
};

/**
 * Persist the daemon state file, creating its parent directory if needed.
 */
export const writeState = (state: DaemonState): void => {
  mkdirSync(dirname(Config.stateFile), { recursive: true });
  writeFileSync(Config.stateFile, JSON.stringify(state, null, 2));
};

/**
 * Remove the daemon state file. No-op when it does not exist.
 */
export const clearState = (): void => {
  rmSync(Config.stateFile, { force: true });
};

/**
 * Check whether a process is alive using a signal 0 probe.
 */
export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

/**
 * Return the daemon state only when it points at a live process.
 *
 * Reads the state file, probes the recorded PID and auto-cleans a stale state
 * file (recorded process already dead). Returns null when nothing is running.
 */
export const getRunningState = (): DaemonState | null => {
  const state = readState();

  if (!state) {
    return null;
  }

  if (!isAlive(state.pid)) {
    clearState();

    return null;
  }

  return state;
};

/**
 * Derive the structured per-env log file paths for a daemon state.
 *
 * The structured logger names each file `<env>.log` after the environment
 * name, so the paths are reconstructed by re-parsing the recorded data files.
 * Files that can no longer be parsed (moved, deleted) are skipped so that
 * `status` never crashes.
 */
export const getEnvLogFiles = async (state: DaemonState): Promise<string[]> => {
  const logFiles: string[] = [];

  for (const dataFile of state.dataFiles) {
    try {
      const { environment } = await parseDataFile(dataFile);

      logFiles.push(
        join(
          Config.logsPath,
          `${transformEnvironmentName(environment.name)}.log`
        )
      );
    } catch {
      // skip data files that can no longer be parsed
    }
  }

  return logFiles;
};

/**
 * Environment marker set on the detached child. The child re-runs `start`, so
 * even if the `--detach` token survived in its argv it must never fork again:
 * `start` skips the detach branch whenever this variable is present. This is
 * the authoritative guard against a recursive spawn; argv filtering below is a
 * best-effort cleanup so the child's parsed flags stay accurate.
 */
export const DETACHED_CHILD_ENV = 'MOCKOON_CLI_DETACHED_CHILD';

/**
 * Remove the detach flag from the parent argv so the detached child parses as a
 * regular foreground `start`. Handles the forms oclif accepts for the boolean
 * flag: the long token (`--detach`, `--detach=<value>`), the standalone short
 * (`-D`), and a short cluster led by the detach flag (`-Dw`, `-Dwt`, ...).
 *
 * A cluster where the detach flag is not first (e.g. `-wD`) or any other exotic
 * form is intentionally left untouched here: the {@link DETACHED_CHILD_ENV}
 * guard prevents a recursive fork regardless, and removing the `D` from an
 * arbitrary position risks corrupting a value-taking flag's argument.
 */
const stripDetachFlag = (args: string[]): string[] =>
  args.reduce<string[]>((kept, token) => {
    if (
      token === '--detach' ||
      token.startsWith('--detach=') ||
      token === '-D'
    ) {
      return kept;
    }

    // short cluster led by the detach flag: drop the `D`, keep the rest
    if (/^-D[a-zA-Z]+$/.test(token)) {
      return [...kept, `-${token.slice(2)}`];
    }

    return [...kept, token];
  }, []);

/**
 * Spawn the current CLI invocation as a detached background process.
 *
 * The detached child re-runs the same entrypoint with the same arguments,
 * minus the `--detach`/`-D` token, so it behaves like a regular foreground
 * `start`. Its stdout/stderr are redirected to the fixed detach log file,
 * which is truncated on every spawn.
 *
 * @returns the PID of the detached child.
 */
export const spawnDetached = (): number => {
  // ensure the logs directory exists before opening the log file descriptor
  mkdirSync(Config.logsPath, { recursive: true });

  // open (truncating) the fixed detach log file
  const logFd = openSync(Config.detachLogFile, 'w');

  // reuse the parent argv (entrypoint + args) with the detach token removed
  const childArgs = stripDetachFlag(process.argv.slice(1));

  const child = spawn(process.argv[0], childArgs, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    // mark the child so it never re-enters the detach branch (see above)
    env: { ...process.env, [DETACHED_CHILD_ENV]: '1' }
  });

  child.unref();
  closeSync(logFd);

  if (child.pid === undefined) {
    throw new Error('Failed to spawn the detached background process');
  }

  return child.pid;
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Outcome of a stop attempt.
 *
 * - `wasRunning`: whether a live daemon was found and signalled.
 * - `pid`: the PID that was targeted, when there was state.
 */
export type StopResult = {
  wasRunning: boolean;
  pid?: number;
};

/**
 * Stop the background daemon, if any.
 *
 * Sends SIGINT for a graceful shutdown, polls liveness for up to `timeout`
 * milliseconds and escalates to SIGKILL if the process is still alive. The
 * state file is always removed afterwards. Idempotent: returns cleanly when
 * nothing is running or the recorded process is already dead (stale).
 */
export const stopDaemon = async (timeout = 3000): Promise<StopResult> => {
  const state = readState();

  if (!state) {
    return { wasRunning: false };
  }

  // stale state file: the recorded process is already gone
  if (!isAlive(state.pid)) {
    clearState();

    return { wasRunning: false, pid: state.pid };
  }

  // graceful shutdown
  try {
    process.kill(state.pid, 'SIGINT');
  } catch {
    // process vanished between the liveness check and the signal
  }

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && isAlive(state.pid)) {
    await wait(100);
  }

  // escalate if still alive
  if (isAlive(state.pid)) {
    try {
      process.kill(state.pid, 'SIGKILL');
    } catch {
      // already dead
    }

    const killDeadline = Date.now() + 1000;
    while (Date.now() < killDeadline && isAlive(state.pid)) {
      await wait(50);
    }
  }

  clearState();

  return { wasRunning: true, pid: state.pid };
};
