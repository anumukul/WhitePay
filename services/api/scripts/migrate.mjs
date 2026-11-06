import { migrate, closeDb } from '../src/db.js';
const direction = process.argv[2] ?? 'up';
if (!['up', 'down'].includes(direction)) throw new Error('Use up or down');
try {
  await migrate(direction);
  console.log(`Migration ${direction} complete`);
} finally {
  await closeDb();
}
