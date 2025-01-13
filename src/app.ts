import { getExpiringUsers, getLowTrafficUsers } from './models/users';
import { getTrafficThreshold } from './utils/utils';

// load bot.ts
import './bot/bot';

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const main = async () => {
  try {
    const threshold = await getTrafficThreshold();
    const lowTrafficUsers = await getLowTrafficUsers(threshold);
    const expiringUsers = await getExpiringUsers();

    console.log('All Expiring users: ', expiringUsers);
    console.log('All low traffic users:', lowTrafficUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
  }
};

main();
