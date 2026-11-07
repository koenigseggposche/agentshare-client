import { sha256 } from "@noble/hashes/sha2";
import { AgentShareWorkbenchTaskId } from "@t3tools/contracts";
import * as Hex from "effect/encoding/Hex";
import * as Schema from "effect/Schema";

const isBillingId = Schema.is(AgentShareWorkbenchTaskId);
const hashPrefix = "task-sha256:";

/** Keep existing ledger keys and encode run IDs that the billing protocol cannot carry. */
export function agentShareTaskId(runId: string): string {
  if (isBillingId(runId) && !runId.startsWith(hashPrefix)) return runId;
  return hashPrefix + Hex.encode(sha256(new TextEncoder().encode(runId)));
}
