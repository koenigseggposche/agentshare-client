import { createFileRoute } from "@tanstack/react-router";
import { AgentShareSettings } from "../components/agentshare/AgentShareSettings";

export const Route = createFileRoute("/_chat/settings/agentshare")({
  validateSearch: (raw: Record<string, unknown>): { section?: "models" | "tools" } =>
    raw.section === "models" || raw.section === "tools" ? { section: raw.section } : {},
  component: AgentShareSettingsRoute,
});

function AgentShareSettingsRoute() {
  const { section } = Route.useSearch();
  return <AgentShareSettings key={section ?? "account"} initialSection={section ?? "account"} />;
}
