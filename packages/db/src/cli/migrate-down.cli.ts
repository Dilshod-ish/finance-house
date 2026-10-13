import { migrateDown } from '../migrator.js';
import { databaseUrl } from './env.js';

const steps = Number(process.argv[2] ?? '1');
const applied = await migrateDown({ url: databaseUrl(), steps });
console.log(`rolled back: ${applied.join(', ')}`);
