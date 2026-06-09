import { Command } from '@oclif/core';
import { stopDaemon } from '../libs/daemon';

export default class Stop extends Command {
  public static override description =
    'Stop the background mock API started with "start --detach"';

  public static override examples = ['$ mockoon-cli stop'];

  public async run(): Promise<void> {
    const result = await stopDaemon();

    if (result.wasRunning) {
      this.log(`Background mock API stopped (PID ${result.pid}).`);
    } else {
      this.log('No background mock API is running.');
    }
  }
}
