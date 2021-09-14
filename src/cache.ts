// import * as core from '@actions/core';
// import * as cache from '@actions/cache';
// import * as exec from '@actions/exec';
// import * as glob from '@actions/glob';

// const CACHE_KEY_PREFIX = 'setup-python';
// const STATE_CACHE_PRIMARY_KEY = 'cache-primary-key';
// const CACHE_MATCHED_KEY = 'cache-matched-key';

// interface ICacheManagers {
//   path?: string[];
//   command?: string;
//   toolName: string;
//   keyPrefix: string;
//   patterns: string[];
//   dependencyFiles: string[];
//   cacheKeyPrefix?: string;
// }

// async function getCacheGlobalDirectory(packageManager: ICacheManagers) {
//   if (!packageManager.command || !packageManager.path) {
//     throw new Error(
//       'You should specify command to get global cache or if it does not exists set path manual'
//     );
//   }
//   if (!packageManager.command) {
//     return packageManager.path;
//   }
//   const {stdout, stderr, exitCode} = await exec.getExecOutput(
//     packageManager.command ?? ''
//   );
//   if (stderr) {
//     throw new Error(`failed to procceed with caching with error: ${exitCode}`);
//   }

//   return [stdout];
// }

// export async function saveCache(packageManager: ICacheManagers) {
//   const cachePath = await getCacheGlobalDirectory(packageManager);
//   const primaryKey = core.getState(STATE_CACHE_PRIMARY_KEY);
//   const matchedKey = core.getState(CACHE_MATCHED_KEY);

//   if (!primaryKey) {
//     core.warning('Error retrieving key from state.');
//     return;
//   } else if (matchedKey === primaryKey) {
//     // no change in target directories
//     core.info(
//       `Cache hit occurred on the primary key ${primaryKey}, not saving cache.`
//     );
//     return;
//   }
//   try {
//     await cache.saveCache(cachePath, primaryKey);
//     core.info(`Cache saved with the key: ${primaryKey}`);
//   } catch (error) {
//     const err = error as Error;
//     if (err.name === cache.ReserveCacheError.name) {
//       core.info(err.message);
//     } else {
//       throw error;
//     }
//   }
// }

// export async function restoreCache(packageManager: ICacheManagers) {
//   const primaryKey = await computePrimaryKey(
//     packageManager,
//     packageManager.keyPrefix
//   );
//   const cachePath = await getCacheGlobalDirectory(packageManager);
//   core.saveState(STATE_CACHE_PRIMARY_KEY, primaryKey);
//   if (primaryKey.endsWith('-')) {
//     throw new Error(
//       `No file in ${process.cwd()} matched to [${
//         packageManager.patterns
//       }], make sure you have checked out the target repository`
//     );
//   }

//   const matchedKey = await cache.restoreCache(cachePath, primaryKey, [
//     `${CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${packageManager.toolName}`
//   ]);
//   if (matchedKey) {
//     core.saveState(CACHE_MATCHED_KEY, matchedKey);
//     core.info(`Cache restored from key: ${matchedKey}`);
//   } else {
//     core.info(`${packageManager.toolName} cache is not found`);
//   }
// }

// async function computePrimaryKey(
//   packageManager: ICacheManagers,
//   cacheKeyPrefix = `${CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}`
// ) {
//   const hash = await glob.hashFiles(packageManager.patterns.join('\n'));
//   return `${cacheKeyPrefix}-${packageManager.toolName}-${hash}`;
// }
