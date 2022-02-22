import io = require('@actions/io');
import fs = require('fs');
import path = require('path');

const toolDir = path.join(
  __dirname,
  'runner',
  path.join(Math.random().toString(36).substring(7)),
  'tools'
);
const tempDir = path.join(
  __dirname,
  'runner',
  path.join(Math.random().toString(36).substring(7)),
  'temp'
);

process.env['RUNNER_TOOL_CACHE'] = toolDir;
process.env['RUNNER_TEMP'] = tempDir;

import * as tc from '@actions/tool-cache';
import * as finder from '../src/find-python';
import * as installer from '../src/install-python';

const manifestData = require('./data/versions-manifest.json');

describe('Finder tests', () => {
  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it('Finds Python if it is installed', async () => {
    const pythonDir: string = path.join(toolDir, 'Python', '3.0.0', 'x64');
    await io.mkdirP(pythonDir);
    fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await finder.useCpythonVersion('3.x', 'x64');
  });

  it('Finds stable Python version if it is not installed, but exists in the manifest', async () => {
    const findSpy: jest.SpyInstance = jest.spyOn(tc, 'getManifestFromRepo');
    findSpy.mockImplementation(() => <tc.IToolRelease[]>manifestData);

    const installSpy: jest.SpyInstance = jest.spyOn(
      installer,
      'installCpythonFromRelease'
    );
    installSpy.mockImplementation(async () => {
      const pythonDir: string = path.join(toolDir, 'Python', '1.2.3', 'x64');
      await io.mkdirP(pythonDir);
      fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    });
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await finder.useCpythonVersion('1.2.3', 'x64');
  });

  it('Finds pre-release Python version in the manifest', async () => {
    const findSpy: jest.SpyInstance = jest.spyOn(tc, 'getManifestFromRepo');
    findSpy.mockImplementation(() => <tc.IToolRelease[]>manifestData);

    const installSpy: jest.SpyInstance = jest.spyOn(
      installer,
      'installCpythonFromRelease'
    );
    installSpy.mockImplementation(async () => {
      const pythonDir: string = path.join(
        toolDir,
        'Python',
        '1.2.3-beta.2',
        'x64'
      );
      await io.mkdirP(pythonDir);
      fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    });
    // This will throw if it doesn't find it in the manifest (because no such version exists)
    await finder.useCpythonVersion('1.2.3-beta.2', 'x64');
  });

  it('Errors if Python is not installed', async () => {
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    let thrown = false;
    try {
      await finder.useCpythonVersion('3.300000', 'x64');
    } catch {
      thrown = true;
    }
    expect(thrown).toBeTruthy();
  });
});
