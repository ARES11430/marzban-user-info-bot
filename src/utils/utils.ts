import { promises as fs } from 'fs';
import * as path from 'path';
import { Context } from 'telegraf';

type DatabaseAdmin = {
  id: number;
  telegramId: number;
  username: string;
};

const DATA_DIR = '/app/data';
const CONFIG_FILE = 'config.json';
const configFilePath = path.join(DATA_DIR, CONFIG_FILE);

// Ensure the directory exists
const ensureDataDirectoryExists = async () => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error(`Error creating data directory at ${DATA_DIR}:`, err);
  }
};

// Load config file
const loadConfig = async () => {
  await ensureDataDirectoryExists();
  try {
    const data = await fs.readFile(configFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log(
      `No existing config found at ${configFilePath}, creating default config`
    );
    // Return default structure if the file does not exist
    const defaultConfig = {
      telegramAdmins: [],
      dataBaseAdmins: [],
      trafficThreshold: 5,
    };
    // Save the default config immediately
    await saveConfig(defaultConfig);
    return defaultConfig;
  }
};

// Save config file
const saveConfig = async (config: object) => {
  await ensureDataDirectoryExists();
  try {
    await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
    console.log(`Successfully saved config to: ${configFilePath}`);
  } catch (error) {
    console.error(`Error saving config to ${configFilePath}:`, error);
    throw error;
  }
};

// Rest of your functions remain the same
export const addDatabaseAdmin = async (admin: DatabaseAdmin) => {
  const config = await loadConfig();
  if (
    !config.dataBaseAdmins.some(
      (existingAdmin: DatabaseAdmin) => existingAdmin.id === admin.id
    )
  ) {
    config.dataBaseAdmins.push(admin);
    await saveConfig(config);
  }
};

export const removeDatabaseAdmin = async (id: number) => {
  const config = await loadConfig();
  config.dataBaseAdmins = config.dataBaseAdmins.filter(
    (admin: DatabaseAdmin) => admin.id !== id
  );
  await saveConfig(config);
};

export const loadDatabaseAdmins = async (): Promise<DatabaseAdmin[]> => {
  const config = await loadConfig();
  return config.dataBaseAdmins || [];
};

export const addTelegramAdminID = async (telegramID: number) => {
  const config = await loadConfig();
  if (!config.telegramAdmins.includes(telegramID)) {
    config.telegramAdmins.push(telegramID);
    await saveConfig(config);
  }
};

export const removeTelegramAdminID = async (telegramID: number) => {
  const config = await loadConfig();
  config.telegramAdmins = config.telegramAdmins.filter(
    (id: number) => id !== telegramID
  );
  await saveConfig(config);
};

export const loadTelegramAdmins = async (): Promise<number[]> => {
  const config = await loadConfig();
  return config.telegramAdmins || [];
};

export const getTrafficThreshold = async (): Promise<number> => {
  const config = await loadConfig();
  return config.trafficThreshold || 5;
};

export const setTrafficThreshold = async (value: number): Promise<void> => {
  const config = await loadConfig();
  config.trafficThreshold = value;
  await saveConfig(config);
};

export const sendLongMessage = async (
  ctx: Context,
  text: string,
  maxLength = 4096
) => {
  // Split the text into chunks while preserving newlines between entries
  const chunks = [];
  const entries = text.split('\n\n');
  let currentChunk = '';

  for (const entry of entries) {
    // If adding this entry would exceed maxLength, push current chunk and start new one
    if ((currentChunk + entry + '\n\n').length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = entry + '\n\n';
    } else {
      currentChunk += entry + '\n\n';
    }
  }

  // Push the last chunk if it's not empty
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  // Send each chunk as a separate message
  for (const chunk of chunks) {
    try {
      await ctx.reply(chunk);
    } catch (error) {
      console.error('Error sending message chunk:', error);
    }
  }
};
