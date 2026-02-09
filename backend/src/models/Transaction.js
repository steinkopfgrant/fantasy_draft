// backend/src/models/Transaction.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Transaction extends Model {
    /**
     * Check if this is a credit (money in)
     */
    isCredit() {
      return parseFloat(this.amount) > 0;
    }

    /**
     * Check if this is a debit (money out)
     */
    isDebit() {
      return parseFloat(this.amount) < 0;
    }

    /**
     * Get absolute amount
     */
    getAbsoluteAmount() {
      return Math.abs(parseFloat(this.amount));
    }
  }

  Transaction.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    // Using STRING instead of ENUM to avoid migration headaches
    // Valid types: deposit, withdrawal, entry_fee, entry_refund, 
    // contest_winnings, promo_credit, adjustment
    // Legacy types: contest_entry, contest_refund (kept for backward compatibility)
    type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    // Positive = credit, Negative = debit
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    // Balance AFTER this transaction
    balance_after: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    // Balance BEFORE this transaction (nullable for legacy transactions)
    balance_before: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    // ============================================
    // PAYMENT STATUS & TRACKING
    // ============================================
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'completed',
      allowNull: false
    },
    stripe_payment_intent_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    stripe_charge_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    stripe_event_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // ============================================
    // Reference to related entity
    reference_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    reference_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // Legacy field - kept for backward compatibility with existing queries
    contest_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'contests',
        key: 'id'
      }
    },
    // Human-readable description
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // For admin actions
    admin_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // Extra data
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    // Prevents duplicate transactions (webhook retries, etc)
    idempotency_key: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Transaction',
    tableName: 'transactions',
    underscored: true,
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['contest_id'] },
      { fields: ['reference_type', 'reference_id'] },
      { fields: ['created_at'] },
      { fields: ['stripe_payment_intent_id'] }
    ]
  });

  return Transaction;
};