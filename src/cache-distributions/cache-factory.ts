import {IPackageManager} from './cache-distributor';
import PipCache from './pip-cache';
import PipenvCache from './pipenv-cache';

export enum Caches {
  Pip = 'pip',
  Pipenv = 'pipenv'
}

type SupportedPackageManagers = {
  [prop: string]: IPackageManager;
};

export const supportedPackageManagers: SupportedPackageManagers = {
  pip: {
    patterns: ['**/requirements.txt'],
    toolName: 'pip'
  },
  pipenv: {
    patterns: ['pnpm-lock.yaml'],
    toolName: 'pipenv'
  }
};

export const getPackageManagerInfo = async (packageManager: string) => {
  if (packageManager === 'pip') {
    return supportedPackageManagers.pip;
  } else if (packageManager === 'pipenv') {
    return supportedPackageManagers.pipenv;
  } else {
    throw new Error('package manager is not supported');
  }
};

export async function getCache(cacheManager: IPackageManager) {
  const info = await getPackageManagerInfo(cacheManager.toolName);
  if (!info) {
    throw new Error('No cache distributor');
  }
  info.pythonVersion = cacheManager.pythonVersion;
  if (cacheManager.patterns.length) {
    info.patterns = cacheManager.patterns;
  }
  switch (cacheManager.toolName) {
    case Caches.Pip:
      return new PipCache(info);
    case Caches.Pipenv:
      return new PipenvCache(info);
    default:
      throw new Error('No cache distributor');
  }
}
