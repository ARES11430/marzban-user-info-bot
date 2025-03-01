import dotenv from 'dotenv';
import { Context, Markup, Telegraf } from 'telegraf';
import {
  getAdminID,
  getClients,
  getExpiringUsers,
  getLowTrafficUsers,
  getOutdatedSubscriptionUsers,
  getUserInfo,
  IUserInfo,
} from '../models/users';
import { setupNotificationSystem } from '../notification/adminNotifications';
import { setupNodeNotificationSystem } from '../notification/nodesNotification';
import {
  addDatabaseAdmin,
  addTelegramAdminID,
  formatDate,
  getOutdatedSubThreshold,
  getTimeZone,
  getTrafficThreshold,
  loadDatabaseAdmins,
  loadTelegramAdmins,
  pingHost,
  removeDatabaseAdmin,
  removeTelegramAdminID,
  sendLongMessage,
  setOutdatedSubThreshold,
  setTimeZone,
  setTrafficThreshold,
} from '../utils/utils';

dotenv.config();

const ADMIN_ID = process.env.TELEGRAM_MUI_MAIN_ADMIN_ID;

interface AdminSession {
  username?: string;
  adminId?: number;
  step: 'username' | 'telegramId' | 'complete';
}

const adminSession = new Map<number, AdminSession>();
const trafficThresholdSession = new Set<number>();
const subThresholdSession = new Set<number>();
const userInfoSession = new Set<number>();
const timezoneSession = new Set<number>();
const pingSession = new Set<number>();

const DeviceClients = ['V2ray', 'V2box', 'Streisand', 'Nekoray'];

const TimeZones = [
  'UTC',
  'CET', // Central Europe Time
  'Asia/Tehran', // Iran

  // China (China uses a single timezone for the entire country)
  'Asia/Shanghai',

  // Russia (Major timezones)
  'Europe/Moscow', // Moscow
  'Europe/Kaliningrad', // Western Russia
  'Asia/Yekaterinburg', // Central Russia
  'Asia/Novosibirsk', // Siberia
  'Asia/Vladivostok', // Far East Russia
];

const bot = new Telegraf(process.env.TELEGRAM_MUI_TOKEN!);

const isAdmin = async (ctx: Context) => {
  const telegramAdmins = await loadTelegramAdmins();
  return telegramAdmins.includes(ctx.from?.id ?? 0);
};

const isMainAdmin = (ctx: Context) => {
  return ctx.from?.id === Number(ADMIN_ID);
};

// Get admin database ID from telegram ID
const getAdminDatabaseId = async (telegramId: number) => {
  const admins = await loadDatabaseAdmins();
  const admin = admins.find(a => a.telegramId === telegramId);
  return admin?.id;
};

bot.use(async (ctx, next) => {
  if (isMainAdmin(ctx) || (await isAdmin(ctx))) {
    return next();
  } else {
    console.error('You are not authorized to use this bot.');
    ctx.reply('You are not authorized to use this bot.');
    return;
  }
});

const initializeCommands = async () => {
  await bot.telegram.setMyCommands([
    {
      command: 'commands',
      description: 'See the available commands!',
    },
  ]);
};

const mainAdminButtons = [
  [Markup.button.callback('Users Menu', 'user_management')],
  [Markup.button.callback('Clients Info', 'client_management')],
  [Markup.button.callback('Subscription Menu', 'sub_management')],
  [Markup.button.callback('🏓 Ping Tool', 'start_ping')],
  [Markup.button.callback('Admin Management', 'admin_management')],
  [Markup.button.callback('Settings', 'settings')],
];

const regularAdminButtons = [
  [Markup.button.callback('Expiring Users', 'expiring_users')],
  [Markup.button.callback('Low Traffic Users', 'low_traffic_users')],
  [Markup.button.callback('User Info', 'user_info')],
  [Markup.button.callback('Clients Info', 'clients_info')],
  [Markup.button.callback('Outdated Subscriptions', 'outdated_subs')],
];

bot.command('start', async ctx => {
  console.log('bot started!');
  const buttons = isMainAdmin(ctx) ? mainAdminButtons : regularAdminButtons;

  await ctx.reply(
    'Welcome to the Marzban User Management bot!',
    Markup.inlineKeyboard(buttons)
  );
});

bot.command('commands', async ctx => {
  console.log('List of commands called!');
  const buttons = isMainAdmin(ctx) ? mainAdminButtons : regularAdminButtons;

  await ctx.reply(
    'Bellow is the List of commands\n available for you: ',
    Markup.inlineKeyboard(buttons)
  );
});

