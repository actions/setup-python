import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {fileURLToPath} from 'url';
import fs from 'fs';
import * as path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import * as semver from 'semver';

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

jest.unstable_mockModule('@actions/tool-cache', () => ({
  find: jest.fn(),
  findAllVersions: jest.fn(),
  downloadTool: jest.fn(),
  extractZip: jest.fn(),
  extractTar: jest.fn(),
  extract7z: jest.fn(),
  extractXar: jest.fn(),
  cacheDir: jest.fn(),
  cacheFile: jest.fn(),
  getManifestFromRepo: jest.fn(),
  findFromManifest: jest.fn(),
  evaluateVersions: jest.fn()
}));

jest.unstable_mockModule('@actions/exec', () => ({
  exec: jest.fn(),
  getExecOutput: jest.fn()
}));

// Import real utils BEFORE mock registration to get real function references
const realUtils = await import('../src/utils.js');

// Mock local utils module for readExactPyPyVersionFile/writeExactPyPyVersionFile
jest.unstable_mockModule('../src/utils.js', () => ({
  ...realUtils,
  readExactPyPyVersionFile: jest.fn(),
  writeExactPyPyVersionFile: jest.fn()
}));

// Dynamic imports after mocking
const core = await import('@actions/core');
const tc = await import('@actions/tool-cache');
const exec = await import('@actions/exec');
const utils = await import('../src/utils.js');
const finder = await import('../src/find-pypy.js');

// Non-mocked imports
import {HttpClient} from '@actions/http-client';
import type * as ifm from '@actions/http-client/lib/interfaces';

import type {IPyPyManifestRelease} from '../src/utils.js';
import manifestData from './data/pypy.json' with {type: 'json'};

const IS_WINDOWS = utils.IS_WINDOWS;
const getPyPyVersionFromPath = utils.getPyPyVersionFromPath;

let architecture: string;

if (IS_WINDOWS) {
  architecture = 'x86';
} else {
  architecture = 'x64';
}

const toolDir = path.join(__dirname, 'runner', 'tools');
const tempDir = path.join(__dirname, 'runner', 'temp');

describe('parsePyPyVersion', () => {
  it.each([
    ['pypy-3.6-v7.3.3', {pythonVersion: '3.6', pypyVersion: 'v7.3.3'}],
    ['pypy-3.6-v7.3.x', {pythonVersion: '3.6', pypyVersion: 'v7.3.x'}],
    ['pypy-3.6-v7.x', {pythonVersion: '3.6', pypyVersion: 'v7.x'}],
    ['pypy-3.6', {pythonVersion: '3.6', pypyVersion: 'x'}],
    ['pypy-3.6-nightly', {pythonVersion: '3.6', pypyVersion: 'nightly'}],
    ['pypy-3.6-v7.3.3rc1', {pythonVersion: '3.6', pypyVersion: 'v7.3.3-rc.1'}],
    ['pypy3.8-v7.3.7', {pythonVersion: '3.8', pypyVersion: 'v7.3.7'}],
    ['pypy3.8-v7.3.x', {pythonVersion: '3.8', pypyVersion: 'v7.3.x'}],
    ['pypy3.8-v7.x', {pythonVersion: '3.8', pypyVersion: 'v7.x'}],
    ['pypy3.8', {pythonVersion: '3.8', pypyVersion: 'x'}],
    ['pypy3.9-nightly', {pythonVersion: '3.9', pypyVersion: 'nightly'}],
    ['pypy3.9-v7.3.8rc1', {pythonVersion: '3.9', pypyVersion: 'v7.3.8-rc.1'}]
  ])('%s -> %s', (input, expected) => {
    expect(finder.parsePyPyVersion(input)).toEqual(expected);
  });

  it.each(['', 'pypy-', 'pypy', 'p', 'notpypy-'])(
    'throw on invalid input "%s"',
    input => {
      expect(() => finder.parsePyPyVersion(input)).toThrow(
        "Invalid 'version' property for PyPy. PyPy version should be specified as 'pypy<python-version>' or 'pypy-<python-version>'. See README for examples and documentation."
      );
    }
  );

  it.each(['pypy-2', 'pypy-3', 'pypy2', 'pypy3', 'pypy3.x', 'pypy3.8.10'])(
    'throw on invalid input "%s"',
    input => {
      expect(() => finder.parsePyPyVersion(input)).toThrow(
        "Invalid format of Python version for PyPy. Python version should be specified in format 'x.y'. See README for examples and documentation."
      );
    }
  );
});

