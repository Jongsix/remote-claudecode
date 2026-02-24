# Technology Stack

## Overview

remote-claudecode is a TypeScript ESM application targeting Node.js 22+. It bridges the Discord API and a locally running Claude Code instance using the Claude Code Agent SDK for direct in-process AI execution. The stack is intentionally minimal: no web framework, no ORM, no message broker. All persistence is file-based JSON to keep deployment simple and portable.

## Language and Runtime

### TypeScript 5.9.3
- **Strict mode** enabled (`"strict": true`) catches null/undefined errors and enforces explicit typing across the entire codebase.
- **ESM** output via `"type": "module"` in package.json. Module resolution uses Node16 (`"module": "Node16"`, `"moduleResolution": "Node16"`).
- **Target**: ES2022 with Node 22 library typings (`@types/node 25.1.0`).
- Compiled to `dist/` via `tsc`. No bundler (webpack/esbuild) is used; the `dist/` directory is the deployable artifact.
- Since `rootDir` is `"./"`, compiled output preserves the `src/` directory structure under `dist/src/`.

### Node.js 22+
- Required for native ESM support, `node:` protocol imports, and stable `fetch` API.
- The Claude Code Agent SDK runs in-process and does not require native addons. The Docker build pins Node 22 Alpine to avoid binary incompatibilities.

## Core Frameworks and Libraries

### Discord.js 14.25.1
Discord.js is the primary application framework. It handles the Discord WebSocket gateway connection, REST API calls for slash command registration and message management, and the event emitter model that drives the bot's interaction loop.

**Rationale**: Discord.js is the canonical TypeScript-typed Discord library with the largest community, most complete API coverage, and active maintenance. v14 added stable support for Discord Interactions (slash commands, buttons, modals) which the bot relies on extensively.

Key APIs used:
- `Client` with `GatewayIntentBits.Guilds`, `GuildMessages`, `MessageContent` intents
- `SlashCommandBuilder` for type-safe command definition
- `ChatInputCommandInteraction`, `ButtonInteraction` for interaction handling
- `ThreadChannel`, `Message` for output display

### Commander 13.1.0
Commander provides the CLI layer (`src/cli.ts`). It parses `process.argv` and routes to subcommands: `setup`, `start`, `deploy`, `config`, `allow`.

**Rationale**: Commander is the most widely adopted Node CLI framework with zero runtime dependencies. It is used only for the setup and management CLI surface; the bot itself runs as a long-lived process after `start`.

### @clack/prompts 0.9.1
Used exclusively in `src/setup/wizard.ts` for the interactive terminal setup experience. Provides styled prompts, spinners, and confirmation dialogs.

**Rationale**: `@clack/prompts` produces a polished terminal UI with minimal code and no heavy dependencies, appropriate for a one-time setup flow.

### @anthropic-ai/claude-agent-sdk 0.2.51
Provides the Claude Code Agent SDK for programmatic integration. The `query()` function returns an async generator that streams AI responses in real-time. Supports session management via `resume` option, model selection, and permission control.

**Rationale**: Replaces the previous HTTP/SSE architecture (opencode serve + eventsource + node-pty) with a single in-process SDK call, eliminating process management, port allocation, and network communication overhead.

### open 10.1.0
Opens URLs or files in the system default application. Used in the setup wizard to open browser-based authentication flows.

### picocolors 1.1.1
Zero-dependency terminal color library used in CLI output formatting. Chosen over `chalk` for its smaller size and ESM compatibility.

### update-notifier 7.3.1
Checks npm for new versions of the package on startup and notifies the user in the terminal. Runs in the background without blocking startup.

## Development Dependencies

### Vitest 4.0.18
Test framework for unit and integration tests. Vitest was chosen over Jest because it is natively ESM-compatible without the complex transform configuration that Jest requires for ESM projects. It shares Vite's configuration model and provides a compatible Jest API surface for easy migration.

Test configuration is in `vitest.config.ts`. Six test suites cover the core service layer. Coverage uses the V8 provider with `text` and `html` reporters.

### ts-node 10.9.2
Used for running TypeScript files directly during development. Invoked via `node --loader ts-node/esm` in the `dev` npm script.

### typescript 5.9.3 (dev)
The TypeScript compiler. In production, only the compiled `dist/` output is needed; TypeScript itself is a dev-only dependency.

### @types/update-notifier 6.0.8
Type definitions for the `update-notifier` package, required for TypeScript compilation.

## Build System

### TypeScript Compiler (tsc)
The build pipeline is intentionally simple:

```
npm run build  →  tsc  →  dist/src/
```

