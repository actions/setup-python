# Contributors

### Checkin

- Do check in source (`src/`)
- Do check in a single `index.js` file after running `ncc`
- Do not check in `node_modules/`

### NCC

In order to avoid uploading `node_modules/` to the repository, we use [zeit/ncc](https://github.com/zeit/ncc) to create a single `index.js` file that gets saved in `dist/`.

### Developing

If you're developing locally, you can run
```
npm install
tsc
ncc build src/setup-python.ts
```
Any files generated using `tsc` will be added to `lib/`, however those files also are not uploaded to the repository and are exluded using `.gitignore`.

During the commit step, Husky will take care of formatting all files with [Prettier](https://github.com/prettier/prettier) (to run manually, use `prettier --write **/*.ts`).

### Testing

We ask that you include a link to a successful run that utilizes the changes you are working on. For example, if your changes are in the branch `newAwesomeFeature`, then show an example run that uses `setup-python@newAwesomeFeature` or `my-fork@newAwesomeFeature`. This will help speed up testing and help us confirm that there are no breaking changes or bugs.

### Releases

There is a `master` branch where contributor changes are merged into. There are also release branches such as `releases/v1` that are used for tagging (for example the `v1` tag) and publishing new versions of the action. Changes from `master` are periodically merged into a releases branch. You do not need to create any PR that merges changes from master into a releases branch.