bot.action('start_ping', async ctx => {
  if (!isMainAdmin(ctx)) {
    ctx.reply('⚠️ This feature is only available for the main admin');
    return;
  }

  const userId = ctx.from.id;
  pingSession.add(userId);
  ctx.reply('Please enter an IP address or domain to ping:');
});

bot.action('settings', async ctx => {
  console.log('Settings called');
  if (!isMainAdmin(ctx)) {
    console.error('You are not authorized to change settings.');
    ctx.reply('You are not authorized to change settings.');
    return;
  }

  const threshold = await getTrafficThreshold();
  const subThreshold = await getOutdatedSubThreshold();
  const timeZone = await getTimeZone();
  ctx.reply(
    `Current Traffic Threshold: ${threshold} GB\nTo change the threshold, use the command:\n/set_traffic_threshold\n\n
Current Outdated Threshold: ${subThreshold} Days\nTo change it, use the command:\n/set_sub_threshold\n\n
Current Time Zone: ${timeZone}\nTo change it, use the command:\n/set_timezone
    `
  );
});

// Two-Step traffic Threshold Setting
bot.command('set_traffic_threshold', async ctx => {
  console.log('set_traffic_threshold is called');
  if (!isMainAdmin(ctx)) {
    console.error('You are not authorized to change settings.');
    ctx.reply('You are not authorized to change settings.');
    return;
  }

  const userId = ctx.from.id;
  trafficThresholdSession.add(userId);
  ctx.reply('Please enter the new traffic threshold (in GB):');
});

// Two-Step subscription Threshold Setting
bot.command('set_sub_threshold', async ctx => {
  console.log('set_sub_threshold is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('You are not authorized to change settings.');
    return;
  }

  const userId = ctx.from.id;
  subThresholdSession.add(userId);
  ctx.reply('Please enter the new outdated subscription threshold (in Days):');
});

// Time Zone Setting
bot.command('set_timezone', async ctx => {
  console.log('set_timezone is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('You are not authorized to change settings.');
    return;
  }

  const timezones = TimeZones;

  const buttons = timezones.map(timezone =>
    Markup.button.callback(timezone, `choose_timezone_${timezone}`)
  );

  const inlineKeyboard = Markup.inlineKeyboard(
    buttons.map(btn => [btn]) // Arrange buttons vertically
  );

  const userId = ctx.from.id;
  timezoneSession.add(userId);
  await ctx.reply('Select a timezone to set:', inlineKeyboard);
});

// Users Management Menu
bot.action('user_management', async ctx => {
  console.log('user_management is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('You are not authorized to see this menu.');
    return;
  }

  ctx.reply(
    'User Management Menu:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Expiring Users (All)', 'all_expiring_users')],
      [Markup.button.callback('Low Traffic Users (All)', 'all_low_traffic')],
      [Markup.button.callback('My Expiring Users', 'expiring_users')],
      [Markup.button.callback('My Low Traffic Users', 'low_traffic_users')],
      [Markup.button.callback('User Info', 'user_info')],
    ])
  );
});

// Admin Management Menu
bot.action('admin_management', async ctx => {
  console.log('admin_management is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('You are not authorized to manage admins.');
    return;
  }

  ctx.reply(
    'Admin Management Menu:',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('Add Admin', 'add_admin'),
        Markup.button.callback('Remove Admin', 'remove_admin'),
      ],
      [Markup.button.callback('Admin List', 'list_admins')],
    ])
  );
});

// User Clients info Management Menu
bot.action('client_management', async ctx => {
  console.log('client_management is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('You are not authorized to see this Menu.');
    return;
  }

  const mainAdminButtons = [
    [Markup.button.callback('User Clients Info (ALL)', 'all_clients_info')],
    [Markup.button.callback('My Users Client Info', 'clients_info')],
  ];

  await ctx.reply(
    'Bellow is the List of commands\n related Clients Info: ',
    Markup.inlineKeyboard(mainAdminButtons)
  );
});

// Subscription Management Menu
bot.action('sub_management', async ctx => {
  console.log('sub_management is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('You are not authorized to see this Menu.');
    return;
  }

  const mainAdminButtons = [
    [Markup.button.callback('Outdated Subs (ALL)', 'all_outdated_subs')],
    [Markup.button.callback('My Outdated Subs', 'outdated_subs')],
  ];

  await ctx.reply(
    'Bellow is the List of commands\n related to Subscription Info: ',
    Markup.inlineKeyboard(mainAdminButtons)
  );
});

