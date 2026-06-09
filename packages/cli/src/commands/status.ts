import { Command } from '@oclif/core';
import { CLIMessages } from '../constants/cli-messages.constants';
import {
  getEnvLogFiles,
  getRunningState,
  isBackgroundSupported
} from '../libs/daemon';

export default class Status extends Command {
  public static override description =
    'Show the status of the background mock API started with "start --detach"';

  public static override examples = ['$ mockoon-cli status'];

  public async run(): Promise<void> {
    await this.parse(Status);

    // platform guard: no detached daemon to inspect on Windows in v1.
    if (!isBackgroundSupported()) {
      this.log(CLIMessages.BACKGROUND_NOT_SUPPORTED_WINDOWS);

      return;
    }

    const state = getRunningState();

    if (!state) {
      this.log('No background mock API is running.');
      this.exit(3);

      return;
    }

    this.log('Background mock API is running.');
    this.log(`  PID:         ${state.pid}`);
    this.log(`  Ports:       ${state.ports.join(', ')}`);
    this.log(`  Data files:  ${state.dataFiles.join(', ')}`);
    this.log(`  Started at:  ${state.startedAt}`);
    this.log(`  Watch:       ${state.watch ? 'on' : 'off'}`);
    this.log(`  Process log: ${state.logFile}`);

    const envLogFiles = await getEnvLogFiles(state);

    if (envLogFiles.length > 0) {
      this.log('  Env logs:');
      for (const logFile of envLogFiles) {
        this.log(`    ${logFile}`);
      }
    }
  }
}
