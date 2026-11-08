import {
  navigationCustomizationAvailable,
  overflowNavigationTabs,
} from "../workspace/navigation-tab-order";
import {
  NAVIGATION_TAB_ICONS,
  WORKSPACE_TAB_LABELS,
  useWorkbenchLanguage,
  useNavigationTabOrder,
  useHiddenNavigationTabs,
} from "../workspace/navigation-tabs";
import { currentWorkspaceSelections } from "../workspace/workspace-selection-store";
import { rememberedSettingsPage } from "../workspace/workspace-tab-navigation";
import { useSelectWorkspaceTab } from "../workspace/useSelectWorkspaceTab";
import { useWorkspaceTabs } from "../workspace/WorkspaceTabsContext";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth, useUser } from "@clerk/expo";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import { use, type ComponentProps } from "react";
import { Platform, View } from "react-native";
import { useNativeColumnLayoutMetrics } from "../../native/native-layout-metrics";
import { workbenchLabels } from "@t3tools/shared/workbenchLabels";
import { deriveProjectGroupLabel } from "@t3tools/client-runtime/state/project-grouping";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { useAdaptiveWorkspaceLayout } from "../layout/adaptive-workspace-context";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection, SettingsSidebarContext } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";
import type { SettingsPageTarget } from "./components/settings-page-targets";
import {
  useSettingsEnvironmentMenu,
  SettingsEnvironmentFilterHeader,
} from "./components/SettingsEnvironmentFilterHeader";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";
import { filterSettingsSections } from "./settings-search";
import { NativePrimaryColumnContext } from "../../native/v5-workspace-context";

export function SettingsRouteScreen() {
  const { layout } = useAdaptiveWorkspaceLayout();
  const inSidebar = use(NativePrimaryColumnContext) !== null && layout.usesSplitView;
  // The page open beside the list: the route right above the Settings tab's route. While
  // another tab is open this list stays mounted, hidden, and must keep showing the page Settings
  // reopens on; otherwise returning shows it unselected for a frame before the page arrives.
  const selected = useNavigationState((state) => {
    const list = state.routes.findIndex((route) => route.name === "Settings");
    return list < 0
      ? rememberedSettingsPage(currentWorkspaceSelections())
      : (state.routes[list + 1]?.name ?? null);
  });
  return <SettingsListScreen sidebar={inSidebar} selected={selected} />;
}

export function SettingsListScreen(props: {
  readonly sidebar: boolean;
  readonly selected: string | null;
}) {
  const language = useWorkbenchLanguage();
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const workspace = useWorkspaceTabs();
  const environmentMenu = useSettingsEnvironmentMenu();
  const inSidebar = props.sidebar;
  const selected = props.selected;
  const sidebar = inSidebar ? { selected } : null;
  const content = hasCloudPublicConfig() ? (
    <ConfiguredSettingsRouteScreen />
  ) : (
    <LocalSettingsRouteScreen />
  );

  return (
    <SettingsSidebarContext value={sidebar}>
      <View className="flex-1 bg-screen">
        <SettingsEnvironmentFilterHeader />
        {Platform.OS === "android" ? (
          <SettingsScreen
            title={t("设置", "Settings")}
            workspaceRoot={inSidebar}
            menus={[environmentMenu]}
            search={
              workspace
                ? {
                    value: workspace.state.tabs.settings.query,
                    onChangeText: (query) =>
                      workspace.dispatch({ type: "query", tab: "settings", query }),
                    placeholder: t("搜索设置", "Search settings"),
                  }
                : undefined
            }
          >
            {content}
          </SettingsScreen>
        ) : (
          content
        )}
      </View>
    </SettingsSidebarContext>
  );
}

type SettingsListRow = ComponentProps<typeof SettingsRow> & { readonly id: string };

interface SettingsListSection {
  readonly title?: string;
  readonly rows: readonly SettingsListRow[];
}

