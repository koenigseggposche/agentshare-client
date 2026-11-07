import { afterEach, expect, it, vi } from "vite-plus/test";

// Keep config parsing independent of local env files and build credentials.
vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () => ({
    APP_VARIANT: process.env.APP_VARIANT,
    ...(process.env.AGENTSHARE_EAS_OWNER !== undefined
      ? { AGENTSHARE_EAS_OWNER: process.env.AGENTSHARE_EAS_OWNER }
      : {}),
    ...(process.env.AGENTSHARE_EAS_PROJECT_ID !== undefined
      ? { AGENTSHARE_EAS_PROJECT_ID: process.env.AGENTSHARE_EAS_PROJECT_ID }
      : {}),
    T3CODE_IOS_PERSONAL_TEAM: process.env.T3CODE_IOS_PERSONAL_TEAM,
    T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID: process.env.T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID,
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

it("keeps personal-team signing within its own app identifier and supported capabilities", async () => {
  vi.stubEnv("T3CODE_IOS_PERSONAL_TEAM", "1");
  vi.stubEnv("T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID", "app.example.client.dev");
  const config = await loadConfig("development");
  expect(config.ios?.bundleIdentifier).toBe("app.example.client.dev");
  expect(config.ios?.associatedDomains).toBeUndefined();
  expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
    "$(AppIdentifierPrefix)app.example.client.dev",
  ]);
  expect(config.plugins).toContainEqual([
    "expo-notifications",
    expect.objectContaining({ enableRemoteNotifications: false }),
  ]);
  expect(config.plugins).toContainEqual([
    "@clerk/expo",
    expect.objectContaining({ appleSignIn: false }),
  ]);
  expect(
    config.plugins?.some((plugin) => Array.isArray(plugin) && plugin[0] === "expo-widgets"),
  ).toBe(false);
});

async function loadConfig(variant: string | undefined) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  return (await import("./app.config.ts")).default;
}

it.each(["prod", ""])("rejects APP_VARIANT=%j before selecting production IDs", async (value) => {
  await expect(loadConfig(value)).rejects.toThrow(
    "APP_VARIANT must be development, preview, or production.",
  );
});

it.each([
  [undefined, "app.agentshare.client"],
  ["development", "app.agentshare.client.dev"],
  ["preview", "app.agentshare.client.preview"],
  ["production", "app.agentshare.client"],
])("keeps the iOS and Android identifiers for APP_VARIANT=%j", async (value, identifier) => {
  const config = await loadConfig(value);
  expect(config.ios?.bundleIdentifier).toBe(identifier);
  expect(config.android?.package).toBe(identifier);
  expect(config.ios?.associatedDomains).toEqual([]);
  expect(config.android?.intentFilters).toEqual([]);
  expect(config.ios?.appleTeamId).toBeUndefined();
  expect(config.updates).toEqual({ enabled: false, checkAutomatically: "NEVER" });
  expect(config.extra?.eas?.projectId).toBeUndefined();
  expect(config.owner).toBeUndefined();
});

it("links a configured EAS project without enabling over-the-air updates", async () => {
  vi.stubEnv("AGENTSHARE_EAS_OWNER", "example-owner");
  vi.stubEnv("AGENTSHARE_EAS_PROJECT_ID", " 7f6c0158-018a-43a2-91ef-0a231f77e73f ");
  const config = await loadConfig("preview");
  expect(config.owner).toBe("example-owner");
  expect(config.extra?.eas?.projectId).toBe("7f6c0158-018a-43a2-91ef-0a231f77e73f");
  expect(config.updates).toEqual({ enabled: false, checkAutomatically: "NEVER" });
});

it.each([
  ["example-owner", undefined],
  [undefined, "7f6c0158-018a-43a2-91ef-0a231f77e73f"],
  ["example-owner", "invalid"],
])("rejects incomplete or malformed EAS project configuration", async (owner, projectId) => {
  vi.stubEnv("AGENTSHARE_EAS_OWNER", owner);
  vi.stubEnv("AGENTSHARE_EAS_PROJECT_ID", projectId);
  await expect(loadConfig("preview")).rejects.toThrow(
    "Set both AGENTSHARE_EAS_OWNER and AGENTSHARE_EAS_PROJECT_ID (a UUID).",
  );
});
