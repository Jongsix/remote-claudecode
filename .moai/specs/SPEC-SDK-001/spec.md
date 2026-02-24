# SPEC-SDK-001: OpenCode to Claude Agent SDK Migration

## Overview

Convert the remote-opencode Discord bot from OpenCode CLI HTTP API integration to Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) programmatic integration.

## Current State

- Package name: `remote-opencode` (npm)
- CLI command: `remote-opencode`
- Config directory: `~/.remote-opencode/`
- AI backend: OpenCode CLI via HTTP serve API (`opencode serve --port PORT`)
- Communication: HTTP REST + SSE for streaming
- 18 source files with 72 "opencode" references

## Target State

- Package name: `remote-claudecode` (npm)
- CLI command: `remote-claudecode`
- Config directory: `~/.remote-claudecode/`
- AI backend: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) in-process
- Communication: SDK async generator streaming (no HTTP, no SSE)

## Requirements (EARS Format)

### REQ-1: Package Identity Rename
**When** the project is published or installed,
**the system shall** use `remote-claudecode` as the package name, CLI binary name, and all user-facing identifiers.

Acceptance Criteria:
- [ ] package.json name is `remote-claudecode`
- [ ] package.json bin is `remote-claudecode`
- [ ] package.json description references Claude Code
- [ ] package.json keywords include `claude-code`, `claude`, `claudecode`

### REQ-2: Configuration Directory Migration
**When** the application starts,
**the system shall** use `~/.remote-claudecode/` as the config directory.

Acceptance Criteria:
- [ ] configStore.ts uses `.remote-claudecode` directory
- [ ] dataStore.ts uses `.remote-claudecode` directory

### REQ-3: Claude Agent SDK Integration
**When** a user sends a prompt via Discord,
**the system shall** execute the prompt using the Claude Agent SDK `query()` function instead of OpenCode HTTP API.

Acceptance Criteria:
- [ ] `@anthropic-ai/claude-agent-sdk` added as dependency
- [ ] `opencode-antigravity-auth` removed from dependencies
- [ ] New `claudeService.ts` replaces serveManager + sessionManager + sseClient
- [ ] SDK `query()` used with `cwd` for project path
- [ ] SDK `resume` option used for session continuity
- [ ] SDK `includePartialMessages` used for real-time streaming
- [ ] `permissionMode: 'bypassPermissions'` used for non-interactive execution

### REQ-4: Session Management via SDK
**When** a user continues a conversation in the same Discord thread,
**the system shall** resume the existing Claude session using the SDK's `resume` option.

Acceptance Criteria:
- [ ] Session IDs captured from `SDKSystemMessage` (init)
- [ ] Session IDs stored per Discord thread
- [ ] `resume` option passed to subsequent `query()` calls
- [ ] Session cleanup on thread archive or explicit reset

### REQ-5: Real-time Streaming to Discord
**When** Claude generates a response,
**the system shall** stream partial results to Discord messages in real-time.

Acceptance Criteria:
- [ ] `SDKAssistantMessage` text content extracted and accumulated
- [ ] Discord message updated periodically (1-second interval maintained)
- [ ] Final result displayed with cost/token information from `SDKResultMessage`

### REQ-6: Task Interruption via SDK
**When** a user clicks the Interrupt button in Discord,
**the system shall** call `query.interrupt()` on the active query.

Acceptance Criteria:
- [ ] Active query reference stored per thread
- [ ] Interrupt button triggers SDK interrupt
- [ ] Interrupted state properly communicated to Discord

### REQ-7: Model Selection via SDK
**When** a user uses `/model list`,
**the system shall** retrieve available models using `query.supportedModels()`.
**When** a user uses `/model set`,
**the system shall** pass the model to subsequent `query()` calls via `options.model`.

Acceptance Criteria:
- [ ] `execSync('opencode models')` replaced with SDK `supportedModels()`
- [ ] Model selection stored per channel (existing behavior preserved)
- [ ] Selected model passed to `query()` options

### REQ-8: Slash Command Rename
**When** a user interacts with the bot via Discord,
**the system shall** use `/claude` as the primary prompt command instead of `/opencode`.

Acceptance Criteria:
- [ ] `/opencode` command renamed to `/claude`
- [ ] All command descriptions updated to reference Claude Code
- [ ] `/code` passthrough description updated

### REQ-9: Port Management Removal
**When** the application runs with Claude Agent SDK,
**the system shall not** require port management or the `/setports` command.