function ConfiguredSettingsRouteScreen() {
  const language = useWorkbenchLanguage();
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const navigation = useNavigation();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { user } = useUser();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const environments = useEnvironmentsRow(Object.keys(savedConnectionsById).length);
  const accountLabel = !isLoaded
    ? t("正在检查", "Checking")
    : !isSignedIn
      ? t("登录", "Sign in")
      : (user?.primaryEmailAddress?.emailAddress ?? t("已登录", "Signed in"));

  return (
    <SettingsList
      connections={[
        {
          id: "account",
          icon: "person.crop.circle",
          label: "T3 Account",
          value: accountLabel,
          disabled: !isLoaded,
          onPress: () => navigation.navigate("SettingsAuth"),
        },
        environments,
        {
          id: "SettingsNotifications",
          icon: "bell.badge",
          label: t("通知", "Notifications"),
          target: "SettingsNotifications",
        },
      ]}
    />
  );
}

function LocalSettingsRouteScreen() {
  const { savedConnectionsById } = useSavedRemoteConnections();
  const environments = useEnvironmentsRow(Object.keys(savedConnectionsById).length);
  return <SettingsList connections={[environments]} />;
}

function useEnvironmentsRow(count: number): SettingsListRow {
  const language = useWorkbenchLanguage();
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  return {
    id: "SettingsEnvironments",
    icon: "desktopcomputer",
    label: t("环境", "Environments"),
    value: `${count}`,
    valuePosition: "trailing",
    target: "SettingsEnvironments",
  };
}

function SettingsList(props: { readonly connections: readonly SettingsListRow[] }) {
  const language = useWorkbenchLanguage();
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  // UIKit's scroll-edge material takes the scroll view's own color; like the chat list, match
  // the sidebar's surface so the bar doesn't darken over content at rest.
  // Grouped cards only lift off the screen surface; the drawer is as dark as they are.
  const listSurface = use(SettingsSidebarContext) ? "bg-drawer" : "bg-screen";
  const insets = useSafeAreaInsets();
  // UIKit insets the scroll view by its column's safe area, which this context can report as 0.
  const bottomSafeArea = useNativeColumnLayoutMetrics()?.safeArea.bottom ?? insets.bottom;
  const workspace = useWorkspaceTabs();
  const query = workspace?.state.tabs.settings.query ?? "";
  const overflowRows = useOverflowRows();
  const indexSections = useSettingsIndexSections();
  const sections = filterSettingsSections(
    [
      { rows: overflowRows },
      {
        title: t("连接", "Connections"),
        rows: [
          {
            id: "SettingsAgentShare",
            icon: "person.crop.circle",
            label: "AgentShare",
            target: "SettingsAgentShare",
          } satisfies SettingsListRow,
          ...props.connections,
        ],
      },
      ...indexSections,
    ],
    query,
  );

  return (
    <View collapsable={false} className="flex-1">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        className={`flex-1 ${listSurface}`}
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{
          // The workspace's clearance keeps the last row above its search field and keyboard.
          paddingBottom:
            Platform.OS === "ios"
              ? Math.max(Math.max(bottomSafeArea, 18) + 18, workspace?.bottomClearance ?? 0) -
                bottomSafeArea
              : Math.max(Math.max(insets.bottom, 18) + 18, workspace?.bottomClearance ?? 0),
        }}
      >
        {sections.length ? (
          sections.map((section, index) => (
            <SettingsSection key={section.title ?? `untitled-${index}`} title={section.title}>
              {section.rows.map(({ id, ...row }) => (
                <SettingsRow key={id} {...row} />
              ))}
            </SettingsSection>
          ))
        ) : (
          <EmptyState
            variant="plain"
            title={t("无搜索结果", "No results")}
            detail={
              language === "zh"
                ? `没有匹配“${query.trim()}”的设置。`
                : `No settings match “${query.trim()}”.`
            }
          />
        )}
      </ScrollView>
    </View>
  );
}

