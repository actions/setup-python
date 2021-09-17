import * as glob from '@actions/glob';

import CacheDistributor, {IPackageManager} from './cache-distributor';

class PipenvCache extends CacheDistributor {
  constructor(private cacheManager: IPackageManager) {
    super({
      patterns: ['Pipfile.lock'],
      toolName: 'pipenv'
    });
  }

  protected async getCacheGlobalDirectories() {
    return ['~/.local/share/virtualenvs'];
  }

  protected async computeKeys() {
    const hash = await glob.hashFiles('Pipfile.lock');
    const primaryKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-python-${this.cacheManager.pythonVersion}-${this.packageManager.toolName}-${hash}`;
    const restoreKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-python-${this.cacheManager.pythonVersion}-${this.packageManager.toolName}`;
    return {
      primaryKey,
      restoreKey
    };
  }
}

export default PipenvCache;
