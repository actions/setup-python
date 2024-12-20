import * as glob from '@actions/glob';
import * as os from 'os';
import * as path from 'path';

import CacheDistributor from './cache-distributor';

export default class UvCache extends CacheDistributor {
  constructor(
    private pythonVersion: string,
    protected patterns: string = '**/requirements.txt'
  ) {
    super('uv', patterns);
  }

  protected async getCacheGlobalDirectories() {
    if (process.platform === 'win32') {
      // `LOCALAPPDATA` should always be defined,
      // but we can't just join `undefined`
      // into the path in case it's not.
      return [
        path.join(process.env['LOCALAPPDATA'] ?? os.homedir(), 'uv', 'cache')
      ];
    }
    return [path.join(os.homedir(), '.cache/uv')];
  }

  protected async computeKeys() {
    const hash = await glob.hashFiles(this.patterns);
    const primaryKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${process.arch}-python-${this.pythonVersion}-${this.packageManager}-${hash}`;
    const restoreKey = undefined;
    return {
      primaryKey,
      restoreKey
    };
  }
}
