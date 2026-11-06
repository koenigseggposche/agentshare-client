import { uuidv4 } from "../../lib/uuid";
import { useState } from "react";
import { View } from "react-native";
import { useAtomValue } from "@effect/atom-react";
import type {
  AgentShareCommandInput,
  AgentShareResourceBudget,
  EnvironmentId,
} from "@t3tools/contracts";
import {
  formatModelBytes,
  modelManagerEntries,
  modelOperationPresentation,
  modelOperationSubmissionState,
  parseModelBudget,
} from "@t3tools/client-runtime/agentShareModelManager";
import { AppText as Text, AppTextInput } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { agentShareEnvironment } from "../../state/agentShare";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "./components/SettingsSection";

export function AgentShareModelManager({
  environmentId,
  owner,
  language,
}: {
  environmentId: EnvironmentId;
  owner: string;
  language: "zh" | "en";
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const query = useEnvironmentQuery(
    agentShareEnvironment.modelManager({ environmentId, input: { owner } }),
  );
  const hardware = useEnvironmentQuery(
    agentShareEnvironment.hardware({ environmentId, input: { owner } }),
  );
  const command = useAtomCommand(agentShareEnvironment.command, { reportFailure: false });
  const allowed = useAtomValue(agentShareEnvironment.command.permissionAtom(environmentId));
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string; input: AgentShareCommandInput } | null>(
    null,
  );
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importId, setImportId] = useState("");
  const [importPath, setImportPath] = useState("");
  const [libraryPath, setLibraryPath] = useState("");
  const run = async (input: AgentShareCommandInput) => {
    setPending(true);
    setMessage(null);
    const longOperation = input.operation === "importModel" || input.operation === "moveLibrary";
    if (longOperation) {
      setSubmitted({ id: input.body.id, input });
      setSubmissionUnknown(false);
    }
    const result = await command({ environmentId, input }).catch(() => null);
    query.refresh();
    const outcome = modelOperationSubmissionState(result);
    if (longOperation) setSubmissionUnknown(outcome === "unknown");
    setMessage(
      result?._tag === "Success"
        ? t("操作已接受，请查看下方状态。", "Operation accepted. Check the status below.")
        : outcome === "rejected"
          ? t(
              "请求未被接受，请检查路径、账号和执行电脑状态后重试。",
              "The request was not accepted. Check the path, account and host status before retrying.",
            )
          : t(
              "未能确认操作结果。请刷新状态后再决定是否重试。",
              "The outcome could not be confirmed. Refresh the status before retrying.",
            ),
    );
    setPending(false);
  };
  const data = query.error ? null : query.data;
  const hw = hardware.error ? null : hardware.data;
  const blocked = pending || !allowed || !data;
  const operations = data?.operations;
  const libraryBusy =
    operations?.some((operation) =>
      ["queued", "running", "cancelling"].includes(operation.state),
    ) ?? false;
  const unresolved =
    submissionUnknown &&
    submitted !== null &&
    !operations?.some((operation) => operation.id === submitted.id);
  const libraryBlocked = blocked || operations === undefined || libraryBusy || unresolved;
  const entries = data ? modelManagerEntries(data, language) : [];
  return (
    <>
      <SettingsSection title={t("执行电脑的本机模型", "Local models on the host")}>
        <Text className="px-5 py-3" textRole="body">
          {t(
            "模型在所选电脑下载和运行，手机可以远程管理。",
            "Models download and run on the selected host. Manage them remotely from your phone.",
          )}
        </Text>
        {hw ? (
          <Text className="px-5 pb-3" textRole="footnote">
            {hw.os} · {hw.arch} · {hw.version} · RAM {formatModelBytes(hw.ram_bytes)}
            {hw.gpu ? ` · ${hw.gpu}` : ""}
            {hw.vram_bytes ? ` · VRAM ${formatModelBytes(hw.vram_bytes)}` : ""}
          </Text>
        ) : null}
        <ListActionRow
          label={t("刷新状态", "Refresh status")}
          onPress={() => {
            query.refresh();
            hardware.refresh();
          }}
        />
        {query.error ? (
          <Text accessibilityRole="alert" className="px-5 py-3">
            {t(
              "无法读取模型库，请检查执行电脑连接后刷新。",
              "Could not read the model library. Check the host connection and refresh.",
            )}
          </Text>
        ) : null}
        {!data && !query.error ? (
          <Text className="px-5 py-3">{t("正在读取模型库…", "Loading the model library…")}</Text>
        ) : null}
        {message ? (
          <Text accessibilityLiveRegion="polite" className="px-5 py-3">
            {message}
          </Text>
        ) : null}
        {operations === undefined && data ? (
          <Text className="px-5 py-3" textRole="footnote">
            {t(
              "更新执行电脑的 Core 后，即可使用可查询的离线导入和模型库搬家。",
              "Update Core on the host to use tracked imports and library moves.",
            )}
          </Text>
        ) : null}
        {unresolved && submitted ? (
          <>
            <Text selectable className="px-5 py-3">
              {t("未确认的操作编号", "Unconfirmed operation ID")}：{submitted.id}
            </Text>
            <ListActionRow
              label={t("用同一编号重试提交", "Resubmit with the same ID")}
              disabled={blocked}
              onPress={() => void run(submitted.input)}
            />
          </>
        ) : null}
        {operations?.map((operation) => {
          const item = modelOperationPresentation(operation, language);
          return (
            <View key={operation.id}>
              <Text className="px-5 py-3" textRole="body">
                {item.title} · {item.status}
              </Text>
              <Text selectable className="px-5 pb-3" textRole="footnote">
                {operation.path}
                {"\n"}
                {operation.id}
              </Text>
              {item.progress ? (
                <Text className="px-5 pb-3" textRole="footnote">
                  {item.progress}
                </Text>
              ) : null}
              {item.error ? (
                <Text accessibilityRole="alert" className="px-5 pb-3">
                  {item.error}
                </Text>
              ) : null}
              {item.canCancel ? (
                <ListActionRow
                  label={t("取消此操作", "Cancel this operation")}
                  disabled={blocked}
                  onPress={() =>
                    void run({ operation: "cancelModelOperation", target: operation.id })
                  }
                />
              ) : null}
            </View>
          );
        })}
        <ListActionRow
          label={t("刷新已签名模型目录", "Refresh signed catalog")}
          disabled={blocked}
          onPress={() => void run({ operation: "refreshCatalog" })}
        />
        {data && !data.catalog_fresh ? (
          <Text className="px-5 py-3" textRole="footnote">
            {t(
              "请刷新目录后下载模型；现有安装仍可管理。",
              "Refresh the catalog to download models. Existing installations remain manageable.",
            )}
          </Text>
        ) : null}
        {data && entries.length === 0 ? (
          <Text className="px-5 py-3">
            {t(
              "尚无模型，先刷新目录或导入离线包。",
              "No models yet. Refresh the catalog or import an offline bundle.",
            )}
          </Text>
        ) : null}
      </SettingsSection>
      {entries.map((entry) => (
        <SettingsSection key={entry.id} title={entry.name}>
          <Text className="px-5 py-3" textRole="footnote">
            {entry.id} · {entry.details}
          </Text>
          {entry.description ? (
            <Text className="px-5 pb-3" textRole="body">
              {entry.description}
            </Text>
          ) : null}
          <Text className="px-5 pb-3" textRole="body">
            {entry.status}
          </Text>
          {entry.activity ? (
            <Text className="px-5 pb-3" textRole="footnote">
              {entry.activity}
            </Text>
          ) : null}
          {entry.needsAttention ? (
            <Text accessibilityRole="alert" className="px-5 pb-3">
              {t(
                "此模型需要处理，请检查安装、运行或分享状态。",
                "This model needs attention. Check its installation, runtime or sharing status.",
              )}
            </Text>
          ) : null}
          {entry.actions.map((action) => (
            <ListActionRow
              key={action.label}
              label={action.label}
              disabled={blocked}
              onPress={() => void run(action.input)}
            />
          ))}
        </SettingsSection>
      ))}
      {data ? (
        <>
          <ResourceBudget
            key={`${data.state.budget.ram_bytes}:${data.state.budget.vram_bytes}:${data.state.budget.max_concurrent}`}
            budget={data.state.budget}
            language={language}
            blocked={blocked}
            run={run}
          />
          <SettingsSection title={t("离线导入", "Offline import")}>
            <View className="gap-3 px-5 py-3">
              <PathField
                label={t("模型 ID", "Model ID")}
                value={importId}
                change={setImportId}
                blocked={blocked}
              />
              <PathField
                label={t(
                  "离线包目录（执行电脑上的绝对路径）",
                  "Bundle directory (absolute path on the host)",
                )}
                value={importPath}
                change={setImportPath}
                blocked={blocked}
              />
            </View>
            <ListActionRow
              label={t("校验并导入", "Verify and import")}
              disabled={libraryBlocked || !importId.trim() || !importPath.trim()}
              onPress={() =>
                void run({
                  operation: "importModel",
                  body: {
                    id: uuidv4(),
                    owner,
                    kind: "import",
                    model_id: importId.trim(),
                    path: importPath.trim(),
                  },
                })
              }
            />
          </SettingsSection>
          <SettingsSection title={t("模型库位置", "Model library location")}>
            <Text selectable className="px-5 py-3" textRole="footnote">
              {data.library_path}
            </Text>
            <View className="px-5 pb-3">
              <PathField
                label={t(
                  "新位置（执行电脑上的绝对路径）",
                  "New location (absolute path on the host)",
                )}
                value={libraryPath}
                change={setLibraryPath}
                blocked={blocked}
              />
            </View>
            <ListActionRow
              label={t("迁移模型库", "Move model library")}
              disabled={
                libraryBlocked || !libraryPath.trim() || libraryPath.trim() === data.library_path
              }
              onPress={() =>
                void run({
                  operation: "moveLibrary",
                  body: { id: uuidv4(), owner, kind: "move", path: libraryPath.trim() },
                })
              }
            />
          </SettingsSection>
        </>
      ) : null}
    </>
  );
}

