import { createFileRoute } from "@tanstack/react-router";
import { AgentShareSettings } from "../components/agentshare/AgentShareSettings";

export const Route = createFileRoute("/_chat/settings/agentshare")({
  component: AgentShareSettings,
});
