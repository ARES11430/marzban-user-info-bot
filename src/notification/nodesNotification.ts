import { Telegraf } from 'telegraf';
import { getNodes } from '../models/nodes';
import {
  formatDate,
  getTimeZone,
  loadNodesData,
  updateNodeNotifiedStatus,
} from '../utils/utils';

interface NodeNotificationSystem {
  bot: Telegraf;
}

export const setupNodeNotificationSystem = (params: NodeNotificationSystem) => {
  const { bot } = params;
  const MAIN_ADMIN_ID = process.env.TELEGRAM_MUI_MAIN_ADMIN_ID;

  const notifyMainAdminAboutNodeStatus = async () => {
    if (!MAIN_ADMIN_ID) {
      console.error('TELEGRAM_MUI_MAIN_ADMIN_ID environment variable not set!');
      return;
    }

    console.log('Checking node statuses...');

    try {
      const currentNodes = await getNodes();
      const storedNodes = await loadNodesData();
      const timeZone = await getTimeZone();

      for (const node of currentNodes) {
        const storedNode = storedNodes.find(n => n.nodeId === node.id);
        const previousStatus = storedNode?.lastStatus || '';
        const isNotified = storedNode?.notified || false;

        const alertStates = ['error', 'connecting'];
        const wasInAlertState = alertStates.includes(previousStatus);

        // Handle node recovery (transition to connected)
        if (node.status === 'connected' && wasInAlertState) {
          const message = `✅ Node Recovered!\n\nName: ${
            node.name
          }\nNode Address: ${
            node.address
          }\n\nStatus: ${node.status.toUpperCase()}\nMessage: ${
            node.message || 'None'
          }\n\nLast Change: ${formatDate(node.last_status_change, timeZone)}`;

          try {
            await bot.telegram.sendMessage(MAIN_ADMIN_ID, message);
            await updateNodeNotifiedStatus(node.id, node.status, false);
          } catch (error) {
            console.error('Failed to notify main admin:', error);
          }
        }
        // Handle new alert states
        else if (alertStates.includes(node.status)) {
          if (!isNotified || previousStatus !== node.status) {
            const message = `🚨 Node Alert!\n\nName: ${
              node.name
            }\nNode Address: ${
              node.address
            }\n\nStatus: ${node.status.toUpperCase()}\nMessage: ${
              node.message || 'None'
            }
            \n\nLast Change: ${formatDate(node.last_status_change, timeZone)}`;

            try {
              await bot.telegram.sendMessage(MAIN_ADMIN_ID, message);
              await updateNodeNotifiedStatus(node.id, node.status, true);
            } catch (error) {
              console.error('Failed to notify main admin:', error);
            }
          }
        }
        // Reset notification status for other cases
        else if (storedNode?.notified) {
          await updateNodeNotifiedStatus(node.id, node.status, false);
        }
      }
    } catch (error) {
      console.error('Node notification error:', error);
    }
  };

  return {
    start: (intervalMinutes: number = 15) => {
      notifyMainAdminAboutNodeStatus();
      setInterval(notifyMainAdminAboutNodeStatus, intervalMinutes * 60 * 1000);
    },
  };
};

