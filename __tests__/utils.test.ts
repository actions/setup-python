import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as io from '@actions/io';

import fs from 'fs';
import path from 'path';

import {
  validateVersion,
  validatePythonVersionFormatForPyPy,
  isCacheFeatureAvailable,
  getVersionInputFromFile,
  getVersionInputFromPlainFile,
  getVersionInputFromTomlFile
} from '../src/utils';

jest.mock('@actions/cache');
jest.mock('@actions/core');

describe('validatePythonVersionFormatForPyPy', () => {
  it.each([
    ['3.6', true],
    ['3.7', true],
    ['3.6.x', false],
    ['3.7.x', false],
    ['3.x', false],
    ['3', false]
  ])('%s -> %s', (input, expected) => {
    expect(validatePythonVersionFormatForPyPy(input)).toEqual(expected);
  });
});

describe('validateVersion', () => {
  it.each([
    ['v7.3.3', true],
    ['v7.3.x', true],
    ['v7.x', true],
    ['x', true],
    ['v7.3.3-rc.1', true],
    ['nightly', true],
    ['v7.3.b', false],
    ['3.6', true],
    ['3.b', false],
    ['3', true]
  ])('%s -> %s', (input, expected) => {
    expect(validateVersion(input)).toEqual(expected);
  });
});

describe('isCacheFeatureAvailable', () => {
  it('isCacheFeatureAvailable disabled on GHES', () => {
    jest.spyOn(cache, 'isFeatureAvailable').mockImplementation(() => false);
    const infoMock = jest.spyOn(core, 'warning');
    const message =
      'Caching is only supported on GHES version >= 3.5. If you are on a version >= 3.5, please check with your GHES admin if the Actions cache service is enabled or not.';
    try {
      process.env['GITHUB_SERVER_URL'] = 'http://example.com';
      expect(isCacheFeatureAvailable()).toBeFalsy();
      expect(infoMock).toHaveBeenCalledWith(message);
    } finally {
      delete process.env['GITHUB_SERVER_URL'];
    }
  });

  it('isCacheFeatureAvailable disabled on dotcom', () => {
    jest.spyOn(cache, 'isFeatureAvailable').mockImplementation(() => false);
    const infoMock = jest.spyOn(core, 'warning');
    const message =
      'The runner was not able to contact the cache service. Caching will be skipped';
    try {
      process.env['GITHUB_SERVER_URL'] = 'http://github.com';
      expect(isCacheFeatureAvailable()).toBe(false);
      expect(infoMock).toHaveBeenCalledWith(message);
    } finally {
      delete process.env['GITHUB_SERVER_URL'];
    }
  });

  it('isCacheFeatureAvailable is enabled', () => {
    jest.spyOn(cache, 'isFeatureAvailable').mockImplementation(() => true);
    expect(isCacheFeatureAvailable()).toBe(true);
  });
});

const tempDir = path.join(
  __dirname,
  'runner',
  path.join(Math.random().toString(36).substring(7)),
  'temp'
);

describe('Version from file test', () => {
  it.each([getVersionInputFromPlainFile, getVersionInputFromFile])(
    'Version from plain file test',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'python-version.file';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersionFileContent = '3.7';
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([pythonVersionFileContent]);
    }
  );
  it.each([getVersionInputFromTomlFile, getVersionInputFromFile])(
    'Version from standard pyproject.toml test',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'pyproject.toml';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersion = '>=3.7.0';
      const pythonVersionFileContent = `[project]\nrequires-python = "${pythonVersion}"`;
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([pythonVersion]);
    }
  );
  it.each([getVersionInputFromTomlFile, getVersionInputFromFile])(
    'Version from poetry pyproject.toml test',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'pyproject.toml';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      const pythonVersion = '>=3.7.0';
      const pythonVersionFileContent = `[tool.poetry.dependencies]\npython = "${pythonVersion}"`;
      fs.writeFileSync(pythonVersionFilePath, pythonVersionFileContent);
      expect(_fn(pythonVersionFilePath)).toEqual([pythonVersion]);
    }
  );
  it.each([getVersionInputFromTomlFile, getVersionInputFromFile])(
    'Version undefined',
    async _fn => {
      await io.mkdirP(tempDir);
      const pythonVersionFileName = 'pyproject.toml';
      const pythonVersionFilePath = path.join(tempDir, pythonVersionFileName);
      fs.writeFileSync(pythonVersionFilePath, ``);
      expect(_fn(pythonVersionFilePath)).toEqual([]);
    }
  );
});
