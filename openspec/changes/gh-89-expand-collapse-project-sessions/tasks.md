# Tasks — Expand/collapse projects to reveal sessions

## T1: Add ChatSession type and persistence layer
- **Files:** `src/shared/ipc.ts`, `src/main/config-store.ts`
- **Tier:** core
- **Status:** done
- Add `ChatSession` interface to shared IPC
- Add `chatSessions` and `expandedProjects` to ConfigSchema
- Add CRUD functions in config-store.ts

## T2: Add IPC handlers and preload bridge
- **Files:** `src/main/index.ts`, `src/main/ipc-validation.ts`, `src/preload/index.ts`
- **Tier:** core
- **Status:** done
- Register new safeHandle handlers
- Add validation rules
- Add preload bridge methods

## T3: Wire renderer ConfigService + mock
- **Files:** `src/renderer/src/services/interfaces.ts`, `src/renderer/src/services/impl/ConfigService.ts`, `src/renderer/src/services/mock/MockServices.ts`
- **Tier:** core
- **Status:** done
- Add methods to IConfigService interface
- Implement in real and mock ConfigService
- Add MOCK_CHAT_SESSIONS data

## T4: Update Sidebar to show sessions
- **Files:** `src/renderer/src/components/Sidebar.tsx`
- **Tier:** core
- **Status:** done
- Load chat sessions from config service
- Render sessions as indented children under project nodes
- Active session marking with accent dot
- Persist expanded state on toggle
- Add `onNavigateToSession` and `activeSessionId` props

## T5: Update App.tsx for session view
- **Files:** `src/renderer/src/App.tsx`
- **Tier:** core
- **Status:** done
- Add `session` view kind
- Add `handleNavigateToSession` callback
- Pass new props to Sidebar
- Add session placeholder in renderContent

## T6: Add i18n strings and CSS
- **Files:** `src/renderer/src/i18n/en.json`, `src/renderer/src/theme.css`
- **Tier:** ui
- **Status:** done
- Add session-related i18n keys
- Add CSS for session rows, active dot, placeholder
