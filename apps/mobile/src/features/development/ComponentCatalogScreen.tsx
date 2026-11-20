import { readUiText } from "../../i18n/uiText";
import { translateUiLabels } from "@t3tools/shared/uiMessages";
import { useUiText } from "../../i18n/uiText";
import { NativeAppBarExample } from "./NativeAppBarExample";
import { Toast } from "../../components/ui/Toast";
import { Progress } from "../../components/ui/Progress";
import { useNavigation } from "@react-navigation/native";
import { useRef, useState } from "react";
import { View, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, AppTextInput } from "../../components/ui/AppText";
import { Sheet } from "../../components/ui/Sheet";
import { Chip } from "../../components/ui/Chip";
import { Menu } from "../../components/ui/Menu";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { ListRow } from "../../components/ui/ListRow";
import { ListSection } from "../../components/ui/ListSection";
import { ListToggleRow } from "../../components/ui/ListToggleRow";
import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";
import { FloatingActionButton } from "../../components/ui/FloatingActionButton";
import { SearchField } from "../../components/ui/SearchField";
import { Notice } from "../../components/ui/Notice";
import { NumberField } from "../../components/ui/NumberField";
import { AppBar } from "../../components/ui/AppBar";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SliderRow } from "../../components/ui/SliderRow";
import * as Dialog from "../../components/ui/Dialog";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { MOBILE_THEME_IDS } from "../../lib/mobileTheme";

const CHOICES = [
  { value: "overview", label: "Overview" },
  { value: "activity", label: "Activity" },
];

