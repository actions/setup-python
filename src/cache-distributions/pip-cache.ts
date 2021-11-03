import * as glob from '@actions/glob';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import * as path from 'path';
import os from 'os';

import CacheDistributor from './cache-distributor';

class PipCache extends CacheDistributor {
  constructor(cacheDependencyPath: string = '**/requirements.txt') {
    super('pip', cacheDependencyPath);
  }

  protected async getCacheGlobalDirectories() {
    const {stdout, stderr, exitCode} = await exec.getExecOutput(
      'pip cache dir'
    );

    if (stderr) {
      throw new Error(
        `Could not get cache folder path for pip package manager`
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
    const hash = await glob.hashFiles(this.cacheDependencyPath);
    const primaryKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${this.toolName}-${hash}`;
    const restoreKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${this.toolName}`;

    return {
      primaryKey,
      restoreKey: [restoreKey]
    };
  }
}

export default PipCache;
