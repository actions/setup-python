import * as glob from '@actions/glob';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import * as path from 'path';
import os from 'os';

import CacheDistributor from './cache-distributor';

class PipCache extends CacheDistributor {
  constructor(
    private pythonVersion: string,
    cacheDependencyPath: string = '**/requirements.txt'
  ) {
    super('pip', cacheDependencyPath);
  }

  protected async getCacheGlobalDirectories() {
    const {stdout, stderr, exitCode} = await exec.getExecOutput(
      'pip cache dir'
    );

    if (exitCode && stderr) {
      throw new Error(
        `Could not get cache folder path for pip package manager`
      );
    }

    let resolvedPath = stdout.trim();

    if (resolvedPath.includes('~')) {
      resolvedPath = path.join(os.homedir(), resolvedPath.slice(1));
    }

    core.debug(`global cache directory path is ${resolvedPath}`);

    return [resolvedPath];
  }

  protected async computeKeys() {
    const hash = await glob.hashFiles(this.cacheDependencyPath);
    const primaryKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-python-${this.pythonVersion}-${this.packageManager}-${hash}`;
    const restoreKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-python-${this.pythonVersion}-${this.packageManager}`;

    return {
      primaryKey,
      restoreKey: [restoreKey]
    };
  }
}

export default PipCache;