function useSettingsIndexSections(): SettingsListSection[] {
  const language = useWorkbenchLanguage();
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const { selectedTargets, projectGroups, selectedProjectKey } = useSettingsEnvironmentFilter();
  const noServerTargets = selectedTargets.length === 0;
  const selectedProject = projectGroups.find((group) => group.key === selectedProjectKey);
  const scopedProjectMembers =
    selectedProject?.members
      .map((member) => member.project)
      .filter((project) =>
        selectedTargets.some((target) => target.environmentId === project.environmentId),
      ) ?? [];
  const projectLabel =
    scopedProjectMembers.length > 0
      ? deriveProjectGroupLabel({
          representative: scopedProjectMembers[0]!,
          members: scopedProjectMembers,
        })
      : (selectedProject?.label ?? t("项目不可用", "Unavailable project"));
  const page = (
    target: SettingsPageTarget,
    icon: SettingsListRow["icon"],
    label: string,
    extra?: Pick<SettingsListRow, "disabled" | "value">,
  ): SettingsListRow => ({ id: target, icon, label, target, ...extra });
  const serverPage = (target: SettingsPageTarget, icon: SettingsListRow["icon"], label: string) =>
    page(target, icon, label, { disabled: noServerTargets });
  // The same pages and groups as Settings on web, minus what mobile has no setting for.
  return [
    {
      rows: [
        page("SettingsOrganization", "gearshape", t("通用", "General")),
        page("SettingsAppearance", "paintbrush", t("外观", "Appearance")),
        page("SettingsFollowUp", "bubble.left.and.bubble.right", t("聊天", "Chat")),
        ...(navigationCustomizationAvailable()
          ? [page("SettingsNavigation", "line.3.horizontal", t("导航标签", "Navigation tabs"))]
          : []),
        ...(Platform.OS === "ios"
          ? [page("SettingsKeyboard", "keyboard", t("键盘", "Keyboard"))]
          : []),
        page("SettingsMicrophone", "mic", t("麦克风", "Microphone")),
      ],
    },
    {
      title: t("助手", "Agents"),
      rows: [
        serverPage("SettingsProviderAccounts", "person.crop.circle", t("模型服务", "Providers")),
        serverPage("SettingsThreads", "text.bubble", t("会话", "Threads")),
        page("SettingsScheduledTasks", "clock", t("定时任务", "Scheduled tasks")),
      ],
    },
    {
      title: t("代码", "Code"),
      rows: [
        page(
          "SettingsProjectOverview",
          "folder",
          t("项目", "Projects"),
          selectedProjectKey !== null ? { value: projectLabel } : undefined,
        ),
        serverPage(
          "SettingsEnvironmentSourceControl",
          "arrow.triangle.branch",
          t("源代码管理", "Source control"),
        ),
        serverPage("SettingsWorktrees", "square.on.square", t("工作树", "Worktrees")),
      ],
    },
    {
      rows: [
        serverPage("SettingsEnvironmentMaintenance", "arrow.clockwise", t("维护", "Maintenance")),
        page("SettingsLabs", "sparkles", t("实验功能", "Labs")),
        page("SettingsAbout", "info.circle", t("关于", "About")),
        page("SettingsArchive", "archivebox", t("归档", "Archive")),
      ],
    },
  ];
}

function useOverflowRows(): SettingsListRow[] {
  const language = useWorkbenchLanguage();
  const order = useNavigationTabOrder();
  const hidden = useHiddenNavigationTabs();
  const { layout } = useAdaptiveWorkspaceLayout();
  const tabs =
    Platform.OS === "android" && layout.usesSplitView ? [] : overflowNavigationTabs(order, hidden);
  const selectTab = useSelectWorkspaceTab();
  return tabs.map((tab) => ({
    id: tab,
    icon: NAVIGATION_TAB_ICONS[tab],
    label: language === "zh" ? workbenchLabels.zh[tab] : WORKSPACE_TAB_LABELS[tab],
    onPress: () => selectTab(tab),
  }));
}
