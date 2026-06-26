import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {fileURLToPath} from 'url';
import * as io from '@actions/io';
import os from 'os';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Mock @actions modules
jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  notice: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  getMultilineInput: jest.fn(),
  addPath: jest.fn(),
  exportVariable: jest.fn(),
  saveState: jest.fn(),
  getState: jest.fn(),
  setSecret: jest.fn(),
  isDebug: jest.fn(() => false),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  group: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
  toPlatformPath: jest.fn((p: string) => p),
  toWin32Path: jest.fn((p: string) => p),
  toPosixPath: jest.fn((p: string) => p)
}));

// Pre-import real @actions/tool-cache before any mocks
const realTc = await import('@actions/tool-cache');

jest.unstable_mockModule('@actions/tool-cache', () => ({
  ...realTc,
  find: jest.fn(realTc.find),
  getManifestFromRepo: jest.fn()
}));

jest.unstable_mockModule('@actions/exec', () => ({
  exec: jest.fn(),
  getExecOutput: jest.fn()
}));

// Pre-import real install-python AFTER all its dependency mocks are registered
// so it captures the mocked @actions/tool-cache, @actions/core, @actions/exec
const realInstaller = await import('../src/install-python.js');

// Mock local install-python module - keep real getManifest/findReleaseFromManifest
jest.unstable_mockModule('../src/install-python.js', () => ({
  ...realInstaller,
  installCpythonFromRelease: jest.fn()
}));

// Dynamic imports after mocking
const core = await import('@actions/core');
const tc = await import('@actions/tool-cache');
const finder = await import('../src/find-python.js');
const installer = await import('../src/install-python.js');

import manifestData from './data/versions-manifest.json' with {type: 'json'};

