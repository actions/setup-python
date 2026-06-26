import * as glob from '@actions/glob';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as child_process from 'child_process';
import utils from 'util';
import * as path from 'path';
import os from 'os';

import CacheDistributor from './cache-distributor.js';
import {IS_WINDOWS} from '../utils.js';
import {CACHE_DEPENDENCY_BACKUP_PATH} from './constants.js';

class PipCache extends CacheDistributor {
  private cacheDependencyBackupPath: string = CACHE_DEPENDENCY_BACKUP_PATH;

  constructor(
    private pythonVersion: string,
    cacheDependencyPath = '**/requirements.txt'
  ) {
    super('pip', cacheDependencyPath);
  }

  protected async getCacheGlobalDirectories() {
    let exitCode = 0;
    let stdout = '';
    let stderr = '';

    // Add temporary fix for Windows
    // On Windows, it is necessary to execute through an exec
    // because the getExecOutput gives a non-zero code or writes to stderr for pip 22.0.2,
    // or spawn must be started with the shell option enabled for getExecOutput
    // Related issue: https://github.com/actions/setup-python/issues/328
    if (IS_WINDOWS) {
      const execPromisify = utils.promisify(child_process.exec);
      try {
        ({stdout, stderr} = await execPromisify('pip cache dir'));
      } catch (err) {
        // Pip outputs warnings to stderr (e.g., --no-python-version-warning flag deprecation warning), causing false failure detection
        // Related issue: https://github.com/actions/setup-python/issues/1034
        // If an error occurs, capture stderr and set exitCode to 1 to indicate failure
        stderr = (err as any).stderr ?? (err as Error).message;
        exitCode = 1;
      }
    } else {
      ({stdout, stderr, exitCode} = await exec.getExecOutput('pip cache dir'));
    }

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
    const hash =
      (await glob.hashFiles(this.cacheDependencyPath)) ||
      (await glob.hashFiles(this.cacheDependencyBackupPath));
    const osSegment = await this.getLinuxInfoKeySegment();
    const primaryKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${process.arch}${osSegment}-python-${this.pythonVersion}-${this.packageManager}-${hash}`;
    const restoreKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${process.arch}${osSegment}-python-${this.pythonVersion}-${this.packageManager}`;

    return {
      primaryKey,
      restoreKey: [restoreKey]
    };
  }
}

export default PipCache;
