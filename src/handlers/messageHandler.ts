import { 
  Message, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ThreadChannel,
  EmbedBuilder
} from 'discord.js';
import * as dataStore from '../services/dataStore.js';
import * as sessionManager from '../services/sessionManager.js';
import * as serveManager from '../services/serveManager.js';
import * as worktreeManager from '../services/worktreeManager.js';
import { SSEClient } from '../services/sseClient.js';
import { formatOutput } from '../utils/messageFormatter.js';

export async function handleMessageCreate(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (message.system) return;
  
  const channel = message.channel;
  if (!channel.isThread()) return;
  
  const threadId = channel.id;
  
  if (!dataStore.isPassthroughEnabled(threadId)) return;
  
  const parentChannelId = (channel as ThreadChannel).parentId;
  if (!parentChannelId) return;
  
  const projectPath = dataStore.getChannelProjectPath(parentChannelId);
  if (!projectPath) {
    await message.reply('❌ No project bound to parent channel. Disable passthrough and use `/use` first.');
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
        
        const prompt = message.content.trim();
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
        
        await channel.send({ embeds: [embed], components: [worktreeButtons] });
      } catch (error) {
        console.error('Auto-worktree creation failed:', error);
        // Continue with main project path (graceful degradation)
      }
    }
  }
  
  const effectivePath = worktreeMapping?.worktreePath ?? projectPath;
  
  const existingClient = sessionManager.getSseClient(threadId);
  if (existingClient && existingClient.isConnected()) {
    await message.react('⏳');
    return;
  }
  
  const prompt = message.content.trim();
  if (!prompt) return;
  
  const buttons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`interrupt_${threadId}`)
        .setLabel('⏸️ Interrupt')
        .setStyle(ButtonStyle.Secondary)
    );
  
  let streamMessage: Message;
  try {
    streamMessage = await channel.send({
      content: `📌 **Prompt**: ${prompt}\n\n🚀 Starting OpenCode server...`,
      components: [buttons]
    });
  } catch {
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
    
    await updateStreamMessage(`📌 **Prompt**: ${prompt}\n\n⏳ Waiting for OpenCode server...`, [buttons]);
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
            `📌 **Prompt**: ${prompt}\n\n\`\`\`\n${formatted}\n\`\`\``,
            [disabledButtons]
          );
          
          await channel.send({ content: '✅ Done' });
          
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
          await updateStreamMessage(`📌 **Prompt**: ${prompt}\n\n❌ Connection error: ${error.message}`, []);
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
            `📌 **Prompt**: ${prompt}\n\n${spinnerChar} **Running...**\n\`\`\`\n${newContent}\n\`\`\``,
            [buttons]
          );
        }
      } catch {
      }
    }, 1000);
    
    await updateStreamMessage(`📌 **Prompt**: ${prompt}\n\n📝 Sending prompt...`, [buttons]);
    await sessionManager.sendPrompt(port, sessionId, prompt);
    
  } catch (error) {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateStreamMessage(`📌 **Prompt**: ${prompt}\n\n❌ OpenCode execution failed: ${errorMessage}`, []);
    
    const client = sessionManager.getSseClient(threadId);
    if (client) {
      client.disconnect();
      sessionManager.clearSseClient(threadId);
    }
  }
}
