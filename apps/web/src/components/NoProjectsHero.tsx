import { workspaceAreaProps } from "../lib/workspaceFocus";
import { MessageSquareDashedIcon, PlusIcon } from "lucide-react";
import { workbenchLabels } from "@t3tools/shared/workbenchLabels";

import { openCommandPalette } from "../commandPaletteBus";
import { isElectron } from "../env";
import { useScratchProject } from "../hooks/useScratchProject";
import { useClientSettings } from "../hooks/useSettings";
import { usePrimaryEnvironmentId } from "../state/environments";
import { Button } from "./ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

const homeLabels = {
  en: {
    home: "Home",
    heading: "What should we work on?",
    addFirstProject: "Add a project to start your first thread.",
    needsTaskAccess: "Starting a thread requires task access on a connected workbench.",
    chooseHowToStart: "Add a project, or start without one.",
    startWithoutProject: "Start without a project",
  },
  zh: {
    home: "首页",
    heading: "今天想做什么？",
    addFirstProject: "添加项目，开始第一次会话。",
    needsTaskAccess: "连接有任务操作权限的工作台后，即可开始会话。",
    chooseHowToStart: "添加项目，也可以直接开始会话。",
    startWithoutProject: "直接开始会话",
  },
} as const;

export function NoProjectsHero() {
  const language = useClientSettings((settings) => settings.uiLanguage);
  const labels = homeLabels[language];
  const contentArea = workspaceAreaProps("home", 1, labels.home);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { canCreateProject, scratchEnvironmentId, startScratchThread } = useScratchProject();
  const scratchTargetEnvironmentId = scratchEnvironmentId(primaryEnvironmentId);

  return (
    <SidebarInset
      {...contentArea}
      role="main"
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        {/* The desktop window only moves where CSS opts in, so keep a titlebar strip. */}
        {isElectron ? <WorkspacePageHeader electron /> : null}
        <Empty size="hero" className="flex-1">
          <div className="w-full max-w-lg px-8 py-12">
            <EmptyHeader className="max-w-none">
              <EmptyTitle>{labels.heading}</EmptyTitle>
              <EmptyDescription>
                {!canCreateProject
                  ? labels.needsTaskAccess
                  : scratchTargetEnvironmentId === null
                    ? labels.addFirstProject
                    : labels.chooseHowToStart}
              </EmptyDescription>
              <div className="mt-6 flex justify-center gap-2">
                {canCreateProject ? (
                  <Button size="sm" onClick={() => openCommandPalette({ open: "add-project" })}>
                    <PlusIcon className="size-4" />
                    {workbenchLabels[language].addProject}
                  </Button>
                ) : null}
                {scratchTargetEnvironmentId === null ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void startScratchThread(scratchTargetEnvironmentId)}
                  >
                    <MessageSquareDashedIcon className="size-4" />
                    {labels.startWithoutProject}
                  </Button>
                )}
              </div>
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
