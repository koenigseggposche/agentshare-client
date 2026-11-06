import * as Cause from "effect/Cause";
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  AgentShareModelManager,
  AgentShareCommandInput,
  AgentShareCoreError,
} from "@t3tools/contracts";
import {
  modelManagerEntries,
  parseModelBudget,
  modelOperationPresentation,
  modelOperationSubmissionState,
} from "./agentShareModelManager.ts";

const model = {
  id: "generated-model",
  name: "Example model",
  description: "Generated fixture",
  license: "MIT",
  share_allowed: true,
  minimum_ram_bytes: 1024 ** 3,
  artifact: { bytes: 2048 },
};
const empty: AgentShareModelManager = {
  library_path: "/generated/models",
  catalog_fresh: false,
  catalog: { models: null },
  state: {
    budget: { ram_bytes: 4 * 1024 ** 3, max_concurrent: 2 },
    tasks: null,
    installations: null,
    runtimes: null,
  },
  remote_access: null,
};

describe("model management state across clients", () => {
  it("accepts an uninitialized Core catalog and strips artifact locations", () => {
    const decode = Schema.decodeUnknownSync(AgentShareModelManager);
    expect(modelManagerEntries(decode(empty), "zh")).toEqual([]);
    const decoded = decode({
      ...empty,
      catalog: {
        models: [
          {
            ...model,
            artifact: {
              bytes: 2048,
              url: "https://example.invalid/private-artifact",
              sha256: "generated",
            },
          },
        ],
      },
    });
    expect(decoded.catalog.models?.[0]?.artifact).toEqual({ bytes: 2048 });
    const sharded = {
      ...empty,
      catalog: { models: [{ ...model, shards: [{ artifact: { bytes: 1024 } }] }] },
    };
    expect(modelManagerEntries(sharded, "en")[0]?.details).toContain("3.0 KiB");
    expect(() =>
      decode({
        ...empty,
        state: {
          ...empty.state,
          tasks: { bad: { id: "bad", state: "downloading", bytes: -1, total: 100 } },
        },
      }),
    ).toThrow();
  });
  it("keeps interrupted downloads resumable only with a fresh catalog and shows in-flight controls", () => {
    const data = {
      ...empty,
      catalog: { models: [model] },
      state: {
        ...empty.state,
        tasks: { [model.id]: { id: model.id, state: "paused", bytes: 1024, total: 2048 } },
      },
    };
    expect(modelManagerEntries(data, "en")[0]?.actions.map((item) => item.input)).toEqual([
      { operation: "cancelDownload", target: model.id },
    ]);
    expect(
      modelManagerEntries({ ...data, catalog_fresh: true }, "en")[0]?.actions.map(
        (item) => item.input,
      ),
    ).toEqual([
      { operation: "resumeDownload", target: model.id },
      { operation: "cancelDownload", target: model.id },
    ]);
    expect(
      modelManagerEntries(
        {
          ...data,
          state: {
            ...data.state,
            tasks: { [model.id]: { id: model.id, bytes: 1024, total: 2048, state: "downloading" } },
          },
        },
        "en",
      )[0]?.actions.map((item) => item.input.operation),
    ).toEqual(["pauseDownload", "cancelDownload"]);
  });
  it("retains installed models after catalog removal and prevents deletion while resident", () => {
    const installed = {
      ...empty,
      state: { ...empty.state, installations: { [model.id]: { model } } },
    };
    expect(
      modelManagerEntries(installed, "en")[0]?.actions.map((item) => item.input.operation),
    ).toEqual(["startModel", "removeModel"]);
    const running = {
      ...installed,
      state: {
        ...installed.state,
        runtimes: {
          [model.id]: { state: "ready", reserved_ram_bytes: 1024, active_requests: 1, queued: 2 },
        },
      },
      remote_access: { [model.id]: { visibility: "community", connected: true } },
    };
    const inputs = modelManagerEntries(running, "en")[0]?.actions.map((item) => item.input);
    expect(inputs).toEqual([
      { operation: "stopModel", target: model.id },
      { operation: "modelSharing", body: { id: model.id, visibility: "off" } },
      { operation: "modelSharing", body: { id: model.id, visibility: "owner_only" } },
    ]);
    expect(
      modelManagerEntries(
        {
          ...running,
          state: {
            ...running.state,
            runtimes: {
              [model.id]: {
                reserved_ram_bytes: 1024,
                active_requests: 1,
                queued: 2,
                state: "draining",
              },
            },
          },
        },
        "en",
      )[0]?.actions,
    ).toEqual([]);
  });
  it("parses binary resource units without accepting incomplete or unbounded input", () => {
    expect(parseModelBudget("0.25", "0", "8")).toEqual({
      ram_bytes: 256 * 1024 ** 2,
      vram_bytes: 0,
      max_concurrent: 8,
    });
    for (const [ram, vram, count] of [
      ["0.24", "0", "2"],
      ["", "0", "2"],
      ["1e3", "0", "2"],
      ["1", "-1", "2"],
      ["1", "0", "9"],
      ["1", "0", "1.5"],
      ["999999999999999999999", "0", "2"],
    ] as const)
      expect(parseModelBudget(ram, vram, count)).toBeUndefined();
  });
});

