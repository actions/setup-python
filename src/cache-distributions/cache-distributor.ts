import * as cache from '@actions/cache';
import * as core from '@actions/core';
import {CACHE_DEPENDENCY_BACKUP_PATH} from './constants';

export enum State {
  STATE_CACHE_PRIMARY_KEY = 'cache-primary-key',
  CACHE_MATCHED_KEY = 'cache-matched-key',
  CACHE_PATHS = 'cache-paths'
}

abstract class CacheDistributor {
  protected CACHE_KEY_PREFIX = 'setup-python';
  constructor(
    protected packageManager: string,
    protected cacheDependencyPath: string
  ) {}

  protected abstract getCacheGlobalDirectories(): Promise<string[]>;
  protected abstract computeKeys(): Promise<{
    primaryKey: string;
    restoreKey: string[] | undefined;
  }>;
  protected async handleLoadedCache() {}

  public async restoreCache() {
    const {primaryKey, restoreKey} = await this.computeKeys();
    if (primaryKey.endsWith('-')) {
      const file =
        this.packageManager === 'pip'
          ? `${this.cacheDependencyPath
              .split('\n')
              .join(',')} or ${CACHE_DEPENDENCY_BACKUP_PATH}`
          : this.cacheDependencyPath.split('\n').join(',');
      throw new Error(
        `No file in ${process.cwd()} matched to [${file}], make sure you have checked out the target repository`
      );
    }

    const cachePath = await this.getCacheGlobalDirectories();

    core.saveState(State.CACHE_PATHS, cachePath);

    let matchedKey: string | undefined;
    try {
      matchedKey = await cache.restoreCache(cachePath, primaryKey, restoreKey);
    } catch (err) {
      const message = (err as Error).message;
      core.info(`[warning]${message}`);
      core.setOutput('cache-hit', false);
      return;
    }

    core.saveState(State.STATE_CACHE_PRIMARY_KEY, primaryKey);

    await this.handleLoadedCache();

    this.handleMatchResult(matchedKey, primaryKey);
  }

  public handleMatchResult(matchedKey: string | undefined, primaryKey: string) {
    if (matchedKey) {
      core.saveState(State.CACHE_MATCHED_KEY, matchedKey);
      core.info(`Cache restored from key: ${matchedKey}`);
    } else {
      core.info(`${this.packageManager} cache is not found`);
    }
    core.setOutput('cache-hit', matchedKey === primaryKey);
  }
}

export default CacheDistributor;
