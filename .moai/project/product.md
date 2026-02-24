# Product Documentation

## Project Name

remote-claudecode (npm package name: remote-claudecode v2.0.0)

## Description

A Discord bot that enables developers to control the Claude Code AI coding assistant remotely from Discord. Built on the Claude Code SDK, developers can issue coding tasks, monitor real-time output, manage sessions, and coordinate multi-project workflows entirely through Discord without switching to a terminal.

## Target Audience

- Individual developers who want to trigger AI-assisted coding tasks asynchronously from mobile or remote environments
- Development teams that use Discord as their primary communication platform and want to integrate AI coding workflows into their existing channels
- Engineers running long-running coding sessions on remote servers who need a lightweight interface to monitor and control progress

## Core Features

### 1. Remote AI Coding
Send natural language coding tasks to Claude Code from any Discord channel or thread. The bot forwards the prompt to the Claude Code SDK and streams the response back in real time.

### 2. Real-time Streaming Output
SDK async generator based live output is rendered as progressive Discord message updates, giving users immediate visibility into what Claude Code is doing.

### 3. Session Management
Persistent AI sessions are maintained across multiple interactions within a channel, preserving conversation history and context between commands.

### 4. Task Queueing
Multiple prompts can be queued for sequential processing, enabling batch coding workflows without manual intervention between tasks.

### 5. Git Worktree Integration
Each task can be executed in an isolated Git worktree on a dedicated branch, preventing conflicts between concurrent tasks and enabling clean per-task history.

### 6. Multi-Project Management
Multiple local repositories can be registered and bound to specific Discord channels. Users can switch the active project per channel at any time.

### 7. AI Model Selection
The AI model used by the Claude Code SDK can be changed on a per-channel basis, allowing teams to balance capability and cost for different types of tasks. Available models are discovered via SDK-based model enumeration.

### 8. Passthrough Mode
Direct text messages to the bot in a bound channel are forwarded to Claude Code as prompts, removing the need to use slash commands for routine interactions.

### 9. Access Control
An allowlist restricts which Discord users can issue commands to the bot, preventing unauthorized use in shared servers.

### 10. Interactive Discord UI
Button-based controls in Discord messages allow users to interrupt running tasks, delete worktrees, and create pull requests without additional commands.

### 11. Claude Code SDK Integration
The bot communicates directly with Claude Code through the official SDK, enabling streaming task execution, session management, and model selection without managing a separate HTTP server process.

### 12. Authentication
The bot authenticates with Claude Code using the `ANTHROPIC_API_KEY` environment variable, enabling secure access to the Claude Code SDK.

### 13. Docker Deployment
A multi-stage Docker build with health checks supports containerized production deployment alongside the Claude Code instance.

### 14. CLI Setup Wizard
An interactive terminal wizard guides users through initial configuration of the Discord bot token, client ID, guild ID, and port settings.

## Use Cases

### Asynchronous Development from Mobile
A developer receives a bug report while away from their workstation. They open Discord on their phone, send a task to the bot describing the bug, and monitor the streaming output. When Claude Code produces a fix, they review it and trigger a PR creation, all without opening a laptop.

### Team-Shared AI Coding Channel
A team binds a Discord channel to their monorepo. Team members queue coding tasks throughout the day. The bot processes them sequentially, posting results in threads so the entire team can review Claude Code's output and discuss changes inline.

### Automated Overnight Refactoring
A developer queues a large set of refactoring tasks before ending the workday. The bot processes each task in a separate worktree overnight. In the morning the developer reviews the resulting branches and merges approved changes.

### Remote Server Management
Claude Code runs on a high-powered remote build server. The developer controls it exclusively through Discord, keeping the server headless and cost-efficient while retaining full interactive control over the AI coding session.

## Operational Considerations

### Error Handling
- Discord API errors (rate limiting, permission failures) are caught and reported to the user with actionable messages
- Claude Code process crashes trigger automatic session cleanup and user notification
- SDK execution errors are caught with automatic retry notification

### Security
- Bot tokens and credentials are stored in a local config file (`~/.remote-claudecode/config.json`), not in environment variables by default
- The allowlist system restricts bot usage to authorized Discord user IDs
- Docker deployment runs as a non-root user (`nodejs`) with `tini` for proper signal handling

### Logging
- Console-based logging for bot events, command execution, and error reporting
- No structured logging framework is currently implemented; output goes to stdout/stderr
