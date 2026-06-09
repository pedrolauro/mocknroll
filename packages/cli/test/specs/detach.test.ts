import { ok, strictEqual } from 'node:assert';
import { existsSync } from 'node:fs';
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

describe('Detach mode', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('should start the server in background, free the terminal and report the PID and log path', async () => {
    const { output } = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3050',
      '--detach'
    ]);

    // The parent process must exit on its own (terminal freed); awaiting its
    // output resolves only once it closes.
    const { stdout } = await output;

    ok(/PID/i.test(stdout), `expected PID in output, got: ${stdout}`);
    ok(
      stdout.includes('detach.log'),
      `expected log path in output, got: ${stdout}`
    );

    const res = await fetchWithRetry('http://localhost:3050/api/test');
    const body = await res.text();
    ok(body.includes('mock-content-1'));
  });

  it('should stop the running daemon and remove the state file', async () => {
    const { output } = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3051',
      '--detach'
    ]);
    await output;

    await fetchWithRetry('http://localhost:3051/api/test');

    const { instance: stopInstance, output: stopOutput } = await spawnCli([
      'stop'
    ]);
    await stopOutput;
    const exitCode: number = await new Promise((resolve) => {
      if (stopInstance.exitCode !== null) {
        resolve(stopInstance.exitCode);
      } else {
        stopInstance.on('exit', (code) => resolve(code ?? 0));
      }
    });

    strictEqual(exitCode, 0);
    strictEqual(existsSync(Config.stateFile), false);

    // server must no longer answer
    await wait(500);
    let serverDown = false;
    try {
      await fetch('http://localhost:3051/api/test');
    } catch {
      serverDown = true;
    }
    ok(serverDown, 'expected the server to be down after stop');
  });

  it('should exit 0 when stopping while nothing is running', async () => {
    const { instance, output } = await spawnCli(['stop']);
    await output;
    const exitCode: number = await new Promise((resolve) => {
      if (instance.exitCode !== null) {
        resolve(instance.exitCode);
      } else {
        instance.on('exit', (code) => resolve(code ?? 0));
      }
    });

    strictEqual(exitCode, 0);
    strictEqual(existsSync(Config.stateFile), false);
  });

  it('should start multiple envs in a single detached daemon', async () => {
    const { output } = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      './test/data/envs/mock1.json',
      '--port',
      '3060',
      '3061',
      '--detach'
    ]);
    await output;

    const body1 = await (
      await fetchWithRetry('http://localhost:3060/api/test')
    ).text();
    const body2 = await (
      await fetchWithRetry('http://localhost:3061/api/test')
    ).text();

    ok(body1.includes('mock-content-1'));
    ok(body2.includes('mock-content-1'));
  });

  it('should capture the process output in the detach log and truncate it on each start', async () => {
    const countServerStarted = async (): Promise<number> => {
      const log = await readFile(Config.detachLogFile, 'utf-8');

      return log.split('Server started').length - 1;
    };

    // first run
    const first = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3062',
      '--detach'
    ]);
    await first.output;
    await fetchWithRetry('http://localhost:3062/api/test');

    // the detached process boot output must land in the fixed log file
    strictEqual(await countServerStarted(), 1);

    // stop and start again: the log must be truncated, not appended
    const stop = await spawnCli(['stop']);
    await stop.output;

    const second = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3063',
      '--detach'
    ]);
    await second.output;
    await fetchWithRetry('http://localhost:3063/api/test');

    strictEqual(await countServerStarted(), 1);
  });
});
