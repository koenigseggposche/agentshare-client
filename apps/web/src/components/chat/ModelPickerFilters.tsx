import { type ProviderInstanceId } from "@t3tools/contracts";
import { workbenchLabels } from "@t3tools/shared/workbenchLabels";
import { memo } from "react";
import { useClientSettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { isProviderInstancePickerReady, type ProviderInstanceEntry } from "../../providerInstances";

/** Optional filters. Every available connection is visible in the default list. */
export const ModelPickerFilters = memo(function ModelPickerFilters(props: {
  selectedInstanceId: ProviderInstanceId | "favorites" | "all";
  onSelectInstance: (instanceId: ProviderInstanceId | "favorites" | "all") => void;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  disabledInstanceIds?: ReadonlySet<ProviderInstanceId>;
  selectableUnavailableInstanceIds?: ReadonlySet<ProviderInstanceId>;
}) {
  const labels = workbenchLabels[useClientSettings((settings) => settings.uiLanguage)];
  const specific = props.selectedInstanceId !== "all" && props.selectedInstanceId !== "favorites";
  return (
    <div
      data-model-picker-filters="true"
      className="flex shrink-0 items-center gap-1 border-b border-border/60 px-3 pb-2 pt-1"
      aria-label={labels.filterModels}
    >
      {(["all", "favorites"] as const).map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={props.selectedInstanceId === id}
          onClick={() => props.onSelectInstance(id)}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            props.selectedInstanceId === id
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {id === "all" ? labels.allModels : labels.favoriteModels}
        </button>
      ))}
      {props.instanceEntries.length > 1 || specific ? (
        <select
          aria-label={labels.modelConnection}
          className="ml-auto min-w-0 max-w-44 truncate rounded-md border border-border/60 bg-transparent px-2 py-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          value={specific ? props.selectedInstanceId : ""}
          onChange={(event) =>
            props.onSelectInstance(
              event.target.value ? (event.target.value as ProviderInstanceId) : "all",
            )
          }
        >
          <option value="">{labels.allConnections}</option>
          {props.instanceEntries.map((entry) => {
            const disabled =
              props.disabledInstanceIds?.has(entry.instanceId) ||
              (!isProviderInstancePickerReady(entry) &&
                !props.selectableUnavailableInstanceIds?.has(entry.instanceId));
            return (
              <option key={entry.instanceId} value={entry.instanceId} disabled={disabled}>
                {entry.displayName}
                {disabled ? ` · ${labels.unavailableModel}` : ""}
              </option>
            );
          })}
        </select>
      ) : null}
    </div>
  );
});
