import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  MessageFlags,
  Message,
  ThreadChannel
} from 'discord.js';
import * as dataStore from '../services/dataStore.js';
import * as sessionManager from '../services/sessionManager.js';
import * as serveManager from '../services/serveManager.js';
import { SSEClient } from '../services/sseClient.js';
import { getOrCreateThread } from '../utils/threadHelper.js';
import { formatOutput } from '../utils/messageFormatter.js';
import type { Command } from './index.js';

function getParentChannelId(interaction: ChatInputCommandInteraction): string {
  const channel = interaction.channel;
  if (channel?.isThread()) {
    return (channel as ThreadChannel).parentId ?? interaction.channelId;
  }
  return interaction.channelId;
}

export const opencode: Command = {
  data: new SlashCommandBuilder()
    .setName('opencode')
    .setDescription('Send a command to OpenCode')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Prompt to send to OpenCode')
        .setRequired(true)) as SlashCommandBuilder,
  
  async execute(interaction: ChatInputCommandInteraction) {
    const prompt = interaction.options.getString('prompt', true);
    const channelId = getParentChannelId(interaction);
    const isInThread = interaction.channel?.isThread() ?? false;
    
    const projectPath = dataStore.getChannelProjectPath(channelId);
    if (!projectPath) {
      await interaction.reply({
        content: '❌ No project set for this channel. Use `/use <alias>` to set a project.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    let thread;
    try {
      if (isInThread && interaction.channel?.isThread()) {
        thread = interaction.channel;
      } else {
        thread = await getOrCreateThread(interaction, prompt);
      }
    } catch {
      await interaction.reply({
        content: '❌ Cannot create thread.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const threadId = thread.id;
    
    const worktreeMapping = dataStore.getWorktreeMapping(threadId);
    const effectivePath = worktreeMapping?.worktreePath ?? projectPath;
    
    const existingClient = sessionManager.getSseClient(threadId);
    if (existingClient && existingClient.isConnected()) {
      await interaction.reply({
        content: '⚠️ Already running. Wait for completion or press [Interrupt].',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    await interaction.reply({
      content: `📌 **Prompt**: ${prompt}`
    });
    
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`interrupt_${threadId}`)
          .setLabel('⏸️ Interrupt')
          .setStyle(ButtonStyle.Secondary)
      );
    
    let streamMessage: Message;
    try {
      streamMessage = await thread.send({
        content: '🚀 Starting OpenCode server...',
        components: [buttons]
      });
    } catch {
      await interaction.editReply({
        content: `📌 **Prompt**: ${prompt}\n\n❌ Cannot send message to thread.`
      });
      return;
    }
    
    let port: number;
    let sessionId: string;
    let updateInterval: NodeJS.Timeout | null = null;
    let accumulatedText = '';
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
      port = await serveManager.spawnServe(effectivePath);
      
      await updateStreamMessage('⏳ Waiting for OpenCode server...', [buttons]);
      await serveManager.waitForReady(port);
      
      const existingSession = sessionManager.getSessionForThread(threadId);
      if (existingSession && existingSession.projectPath === effectivePath) {
        const isValid = await sessionManager.validateSession(port, existingSession.sessionId);
        if (isValid) {
          sessionId = existingSession.sessionId;
          sessionManager.updateSessionLastUsed(threadId);
        } else {
          sessionId = await sessionManager.createSession(port);
          sessionManager.setSessionForThread(threadId, sessionId, effectivePath, port);
        }
      } else {
        sessionId = await sessionManager.createSession(port);
        sessionManager.setSessionForThread(threadId, sessionId, effectivePath, port);
      }
      
      const sseClient = new SSEClient();
      sseClient.connect(`http://localhost:${port}`);
      sessionManager.setSseClient(threadId, sseClient);
      
      sseClient.onPartUpdated((part) => {
        accumulatedText = part.text;
      });
      
      sseClient.onSessionIdle(() => {
        if (updateInterval) {
          clearInterval(updateInterval);
          updateInterval = null;
        }
        
        (async () => {
          try {
            const formatted = formatOutput(accumulatedText);
            const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`interrupt_${threadId}`)
                  .setLabel('⏸️ Interrupt')
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(true)
              );
            
            await updateStreamMessage(
              `\`\`\`\n${formatted}\n\`\`\``,
              [disabledButtons]
            );
            
            await thread.send({ content: '✅ Done' });
            
            sseClient.disconnect();
            sessionManager.clearSseClient(threadId);
          } catch {
          }
        })();
      });
      
      sseClient.onError((error) => {
        if (updateInterval) {
          clearInterval(updateInterval);
          updateInterval = null;
        }
        
        (async () => {
          try {
            await updateStreamMessage(`❌ Connection error: ${error.message}`, []);
          } catch {
          }
        })();
      });
      
      updateInterval = setInterval(async () => {
        tick++;
        try {
          const formatted = formatOutput(accumulatedText);
          const spinnerChar = spinner[tick % spinner.length];
          const newContent = formatted || 'Processing...';
          
          if (newContent !== lastContent || tick % 2 === 0) {
            lastContent = newContent;
            await updateStreamMessage(
              `${spinnerChar} **Running...**\n\`\`\`\n${newContent}\n\`\`\``,
              [buttons]
            );
          }
        } catch {
        }
      }, 1000);
      
      await updateStreamMessage('📝 Sending prompt...', [buttons]);
      await sessionManager.sendPrompt(port, sessionId, prompt);
      
    } catch (error) {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await updateStreamMessage(`❌ OpenCode execution failed: ${errorMessage}`, []);
      
      const client = sessionManager.getSseClient(threadId);
      if (client) {
        client.disconnect();
        sessionManager.clearSseClient(threadId);
      }
    }
  }
};
