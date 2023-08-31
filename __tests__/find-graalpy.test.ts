import fs from 'fs';

import {HttpClient} from '@actions/http-client';
import * as ifm from '@actions/http-client/interfaces';
import * as tc from '@actions/tool-cache';
import * as exec from '@actions/exec';
import * as core from '@actions/core';

import * as path from 'path';
import * as semver from 'semver';

import * as finder from '../src/find-graalpy';
import {IGraalPyManifestRelease, IS_WINDOWS} from '../src/utils';

import manifestData from './data/graalpy.json';

const architecture = 'x64';

const toolDir = path.join(__dirname, 'runner', 'tools');
const tempDir = path.join(__dirname, 'runner', 'temp');

/* GraalPy doesn't have a windows release yet */
const describeSkipOnWindows = IS_WINDOWS ? describe.skip : describe;

describe('parseGraalPyVersion', () => {
  it.each([
    ['graalpy-23', '23'],
    ['graalpy-23.0', '23.0'],
    ['graalpy23.0', '23.0']
  ])('%s -> %s', (input, expected) => {
    expect(finder.parseGraalPyVersion(input)).toEqual(expected);
  });

  it.each(['', 'graalpy-', 'graalpy', 'p', 'notgraalpy-'])(
    'throw on invalid input "%s"',
    input => {
      expect(() => finder.parseGraalPyVersion(input)).toThrow(
        "Invalid 'version' property for GraalPy. GraalPy version should be specified as 'graalpy<python-version>' or 'graalpy-<python-version>'. See README for examples and documentation."
      );
    }
  );
});

describe('findGraalPyToolCache', () => {
  const actualGraalPyVersion = '23.0.0';
  const graalpyPath = path.join('GraalPy', actualGraalPyVersion, architecture);
  let tcFind: jest.SpyInstance;
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
      return semver.satisfies(actualGraalPyVersion, semverVersion)
        ? graalpyPath
        : '';
    });

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

  it('GraalPy exists on the path and versions are satisfied', () => {
    expect(finder.findGraalPyToolCache('23.0.0', architecture)).toEqual({
      installDir: graalpyPath,
      resolvedGraalPyVersion: actualGraalPyVersion
    });
  });

  it('GraalPy exists on the path and versions are satisfied with semver', () => {
    expect(finder.findGraalPyToolCache('23.0', architecture)).toEqual({
      installDir: graalpyPath,
      resolvedGraalPyVersion: actualGraalPyVersion
    });
  });

  it("GraalPy exists on the path, but version doesn't match", () => {
    expect(finder.findGraalPyToolCache('22.3', architecture)).toEqual({
      installDir: '',
      resolvedGraalPyVersion: ''
    });
  });
});

describeSkipOnWindows('findGraalPyVersion', () => {
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
  let spyFsReadDir: jest.SpyInstance;
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
      let graalpyPath = '';
      if (semver.satisfies('23.0.0', semverRange)) {
        graalpyPath = path.join(toolDir, 'GraalPy', '23.0.0', architecture);
      }
      return graalpyPath;
    });

    spyDownloadTool = jest.spyOn(tc, 'downloadTool');
    spyDownloadTool.mockImplementation(() => path.join(tempDir, 'GraalPy'));

    spyExtractZip = jest.spyOn(tc, 'extractZip');
    spyExtractZip.mockImplementation(() => tempDir);

    spyExtractTar = jest.spyOn(tc, 'extractTar');
    spyExtractTar.mockImplementation(() => tempDir);

    spyFsReadDir = jest.spyOn(fs, 'readdirSync');
    spyFsReadDir.mockImplementation((directory: string) => ['GraalPyTest']);

    spyHttpClient = jest.spyOn(HttpClient.prototype, 'getJson');
    spyHttpClient.mockImplementation(
      async (): Promise<ifm.ITypedResponse<IGraalPyManifestRelease[]>> => {
        const result = JSON.stringify(manifestData);
        return {
          statusCode: 200,
          headers: {},
          result: JSON.parse(result) as IGraalPyManifestRelease[]
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

  it('found GraalPy in toolcache', async () => {
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0',
        architecture,
        true,
        false,
        false
      )
    ).resolves.toEqual('23.0.0');
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
      finder.findGraalPyVersion('graalpy-x23', architecture, true, false, false)
    ).rejects.toThrow();
  });

  it('found and install successfully', async () => {
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '23.0.0', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0.0',
        architecture,
        true,
        false,
        false
      )
    ).resolves.toEqual('23.0.0');
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
      path.join(toolDir, 'GraalPy', '23.0.0', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0.0',
        architecture,
        false,
        false,
        false
      )
    ).resolves.toEqual('23.0.0');
    expect(spyCoreAddPath).not.toHaveBeenCalled();
    expect(spyCoreExportVariable).not.toHaveBeenCalled();
  });

  it('throw if release is not found', async () => {
    await expect(
      finder.findGraalPyVersion(
        'graalpy-19.0.0',
        architecture,
        true,
        false,
        false
      )
    ).rejects.toThrow(
      `GraalPy version 19.0.0 with arch ${architecture} not found`
    );
  });

  it('check-latest enabled version found and used from toolcache', async () => {
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0.0',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual('23.0.0');

    expect(infoSpy).toHaveBeenCalledWith('Resolved as GraalPy 23.0.0');
  });

  it('check-latest enabled version found and install successfully', async () => {
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '23.0.0', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findGraalPyVersion(
        'graalpy-23.0.0',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual('23.0.0');
    expect(infoSpy).toHaveBeenCalledWith('Resolved as GraalPy 23.0.0');
  });

  it('check-latest enabled version is not found and used from toolcache', async () => {
    tcFind.mockImplementationOnce((tool: string, version: string) => {
      const semverRange = new semver.Range(version);
      let graalpyPath = '';
      if (semver.satisfies('22.3.4', semverRange)) {
        graalpyPath = path.join(toolDir, 'GraalPy', '22.3.4', architecture);
      }
      return graalpyPath;
    });
    await expect(
      finder.findGraalPyVersion(
        'graalpy-22.3.4',
        architecture,
        false,
        true,
        false
      )
    ).resolves.toEqual('22.3.4');

    expect(infoSpy).toHaveBeenCalledWith(
      'Failed to resolve GraalPy 22.3.4 from manifest'
    );
  });

  it('found and install successfully, pre-release fallback', async () => {
    spyCacheDir = jest.spyOn(tc, 'cacheDir');
    spyCacheDir.mockImplementation(() =>
      path.join(toolDir, 'GraalPy', '23.1', architecture)
    );
    spyChmodSync = jest.spyOn(fs, 'chmodSync');
    spyChmodSync.mockImplementation(() => undefined);
    await expect(
      finder.findGraalPyVersion(
        'graalpy23.1',
        architecture,
        false,
        false,
        false
      )
    ).rejects.toThrow();
    await expect(
      finder.findGraalPyVersion('graalpy23.1', architecture, false, false, true)
    ).resolves.toEqual('23.1.0-a.1');
  });
});
