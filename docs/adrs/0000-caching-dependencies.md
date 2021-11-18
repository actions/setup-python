## 0. Caching dependencies

Date: 2021-10-01

Status: Accepted

## Context

`actions/setup-python` is one the most popular python's action in GitHub Actions. A lot of customers use it in conjunction with `actions/cache` to speed up dependencies installation.
See more examples on proper usage in [actions/cache documentation](https://github.com/actions/cache/blob/main/examples.md#python---pip).

## Goals & Anti-Goals

Integration of caching functionality into `actions/setup-python` action will bring the following benefits for action users:
 - Decrease the entry threshold for using the cache for Python dependencies and simplify initial configuration
 - Simplify YAML pipelines by reducing the need for additional steps to enable caching
 - More users will use caching for Python so users will have faster builds!

We will add support for Pip and Pipenv dependency caching.

We won't pursue the goal to provide wide customization of caching in the scope of `actions/setup-python` action. The purpose of this integration is to cover ~90% of basic use-cases. If users need flexible customization, we will advise them to use `actions/cache` directly.

## Decision

 - Add a `cache` input parameter to `actions/setup-python`. For now the input will accept the following values:
    - pip - enable caching for pip dependencies
    - pipenv - enable caching for pipenv dependencies
    - '' - disable caching (default value)
 - Cache feature will be disabled by default to make sure that we don't break existing customers.
 - Action will try to search dependencies files (requirements.txt for pip and Pipfile.lock for pipenv) in the repository root (or relative to the repository root, if patterns are used) and throw error if no one is found.
 - The hash of found file will be used as part of cache key (the same approach like actions/cache recommends)
 - The following cache key will be used for pip: `setup-python-${{ runner.os }}-pip-${{ hashFiles('<package-file-path>') }}`
 - The following cache key will be used for pipenv: `setup-python-${{ runner.os }}-python-${{ python-version }}-pipenv-${{ hashFiles('<package-file-path>') }}`. We add the python version to the cache key because the created virtualenv folder with the project name contains a copy of the python binary as a symlink to paths like `/opt/hostedtoolcache/Python/3.7.11`, so the cache can be fetched with a wrong python version. See details in the related [pull request](https://github.com/actions/cache/pull/607) in the actions/cache.
 - Action will save the packages global cache:
    - Pip (retrieved via pip cache dir). The command is available With pip 20.1 or later. We always update pip during installation, that is why this command should be available.
    - Pipenv (default cache paths):
        - ~/.local/share/virtualenvs (macOS)
        - ~/.virtualenvs (Windows)
        - ~/.local/share/virtualenvs (Ubuntu)
 - Add a `cache-dependency-path` input parameter to `actions/setup-python`. The new input will accept an array or regex of dependency files. The field will accept a path (relative to the repository root) to dependency files. If the provided path contains wildcards, the action will search all matching files and calculate a common hash like the `${{ hashFiles('**/requirements-dev.txt') }}` YAML construction does

## Example of real use-cases

 - Pip package manager

```
steps:
- uses: actions/checkout@v2
- uses: actions/setup-python@v2
  with:
    python-version: 3.9
    cache: pip
```

 - Pipenv package manager

```
steps:
- uses: actions/checkout@v2
- uses: actions/setup-python@v2
  with:
    python-version: 3.9
    cache: pipenv
```
- With `cache-dependency-path`

```
steps:
- uses: actions/checkout@v2
- uses: actions/setup-python@v2
  with:
    python-version: 3.9
    cache: pip
    cache-dependency-path: |
        **/requirements-dev.txt
        **/requirements-test.txt
        **/requirements.txt
```


```
steps:
- uses: actions/checkout@v2
- uses: actions/setup-python@v2
  with:
    python-version: 3.9
    cache: pip
    cache-dependency-path: **/requirements-dev.txt
```

## Release process

As soon as the functionality is implemented, we will release a minor update of the action. No need to bump the major version since there are no breaking changes for existing users. After that, we will update [starter-workflows](https://github.com/actions/starter-workflows/blob/main/ci/python-app.yml) and [GitHub Action documentation](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-python#caching-dependencies).
