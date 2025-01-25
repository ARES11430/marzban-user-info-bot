import { populateNodesJson, populateUsersJson } from './utils/utils';

// load bot.ts
import './bot/bot';
console.log('Application is started successfully, You may now Use the bot!');

populateUsersJson().catch(error => {
  console.error('Failed to populate users.json:', error);
});

populateNodesJson().catch(error => {
  console.error('Failed to populate nodes.json:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
