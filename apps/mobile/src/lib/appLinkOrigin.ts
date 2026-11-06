import Constants from "expo-constants";

export function nativeAppLinkOrigin(): string {
  const variant = Constants.expoConfig?.extra?.appVariant;
  return variant === "development"
    ? "agentshare-client-dev:"
    : variant === "preview"
      ? "agentshare-client-preview:"
      : "agentshare-client:";
}