function PathField({
  label,
  value,
  change,
  blocked,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  blocked: boolean;
}) {
  return (
    <View className="gap-1">
      <Text textRole="footnote">{label}</Text>
      <AppTextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        editable={!blocked}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function ResourceBudget({
  budget,
  language,
  blocked,
  run,
}: {
  budget: AgentShareResourceBudget;
  language: "zh" | "en";
  blocked: boolean;
  run: (input: AgentShareCommandInput) => Promise<void>;
}) {
  const t = (zh: string, en: string) => (language === "zh" ? zh : en);
  const [ram, setRam] = useState((budget.ram_bytes / 1024 ** 3).toFixed(3));
  const [vram, setVram] = useState(((budget.vram_bytes ?? 0) / 1024 ** 3).toFixed(3));
  const [concurrency, setConcurrency] = useState(String(budget.max_concurrent));
  const parsed = parseModelBudget(ram, vram, concurrency);
  return (
    <SettingsSection title={t("本机模型资源预算", "Local model resource budget")}>
      <Text className="px-5 py-3" textRole="footnote">
        {t(
          "限制这台电脑的内存、显存和并发请求，不是消费金额上限。降低预算前可能需要停止驻留模型。",
          "Limits host RAM, VRAM and concurrent requests. This is separate from spending. Stop resident models before reducing their reserved resources.",
        )}
      </Text>
      <View className="gap-3 px-5 pb-3">
        {[
          { label: "RAM (GiB)", value: ram, change: setRam },
          { label: "VRAM (GiB)", value: vram, change: setVram },
          {
            label: t("并发（1–8）", "Concurrency (1–8)"),
            value: concurrency,
            change: setConcurrency,
          },
        ].map((field) => (
          <View key={field.label} className="gap-1">
            <Text textRole="footnote">{field.label}</Text>
            <AppTextInput
              accessibilityLabel={field.label}
              keyboardType="decimal-pad"
              value={field.value}
              editable={!blocked}
              onChangeText={field.change}
            />
          </View>
        ))}
      </View>
      <ListActionRow
        label={t("保存资源预算", "Save resource budget")}
        disabled={blocked || !parsed}
        onPress={() => {
          if (parsed) void run({ operation: "modelBudget", body: parsed });
        }}
      />
    </SettingsSection>
  );
}
