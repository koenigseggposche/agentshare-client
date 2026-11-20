// @effect-diagnostics nodeBuiltinImport:off - electron-builder invokes this Promise-based hook outside the Effect CLI runtime.
import { sign as signApplication, type SignOptions } from "@electron/osx-sign";
import * as NodeChildProcess from "node:child_process";
import * as NodeUtil from "node:util";

export default async function sign(options: SignOptions): Promise<void> {
  const identity = process.env.AGENTSHARE_TEST_SIGNING_IDENTITY;
  const keychain = process.env.AGENTSHARE_TEST_SIGNING_KEYCHAIN;
  const teamId = process.env.AGENTSHARE_TEST_SIGNING_TEAM_ID;
  if (
    !identity ||
    !/^[a-f0-9]{40}$/i.test(identity) ||
    !keychain ||
    !teamId ||
    !/^[A-Z0-9]{10}$/.test(teamId)
  ) {
    throw new Error("Run local test signing through scripts/with-macos-test-signing.py.");
  }
  // Resolve the search list in this process context before codesign builds the issuer chain.
  const { stdout } = await NodeUtil.promisify(NodeChildProcess.execFile)("security", [
    "list-keychains",
    "-d",
    "user",
  ]);
  if (!stdout.split("\n").some((line) => line.trim() === `"${keychain}"`)) {
    throw new Error("The temporary signing keychain is not in the user search list.");
  }
  await signApplication({
    ...options,
    identity,
    keychain,
    identityValidation: false,
    preAutoEntitlements: false,
    optionsForFile: (file, context) => ({
      ...options.optionsForFile?.(file, context),
      timestamp: "none",
    }),
    batchCodesignCalls: true,
  });
  await NodeUtil.promisify(NodeChildProcess.execFile)("codesign", [
    "--verify",
    "--deep",
    "--strict",
    `-R=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.1] exists and certificate leaf[field.1.2.840.113635.100.6.1.12] exists and certificate leaf[subject.OU] = "${teamId}"`,
    options.app,
  ]);
}
