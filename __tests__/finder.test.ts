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
  it('Finds Python if it is installed', async () => {});

  it('Errors if Python is not installed', async () => {});

  it('Finds PyPy if it is installed', async () => {});

  it('Errors if PyPy is not installed', async () => {});
});
