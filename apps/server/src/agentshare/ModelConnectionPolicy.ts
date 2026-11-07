import { AgentShareModel } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isModelConnection = Schema.is(Schema.Struct({ agentShareModel: AgentShareModel }));

export function modelConnectionSource(config: unknown): AgentShareModel["source"] | undefined {
  return isModelConnection(config) ? config.agentShareModel.source : undefined;
}

export function isPaidModelConnection(config: unknown): boolean {
  const source = modelConnectionSource(config);
  return source === "community" || source === "owned";
}

export const PAID_AUTOMATION_BLOCKED =
  "Scheduled tasks and webhooks cannot use paid AgentShare model connections.";