Acceptance Criteria:
- [ ] `/setports` command removed or deprecated
- [ ] Port configuration removed from configStore
- [ ] serveManager.ts removed or replaced
- [ ] No orphaned port-checking logic remains

### REQ-10: CLI and UI Text Updates
**When** users interact with the bot or CLI,
**the system shall** display "Claude Code" instead of "OpenCode" in all user-facing text.

Acceptance Criteria:
- [ ] All Discord messages reference "Claude Code"
- [ ] CLI help text references `remote-claudecode`
- [ ] Setup wizard references "Remote Claude Code"
- [ ] Error messages reference Claude Code

### REQ-11: Documentation Update
**When** the migration is complete,
**the system shall** have updated documentation reflecting the new architecture.

Acceptance Criteria:
- [ ] README.md updated for Claude Code SDK
- [ ] CHANGELOG.md has new version entry
- [ ] Architecture diagram updated (no HTTP layer)

## Architecture Design

### New Service: `claudeService.ts`

Replaces: serveManager.ts + sessionManager.ts + sseClient.ts

```
Discord Command
    |
    v
executionService.runPrompt()
    |
    v
claudeService.executePrompt(cwd, prompt, sessionId?, model?)
    |
    v
@anthropic-ai/claude-agent-sdk query()
    |--- SDKSystemMessage (init) --> capture sessionId
    |--- SDKAssistantMessage --> extract text, update Discord
    |--- SDKResultMessage --> final result, cost info
```

Key design decisions:
1. **Event-driven wrapper**: Wrap SDK async generator in a class that emits events
   (compatible with current callback-based executionService pattern)
2. **Session storage**: Store session IDs in dataStore (same as current threadSessions)
3. **No process management**: SDK runs in-process, no spawn/port/health-check needed
4. **Permission bypass**: Use `bypassPermissions` mode since the bot runs trusted

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| package.json | Modify | Rename, update deps |
| src/services/claudeService.ts | **Create** | SDK wrapper (replaces 3 services) |
| src/services/serveManager.ts | **Delete** | Replaced by claudeService |
| src/services/sseClient.ts | **Delete** | Replaced by claudeService |
| src/services/sessionManager.ts | Modify | Simplify to use claudeService |
| src/services/executionService.ts | Modify | Use claudeService instead of HTTP |
| src/services/configStore.ts | Modify | Change config dir |
| src/services/dataStore.ts | Modify | Change data dir |
| src/commands/opencode.ts | Rename/Modify | Rename to claude.ts |
| src/commands/code.ts | Modify | Update descriptions |
| src/commands/model.ts | Modify | Use SDK for model listing |
| src/commands/setports.ts | **Delete** | Port management no longer needed |
| src/commands/index.ts | Modify | Update command registry |
| src/commands/allow.ts | Modify | Update CLI references |
| src/cli.ts | Modify | Rename CLI, update descriptions |
| src/bot.ts | Modify | Update shutdown logic |
| src/handlers/buttonHandler.ts | Modify | Use claudeService for interrupt |
| src/utils/messageFormatter.ts | Modify | Update text parsing |
| src/utils/threadHelper.ts | Modify | Update reason string |
| src/setup/wizard.ts | Modify | Update branding |

## Implementation Phases

### Phase 1: Core SDK Integration (highest risk, do first)
1. Create `claudeService.ts`
2. Rewrite `executionService.ts`
3. Simplify `sessionManager.ts`
4. Update `buttonHandler.ts` (interrupt)

### Phase 2: Naming & Config Migration
5. Update `package.json`
6. Update `configStore.ts` and `dataStore.ts`
7. Rename `opencode.ts` → `claude.ts`
8. Update `commands/index.ts`

### Phase 3: Command & UI Updates
9. Update `cli.ts`
10. Update `code.ts`, `allow.ts`, `model.ts`
11. Remove `setports.ts`
12. Update `bot.ts`, `wizard.ts`
13. Update `threadHelper.ts`, `messageFormatter.ts`

### Phase 4: Cleanup & Documentation
14. Delete `serveManager.ts`, `sseClient.ts`
15. Update tests
16. Update README.md

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| SDK API instability | Medium | Use V1 stable API, not V2 preview |
| Session resume failures | Medium | Fallback to new session on error |
| Streaming performance | Low | Maintain 1s update interval |
| Breaking Discord commands | High | Redeploy commands after rename |
| Config migration for existing users | Medium | Auto-detect old config dir |

## Out of Scope

- Docker/docker-compose updates (separate task)
- npm publishing workflow
- Backward compatibility with OpenCode
- Migration tool for existing configs
