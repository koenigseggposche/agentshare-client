#!/usr/bin/env python3
"""Run a local prerelease build with the retained test identity."""
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys


def main():
    if sys.platform != "darwin" or len(sys.argv) < 2:
        raise SystemExit("Usage (macOS): python3 scripts/with-macos-test-signing.py <command> [args...]")
    config_path = Path.home() / "Documents/agentshare/dev/macos-test-signing.json"
    if config_path.stat().st_mode & 0o077:
        raise SystemExit("Test signing configuration must be private (chmod 600).")
    config = json.loads(config_path.read_text())
    identity = config["identity_sha1"]
    keychain = str(Path(config["keychain"]).resolve(strict=True))
    if not re.fullmatch(r"[a-fA-F0-9]{40}", identity):
        raise SystemExit("Invalid test signing certificate fingerprint.")

    def security(*args):
        result = subprocess.run(["security", *args], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError("Test signing keychain operation failed: " + args[0])
        return result.stdout

    with config_path.open() as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        original = shlex.split(security("list-keychains", "-d", "user"))
        security("unlock-keychain", "-p", config["password"], keychain)
        try:
            security("list-keychains", "-d", "user", "-s", *dict.fromkeys([*original, keychain]))
            env = dict(os.environ, AGENTSHARE_TEST_SIGNING_IDENTITY=identity,
                       AGENTSHARE_TEST_SIGNING_KEYCHAIN=keychain)
            return subprocess.run(sys.argv[1:], env=env).returncode
        finally:
            security("list-keychains", "-d", "user", "-s", *original)


if __name__ == "__main__":
    raise SystemExit(main())
