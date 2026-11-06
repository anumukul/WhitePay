// The API owns the authoritative PostgreSQL schema, including durable relay attempts.
export {
  getDb,
  transaction,
  resetDbForTests,
  closeDb,
  migrate,
} from '@whitepay/api/src/db.js';
