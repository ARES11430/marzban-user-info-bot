import {
  getExpiringUsers,
  getLowTrafficUsers,
  getOutdatedSubscriptionUsers,
} from './models/users';
import { getTrafficThreshold } from './utils/utils';

// load bot.ts
import './bot/bot';

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
