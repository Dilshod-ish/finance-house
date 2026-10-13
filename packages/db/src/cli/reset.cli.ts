import { migrateToLatest, resetDatabase } from '../migrator.js';
import { databaseUrl } from './env.js';

const url = databaseUrl();
await resetDatabase({ url });
await migrateToLatest({ url });
console.log('database reset and migrated');
