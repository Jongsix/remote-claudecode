import { ButtonInteraction, ThreadChannel, MessageFlags } from 'discord.js';
import * as sessionManager from '../services/sessionManager.js';
import * as dataStore from '../services/dataStore.js';
import * as worktreeManager from '../services/worktreeManager.js';
import { runPrompt } from '../services/executionService.js';

export async function handleButton(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  const [action, threadId] = customId.split('_');

  if (!threadId) {
    await interaction.reply({
      content: '❌ Invalid button.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (action === 'interrupt') {
    await handleInterrupt(interaction, threadId);
  } else if (action === 'delete') {
    await handleWorktreeDelete(interaction, threadId);
  } else if (action === 'pr') {
    await handleWorktreePR(interaction, threadId);
  } else {
    await interaction.reply({
      content: '❌ Unknown action.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleInterrupt(interaction: ButtonInteraction, threadId: string) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const success = await sessionManager.abortSession(threadId);

  if (success) {
    await interaction.editReply({ content: '⏸️ Interrupt request sent.' });
  } else {
    await interaction.editReply({ content: '⚠️ No active execution found or interrupt failed.' });
  }
}

async function handleWorktreeDelete(interaction: ButtonInteraction, threadId: string) {
  const mapping = dataStore.getWorktreeMapping(threadId);
  if (!mapping) {
    await interaction.reply({ content: '⚠️ Worktree mapping not found.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (worktreeManager.worktreeExists(mapping.worktreePath)) {
      await worktreeManager.removeWorktree(mapping.worktreePath, false);
    }

    dataStore.removeWorktreeMapping(threadId);

    const channel = interaction.channel;
    if (channel?.isThread()) {
      await (channel as ThreadChannel).setArchived(true);
    }

    await interaction.editReply({ content: '✅ Worktree deleted and thread archived.' });
  } catch (error) {
    await interaction.editReply({ content: `❌ Failed to delete worktree: ${(error as Error).message}` });
  }
}

async function handleWorktreePR(interaction: ButtonInteraction, threadId: string) {
  const mapping = dataStore.getWorktreeMapping(threadId);
  if (!mapping) {
    await interaction.reply({ content: '⚠️ Worktree mapping not found.', flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.channel;
  const parentChannelId = channel?.isThread() ? (channel as ThreadChannel).parentId! : channel?.id;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const prPrompt = `Create a pull request for the current branch. Include a clear title and description summarizing all changes.`;

    // Use runPrompt to execute the PR creation through the normal flow
    if (channel?.isThread()) {
      await runPrompt(channel as any, threadId, prPrompt, parentChannelId!);
    }

    await interaction.editReply({ content: '🚀 PR creation started! Check the thread for progress.' });
  } catch (error) {
    await interaction.editReply({ content: `❌ Failed to start PR creation: ${(error as Error).message}` });
  }
}
