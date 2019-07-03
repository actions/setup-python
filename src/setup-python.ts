import * as core from '@actions/core';
import * as finder from './find-python';

async function run() {
  try {
    const version: string = core.getInput('version');
    if (version) {
      const arch: string = core.getInput('architecture', {required: true});
      await finder.findPythonVersion(version, arch);
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
