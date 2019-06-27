import io = require('@actions/io');
import fs = require('fs');
import os = require('os');
import path = require('path');

const toolDir = path.join(
  process.cwd(),
  'runner',
  path.join(
    Math.random()
      .toString(36)
      .substring(7)
  ),
  'tools'
);
const tempDir = path.join(
  process.cwd(),
  'runner',
  path.join(
    Math.random()
      .toString(36)
      .substring(7)
  ),
  'temp'
);

process.env['RUNNER_TOOLSDIRECTORY'] = toolDir;
process.env['RUNNER_TEMPDIRECTORY'] = tempDir;

import * as finder from '../src/find-python';

describe('Finder tests', () => {
  it('Finds Python if it is installed', async () => {
    const pythonDir: string = path.join(toolDir, 'python', '2.0.0', 'x64');
    await io.mkdirP(pythonDir);
    fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    // This will throw if it doesn't find it in the cache (because no such version exists)
    await finder.findPythonVersion('2.x', 'x64');
  });

  it('Errors if Python is not installed', async () => {
    // This will throw if it doesn't find it in the cache (because no such version exists)
    let thrown = false;
    try {
      await finder.findPythonVersion('3.x', 'x64');
    } catch {
      thrown = true;
    }
    expect(thrown).toBeTruthy();
  });

  it('Finds PyPy if it is installed', async () => {
    const pythonDir: string = path.join(toolDir, 'PyPy', '2.0.0', 'x64');
    await io.mkdirP(pythonDir);
    fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    // This will throw if it doesn't find it in the cache (because no such version exists)
    await finder.findPythonVersion('pypy2', 'x64');
  });

  it('Errors if PyPy is not installed', async () => {
    // This will throw if it doesn't find it in the cache (because no such version exists)
    let thrown = false;
    try {
      await finder.findPythonVersion('pypy3', 'x64');
    } catch {
      thrown = true;
    }
    expect(thrown).toBeTruthy();
  });
});
