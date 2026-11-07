import { AgentShareWorkbenchTaskId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { agentShareTaskId } from "./agentShareTaskId.ts";

const isBillingId = Schema.is(AgentShareWorkbenchTaskId);

describe("agentShareTaskId", () => {
  it("preserves existing billing keys and maps URL-encoded MCP run IDs consistently", () => {
    const valid = "run:thread:generated:ordinal:1";
    const encoded = "run:thread:mcp%3Agenerated:ordinal:1";
    expect(agentShareTaskId(valid)).toBe(valid);
    const id = agentShareTaskId(encoded);
    expect(id).toMatch(/^task-sha256:[0-9a-f]{64}$/);
    expect(isBillingId(id)).toBe(true);
    expect(agentShareTaskId(encoded)).toBe(id);
    expect(agentShareTaskId(encoded.replace("ordinal:1", "ordinal:2"))).not.toBe(id);
    expect(agentShareTaskId(id)).not.toBe(id);
  });
});
