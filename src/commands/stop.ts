import { Command } from '@oclif/core';
import { CLIMessages } from '../constants/cli-messages.constants';
import { isBackgroundSupported, stopDaemon } from '../libs/daemon';

export default class Stop extends Command {
  public static override description =
    'Stop the background mock API started with "start --detach"';

  public static override examples = ['$ mockoon-cli stop'];

  public async run(): Promise<void> {
    // platform guard: no detached daemon to signal on Windows in v1.
    if (!isBackgroundSupported()) {
      this.log(CLIMessages.BACKGROUND_NOT_SUPPORTED_WINDOWS);

      return;
    }

    const result = await stopDaemon();

    if (result.wasRunning) {
      this.log(`Background mock API stopped (PID ${result.pid}).`);
    } else {
      this.log('No background mock API is running.');
    }
  }
}
