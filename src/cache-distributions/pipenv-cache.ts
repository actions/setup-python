import * as glob from '@actions/glob';

import CacheDistributor from './cache-distributor';

class PipenvCache extends CacheDistributor {
  constructor(private pythonVersion: string) {
    super({
      patterns: ['Pipfile.lock'],
      toolName: 'pipenv'
    });
  }

  protected async getCacheGlobalDirectory() {
    return ['~/.local/share/virtualenvs'];
  }

  protected async computePrimaryKey() {
    const hash = await glob.hashFiles('Pipfile.lock');
    return `setup-python-${process.env['RUNNER_OS']}-python-${this.pythonVersion}-pipenv-${hash}`;
  }
}

export default PipenvCache;
