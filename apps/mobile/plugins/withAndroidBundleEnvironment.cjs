const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// AgentShare bundle environment inputs";

module.exports = function withAndroidBundleEnvironment(config) {
  return withAppBuildGradle(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "groovy") {
      throw new Error("withAndroidBundleEnvironment requires a Groovy app build.gradle.");
    }
    if (!nextConfig.modResults.contents.includes(MARKER)) {
      nextConfig.modResults.contents += `
${MARKER}
tasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {
    inputs.property("agentShareConsoleUrl", providers.environmentVariable("EXPO_PUBLIC_AGENTSHARE_CONSOLE_URL").orElse(""))
    inputs.property("agentShareAppVariant", providers.environmentVariable("APP_VARIANT").orElse(""))
}
`;
    }
    return nextConfig;
  });
};
