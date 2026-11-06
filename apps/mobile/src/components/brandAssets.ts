import Constants from "expo-constants";

const appVariant = Constants.expoConfig?.extra?.appVariant;

export const AGENT_SHARE_BRAND_MARK_SOURCE =
  appVariant === "development"
    ? require("../../../../assets/agentshare/dev/ios-1024.png")
    : appVariant === "preview"
      ? require("../../../../assets/agentshare/nightly/ios-1024.png")
      : require("../../../../assets/agentshare/prod/ios-1024.png");
