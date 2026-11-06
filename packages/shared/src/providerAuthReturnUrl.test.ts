import { describe, expect, it } from "vite-plus/test";
import { providerAuthReturnUrl } from "./providerAuthReturnUrl.ts";

describe("provider auth return destinations", () => {
  it.each(["agentshare-client", "agentshare-client-dev", "agentshare-client-preview"])(
    "returns to %s Welcome and the selected settings instance",
    (scheme) => {
      expect(providerAuthReturnUrl(`${scheme}://app/welcome?code=secret#agents:machine-id`)).toBe(
        `${scheme}://app/welcome#agents:machine-id`,
      );
      expect(
        providerAuthReturnUrl(`${scheme}://app/settings/providers?instanceId=work&code=secret`),
      ).toBe(`${scheme}://app/settings/providers?instanceId=work`);
    },
  );
  it.each([
    "agentshare-client://attacker/welcome",
    "agentshare-client://app/welcome/../evil",
    "https://attacker.example/welcome",
    "https://app.t3.codes/welcome",
  ])("rejects %s", (url) => expect(providerAuthReturnUrl(url)).toBeUndefined());
});
