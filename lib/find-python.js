"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
let cacheDirectory = process.env['RUNNER_TOOLSDIRECTORY'] || '';
if (!cacheDirectory) {
    let baseLocation;
    if (process.platform === 'win32') {
        // On windows use the USERPROFILE env variable
        baseLocation = process.env['USERPROFILE'] || 'C:\\';
    }
    else {
        if (process.platform === 'darwin') {
            baseLocation = '/Users';
        }
        else {
            baseLocation = '/home';
        }
    }
    cacheDirectory = path.join(baseLocation, 'actions', 'cache');
}
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const IS_WINDOWS = process.platform === 'win32';
// Python has "scripts" or "bin" directories where command-line tools that come with packages are installed.
// This is where pip is, along with anything that pip installs.
// There is a seperate directory for `pip install --user`.
//
// For reference, these directories are as follows:
//   macOS / Linux:
//      <sys.prefix>/bin (by default /usr/local/bin, but not on hosted agents -- see the `else`)
//      (--user) ~/.local/bin
//   Windows:
//      <Python installation dir>\Scripts
//      (--user) %APPDATA%\Python\PythonXY\Scripts
// See https://docs.python.org/3/library/sysconfig.html
function binDir(installDir) {
    if (IS_WINDOWS) {
        return path.join(installDir, 'Scripts');
    }
    else {
        return path.join(installDir, 'bin');
    }
}
// Note on the tool cache layout for PyPy:
// PyPy has its own versioning scheme that doesn't follow the Python versioning scheme.
// A particular version of PyPy may contain one or more versions of the Python interpreter.
// For example, PyPy 7.0 contains Python 2.7, 3.5, and 3.6-alpha.
// We only care about the Python version, so we don't use the PyPy version for the tool cache.
function usePyPy(majorVersion, architecture) {
    const findPyPy = tc.find.bind(undefined, 'PyPy', majorVersion.toString());
    let installDir = findPyPy(architecture);
    if (!installDir && IS_WINDOWS) {
        // PyPy only precompiles binaries for x86, but the architecture parameter defaults to x64.
        // On Hosted VS2017, we only install an x86 version.
        // Fall back to x86.
        installDir = findPyPy('x86');
    }
    if (!installDir) {
        // PyPy not installed in $(Agent.ToolsDirectory)
        throw new Error(`PyPy ${majorVersion} not found`);
    }
    // For PyPy, Windows uses 'bin', not 'Scripts'.
    const _binDir = path.join(installDir, 'bin');
    // On Linux and macOS, the Python interpreter is in 'bin'.
    // On Windows, it is in the installation root.
    const pythonLocation = IS_WINDOWS ? installDir : _binDir;
    core.exportVariable('pythonLocation', pythonLocation);
    core.addPath(installDir);
    core.addPath(_binDir);
}
function useCpythonVersion(version, architecture) {
    return __awaiter(this, void 0, void 0, function* () {
        const desugaredVersionSpec = desugarDevVersion(version);
        const semanticVersionSpec = pythonVersionToSemantic(desugaredVersionSpec);
        core.debug(`Semantic version spec of ${version} is ${semanticVersionSpec}`);
        const installDir = tc.find('Python', semanticVersionSpec, architecture);
        if (!installDir) {
            // Fail and list available versions
            const x86Versions = tc
                .findAllVersions('Python', 'x86')
                .map(s => `${s} (x86)`)
                .join(os.EOL);
            const x64Versions = tc
                .findAllVersions('Python', 'x64')
                .map(s => `${s} (x64)`)
                .join(os.EOL);
            throw new Error([
                `Version ${version} with arch ${architecture} not found`,
                'Available versions:',
                x86Versions,
                x64Versions
            ].join(os.EOL));
        }
        core.exportVariable('pythonLocation', installDir);
        core.addPath(installDir);
        core.addPath(binDir(installDir));
        if (IS_WINDOWS) {
            // Add --user directory
            // `installDir` from tool cache should look like $AGENT_TOOLSDIRECTORY/Python/<semantic version>/x64/
            // So if `findLocalTool` succeeded above, we must have a conformant `installDir`
            const version = path.basename(path.dirname(installDir));
            const major = semver.major(version);
            const minor = semver.minor(version);
            const userScriptsDir = path.join(process.env['APPDATA'] || '', 'Python', `Python${major}${minor}`, 'Scripts');
            core.addPath(userScriptsDir);
        }
        // On Linux and macOS, pip will create the --user directory and add it to PATH as needed.
    });
}
/** Convert versions like `3.8-dev` to a version like `>= 3.8.0-a0`. */
function desugarDevVersion(versionSpec) {
    if (versionSpec.endsWith('-dev')) {
        const versionRoot = versionSpec.slice(0, -'-dev'.length);
        return `>= ${versionRoot}.0-a0`;
    }
    else {
        return versionSpec;
    }
}
/**
 * Python's prelease versions look like `3.7.0b2`.
 * This is the one part of Python versioning that does not look like semantic versioning, which specifies `3.7.0-b2`.
 * If the version spec contains prerelease versions, we need to convert them to the semantic version equivalent.
 */
function pythonVersionToSemantic(versionSpec) {
    const prereleaseVersion = /(\d+\.\d+\.\d+)((?:a|b|rc)\d*)/g;
    return versionSpec.replace(prereleaseVersion, '$1-$2');
}
exports.pythonVersionToSemantic = pythonVersionToSemantic;
function findPythonVersion(version, architecture) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (version.toUpperCase()) {
            case 'PYPY2':
                return usePyPy(2, architecture);
            case 'PYPY3':
                return usePyPy(3, architecture);
            default:
                return yield useCpythonVersion(version, architecture);
        }
    });
}
exports.findPythonVersion = findPythonVersion;