bot.action('add_admin', async ctx => {
  console.log('add_admin is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('Unauthorized access.');
    return;
  }

  const userId = ctx.from?.id;
  if (!userId) return;

  adminSession.set(userId, { step: 'username' });
  ctx.reply(
    `Please enter the username of the admin in Marzban Pannel:\n
(invalid username prevents the bot from working correctly)`
  );
});

bot.action('remove_admin', async ctx => {
  console.log('remove_admin is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('Unauthorized access.');
    return;
  }

  const admins = await loadDatabaseAdmins();
  const buttons = admins.map(admin => [
    Markup.button.callback(
      `Remove ${admin.username}`,
      `remove_admin:${admin.id}`
    ),
  ]);

  ctx.reply('Select an admin to remove:', Markup.inlineKeyboard(buttons));
});

bot.action('list_admins', async ctx => {
  console.log('list_admins is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('Unauthorized access.');
    return;
  }

  const admins = await loadDatabaseAdmins();
  const adminList = admins
    .map(
      admin =>
        `Username: ${admin.username}\nTelegram ID: ${admin.telegramId}\nDatabase ID: ${admin.id}`
    )
    .join('\n\n');

  ctx.reply(`Current Admins:\n\n${adminList || 'No admins found.'}`);
});

bot.action('user_info', ctx => {
  console.log('user_info is called');
  const userId = ctx.from.id;
  userInfoSession.add(userId);
  ctx.reply('Please Enter the username of the User: ');
});

bot.on('text', async ctx => {
  console.log('text received', ctx.message.text);
  const userId = ctx.from.id;

  // Handle traffic threshold-setting session
  if (trafficThresholdSession.has(userId)) {
    const value = parseFloat(ctx.message.text);

    if (isNaN(value) || value <= 0) {
      ctx.reply(
        'Invalid input. Please provide a valid positive number (in GB):'
      );
      return;
    }

    try {
      await setTrafficThreshold(value);
      ctx.reply(`Traffic threshold successfully updated to ${value} GB.`);
    } catch (error) {
      ctx.reply('Error updating threshold. Please try again.');
    }

    trafficThresholdSession.delete(userId); // End session
    return;
  }

  // Handle outdated subscription threshold-setting session
  if (subThresholdSession.has(userId)) {
    const value = parseFloat(ctx.message.text);

    if (isNaN(value) || value <= 0) {
      ctx.reply(
        'Invalid input. Please provide a valid positive number (in Days):'
      );
      return;
    }

    try {
      await setOutdatedSubThreshold(value);
      ctx.reply(
        `Outdated subbscription threshold successfully updated to ${value} Days.`
      );
    } catch (error) {
      ctx.reply('Error updating threshold. Please try again.');
    }

    subThresholdSession.delete(userId); // End session
    return;
  }

  if (userInfoSession.has(userId)) {
    const username = ctx.message.text;
    if (isMainAdmin(ctx)) {
      const userInfo = await getUserInfo(username);
      ctx.reply(await formatUserInfo(userInfo), {
        parse_mode: 'MarkdownV2',
      });
    } else if (await isAdmin(ctx)) {
      const adminId = await getAdminDatabaseId(ctx.from?.id ?? 0);
      if (adminId) {
        const userInfo = await getUserInfo(username, adminId);
        ctx.reply(await formatUserInfo(userInfo), {
          parse_mode: 'MarkdownV2',
        });
      } else {
        ctx.reply(
          'No admin found in config file with your Telegram ID, please double check config data in server!'
        );
      }
    }

    userInfoSession.delete(userId);
    return;
  }

  if (pingSession.has(userId)) {
    const host = ctx.message.text.trim();

    // First check basic length constraints
    if (host.length > 253 || host.length < 3) {
      ctx.reply('❌ Invalid length (3-253 characters required)');
      pingSession.delete(userId);
      return;
    }

    // Then check complex pattern
    if (
      !/^(?!-)([a-zA-Z0-9-]{1,63}(?<!-)\.?)+$|^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(
        host
      )
    ) {
      ctx.reply(
        `❌ Invalid format. Valid formats:\n- example.com\n- 8.8.8.8\n- 2001:db8::1`
      );
      pingSession.delete(userId);
      return;
    }

    try {
      const processingMsg = await ctx.reply(`🔄 Pinging ${host}...`);
      const result = await pingHost(host);

      await ctx.telegram.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        undefined,
        `📡 Ping Results for ${host}:\n\n<code>${result.slice(0, 4000)}</code>`,
        { parse_mode: 'HTML' }
      );
    } catch (error: any) {
      ctx.reply(`❌ Error pinging ${host}: ${error.message}`);
    }

    pingSession.delete(userId);
    return;
  }

  // Handle admin addition sessions
  const session = adminSession.get(userId);
  if (!session) return;

  if (session.step === 'username') {
    const username = ctx.message.text;
    const adminId = await getAdminID(username);

    if (!adminId) {
      ctx.reply('Username not found in database. Please try again:');
      return;
    }

    adminSession.set(userId, {
      username,
      adminId,
      step: 'telegramId',
    });

    ctx.reply('Please enter the Telegram ID for this admin:');
  } else if (session.step === 'telegramId') {
    const telegramId = Number(ctx.message.text);

    if (isNaN(telegramId)) {
      ctx.reply('Invalid Telegram ID. Please enter a valid number:');
      return;
    }

    const { username, adminId } = session;

    if (!username || !adminId) {
      adminSession.delete(userId);
      ctx.reply('Error in admin addition process. Please start over.');
      return;
    }

    try {
      await addDatabaseAdmin({
        id: adminId,
        telegramId,
        username,
      });
      await addTelegramAdminID(telegramId);

      ctx.reply(`Admin ${username} successfully added!`);
      adminSession.delete(userId);
    } catch (error) {
      ctx.reply('Error adding admin. Please try again.');
    }
  }
});