No bundler, no tree-shaking, no minification. The `dist/` directory mirrors the project root structure with `.js` files replacing `.ts` files. Since `rootDir` is `"./"`, the compiled entry points live at `dist/src/cli.js` and `dist/src/bot.js`.

**tsconfig.json key settings:**
- `"module": "Node16"` — Node16 module system
- `"moduleResolution": "Node16"` — Node16 module resolution
- `"outDir": "./dist"` — compiled output location
- `"rootDir": "./"` — source root (output preserves directory structure)
- `"strict": true` — full strict mode
- `"target": "ES2022"` — modern JavaScript output without downcompilation overhead
- `"esModuleInterop": true` — allows default imports from CommonJS modules

### Docker Multi-Stage Build
The `Dockerfile` uses three stages:

**Stage 1 (deps):** Node 22 Alpine image. Runs `npm ci --only=production` to install only production dependencies. Output is the production `node_modules/`.

**Stage 2 (build):** Node 22 Alpine image with full dev dependencies. Runs `npm ci` and `npm run build`. Output is `dist/`.

**Stage 3 (production):** Fresh Node 22 Alpine image. Installs `tini` for proper PID 1 signal handling. Creates a non-root `nodejs` user. Copies production `node_modules/` from Stage 1 and `dist/` from Stage 2. Runs `node dist/index.js`.

This produces a smaller final image by excluding TypeScript compiler, type definitions, and test frameworks from the deployed artifact.

**Health check:** The `docker-compose.yml` defines a health check that runs `node -e "console.log('healthy')"` every 30 seconds with a 5-second timeout and 3 retries after a 10-second start period.

`docker-compose.yml` uses an `.env` file for environment variables and mounts `./data:/app/data` for data persistence. Note: the container name may need to be updated from the legacy `discord-opencode-relay` name.

## Runtime Configuration

### Bot Configuration (`~/.remote-claudecode/config.json`)
Stores credentials and static settings that change infrequently:

| Key | Description |
|-----|-------------|
| `bot.discordToken` | Discord bot token |
| `bot.clientId` | Discord application client ID |
| `bot.guildId` | Target Discord server ID |
| `allowedUserIds` | Array of Discord user IDs permitted to use the bot |

Written by the setup wizard, read at startup by `ConfigStore`.

### Application Data (`~/.remote-claudecode/data.json`)
Stores mutable runtime state:

| Key | Description |
|-----|-------------|
| `projects` | Registered local repository paths and metadata |
| `bindings` | Channel-to-project mappings |
| `sessions` | Active Claude Code session state per channel |
| `worktrees` | Metadata about created Git worktrees |
| `queues` | Pending task queues per channel |

Read and written at runtime by `DataStore`. Both files are stored in the user's home directory to survive Docker container recreation when the volume mount is configured.

### Environment Variables
When using Docker Compose, environment variables are loaded from an `.env` file. The following variables may be configured:

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token (alternative to config.json) |
| `NODE_ENV` | Runtime environment (production/development) |

## Development Environment Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 22.x or later | Required for stable ESM and native `fetch` |
| npm | 10.x or later | Bundled with Node 22 |
| Git | 2.x or later | Required for worktree operations |
| Claude Code | Latest | Must be installed and authenticated separately |
| Discord Bot | — | Bot token, client ID, and guild ID from Discord Developer Portal |

### Local Setup Steps
1. Clone the repository.
2. Run `npm install` to install all dependencies.
3. Run `npm run setup` (or `node dist/src/cli.js setup` after build) to launch the configuration wizard.
4. Run `npm run deploy-commands` to build and register slash commands with Discord.
5. Run `npm start` to start the bot.

### npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `start` | `node --no-deprecation dist/src/cli.js start` | Start the bot from compiled output (suppresses deprecation warnings) |
| `dev` | `node --loader ts-node/esm src/cli.ts` | Start the bot directly from TypeScript source |
| `deploy-commands` | `npm run build && node dist/src/cli.js deploy` | Build and register slash commands with Discord API |
| `test` | `vitest` | Run tests in watch mode |
| `prepublishOnly` | `npm run build` | Automatically build before npm publish |
| `release` | `npm version patch && npm run build && npm publish` | Publish a patch release |
| `release:minor` | `npm version minor && npm run build && npm publish` | Publish a minor release |
| `release:major` | `npm version major && npm run build && npm publish` | Publish a major release |

## Package Manager

**npm** is the package manager. `package-lock.json` is committed to ensure deterministic installs. `node_modules/` is excluded from version control via `.gitignore`.
