import {jest, describe, it, expect, beforeEach} from '@jest/globals';

// Inputs are read lazily by install-python.ts, so each test can set them
// before invoking the function under test.
const inputs: Record<string, string> = {};

// Mock @actions/http-client
jest.unstable_mockModule('@actions/http-client', () => ({
  HttpClient: jest.fn().mockImplementation(() => ({
    getJson: jest.fn()
  })),
  HttpClientError: class HttpClientError extends Error {},
  HttpCodes: {
    OK: 200,
    NotFound: 404,
    InternalServerError: 500
  }
}));

// Mock @actions/cache (needed transitively by utils.ts)
jest.unstable_mockModule('@actions/cache', () => ({
  saveCache: jest.fn(),
  restoreCache: jest.fn(),
  isFeatureAvailable: jest.fn()
}));

// Mock @actions/tool-cache
jest.unstable_mockModule('@actions/tool-cache', () => ({
  getManifestFromRepo: jest.fn(),
  downloadTool: jest.fn(),
  extractTar: jest.fn(),
  extractZip: jest.fn(),
  HTTPError: class HTTPError extends Error {}
}));

// Mock @actions/core (needed by install-python.ts)
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

// Mock @actions/exec (needed by install-python.ts)
jest.unstable_mockModule('@actions/exec', () => ({
  exec: jest.fn(),
  getExecOutput: jest.fn()
}));

// Import real utils BEFORE mock registration to get real function references
const realUtils = await import('../src/utils.js');

// Pin the platform so the download/extract assertions below behave the same
// on every runner OS.
jest.unstable_mockModule('../src/utils.js', () => ({
  ...realUtils,
  IS_WINDOWS: false,
  IS_LINUX: false
}));

// Dynamic imports after mocking
const core = await import('@actions/core');
const httpm = await import('@actions/http-client');
const tc = await import('@actions/tool-cache');
const {
  getManifestUrl,
  getManifest,
  getManifestFromRepo,
  getManifestFromURL,
  resolveRepoCoords,
  isMirrorCustomized,
  installCpythonFromRelease
} = await import('../src/install-python.js');

const DEFAULT_MIRROR =
  'https://raw.githubusercontent.com/actions/python-versions/main';

const mockManifest = [
  {
    version: '1.0.0',
    stable: true,
    files: [
      {
        filename: 'tool-v1.0.0-linux-x64.tar.gz',
        platform: 'linux',
        arch: 'x64',
        download_url: 'https://example.com/tool-v1.0.0-linux-x64.tar.gz'
      }
    ]
  }
];

function setInputs(values: Record<string, string>) {
  Object.assign(inputs, values);
}

beforeEach(() => {
  jest.resetAllMocks();
  for (const key of Object.keys(inputs)) {
    delete inputs[key];
  }
  (core.getInput as jest.Mock<any>).mockImplementation(
    (name: string) => inputs[name] ?? ''
  );
});

describe('getManifestUrl', () => {
  it('defaults to the actions/python-versions manifest', () => {
    expect(getManifestUrl()).toBe(`${DEFAULT_MIRROR}/versions-manifest.json`);
  });

  it('appends versions-manifest.json to a custom mirror', () => {
    setInputs({mirror: 'https://mirror.example/py'});
    expect(getManifestUrl()).toBe(
      'https://mirror.example/py/versions-manifest.json'
    );
  });

  it('strips trailing slashes from the mirror', () => {
    setInputs({mirror: 'https://mirror.example/py///'});
    expect(getManifestUrl()).toBe(
      'https://mirror.example/py/versions-manifest.json'
    );
  });

  it('throws on a mirror that is not a valid URL', () => {
    setInputs({mirror: 'not a url'});
    expect(() => getManifestUrl()).toThrow(/Invalid 'mirror' URL/);
  });

  it('keeps throwing the same error when called repeatedly', () => {
    setInputs({mirror: 'not a url'});
    expect(() => getManifestUrl()).toThrow(/Invalid 'mirror' URL/);
    // Memoized, so the second call must not silently succeed or change shape —
    // find-python.ts calls this while building the "version not found" message.
    expect(() => getManifestUrl()).toThrow(/Invalid 'mirror' URL/);
  });

  it('treats an invalid mirror as fatal on the auth path too', async () => {
    // getManifestUrl() throws on a bad mirror; the auth resolution must agree
    // rather than swallow the error and quietly skip the mirror-token branch.
    setInputs({'mirror-token': 'MTOK', mirror: 'not a url'});
    (tc.downloadTool as jest.Mock<any>).mockResolvedValue('/tmp/py.tgz');
    (tc.extractTar as jest.Mock<any>).mockResolvedValue('/tmp/extracted');

    const release = {
      version: '3.12.0',
      stable: true,
      files: [
        {
          filename: 'python-3.12.0-linux-x64.tar.gz',
          platform: 'linux',
          arch: 'x64',
          download_url: 'https://cdn.example/py.tar.gz'
        }
      ]
    } as any;

    await expect(installCpythonFromRelease(release)).rejects.toThrow(
      /Invalid 'mirror' URL/
    );
  });
});

