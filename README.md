# setup-python

<p align="left">
  <a href="https://github.com/actions/setup-python"><img alt="GitHub Actions status" src="https://github.com/actions/setup-python/workflows/Main%20workflow/badge.svg"></a>
</p>

This action provides the following functionalities for GitHub Actions users:

- Optionally downloading and installing the requested version of Python/PyPy and adding it to the PATH
- Optionally caching dependencies for pip, pipenv and poetry
- Registering problem matchers for error output

## Basic usage

See [action.yml](action.yml)

**Python**
```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4 # <- v4 is a major release tag of the action: https://github.com/actions/setup-python/tags
  with:
    python-version: '3.10' 
- run: python my_script.py
```

**PyPy**
```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4 
  with:
    python-version: 'pypy3.9' 
- run: python my_script.py
```
The `python-version` input is optional. If not supplied, the action will try to resolve version from the default `.python-version` file. If `.python-version` file doesn't exist Python/PyPy version from the PATH will be used. The default version of Python/PyPy in PATH vary between runners and can be changed unexpectedly so we recommend always use `setup-python`.

The action will first check the local [tool cache](docs/advanced-usage.md#hosted-tool-cache) for a [semver](https://github.com/npm/node-semver#versions) match. If unable to find a specific version in the tool cache, the action will attempt to download a version of Python from [GitHub Releases](https://github.com/actions/python-versions/releases) and for PyPy from the official [PyPy's dist](https://downloads.python.org/pypy/).

For information regarding locally cached versions of Python/PyPy on GitHub hosted runners, check out [GitHub Actions Virtual Environments](https://github.com/actions/virtual-environments).

## Supported version syntax

The `python-version` input supports the [Semantic Versioning Specification](https://semver.org/) and some special version notations (e.g. `semver ranges`, `x.y-dev syntax`, etc.), for detailed examples please refer to the section: [Using python-version input](docs/advanced-usage.md#using-python-version-input) of the [Advanced usage](docs/advanced-usage.md) guide.

## Supported architectures

Using `architecture` input it is possible to specify required Python/PyPy interpreter architecture: `x86` or `x64`. If input is not specified the architecture defaults to `x64`.

<<<<<<< HEAD
## Caching packages dependencies
=======
Download and set up the latest stable version of Python (for specified major version):
```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.x'
- run: python my_script.py
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
        - 'pypy3.8' # the latest available version of PyPy that supports Python 3.8
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}
    - run: python my_script.py
```
More details on PyPy syntax and examples of using preview / nightly versions of PyPy can be found in the [Available versions of PyPy](#available-versions-of-pypy) section.

An output is available with the absolute path of the python interpreter executable if you need it:
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

>The environment variable `pythonLocation` also becomes available after Python or PyPy installation. It contains the absolute path to the folder where the desired version of Python or PyPy is installed.

# Getting started with Python + Actions

Check out our detailed guide on using [Python with GitHub Actions](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/using-python-with-github-actions).

# Available versions of Python

`setup-python` is able to configure Python from two sources:

- Preinstalled versions of Python in the tools cache on GitHub-hosted runners.
    - For detailed information regarding the available versions of Python that are installed, see [Supported software](https://docs.github.com/en/actions/reference/specifications-for-github-hosted-runners#supported-software).
    - For every minor version of Python, expect only the latest patch to be preinstalled.
    - If `3.8.1` is installed for example, and `3.8.2` is released, expect `3.8.1` to be removed and replaced by `3.8.2` in the tools cache.
    - If the exact patch version doesn't matter to you, specifying just the major and minor version will get you the latest preinstalled patch version. In the previous example, the version spec `3.8` will use the `3.8.2` Python version found in the cache.
    - Use `-dev` instead of a patch number (e.g., `3.11-dev`) to install the latest patch version release for a given minor version, *alpha and beta releases included*.
- Downloadable Python versions from GitHub Releases ([actions/python-versions](https://github.com/actions/python-versions/releases)).
    - All available versions are listed in the [version-manifest.json](https://github.com/actions/python-versions/blob/main/versions-manifest.json) file.
    - If there is a specific version of Python that is not available, you can open an issue here

**Note:** Python versions used in this action are generated in the [python-versions](https://github.com/actions/python-versions) repository. For macOS and Ubuntu images python versions are built from the source code. For Windows the python-versions repository uses installation executable. For more information please refer to the [python-versions](https://github.com/actions/python-versions) repository.

 # Available versions of PyPy

 `setup-python` is able to configure PyPy from two sources:

- Preinstalled versions of PyPy in the tools cache on GitHub-hosted runners
  - For detailed information regarding the available versions of PyPy that are installed, see [Supported software](https://docs.github.com/en/actions/reference/specifications-for-github-hosted-runners#supported-software).
  - For the latest PyPy release, all versions of Python are cached.
  - Cache is updated with a 1-2 week delay. If you specify the PyPy version as `pypy3.7` or `pypy-3.7`, the cached version will be used although a newer version is available. If you need to start using the recently released version right after release, you should specify the exact PyPy version using `pypy3.7-v7.3.3` or `pypy-3.7-v7.3.3`.

- Downloadable PyPy versions from the [official PyPy site](https://downloads.python.org/pypy/).
  - All available versions that we can download are listed in [versions.json](https://downloads.python.org/pypy/versions.json) file.
  - PyPy < 7.3.3 are not available to install on-flight.
  - If some versions are not available, you can open an issue in https://foss.heptapod.net/pypy/pypy/

# Hosted Tool Cache

GitHub hosted runners have a tools cache that comes with a few versions of Python + PyPy already installed. This tools cache helps speed up runs and tool setup by not requiring any new downloads. There is an environment variable called `RUNNER_TOOL_CACHE` on each runner that describes the location of this tools cache and there is where you will find Python and PyPy installed. `setup-python` works by taking a specific version of Python or PyPy in this tools cache and adding it to PATH.

|| Location |
|------|-------|
|**Tool Cache Directory** |`RUNNER_TOOL_CACHE`|
|**Python Tool Cache**|`RUNNER_TOOL_CACHE/Python/*`|
|**PyPy Tool Cache**|`RUNNER_TOOL_CACHE/PyPy/*`|

GitHub virtual environments are setup in [actions/virtual-environments](https://github.com/actions/virtual-environments). During the setup, the available versions of Python and PyPy are automatically downloaded, setup and documented.
- Tools cache setup for Ubuntu: [Install-Toolset.ps1](https://github.com/actions/virtual-environments/blob/main/images/linux/scripts/installers/Install-Toolset.ps1) [Configure-Toolset.ps1](https://github.com/actions/virtual-environments/blob/main/images/linux/scripts/installers/Configure-Toolset.ps1)
- Tools cache setup for Windows: [Install-Toolset.ps1](https://github.com/actions/virtual-environments/blob/main/images/win/scripts/Installers/Install-Toolset.ps1) [Configure-Toolset.ps1](https://github.com/actions/virtual-environments/blob/main/images/win/scripts/Installers/Configure-Toolset.ps1)

# Specifying a Python version

If there is a specific version of Python that you need and you don't want to worry about any potential breaking changes due to patch updates (going from `3.7.5` to `3.7.6` for example), you should specify the exact major, minor, and patch version (such as `3.7.5`)
  - The only downside to this is that set up will take a little longer since the exact version will have to be downloaded if the exact version is not already installed on the runner due to more recent versions.
  - MSI installers are used on Windows for this, so runs will take a little longer to set up vs Mac and Linux.

You should specify only a major and minor version if you are okay with the most recent patch version being used.
  - There will be a single patch version already installed on each runner for every minor version of Python that is supported.
  - The patch version that will be preinstalled, will generally be the latest and every time there is a new patch released, the older version that is preinstalled will be replaced.
  - Using the most recent patch version will result in a very quick setup since no downloads will be required since a locally installed version Python on the runner will be used.

# Specifying a PyPy version
The version of PyPy should be specified in the format `pypy<python_version>[-v<pypy_version>]` or `pypy-<python_version>[-v<pypy_version>]`.
The `<pypy_version>` parameter is optional and can be skipped. The latest version will be used in this case.

```
pypy3.7 or pypy-3.7 # the latest available version of PyPy that supports Python 3.7
pypy3.8 or pypy-3.8 # the latest available version of PyPy that supports Python 3.8
pypy2.7 or pypy-2.7 # the latest available version of PyPy that supports Python 2.7
pypy3.7-v7.3.3 or pypy-3.7-v7.3.3 # Python 3.7 and PyPy 7.3.3
pypy3.7-v7.x or pypy-3.7-v7.x # Python 3.7 and the latest available PyPy 7.x
pypy3.7-v7.3.3rc1 or pypy-3.7-v7.3.3rc1 # Python 3.7 and preview version of PyPy
pypy3.7-nightly or pypy-3.7-nightly # Python 3.7 and nightly PyPy
```

Note: `pypy2` and `pypy3` have been removed in v3. Use the format above instead.

# Check latest version

The `check-latest` flag defaults to `false`. Use the default or set `check-latest` to `false` if you prefer stability and if you want to ensure a specific `Python/PyPy` version is always used.

If `check-latest` is set to `true`, the action first checks if the cached version is the latest one. If the locally cached version is not the most up-to-date, a `Python/PyPy` version will then be downloaded. Set `check-latest` to `true` if you want the most up-to-date `Python/PyPy` version to always be used.

> Setting `check-latest` to `true` has performance implications as downloading `Python/PyPy` versions is slower than using cached versions.

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-python@v3
    with:
      python-version: '3.7'
      check-latest: true
  - run: python my_script.py
```

# Caching packages dependencies
>>>>>>> main

The action has built-in functionality for caching and restoring dependencies. It uses [actions/cache](https://github.com/actions/toolkit/tree/main/packages/cache) under the hood for caching dependencies but requires less configuration settings. Supported package managers are `pip`, `pipenv` and `poetry`. The `cache` input is optional, and caching is turned off by default.

The action defaults to searching for a dependency file (`requirements.txt` for pip, `Pipfile.lock` for pipenv or `poetry.lock` for poetry) in the repository, and uses its hash as a part of the cache key. Input `cache-dependency-path` is used for cases when multiple dependency files are used, they are located in different subdirectories or different files for the hash want to be used.

 - For `pip`, the action will cache global cache directory
 - For `pipenv`, the action will cache virtualenv directory
 - For `poetry`, the action will cache virtualenv directory

**Caching pip dependencies:**

```yaml
steps:
- uses: actions/checkout@v3
- uses: actions/setup-python@v4
  with:
    python-version: '3.9'
    cache: 'pip' # caching pip dependencies
- run: pip install -r requirements.txt
```
>**Note:** Restored cache will not be used if the requirements.txt file is not updated for a long time and a newer version of the dependency is available that can lead to an increase in total build time.

>The requirements file format allows to specify dependency versions using logical operators (for example chardet>=3.0.4) or specify dependencies without any versions. In this case the pip install -r requirements.txt command will always try to install the latest available package version. To be sure that the cache will be used, please stick to a specific dependency version and update it manually if necessary.

See examples of using `cache` and `cache-dependency-path` for `pipenv` and `poetry` in the section: [Caching packages data](docs/advanced-usage.md#caching-packages-data) of the [Advanced usage](docs/advanced-usage.md) guide.

## Advanced usage

- [Using python-version input](docs/advanced-usage.md#using-python-version-input)
- [Using python-version-file input](docs/advanced-usage.md#using-python-version-file-input)
- [Check latest version](docs/advanced-usage.md#check-latest-version)
- [Caching packages data](docs/advanced-usage.md#caching-packages-data)
- [Environment variables and action's outputs](docs/advanced-usage.md#environment-variables-and-actions-outputs)
- [Available versions of Python and PyPy](docs/advanced-usage.md#available-versions-of-python-and-pypy)
- [Hosted tool cache](docs/advanced-usage.md#hosted-tool-cache) 
- [Using `setup-python` with a self hosted runner](docs/advanced-usage.md#using-setup-python-with-a-self-hosted-runner)
- [Using `setup-python` on GHES](docs/advanced-usage.md#using-setup-python-on-ghes)

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).

## Contributions

Contributions are welcome! See our [Contributor's Guide](docs/contributors.md).