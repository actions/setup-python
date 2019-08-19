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
const core = __importStar(require("@actions/core"));
const finder = __importStar(require("./find-python"));
const path = __importStar(require("path"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let version = core.getInput('version');
            if (!version) {
                version = core.getInput('python-version');
            }
            if (version) {
                const arch = core.getInput('architecture', { required: true });
                yield finder.findPythonVersion(version, arch);
            }
            const matchersPath = path.join(__dirname, '..', '.github');
            console.log(`##[add-matcher]${path.join(matchersPath, 'python.json')}`);
        }
        catch (err) {
            core.setFailed(err.message);
        }
    });
}
run();
