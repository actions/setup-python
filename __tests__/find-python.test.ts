import {desugarVersion} from '../src/find-python';

describe('desugarVersion', () => {
  it.each([
    ['3.13', ['3.13', '']],
    ['3.13t', ['3.13', '-freethreaded']],
    ['3.13.1', ['3.13.1', '']],
    ['3.13.1t', ['3.13.1', '-freethreaded']],
    ['3.14-dev', ['~3.14.0-0', '']],
    ['3.14t-dev', ['~3.14.0-0', '-freethreaded']],
    ['3.14.0a4', ['3.14.0a4', '']],
    ['3.14.0ta4', ['3.14.0a4', '-freethreaded']],
    ['3.14.0rc1', ['3.14.0rc1', '']],
    ['3.14.0trc1', ['3.14.0rc1', '-freethreaded']]
  ])('%s -> %s', (input, expected) => {
    expect(desugarVersion(input)).toEqual(expected);
  });
});
