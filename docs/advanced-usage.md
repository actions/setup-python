# Advanced Usage
- [Using the python-version input](advanced-usage.md#using-the-python-version-input)
    - [Specifying a Python version](advanced-usage.md#specifying-a-python-version)
    - [Specifying a PyPy version](advanced-usage.md#specifying-a-pypy-version)
    - [Specifying multiple Python and PyPy versions](advanced-usage.md#specifying-multiple-python/pypy-version)
    - [Matrix Testing](advanced-usage.md#matrix-testing)
- [Using the python-version-file input](advanced-usage.md#using-the-python-version-file-input)
- [Check latest version](advanced-usage.md#check-latest-version)
- [Caching packages](advanced-usage.md#caching-packages)
- [Outputs and environment variables](advanced-usage.md#outputs-and-environment-variables)
    - [Outputs](advanced-usage.md#outputs)
    - [Environment variables](advanced-usage.md#environment-variables)
    - [Using update-environment flag](advanced-usage.md#using-update-environment-flag)
- [Available versions of Python and PyPy](advanced-usage.md#available-versions-of-python-and-pypy)
    - [Python](advanced-usage.md#python)
    - [PyPy](advanced-usage.md#pypy)
- [Hosted tool cache](advanced-usage.md#hosted-tool-cache) 
- [Using `setup-python` with a self-hosted runner](advanced-usage.md#using-setup-python-with-a-self-hosted-runner)
    - [Windows](advanced-usage.md#windows)
    - [Linux](advanced-usage.md#linux)
    - [macOS](advanced-usage.md#macos)
- [Using `setup-python` on GHES](advanced-usage.md#using-setup-python-on-ghes)
- [Allow pre-releases](advanced-usage.md#allow-pre-releases)

## Using the `python-version` input

### Specifying a Python version

If there is a specific version of Python that you need and you don't want to worry about any potential breaking changes due to patch updates (going from `3.7.5` to `3.7.6` for example), you should specify the **exact major, minor, and patch version** (such as `3.7.5`):

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.7.5' 
- run: python my_script.py
```

- The only downside to this is that setup may take a little longer. If the exact version is not already installed on the runner due to more recent versions, the exact version will have to be downloaded.
- MSI installers are used on Windows for this, so runs will take a little longer to set up vs macOS and Linux.

You can specify **only a major and minor version** if you are okay with the most recent patch version being used:

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.7' 
- run: python my_script.py
```
- There will be a single patch version already installed on each runner for every minor version of Python that is supported.
- The patch version that will be preinstalled, will generally be the latest and every time there is a new patch released, the older version that is preinstalled will be replaced.
- Using the most recent patch version will result in a very quick setup since no downloads will be required since a locally installed version of Python on the runner will be used.

You can specify the version with **prerelease tag** to download and set up an accurate pre-release version of Python:

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.12.0-alpha.1'
- run: python my_script.py
```

It's also possible to use **x.y-dev syntax** to download and set up the latest patch version of Python, alpha, beta and rc (release candidate) releases included. (for specified major & minor versions):

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.12-dev'
- run: python my_script.py
```

You can also use several types of ranges that are specified in [semver](https://github.com/npm/node-semver#ranges), for instance:

- **[ranges](https://github.com/npm/node-semver#ranges)** to download and set up the latest available version of Python satisfying a range:

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '>=3.9 <3.10'
- run: python my_script.py
```

- **[hyphen ranges](https://github.com/npm/node-semver#hyphen-ranges-xyz---abc)** to download and set up the latest available version of Python (includes both pre-release and stable versions):

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.12.0-alpha - 3.12.0'
- run: python my_script.py
```

- **[x-ranges](https://github.com/npm/node-semver#x-ranges-12x-1x-12-)** to specify the latest stable version of Python (for specified major version):

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.x'
- run: python my_script.py
```
Please refer to the [Advanced range syntax section](https://github.com/npm/node-semver#advanced-range-syntax) of the [semver](https://github.com/npm/node-semver) to check other available range syntaxes.

### Specifying a PyPy version
The version of PyPy should be specified in the format `pypy<python_version>[-v<pypy_version>]` or `pypy-<python_version>[-v<pypy_version>]`.
The `-v<pypy_version>` parameter is optional and can be skipped. The latest PyPy version will be used in this case.

```
pypy3.8 or pypy-3.8 # the latest available version of PyPy that supports Python 3.8
pypy2.7 or pypy-2.7 # the latest available version of PyPy that supports Python 2.7
pypy3.7-v7.3.3 or pypy-3.7-v7.3.3 # Python 3.7 and PyPy 7.3.3
pypy3.7-v7.x or pypy-3.7-v7.x # Python 3.7 and the latest available PyPy 7.x
pypy3.7-v7.3.3rc1 or pypy-3.7-v7.3.3rc1 # Python 3.7 and preview version of PyPy
pypy3.7-nightly or pypy-3.7-nightly # Python 3.7 and nightly PyPy
```

Download and set up PyPy:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version:
        - 'pypy3.7' # the latest available version of PyPy that supports Python 3.7
        - 'pypy3.7-v7.3.3' # Python 3.7 and PyPy 7.3.3
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    - run: python my_script.py
```
More details on PyPy syntax can be found in the [Available versions of PyPy](#pypy) section.

### Specifying multiple Python/PyPy version
The python-version input can get multiple python/pypy versions. The last specified version will be used as a default one. 

Download and set up multiple Python versions:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      with:
        python-version: |
            3.8
            3.9
            3.10
    - run: python my_script.py
```

Download and set up multiple PyPy versions:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      with:
        python-version: |
            pypy-3.7-v7.3.x
            pypy3.9-nightly
            pypy3.8
    - run: python my_script.py
```

Download and set up multiple Python/PyPy versions:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      with:
        python-version: |
            3.8
            3.9
            pypy3.9-nightly
            pypy3.8
            3.10
    - run: python my_script.py
```

### Matrix Testing

Using `setup-python` it's possible to use [matrix syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstrategymatrix) to install several versions of Python or PyPy:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: [ '2.x', '3.x', 'pypy2.7', 'pypy3.7', 'pypy3.8' ]
    name: Python ${{ matrix.python-version }} sample
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}
          architecture: x64
      - run: python my_script.py
```

Exclude a specific Python version:

```yaml
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        python-version: ['2.7', '3.7', '3.8', '3.9', '3.10', 'pypy2.7', 'pypy3.8']
        exclude:
          - os: macos-latest
            python-version: '3.8'
          - os: windows-latest
            python-version: '3.6'
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}
      - name: Display Python version
        run: python --version
```

## Using the `python-version-file` input

`setup-python` action can read Python or PyPy version from a version file. `python-version-file` input is used for specifying the path to the version file. If the file that was supplied to `python-version-file` input doesn't exist, the action will fail with error.

>In case both `python-version` and `python-version-file` inputs are supplied, the `python-version-file` input will be ignored due to its lower priority.

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version-file: '.python-version' # Read python version from a file .python-version
- run: python my_script.py
```

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version-file: 'pyproject.toml' # Read python version from a file pyproject.toml
- run: python my_script.py
```

## Check latest version

The `check-latest` flag defaults to `false`. Use the default or set `check-latest` to `false` if you prefer stability and if you want to ensure a specific `Python or PyPy` version is always used.

If `check-latest` is set to `true`, the action first checks if the cached version is the latest one. If the locally cached version is not the most up-to-date, a `Python or PyPy` version will then be downloaded. Set `check-latest` to `true` if you want the most up-to-date `Python or PyPy` version to always be used.

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-python@v4
    with:
      python-version: '3.7'
      check-latest: true
  - run: python my_script.py
```
> Setting `check-latest` to `true` has performance implications as downloading `Python or PyPy` versions is slower than using cached versions.


## Caching packages

**Caching pipenv dependencies:**
```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.9'
    cache: 'pipenv'
- name: Install pipenv
  run: curl https://raw.githubusercontent.com/pypa/pipenv/master/get-pipenv.py | python
- run: pipenv install
```

**Caching poetry dependencies:**
```yaml
steps:
- uses: actions/checkout@v3
- name: Install poetry
  run: pipx install poetry
- uses: actions/setup-python@v4
  with:
    python-version: '3.9'
    cache: 'poetry'
- run: poetry install
- run: poetry run pytest
```

**Using a list of file paths to cache dependencies**
```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.9'
    cache: 'pipenv'
    cache-dependency-path: |
      server/app/Pipfile.lock
      __test__/app/Pipfile.lock
- name: Install pipenv
  run: curl https://raw.githubusercontent.com/pypa/pipenv/master/get-pipenv.py | python
- run: pipenv install
```
**Using wildcard patterns to cache dependencies**
```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.9'
    cache: 'pip'
    cache-dependency-path: '**/requirements-dev.txt'
- run: pip install -r subdirectory/requirements-dev.txt
```

**Using a list of wildcard patterns to cache dependencies**
```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.10'
    cache: 'pip'
    cache-dependency-path: |
      **/setup.cfg
      **/requirements*.txt
- run: pip install -e . -r subdirectory/requirements-dev.txt
```

**Caching projects that use setup.py:**

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.11'
    cache: 'pip'
    cache-dependency-path: setup.py
- run: pip install -e .
  # Or pip install -e '.[test]' to install test dependencies
```

# Outputs and environment variables

## Outputs

### `python-version`

Using **python-version** output it's possible to get the installed by action Python or PyPy version. This output is useful when the input `python-version` is given as a range (e.g. 3.8.0 - 3.10.0 ), but down in a workflow you need to operate with the exact installed version (e.g. 3.10.1). 

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      id: cp310
      with:
        python-version: "3.8.0 - 3.10.0"
    - run: echo '${{ steps.cp310.outputs.python-version }}'
```

### `python-path`

**python-path** output is available with the absolute path of the Python or PyPy interpreter executable if you need it:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      id: cp310
      with:
        python-version: "3.10"
    - run: pipx run --python '${{ steps.cp310.outputs.python-path }}' nox --version
```
### `cache-hit`

**cache-hit** output is available with a boolean value that indicates whether a cache hit occurred on the primary key:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      id: cp310
      with:
        python-version: "3.8.0"
        cache: "poetry"
    - run: echo '${{ steps.cp310.outputs.cache-hit }}' # true if cache-hit occurred on the primary key
```

## Environment variables

These environment variables become available after setup-python action execution:

| **Env.variable**      | **Description** |
| ----------- | ----------- |
| pythonLocation      |Contains the absolute path to the folder where the requested version of Python or PyPy is installed|
| Python_ROOT_DIR   | https://cmake.org/cmake/help/latest/module/FindPython.html#module:FindPython        |
| Python2_ROOT_DIR   |https://cmake.org/cmake/help/latest/module/FindPython2.html#module:FindPython2|
| Python3_ROOT_DIR   |https://cmake.org/cmake/help/latest/module/FindPython3.html#module:FindPython3|

## Using `update-environment` flag

The `update-environment` flag defaults to `true`.
With this setting, the action will add/update environment variables (e.g. `PATH`, `PKG_CONFIG_PATH`, `pythonLocation`) for Python or PyPy to just work out of the box.

If `update-environment` is set to `false`, the action will not add/update environment variables.
This can prove useful if you want the only side-effect to be to ensure Python or PyPy is installed and rely on the `python-path` output to run executable.
Such a requirement on side-effect could be because you don't want your composite action messing with your user's workflows.

```yaml
 steps:
   - uses: actions/checkout@v3
   - uses: actions/setup-python@v4
     id: cp310
     with:
       python-version: '3.10'
       update-environment: false
   - run: ${{ steps.cp310.outputs.python-path }} my_script.py
```
## Available versions of Python and PyPy
### Python

`setup-python` is able to configure **Python** from two sources:

- Preinstalled versions of Python in the tool cache on GitHub-hosted runners.
    - For detailed information regarding the available versions of Python that are installed, see [Supported software](https://docs.github.com/en/actions/reference/specifications-for-github-hosted-runners#supported-software).
    - For every minor version of Python, expect only the latest patch to be preinstalled.
    - If `3.8.1` is installed for example, and `3.8.2` is released, expect `3.8.1` to be removed and replaced by `3.8.2` in the tool cache.
    - If the exact patch version doesn't matter to you, specifying just the major and minor versions will get you the latest preinstalled patch version. In the previous example, the version spec `3.8` will use the `3.8.2` Python version found in the cache.
    - Use `-dev` instead of a patch number (e.g., `3.12-dev`) to install the latest patch version release for a given minor version, *alpha and beta releases included*.
- Downloadable Python versions from GitHub Releases ([actions/python-versions](https://github.com/actions/python-versions/releases)).
    - All available versions are listed in the [version-manifest.json](https://github.com/actions/python-versions/blob/main/versions-manifest.json) file.
    - If there is a specific version of Python that is not available, you can open an issue here

>**Note:** Python versions used in this action are generated in the [python-versions](https://github.com/actions/python-versions) repository. For macOS and Ubuntu images, python versions are built from the source code. For Windows, the python-versions repository uses installation executable. For more information please refer to the [python-versions](https://github.com/actions/python-versions) repository.

### PyPy

 `setup-python` is able to configure **PyPy** from two sources:

- Preinstalled versions of PyPy in the tool cache on GitHub-hosted runners
  - For detailed information regarding the available versions of PyPy that are installed, see [Supported software](https://docs.github.com/en/actions/reference/specifications-for-github-hosted-runners#supported-software).
  - For the latest PyPy release, all versions of Python are cached.
  - Cache is updated with a 1-2 week delay. If you specify the PyPy version as `pypy3.7` or `pypy-3.7`, the cached version will be used although a newer version is available. If you need to start using the recently released version right after release, you should specify the exact PyPy version using `pypy3.7-v7.3.3` or `pypy-3.7-v7.3.3`.

- Downloadable PyPy versions from the [official PyPy site](https://downloads.python.org/pypy/).
  - All available versions that we can download are listed in [versions.json](https://downloads.python.org/pypy/versions.json) file.
  - PyPy < 7.3.3 are not available to install on-flight.
  - If some versions are not available, you can open an issue in https://foss.heptapod.net/pypy/pypy/

## Hosted tool cache

GitHub hosted runners have a tool cache that comes with a few versions of Python + PyPy already installed. This tool cache helps speed up runs and tool setup by not requiring any new downloads. There is an environment variable called `RUNNER_TOOL_CACHE` on each runner that describes the location of the tool cache with Python and PyPy installed. `setup-python` works by taking a specific version of Python or PyPy from this tool cache and adding it to PATH.

|| Location |
|------|-------|
|**Tool cache Directory** |`RUNNER_TOOL_CACHE`|
|**Python tool cache**|`RUNNER_TOOL_CACHE/Python/*`|
|**PyPy tool cache**|`RUNNER_TOOL_CACHE/PyPy/*`|

GitHub runner images are set up in [actions/runner-images](https://github.com/actions/runner-images). During the setup, the available versions of Python and PyPy are automatically downloaded, set up and documented.
- Tool cache setup for Ubuntu: [Install-Toolset.ps1](https://github.com/actions/runner-images/blob/main/images/linux/scripts/installers/Install-Toolset.ps1) [Configure-Toolset.ps1](https://github.com/actions/runner-images/blob/main/images/linux/scripts/installers/Configure-Toolset.ps1)
- Tool cache setup for Windows: [Install-Toolset.ps1](https://github.com/actions/runner-images/blob/main/images/win/scripts/Installers/Install-Toolset.ps1) [Configure-Toolset.ps1](https://github.com/actions/runner-images/blob/main/images/win/scripts/Installers/Configure-Toolset.ps1)


## Using `setup-python` with a self-hosted runner

Python distributions are only available for the same [environments](https://github.com/actions/runner-images#available-images) that GitHub Actions hosted environments are available for. If you are using an unsupported version of Ubuntu such as `19.04` or another Linux distribution such as Fedora, `setup-python` may not work.

If you have a supported self-hosted runner and you would like to use `setup-python`, there are a few extra things you need to make sure are set up so that new versions of Python can be downloaded and configured on your runner.


### Windows

- Your runner needs to be running with administrator privileges so that the appropriate directories and files can be set up when downloading and installing a new version of Python for the first time.
- If your runner is configured as a service, make sure the account that is running the service has the appropriate write permissions so that Python can get installed. The default `NT AUTHORITY\NETWORK SERVICE` should be sufficient.
- You need `7zip` installed and added to your `PATH` so that the downloaded versions of Python files can be extracted properly during the first-time setup.
- MSI installers are used when setting up Python on Windows. A word of caution as MSI installers update registry settings.
- The 3.8 MSI installer for Windows will not let you install another 3.8 version of Python. If `setup-python` fails for a 3.8 version of Python, make sure any previously installed versions are removed by going to "Apps & Features" in the Settings app.

> By default runner downloads and installs tools into the folder set up by `RUNNER_TOOL_CACHE` environment variable. The environment variable called `AGENT_TOOLSDIRECTORY` can be set to change this location for Windows self-hosted runners.

>If you are experiencing problems while configuring Python on your self-hosted runner, turn on [step debugging](https://github.com/actions/toolkit/blob/main/docs/action-debugging.md#step-debug-logs) to see additional logs.

### Linux

By default runner downloads and installs tools into the folder set up by `RUNNER_TOOL_CACHE` environment variable. The environment variable called `AGENT_TOOLSDIRECTORY` can be set to change this location for Linux self-hosted runners:
- In the same shell that your runner is using, type `export AGENT_TOOLSDIRECTORY=/path/to/folder`.
- More permanent way of setting the environment variable is to create an `.env` file in the same directory as your runner and to add `AGENT_TOOLSDIRECTORY=/path/to/folder`. This ensures the variable is always set if your runner is configured as a service.

If you're using a non-default tool cache directory be sure that the user starting the runner has write permission to the new tool cache directory. To check the current user and group that the runner belongs type `ls -l` inside the runner's root directory.

The runner can be granted write access to any directory using a few techniques:
- The user starting the runner is the owner, and the owner has write permission.
- The user starting the runner is in the owning group, and the owning group has write permission.
- All users have write permission.
One quick way to grant access is to change the user and group of the non-default tool cache folder to be the same as the runners using `chown`:
`sudo chown runner-user:runner-group /path/to/folder`.


> If your runner is configured as a service and you run into problems, make sure the user that the service is running as is correct. For more information, you can [check the status of your self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners/configuring-the-self-hosted-runner-application-as-a-service#checking-the-status-of-the-service).


### macOS

 The Python packages for macOS that are downloaded from `actions/python-versions` are originally compiled from the source in `/Users/runner/hostedtoolcache`. Due to the fixed shared library path, these Python packages are non-relocatable and require to be installed only in `/Users/runner/hostedtoolcache`. Before the use of `setup-python` on the macOS self-hosted runner:
 
 - Create a directory called `/Users/runner/hostedtoolcache`
 - Change the permissions of `/Users/runner/hostedtoolcache` so that the runner has write access

You can check the current user and group that the runner belongs to by typing `ls -l` inside the runner's root directory.        
The runner can be granted write access to the `/Users/runner/hostedtoolcache` directory using a few techniques:
 - The user starting the runner is the owner, and the owner has write permission
 - The user starting the runner is in the owning group, and the owning group has write permission
 - All users have write permission.
One quick way to grant access is to change the user and group of `/Users/runner/hostedtoolcache` to be the same as the runners using `chown`:
`sudo chown runner-user:runner-group /Users/runner/hostedtoolcache`

> If your runner is configured as a service and you run into problems, make sure the user that the service is running as is correct. For more information, you can [check the status of your self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners/configuring-the-self-hosted-runner-application-as-a-service#checking-the-status-of-the-service).



## Using `setup-python` on GHES

### Avoiding rate limit issues

`setup-python` comes pre-installed on the appliance with GHES if Actions is enabled. When dynamically downloading Python distributions, `setup-python` downloads distributions from [`actions/python-versions`](https://github.com/actions/python-versions) on github.com (outside of the appliance). These calls to `actions/python-versions` are by default made via unauthenticated requests, which are limited to [60 requests per hour per IP](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting). If more requests are made within the time frame, then you will start to see rate-limit errors during downloading that look like this: 

    ##[error]API rate limit exceeded for YOUR_IP. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)

To get a higher rate limit, you can [generate a personal access token (PAT) on github.com](https://github.com/settings/tokens/new) and pass it as the `token` input for the action. It is important to understand that this needs to be a token from github.com and _not_ from your GHES instance. If you or your colleagues do not yet have a github.com account, you might need to create one.

Here are the steps you need to follow to avoid the rate limit:

1. Create a PAT on any github.com account by using [this link](https://github.com/settings/tokens/new) after logging into github.com (not your Enterprise instance).  This PAT does _not_ need any rights, so make sure all the boxes are unchecked.
2. Store this PAT in the repository / organization where you run your workflow, e.g. as `GH_GITHUB_COM_TOKEN`. You can do this by navigating to your repository -> **Settings** -> **Secrets** -> **Actions** -> **New repository secret**.
3. To use this functionality, you need to use any version newer than `v4.3`. Also, change _python-version_ as needed.

```yml
- name: Set up Python
  uses: actions/setup-python@v4
  with:
    python-version: 3.8
    token: ${{ secrets.GH_GITHUB_COM_TOKEN }}
```

Requests should now be authenticated. To verify that you are getting the higher rate limit, you can call GitHub's [rate limit API](https://docs.github.com/en/rest/rate-limit) from within your workflow ([example](https://github.com/actions/setup-python/pull/443#issuecomment-1206776401)).

### No access to github.com
If the runner is not able to access github.com, any Python versions requested during a workflow run must come from the runner's tool cache. See "[Setting up the tool cache on self-hosted runners without internet access](https://docs.github.com/en/enterprise-server/admin/github-actions/managing-access-to-actions-from-githubcom/setting-up-the-tool-cache-on-self-hosted-runners-without-internet-access)" for more information.


## Allow pre-releases

The `allow-prereleases` flag defaults to `false`.
If `allow-prereleases` is set to `true`, the action will allow falling back to pre-release versions of Python when a matching GA version of Python is not available.
This allows for example to simplify reuse of `python-version` as an input of nox for pre-releases of Python by not requiring manipulation of the `3.y-dev` specifier.
For CPython, `allow-prereleases` will only have effect for `x.y` version range (e.g. `3.12`).
Let's say that python 3.12 is not generally available, the following workflow will fallback to the most recent pre-release of python 3.12:
```yaml
jobs:
  test:
    name: ${{ matrix.os }} / ${{ matrix.python_version }}
    runs-on: ${{ matrix.os }}-latest
    strategy:
      fail-fast: false
      matrix:
        os: [Ubuntu, Windows, macOS]
        python_version: ["3.11", "3.12"]

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: "${{ matrix.python_version }}"
          allow-prereleases: true
      - run: pipx run nox --error-on-missing-interpreters -s tests-${{ matrix.python_version }}
```

