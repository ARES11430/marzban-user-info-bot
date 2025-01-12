import dotenv from 'dotenv';
import { Context, Markup, Telegraf } from 'telegraf';
import {
     getAdminID,
     getClients,
     getExpiringUsers,
     getLowTrafficUsers,
     getUserInfo,
     IUserInfo,
} from '../models/users';
import {
     addDatabaseAdmin,
     addTelegramAdminID,
     getTrafficThreshold,
     loadDatabaseAdmins,
     loadTelegramAdmins,
     removeDatabaseAdmin,
     removeTelegramAdminID,
     sendLongMessage,
     setTrafficThreshold,
} from '../utils/utils';

dotenv.config();

const ADMIN_ID = process.env.TELEGRAM_MUI_MAIN_ADMIN_ID;

interface AdminSession {
     username?: string;
     adminId?: number;
     step: 'username' | 'telegramId' | 'complete';
}

const sessions = new Map<number, AdminSession>();
const thresholdSessions = new Set<number>();
const userInfoSessions = new Set<number>();

const DeviceClients = ['V2ray', 'V2box', 'Streisand', 'Nekoray'];

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
     const admin = admins.find((a) => a.telegramId === telegramId);
     return admin?.id;
};

bot.use(async (ctx, next) => {
     if (isMainAdmin(ctx) || (await isAdmin(ctx))) {
          return next();
     } else {
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
     [Markup.button.callback('Users', 'user_management')],
     [Markup.button.callback('User Clients Info', 'client_management')],
     [Markup.button.callback('Admins', 'admin_management')],
     [Markup.button.callback('Settings', 'settings')],
];

const regularAdminButtons = [
     [Markup.button.callback('Expiring Users', 'expiring_users')],
     [Markup.button.callback('Low Traffic Users', 'low_traffic_users')],
     [Markup.button.callback('User Info', 'user_info')],
];

bot.command('start', async (ctx) => {
     const buttons = isMainAdmin(ctx) ? mainAdminButtons : regularAdminButtons;

     await ctx.reply('Welcome to the Marzban User Management bot!', Markup.inlineKeyboard(buttons));
});

bot.command('commands', async (ctx) => {
     const buttons = isMainAdmin(ctx) ? mainAdminButtons : regularAdminButtons;

     await ctx.reply('Bellow is the List of commands\n available for you: ', Markup.inlineKeyboard(buttons));
});

bot.action('settings', async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('You are not authorized to access settings.');
          return;
     }

     const threshold = await getTrafficThreshold();
     ctx.reply(
          `Current Traffic Threshold: ${threshold} GB\n\nTo change the threshold, use the command:\n/set_threshold`
     );
});

// Two-Step Threshold Setting
bot.command('set_threshold', async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('You are not authorized to change settings.');
          return;
     }

     const userId = ctx.from.id;
     thresholdSessions.add(userId);
     ctx.reply('Please enter the new traffic threshold (in GB):');
});

// Users Management Menu
bot.action('user_management', async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('You are not authorized to manage admins.');
          return;
     }

     ctx.reply(
          'User Management Menu:',
          Markup.inlineKeyboard([
               [Markup.button.callback('Expiring Users (All)', 'all_expiring')],
               [Markup.button.callback('Low Traffic Users (All)', 'all_low_traffic')],
               [Markup.button.callback('My Expiring Users', 'expiring_users')],
               [Markup.button.callback('My Low Traffic Users', 'low_traffic_users')],
               [Markup.button.callback('User Info', 'user_info')],
          ])
     );
});

// Admin Management Menu
bot.action('admin_management', async (ctx) => {
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
bot.action('client_management', async (ctx) => {
     const mainAdminButtons = [
          [Markup.button.callback('User Clients Info (ALL)', 'all_clients_info')],
          [Markup.button.callback('My Users Client Info', 'clients_info')],
     ];

     const regularAdminButtons = [[Markup.button.callback('My Users Client Info', 'clients_info')]];

     const buttons = isMainAdmin(ctx) ? mainAdminButtons : regularAdminButtons;

     await ctx.reply(
          'Bellow is the List of commands\n related Clients Info: ',
          Markup.inlineKeyboard(buttons)
     );
});

bot.action('add_admin', async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('Unauthorized access.');
          return;
     }

     const userId = ctx.from?.id;
     if (!userId) return;

     sessions.set(userId, { step: 'username' });
     ctx.reply(
          `Please enter the username of the admin in Marzban Pannel:\n
(invalid username prevents the bot from working correctly)`
     );
});

