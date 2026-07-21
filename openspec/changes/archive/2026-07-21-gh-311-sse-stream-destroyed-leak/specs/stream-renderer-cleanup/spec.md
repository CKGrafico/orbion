## ADDED Requirements

### Requirement: Stream aborted on renderer destruction
The system SHALL abort the SSE stream fetch and clean up the `streams` and `streamEnvironments` Map entries when the `WebContents` that owns the subscription emits the `"destroyed"` event.

#### Scenario: Renderer destroyed mid-stream
- **WHEN** a renderer `WebContents` is destroyed while an SSE stream subscription is active
- **THEN** the subscription's `AbortController` SHALL be aborted, and both `streams` and `streamEnvironments` SHALL have the `subId` entry removed

#### Scenario: Renderer destroyed before fetch resolves
- **WHEN** a renderer `WebContents` is destroyed after `handleStreamSubscribe` starts but before `fetch()` resolves
- **THEN** the `AbortController.signal` SHALL cause the pending `fetch()` to be aborted, and both Maps SHALL be cleaned up

### Requirement: Destroyed listener auto-removes
The system SHALL use `sender.once("destroyed")` to register the cleanup listener so that it automatically removes itself after firing, preventing listener accumulation on long-lived WebContents.

#### Scenario: Listener fires and auto-removes
- **WHEN** the `"destroyed"` event fires on a WebContents
- **THEN** the listener SHALL execute cleanup and SHALL NOT remain registered on any object

### Requirement: Idempotent cleanup
Cleanup via the `"destroyed"` listener, the `finally` block, and the `stream:unsubscribe` handler SHALL all be idempotent. Calling `Map.delete()` or `AbortController.abort()` multiple times for the same `subId` SHALL have no adverse effects.

#### Scenario: Destroyed listener fires after finally block
- **WHEN** the `"destroyed"` listener fires after the `finally` block in `handleStreamSubscribe` has already cleaned up the Maps
- **THEN** the `Map.delete()` calls SHALL be no-ops and `controller.abort()` SHALL be safe

### Requirement: Sender tracked per stream for defensive sweep
The `streams` Map SHALL store both the `AbortController` and the `sender` `WebContents` reference per subscription, enabling identification of orphaned streams whose sender has been destroyed without firing the `"destroyed"` event.

#### Scenario: Streams map stores sender reference
- **WHEN** a new SSE stream subscription is created
- **THEN** the `streams` Map entry for that `subId` SHALL contain the `AbortController` and the `sender` `WebContents`
