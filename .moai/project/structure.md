# Project Structure

## Directory Tree

```
remote-claudecode/
├── src/
│   ├── commands/          # Discord slash command definitions (10 commands + index)
│   ├── handlers/          # Discord event handler implementations (3 handlers)
│   ├── services/          # Business logic and state management (7 services)
│   ├── setup/             # Interactive setup and command deployment utilities
│   ├── types/             # Shared TypeScript type definitions
│   ├── utils/             # Standalone utility functions (2 modules)
│   ├── __tests__/         # Vitest test suites (4 suites)
│   ├── bot.ts             # Discord client initialization entry point
│   └── cli.ts             # CLI entry point with Commander subcommands
├── .moai/
│   ├── config/            # MoAI-ADK configuration sections
│   ├── project/           # Project documentation (this directory)
│   └── specs/             # SPEC documents for planned features
├── .claude/               # Claude Code agent and skill definitions
├── .github/               # GitHub workflows and CI configuration
├── dist/                  # Compiled JavaScript output (tsc target, mirrors src/ under dist/src/)
├── Dockerfile             # Multi-stage Docker build definition (3 stages)
├── docker-compose.yml     # Docker Compose service configuration
├── package.json           # NPM package manifest and scripts
├── tsconfig.json          # TypeScript compiler configuration
└── vitest.config.ts       # Vitest test runner configuration
```

## Directory Purposes

### `src/commands/`
Contains one file per Discord slash command. Each file exports a `data` property (SlashCommandBuilder definition) and an `execute` function that handles the interaction. Commands are registered with Discord's API via `src/setup/deploy.ts`.

| File | Command | Purpose |
|------|---------|---------|
| `claude.ts` | `/claude` | Primary command to send a coding task to Claude Code |
| `work.ts` | `/work` | Start a work session with a specific prompt |
| `code.ts` | `/code` | Toggle passthrough mode for the current thread |
| `queue.ts` | `/queue` | View or manage the current task queue |
| `model.ts` | `/model` | Switch the Claude Code model for the current channel |
| `setpath.ts` | `/setpath` | Set the working directory path for the active project |
| `use.ts` | `/use` | Bind a registered project to the current channel |
| `autowork.ts` | `/autowork` | Toggle automatic worktree creation for the current project |
| `projects.ts` | `/projects` | List and manage registered projects |
| `allow.ts` | `/allow` | Manage the user allowlist for bot access |
| `index.ts` | — | Re-exports all command definitions for centralized loading |

### `src/handlers/`
Contains event handler modules that are registered on the Discord client at startup. Each handler responds to a specific Discord.js event.

| File | Event | Responsibility |
|------|-------|---------------|
| `interactionHandler.ts` | `interactionCreate` | Routes slash command interactions to the appropriate command module |
| `buttonHandler.ts` | `interactionCreate` (button) | Handles button component interactions (interrupt, delete worktree, create PR) |
| `messageHandler.ts` | `messageCreate` | Implements passthrough mode by forwarding plain messages to Claude Code |

### `src/services/`
Contains all business logic. Services are instantiated once and shared across commands and handlers via dependency injection or module-level singletons.

| File | Service | Responsibility |
|------|---------|---------------|
| `executionService.ts` | ExecutionService | Orchestrates prompt execution with Discord message updates |
| `claudeService.ts` | ClaudeService | Claude Code SDK wrapper with ClaudeExecution class for in-process prompt execution |
| `sessionManager.ts` | SessionManager | Tracks active Claude Code sessions per thread and delegates interrupts to SDK |
| `queueManager.ts` | QueueManager | Manages ordered task queues per channel |
| `worktreeManager.ts` | WorktreeManager | Creates and deletes Git worktrees for isolated task branches |
| `dataStore.ts` | DataStore | Reads and writes `~/.remote-claudecode/data.json` (projects, bindings, sessions) |
| `configStore.ts` | ConfigStore | Reads and writes `~/.remote-claudecode/config.json` (bot credentials, settings) |

### `src/setup/`
Utilities that are invoked from the CLI rather than the running bot.

| File | Purpose |
|------|---------|
| `wizard.ts` | Interactive terminal wizard using `@clack/prompts` to collect Discord credentials and write the initial config file |
| `deploy.ts` | Registers or updates slash command definitions with the Discord API for the configured guild |

### `src/types/`
| File | Purpose |
|------|---------|
| `index.ts` | Central TypeScript interface definitions: `Project`, `Session`, `QueueItem`, `Config`, `BotData`, and other shared types used across the codebase |

### `src/utils/`
Utility modules that provide Discord-related helper functions used by commands and handlers.

| File | Purpose |
|------|---------|
| `messageFormatter.ts` | Pure formatting utilities for splitting long text into Discord-safe chunks and rendering Claude Code output |
| `threadHelper.ts` | Standalone helpers for Discord thread creation and message management |

### `src/__tests__/`
Vitest test suites organized to mirror the `src/` structure. Each suite covers a specific service or utility module.

| Suite | Scope |
|-------|-------|
| `auth.test.ts` | Authentication flow and credential validation |
| `sessionManager.test.ts` | Session data access, thread-session mapping, and SDK interrupt delegation |
| `queueManager.test.ts` | Queue ordering, busy detection via active execution, and edge cases |
| `messageFormatter.test.ts` | Output chunking and Discord formatting rules |

## Key File Locations

| File | Absolute Path | Role |
|------|---------------|------|
| CLI entry point | `src/cli.ts` | Commander root with `setup`, `start`, `deploy`, `config`, `allow` subcommands |
| Bot entry point | `src/bot.ts` | Initializes Discord.js Client and registers all handlers and commands |
| Type definitions | `src/types/index.ts` | Single source of truth for all shared TypeScript interfaces |
| Config schema | `src/services/configStore.ts` | Defines and validates `~/.remote-claudecode/config.json` |
| Data schema | `src/services/dataStore.ts` | Defines and validates `~/.remote-claudecode/data.json` |
| Docker build | `Dockerfile` | Three-stage build: deps installs production deps; build compiles TypeScript; production runs `dist/index.js` |
| Compose config | `docker-compose.yml` | Defines the bot service with volume mounts, `.env` file, and health check |
| TS config | `tsconfig.json` | Strict mode, Node16 module resolution, target `dist/`, ES2022 output |
| Test config | `vitest.config.ts` | Vitest configuration with V8 coverage provider |

## Module Organization

The codebase follows a layered architecture:

```
CLI / Discord Events
        |
    Commands + Handlers   (src/commands/, src/handlers/)
        |
      Services            (src/services/)
        |
      Utils               (src/utils/)
        |
  Claude Code SDK / Discord API / File System
```

- **Commands and Handlers** are thin interaction layers. They validate inputs, delegate to services, and format responses. They contain no business logic.
- **Services** encapsulate all state and business logic. Services communicate with external systems (Claude Code process, Discord API, filesystem) and with each other through direct imports.
- **Utils** provide Discord-related helper functions (message formatting, thread management) used across commands and services.
- **Types** provide compile-time contracts between all layers.

The runtime configuration split between `configStore` (credentials, port range) and `dataStore` (projects, sessions, queues) separates stable settings from frequently mutating application state.