// Handle admin removal
bot.action(/^remove_admin:(\d+)$/, async ctx => {
  console.log('Admin removed is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('Unauthorized access.');
    return;
  }

  const adminId = Number(ctx.match[1]);
  const admins = await loadDatabaseAdmins();
  const admin = admins.find(a => a.id === adminId);

  if (!admin) {
    ctx.reply('Admin not found.');
    return;
  }

  try {
    await removeDatabaseAdmin(adminId);
    await removeTelegramAdminID(admin.telegramId);
    ctx.reply(`Admin ${admin.username} has been removed.`);
  } catch (error) {
    ctx.reply('Error removing admin. Please try again.');
  }
});

bot.action(['all_clients_info', 'clients_info'], async ctx => {
  console.log('clients_info is called');
  const action = ctx.match[0]; // Get the current action (all_clients_info or clients_info)
  const clients = DeviceClients;

  const buttons = clients.map(client =>
    Markup.button.callback(client, `choose_client_${client}_${action}`)
  );

  const inlineKeyboard = Markup.inlineKeyboard(
    buttons.map(btn => [btn]) // Arrange buttons vertically
  );

  await ctx.reply(
    'Select a client to view users associated with it:',
    inlineKeyboard
  );
});

const timezonePattern = new RegExp(`^choose_timezone_(.+)$`);

bot.action(timezonePattern, async ctx => {
  console.log('choose_timezone is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('Unauthorized access.');
    return;
  }

  const userId = ctx.from.id;
  if (timezoneSession.has(userId)) {
    try {
      const timezone = ctx.match?.[1];
      await setTimeZone(timezone);
      await ctx.reply(`Timezone has been set to ${timezone}`);
      userInfoSession.delete(userId);
      return;
    } catch (error) {
      console.error('Error setting timezone:', error);
      ctx.reply('Failed to set timezone. Please try again.');
      userInfoSession.delete(userId);
      return;
    }
  }
});

// Create the regex pattern dynamically from DeviceClients array
const clientPattern = new RegExp(
  `^choose_client_(${DeviceClients.join('|')})_(.+)$`
);

