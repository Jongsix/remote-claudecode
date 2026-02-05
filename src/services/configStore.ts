import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface BotConfig {
  discordToken: string;
  clientId: string;
  guildId: string;
}

export interface PortConfig {
  min: number;
  max: number;
}

export interface AppConfig {
  bot?: BotConfig;
  ports?: PortConfig;
}

const CONFIG_DIR = join(homedir(), '.remote-opencode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function loadConfig(): AppConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as AppConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getBotConfig(): BotConfig | undefined {
  return loadConfig().bot;
}

export function setBotConfig(bot: BotConfig): void {
  const config = loadConfig();
  config.bot = bot;
  saveConfig(config);
}

export function getPortConfig(): PortConfig | undefined {
  return loadConfig().ports;
}

export function setPortConfig(ports: PortConfig): void {
  const config = loadConfig();
  config.ports = ports;
  saveConfig(config);
}

export function hasBotConfig(): boolean {
  const bot = getBotConfig();
  return !!(bot?.discordToken && bot?.clientId && bot?.guildId);
}

export function clearBotConfig(): void {
  const config = loadConfig();
  delete config.bot;
  saveConfig(config);
}
