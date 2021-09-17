import * as glob from '@actions/glob';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import * as path from 'path';
import * as os from 'os';

import CacheDistributor, {IPackageManager} from './cache-distributor';

class PipCache extends CacheDistributor {
  constructor(info: IPackageManager) {
    super({
      patterns:
        info.patterns.length == 0 ? ['**/requirements.txt'] : info.patterns,
      toolName: info.toolName
    });
  }

  protected async getCacheGlobalDirectories() {
    const {stdout, stderr, exitCode} = await exec.getExecOutput(
      'pip cache dir'
    );
    if (stderr) {
      throw new Error(
        `failed to procceed with caching with error: ${exitCode}`
      );
    }

    let resolvedPath = stdout.trim();

    if (resolvedPath.includes('~')) {
      resolvedPath = path.join(os.homedir(), resolvedPath.slice(1));
    }

    core.info(`global cache directory path is ${resolvedPath}`);

    return [resolvedPath];
  }

  protected async computeKeys() {
    const hash = await glob.hashFiles(this.packageManager.patterns.join('\n'));
    const primaryKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${this.packageManager.toolName}-${hash}`;
    const restoreKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${this.packageManager.toolName}-`;
    return {
      primaryKey,
      restoreKey
    };
  }
}

export default PipCache;
