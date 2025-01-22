import { promises as fs } from 'fs';
import * as path from 'path';
import { Context } from 'telegraf';
import { getUserInfo, getUsersFromDB } from '../models/users';

type DatabaseAdmin = {
  id: number;
  telegramId: number;
  username: string;
};

export type UserData = {
  userId: string;
  notified: boolean;
  adminId: number;
};

const DATA_DIR = '/app/data';
const CONFIG_FILE = 'config.json';
const configFilePath = path.join(DATA_DIR, CONFIG_FILE);

const USERS_FILE = 'users.json';
const usersFilePath = path.join(DATA_DIR, USERS_FILE);

// Ensure the directory exists
const ensureDataDirectoryExists = async () => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error(`Error creating data directory at ${DATA_DIR}:`, err);
  }
};

// Load users data from users.json
export const loadUsersData = async () => {
  try {
    const data = await fs.readFile(usersFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading users data:', error);
    return [];
  }
};

// Update notified status for a user
export const updateUserNotifiedStatus = async (
  userId: string,
  notified: boolean,
  adminId: number
) => {
  const usersData: UserData[] = await loadUsersData();
  const userIndex = usersData.findIndex(user => user.userId === userId);

  if (userIndex >= 0) {
    // Update existing user's notification status
    usersData[userIndex].notified = notified;
    usersData[userIndex].adminId = adminId; // Ensure adminId is updated
  } else {
    // Add new user to the data
    usersData.push({ userId, notified, adminId });
  }

  await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 2));
};

// Function to check if the users.json file exists and contains data
export const isUsersJsonPopulated = async (): Promise<boolean> => {
  try {
    const data = await fs.readFile(usersFilePath, 'utf-8');
    const users = JSON.parse(data);
    return Array.isArray(users) && users.length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist
      return false;
    }
    console.error('Error checking users.json:', error);
    return false;
  }
};

export const populateUsersJson = async () => {
  try {
    const isPopulated = await isUsersJsonPopulated();

    if (isPopulated) {
      console.log('users.json is already populated.');
      return;
    }

    // Fetch users with their admin IDs from the database
    const users = await getUsersFromDB();
    const usersData: UserData[] = [];

    // Process each user to include their admin ID
    for (const user of users) {
      const userInfo = await getUserInfo(user.username);
      if (typeof userInfo === 'string') continue; // user is not found so proceed to next user

      usersData.push({
        userId: user.username,
        notified: false,
        adminId: userInfo.adminId,
      });
    }

    await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 2));
    console.log(
      'Successfully populated users.json with user data from the database.'
    );
  } catch (error) {
    console.error('Error populating users.json:', error);
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
      outdatedSubThreshold: 3,
      timeZone: 'Asia/Tehran',
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

export const getOutdatedSubThreshold = async (): Promise<number> => {
  const config = await loadConfig();
  return config.outdatedSubThreshold || 3;
};

export const setOutdatedSubThreshold = async (value: number): Promise<void> => {
  const config = await loadConfig();
  config.outdatedSubThreshold = value;
  await saveConfig(config);
};

export const getTimeZone = async (): Promise<string> => {
  const config = await loadConfig();
  return config.timeZone || 'Asia/Tehran';
};

export const setTimeZone = async (value: string): Promise<void> => {
  const config = await loadConfig();
  config.timeZone = value;
  await saveConfig(config);
};

export const formatDate = (date: Date, timeZone: string): string => {
  const newDate = new Date(date);
  return newDate.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timeZone,
  });
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
