export declare enum State {
  STATE_CACHE_PRIMARY_KEY = 'cache-primary-key',
  CACHE_MATCHED_KEY = 'cache-matched-key',
  CACHE_PATHS = 'cache-paths'
}
declare abstract class CacheDistributor {
  protected packageManager: string;
  protected cacheDependencyPath: string;
  protected CACHE_KEY_PREFIX: string;
  constructor(packageManager: string, cacheDependencyPath: string);
  protected abstract getCacheGlobalDirectories(): Promise<string[]>;
  protected abstract computeKeys(): Promise<{
    primaryKey: string;
    restoreKey: string[] | undefined;
  }>;
  restoreCache(): Promise<void>;
}
export default CacheDistributor;
//# sourceMappingURL=cache-distributor.d.ts.map
