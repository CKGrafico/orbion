# Tasks — Local transcript store owned by Orbion

## T1: Add TranscriptMessage types to shared IPC
- **Files:** `src/shared/ipc.ts`
- **Tier:** core
- **Status:** done
- Add `ToolCallRecord`, `TranscriptMessage` interfaces
- Add `TranscriptBridge` interface with getMessages, appendMessage, appendMessages, updateMessage, deleteSession
- Add `TranscriptBridge` to `LoopTaskBridge`

## T2: Implement transcript-store in main process
- **Files:** `src/main/transcript-store.ts`
- **Tier:** core
- **Status:** done
- Per-session file storage under userData/transcripts/
- Append with write serialization
- Debounced writes for streaming updates
- Read all messages for a session
- Delete session transcript
- Update single message

## T3: Register IPC handlers and preload bridge for transcript
- **Files:** `src/main/index.ts`, `src/main/ipc-validation.ts`, `src/preload/index.ts`
- **Tier:** core
- **Status:** done
- Register safeHandle handlers: transcript:getMessages, transcript:appendMessage, transcript:appendMessages, transcript:updateMessage, transcript:deleteSession
- Add validation rules
- Add preload bridge methods
- Wire session removal to also delete transcript

## T4: Wire renderer TranscriptService (real + mock)
- **Files:** `src/renderer/src/services/interfaces.ts`, `src/renderer/src/services/impl/TranscriptService.ts`, `src/renderer/src/services/mock/MockServices.ts`, `src/renderer/src/services/container.ts`
- **Tier:** core
- **Status:** done
- Add `ITranscriptService` interface
- Implement `TranscriptService` (delegates to window.api.transcript)
- Implement `MockTranscriptService` (localStorage-backed)
- Register both in container based on isElectron

## T5: Integrate useTranscript with persistence
- **Files:** `src/renderer/src/chat/useTranscript.ts`, `src/renderer/src/chat/types.ts`, `src/renderer/src/components/InfraChatPanel.tsx`
- **Tier:** core
- **Status:** done
- Add conversion functions: chatTurnsToMessages / messagesToChatTurns
- Add loadFromSession(sessionId) that hydrates turns from service
- Auto-persist on addTurn, appendAssistantContent, finishTurn, interruptTurn
- Add save timeout/debounce for rapid streaming updates
- Update ChatMessage.finishedAt type to support number | boolean | undefined
- Update InfraChatPanel to pass null sessionId

## T6: Modify ConfigBridge and ChatSession cleanup for transcript deletion
- **Files:** `src/main/index.ts` (config:removeChatSession handler)
- **Tier:** core
- **Status:** done
- When removeChatSession is called, also delete transcript via transcriptDeleteSession

## T7: Verify
- **Files:** -
- **Tier:** verify
- **Status:** done
- `pnpm typecheck` passes
- No new type errors introduced
