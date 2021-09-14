import * as exec from '@actions/exec';
import * as cache from '@actions/cache';
import * as glob from '@actions/glob';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface PackageManager {
  command?: string;
  patterns: string[];
  toolName: string;
}

abstract class CacheDistributor {
  private CACHE_KEY_PREFIX = 'setup-python';
  private STATE_CACHE_PRIMARY_KEY = 'cache-primary-key';
  private CACHE_MATCHED_KEY = 'cache-matched-key';

  constructor(private packageManager: PackageManager) {}

  protected async getCacheGlobalDirectory() {
    const {stdout, stderr, exitCode} = await exec.getExecOutput(
      this.packageManager.command ?? ''
    );
    if (stderr) {
      throw new Error(
        `failed to procceed with caching with error: ${exitCode}`
      );
    }

    return [stdout];
  }

  protected async computePrimaryKey() {
    const hash = await glob.hashFiles(this.packageManager.patterns.join('\n'));
    return `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${this.packageManager.toolName}-${hash}`;
  }

  protected isCacheDirectoryExists(cacheDirectory: string[]) {
    const result = cacheDirectory.reduce((previousValue, currentValue) => {
      const resolvePath = currentValue.includes('~')
        ? path.join(currentValue.slice(1), os.homedir())
        : currentValue;
      return previousValue || fs.existsSync(resolvePath);
    }, false);

    return result;
  }

  public async saveCache() {
    const cachePath = await this.getCacheGlobalDirectory();
    if (!this.isCacheDirectoryExists(cachePath)) {
      throw new Error('No one cache directory exists');
    }
    const primaryKey = core.getState(this.STATE_CACHE_PRIMARY_KEY);
    const matchedKey = core.getState(this.CACHE_MATCHED_KEY);

    if (!primaryKey) {
      core.warning('Error retrieving key from state.');
      return;
    } else if (matchedKey === primaryKey) {
      // no change in target directories
      core.info(
        `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
      );
      return;
    }
    try {
      await cache.saveCache(cachePath, primaryKey);
      core.info(`Cache saved with the key: ${primaryKey}`);
    } catch (error) {
      const err = error as Error;
      if (err.name === cache.ReserveCacheError.name) {
        core.info(err.message);
      } else {
        throw error;
      }
    }
  }

  public async restoreCache() {
    const primaryKey = await this.computePrimaryKey();
    const cachePath = await this.getCacheGlobalDirectory();
    core.saveState(this.STATE_CACHE_PRIMARY_KEY, primaryKey);
    if (primaryKey.endsWith('-')) {
      throw new Error(
        `No file in ${process.cwd()} matched to [${
          this.packageManager.patterns
        }], make sure you have checked out the target repository`
      );
    }

    const matchedKey = await cache.restoreCache(cachePath, primaryKey, [
      `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${this.packageManager.toolName}`
    ]);
    if (matchedKey) {
      core.saveState(this.CACHE_MATCHED_KEY, matchedKey);
      core.info(`Cache restored from key: ${matchedKey}`);
    } else {
      core.info(`${this.packageManager.toolName} cache is not found`);
    }
  }
}

export default CacheDistributor;
