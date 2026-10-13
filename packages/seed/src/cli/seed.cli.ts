import { createDatabase } from '@fincore/db';
import { seedDemo } from '../seed.js';

const url = process.env['DATABASE_URL'];
if (url === undefined || url === '') {
  throw new Error('DATABASE_URL is not set. Copy .env.example and start `make up`.');
}

const { db, close } = createDatabase({ url, max: 4 });
try {
  const result = await seedDemo(db);
  console.log(
    `seeded ${String(result.journal.entryCount)} entries for org ${result.reference.orgId}`,
  );
  console.log(`second tenant: ${result.otherOrgId}`);
} finally {
  await close();
}
