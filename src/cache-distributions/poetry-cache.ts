import * as glob from '@actions/glob';
import * as io from '@actions/io';
import * as path from 'path';
import * as exec from '@actions/exec';
import * as core from '@actions/core';

import CacheDistributor from './cache-distributor';
import {logWarning} from '../utils';

class PoetryCache extends CacheDistributor {
  constructor(
    private pythonVersion: string,
    protected patterns: string = '**/poetry.lock',
    protected poetryProjects: Set<string> = new Set<string>()
  ) {
    super('poetry', patterns);
  }

  protected async getCacheGlobalDirectories() {
    // Same virtualenvs path may appear for different projects, hence we use a Set
    const paths = new Set<string>();
    const globber = await glob.create(this.patterns);

    for await (const file of globber.globGenerator()) {
      const basedir = path.dirname(file);
      core.debug(`Processing Poetry project at ${basedir}`);
      this.poetryProjects.add(basedir);

      const poetryConfig = await this.getPoetryConfiguration(basedir);

      const cacheDir = poetryConfig['cache-dir'];
      const virtualenvsPath = poetryConfig['virtualenvs.path'].replace(
        '{cache-dir}',
        cacheDir
      );

      paths.add(virtualenvsPath);

      if (poetryConfig['virtualenvs.in-project']) {
        paths.add(path.join(basedir, '.venv'));
      }
    }

    return [...paths];
  }

  protected async computeKeys() {
    const hash = await glob.hashFiles(this.patterns);
    // "v2" is here to invalidate old caches of this cache distributor, which were created broken:
    const primaryKey = `${this.CACHE_KEY_PREFIX}-${process.env['RUNNER_OS']}-python-${this.pythonVersion}-${this.packageManager}-v2-${hash}`;
    const restoreKey = undefined;
    return {
      primaryKey,
      restoreKey
    };
  }

  protected async handleLoadedCache() {
    await super.handleLoadedCache();

    // After the cache is loaded -- make sure virtualenvs use the correct Python version (the one that we have just installed).
    // This will handle invalid caches, recreating virtualenvs if necessary.

    const pythonLocation = await io.which('python');
    if (pythonLocation) {
      core.debug(`pythonLocation is ${pythonLocation}`);
    } else {
      logWarning('python binaries were not found in PATH');
      return;
    }

    for (const poetryProject of this.poetryProjects) {
      const {exitCode, stderr} = await exec.getExecOutput(
        'poetry',
        ['env', 'use', pythonLocation],
        {ignoreReturnCode: true, cwd: poetryProject}
      );

      if (exitCode) {
        logWarning(stderr);
      }
    }
  }

  private async getPoetryConfiguration(basedir: string) {
    const {stdout, stderr, exitCode} = await exec.getExecOutput(
      'poetry',
      ['config', '--list'],
      {cwd: basedir}
    );

    if (exitCode && stderr) {
      throw new Error(
        'Could not get cache folder path for poetry package manager'
      );
    }

    const lines = stdout.trim().split('\n');

    const config: any = {};

    for (let line of lines) {
      line = line.replace(/#.*$/gm, '');

      const [key, value] = line.split('=').map(part => part.trim());

      config[key] = JSON.parse(value);
    }

    return config as {
      'cache-dir': string;
      'virtualenvs.in-project': boolean;
      'virtualenvs.path': string;
    };
  }
}

export default PoetryCache;
