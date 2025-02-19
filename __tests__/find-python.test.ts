import {desugarVersion, pythonVersionToSemantic} from '../src/find-python';

describe('desugarVersion', () => {
  it.each([
    ['3.13', {version: '3.13', freethreaded: false}],
    ['3.13t', {version: '3.13', freethreaded: true}],
    ['3.13.1', {version: '3.13.1', freethreaded: false}],
    ['3.13.1t', {version: '3.13.1', freethreaded: true}],
    ['3.14-dev', {version: '~3.14.0-0', freethreaded: false}],
    ['3.14t-dev', {version: '~3.14.0-0', freethreaded: true}]
  ])('%s -> %s', (input, expected) => {
    expect(desugarVersion(input)).toEqual(expected);
  });
});

// Test the combined desugarVersion and pythonVersionToSemantic functions
describe('pythonVersions', () => {
  it.each([
    ['3.13', {version: '3.13', freethreaded: false}],
    ['3.13t', {version: '3.13', freethreaded: true}],
    ['3.13.1', {version: '3.13.1', freethreaded: false}],
    ['3.13.1t', {version: '3.13.1', freethreaded: true}],
    ['3.14-dev', {version: '~3.14.0-0', freethreaded: false}],
    ['3.14t-dev', {version: '~3.14.0-0', freethreaded: true}]
  ])('%s -> %s', (input, expected) => {
    const {version, freethreaded} = desugarVersion(input);
    const semanticVersionSpec = pythonVersionToSemantic(version, false);
    expect({version: semanticVersionSpec, freethreaded}).toEqual(expected);
  });

  it.each([
    ['3.13', {version: '~3.13.0-0', freethreaded: false}],
    ['3.13t', {version: '~3.13.0-0', freethreaded: true}],
    ['3.13.1', {version: '3.13.1', freethreaded: false}],
    ['3.13.1t', {version: '3.13.1', freethreaded: true}],
    ['3.14-dev', {version: '~3.14.0-0', freethreaded: false}],
    ['3.14t-dev', {version: '~3.14.0-0', freethreaded: true}]
  ])('%s (allowPreReleases=true) -> %s', (input, expected) => {
    const {version, freethreaded} = desugarVersion(input);
    const semanticVersionSpec = pythonVersionToSemantic(version, true);
    expect({version: semanticVersionSpec, freethreaded}).toEqual(expected);
  });
});
