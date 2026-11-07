import { assert, describe, it } from "@effect/vitest";
import type {
  AgentShareModel,
  AgentShareHostIdentity,
  AgentShareModelInfo,
} from "@t3tools/contracts";
import { nativeModelSnapshot } from "./NativeProvider.ts";

const identity: AgentShareHostIdentity = {
  api_version: 1,
  owner: "generated-owner",
  device_id: "generated-device",
  paired: true,
  stopping: false,
  features: [],
  version: "generated",
  revision: "generated",
};
describe.each(["codex", "claude"] as const)("AgentShare %s inventory", (runtime) => {
  const selected: AgentShareModel = {
    id: "generated",
    source: "community",
    service: runtime,
    runtime,
  };
  const model: AgentShareModelInfo = {
    model: selected,
    name: "Generated",
    available: true,
    runtimes: [runtime],
    subagents: true,
    search: false,
  };

  it("only exposes the selected source and hides it after an account change", () => {
    const snapshot = (host: AgentShareHostIdentity, entries: AgentShareModelInfo[]) =>
      nativeModelSnapshot({
        selected,
        owner: identity.owner,
        identity: host,
        catalog: { models: entries, diagnostics: [] },
        tools: { installed: true, version: "generated" },
        enabled: true,
        checkedAt: "2026-11-05T00:00:00Z",
      });
    const ready = snapshot(identity, [
      { ...model, model: { ...selected, source: "owned", device: "generated-host" } },
      model,
    ]);
    assert.deepEqual(
      ready.models.map((item) => item.slug),
      [selected.id],
    );
    assert.equal(ready.auth.status, "authenticated");
    assert.isFalse(ready.supportsTextGeneration);
    assert.deepEqual(snapshot({ ...identity, owner: "different-owner" }, [model]).models, []);
    assert.deepEqual(
      snapshot(identity, [
        { ...model, model: { ...selected, source: "owned", device: "generated-host" } },
      ]).models,
      [],
    );
    assert.deepEqual(snapshot({ ...identity, paired: false }, [model]).models, []);
  });
  it("allows an available local model without an online account and requires the native runtime", () => {
    const local = { ...selected, source: "local" as const, service: "local" as const };
    const input = {
      selected: local,
      owner: "offline",
      identity: { ...identity, owner: "offline", paired: false },
      catalog: { models: [{ ...model, model: local }], diagnostics: [] },
      enabled: true,
      checkedAt: "2026-11-05T00:00:00Z",
    };
    assert.equal(nativeModelSnapshot({ ...input, tools: { installed: true } }).status, "ready");
    assert.deepEqual(nativeModelSnapshot({ ...input, tools: { installed: false } }).models, []);
  });
});