describe('Finder tests', () => {
  let writeSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let spyCoreAddPath: jest.Mock;
  let spyCoreExportVariable: jest.Mock;
  const env = process.env;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stdout, 'write');
    writeSpy.mockImplementation(() => true);
    process.env = {...env};
    spyCoreAddPath = core.addPath as jest.Mock;
    spyCoreExportVariable = core.exportVariable as jest.Mock;
    // Restore real tc.find default (cleared by jest.resetAllMocks)
    (tc.find as jest.Mock).mockImplementation(realTc.find as any);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    process.env = env;
  });

  it('Finds Python if it is installed', async () => {
    const getBooleanInputSpy = core.getBooleanInput as jest.Mock;
    getBooleanInputSpy.mockImplementation(() => false);

    const pythonDir: string = path.join(toolDir, 'Python', '3.0.0', 'x64');
    await io.mkdirP(pythonDir);
    fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await finder.useCpythonVersion('3.x', 'x64', true, false, false, false);
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
    await finder.useCpythonVersion('3.x', 'x64', false, false, false, false);
    expect(spyCoreAddPath).not.toHaveBeenCalled();
    expect(spyCoreExportVariable).not.toHaveBeenCalled();
  });

  it('Finds stable Python version if it is not installed, but exists in the manifest', async () => {
    const findSpy = tc.getManifestFromRepo as jest.Mock;
    findSpy.mockImplementation(() => manifestData);

    const getBooleanInputSpy = core.getBooleanInput as jest.Mock;
    getBooleanInputSpy.mockImplementation(() => false);

    const installSpy = installer.installCpythonFromRelease as jest.Mock;
    installSpy.mockImplementation(async () => {
      const pythonDir: string = path.join(toolDir, 'Python', '1.2.3', 'x64');
      await io.mkdirP(pythonDir);
      fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    });
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await expect(
      finder.useCpythonVersion('1.2.3', 'x64', true, false, false, false)
    ).resolves.toEqual({
      impl: 'CPython',
      version: '1.2.3'
    });
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
    const findSpy = tc.getManifestFromRepo as jest.Mock;
    findSpy.mockImplementation(() => manifestData);

    const getBooleanInputSpy = core.getBooleanInput as jest.Mock;
    getBooleanInputSpy.mockImplementation(() => false);

    const installSpy = installer.installCpythonFromRelease as jest.Mock;
    installSpy.mockImplementation(async () => {
      const pythonDir: string = path.join(
        toolDir,
        'Python',
        '1.2.4-beta.2',
        'x64'
      );
      await io.mkdirP(pythonDir);
      fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    });
    // This will throw if it doesn't find it in the manifest (because no such version exists)
    await expect(
      finder.useCpythonVersion(
        '1.2.4-beta.2',
        'x64',
        false,
        false,
        false,
        false
      )
    ).resolves.toEqual({
      impl: 'CPython',
      version: '1.2.4-beta.2'
    });
  });

  it('Check-latest true, finds the latest version in the manifest', async () => {
    const findSpy = tc.getManifestFromRepo as jest.Mock;
    findSpy.mockImplementation(() => manifestData);

    const getBooleanInputSpy = core.getBooleanInput as jest.Mock;
    getBooleanInputSpy.mockImplementation(() => true);

    const cnSpy = jest.spyOn(process.stdout, 'write');
    cnSpy.mockImplementation(() => true);

    const addPathSpy = core.addPath as jest.Mock;
    addPathSpy.mockImplementation(() => null);

    const infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => {});

    const debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => {});

    const pythonDir: string = path.join(toolDir, 'Python', '1.2.2', 'x64');
    const expPath: string = path.join(toolDir, 'Python', '1.2.3', 'x64');

    const installSpy = installer.installCpythonFromRelease as jest.Mock;
    installSpy.mockImplementation(async () => {
      await io.mkdirP(expPath);
      fs.writeFileSync(`${expPath}.complete`, 'hello');
    });

    const tcFindSpy = tc.find as jest.Mock;
    tcFindSpy
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => expPath);

    await io.mkdirP(pythonDir);
    await io.rmRF(path.join(toolDir, 'Python', '1.2.3'));

    fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await finder.useCpythonVersion('1.2', 'x64', true, true, false, false);

    expect(infoSpy).toHaveBeenCalledWith("Resolved as '1.2.3'");
    expect(infoSpy).toHaveBeenCalledWith(
      'Version 1.2.3 was not found in the local cache'
    );
    expect(infoSpy).toHaveBeenCalledWith(
      'Version 1.2.3 is available for downloading'
    );
    expect(installSpy).toHaveBeenCalled();
    expect(addPathSpy).toHaveBeenCalledWith(expPath);
    await finder.useCpythonVersion(
      '1.2.4-beta.2',
      'x64',
      false,
      true,
      false,
      false
    );
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

  it('Finds stable Python version if it is not installed, but exists in the manifest, skipping newer pre-release', async () => {
    const findSpy = tc.getManifestFromRepo as jest.Mock;
    findSpy.mockImplementation(() => manifestData);

    const installSpy = installer.installCpythonFromRelease as jest.Mock;
    installSpy.mockImplementation(async () => {
      const pythonDir: string = path.join(toolDir, 'Python', '1.2.3', 'x64');
      await io.mkdirP(pythonDir);
      fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    });
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await expect(
      finder.useCpythonVersion('1.2', 'x64', false, false, false, false)
    ).resolves.toEqual({
      impl: 'CPython',
      version: '1.2.3'
    });
  });

  it('Finds Python version if it is not installed, but exists in the manifest, pre-release fallback', async () => {
    const findSpy = tc.getManifestFromRepo as jest.Mock;
    findSpy.mockImplementation(() => manifestData);

    const installSpy = installer.installCpythonFromRelease as jest.Mock;
    installSpy.mockImplementation(async () => {
      const pythonDir: string = path.join(
        toolDir,
        'Python',
        '1.1.0-beta.2',
        'x64'
      );
      await io.mkdirP(pythonDir);
      fs.writeFileSync(`${pythonDir}.complete`, 'hello');
    });
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    await expect(
      finder.useCpythonVersion('1.1', 'x64', false, false, false, false)
    ).rejects.toThrow();
    await expect(
      finder.useCpythonVersion('1.1', 'x64', false, false, true, false)
    ).resolves.toEqual({
      impl: 'CPython',
      version: '1.1.0-beta.2'
    });
    // Check 1.1.0 version specifier does not fallback to '1.1.0-beta.2'
    await expect(
      finder.useCpythonVersion('1.1.0', 'x64', false, false, true, false)
    ).rejects.toThrow();
  });

  it('Errors if Python is not installed', async () => {
    // This will throw if it doesn't find it in the cache and in the manifest (because no such version exists)
    let thrown = false;
    try {
      await finder.useCpythonVersion(
        '3.300000',
        'x64',
        true,
        false,
        false,
        false
      );
    } catch {
      thrown = true;
    }
    expect(thrown).toBeTruthy();
    expect(spyCoreAddPath).not.toHaveBeenCalled();
    expect(spyCoreExportVariable).not.toHaveBeenCalled();
  });
});