bot.action(clientPattern, async ctx => {
  console.log('choose_client is called');
  const selectedClient = ctx.match?.[1];

  if (!DeviceClients.includes(selectedClient)) {
    await ctx.reply('Error: Unable to determine the selected client.');
    return;
  }

  const action = ctx.match?.[2];

  try {
    const timeZone = await getTimeZone();
    if (action === 'clients_info') {
      const adminId = await getAdminDatabaseId(ctx.from?.id ?? 0);
      if (!adminId) {
        await ctx.reply(
          'No admin found in the config file with your Telegram ID. Please check the config data on the server.'
        );
        return;
      }

      // Fetch users for the selected client under this admin
      const users = await getClients(selectedClient, adminId);
      if (users.length === 0) {
        await ctx.reply(`No user is using: ${selectedClient}`);
        return;
      }

      let message = `Users using ${selectedClient}:\n\n`;
      users.forEach(user => {
        message += `Username: ${user.username}\nClient: ${
          user.client
        }\nLastUpdate: ${formatDate(user.lastUpdate, timeZone)}\n\n`;
      });

      await sendLongMessage(ctx, message);
    } else if (action === 'all_clients_info') {
      if (!isMainAdmin(ctx)) {
        await ctx.reply('Unauthorized access.');
        return;
      }

      // Fetch all users for the selected client
      const users = await getClients(selectedClient);
      if (users.length === 0) {
        await ctx.reply(`No users found for client: ${selectedClient}`);
        return;
      }

      let message = `All users using ${selectedClient}:\n\n`;
      users.forEach(user => {
        message += `Username: ${user.username}\nClient: ${
          user.client
        }\nLastUpdate: ${formatDate(user.lastUpdate, timeZone)}\n\n`;
      });

      await sendLongMessage(ctx, message);
    }
  } catch (error) {
    console.error(error);
    await ctx.reply(`Error fetching users for client: ${selectedClient}`);
  }
});

// Handle outdated subs users
bot.action('outdated_subs', async ctx => {
  console.log('outdated_subs is called');
  const adminId = await getAdminDatabaseId(ctx.from?.id ?? 0);
  if (adminId) {
    try {
      const threshold = await getOutdatedSubThreshold();
      const users = await getOutdatedSubscriptionUsers(threshold, adminId);
      let message = `Users haven't updated their subscription for more than ${threshold} days:\n\n`;
      const timeZone = await getTimeZone();

      users.forEach(user => {
        const date = new Date(user.lastUpdate);
        message += `${user.username} - ${formatDate(date, timeZone)}\n\n`;
      });

      if (users.length === 0) {
        ctx.reply('All users updated their Subscription...');
      } else {
        await sendLongMessage(ctx, message);
      }
    } catch (error) {
      ctx.reply('Error fetching outdated subscription users.');
    }
  } else {
    ctx.reply(
      'No admin found in config file with your Telegram ID, please double check config data in server!'
    );
  }
});

bot.action('all_outdated_subs', async ctx => {
  console.log('all_outdated_subs');
  if (!isMainAdmin(ctx)) {
    ctx.reply('Unauthorized access.');
    return;
  }

  try {
    const threshold = await getOutdatedSubThreshold();
    const users = await getOutdatedSubscriptionUsers(threshold);
    let message = `All the Users haven't updated their subscription for more than ${threshold} days:\n\n`;
    const timeZone = await getTimeZone();

    users.forEach(user => {
      const date = new Date(user.lastUpdate);
      message += `${user.username} - ${formatDate(date, timeZone)}\n\n`;
    });

    if (users.length === 0) {
      ctx.reply('All users updated their Subscription...');
    } else {
      await sendLongMessage(ctx, message);
    }
  } catch (error) {
    ctx.reply('Error fetching all outdated subscription users.');
  }
});

// Handle user data queries
bot.action('low_traffic_users', async ctx => {
  console.log('low_traffic_users');
  const adminId = await getAdminDatabaseId(ctx.from?.id ?? 0);
  if (adminId) {
    try {
      const threshold = await getTrafficThreshold();
      const users = await getLowTrafficUsers(threshold, adminId);
      let message = `Users with Less Than ${threshold} GB Traffic:\n\n`;
      users.forEach(user => {
        message += `${user.username} - ${user.remainingTraffic} GB remaining\n`;
      });
      if (users.length === 0) {
        ctx.reply('no low user traffic found');
      } else {
        await sendLongMessage(ctx, message);
      }
    } catch (error) {
      ctx.reply('Error fetching low traffic users.');
    }
  } else {
    ctx.reply(
      'No admin found in config file with your Telegram ID, please double check config data in server!'
    );
  }
});

bot.action('all_low_traffic', async ctx => {
  console.log('all_low_traffic is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('Unauthorized access.');
    return;
  }

  try {
    const threshold = await getTrafficThreshold();
    const users = await getLowTrafficUsers(threshold);
    let message = `All Users with Less Than ${threshold} GB Traffic:\n\n`;
    users.forEach(user => {
      message += `${user.username} - ${user.remainingTraffic} GB remaining\n`;
    });
    if (users.length === 0) {
      ctx.reply('no low user traffic found');
    } else {
      await sendLongMessage(ctx, message);
    }
  } catch (error) {
    ctx.reply('Error fetching all low traffic users.');
  }
});

