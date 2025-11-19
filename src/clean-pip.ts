import * as core from '@actions/core';
import {exec} from '@actions/exec';

// Shared helper to uninstall all pip packages in the current environment.
export async function cleanPipPackages() {
  core.info('Cleaning up pip packages');
  try {
    // uninstall all currently installed packages (if any)
    // Use a shell so we can pipe the output of pip freeze into xargs
    await exec('bash', [
      '-c',
      'test $(which python) != "/usr/bin/python" -a $(python -m pip freeze | wc -l) -gt 0 && python -m pip freeze | xargs python -m pip uninstall -y || true'
    ]);
    core.info('Successfully cleaned up pip packages');
  } catch (error) {
    core.setFailed('Failed to clean up pip packages.');
  }
}
