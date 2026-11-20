import { useAtomValue } from "@effect/atom-react";
import {
  agentSharePickerItems,
  findAgentShareModelConnection,
} from "@t3tools/shared/agentShareModelCatalog";
import { workbenchLabels, modelSourceLabels } from "@t3tools/shared/workbenchLabels";
import { type EnvironmentId, type ProviderInstanceId } from "@t3tools/contracts";
import { CheckIcon, CpuIcon, GlobeIcon, LaptopIcon, SearchIcon, StarIcon } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { agentShareEnvironment } from "~/state/agentShare";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  useClientSettings,
  useEnvironmentSettings,
  useEnvironmentModelPreferences,
  useToggleEnvironmentModelFavorite,
} from "~/hooks/useSettings";
import { registerModelPickerContent } from "~/modelPickerVisibility";
import { cn } from "~/lib/utils";
import { InlineButton } from "../ui/button";
import { ClaudeAI, OpenAI } from "../Icons";
import type { ModelPickerContent } from "./ModelPickerContent";
import qwenIcon from "./model-icons/qwen.svg";

type PickerProps = ComponentProps<typeof ModelPickerContent>;
type Item = ReturnType<typeof agentSharePickerItems>[number];
type Tab = "favorites" | "local" | "community";
type Navigation = { tab: Tab; local?: string; community?: string };
const navigation = new Map<string, Navigation>();
const panelClassName =
  "flex h-[min(34rem,calc(100dvh-1.5rem))] w-[min(35rem,calc(100vw-1.5rem))] flex-col overflow-hidden";

function CatalogGroupIcon({ icon }: { icon: string }) {
  if (icon === "claude") return <ClaudeAI className="size-5 shrink-0 text-[#d97757]" />;
  if (icon === "codex") return <OpenAI className="size-5 shrink-0" />;
  if (icon === "qwen") return <img src={qwenIcon} alt="" className="size-5 shrink-0" />;
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(icon) && icon.length <= 24 * 1024)
    return <img src={icon} alt="" className="size-5 shrink-0 object-contain" />;
  return <CpuIcon className="size-5 shrink-0" />;
}

export function AgentShareModelPickerRouter(props: PickerProps & { fallback: ReactNode }) {
  const state = useEnvironmentQuery(
    props.environmentId
      ? agentShareEnvironment.state({ environmentId: props.environmentId, input: {} })
      : null,
  );
  const language = useClientSettings((settings) => settings.uiLanguage);
  if (!props.environmentId || (state.error && !state.data)) return props.fallback;
  if (!state.data)
    return (
      <div className={cn(panelClassName, "p-4 text-sm text-muted-foreground")} role="status">
        {workbenchLabels[language].loadingModelCatalog}
      </div>
    );
  return (
    <AgentShareModelPicker
      key={props.environmentId + ":" + state.data.host.owner}
      {...props}
      environmentId={props.environmentId}
      owner={state.data.host.owner}
    />
  );
}

