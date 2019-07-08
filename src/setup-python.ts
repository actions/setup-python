import * as core from '@actions/core';
import * as finder from './find-python';
import * as path from 'path';

async function run() {
  try {
    const version: string = core.getInput('version');
    if (version) {
      const arch: string = core.getInput('architecture', {required: true});
      await finder.findPythonVersion(version, arch);
    }
    const matchersPath = path.join(__dirname, '..', '.github');
    console.log(`##[add-matcher]${path.join(matchersPath, 'python.json')}`);
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
