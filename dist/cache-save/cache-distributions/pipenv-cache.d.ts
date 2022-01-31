import CacheDistributor from './cache-distributor';
declare class PipenvCache extends CacheDistributor {
  private pythonVersion;
  protected patterns: string;
  constructor(pythonVersion: string, patterns?: string);
  protected getCacheGlobalDirectories(): Promise<string[]>;
  protected computeKeys(): Promise<{
    primaryKey: string;
    restoreKey: undefined;
  }>;
}
export default PipenvCache;
//# sourceMappingURL=pipenv-cache.d.ts.map
