# setup-python

[![Basic validation](https://github.com/actions/setup-python/actions/workflows/basic-validation.yml/badge.svg?branch=main)](https://github.com/actions/setup-python/actions/workflows/basic-validation.yml)
[![Validate Python e2e](https://github.com/actions/setup-python/actions/workflows/test-python.yml/badge.svg?branch=main)](https://github.com/actions/setup-python/actions/workflows/test-python.yml)
[![Validate PyPy e2e](https://github.com/actions/setup-python/actions/workflows/test-pypy.yml/badge.svg?branch=main)](https://github.com/actions/setup-python/actions/workflows/test-pypy.yml)
[![e2e-cache](https://github.com/actions/setup-python/actions/workflows/e2e-cache.yml/badge.svg?branch=main)](https://github.com/actions/setup-python/actions/workflows/e2e-cache.yml)

This action provides the following functionality for GitHub Actions users:

- Installing a version of Python or PyPy and (by default) adding it to the PATH
- Optionally caching dependencies for pip, pipenv and poetry
- Registering problem matchers for error output

## Basic usage

See [action.yml](action.yml)

**Python**
```yaml
steps:
- uses: actions/checkout@v4
- uses: actions/setup-python@v5
  with:
    python-version: '3.13' 
- run: python my_script.py
```

**PyPy**
```yaml
steps:
- uses: actions/checkout@v4
- uses: actions/setup-python@v5 
  with:
    python-version: 'pypy3.10' 
- run: python my_script.py
```

**GraalPy**
```yaml
steps:
- uses: actions/checkout@v4
- uses: actions/setup-python@v5 
  with:
    python-version: 'graalpy-24.0' 
- run: python my_script.py
```

**Free threaded Python**
```yaml
steps:
- uses: actions/checkout@v4
- uses: actions/setup-python@v5
  with:
    python-version: '3.13t'
- run: python my_script.py
```

The `python-version` input is optional. If not supplied, the action will try to resolve the version from the default `.python-version` file. If the `.python-version` file doesn't exist Python or PyPy version from the PATH will be used. The default version of Python or PyPy in PATH varies between runners and can be changed unexpectedly so we recommend always setting Python version explicitly using the `python-version` or `python-version-file` inputs.

The action will first check the local [tool cache](docs/advanced-usage.md#hosted-tool-cache) for a [semver](https://github.com/npm/node-semver#versions) match. If unable to find a specific version in the tool cache, the action will attempt to download a version of Python from [GitHub Releases](https://github.com/actions/python-versions/releases) and for PyPy from the official [PyPy's dist](https://downloads.python.org/pypy/).

For information regarding locally cached versions of Python or PyPy on GitHub hosted runners, check out [GitHub Actions Runner Images](https://github.com/actions/runner-images).

## Supported version syntax

The `python-version` input supports the [Semantic Versioning Specification](https://semver.org/) and some special version notations (e.g. `semver ranges`, `x.y-dev syntax`, etc.), for detailed examples please refer to the section: [Using python-version input](docs/advanced-usage.md#using-the-python-version-input) of the [Advanced usage](docs/advanced-usage.md) guide.

## Supported architectures

Using the `architecture` input, it is possible to specify the required Python or PyPy interpreter architecture: `x86`, `x64`, or `arm64`. If the input is not specified, the architecture defaults to the host OS architecture.

## Caching packages dependencies

The action has built-in functionality for caching and restoring dependencies. It uses [toolkit/cache](https://github.com/actions/toolkit/tree/main/packages/cache) under the hood for caching dependencies but requires less configuration settings. Supported package managers are `pip`, `pipenv` and `poetry`. The `cache` input is optional, and caching is turned off by default.

The action defaults to searching for a dependency file (`requirements.txt` or `pyproject.toml` for pip, `Pipfile.lock` for pipenv or `poetry.lock` for poetry) in the repository, and uses its hash as a part of the cache key. Input `cache-dependency-path` is used for cases when multiple dependency files are used, they are located in different subdirectories or different files for the hash that want to be used.

 - For `pip`, the action will cache the global cache directory
 - For `pipenv`, the action will cache virtualenv directory
 - For `poetry`, the action will cache virtualenv directories -- one for each poetry project found

**Caching pip dependencies:**

```yaml
steps:
- uses: actions/checkout@v4
- uses: actions/setup-python@v5
  with:
    python-version: '3.13'
    cache: 'pip' # caching pip dependencies
- run: pip install -r requirements.txt
```
>**Note:** Restored cache will not be used if the requirements.txt file is not updated for a long time and a newer version of the dependency is available which can lead to an increase in total build time.

>The requirements file format allows for specifying dependency versions using logical operators (for example chardet>=3.0.4) or specifying dependencies without any versions. In this case the pip install -r requirements.txt command will always try to install the latest available package version. To be sure that the cache will be used, please stick to a specific dependency version and update it manually if necessary.

See examples of using `cache` and `cache-dependency-path` for `pipenv` and `poetry` in the section: [Caching packages](docs/advanced-usage.md#caching-packages) of the [Advanced usage](docs/advanced-usage.md) guide.

## Advanced usage

- [Using the python-version input](docs/advanced-usage.md#using-the-python-version-input)
- [Using the python-version-file input](docs/advanced-usage.md#using-the-python-version-file-input)
- [Check latest version](docs/advanced-usage.md#check-latest-version)
- [Caching packages](docs/advanced-usage.md#caching-packages)
- [Outputs and environment variables](docs/advanced-usage.md#outputs-and-environment-variables)
- [Available versions of Python, PyPy and GraalPy](docs/advanced-usage.md#available-versions-of-python-pypy-and-graalpy)
- [Hosted tool cache](docs/advanced-usage.md#hosted-tool-cache) 
- [Using `setup-python` with a self-hosted runner](docs/advanced-usage.md#using-setup-python-with-a-self-hosted-runner)
- [Using `setup-python` on GHES](docs/advanced-usage.md#using-setup-python-on-ghes)
- [Allow pre-releases](docs/advanced-usage.md#allow-pre-releases)
- [Using the pip-version input](docs/advanced-usage.md#using-the-pip-version-input)

## Recommended permissions

When using the `setup-python` action in your GitHub Actions workflow, it is recommended to set the following permissions to ensure proper functionality:

```yaml
permissions:
  contents: read # access to check out code and install dependencies
```

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).

## Contributions

Contributions are welcome! See our [Contributor's Guide](docs/contributors.md).