bot.action('expiring_users', async ctx => {
  console.log('expiring_users is called');
  const adminId = await getAdminDatabaseId(ctx.from?.id ?? 0);
  if (adminId) {
    try {
      const users = await getExpiringUsers(adminId);
      const message = formatExpiringUsersMessage(users);
      await sendLongMessage(ctx, message);
    } catch (error) {
      ctx.reply('Error fetching expiring users.');
    }
  } else {
    ctx.reply(
      'No admin found in config file with your Telegram ID, please double check config data in server!'
    );
  }
});

bot.action('all_expiring_users', async ctx => {
  console.log('all_expiring_users is called');
  if (!isMainAdmin(ctx)) {
    ctx.reply('Unauthorized access.');
    return;
  }

  try {
    const users = await getExpiringUsers();
    const message = formatExpiringUsersMessage(users, true);
    await sendLongMessage(ctx, message);
  } catch (error) {
    ctx.reply('Error fetching all expiring users.');
  }
});

function formatExpiringUsersMessage(
  users: { today: any[]; tomorrow: any[] },
  isAll: boolean = false
) {
  const prefix = isAll ? 'All ' : '';
  const todayUsers =
    users.today.map(user => user.username).join('\n') || 'None';
  const tomorrowUsers =
    users.tomorrow.map(user => user.username).join('\n') || 'None';

  return `${prefix}Users Expiring Today:\n${todayUsers}\n\n${prefix}Users Expiring Tomorrow:\n${tomorrowUsers}`;
}

async function formatUserInfo(userInfo: IUserInfo) {
  const timeZone = await getTimeZone();

  if (typeof userInfo === 'string') {
    return userInfo;
  }

  const trafficInGB =
    userInfo.dataLimit === null
      ? '∞'
      : (userInfo.remainingTraffic / (1024 * 1024 * 1024)).toFixed(2);

  // Escape special characters for MarkdownV2
  const escapedUsername = userInfo.username.replace(
    /[_*[\]()~`>#+-=|{}.!]/g,
    '\\$&'
  );
  const escapedBelongsTo = userInfo.belongsTo.replace(
    /[_*[\]()~`>#+-=|{}.!]/g,
    '\\$&'
  );
  const escapedStatus = userInfo.status.replace(
    /[_*[\]()~`>#+-=|{}.!]/g,
    '\\$&'
  );
  const escapedTraffic = trafficInGB.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
  const escapedNote = (userInfo.note || 'N/A').replace(
    /[_*[\]()~`>#+-=|{}.!]/g,
    '\\$&'
  );
  const escapedDevice = (userInfo.subLastUserAgent || 'none').replace(
    /[_*[\]()~`>#+-=|{}.!]/g,
    '\\$&'
  );
  const escapedOnline = (
    formatDate(userInfo.onlineAt, timeZone) || 'never'
  ).replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
  const escapedSubUpdate = (
    formatDate(userInfo.subUpdatedAt, timeZone) || 'never'
  ).replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
  const escapedExpiration = userInfo.expirationDate
    ? formatDate(userInfo.expirationDate, timeZone)
    : 'Never';

  // Escape expiration date to prevent MarkdownV2 errors
  const escapedExpirationDate = escapedExpiration.replace(
    /[_*[\]()~`>#+-=|{}.!]/g,
    '\\$&'
  );

  return `
*👤 User Info:*

*🪪 Username:* ${escapedUsername}
*📋 Status:* ${escapedStatus}
*📝 Note:* ${escapedNote}

*💾 Remaining Traffic:* ${escapedTraffic} GB
*📅 Expiration Date:* ${escapedExpirationDate}

*🕒 Last Online At:* ${escapedOnline}
*🔄 Last Sub Updated:* ${escapedSubUpdate}

*📱 Last User Device:* ${escapedDevice}

*👤 Belongs to: * \\#${escapedBelongsTo}
`;
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Initialize notification system
const notificationSystem = setupNotificationSystem({
  bot,
});

// Start checking every hour (you can adjust the interval)
notificationSystem.startNotificationSystem(1);

// Start node notification services
const nodeNotifier = setupNodeNotificationSystem({ bot });
nodeNotifier.start(1);

initializeCommands()
  .then(() => {
    bot.launch().then(() => {
      console.log('Marzban User Management bot started successfully.');
    });
  })
  .catch(err => console.error('Error initializing commands:', err));