describe('getPyPyVersionFromPath', () => {
  it('/fake/toolcache/PyPy/3.6.5/x64 -> 3.6.5', () => {
    expect(getPyPyVersionFromPath('/fake/toolcache/PyPy/3.6.5/x64')).toEqual(
      '3.6.5'
    );
  });
});

describe('findPyPyToolCache', () => {
  const actualPythonVersion = '3.6.17';
  const actualPyPyVersion = '7.5.4';
  const pypyPath = path.join('PyPy', actualPythonVersion, architecture);
  let tcFind: jest.Mock;
  let spyReadExactPyPyVersion: jest.Mock;
  let infoSpy: jest.Mock;
  let warningSpy: jest.Mock;
  let debugSpy: jest.Mock;
  let addPathSpy: jest.Mock;
  let exportVariableSpy: jest.Mock;
  let setOutputSpy: jest.Mock;

  beforeEach(() => {
    tcFind = tc.find as jest.Mock;
    (tcFind as jest.Mock<typeof tc.find>).mockImplementation(
      (toolname: string, pythonVersion: string) => {
        const semverVersion = new semver.Range(pythonVersion);
        return semver.satisfies(actualPythonVersion, semverVersion)
          ? pypyPath
          : '';
      }
    );

    spyReadExactPyPyVersion = utils.readExactPyPyVersionFile as jest.Mock;
    spyReadExactPyPyVersion.mockImplementation(() => actualPyPyVersion);

    infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => null);

    warningSpy = core.warning as jest.Mock;
    warningSpy.mockImplementation(() => null);

    debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => null);

    addPathSpy = core.addPath as jest.Mock;
    addPathSpy.mockImplementation(() => null);

    exportVariableSpy = core.exportVariable as jest.Mock;
    exportVariableSpy.mockImplementation(() => null);

    setOutputSpy = core.setOutput as jest.Mock;
    setOutputSpy.mockImplementation(() => null);
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('PyPy exists on the path and versions are satisfied', () => {
    expect(finder.findPyPyToolCache('3.6.17', 'v7.5.4', architecture)).toEqual({
      installDir: pypyPath,
      resolvedPythonVersion: actualPythonVersion,
      resolvedPyPyVersion: actualPyPyVersion
    });
  });

  it('PyPy exists on the path and versions are satisfied with semver', () => {
    expect(finder.findPyPyToolCache('3.6', 'v7.5.x', architecture)).toEqual({
      installDir: pypyPath,
      resolvedPythonVersion: actualPythonVersion,
      resolvedPyPyVersion: actualPyPyVersion
    });
  });

  it("PyPy exists on the path, but Python version doesn't match", () => {
    expect(finder.findPyPyToolCache('3.7', 'v7.5.4', architecture)).toEqual({
      installDir: '',
      resolvedPythonVersion: '',
      resolvedPyPyVersion: ''
    });
  });

  it("PyPy exists on the path, but PyPy version doesn't match", () => {
    expect(finder.findPyPyToolCache('3.6', 'v7.5.1', architecture)).toEqual({
      installDir: null,
      resolvedPythonVersion: '',
      resolvedPyPyVersion: ''
    });
  });
});

