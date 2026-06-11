// runPlaidMigration.js
// Applies the Plaid Transfer migration to whatever DB your .env points at.
// Run from backend/ :   node src/services/runPlaidMigration.js
// Idempotent (IF NOT EXISTS) — safe to run more than once.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const db = require('../models');
const sequelize = db.sequelize;

const statements = [
  `CREATE TABLE IF NOT EXISTS plaid_transfers (
     id                BIGSERIAL PRIMARY KEY,
     plaid_transfer_id TEXT NOT NULL UNIQUE,
     user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind              TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal')),
     amount            NUMERIC(12,2) NOT NULL,
     network           TEXT NOT NULL,
     status            TEXT NOT NULL,
     authorization_id  TEXT,
     idempotency_key   TEXT,
     cleared           BOOLEAN NOT NULL DEFAULT FALSE,
     created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_plaid_transfers_user ON plaid_transfers(user_id)`,
  `CREATE TABLE IF NOT EXISTS plaid_transfer_events (
     event_id     BIGINT PRIMARY KEY,
     transfer_id  TEXT,
     event_type   TEXT,
     raw          JSONB,
     processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS disputed_losses NUMERIC(10,2) NOT NULL DEFAULT 0`,
];

(async () => {
  try {
    console.log(`Running Plaid migration on ${sequelize.config.host} / ${sequelize.config.database} ...`);
    for (const sql of statements) {
      await sequelize.query(sql);
      console.log('  ok:', sql.trim().split('\n')[0].slice(0, 55));
    }
    console.log('✅ migration complete');
  } catch (e) {
    console.log('❌', e.message);
  } finally {
    process.exit(0);
  }
})();