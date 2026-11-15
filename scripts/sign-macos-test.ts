import { sign as signApplication, type SignOptions } from "@electron/osx-sign";

export default async function sign(options: SignOptions): Promise<void> {
  const identity = process.env.AGENTSHARE_TEST_SIGNING_IDENTITY;
  const keychain = process.env.AGENTSHARE_TEST_SIGNING_KEYCHAIN;
  if (!identity || !/^[a-f0-9]{40}$/i.test(identity) || !keychain) {
    throw new Error("Run local test signing through scripts/with-macos-test-signing.py.");
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
}
