// transferStorePostgres.js
// -----------------------------------------------------------------------------
// Production store for the Plaid Transfer layer.
//   repo   -> persists transfers + processed events in Postgres
//   ledger -> delegates ALL balance changes to TransactionService, which stays
//             the single source of truth (locking, audit trail, idempotency).
// -----------------------------------------------------------------------------

const { DataTypes } = require('sequelize');
const db = require('../models');                 // your models index
const sequelize = db.sequelize;                  // adjust if your index names it differently
const TransactionService = require('./TransactionService');

const tx = TransactionService.getInstance(db, sequelize);

// --- Sequelize models matching migration_plaid_transfers.sql -----------------
const PlaidTransfer = sequelize.define('PlaidTransfer', {
  id:                { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  plaid_transfer_id: { type: DataTypes.TEXT, allowNull: false, unique: true },
  user_id:           { type: DataTypes.UUID, allowNull: false },
  kind:              { type: DataTypes.TEXT, allowNull: false },
  amount:            { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  network:           { type: DataTypes.TEXT, allowNull: false },
  status:            { type: DataTypes.TEXT, allowNull: false },
  authorization_id:  { type: DataTypes.TEXT },
  idempotency_key:   { type: DataTypes.TEXT },
  cleared:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'plaid_transfers', underscored: true, timestamps: true });

const PlaidTransferEvent = sequelize.define('PlaidTransferEvent', {
  event_id:    { type: DataTypes.BIGINT, primaryKey: true },
  transfer_id: { type: DataTypes.TEXT },
  event_type:  { type: DataTypes.TEXT },
  raw:         { type: DataTypes.JSONB },
}, { tableName: 'plaid_transfer_events', underscored: true, timestamps: false });

// --- repo --------------------------------------------------------------------
const repo = {
  async createTransferRecord(rec) {
    await PlaidTransfer.create({
      plaid_transfer_id: rec.plaid_transfer_id,
      user_id: rec.user_id,
      kind: rec.kind,
      amount: rec.amount,
      network: rec.network,
      status: rec.status,
      authorization_id: rec.authorization_id,
      idempotency_key: rec.idempotency_key,
    });
  },

  async getTransferByPlaidId(id) {
    const r = await PlaidTransfer.findOne({ where: { plaid_transfer_id: id } });
    if (!r) return null;
    return {
      plaid_transfer_id: r.plaid_transfer_id,
      user_id: r.user_id,
      amount: r.amount,
      kind: r.kind,
      network: r.network,
      status: r.status,
    };
  },

  async updateTransferStatus(id, status) {
    await PlaidTransfer.update({ status }, { where: { plaid_transfer_id: id } });
  },

  // Cursor is derived from the events table — no separate cursor row to maintain.
  async getEventCursor() {
    const max = await PlaidTransferEvent.max('event_id');
    return max || 0;
  },
  async setEventCursor() { /* no-op: cursor = MAX(event_id) */ },

  async eventAlreadyProcessed(eventId) {
    return (await PlaidTransferEvent.count({ where: { event_id: eventId } })) > 0;
  },
  async markEventProcessed(eventId) {
    await PlaidTransferEvent.create({ event_id: eventId });
  },
};

// --- ledger (delegates to TransactionService) --------------------------------
const ledger = {
  async creditPlayable(userId, amount, transferId) {
    await tx.recordTransaction(userId, parseFloat(amount), 'deposit', {
      referenceType: 'plaid_transfer',
      referenceId: transferId,
      description: 'Deposit via Plaid',
      idempotencyKey: `plaid_dep_${transferId}`,
    });
  },

  async reverseCredit(userId, amount, transferId) {
    // The one carve-out: allowed to drive balance negative; unrecoverable
    // portion is booked to users.disputed_losses inside recordTransaction.
    await tx.recordTransaction(userId, -parseFloat(amount), 'deposit_reversal', {
      referenceType: 'plaid_transfer',
      referenceId: transferId,
      description: 'Deposit returned by bank',
      idempotencyKey: `plaid_dep_rev_${transferId}`,
    });
  },

  async holdForWithdrawal(userId, amount, ref) {
    // balance >= 0 guard naturally blocks withdrawing more than the player has.
    await tx.recordTransaction(userId, -parseFloat(amount), 'withdrawal', {
      referenceType: 'plaid_transfer',
      referenceId: ref,
      description: 'Withdrawal via Plaid',
      idempotencyKey: `plaid_wd_hold_${ref}`,
    });
  },

  async releaseWithdrawalHold(userId, amount, ref) {
    await tx.recordTransaction(userId, parseFloat(amount), 'withdrawal_refund', {
      referenceType: 'plaid_transfer',
      referenceId: ref,
      description: 'Withdrawal failed — funds returned',
      idempotencyKey: `plaid_wd_refund_${ref}`,
    });
  },

  async finalizeWithdrawal(/* userId, amount, transferId */) {
    // Money already left at hold time; settlement needs no balance change.
  },

  async markDepositCleared(userId, plaidTransferId) {
    await PlaidTransfer.update({ cleared: true }, { where: { plaid_transfer_id: plaidTransferId } });
  },
};

module.exports = { repo, ledger, PlaidTransfer, PlaidTransferEvent };