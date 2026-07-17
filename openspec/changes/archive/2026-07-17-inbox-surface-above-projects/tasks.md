# Tasks — Inbox surface above projects

## Task 1: Add sidebar inbox entry with unread badge
- **Agent:** frontend-engineer
- **Tier:** 2
- **Depends on:** —
- **Touches:** `Sidebar.tsx`, `theme.css`, `en.json`
- **Done when:** Sidebar shows Inbox entry above projects list; badge hidden at zero, visible with count > 0; clicking navigates to inbox view

## Task 2: Create InboxView component
- **Agent:** frontend-engineer
- **Tier:** 2
- **Depends on:** —
- **Touches:** `InboxView.tsx` (new)
- **Done when:** InboxView renders items newest-first with type icon, title, detail, source, timestamp; shows empty state "The fleet is quiet"; supports Active/Done tabs; supports fleet query composer

## Task 3: Wire inbox into App.tsx navigation
- **Agent:** frontend-engineer
- **Tier:** 1
- **Depends on:** Task 1, Task 2
- **Touches:** `App.tsx`
- **Done when:** View kind "inbox" renders InboxView in main panel; instance/detail headers hidden; InfraChatPanel hidden; deep-link inbox-item navigates to inbox view; inboxItemCount computed and passed to Sidebar

## Task 4: Add i18n and CSS
- **Agent:** frontend-engineer
- **Tier:** 1
- **Depends on:** Task 1, Task 2
- **Touches:** `en.json`, `theme.css`
- **Done when:** All user-facing copy uses i18n keys; CSS matches existing design tokens and visual language
