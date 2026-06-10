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

  it('should treat a stale state file as nothing running on stop, clean it up and exit 0', async () => {
    // a state file pointing at a PID that is not alive (stale daemon)
    writeFileSync(
      Config.stateFile,
      JSON.stringify({
        pid: 2147483646,
        ports: [3052],
        dataFiles: ['./test/data/envs/mock1.json'],
        logFile: Config.detachLogFile,
        startedAt: new Date().toISOString(),
        watch: false
      })
    );

    const { stdout, exitCode } = await runToCompletion(['stop']);

    strictEqual(exitCode, 0);
    ok(
      /no background mock api is running/i.test(stdout),
      `expected "nothing running" message, got: ${stdout}`
    );
    // the stale state file must have been auto-cleaned
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

  it('should refuse a second start --detach while a daemon is alive, reporting the PID and log path with exit 1', async () => {
    const { output } = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3080',
      '--detach'
    ]);
    await output;
    await fetchWithRetry('http://localhost:3080/api/test');

    const state = await readStateFile();

    // a second start on a different port must be refused
    const { stdout, exitCode } = await runToCompletion([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3081',
      '--detach'
    ]);

    strictEqual(exitCode, 1);
    ok(
      /already running/i.test(stdout),
      `expected "already running" message, got: ${stdout}`
    );
    ok(
      stdout.includes(String(state.pid)),
      `expected the running PID in output, got: ${stdout}`
    );
    ok(
      stdout.includes('detach.log'),
      `expected the log path in output, got: ${stdout}`
    );

    // no concurrent instance must have come up on the second port
    let secondPortDown = false;
    try {
      await fetch('http://localhost:3081/api/test');
    } catch {
      secondPortDown = true;
    }
    ok(secondPortDown, 'expected no concurrent instance on the second port');

    // the original daemon must still be the one recorded and answering
    const stateAfter = await readStateFile();
    strictEqual(stateAfter.pid, state.pid);
    ok((await fetchWithRetry('http://localhost:3080/api/test')).ok);
  });

  it('should not let a stale state file block a new start --detach (cleans it and starts)', async () => {
    // a state file pointing at a PID that is not alive (stale daemon)
    writeFileSync(
      Config.stateFile,
      JSON.stringify({
        pid: 2147483646,
        ports: [3085],
        dataFiles: ['./test/data/envs/mock1.json'],
        logFile: Config.detachLogFile,
        startedAt: new Date().toISOString(),
        watch: false
      })
    );

    const { stdout } = await runToCompletion([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3085',
      '--detach'
    ]);

    // the start must proceed, not report "already running"
    ok(
      /started in background/i.test(stdout),
      `expected the start to proceed, got: ${stdout}`
    );

    // a new live daemon must answer and the state must point at it (not stale)
    ok((await fetchWithRetry('http://localhost:3085/api/test')).ok);
    const state = await readStateFile();
    strictEqual(state.pid !== 2147483646, true);
  });

  it(
    'should refuse a file that needs migration/repair, failing fast with a clear message and creating no daemon nor state file',
    { timeout: 15000 },
    async () => {
      const { instance, output } = await spawnCli([
        'start',
        '--data',
        './test/data/envs/repair.json',
        '--port',
        '3090',
        '--detach'
      ]);

      const { stdout, stderr } = await output;
      const combined = stdout + stderr;
      const exitCode: number = await new Promise((resolve) => {
        if (instance.exitCode !== null) {
          resolve(instance.exitCode);
        } else {
          instance.on('exit', (code) => resolve(code ?? 0));
        }
      });

      // fails fast (no interactive prompt hanging the terminal-less process)
      ok(exitCode !== 0, `expected a non-zero exit code, got: ${exitCode}`);
      ok(
        /background/i.test(combined) &&
          /(foreground|repair|migrat)/i.test(combined),
        `expected a clear migration/repair refusal message, got: ${combined}`
      );

      // no daemon must have been forked and no state file written
      strictEqual(existsSync(Config.stateFile), false);

      let serverDown = false;
      try {
        await fetch('http://localhost:3090/api/test');
      } catch {
        serverDown = true;
      }
      ok(serverDown, 'expected no daemon to have come up');
    }
  );

  it(
    'should reject --detach combined with --repair as incompatible flags',
    { timeout: 15000 },
    async () => {
      const { instance, output } = await spawnCli([
        'start',
        '--data',
        './test/data/envs/repair.json',
        '--port',
        '3091',
        '--detach',
        '--repair'
      ]);

      const { stdout, stderr } = await output;
      const combined = stdout + stderr;
      const exitCode: number = await new Promise((resolve) => {
        if (instance.exitCode !== null) {
          resolve(instance.exitCode);
        } else {
          instance.on('exit', (code) => resolve(code ?? 0));
        }
      });

      ok(exitCode !== 0, `expected a non-zero exit code, got: ${exitCode}`);
      ok(
        /repair/i.test(combined) &&
          /(cannot|exclusive|together|not be)/i.test(combined),
        `expected an incompatible-flags message, got: ${combined}`
      );

      strictEqual(existsSync(Config.stateFile), false);

      let serverDown = false;
      try {
        await fetch('http://localhost:3091/api/test');
      } catch {
        serverDown = true;
      }
      ok(serverDown, 'expected no daemon to have come up');
    }
  );

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

  it('should detach correctly when the flag is clustered with another short flag (-Dw), without recursively forking', async () => {
    // `-Dw` combines detach (-D) and watch (-w) in a single short cluster. The
    // detach token must be stripped from the child argv (and the child guarded)
    // so the daemon starts exactly once instead of re-detaching in a loop.
    const { output } = await spawnCli([
      'start',
      '--data',
      './test/data/envs/mock1.json',
      '--port',
      '3064',
      '-Dw'
    ]);
    await output;

    const res = await fetchWithRetry('http://localhost:3064/api/test');
    const body = await res.text();
    ok(body.includes('mock-content-1'));

    // exactly one daemon was spawned: the boot line appears once in the log
    const log = await readFile(Config.detachLogFile, 'utf-8');
    strictEqual(
      log.split('Server started').length - 1,
      1,
      `expected a single server boot, got log: ${log}`
    );

    // and the persisted state records watch mode (from the clustered -w)
    const state = await readStateFile();
    ok(state, 'expected a state file to have been written');
    strictEqual(state.watch, true);
  });
});
