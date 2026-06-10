import { ok, strictEqual } from 'node:assert';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Config } from '../../src/config';
import { spawnCli, wait } from '../libs/helpers';

/**
 * Read the daemon state file, returning null if absent or unreadable.
 */
const readStateFile = async (): Promise<any | null> => {
  if (!existsSync(Config.stateFile)) {
    return null;
  }

  try {
    return JSON.parse(await readFile(Config.stateFile, 'utf-8'));
  } catch {
    return null;
  }
};

/**
 * Kill any leftover detached daemon and remove the state/log files so that
 * each test starts from a clean slate (the daemon is a machine-wide singleton).
 */
const cleanup = async (): Promise<void> => {
  const state = await readStateFile();

  if (state && typeof state.pid === 'number') {
    try {
      process.kill(state.pid, 'SIGKILL');
    } catch {
      // already dead
    }
  }

  await rm(Config.stateFile, { force: true });
  await rm(Config.detachLogFile, { force: true });
};

/**
 * Poll an URL until it answers or the attempts run out.
 */
const fetchWithRetry = async (
  url: string,
  attempts = 20
): Promise<Response> => {
  let lastError: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await wait(250);
    }
  }

  throw lastError;
};

/**
 * Run a CLI command to completion and return its stdout and exit code.
 */
const runToCompletion = async (
  args: string[]
): Promise<{ stdout: string; exitCode: number }> => {
  const { instance, output } = await spawnCli(args);
  const { stdout } = await output;
  const exitCode: number = await new Promise((resolve) => {
    if (instance.exitCode !== null) {
      resolve(instance.exitCode);
    } else {
      instance.on('exit', (code) => resolve(code ?? 0));
    }
  });

  return { stdout, exitCode };
};

describe('Status command', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('should report the running daemon metadata and exit 0', async () => {
    const { output } = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3070',
      '--detach'
    ]);
    await output;
    await fetchWithRetry('http://localhost:3070/api/test');

    const state = await readStateFile();
    const { stdout, exitCode } = await runToCompletion(['status']);

    strictEqual(exitCode, 0);
    ok(
      stdout.includes(String(state.pid)),
      `expected PID in output, got: ${stdout}`
    );
    ok(stdout.includes('3070'), `expected port in output, got: ${stdout}`);
    ok(
      stdout.includes('mock1.json'),
      `expected data file in output, got: ${stdout}`
    );
    ok(
      stdout.includes(state.startedAt),
      `expected startedAt in output, got: ${stdout}`
    );
    ok(/watch/i.test(stdout), `expected watch in output, got: ${stdout}`);
  });

  it('should print the process log path and the per-env structured log paths', async () => {
    const { output } = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3071',
      '--detach'
    ]);
    await output;
    await fetchWithRetry('http://localhost:3071/api/test');

    const { stdout } = await runToCompletion(['status']);

    ok(
      stdout.includes('detach.log'),
      `expected detach log path in output, got: ${stdout}`
    );
    // the structured logger derives "<env>.log" from the environment name
    ok(
      stdout.includes('mock1.log'),
      `expected per-env log path in output, got: ${stdout}`
    );
  });

  it('should report no running daemon and exit 3 when nothing is running', async () => {
    const { stdout, exitCode } = await runToCompletion(['status']);

    strictEqual(exitCode, 3);
    ok(
      /no background mock api is running/i.test(stdout),
      `expected "not running" message, got: ${stdout}`
    );
  });

  it('should treat a stale state file as not running, exit 3 and clean it up', async () => {
    // a state file pointing at a PID that is not alive (negative PID is invalid)
    writeFileSync(
      Config.stateFile,
      JSON.stringify({
        pid: 2147483646,
        ports: [3072],
        dataFiles: ['./test/data/envs/mock1.json'],
        logFile: Config.detachLogFile,
        startedAt: new Date().toISOString(),
        watch: false
      })
    );

    const { stdout, exitCode } = await runToCompletion(['status']);

    strictEqual(exitCode, 3);
    ok(
      /no background mock api is running/i.test(stdout),
      `expected "not running" message, got: ${stdout}`
    );
    // the stale state file must have been auto-cleaned
    strictEqual(existsSync(Config.stateFile), false);
  });
});
