import fs from 'fs';

import * as utils from '../src/utils';
import {HttpClient} from '@actions/http-client';
import * as ifm from '@actions/http-client/interfaces';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as core from '@actions/core';

import * as path from 'path';
import * as semver from 'semver';

import * as finder from '../src/find-pypy';
import {
  IPyPyManifestRelease,
  IS_WINDOWS,
  getPyPyVersionFromPath
} from '../src/utils';

import manifestData from './data/pypy.json';

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
  let tcFind: jest.SpyInstance;
  let spyReadExactPyPyVersion: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let addPathSpy: jest.SpyInstance;
  let exportVariableSpy: jest.SpyInstance;
  let setOutputSpy: jest.SpyInstance;

  beforeEach(() => {
    tcFind = jest.spyOn(tc, 'find');
    tcFind.mockImplementation((toolname: string, pythonVersion: string) => {
      const semverVersion = new semver.Range(pythonVersion);
      return semver.satisfies(actualPythonVersion, semverVersion)
        ? pypyPath
        : '';
    });

    spyReadExactPyPyVersion = jest.spyOn(utils, 'readExactPyPyVersionFile');
    spyReadExactPyPyVersion.mockImplementation(() => actualPyPyVersion);

    infoSpy = jest.spyOn(core, 'info');
    infoSpy.mockImplementation(() => null);

    warningSpy = jest.spyOn(core, 'warning');
    warningSpy.mockImplementation(() => null);

    debugSpy = jest.spyOn(core, 'debug');
    debugSpy.mockImplementation(() => null);

    addPathSpy = jest.spyOn(core, 'addPath');
    addPathSpy.mockImplementation(() => null);

    exportVariableSpy = jest.spyOn(core, 'exportVariable');
    exportVariableSpy.mockImplementation(() => null);

    setOutputSpy = jest.spyOn(core, 'setOutput');
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
  let getBooleanInputSpy: jest.SpyInstance;
  let warningSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let addPathSpy: jest.SpyInstance;
  let exportVariableSpy: jest.SpyInstance;
  let setOutputSpy: jest.SpyInstance;
  let tcFind: jest.SpyInstance;
  let spyExtractZip: jest.SpyInstance;
  let spyExtractTar: jest.SpyInstance;
  let spyHttpClient: jest.SpyInstance;
  let spyExistsSync: jest.SpyInstance;
  let spyExec: jest.SpyInstance;
  let spySymlinkSync: jest.SpyInstance;
  let spyDownloadTool: jest.SpyInstance;
  let spyReadExactPyPyVersion: jest.SpyInstance;
  let spyFsReadDir: jest.SpyInstance;
  let spyWriteExactPyPyVersionFile: jest.SpyInstance;
  let spyCacheDir: jest.SpyInstance;
  let spyChmodSync: jest.SpyInstance;
  let spyCoreAddPath: jest.SpyInstance;
  let spyCoreExportVariable: jest.SpyInstance;
  const env = process.env;

  beforeEach(() => {
    getBooleanInputSpy = jest.spyOn(core, 'getBooleanInput');
    getBooleanInputSpy.mockImplementation(() => false);

    infoSpy = jest.spyOn(core, 'info');
    infoSpy.mockImplementation(() => {});

    warningSpy = jest.spyOn(core, 'warning');
    warningSpy.mockImplementation(() => null);

    debugSpy = jest.spyOn(core, 'debug');
    debugSpy.mockImplementation(() => null);

    addPathSpy = jest.spyOn(core, 'addPath');
    addPathSpy.mockImplementation(() => null);

    exportVariableSpy = jest.spyOn(core, 'exportVariable');
    exportVariableSpy.mockImplementation(() => null);

    setOutputSpy = jest.spyOn(core, 'setOutput');
    setOutputSpy.mockImplementation(() => null);

    jest.resetModules();
    process.env = {...env};
    tcFind = jest.spyOn(tc, 'find');
    tcFind.mockImplementation((tool: string, version: string) => {
      const semverRange = new semver.Range(version);
      let pypyPath = '';
      if (semver.satisfies('3.6.12', semverRange)) {
        pypyPath = path.join(toolDir, 'PyPy', '3.6.12', architecture);
      }
      return pypyPath;
    });

    spyWriteExactPyPyVersionFile = jest.spyOn(
      utils,
      'writeExactPyPyVersionFile'
    );
    spyWriteExactPyPyVersionFile.mockImplementation(() => null);

    spyReadExactPyPyVersion = jest.spyOn(utils, 'readExactPyPyVersionFile');
    spyReadExactPyPyVersion.mockImplementation(() => '7.3.3');

    spyDownloadTool = jest.spyOn(tc, 'downloadTool');
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'PyPy'));

    spyExtractZip = jest.spyOn(tc, 'extractZip');
    spyExtractZip.mockImplementation(() => tempDir);

    spyExtractTar = jest.spyOn(tc, 'extractTar');
    spyExtractTar.mockImplementation(() => tempDir);

    spyFsReadDir = jest.spyOn(fs, 'readdirSync');
    spyFsReadDir.mockImplementation((directory: string) => ['PyPyTest']);

    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockImplementation(
      async (): Promise<ifm.ITypedResponse<IPyPyManifestRelease[]>> => {
        const result = JSON.stringify(manifestData);
        return {
          statusCode: 200,
          headers: {},
          result: JSON.parse(result) as IPyPyManifestRelease[]
        };
      }
    );

    spyExec = jest.spyOn(exec, 'exec');
    spyExec.mockImplementation(() => undefined);

    spySymlinkSync = jest.spyOn(fs, 'symlinkSync');
    spySymlinkSync.mockImplementation(() => undefined);

    spyExistsSync = jest.spyOn(fs, 'existsSync');
    spyExistsSync.mockReturnValue(true);

    spyCoreAddPath = jest.spyOn(core, 'addPath');

    spyCoreExportVariable = jest.spyOn(core, 'exportVariable');
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
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
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
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
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
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
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
    tcFind.mockImplementationOnce((tool: string, version: string) => {
      const semverRange = new semver.Range(version);
      let pypyPath = '';
      if (semver.satisfies('3.8.8', semverRange)) {
        pypyPath = path.join(toolDir, 'PyPy', '3.8.8', architecture);
      }
      return pypyPath;
    });
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
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
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
