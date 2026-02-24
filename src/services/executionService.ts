import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  TextBasedChannel,
  EmbedBuilder
} from 'discord.js';
import * as dataStore from './dataStore.js';
import * as worktreeManager from './worktreeManager.js';
import { ClaudeExecution, setActiveExecution, clearActiveExecution } from './claudeService.js';
import { formatOutput, buildContextHeader } from '../utils/messageFormatter.js';
import { processNextInQueue } from './queueManager.js';

export async function runPrompt(
  channel: TextBasedChannel,
  threadId: string,
  prompt: string,
  parentChannelId: string
): Promise<void> {
  const projectPath = dataStore.getChannelProjectPath(parentChannelId);
  if (!projectPath) {
    await (channel as any).send('❌ No project bound to parent channel.');
    return;
  }

  let worktreeMapping = dataStore.getWorktreeMapping(threadId);

  // Auto-create worktree if enabled and no mapping exists for this thread
  if (!worktreeMapping) {
    const projectAlias = dataStore.getChannelBinding(parentChannelId);
    if (projectAlias && dataStore.getProjectAutoWorktree(projectAlias)) {
      try {
        const branchName = worktreeManager.sanitizeBranchName(
          `auto/${threadId.slice(0, 8)}-${Date.now()}`
        );
        const worktreePath = await worktreeManager.createWorktree(projectPath, branchName);

        const newMapping = {
          threadId,
          branchName,
          worktreePath,
          projectPath,
          description: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),
          createdAt: Date.now()
        };
        dataStore.setWorktreeMapping(newMapping);
        worktreeMapping = newMapping;

        const embed = new EmbedBuilder()
          .setTitle(`🌳 Auto-Worktree: ${branchName}`)
          .setDescription('Automatically created for this session')
          .addFields(
            { name: 'Branch', value: branchName, inline: true },
            { name: 'Path', value: worktreePath, inline: true }
          )
          .setColor(0x2ecc71);

        const worktreeButtons = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`delete_${threadId}`)
              .setLabel('Delete')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`pr_${threadId}`)
              .setLabel('Create PR')
              .setStyle(ButtonStyle.Primary)
          );

        await (channel as any).send({ embeds: [embed], components: [worktreeButtons] });
      } catch (error) {
        console.error('Auto-worktree creation failed:', error);
      }
    }
  }

  const effectivePath = worktreeMapping?.worktreePath ?? projectPath;
  const preferredModel = dataStore.getChannelModel(parentChannelId);
  const modelDisplay = preferredModel ? `${preferredModel}` : 'default';

  const branchName = worktreeMapping?.branchName ?? await worktreeManager.getCurrentBranch(effectivePath) ?? 'main';
  const contextHeader = buildContextHeader(branchName, modelDisplay);

  const buttons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`interrupt_${threadId}`)
        .setLabel('⏸️ Interrupt')
        .setStyle(ButtonStyle.Secondary)
    );

  let streamMessage: Message;
  try {
    streamMessage = await (channel as any).send({
      content: `${contextHeader}\n📌 **Prompt**: ${prompt}\n\n🚀 Starting Claude Code...`,
      components: [buttons]
    });
  } catch {
    return;
  }

  let updateInterval: NodeJS.Timeout | null = null;
  let lastContent = '';
  let tick = 0;
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  const updateStreamMessage = async (content: string, components: ActionRowBuilder<ButtonBuilder>[]) => {
    try {
      await streamMessage.edit({ content, components });
    } catch {
    }
  };

  try {
    const settings = dataStore.getQueueSettings(threadId);

    // If fresh context is enabled, clear stored session
    if (settings.freshContext) {
      dataStore.clearThreadSession(threadId);
    }

    // Look up existing session for this thread
    const existingSession = dataStore.getThreadSession(threadId);
    const resumeSessionId = (existingSession && existingSession.projectPath === effectivePath)
      ? existingSession.sessionId
      : undefined;

    await updateStreamMessage(
      `${contextHeader}\n📌 **Prompt**: ${prompt}\n\n📝 Sending prompt to Claude Code...`,
      [buttons],
    );

    // Create and start the SDK execution
    const execution = new ClaudeExecution();
    setActiveExecution(threadId, execution);

    // Periodic Discord message update (reads accumulatedText from execution)
    updateInterval = setInterval(async () => {
      tick++;
      try {
        const formatted = formatOutput(execution.accumulatedText);
        const spinnerChar = spinner[tick % spinner.length];
        const newContent = formatted || 'Processing...';

        if (newContent !== lastContent || tick % 2 === 0) {
          lastContent = newContent;
          await updateStreamMessage(
            `${contextHeader}\n📌 **Prompt**: ${prompt}\n\n${spinnerChar} **Running...**\n\`\`\`\n${newContent}\n\`\`\``,
            [buttons]
          );
        }
      } catch {
      }
    }, 1000);

    // Start the query (fire-and-forget, callbacks handle lifecycle)
    execution.start(
      effectivePath,
      prompt,
      { sessionId: resumeSessionId, model: preferredModel ?? undefined },
      {
        onSessionInit: (sessionId: string) => {
          // Store the new session ID for future resume
          const now = Date.now();
          dataStore.setThreadSession({
            threadId,
            sessionId,
            projectPath: effectivePath,
            port: 0, // No port needed with SDK
            createdAt: now,
            lastUsedAt: now,
          });
        },

        onComplete: async (result) => {
          if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
          }
          clearActiveExecution(threadId);

          try {
            const formatted = formatOutput(result.text);
            const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`interrupt_${threadId}`)
                  .setLabel('⏸️ Interrupt')
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(true)
              );

            await updateStreamMessage(
              `${contextHeader}\n📌 **Prompt**: ${prompt}\n\n\`\`\`\n${formatted}\n\`\`\``,
              [disabledButtons]
            );

            // Build cost info string
            let doneMsg = '✅ Done';
            if (result.cost !== undefined && result.cost > 0) {
              doneMsg += ` | 💰 $${result.cost.toFixed(4)}`;
            }
            if (result.numTurns !== undefined) {
              doneMsg += ` | 🔄 ${result.numTurns} turns`;
            }

            await (channel as any).send({ content: doneMsg });

            // Trigger next in queue
            await processNextInQueue(channel, threadId, parentChannelId);
          } catch (error) {
            console.error('Error in onComplete:', error);
          }
        },

        onError: async (error) => {
          if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
          }
          clearActiveExecution(threadId);

          try {
            await updateStreamMessage(
              `${contextHeader}\n📌 **Prompt**: ${prompt}\n\n❌ Claude Code error: ${error.message}`,
              []
            );

            const settings = dataStore.getQueueSettings(threadId);
            if (settings.continueOnFailure) {
              await processNextInQueue(channel, threadId, parentChannelId);
            } else {
              dataStore.clearQueue(threadId);
              await (channel as any).send('❌ Execution failed. Queue cleared. Use `/queue settings` to change this behavior.');
            }
          } catch {
          }
        },
      },
    );

  } catch (error) {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    clearActiveExecution(threadId);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateStreamMessage(
      `${contextHeader}\n📌 **Prompt**: ${prompt}\n\n❌ Claude Code execution failed: ${errorMessage}`,
      []
    );

    const settings = dataStore.getQueueSettings(threadId);
    if (settings.continueOnFailure) {
      await processNextInQueue(channel, threadId, parentChannelId);
    } else {
      dataStore.clearQueue(threadId);
      await (channel as any).send('❌ Execution failed. Queue cleared.');
    }
  }
}
