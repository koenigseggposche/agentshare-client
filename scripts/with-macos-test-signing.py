"""Run a Dev macOS build with an Apple Development identity in a temporary keychain."""
import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import sys
import tempfile


def private_file(path):
    path = Path(path).expanduser()
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise ValueError("Signing material must be an owned private regular file.")
    return path.resolve()


def configuration(path):
    config = json.loads(private_file(path).read_text())
    if set(config) != {"certificate_file", "password", "identity_sha1", "team_id"}:
        raise ValueError("Expected the retained Apple Development signing configuration.")
    if not re.fullmatch(r"[a-fA-F0-9]{40}", config["identity_sha1"]) or not re.fullmatch(r"[A-Z0-9]{10}", config["team_id"]):
        raise ValueError("Invalid development signing identity or Team ID.")
    if not isinstance(config["password"], str) or not config["password"] or "\x00" in config["password"]:
        raise ValueError("Invalid signing archive password.")
    config["certificate_file"] = str(private_file(config["certificate_file"]))
    return config


def require_identity(output, expected):
    identities = re.findall(r'^\s*\d+\) ([A-Fa-f0-9]{40}) "([^"]+)"\s*$', output, re.MULTILINE)
    if len(identities) != 1 or identities[0][0].lower() != expected.lower() or not identities[0][1].startswith("Apple Development: "):
        raise ValueError("The archive must contain exactly the retained valid Apple Development identity.")


def security(*args):
    result = subprocess.run(["security", *args], capture_output=True, text=True)
    if result.returncode:
        raise ValueError("Development signing keychain operation failed: " + args[0])
    return result.stdout


@contextlib.contextmanager
def signing_environment(config):
    original = shlex.split(security("list-keychains", "-d", "user"))
    with tempfile.TemporaryDirectory() as temporary:
        keychain = str(Path(temporary).resolve() / "development.keychain-db")
        password = secrets.token_urlsafe(32)
        security("create-keychain", "-p", password, keychain)
        try:
            security("unlock-keychain", "-p", password, keychain)
            security("import", config["certificate_file"], "-k", keychain, "-P", config["password"], "-T", "/usr/bin/codesign")
            # This ACL applies only to the imported build key in this ephemeral keychain.
            security("set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychain)
            security("list-keychains", "-d", "user", "-s", keychain, *original)
            require_identity(security("find-identity", "-v", "-p", "codesigning", keychain), config["identity_sha1"])
            environment = dict(os.environ, AGENTSHARE_TEST_SIGNING_IDENTITY=config["identity_sha1"],
                               AGENTSHARE_TEST_SIGNING_KEYCHAIN=keychain, AGENTSHARE_TEST_SIGNING_TEAM_ID=config["team_id"])
            environment.pop("AGENTSHARE_MACOS_DEVELOPMENT_CONFIG", None)
            yield environment
        finally:
            try:
                security("list-keychains", "-d", "user", "-s", *original)
            finally:
                security("delete-keychain", keychain)


def main():
    if sys.platform != "darwin" or len(sys.argv) < 2:
        raise SystemExit("Usage (macOS): python3 scripts/with-macos-test-signing.py <command> [args...]")
    path = os.environ.get("AGENTSHARE_MACOS_DEVELOPMENT_CONFIG") or Path.home() / "Documents/agentshare/dev/macos-development-signing.json"
    with private_file(path).open() as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with signing_environment(configuration(path)) as environment:
            return subprocess.run(sys.argv[1:], env=environment).returncode


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError):
        raise SystemExit("Development signing failed; verify the private configuration and Apple Development identity.") from None
