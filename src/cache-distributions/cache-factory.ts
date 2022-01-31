import PipCache from './pip-cache';
import PipenvCache from './pipenv-cache';

export enum PackageManagers {
  Pip = 'pip',
  Pipenv = 'pipenv'
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
    default:
      throw new Error(`Caching for '${packageManager}' is not supported`);
  }
}
