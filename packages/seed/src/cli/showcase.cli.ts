import { createDatabase } from '@fincore/db';
import { seedShowcase } from '../showcase/index.js';

const url = process.env['DATABASE_URL'];
if (url === undefined || url === '') {
  throw new Error('DATABASE_URL is not set');
}

const { db, close } = createDatabase({ url });
try {
  const result = await seedShowcase(db);
  for (const org of result.orgs) {
    process.stdout.write(
      `${org.profile.tradeName.padEnd(26)} ${org.profile.orgId}  ${String(
        org.journal.entryCount,
      ).padStart(5)} entries\n`,
    );
  }
  process.stdout.write(`window ${result.from} .. ${result.to}\n`);
} finally {
  await close();
}