describe('isMirrorCustomized', () => {
  it('is false when the mirror input is empty', () => {
    expect(isMirrorCustomized()).toBe(false);
  });

  it('is false when the mirror input equals the default', () => {
    // action.yml gives `mirror` this exact default, so getInput() returns it on
    // every run where the user did not set one. The PyPy/GraalPy warning must
    // not fire in that case.
    setInputs({mirror: DEFAULT_MIRROR});
    expect(isMirrorCustomized()).toBe(false);
  });

  it('is false when the mirror input is the default with trailing slashes', () => {
    setInputs({mirror: `${DEFAULT_MIRROR}///`});
    expect(isMirrorCustomized()).toBe(false);
  });

  it('is true when the mirror input is a custom URL', () => {
    setInputs({mirror: 'https://mirror.example/py'});
    expect(isMirrorCustomized()).toBe(true);
  });
});

describe('resolveRepoCoords', () => {
  it('warns and returns null for a raw.githubusercontent.com mirror with a slash in the branch', () => {
    setInputs({
      mirror: 'https://raw.githubusercontent.com/foo/bar/feature/riscv'
    });

    expect(resolveRepoCoords()).toBeNull();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringMatching(/Branch names containing '\/' are not supported/)
    );
  });

  it('parses the refs/heads/{branch} form to the bare branch without warning', () => {
    setInputs({
      mirror:
        'https://raw.githubusercontent.com/actions/python-versions/refs/heads/main'
    });

    expect(resolveRepoCoords()).toEqual({
      owner: 'actions',
      repo: 'python-versions',
      branch: 'main'
    });
    // refs/heads/main is a valid single branch, so it must route through the
    // API path and never hit the slash-branch warning.
    expect(core.warning).not.toHaveBeenCalled();
  });

  it('does not warn for a non-GitHub mirror', () => {
    setInputs({mirror: 'https://mirror.example/py'});

    expect(resolveRepoCoords()).toBeNull();
    expect(core.warning).not.toHaveBeenCalled();
  });
});

describe('getManifestFromRepo mirror resolution', () => {
  it('resolves the default mirror to actions/python-versions@main with token', async () => {
    setInputs({token: 'TKN'});
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);

    await getManifestFromRepo();

    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'actions',
      'python-versions',
      'token TKN',
      'main'
    );
  });

  it('extracts owner/repo/branch from a custom raw.githubusercontent.com mirror', async () => {
    setInputs({
      token: 'TKN',
      mirror: 'https://raw.githubusercontent.com/foo/bar/dev'
    });
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);

    await getManifestFromRepo();

    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'foo',
      'bar',
      'token TKN',
      'dev'
    );
  });

  it('strips a trailing slash before extracting the branch', async () => {
    setInputs({
      token: 'TKN',
      mirror: 'https://raw.githubusercontent.com/foo/bar/main/'
    });
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);

    await getManifestFromRepo();

    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'foo',
      'bar',
      'token TKN',
      'main'
    );
  });

  it('resolves the refs/heads/{branch} form to the bare branch for the API', async () => {
    setInputs({
      token: 'TKN',
      mirror: 'https://raw.githubusercontent.com/foo/bar/refs/heads/main'
    });
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);

    await getManifestFromRepo();

    // The GitHub tree API takes a bare branch, so the refs/heads/ prefix must
    // be stripped rather than passed through as part of the branch name.
    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'foo',
      'bar',
      'token TKN',
      'main'
    );
  });

  it('returns null for a non-GitHub mirror so the caller uses the raw URL', () => {
    setInputs({mirror: 'https://mirror.example/py'});
    expect(resolveRepoCoords()).toBeNull();
    expect(tc.getManifestFromRepo).not.toHaveBeenCalled();
  });

  it('prefers mirror-token over token for the GitHub API call', async () => {
    setInputs({
      token: 'TKN',
      'mirror-token': 'MTOK',
      mirror: 'https://raw.githubusercontent.com/foo/bar/main'
    });
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);

    await getManifestFromRepo();

    // The API requires the `token ` prefix, and naming a repo mirror is explicit intent to
    // read that repo, so mirror-token is prefixed here even though downloads send it verbatim.
    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'foo',
      'bar',
      'token MTOK',
      'main'
    );
  });

  it('sends no auth when neither token nor mirror-token is set', async () => {
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);

    await getManifestFromRepo();

    expect(tc.getManifestFromRepo).toHaveBeenCalledWith(
      'actions',
      'python-versions',
      undefined,
      'main'
    );
  });
});

