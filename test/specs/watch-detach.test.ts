import { ok, strictEqual } from 'node:assert';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
 * Kill any leftover detached daemon, remove the state/log files and the tmp
 * data files so that each test starts from a clean slate (the daemon is a
 * machine-wide singleton).
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
  await rm('./tmp', { recursive: true, force: true });
};

/**
 * Stage a fresh copy of the mock data file under ./tmp so the watch test can
 * edit it without touching the fixtures.
 */
const stageDataFile = async (name: string): Promise<string> => {
  await mkdir('./tmp', { recursive: true });
  const path = `./tmp/${name}`;
  await copyFile('./test/data/envs/mock1.json', path);

  return path;
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

describe('Watch in detach mode', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('should start a watching daemon and record watch as enabled', async () => {
    const dataFile = await stageDataFile('mock1.json');

    const { output } = await spawnCli([
      'start',
      '--data',
      dataFile,
      '--port',
      '3100',
      '--detach',
      '--watch'
    ]);
    await output;

    await fetchWithRetry('http://localhost:3100/api/test');

    // the persisted state must flag the daemon as watching
    const state = await readStateFile();
    strictEqual(state.watch, true);

    // and status must report it as observable behavior
    const { stdout } = await runToCompletion(['status']);
    ok(
      /watch:\s*on/i.test(stdout),
      `expected watch reported as on, got: ${stdout}`
    );
  });

  it('should reload and serve the updated content when the data file changes, without re-running the command', async () => {
    const dataFile = await stageDataFile('mock1.json');

    const { output } = await spawnCli([
      'start',
      '--data',
      dataFile,
      '--port',
      '3101',
      '--detach',
      '--watch'
    ]);
    await output;

    const before = await (
      await fetchWithRetry('http://localhost:3101/api/test')
    ).text();
    strictEqual(before, 'mock-content-1');

    // edit the data file: the daemon must pick it up on its own (no second start)
    const fileContent = await readFile(dataFile, 'utf-8');
    await writeFile(
      dataFile,
      fileContent.replace('mock-content-1', 'mock-content-1-updated')
    );

    // default polling interval is 2000ms; give the watcher time to reload
    await wait(4000);

    const after = await (
      await fetchWithRetry('http://localhost:3101/api/test')
    ).text();
    strictEqual(after, 'mock-content-1-updated');
  });

  it('should stop a watching daemon normally and remove the state file', async () => {
    const dataFile = await stageDataFile('mock1.json');

    const { output } = await spawnCli([
      'start',
      '--data',
      dataFile,
      '--port',
      '3102',
      '--detach',
      '--watch'
    ]);
    await output;

    await fetchWithRetry('http://localhost:3102/api/test');

    const { exitCode } = await runToCompletion(['stop']);

    strictEqual(exitCode, 0);
    strictEqual(existsSync(Config.stateFile), false);

    // the server must no longer answer once the daemon is stopped
    await wait(500);
    let serverDown = false;
    try {
      await fetch('http://localhost:3102/api/test');
    } catch {
      serverDown = true;
    }
    ok(serverDown, 'expected the watching daemon to be down after stop');
  });
});
