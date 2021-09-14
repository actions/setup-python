import CacheDistributor from './cache-distributor';

class PipCache extends CacheDistributor {
  constructor() {
    super({
      command: 'pip cache dir',
      patterns: ['**/requirements.txt'],
      toolName: 'pip'
    });
  }
}

export default PipCache;
