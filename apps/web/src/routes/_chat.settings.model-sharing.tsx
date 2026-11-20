import { createFileRoute } from "@tanstack/react-router";
import { AgentShareHostSettings } from "../components/agentshare/AgentShareHostSettings";

export const Route = createFileRoute("/_chat/settings/model-sharing")({
  component: () => <AgentShareHostSettings section="sharing" />,
});
