import { isAgentShareModelConnection, type AgentShareModel } from "@t3tools/contracts";

export function modelConnectionSource(config: unknown): AgentShareModel["source"] | undefined {
  return isAgentShareModelConnection(config) ? config.agentShareModel.source : undefined;
}

export function isPaidModelConnection(config: unknown): boolean {
  const source = modelConnectionSource(config);
  return source === "community" || source === "owned";
}

export const PAID_AUTOMATION_BLOCKED =
  "Scheduled tasks and webhooks cannot use paid AgentShare model connections.";
