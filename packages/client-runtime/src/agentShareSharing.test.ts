import { describe, expect, it } from "vite-plus/test";
import { sharingSourceState } from "./agentShareSharing.ts";

const source = {
  key: "codex",
  service: "codex",
  installed: true,
  ready: true,
  connected: true,
  accepting: true,
};

describe("sharing source transitions", () => {
  it("keeps draining visible ahead of an open connection and a previous accepting snapshot", () => {
    expect(sharingSourceState({ ...source, draining: true })).toBe("draining");
    expect(sharingSourceState({ ...source, accepting: false })).toBe("paused");
  });
  it("distinguishes a configured source reconnecting from one ready to start", () => {
    expect(sharingSourceState({ ...source, connected: false, provider_id: "generated" })).toBe(
      "connecting",
    );
    expect(sharingSourceState({ ...source, connected: false, accepting: false })).toBe("ready");
    expect(
      sharingSourceState({
        ...source,
        connected: false,
        provider_id: "generated",
        error: "native_login_required",
      }),
    ).toBe("needs-attention");
  });
});
