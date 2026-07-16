# Validation Specification

## Validation Utility: `validateIpc`

### Function Signature
```ts
function validateIpc<T>(channel: string, args: unknown[], schema: IpcSchema): T
```

### Behavior
- Returns the validated, typed args object
- On failure, throws a structured `IpcValidationError` with channel name and human-readable issues
- The IPC handler wraps the call in try/catch and returns `{ ok: false, error }` on validation failure

### Schema Format
Each IPC channel has a schema defining:
- Number of expected arguments
- Per-argument validators (type, shape, value constraints)

### Per-Channel Schemas

| Channel | Args | Validation Rules |
|---------|------|-----------------|
| `api:request` | 1: ApiRequestArgs | `baseUrl`: non-empty string, valid URL, http/https protocol; `path`: string starting with `/`, no `..`; `method`: optional enum GET/POST/PATCH/DELETE; `body`: optional any; `timeoutMs`: optional positive finite number |
| `stream:subscribe` | 1: StreamSubscribeArgs | `subId`: non-empty string; `baseUrl`: valid URL http/https; `path`: string starting with `/`, no `..` |
| `stream:unsubscribe` | 1: string | `subId`: non-empty string |
| `config:addEnvironment` | 3: name, url, kind? | `name`: non-empty string, max 256 chars; `url`: valid URL http/https; `kind`: optional enum direct/ssh/tailscale |
| `config:exchangePairingCode` | 3: baseUrl, code, scope? | `baseUrl`: valid URL http/https; `code`: non-empty string; `scope`: optional enum read-only/operate/admin |
| `config:removeSessionToken` | 1: environmentId | non-empty string |
| `config:removeEnvironment` | 1: id | non-empty string |
| `config:addEndpoint` | 3: environmentId, url, kind | `environmentId`: non-empty string; `url`: valid URL http/https; `kind`: enum direct/ssh/tailscale |
| `config:removeEndpoint` | 2: environmentId, endpointId | both non-empty strings |
| `config:setActiveEndpoint` | 2: environmentId, endpointId | both non-empty strings |
| `config:setSelectedEnvironmentId` | 1: id or null | string or null |
| `config:migrateFromLocalStorage` | 2: rawInstances, rawSelectedId | `rawInstances`: non-empty string; `rawSelectedId`: string or null |
| `connection:getStatus` | 1: environmentId | non-empty string |
| `connection:getEndpointHealth` | 1: environmentId | non-empty string |
| `connection:retry` | 1: environmentId | non-empty string |
| `connection:networkChanged` | 1: online | boolean |
| `vmWizard:start` | 2: target, name? | `target`: non-empty string, max 512 chars, no shell metacharacters; `name`: optional string |
| `vmWizard:respondConsent` | 1: decision | enum "install"/"skip" |
| `vmWizard:respondServiceSelection` | 1: selection | object with boolean fields matching VmWizardServiceSelection |
| `opencode:getStatus` | 1: environmentId | non-empty string |
| `opencode:refreshStatus` | 1: environmentId | non-empty string |
| `config:setOpenCodeEndpoint` | 2: environmentId, endpoint | `environmentId`: non-empty string; `endpoint`: null or object with `url` (non-empty string) and `password` (string or null) |
| `config:setMainVm` | 1: environmentId | non-empty string |
| `infra:executeAction` | 1: InfraActionArgs | `action`: enum "machine-status"/"clone-repo"; `params`: optional object; if action="clone-repo", params.repoUrl must be non-empty string |

### Error Handling
- On validation failure: return `{ ok: false, error: "ipc.validationFailed" }` for handlers that return `ApiResponse`-like shapes
- For handlers that return void or simple types: throw `IpcValidationError` which is caught at the Electron IPC boundary and returned as an error to the renderer
