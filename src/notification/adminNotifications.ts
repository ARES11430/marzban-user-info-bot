// Add this to your imports
import { Telegraf } from 'telegraf';
import { getLowTrafficUsers, getUserInfo } from '../models/users';
import {
  getTrafficThreshold,
  loadDatabaseAdmins,
  loadUsersData,
  updateUserNotifiedStatus,
  UserData,
} from '../utils/utils';

interface NotificationSystem {
  bot: Telegraf;
}

export const setupNotificationSystem = (params: NotificationSystem) => {
  const { bot } = params;

  const notifyAdminsAboutLowTraffic = async () => {
    console.log('notifyAdminsAboutLowTraffic is called...');

    try {
      const threshold = await getTrafficThreshold();
      const lowTrafficUsers = await getLowTrafficUsers(threshold);
      const admins = await loadDatabaseAdmins();

      // Process each low traffic user
      for (const user of lowTrafficUsers) {
        const { username, remainingTraffic } = user;

        // Get user info to determine admin
        const userInfo = await getUserInfo(username);
        if (typeof userInfo === 'string') continue;

        // Check if notification has already been sent
        const usersData: UserData[] = await loadUsersData();
        const userData = usersData.find(u => u.userId === username);

        if (userData && userData.notified) {
          continue; // Skip if already notified
        }

        const message = `⚠️ Low Traffic Alert!\n\nUser: ${username}\nRemaining Traffic: ${remainingTraffic} GB
        \n\nBelongs to: #${userInfo.belongsTo}`;

        // Find the admin for this user
        const ownerAdmin = admins.find(admin => admin.id === userInfo.adminId);
        if (ownerAdmin) {
          try {
            await bot.telegram.sendMessage(ownerAdmin.telegramId, message);
            // Mark as notified with admin ID
            await updateUserNotifiedStatus(username, true, userInfo.adminId);
          } catch (error) {
            console.error(
              `Failed to notify admin ${ownerAdmin.username}:`,
              error
            );
          }
        }
      }

      // Reset notification status for users who are now above threshold
      const allUsers = await loadUsersData();
      for (const user of allUsers) {
        const userInfo = await getUserInfo(user.userId);
        if (typeof userInfo === 'string') continue;

        const remainingTrafficGB =
          userInfo.remainingTraffic / (1024 * 1024 * 1024);
        if (remainingTrafficGB > threshold && user.notified) {
          await updateUserNotifiedStatus(user.userId, false, userInfo.adminId);
        }
      }
    } catch (error) {
      console.error('Error in notification system:', error);
    }
  };
  return {
    startNotificationSystem: (intervalMinutes: number = 60) => {
      // Initial check
      notifyAdminsAboutLowTraffic();

      // Set up periodic checks
      setInterval(notifyAdminsAboutLowTraffic, intervalMinutes * 60 * 1000);
    },
  };
};

