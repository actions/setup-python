import PipCache from './pip-cache';
import PipenvCache from './pipenv-cache';
export declare enum PackageManagers {
  Pip = 'pip',
  Pipenv = 'pipenv'
}
export declare function getCacheDistributor(
  packageManager: string,
  pythonVersion: string,
  cacheDependencyPath: string | undefined
): PipCache | PipenvCache;
//# sourceMappingURL=cache-factory.d.ts.map
