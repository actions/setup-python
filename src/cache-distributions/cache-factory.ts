import PipCache from './pip-cache';
import PipenvCache from './pipenv-cache';

export enum Caches {
  Pip = 'pip',
  Pipenv = 'pipenv'
}

export function getCache(cacheType: string, pythonVersion: string) {
  switch (cacheType) {
    case Caches.Pip:
      return new PipCache();
    case Caches.Pipenv:
      return new PipenvCache(pythonVersion);
    default:
      throw new Error('No cache distributor');
  }
}
