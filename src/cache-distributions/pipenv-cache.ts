import * as glob from '@actions/glob';
import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';

import CacheDistributor from './cache-distributor';

class PipenvCache extends CacheDistributor {
  constructor(
    private pythonVersion: string,
    protected patterns: string = '**/Pipfile.lock'
  ) {
    super('pipenv', patterns);
  }

  protected async getCacheGlobalDirectories() {
    let virtualEnvRelativePath;
    if (process.platform === 'win32') {
      virtualEnvRelativePath = '.virtualenvs';
    } else {
      virtualEnvRelativePath = '.local/share/virtualenvs';
    }
    const resolvedPath = path.join(os.homedir(), virtualEnvRelativePath);
    core.debug(`global cache directory path is ${resolvedPath}`);

    return [resolvedPath];
  }

  protected async computeKeys() {
    const hash = await glob.hashFiles(this.patterns);
    const primaryKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-python-${this.pythonVersion}-${this.packageManager}-${hash}`;
    const restoreKey = undefined;
    return {
      primaryKey,
      restoreKey
    };
  }
}

export default PipenvCache;
