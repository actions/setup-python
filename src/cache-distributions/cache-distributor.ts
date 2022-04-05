import * as cache from '@actions/cache';
import * as core from '@actions/core';

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

  public async restoreCache() {
    const {primaryKey, restoreKey} = await this.computeKeys();
    if (primaryKey.endsWith('-')) {
      throw new Error(
        `No file in ${process.cwd()} matched to [${this.cacheDependencyPath
          .split('\n')
          .join(',')}], make sure you have checked out the target repository`
      );
    }

    const cachePath = await this.getCacheGlobalDirectories();

    core.saveState(State.CACHE_PATHS, cachePath);
    core.saveState(State.STATE_CACHE_PRIMARY_KEY, primaryKey);

    const matchedKey = await cache.restoreCache(
      cachePath,
      primaryKey,
      restoreKey
    );

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
