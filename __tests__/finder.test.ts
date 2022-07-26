import * as io from '@actions/io';
import os from 'os';
import fs from 'fs';
import path from 'path';

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
import * as core from '@actions/core';
import * as finder from '../src/find-python';
import * as installer from '../src/install-python';

const manifestData = require('./data/versions-manifest.json');

describe('Finder tests', () => {
  let writeSpy: jest.SpyInstance;
  let spyCoreAddPath: jest.SpyInstance;
  let spyCoreExportVariable: jest.SpyInstance;
  const env = process.env;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stdout, 'write');
    writeSpy.mockImplementation(() => {});
    jest.resetModules();
    process.env = {...env};
    spyCoreAddPath = jest.spyOn(core, 'addPath');
    spyCoreExportVariable = jest.spyOn(core, 'exportVariable');
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    process.env = env;
  });

  it('Finds Python if it is installed', async () => {
    const getBooleanInputSpy = jest.spyOn(core, 'getBooleanInput');
    getBooleanInputSpy.mockImplementation(input => false);

    const pythonDir: string = path.join(toolDir, 'Python', '3.0.0', 'x64');
    await io.mkdirP(pythonDir);
    fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await finder.useCpythonVersion('3.x', 'x64', true, false);
    expect(spyCoreAddPath).toHaveBeenCalled();
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'pythonLocation',
      expect.anything()
    );
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'PKG_CONFIG_PATH',
      expect.anything()
    );
  });

  it('Finds Python if it is installed without environment update', async () => {
    const pythonDir: string = path.join(toolDir, 'Python', '3.0.0', 'x64');
    await io.mkdirP(pythonDir);
    fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await finder.useCpythonVersion('3.x', 'x64', false, false);
    expect(spyCoreAddPath).not.toHaveBeenCalled();
    expect(spyCoreExportVariable).not.toHaveBeenCalled();
  });

  it('Finds stable Python version if it is not installed, but exists in the manifest', async () => {
    const findSpy: jest.SpyInstance = jest.spyOn(tc, 'getManifestFromRepo');
    findSpy.mockImplementation(() => <tc.IToolRelease[]>manifestData);

    const getBooleanInputSpy = jest.spyOn(core, 'getBooleanInput');
    getBooleanInputSpy.mockImplementation(input => false);

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
    await finder.useCpythonVersion('1.2.3', 'x64', true, false);
    expect(spyCoreAddPath).toHaveBeenCalled();
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'pythonLocation',
      expect.anything()
    );
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'PKG_CONFIG_PATH',
      expect.anything()
    );
  });

  it('Finds pre-release Python version in the manifest', async () => {
    const findSpy: jest.SpyInstance = jest.spyOn(tc, 'getManifestFromRepo');
    findSpy.mockImplementation(() => <tc.IToolRelease[]>manifestData);

    const getBooleanInputSpy = jest.spyOn(core, 'getBooleanInput');
    getBooleanInputSpy.mockImplementation(input => false);

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
    await finder.useCpythonVersion('1.2.3-beta.2', 'x64', false, false);
  });

  it('Check-latest true, finds the latest version in the manifest', async () => {
    const findSpy: jest.SpyInstance = jest.spyOn(tc, 'getManifestFromRepo');
    findSpy.mockImplementation(() => <tc.IToolRelease[]>manifestData);

    const getBooleanInputSpy = jest.spyOn(core, 'getBooleanInput');
    getBooleanInputSpy.mockImplementation(input => true);

    const cnSpy: jest.SpyInstance = jest.spyOn(process.stdout, 'write');
    cnSpy.mockImplementation(line => {
      // uncomment to debug
      // process.stderr.write('write:' + line + '\n');
    });

    const addPathSpy: jest.SpyInstance = jest.spyOn(core, 'addPath');
    addPathSpy.mockImplementation(() => null);

    const infoSpy: jest.SpyInstance = jest.spyOn(core, 'info');
    infoSpy.mockImplementation(() => {});

    const debugSpy: jest.SpyInstance = jest.spyOn(core, 'debug');
    debugSpy.mockImplementation(() => {});

    const pythonDir: string = path.join(toolDir, 'Python', '1.2.2', 'x64');
    const expPath: string = path.join(toolDir, 'Python', '1.2.3', 'x64');

    const installSpy: jest.SpyInstance = jest.spyOn(
      installer,
      'installCpythonFromRelease'
    );
    installSpy.mockImplementation(async () => {
      await io.mkdirP(expPath);
      fs.writeFileSync(`${expPath}.complete`, 'hello');
    });

    const tcFindSpy: jest.SpyInstance = jest.spyOn(tc, 'find');
    tcFindSpy
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => expPath);

    await io.mkdirP(pythonDir);
    await io.rmRF(path.join(toolDir, 'Python', '1.2.3'));

    fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await finder.useCpythonVersion('1.2', 'x64', true, true);

    expect(infoSpy).toHaveBeenCalledWith("Resolved as '1.2.3'");
    expect(infoSpy).toHaveBeenCalledWith(
      'Version 1.2.3 was not found in the local cache'
    );
    expect(infoSpy).toBeCalledWith(
      'Version 1.2.3 is available for downloading'
    );
    expect(installSpy).toHaveBeenCalled();
    expect(addPathSpy).toHaveBeenCalledWith(expPath);
    await finder.useCpythonVersion('1.2.3-beta.2', 'x64', false, true);
    expect(spyCoreAddPath).toHaveBeenCalled();
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'pythonLocation',
      expect.anything()
    );
    expect(spyCoreExportVariable).toHaveBeenCalledWith(
      'PKG_CONFIG_PATH',
      expect.anything()
    );
  });

  it('Errors if Python is not installed', async () => {
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    let thrown = false;
    try {
      await finder.useCpythonVersion('3.300000', 'x64', true, false);
    } catch {
      thrown = true;
    }
    expect(thrown).toBeTruthy();
    expect(spyCoreAddPath).not.toHaveBeenCalled();
    expect(spyCoreExportVariable).not.toHaveBeenCalled();
  });
});
