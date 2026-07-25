# Tasks — Use react-i18next

## Task 1: Install i18next and create i18n setup

- Replace `src/renderer/src/i18n/index.ts` with i18next init using `initReactI18next`
- Keep `en.json` as the resource (i18next resolves dot-paths natively)
- Remove `flattenMessages`; remove `standaloneIntl`
- Export `i18n` instance, `defaultLocale`, `translateMessage`
- Add `i18next` and `react-i18next` to package.json, remove `react-intl`
- Run `pnpm install`

**Touches:** `src/renderer/src/i18n/index.ts`, `package.json`

## Task 2: Convert ICU plural/select syntax in en.json

- Convert `{count, plural, one {} other {s}}` suffix patterns to i18next plural keys: split into `key` (with `{count}`) and `key_other` where the "s" suffix is needed
- Convert `{count, plural, one {X} other {Y}}` full-sentence patterns to `key_one` / `key_other` keys
- Convert `{label, select, ...}` patterns similarly
- Convert `{autoPause, select, true {…} other {}}` patterns
- Convert the complex `stackTitle` and `digest.notifBody` entries
- All converted keys must resolve to the same English output as before

**Touches:** `src/renderer/src/i18n/en.json`

## Task 3: Update main.tsx provider

- Replace `IntlProvider` with i18next init (no provider needed — `initReactI18next` provides context)
- Remove `IntlProvider` import and `messages` import
- Import and call `i18n` init before `createRoot`

**Touches:** `src/renderer/src/main.tsx`

## Task 4: Migrate all useIntl components to useTranslation

- In all ~49 component files: `import { useIntl } from "react-intl"` → `import { useTranslation } from "react-i18next"`
- `const intl = useIntl()` → `const { t } = useTranslation()`
- `intl.formatMessage({ id: "key" })` → `t("key")`
- `intl.formatMessage({ id: "key" }, params)` → `t("key", params)`
- Remove unused `IntlShape` type imports
- Components: App.tsx, AgentRuntimeSwitcher, InfraChatPanel, InstanceSelector, Sidebar, SessionChatView, PrReferenceCard, FleetPlanCard, ColdOpen, SiblingOfferCard, FleetActivityReadout, LoopDetail, ReasoningEffortSelector, PickMainVmModal, BreachInbox, BudgetWatchPanel, RunSelector, AddVmWizard, LogViewer, ProjectsView, LoopProposalCard, InstanceDetail, LoopCard, FailureDiagnosisPanel, InstanceSettingsPanel, RestoreOffer, ModelSelector, TaskChainView, LogRowRenderer, LoopSummaryBar, RuntimeHealthChip, SettingsPanel, StaleConfigWarning, FleetHealthFooter, ChainEditProposalCard, ProjectDetail, TurnFold, ChatComposer, MarkdownContent, ToolCallsExpander, ApprovalPanel, ToolCallInlineBlock, QuestionPanel, InboxPanel, InboxView, ReviewDiffView, ReviewQueueStrip, ReviewModeOverlay, ReviewBriefingView

**Touches:** ~49 component files

## Task 5: Migrate standalone usage (format.ts, fleet-status.ts, runtime-health.ts)

- `standaloneIntl.formatMessage(...)` → `i18n.t(...)`
- `format.ts`: Remove `IntlShape` import, update `healthTooltip` to use `i18n.t()` or accept a `t` function
- `fleet-status.ts`: Replace `standaloneIntl` with `i18n` import
- `runtime-health.ts`: Replace `standaloneIntl` with `i18n` import
- `App.tsx`: Replace `standaloneIntl.formatMessage(...)` calls with `i18n.t(...)`

**Touches:** `src/renderer/src/format.ts`, `src/renderer/src/fleet-status.ts`, `src/renderer/src/runtime-health.ts`, `src/renderer/src/App.tsx`

## Task 6: Update build config and guardrails

- Remove `if (id.includes("react-intl")) return "intl"` from `electron.vite.config.ts`
- Update `GR-STYLE-005` in `.agents/skills/ob-guardrails-project/SKILL.md`: "react-intl" → "react-i18next", `intl.formatMessage` → `useTranslation` hook
- Update `openspec/config.yaml` line 10-11: "react-intl i18n" → "react-i18next i18n"

**Touches:** `electron.vite.config.ts`, `.agents/skills/ob-guardrails-project/SKILL.md`, `openspec/config.yaml`

## Task 7: Verify

- Run `pnpm typecheck` — must pass
- Run `pnpm check:comments` — must pass
- Confirm no file imports from `react-intl`
- Confirm `node_modules/react-intl` does not exist