describe('getManifestFromURL mirror resolution', () => {
  it('fetches {mirror}/versions-manifest.json without auth when no mirror-token is set', async () => {
    setInputs({token: 'TKN', mirror: 'https://mirror.example/py'});
    const getJson = jest.fn(async () => ({result: mockManifest}));
    (httpm.HttpClient as jest.Mock<any>).mockImplementation(() => ({getJson}));

    await getManifestFromURL();

    // `token` must not reach a non-GitHub mirror.
    expect(getJson).toHaveBeenCalledWith(
      'https://mirror.example/py/versions-manifest.json',
      undefined
    );
  });

  it('sends mirror-token verbatim on the manifest fetch', async () => {
    setInputs({
      token: 'TKN',
      'mirror-token': 'Bearer MTOK',
      mirror: 'https://mirror.example/py'
    });
    const getJson = jest.fn(async () => ({result: mockManifest}));
    (httpm.HttpClient as jest.Mock<any>).mockImplementation(() => ({getJson}));

    await getManifestFromURL();

    expect(getJson).toHaveBeenCalledWith(
      'https://mirror.example/py/versions-manifest.json',
      {authorization: 'Bearer MTOK'}
    );
  });

  it('sends token as a prefixed header for a GitHub-hosted raw manifest', async () => {
    // A slash-branch URL genuinely falls to the direct-URL path (it does not
    // match the {owner}/{repo}/{branch} shape). raw.githubusercontent.com is a
    // GitHub host, so the token is still attached here — contradicting any
    // claim that the fallback fetch is anonymous.
    setInputs({
      token: 'TKN',
      mirror: 'https://raw.githubusercontent.com/foo/bar/feature/riscv'
    });
    const getJson = jest.fn(async () => ({result: mockManifest}));
    (httpm.HttpClient as jest.Mock<any>).mockImplementation(() => ({getJson}));

    await getManifestFromURL();

    expect(getJson).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/foo/bar/feature/riscv/versions-manifest.json',
      {authorization: 'token TKN'}
    );
  });
});