bot.action('remove_admin', async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('Unauthorized access.');
          return;
     }

     const admins = await loadDatabaseAdmins();
     const buttons = admins.map((admin) => [
          Markup.button.callback(`Remove ${admin.username}`, `remove_admin:${admin.id}`),
     ]);

     ctx.reply('Select an admin to remove:', Markup.inlineKeyboard(buttons));
});

bot.action('list_admins', async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('Unauthorized access.');
          return;
     }

     const admins = await loadDatabaseAdmins();
     const adminList = admins
          .map(
               (admin) =>
                    `Username: ${admin.username}\nTelegram ID: ${admin.telegramId}\nDatabase ID: ${admin.id}`
          )
          .join('\n\n');

     ctx.reply(`Current Admins:\n\n${adminList || 'No admins found.'}`);
});

bot.action('user_info', (ctx) => {
     const userId = ctx.from.id;
     userInfoSessions.add(userId);
     ctx.reply('Please Enter the username of the User: ');
});

bot.on('text', async (ctx) => {
     const userId = ctx.from.id;

     // Handle threshold-setting session
     if (thresholdSessions.has(userId)) {
          const value = parseFloat(ctx.message.text);

          if (isNaN(value) || value <= 0) {
               ctx.reply('Invalid input. Please provide a valid positive number (in GB):');
               return;
          }

          try {
               await setTrafficThreshold(value);
               ctx.reply(`Traffic threshold successfully updated to ${value} GB.`);
          } catch (error) {
               ctx.reply('Error updating threshold. Please try again.');
          }

          thresholdSessions.delete(userId); // End session
          return;
     }

     if (userInfoSessions.has(userId)) {
          const username = ctx.message.text;
          if (isMainAdmin(ctx)) {
               const userInfo = await getUserInfo(username);
               ctx.reply(formatUserInfo(userInfo), {
                    parse_mode: 'MarkdownV2',
               });
          } else if (await isAdmin(ctx)) {
               const adminId = await getAdminDatabaseId(ctx.from?.id ?? 0);
               if (adminId) {
                    const userInfo = await getUserInfo(username, adminId);
                    ctx.reply(formatUserInfo(userInfo), {
                         parse_mode: 'MarkdownV2',
                    });
               } else {
                    ctx.reply(
                         'No admin found in config file with your Telegram ID, please double check config data in server!'
                    );
               }
          }

          userInfoSessions.delete(userId);
          return;
     }

     // Handle admin addition sessions
     const session = sessions.get(userId);
     if (!session) return;

     if (session.step === 'username') {
          const username = ctx.message.text;
          const adminId = await getAdminID(username);

          if (!adminId) {
               ctx.reply('Username not found in database. Please try again:');
               return;
          }

          sessions.set(userId, {
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
               sessions.delete(userId);
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
               sessions.delete(userId);
          } catch (error) {
               ctx.reply('Error adding admin. Please try again.');
          }
     }
});

// Handle admin removal
bot.action(/^remove_admin:(\d+)$/, async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('Unauthorized access.');
          return;
     }

     const adminId = Number(ctx.match[1]);
     const admins = await loadDatabaseAdmins();
     const admin = admins.find((a) => a.id === adminId);

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

bot.action(['all_clients_info', 'clients_info'], async (ctx) => {
     const action = ctx.match[0]; // Get the current action (all_clients_info or clients_info)
     const clients = DeviceClients;

     const buttons = clients.map((client) =>
          Markup.button.callback(client, `choose_client_${client}_${action}`)
     );

     const inlineKeyboard = Markup.inlineKeyboard(
          buttons.map((btn) => [btn]) // Arrange buttons vertically
     );

     await ctx.reply('Select a client to view users associated with it:', inlineKeyboard);
});

// Create the regex pattern dynamically from DeviceClients array
const clientPattern = new RegExp(`^choose_client_(${DeviceClients.join('|')})_(.+)$`);

bot.action(clientPattern, async (ctx) => {
     const selectedClient = ctx.match?.[1];

     if (!DeviceClients.includes(selectedClient)) {
          await ctx.reply('Error: Unable to determine the selected client.');
          return;
     }

     const action = ctx.match?.[2];

     try {
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
               users.forEach((user) => {
                    message += `Username: ${user.username}\nClient: ${user.client}\n\n`;
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
               users.forEach((user) => {
                    message += `Username: ${user.username}\nClient: ${user.client}\n\n`;
               });

               await sendLongMessage(ctx, message);
          }
     } catch (error) {
          console.error(error);
          await ctx.reply(`Error fetching users for client: ${selectedClient}`);
     }
});

// Handle user data queries
bot.action('low_traffic_users', async (ctx) => {
     const adminId = await getAdminDatabaseId(ctx.from?.id ?? 0);
     if (adminId) {
          try {
               const threshold = await getTrafficThreshold();
               const users = await getLowTrafficUsers(threshold, adminId);
               let message = `Users with Less Than ${threshold} GB Traffic:\n\n`;
               users.forEach((user) => {
                    message += `${user.username} - ${user.remainingTraffic} GB remaining\n`;
               });
               if (users.length === 0) {
                    ctx.reply('no low user traffic found');
               } else {
                    ctx.reply(message);
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

bot.action('all_low_traffic', async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('Unauthorized access.');
          return;
     }

     try {
          const threshold = await getTrafficThreshold();
          const users = await getLowTrafficUsers(threshold);
          let message = `All Users with Less Than ${threshold} GB Traffic:\n\n`;
          users.forEach((user) => {
               message += `${user.username} - ${user.remainingTraffic} GB remaining\n`;
          });
          if (users.length === 0) {
               ctx.reply('no low user traffic found');
          } else {
               ctx.reply(message);
          }
     } catch (error) {
          ctx.reply('Error fetching all low traffic users.');
     }
});

bot.action('expiring_users', async (ctx) => {
     const adminId = await getAdminDatabaseId(ctx.from?.id ?? 0);
     if (adminId) {
          try {
               const users = await getExpiringUsers(adminId);
               const message = formatExpiringUsersMessage(users);
               ctx.reply(message);
          } catch (error) {
               ctx.reply('Error fetching expiring users.');
          }
     } else {
          ctx.reply(
               'No admin found in config file with your Telegram ID, please double check config data in server!'
          );
     }
});

bot.action('all_expiring', async (ctx) => {
     if (!isMainAdmin(ctx)) {
          ctx.reply('Unauthorized access.');
          return;
     }

     try {
          const users = await getExpiringUsers();
          const message = formatExpiringUsersMessage(users, true);
          ctx.reply(message);
     } catch (error) {
          ctx.reply('Error fetching all expiring users.');
     }
});

function formatExpiringUsersMessage(users: { today: any[]; tomorrow: any[] }, isAll: boolean = false) {
     const prefix = isAll ? 'All ' : '';
     const todayUsers = users.today.map((user) => user.username).join('\n') || 'None';
     const tomorrowUsers = users.tomorrow.map((user) => user.username).join('\n') || 'None';

     return `${prefix}Users Expiring Today:\n${todayUsers}\n\n${prefix}Users Expiring Tomorrow:\n${tomorrowUsers}`;
}

function formatUserInfo(userInfo: IUserInfo) {
     const formatDate = (date: Date): string => {
          return new Intl.DateTimeFormat('en-GB', {
               dateStyle: 'medium',
               timeStyle: 'short',
          }).format(new Date(date));
     };

     if (typeof userInfo === 'string') {
          return userInfo;
     }

     const trafficInGB =
          userInfo.dataLimit === null ? '∞' : (userInfo.remainingTraffic / (1024 * 1024 * 1024)).toFixed(2);

     // Escape special characters for MarkdownV2
     const escapedUsername = userInfo.username.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
     const escapedBelongsTo = userInfo.belongsTo.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
     const escapedStatus = userInfo.status.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
     const escapedTraffic = trafficInGB.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
     const escapedNote = (userInfo.note || 'N/A').replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
     const escapedDevice = (userInfo.subLastUserAgent || 'none').replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
     const escapedOnline = (formatDate(userInfo.onlineAt) || 'never').replace(
          /[_*[\]()~`>#+-=|{}.!]/g,
          '\\$&'
     );
     const escapedSubUpdate = (formatDate(userInfo.subUpdatedAt) || 'never').replace(
          /[_*[\]()~`>#+-=|{}.!]/g,
          '\\$&'
     );
     const escapedExpiration = userInfo.expirationDate ? formatDate(userInfo.expirationDate) : 'Never';

     // Escape expiration date to prevent MarkdownV2 errors
     const escapedExpirationDate = escapedExpiration.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');

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

initializeCommands()
     .then(() => {
          bot.launch().then(() => {
               console.log('Marzban User Management bot started successfully.');
          });
     })
     .catch((err) => console.error('Error initializing commands:', err));
