import PipCache from './pip-cache';
import PipenvCache from './pipenv-cache';
import PoetryCache from './poetry-cache';

export enum PackageManagers {
  Pip = 'pip',
  Pipenv = 'pipenv',
  Poetry = 'poetry'
}

export function getCacheDistributor(
  packageManager: string,
  pythonVersion: string,
  cacheDependencyPath: string | undefined
) {
  switch (packageManager) {
    case PackageManagers.Pip:
      return new PipCache(pythonVersion, cacheDependencyPath);
    case PackageManagers.Pipenv:
      return new PipenvCache(pythonVersion, cacheDependencyPath);
    case PackageManagers.Poetry:
      return new PoetryCache(pythonVersion, cacheDependencyPath);
    default:
      throw new Error(`Caching for '${packageManager}' is not supported`);
  }
}