describe('getManifest source routing', () => {
  it('skips the GitHub API entirely for a non-GitHub mirror', async () => {
    setInputs({mirror: 'https://mirror.example/py'});
    const getJson = jest.fn(async () => ({result: mockManifest}));
    (httpm.HttpClient as jest.Mock<any>).mockImplementation(() => ({getJson}));

    await expect(getManifest()).resolves.toEqual(mockManifest);

    // Routing straight to the URL fetch avoids 3 retries with backoff on a
    // call that could never succeed.
    expect(tc.getManifestFromRepo).not.toHaveBeenCalled();
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('uses the GitHub API for a repo mirror without touching the raw URL', async () => {
    setInputs({token: 'TKN'});
    (tc.getManifestFromRepo as jest.Mock<any>).mockResolvedValue(mockManifest);
    const getJson = jest.fn(async () => ({result: mockManifest}));
    (httpm.HttpClient as jest.Mock<any>).mockImplementation(() => ({getJson}));

    await expect(getManifest()).resolves.toEqual(mockManifest);

    expect(tc.getManifestFromRepo).toHaveBeenCalledTimes(1);
    expect(getJson).not.toHaveBeenCalled();
  });
});

describe('installCpythonFromRelease auth gating', () => {
  const makeRelease = (downloadUrl: string) =>
    ({
      version: '3.12.0',
      stable: true,
      release_url: '',
      files: [
        {
          filename: 'python-3.12.0-linux-x64.tar.gz',
          platform: 'linux',
          platform_version: '',
          arch: 'x64',
          download_url: downloadUrl
        }
      ]
    }) as any;

  // Returns the auth argument tc.downloadTool was called with.
  async function downloadAuthFor(downloadUrl: string) {
    (tc.downloadTool as jest.Mock<any>).mockResolvedValue('/tmp/py.tgz');
    (tc.extractTar as jest.Mock<any>).mockResolvedValue('/tmp/extracted');

    await installCpythonFromRelease(makeRelease(downloadUrl));

    const call = (tc.downloadTool as jest.Mock<any>).mock.calls[0];
    expect(call[0]).toBe(downloadUrl);
    return call[2];
  }

  it('forwards token to github.com download URLs', async () => {
    setInputs({token: 'TKN'});
    await expect(
      downloadAuthFor(
        'https://github.com/actions/python-versions/releases/download/3.12.0-x/python-3.12.0-linux-x64.tar.gz'
      )
    ).resolves.toBe('token TKN');
  });

  it('forwards token to api.github.com download URLs', async () => {
    setInputs({token: 'TKN'});
    await expect(
      downloadAuthFor('https://api.github.com/repos/x/y/tarball/main')
    ).resolves.toBe('token TKN');
  });

  it('forwards token to *.githubusercontent.com download URLs', async () => {
    setInputs({token: 'TKN'});
    await expect(
      downloadAuthFor('https://objects.githubusercontent.com/x/python.tar.gz')
    ).resolves.toBe('token TKN');
  });

  it('does NOT forward token to a non-GitHub download URL', async () => {
    setInputs({token: 'TKN', mirror: 'https://cdn.example'});
    await expect(
      downloadAuthFor('https://cdn.example/py.tar.gz')
    ).resolves.toBeUndefined();
  });

  it('does NOT forward token to a lookalike host', async () => {
    setInputs({token: 'TKN', mirror: 'https://evil-github.com'});
    await expect(
      downloadAuthFor('https://evil-github.com/py.tar.gz')
    ).resolves.toBeUndefined();
  });

  it('forwards mirror-token verbatim to the mirror host', async () => {
    setInputs({
      token: 'TKN',
      'mirror-token': 'Bearer MTOK',
      mirror: 'https://cdn.example'
    });
    await expect(
      downloadAuthFor('https://cdn.example/py.tar.gz')
    ).resolves.toBe('Bearer MTOK');
  });

  it('withholds mirror-token from a same-host download URL on a different scheme', async () => {
    setInputs({
      'mirror-token': 'Bearer MTOK',
      mirror: 'https://cdn.example'
    });
    // The mirror is https, but the manifest points a download_url at http on
    // the same host. Matching on origin (scheme + host + port) rather than host
    // alone keeps the token from going out in cleartext.
    await expect(
      downloadAuthFor('http://cdn.example/py.tar.gz')
    ).resolves.toBeUndefined();
  });

  it('withholds mirror-token from a same-host download URL on a different port', async () => {
    setInputs({
      'mirror-token': 'Bearer MTOK',
      mirror: 'https://cdn.example'
    });
    // Different port is a different origin, so the nominated credential must
    // not follow.
    await expect(
      downloadAuthFor('https://cdn.example:8443/py.tar.gz')
    ).resolves.toBeUndefined();
  });

  it('sends mirror-token to a same-origin download URL on an explicit port', async () => {
    setInputs({
      'mirror-token': 'Bearer MTOK',
      mirror: 'https://cdn.example:8443'
    });
    await expect(
      downloadAuthFor('https://cdn.example:8443/py.tar.gz')
    ).resolves.toBe('Bearer MTOK');
  });

  it('withholds mirror-token from an incidental GitHub host and uses token there', async () => {
    setInputs({
      token: 'TKN',
      'mirror-token': 'MTOK',
      mirror: 'https://cdn.example'
    });
    // A manifest hosted on the private mirror may still point release assets at
    // GitHub; the private credential must not follow them there.
    await expect(
      downloadAuthFor('https://objects.githubusercontent.com/x/python.tar.gz')
    ).resolves.toBe('token TKN');
  });

  it('withholds mirror-token from a GitHub host when no token is set', async () => {
    setInputs({'mirror-token': 'MTOK', mirror: 'https://cdn.example'});
    await expect(
      downloadAuthFor('https://objects.githubusercontent.com/x/python.tar.gz')
    ).resolves.toBeUndefined();
  });

  it('withholds mirror-token from a third host that is neither the mirror nor GitHub', async () => {
    setInputs({
      token: 'TKN',
      'mirror-token': 'MTOK',
      mirror: 'https://cdn.example'
    });
    await expect(
      downloadAuthFor('https://other.example/py.tar.gz')
    ).resolves.toBeUndefined();
  });

  it('uses mirror-token for a GitHub mirror host when it is the nominated host', async () => {
    setInputs({
      token: 'TKN',
      'mirror-token': 'token MTOK',
      mirror: 'https://raw.githubusercontent.com/foo/bar/main'
    });
    await expect(
      downloadAuthFor('https://raw.githubusercontent.com/foo/bar/py.tar.gz')
    ).resolves.toBe('token MTOK');
  });

  it('sends no auth when no tokens are configured', async () => {
    await expect(
      downloadAuthFor('https://github.com/o/r/releases/download/v/py.tar.gz')
    ).resolves.toBeUndefined();
  });
});