describe('findPyPyVersion', () => {
  let getBooleanInputSpy: jest.Mock;
  let warningSpy: jest.Mock;
  let debugSpy: jest.Mock;
  let infoSpy: jest.Mock;
  let addPathSpy: jest.Mock;
  let exportVariableSpy: jest.Mock;
  let setOutputSpy: jest.Mock;
  let tcFind: jest.Mock;
  let spyExtractZip: jest.Mock;
  let spyExtractTar: jest.Mock;
  let spyHttpClient: jest.SpiedFunction<typeof HttpClient.prototype.getJson>;
  let spyExistsSync: jest.SpiedFunction<typeof fs.existsSync>;
  let spyExec: jest.Mock;
  let spySymlinkSync: jest.SpiedFunction<typeof fs.symlinkSync>;
  let spyDownloadTool: jest.Mock;
  let spyReadExactPyPyVersion: jest.Mock;
  let spyFsReadDir: jest.SpiedFunction<typeof fs.readdirSync>;
  let spyWriteExactPyPyVersionFile: jest.Mock;
  let spyCacheDir: jest.Mock;
  let spyChmodSync: jest.SpiedFunction<typeof fs.chmodSync>;
  let spyCoreAddPath: jest.Mock;
  let spyCoreExportVariable: jest.Mock;
  const env = process.env;

  beforeEach(() => {
    getBooleanInputSpy = core.getBooleanInput as jest.Mock;
    getBooleanInputSpy.mockImplementation(() => false);

    infoSpy = core.info as jest.Mock;
    infoSpy.mockImplementation(() => {});

    warningSpy = core.warning as jest.Mock;
    warningSpy.mockImplementation(() => null);

    debugSpy = core.debug as jest.Mock;
    debugSpy.mockImplementation(() => null);

    addPathSpy = core.addPath as jest.Mock;
    addPathSpy.mockImplementation(() => null);

    exportVariableSpy = core.exportVariable as jest.Mock;
    exportVariableSpy.mockImplementation(() => null);

    setOutputSpy = core.setOutput as jest.Mock;
    setOutputSpy.mockImplementation(() => null);

    process.env = {...env};
    tcFind = tc.find as jest.Mock;
    (tcFind as jest.Mock<typeof tc.find>).mockImplementation(
      (tool: string, version: string) => {
        const semverRange = new semver.Range(version);
        let pypyPath = '';
        if (semver.satisfies('3.6.12', semverRange)) {
          pypyPath = path.join(toolDir, 'PyPy', '3.6.12', architecture);
        }
        return pypyPath;
      }
    );

    spyWriteExactPyPyVersionFile = utils.writeExactPyPyVersionFile as jest.Mock;
    spyWriteExactPyPyVersionFile.mockImplementation(() => null);

    spyReadExactPyPyVersion = utils.readExactPyPyVersionFile as jest.Mock;
    spyReadExactPyPyVersion.mockImplementation(() => '7.3.3');

    spyDownloadTool = tc.downloadTool as jest.Mock;
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'PyPy'));

    spyExtractZip = tc.extractZip as jest.Mock;
    spyExtractZip.mockImplementation(() => tempDir);

    spyExtractTar = tc.extractTar as jest.Mock;
    spyExtractTar.mockImplementation(() => tempDir);

    spyFsReadDir = jest.spyOn(fs, 'readdirSync');
    spyFsReadDir.mockImplementation(() => ['PyPyTest'] as any);

    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockImplementation(
      async (): Promise<ifm.TypedResponse<IPyPyManifestRelease[]>> => {
        const result = JSON.stringify(manifestData);
        return {
          statusCode: 200,
          headers: {},
          result: JSON.parse(result) as IPyPyManifestRelease[]
        };
      }
    );

    spyExec = exec.exec as jest.Mock;
    spyExec.mockImplementation(() => undefined);

    spySymlinkSync = jest.spyOn(fs, 'symlinkSync');
    spySymlinkSync.mockImplementation(() => undefined);

    spyExistsSync = jest.spyOn(fs, 'existsSync');
    spyExistsSync.mockReturnValue(true);

    spyCoreAddPath = core.addPath as jest.Mock;

    spyCoreExportVariable = core.exportVariable as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    process.env = env;
  });

  it('found PyPy in toolcache', async () => {
    await expect(
      finder.findPyPyVersion(
        'pypy-3.6-v7.3.x',
        architecture,
        true,
        false,
        false
      )
    ).resolves.toEqual({
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.3.3'
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

  it('throw on invalid input format', async () => {
    await expect(
      finder.findPyPyVersion('pypy3.7-v7.3.x', architecture, true, false, false)
    ).rejects.toThrow();
  });

  it('throw on invalid input format pypy3.7-7.3.x', async () => {
    await expect(
      finder.findPyPyVersion('pypy3.7-v7.3.x', architecture, true, false, false)
    ).rejects.toThrow();
  });

  it('found and install successfully', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'PyPy', '3.7.7', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findPyPyVersion(
        'pypy-3.7-v7.3.x',
        architecture,
        true,
        false,
        false
      )
    ).resolves.toEqual({
      resolvedPythonVersion: '3.7.9',
      resolvedPyPyVersion: '7.3.3'
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

  it('found and install successfully without environment update', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'PyPy', '3.7.7', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findPyPyVersion(
        'pypy-3.7-v7.3.x',
        architecture,
        false,
        false,
        false
      )
    ).resolves.toEqual({
      resolvedPythonVersion: '3.7.9',
      resolvedPyPyVersion: '7.3.3'
    });
    expect(spyCoreAddPath).not.toHaveBeenCalled();
    expect(spyCoreExportVariable).not.toHaveBeenCalled();
  });

  it('throw if release is not found', async () => {
    await expect(
      finder.findPyPyVersion(
        'pypy-3.7-v7.5.x',
        architecture,
        true,
        false,
        false
      )
    ).rejects.toThrow(
      `PyPy version 3.7 (v7.5.x) with arch ${architecture} not found`
    );
  });

  it('check-latest enabled version found and used from toolcache', async () => {
    await expect(
      finder.findPyPyVersion(
        'pypy-3.6-v7.3.x',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual({
      resolvedPythonVersion: '3.6.12',
      resolvedPyPyVersion: '7.3.3'
    });

    expect(infoSpy).toHaveBeenCalledWith(
      'Resolved as PyPy 7.3.3 with Python (3.6.12)'
    );
  });

  it('check-latest enabled version found and install successfully', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'PyPy', '3.7.7', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findPyPyVersion(
        'pypy-3.7-v7.3.x',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual({
      resolvedPythonVersion: '3.7.9',
      resolvedPyPyVersion: '7.3.3'
    });
    expect(infoSpy).toHaveBeenCalledWith(
      'Resolved as PyPy 7.3.3 with Python (3.7.9)'
    );
  });

  it('check-latest enabled version is not found and used from toolcache', async () => {
    (tcFind as jest.Mock<typeof tc.find>).mockImplementationOnce(
      (tool: string, version: string) => {
        const semverRange = new semver.Range(version);
        let pypyPath = '';
        if (semver.satisfies('3.8.8', semverRange)) {
          pypyPath = path.join(toolDir, 'PyPy', '3.8.8', architecture);
        }
        return pypyPath;
      }
    );
    await expect(
      finder.findPyPyVersion(
        'pypy-3.8-v7.3.x',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual({
      resolvedPythonVersion: '3.8.8',
      resolvedPyPyVersion: '7.3.3'
    });

    expect(infoSpy).toHaveBeenCalledWith(
      'Failed to resolve PyPy v7.3.x with Python (3.8) from manifest'
    );
  });

  it('found and install successfully, pre-release fallback', async () => {
    spyCacheDir = tc.cacheDir as jest.Mock;
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'PyPy', '3.8.12', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findPyPyVersion('pypy3.8', architecture, false, false, false)
    ).rejects.toThrow();
    await expect(
      finder.findPyPyVersion('pypy3.8', architecture, false, false, true)
    ).resolves.toEqual({
      resolvedPythonVersion: '3.8.12',
      resolvedPyPyVersion: '7.3.8rc2'
    });
  });
});
