import { migrateToLatest } from '../migrator.js';
import { databaseUrl } from './env.js';

const url = databaseUrl();
await migrateToLatest({ url });
console.log('migrations applied');
