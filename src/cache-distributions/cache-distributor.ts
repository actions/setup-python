import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as fs from 'fs';

export interface IPackageManager {
  patterns: string[];
  toolName: string;
  pythonVersion?: string;
  key_prefix?: string;
  cacheFolder?: string[];
  command?: string;
  isPythonVersionAdded?: boolean;
}

abstract class CacheDistributor {
  protected CACHE_KEY_PREFIX = 'setup-python';
  private STATE_CACHE_PRIMARY_KEY = 'cache-primary-key';
  private CACHE_MATCHED_KEY = 'cache-matched-key';

  constructor(protected packageManager: IPackageManager) {}

  protected abstract getCacheGlobalDirectories(): Promise<string[]>;
  protected abstract computeKeys(): Promise<{
    primaryKey: string;
    restoreKey: string;
  }>;

  protected isCacheDirectoryExists(cacheDirectory: string[]) {
    const result = cacheDirectory.reduce((previousValue, currentValue) => {
      return previousValue || fs.existsSync(currentValue);
    }, false);

    return result;
  }

  public async saveCache() {
    const cachePath = await this.getCacheGlobalDirectories();
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
    const {primaryKey, restoreKey} = await this.computeKeys();
    const cachePath = await this.getCacheGlobalDirectories();
    core.saveState(this.STATE_CACHE_PRIMARY_KEY, primaryKey);
    if (primaryKey.endsWith('-')) {
      throw new Error(
        `No file in ${process.cwd()} matched to [${
          this.packageManager.patterns
        }], make sure you have checked out the target repository`
      );
    }

    const matchedKey = await cache.restoreCache(cachePath, primaryKey, [
      restoreKey
    ]); // `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${this.packageManager.toolName}`
    if (matchedKey) {
      core.saveState(this.CACHE_MATCHED_KEY, matchedKey);
      core.info(`Cache restored from key: ${matchedKey}`);
    } else {
      core.info(`${this.packageManager.toolName} cache is not found`);
    }
  }
}

export default CacheDistributor;
