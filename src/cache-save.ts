import * as core from '@actions/core';
import * as cache from '@actions/cache';

import fs from 'fs';
import {State} from './cache-distributions/cache-distributor';

export async function run() {
  try {
    const cache = core.getInput('cache');
    if (cache) {
      await saveCache(cache);
    }
  } catch (error) {
    const err = error as Error;
    core.setFailed(err.message);
  }
}

async function saveCache(packageManager: string) {
  const cachePaths = JSON.parse(core.getState(State.CACHE_PATHS)) as string[];

  core.debug(`paths for caching are ${cachePaths.join(', ')}`);

  if (!isCacheDirectoryExists(cachePaths)) {
    throw new Error(
      `Cache folder path is retrieved for ${packageManager} but doesn't exist on disk: ${cachePaths.join(
        ', '
      )}`
    );
  }

  const primaryKey = core.getState(State.STATE_CACHE_PRIMARY_KEY);
  const matchedKey = core.getState(State.CACHE_MATCHED_KEY);

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

  const cacheId = await cache.saveCache(cachePaths, primaryKey);
  if (cacheId == -1) {
    return;
  }
  core.info(`Cache saved with the key: ${primaryKey}`);
}

function isCacheDirectoryExists(cacheDirectory: string[]) {
  const result = cacheDirectory.reduce((previousValue, currentValue) => {
    return previousValue || fs.existsSync(currentValue);
  }, false);

  return result;
}

run();
