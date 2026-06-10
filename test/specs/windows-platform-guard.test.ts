import { ok, strictEqual } from 'node:assert';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { Config } from '../../src/config';
import { isBackgroundSupported } from '../../src/libs/daemon';
import { spawnCli } from '../libs/helpers';

// The detach/stop/status commands rely on POSIX detach + signals, which do not
// apply on Windows in v1. The command-level guard is therefore only meaningful
// on Windows and the e2e checks below are skipped on other platforms.
const notWindows = process.platform !== 'win32';

/**
 * Run a CLI command to completion and return its combined output and exit code.
 */
const runToCompletion = async (
  args: string[]
): Promise<{ output: string; exitCode: number }> => {
  const { instance, output } = await spawnCli(args);
  const { stdout, stderr } = await output;
  const exitCode: number = await new Promise((resolve) => {
    if (instance.exitCode !== null) {
      resolve(instance.exitCode);
    } else {
      instance.on('exit', (code) => resolve(code ?? 0));
    }
  });

  return { output: stdout + stderr, exitCode };
};

describe('Background platform guard', () => {
  it('should report background mode as unsupported on Windows', () => {
    strictEqual(isBackgroundSupported('win32'), false);
  });

  it('should report background mode as supported on Linux and macOS', () => {
    strictEqual(isBackgroundSupported('linux'), true);
    strictEqual(isBackgroundSupported('darwin'), true);
  });

  it(
    'should refuse start --detach on Windows with a clear message and spawn no process',
    { skip: notWindows },
    async () => {
      await rm(Config.stateFile, { force: true });

      const { output } = await runToCompletion([
        'start',
        '--data',
        './test/data/envs/mock1.json',
        '--port',
        '3095',
        '--detach'
      ]);

      ok(
        /not supported on windows/i.test(output),
        `expected a "not supported on Windows" message, got: ${output}`
      );

      // no daemon must have been forked and no state file written
      strictEqual(existsSync(Config.stateFile), false);

      let serverDown = false;
      try {
        await fetch('http://localhost:3095/api/test');
      } catch {
        serverDown = true;
      }
      ok(serverDown, 'expected no daemon to have come up');
    }
  );

  it(
    'should report stop as unsupported on Windows',
    { skip: notWindows },
    async () => {
      const { output } = await runToCompletion(['stop']);

      ok(
        /not supported on windows/i.test(output),
        `expected a "not supported on Windows" message, got: ${output}`
      );
    }
  );

  it(
    'should report status as unsupported on Windows',
    { skip: notWindows },
    async () => {
      const { output } = await runToCompletion(['status']);

      ok(
        /not supported on windows/i.test(output),
        `expected a "not supported on Windows" message, got: ${output}`
      );
    }
  );
});
