"""Credential boundary checks; no real keys or account exports are used."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("signing", Path(__file__).with_name("with-macos-test-signing.py"))
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


class SigningBoundaryTests(unittest.TestCase):
    def test_restores_search_list_and_deletes_temporary_keychain_on_failure(self):
        calls = []

        def security(*args):
            calls.append(args)
            if args == ("list-keychains", "-d", "user"):
                return '"/original/login.keychain-db"'
            if args[0] == "find-identity":
                return "0 valid identities found"
            return ""

        config = dict(certificate_file="generated.p12", password="generated", identity_sha1="a" * 40, team_id="ABCDEFGHIJ")
        with patch.object(signing, "security", side_effect=security):
            with self.assertRaises(ValueError):
                with signing.signing_environment(config):
                    self.fail("An invalid identity must not reach the build.")
        self.assertEqual(calls[-2], ("list-keychains", "-d", "user", "-s", "/original/login.keychain-db"))
        self.assertEqual(calls[-1][0], "delete-keychain")
        self.assertEqual(calls[-1][1], calls[1][-1])

    def test_rejects_changed_ambiguous_or_non_apple_identity(self):
        fingerprint = "a" * 40
        valid = f'  1) {fingerprint.upper()} "Apple Development: Generated (DEMO)"\n 1 valid identities found'
        signing.require_identity(valid, fingerprint)
        for output in (valid.replace("a".upper() * 40, "b" * 40),
                       valid.replace("Apple Development: ", "Local Test Signing "),
                       valid.replace("Apple Development: ", "Developer ID Application: "),
                       valid + f'\n  2) {"b" * 40} "Apple Development: Other"',
                       "0 valid identities found"):
            with self.subTest(output=output), self.assertRaises(ValueError):
                signing.require_identity(output, fingerprint)

    def test_requires_private_regular_material_and_valid_team(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "generated.p12"
            archive.write_bytes(b"generated fixture; not a certificate")
            archive.chmod(0o600)
            config = root / "config.json"
            value = dict(certificate_file=str(archive), password="generated", identity_sha1="a" * 40, team_id="ABCDEFGHIJ")
            config.write_text(json.dumps(value))
            config.chmod(0o600)
            self.assertEqual(signing.configuration(config)["team_id"], "ABCDEFGHIJ")
            for mode in (0o644, 0o640):
                archive.chmod(mode)
                with self.assertRaises(ValueError):
                    signing.configuration(config)
            archive.chmod(0o600)
            link = root / "link.p12"
            link.symlink_to(archive)
            for change in ({"certificate_file": str(link)}, {"team_id": 'TEAM" or true'}, {"identity_sha1": "not-a-fingerprint"}, {"password": ""}):
                config.write_text(json.dumps(value | change))
                with self.assertRaises(ValueError):
                    signing.configuration(config)


if __name__ == "__main__":
    unittest.main()
