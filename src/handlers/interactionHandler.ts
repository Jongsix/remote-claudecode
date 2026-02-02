import { Interaction } from 'discord.js';
import { commands } from '../commands/index.js';
import { handleButton } from './buttonHandler.js';

export async function handleInteraction(interaction: Interaction) {
  if (interaction.isButton()) {
    await handleButton(interaction);
    return;
  }
  
  if (!interaction.isChatInputCommand()) return;
  
  const command = commands.get(interaction.commandName);
  
  if (!command) {
    return;
  }
  
  try {
    await command.execute(interaction);
  } catch (error) {
    const content = '❌ An error occurred while executing the command.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}
