import PipCache from './pip-cache';
import PipenvCache from './pipenv-cache';

export enum PackageManagers {
  Pip = 'pip',
  Pipenv = 'pipenv'
}

export async function getCacheDistributor(
  packageManager: string,
  pythonVersion: string,
  patterns: string | undefined
) {
  switch (packageManager) {
    case PackageManagers.Pip:
      return new PipCache(patterns);
    case PackageManagers.Pipenv:
      return new PipenvCache(pythonVersion, patterns);
    default:
      throw new Error(`Caching for '${packageManager}' is not supported`);
  }
}
