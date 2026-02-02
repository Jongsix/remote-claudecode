import * as p from '@clack/prompts';
import pc from 'picocolors';
import { setBotConfig, getBotConfig, hasBotConfig } from '../services/configStore.js';
import { deployCommands } from './deploy.js';

const DISCORD_DEV_URL = 'https://discord.com/developers/applications';

function validateApplicationId(value: string): string | undefined {
  if (!value) return 'Application ID is required';
  if (!/^\d{17,20}$/.test(value)) return 'Invalid format (should be 17-20 digits)';
  return undefined;
}

function validateToken(value: string): string | undefined {
  if (!value) return 'Bot token is required';
  if (value.length < 50) return 'Invalid token format (too short)';
  return undefined;
}

function validateGuildId(value: string): string | undefined {
  if (!value) return 'Guild ID is required';
  if (!/^\d{17,20}$/.test(value)) return 'Invalid format (should be 17-20 digits)';
  return undefined;
}

export async function runSetupWizard(): Promise<void> {
  console.clear();
  
  p.intro(pc.bgCyan(pc.black(' remote-opencode setup ')));
  
  if (hasBotConfig()) {
    const existing = getBotConfig()!;
    const overwrite = await p.confirm({
      message: `Bot already configured (Client ID: ${existing.clientId}). Reconfigure?`,
      initialValue: false,
    });
    
    if (p.isCancel(overwrite) || !overwrite) {
      p.outro('Setup cancelled.');
      return;
    }
  }
  
  p.note(
    `1. Go to ${pc.cyan(DISCORD_DEV_URL)}\n` +
    `2. Click ${pc.bold('"New Application"')}\n` +
    `3. Give your application a name\n` +
    `4. Copy the ${pc.bold('Application ID')} from "General Information"`,
    'Step 1: Create Discord Application'
  );
  
  const clientId = await p.text({
    message: 'Enter your Discord Application ID:',
    placeholder: 'e.g., 1234567890123456789',
    validate: validateApplicationId,
  });
  
  if (p.isCancel(clientId)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  
  p.note(
    `1. Go to the ${pc.bold('"Bot"')} section in the left sidebar\n` +
    `2. Scroll down to ${pc.bold('"Privileged Gateway Intents"')}\n` +
    `3. Enable these intents:\n` +
    `   • ${pc.green('SERVER MEMBERS INTENT')}\n` +
    `   • ${pc.green('MESSAGE CONTENT INTENT')}\n` +
    `4. Click "Save Changes"`,
    'Step 2: Enable Required Intents'
  );
  
  await p.confirm({
    message: 'Have you enabled the required intents?',
    initialValue: true,
  });
  
  p.note(
    `1. In the ${pc.bold('"Bot"')} section\n` +
    `2. Click ${pc.bold('"Reset Token"')} (or "View Token" if available)\n` +
    `3. Copy the token (it's only shown once!)`,
    'Step 3: Get Bot Token'
  );
  
  const discordToken = await p.password({
    message: 'Enter your Discord Bot Token:',
    validate: validateToken,
  });
  
  if (p.isCancel(discordToken)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  
  p.note(
    `1. Open Discord and go to User Settings > Advanced\n` +
    `2. Enable ${pc.bold('"Developer Mode"')}\n` +
    `3. Right-click on your server name\n` +
    `4. Click ${pc.bold('"Copy Server ID"')}`,
    'Step 4: Get Guild (Server) ID'
  );
  
  const guildId = await p.text({
    message: 'Enter your Discord Guild (Server) ID:',
    placeholder: 'e.g., 1234567890123456789',
    validate: validateGuildId,
  });
  
  if (p.isCancel(guildId)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  
  const s = p.spinner();
  s.start('Saving configuration...');
  
  setBotConfig({
    discordToken: discordToken as string,
    clientId: clientId as string,
    guildId: guildId as string,
  });
  
  s.stop('Configuration saved!');
  
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=2147534848&scope=bot`;
  
  p.note(
    `Open this URL in your browser:\n\n${pc.cyan(inviteUrl)}\n\n` +
    `Select your server and authorize the bot.`,
    'Step 5: Invite Bot to Server'
  );
  
  const invited = await p.confirm({
    message: 'Have you invited the bot to your server?',
    initialValue: true,
  });
  
  if (p.isCancel(invited)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
  
  const shouldDeploy = await p.confirm({
    message: 'Deploy slash commands now?',
    initialValue: true,
  });
  
  if (!p.isCancel(shouldDeploy) && shouldDeploy) {
    s.start('Deploying slash commands...');
    try {
      await deployCommands();
      s.stop('Slash commands deployed!');
    } catch (error) {
      s.stop('Failed to deploy commands');
      console.error(pc.red(`Error: ${error instanceof Error ? error.message : error}`));
    }
  }
  
  p.outro(pc.green('Setup complete! Run "remote-opencode start" to start the bot.'));
}
