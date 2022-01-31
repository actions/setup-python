import CacheDistributor from './cache-distributor';
declare class PipCache extends CacheDistributor {
  private pythonVersion;
  constructor(pythonVersion: string, cacheDependencyPath?: string);
  protected getCacheGlobalDirectories(): Promise<string[]>;
  protected computeKeys(): Promise<{
    primaryKey: string;
    restoreKey: string[];
  }>;
}
export default PipCache;
//# sourceMappingURL=pip-cache.d.ts.map
