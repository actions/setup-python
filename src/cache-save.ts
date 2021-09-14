import * as core from '@actions/core';
import {getCache} from './cache-distributions/cache-factory';

export async function cacheSave() {
  const cache = core.getInput('cache');
  if (cache) {
    const cacheManager = getCache(cache, '');
    cacheManager.saveCache();
  }
}