export function ComponentCatalogScreen() {
  const uiText = useUiText();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const appearance = useAppearancePreferences();
  const [page, setPage] = useState("controls");
  const [tab, setTab] = useState("overview");
  const [enabled, setEnabled] = useState(true);
  const [value, setValue] = useState(3);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState(true);
  const searchRef = useRef<TextInputInstance>(null);
  const announceAction = () => setNotice(true);
  const confirm = () => {
    Dialog.confirm({
      title: uiText("Discard changes?"),
      message: uiText("This example only changes local catalog state."),
      confirmText: readUiText("Discard"),
      destructive: true,
      onConfirm: () => setText(""),
    });
  };
  return (
    <View className="flex-1 bg-screen">
      <AppBar title={uiText("UI components")} onBack={() => navigation.goBack()} />
      <ScreenScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          <AppText className="text-sm text-foreground-muted">{uiText("Theme preview")}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {MOBILE_THEME_IDS.filter(
              (id) => id !== "material-you" || appearance.systemColorsAvailable,
            ).map((id) => (
              <Chip
                key={id}
                label={id}
                selected={appearance.themeId === id}
                onPress={() => appearance.setThemeIdForBothAppearances(id)}
              />
            ))}
          </View>
          <SegmentedControl
            options={[
              { value: "light", label: uiText("Light") },
              { value: "dark", label: uiText("Dark") },
            ]}
            selected={appearance.themeAppearance}
            onSelect={appearance.setThemeMode}
            size="compact"
          />
        </View>
        <SegmentedControl
          options={[
            { value: "controls", label: uiText("Controls") },
            { value: "forms", label: uiText("Forms") },
            { value: "feedback", label: uiText("Feedback") },
          ]}
          selected={page}
          onSelect={setPage}
          size="compact"
        />
        {page === "controls" ? (
          <>
            <View className="gap-3">
              <AppText className="text-lg font-t3-semibold">
                {uiText("Lists and selection")}
              </AppText>
              <ListSection>
                <View className="p-4">
                  <SegmentedControl
                    variant="card"
                    options={translateUiLabels(CHOICES, uiText)}
                    selected={tab}
                    onSelect={setTab}
                    size="compact"
                    role="tab"
                  />
                </View>
                <ListRow
                  icon="folder"
                  label={uiText("Projects")}
                  detail="4"
                  onPress={() => setSheet(true)}
                />
                <ListToggleRow
                  icon="bell.badge"
                  label={uiText("Notifications")}
                  description={uiText("Updates from your active threads")}
                  value={enabled}
                  onValueChange={setEnabled}
                />
                <ListChoiceRow
                  label={uiText("Selected option")}
                  selected
                  onPress={announceAction}
                />
                <ListActionRow
                  icon="trash"
                  label={uiText("Discard changes")}
                  tone="danger"
                  onPress={confirm}
                />
              </ListSection>
              <SegmentedControl
                options={translateUiLabels(CHOICES, uiText)}
                selected={tab}
                onSelect={setTab}
                size="compact"
                role="tab"
              />
              <View className="flex-row flex-wrap gap-2">
                <Chip
                  label={uiText("Selected filter")}
                  selected={enabled}
                  onPress={() => setEnabled(!enabled)}
                />
                <Chip label={uiText("Label")} size="small" />
                <Chip label={uiText("Disabled")} disabled onPress={announceAction} />
              </View>
            </View>
            <View className="gap-3">
              <NativeAppBarExample />
              <AppText className="text-lg font-t3-semibold">{uiText("Buttons")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                <Button label={uiText("Primary")} tone="primary" onPress={announceAction} />
                <Button label={uiText("Secondary")} onPress={announceAction} />
                <Button label={uiText("Contrast")} tone="contrast" onPress={announceAction} />
              </View>
              <View className="flex-row flex-wrap gap-2">
                <Button label={uiText("Disabled")} disabled onPress={announceAction} />
                <Button label={uiText("Loading")} loading onPress={announceAction} />
                <IconButton
                  accessibilityLabel={uiText("Open example sheet")}
                  icon="plus"
                  variant="tonal"
                  onPress={() => setSheet(true)}
                />
              </View>
            </View>
          </>
        ) : null}
        {page === "forms" ? (
          <View className="gap-3">
            <AppText className="text-lg font-t3-semibold">{uiText("Forms")}</AppText>
            <AppTextInput
              accessibilityLabel={uiText("Example name")}
              placeholder={uiText("Name")}
              value={text}
              onChangeText={setText}
            />
            <View className="flex-row">
              <SearchField
                inputRef={searchRef}
                accessibilityLabel={uiText("Search examples")}
                clearAccessibilityLabel="Clear examples search"
                placeholder={uiText("Search examples")}
                value={search}
                onChangeText={setSearch}
                autoFocus={false}
              />
            </View>
            <View className="flex-row items-center justify-between">
              <AppText>{uiText("Count")}</AppText>
              <NumberField
                label={uiText("Example count")}
                min={1}
                max={10}
                value={value}
                onValueChange={setValue}
              />
            </View>
            <ListSection>
              <SliderRow
                icon="textformat.size"
                label={uiText("Example slider")}
                valueLabel={String(value)}
                min={1}
                max={10}
                step={1}
                value={value}
                onChange={setValue}
              />
            </ListSection>
          </View>
        ) : null}
        {page === "feedback" ? (
          <View className="gap-3">
            <AppText className="text-lg font-t3-semibold">
              {uiText("Feedback and presentation")}
            </AppText>
            <Notice message={uiText("This action could not finish. Try again.")} tone="danger" />
            <Button label={uiText("Show notice")} onPress={announceAction} />
            <View className="flex-row flex-wrap gap-2">
              <Button label={uiText("Sheet")} onPress={() => setSheet(true)} />
              <Button label={uiText("Dialog")} onPress={confirm} />
              <Button
                label={uiText("Alert")}
                onPress={() =>
                  Dialog.alert(readUiText("Example alert"), readUiText("Choose an action."), [
                    {
                      text: readUiText("More info"),
                      onPress: () =>
                        Dialog.alert("More information", "This second alert stays open."),
                    },
                    { text: readUiText("Cancel"), style: "cancel" },
                    { text: readUiText("Continue"), onPress: announceAction },
                  ])
                }
              />
              <Button
                label={uiText("Prompt")}
                onPress={() =>
                  Dialog.prompt({
                    title: uiText("Rename example"),
                    initialValue: text,
                    confirmText: readUiText("Rename"),
                    onConfirm: setText,
                  })
                }
              />
              <Menu
                title={uiText("Example menu")}
                actions={[
                  { id: "copy", title: uiText("Copy"), image: "doc.on.doc" },
                  { id: "discard", title: uiText("Discard"), attributes: { destructive: true } },
                ]}
                onPressAction={({ nativeEvent }) =>
                  nativeEvent.event === "discard" ? confirm() : announceAction()
                }
              >
                <Chip label={uiText("Menu")} trailingIcon="chevron.down" />
              </Menu>
            </View>
            <Progress value={0.6} label={uiText("Example upload")} />
            <Progress label={uiText("Connecting")} />
            <View className="items-start">
              <FloatingActionButton
                label={uiText("New thread")}
                icon="plus"
                variant="extended"
                tone="primary"
                onPress={() => setSheet(true)}
              />
            </View>
          </View>
        ) : null}
      </ScreenScrollView>
      {page === "feedback" && notice ? (
        <View
          collapsable={false}
          className="absolute inset-x-3 z-[100]"
          style={{ bottom: insets.bottom + 12 }}
          pointerEvents="box-none"
        >
          <Toast
            message={uiText("Changes are ready to review.")}
            tone="success"
            dismissMode="swipe"
            action={{
              label: uiText("Undo"),
              onPress: () => {
                setNotice(false);
                setText("Restored example");
              },
            }}
            onDismiss={() => setNotice(false)}
          />
        </View>
      ) : null}
      {sheet ? (
        <Sheet title={uiText("Example sheet")} onClose={() => setSheet(false)}>
          <ScreenScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerClassName="p-4"
          >
            <ListSection>
              <ListChoiceRow
                label={uiText("Overview")}
                selected={tab === "overview"}
                onPress={() => setTab("overview")}
              />
              <ListChoiceRow
                label={uiText("Activity")}
                selected={tab === "activity"}
                onPress={() => setTab("activity")}
              />
            </ListSection>
          </ScreenScrollView>
        </Sheet>
      ) : null}
    </View>
  );
}