describe("durable library operation presentation", () => {
  const operation = {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "move" as const,
    path: "/generated/new-library",
    state: "running" as const,
    stage: "copying",
    bytes: 1024,
    total: 2048,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:01Z",
  };
  it("only offers cancellation before the commit boundary", () => {
    expect(modelOperationPresentation(operation, "en")).toMatchObject({
      canCancel: true,
      progress: "Copying files · 1.0 KiB / 2.0 KiB",
    });
    for (const stage of ["committing", "cleaning"])
      expect(modelOperationPresentation({ ...operation, stage }, "en").canCancel).toBe(false);
    for (const state of ["cancelling", "succeeded", "failed", "cancelled", "interrupted"] as const)
      expect(modelOperationPresentation({ ...operation, state }, "zh").canCancel).toBe(false);
    const failed = modelOperationPresentation(
      { ...operation, state: "failed", error: "generated private error /private/path" },
      "en",
    );
    expect(JSON.stringify(failed)).not.toContain("/private/path");
    expect(failed.progress).toBeUndefined();
  });
  it("requires a client operation ID and owner instead of accepting an untracked import", () => {
    const decode = Schema.decodeUnknownSync(AgentShareCommandInput);
    expect(() =>
      decode({
        operation: "importModel",
        body: { id: "example-model", directory: "/generated/package" },
      }),
    ).toThrow();
    expect(
      decode({
        operation: "importModel",
        body: {
          id: operation.id,
          owner: "offline",
          kind: "import",
          path: "/generated/package",
          model_id: "example-model",
        },
      }),
    ).toMatchObject({ body: { id: operation.id, owner: "offline", kind: "import" } });
  });
});

it("lets a rejected library request be corrected without treating it as an unknown execution", () => {
  const failed = (category: AgentShareCoreError["category"], status?: number) => ({
    _tag: "Failure" as const,
    cause: Cause.fail(
      new AgentShareCoreError({
        operation: "moveLibrary",
        category,
        ...(status === undefined ? {} : { status }),
      }),
    ),
  });
  expect(modelOperationSubmissionState({ _tag: "Success" })).toBe("accepted");
  expect(modelOperationSubmissionState(failed("rejected", 400))).toBe("rejected");
  expect(modelOperationSubmissionState(failed("denied", 403))).toBe("rejected");
  expect(modelOperationSubmissionState(failed("rejected", 503))).toBe("unknown");
  expect(modelOperationSubmissionState(failed("outcome-unknown"))).toBe("unknown");
  expect(modelOperationSubmissionState(failed("invalid-response"))).toBe("unknown");
  expect(modelOperationSubmissionState(null)).toBe("unknown");
});
