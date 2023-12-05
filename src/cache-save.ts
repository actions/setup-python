import * as core from '@actions/core';
import * as cache from '@actions/cache';

import fs from 'fs';
import {State} from './cache-distributions/cache-distributor';

// Added early exit to resolve issue with slow post action step:
// - https://github.com/actions/setup-node/issues/878
// https://github.com/actions/cache/pull/1217
export async function run(earlyExit?: boolean) {
  try {
    const cache = core.getInput('cache');
    if (cache) {
      await saveCache(cache);

      if (earlyExit) {
        process.exit(0);
      }
    }
  } catch (error) {
    const err = error as Error;
    core.setFailed(err.message);
  }
}

async function saveCache(packageManager: string) {
  const cachePathState = core.getState(State.CACHE_PATHS);

  if (!cachePathState) {
    core.warning(
      'Cache paths are empty. Please check the previous logs and make sure that the python version is specified'
    );
    return;
  }

  const cachePaths = JSON.parse(cachePathState) as string[];

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

  let cacheId = 0;

  try {
    cacheId = await cache.saveCache(cachePaths, primaryKey);
  } catch (err) {
    const message = (err as Error).message;
    core.info(`[warning]${message}`);
    return;
  }

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

run(true);
