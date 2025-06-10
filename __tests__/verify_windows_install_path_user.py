import os
import sys

def build_expected_path(architecture, freethreaded, major, minor):
    version_suffix = f"{major}{minor}"

    if architecture == "x86" and (major > 3 or (major == 3 and minor >= 10)):
        version_suffix += "-32"
    elif architecture == "arm64":
        version_suffix += "-arm64"

    if freethreaded == "true":
        version_suffix += "t"
        if architecture == "x86":
            version_suffix += "-32"
        elif architecture == "arm64":
            version_suffix += "-arm64"

    base_path = os.getenv("APPDATA", "")
    return os.path.join(base_path, "Python", f"Python{version_suffix}", "Scripts")

def main():
    # Expecting: -arch <architecture> -freethreaded <freethreaded>
    if len(sys.argv) != 5:
        print("Usage: python verify-windows-install-path.py -arch <architecture> -freethreaded <freethreaded>")
        sys.exit(1)

    args = dict(zip(sys.argv[1::2], sys.argv[2::2]))
    architecture = args.get('-arch')
    freethreaded = args.get('-freethreaded')

    # Get major and minor version from current Python
    major = sys.version_info.major
    minor = sys.version_info.minor

    expected_path = build_expected_path(architecture, freethreaded, major, minor)
    print(f"Expected PATH entry: {expected_path}")

    path_env = os.getenv("PATH", "")
    if expected_path.lower() not in path_env.lower():
        print("Expected path not found in PATH")
        sys.exit(1)
    else:
        print("Correct path present in PATH")
        print(f"Verified path: {expected_path}")

if __name__ == "__main__":
    main()