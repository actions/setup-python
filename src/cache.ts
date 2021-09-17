import * as core from '@actions/core';
import * as glob from '@actions/glob';
import * as cache from '@actions/cache';
import * as exec from '@actions/exec';

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {IPackageManager} from './cache-distributions/cache-distributor';

const CACHE_KEY_PREFIX = 'setup-python';
const STATE_CACHE_PRIMARY_KEY = 'cache-primary-key';
const CACHE_MATCHED_KEY = 'cache-matched-key';

type SupportedPackageManagers = {
  [prop: string]: IPackageManager;
};

const supportedPackageManagers: SupportedPackageManagers = {
  pip: {
    patterns: ['**/requirements.txt'],
    toolName: 'pip',
    command: 'pip cache dir',
    key_prefix: `${CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-`
  },
  pipenv: {
    patterns: ['pnpm-lock.yaml'],
    toolName: 'pipenv',
    cacheFolder: ['~/.local/share/virtualenvs'],
    key_prefix: `${CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-`
  }
};

export const getPackageManagerInfo = async (packageManager: string) => {
  if (packageManager === 'pip') {
    return supportedPackageManagers.pip;
  } else if (packageManager === 'pipenv') {
    return supportedPackageManagers.pipenv;
  } else {
    return null;
  }
};

async function getCacheGlobalDirectories(packageManager: IPackageManager) {
  if (!packageManager.cacheFolder || !packageManager.command) {
    throw new Error('please provide command or cachefilder path');
  }

  if (!packageManager.command) {
    return packageManager.cacheFolder!;
  }
  const {stdout, stderr, exitCode} = await exec.getExecOutput(
    packageManager.command
  );
  if (stderr) {
    throw new Error(`failed to procceed with caching with error: ${exitCode}`);
  }

  let resolvedPath = stdout.trim();

  if (resolvedPath.includes('~')) {
    resolvedPath = path.join(os.homedir(), resolvedPath.slice(1));
  }

  core.info(`global cache directory path is ${resolvedPath}`);

  return [resolvedPath];
}

async function computeKeys(
  packageManager: IPackageManager,
  pythonVersion?: string
) {
  const hash = await glob.hashFiles(packageManager.patterns.join('\n'));
  let version = '';
  if (!pythonVersion) {
    version = `${pythonVersion}-`;
  }
  const primaryKey = `${CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${version}${packageManager.toolName}-${hash}`;
  const restoreKey = `${CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${version}${packageManager.toolName}-`;
  return {
    primaryKey,
    restoreKey
  };
}

function isCacheDirectoryExists(cacheDirectory: string[]) {
  const result = cacheDirectory.reduce((previousValue, currentValue) => {
    return previousValue || fs.existsSync(currentValue);
  }, false);

  return result;
}

export async function saveCache(packageManager: IPackageManager) {
  const cachePath = await getCacheGlobalDirectories(packageManager);
  if (!isCacheDirectoryExists(cachePath)) {
    throw new Error('No one cache directory exists');
  }
  const primaryKey = core.getState(STATE_CACHE_PRIMARY_KEY);
  const matchedKey = core.getState(CACHE_MATCHED_KEY);

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

export async function restoreCache(
  packageManager: IPackageManager,
  pythonVersion?: string
) {
  const {primaryKey, restoreKey} = await computeKeys(
    packageManager,
    pythonVersion
  );
  const cachePath = await getCacheGlobalDirectories(packageManager);
  core.saveState(STATE_CACHE_PRIMARY_KEY, primaryKey);
  if (primaryKey.endsWith('-')) {
    throw new Error(
      `No file in ${process.cwd()} matched to [${
        packageManager.patterns
      }], make sure you have checked out the target repository`
    );
  }

  const matchedKey = await cache.restoreCache(cachePath, primaryKey, [
    restoreKey
  ]); // `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-${this.packageManager.toolName}`
  if (matchedKey) {
    core.saveState(CACHE_MATCHED_KEY, matchedKey);
    core.info(`Cache restored from key: ${matchedKey}`);
  } else {
    core.info(`${packageManager.toolName} cache is not found`);
  }
}