export function AgentShareModelPicker(
  props: PickerProps & { environmentId: EnvironmentId; owner: string },
) {
  const {
    environmentId,
    owner,
    instanceEntries,
    modelOptionsByInstance,
    getModelDisabledReason,
    onToggleModel,
    onInstanceModelChange,
    activeInstanceId,
    model,
    lockedProvider,
    lockedContinuationGroupKey,
    selectedModels,
    searchInputRef,
    onRequestClose,
  } = props;
  const language = useClientSettings((settings) => settings.uiLanguage);
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const labels = workbenchLabels[language],
    sourceLabels = modelSourceLabels[language];
  const navigate = useNavigate();
  const query = useEnvironmentQuery(
    agentShareEnvironment.models({ environmentId, input: { owner } }),
  );
  const instances = useEnvironmentSettings(environmentId, (settings) => settings.providerInstances);
  const { favorites } = useEnvironmentModelPreferences(environmentId);
  const toggleFavorite = useToggleEnvironmentModelFavorite(environmentId);
  const configure = useAtomCommand(agentShareEnvironment.configureModel, { reportFailure: false });
  const canConfigure = useAtomValue(
    agentShareEnvironment.configureModel.permissionAtom(environmentId),
  );
  const items = agentSharePickerItems(query.data?.catalog, query.data?.models ?? []);
  const connection = (item: Item) =>
    findAgentShareModelConnection(instances, owner, item.info.model);
  const isFavorite = (item: Item) =>
    favorites.some((f) => f.provider === connection(item) && f.model === item.info.model.id);
  const scope = environmentId + ":" + owner;
  const [chosenNav, setNav] = useState<Navigation | undefined>(() => navigation.get(scope));
  const nav: Navigation = chosenNav ?? {
    tab: items.some(isFavorite)
      ? "favorites"
      : (items.find((item) => connection(item) === activeInstanceId)?.tab ?? "local"),
  };
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    instanceId: ProviderInstanceId;
    model: string;
    additive: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const completed = useRef<typeof pending>(null);
  const completeConnection = useEffectEvent((selection: NonNullable<typeof pending>) => {
    const reason = getModelDisabledReason?.(selection.instanceId, selection.model);
    setPending(null);
    setBusyKey(null);
    if (reason) {
      setError(reason);
      return;
    }
    if (selection.additive && onToggleModel) onToggleModel(selection.instanceId, selection.model);
    else onInstanceModelChange(selection.instanceId, selection.model);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the popup with the composer's global keyboard ownership
  useLayoutEffect(() => registerModelPickerContent(), []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- waits for the server's provider snapshot after creating a connection before selecting it
  useEffect(() => {
    if (!pending || completed.current === pending) return;
    const entry = instanceEntries.find((entry) => entry.instanceId === pending.instanceId);
    if (
      !entry ||
      entry.status !== "ready" ||
      !entry.isAvailable ||
      !modelOptionsByInstance.get(pending.instanceId)?.some((model) => model.slug === pending.model)
    )
      return;
    completed.current = pending;
    // oxlint-disable-next-line react/set-state-in-effect -- completes the user selection when the external provider snapshot arrives
    completeConnection(pending);
  }, [pending, instanceEntries, modelOptionsByInstance]);

  function changeNav(next: Navigation) {
    setNav(next);
    navigation.delete(scope);
    navigation.set(scope, next);
    if (navigation.size > 32) navigation.delete(navigation.keys().next().value!);
    setSearch("");
  }
  const groups = (query.data?.catalog?.groups ?? []).filter(
    (group) =>
      group.enabled && items.some((item) => item.group.id === group.id && item.tab === nav.tab),
  );
  const activeItem = items.find(
    (item) => connection(item) === activeInstanceId && item.info.model.id === model,
  );
  const sourceTab = nav.tab === "community" ? "community" : "local";
  const selectedGroup =
    nav.tab === "favorites"
      ? undefined
      : (groups.find((group) => group.id === nav[sourceTab]) ??
        groups.find((group) => group.id === activeItem?.group.id) ??
        groups[0]);
  const searching = search.trim().length > 0;
  const flat = nav.tab === "favorites" || searching;
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = items.filter((item) =>
    searching
      ? terms.every((term) =>
          [
            item.info.name,
            item.info.model.id,
            item.group.name,
            item.info.device_name ?? "",
            sourceLabels[item.info.model.source],
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
        )
      : nav.tab === "favorites"
        ? isFavorite(item)
        : item.tab === nav.tab && item.group.id === selectedGroup?.id,
  );
  function disabledReason(item: Item) {
    const id = connection(item);
    if (!item.info.available) return labels.unavailableModel;
    if (!id && !canConfigure)
      return t("没有添加模型连接的权限", "Permission to add a model connection is required");
    if (id) {
      const blocked = getModelDisabledReason?.(id, item.info.model.id);
      if (blocked) return blocked;
    }
    if (lockedProvider !== null) {
      const entry = instanceEntries.find((entry) => entry.instanceId === id);
      if (
        !entry ||
        entry.driverKind !== lockedProvider ||
        (lockedContinuationGroupKey && entry.continuationGroupKey !== lockedContinuationGroupKey)
      )
        return t("请在新会话中使用这个模型", "Use this model in a new chat");
    }
    return null;
  }
  async function choose(item: Item, favorite: boolean, additive = false) {
    if (busyKey || (!favorite && disabledReason(item))) return;
    let id = connection(item);
    if (!id && (!canConfigure || !item.info.available)) return;
    setError(null);
    setBusyKey(item.key);
    try {
      if (!id) {
        const result = await configure({ environmentId, input: { owner, model: item.info.model } });
        if (result._tag !== "Success") {
          setError(t("连接未能建立，请重试。", "Could not create the connection. Try again."));
          setBusyKey(null);
          return;
        }
        id = result.value.instanceId;
      }
      if (favorite) {
        await toggleFavorite(id, item.info.model.id);
        setBusyKey(null);
        return;
      }
      const ready =
        instanceEntries.some(
          (entry) => entry.instanceId === id && entry.status === "ready" && entry.isAvailable,
        ) && modelOptionsByInstance.get(id)?.some((model) => model.slug === item.info.model.id);
      if (ready) {
        setBusyKey(null);
        if (additive && onToggleModel) onToggleModel(id, item.info.model.id);
        else onInstanceModelChange(id, item.info.model.id);
      } else setPending({ instanceId: id, model: item.info.model.id, additive });
    } catch {
      setBusyKey(null);
      setError(
        t(
          "连接中断，请刷新模型目录后重试。",
          "Connection interrupted. Refresh the catalog and try again.",
        ),
      );
    }
  }
  const pendingEntry =
    pending && instanceEntries.find((entry) => entry.instanceId === pending.instanceId);
  return (
    <div
      ref={panel}
      data-model-picker-content="true"
      data-agentshare-model-picker="true"
      className={panelClassName}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onRequestClose?.();
        }
        if (
          ["ArrowDown", "ArrowUp"].includes(event.key) &&
          !(
            event.target instanceof HTMLButtonElement && event.target.getAttribute("role") === "tab"
          )
        ) {
          const buttons = [
            ...panel.current!.querySelectorAll<HTMLButtonElement>(
              "[data-model-choice]:not(:disabled)",
            ),
          ];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            buttons[
              index < 0
                ? event.key === "ArrowDown"
                  ? 0
                  : buttons.length - 1
                : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length
            ];
          if (next) {
            event.preventDefault();
            next.focus();
          }
        }
        event.stopPropagation();
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={searchInputRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={labels.searchModels}
          placeholder={labels.searchModels}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div
        className="flex shrink-0 gap-4 border-b border-border/60 px-4"
        role="tablist"
        aria-label={labels.filterModels}
      >
        {(["favorites", "local", "community"] as const).map((tab) => {
          const Icon = tab === "favorites" ? StarIcon : tab === "local" ? LaptopIcon : GlobeIcon;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={nav.tab === tab}
              aria-controls="agentshare-picker-panel"
              tabIndex={nav.tab === tab ? 0 : -1}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                e.preventDefault();
                e.stopPropagation();
                const tabs: Tab[] = ["favorites", "local", "community"];
                const next =
                  e.key === "Home"
                    ? "favorites"
                    : e.key === "End"
                      ? "community"
                      : tabs[(tabs.indexOf(tab) + (e.key === "ArrowRight" ? 1 : 2)) % 3]!;
                changeNav({ ...nav, tab: next });
                panel.current
                  ?.querySelector<HTMLButtonElement>('[data-tab="' + next + '"]')
                  ?.focus();
              }}
              data-tab={tab}
              onClick={() => changeNav({ ...nav, tab })}
              className={cn(
                "flex min-h-11 items-center gap-1.5 border-b-2 px-0.5 text-xs sm:text-sm",
                nav.tab === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {tab === "favorites"
                ? labels.favoriteModels
                : tab === "local"
                  ? t("本地", "Local")
                  : sourceLabels.community}
            </button>
          );
        })}
      </div>
      <div
        id="agentshare-picker-panel"
        role="tabpanel"
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {!flat && (
          <div
            className="w-28 shrink-0 space-y-1 overflow-y-auto border-r border-border/60 bg-muted/30 p-2 sm:w-36"
            aria-label={t("模型分组", "Model groups")}
          >
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={group.id === selectedGroup?.id}
                onClick={() => changeNav({ ...nav, [nav.tab]: group.id })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm",
                  group.id === selectedGroup?.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                <CatalogGroupIcon icon={group.icon} />
                <span className="min-w-0 break-words">{group.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1 overflow-y-auto p-2">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {searching
              ? t("全部来源的搜索结果", "Results from all sources")
              : flat
                ? labels.favoriteModels
                : selectedGroup?.name}
          </div>
          {visible.map((item) => {
            const id = connection(item),
              selected = selectedModels
                ? selectedModels.some(
                    (selection) =>
                      selection.instanceId === id && selection.model === item.info.model.id,
                  )
                : id === activeInstanceId && item.info.model.id === model;
            const reason = disabledReason(item),
              favorite = isFavorite(item);
            return (
              <div
                key={item.key}
                className={cn(
                  "mb-1 flex items-center rounded-lg",
                  selected ? "bg-accent/70" : "hover:bg-muted/60",
                )}
              >
                <button
                  type="button"
                  data-model-choice={item.key}
                  aria-pressed={selected}
                  disabled={Boolean(reason) || Boolean(busyKey)}
                  onClick={(e) => void choose(item, false, e.shiftKey)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-3 text-left disabled:opacity-50"
                >
                  {flat && <CatalogGroupIcon icon={item.group.icon} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {item.info.name}
                      {item.version.recommended && (
                        <span className="rounded bg-muted px-1 text-2xs font-normal text-muted-foreground">
                          {t("推荐", "Recommended")}
                        </span>
                      )}
                      {selected && <CheckIcon className="size-3.5" />}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {[sourceLabels[item.info.model.source], item.info.device_name, reason]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={favorite ? labels.removeFavoriteModel : labels.addFavoriteModel}
                  aria-pressed={favorite}
                  disabled={Boolean(busyKey) || (!id && (!canConfigure || !item.info.available))}
                  onClick={() => void choose(item, true)}
                  className="shrink-0 p-2 text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <StarIcon className={cn("size-4", favorite && "fill-current text-primary")} />
                </button>
              </div>
            );
          })}
          {!visible.length && (
            <p className="px-2 py-5 text-sm text-muted-foreground" role="status">
              {query.isPending
                ? labels.loadingModelCatalog
                : query.error
                  ? labels.modelCatalogUnavailable
                  : !query.data?.catalog
                    ? t(
                        "模型展示目录尚未同步，请刷新或联系管理员。",
                        "The model catalog has not synced. Refresh or contact an administrator.",
                      )
                    : nav.tab === "favorites" && !searching
                      ? t(
                          "点亮模型旁的星标，将常用模型加入收藏。",
                          "Star models to keep them here.",
                        )
                      : labels.noModelsFound}
            </p>
          )}
        </div>
      </div>
      {(busyKey || error || query.error) && (
        <div
          className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2 text-xs"
          role={error ? "alert" : "status"}
        >
          <span>
            {error ??
              (pendingEntry?.status === "warning"
                ? t(
                    "连接尚未就绪，请检查模型或执行电脑。",
                    "The connection is not ready. Check the model or execution host.",
                  )
                : busyKey
                  ? t("正在准备模型连接…", "Preparing model connection…")
                  : labels.modelCatalogUnavailable)}
          </span>
          {pending && (
            <InlineButton
              onClick={() => {
                setBusyKey(null);
                setPending(null);
              }}
            >
              {t("取消", "Cancel")}
            </InlineButton>
          )}
        </div>
      )}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
        <span>{labels.pickModelHint}</span>
        <div className="flex gap-3">
          <InlineButton onClick={query.refresh}>{t("刷新", "Refresh")}</InlineButton>
          <InlineButton
            onClick={() => {
              onRequestClose?.();
              void navigate({
                to: "/settings/providers",
                search: { machine: environmentId },
              });
            }}
          >
            {labels.manageModels}
          </InlineButton>
        </div>
      </div>
    </div>
  );
}
