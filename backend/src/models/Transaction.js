// backend/src/models/Transaction.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Transaction extends Model {
    /**
     * Helper to check if this is a credit (money in)
     */
    isCredit() {
      return parseFloat(this.amount) > 0;
    }

    /**
     * Helper to check if this is a debit (money out)
     */
    isDebit() {
      return parseFloat(this.amount) < 0;
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
    // Transaction types - exhaustive list
    type: {
      type: DataTypes.ENUM(
        'deposit',           // Money added via Stripe/payment
        'withdrawal',        // Money withdrawn to bank
        'entry_fee',         // Deducted when entering contest
        'entry_refund',      // Refunded when withdrawing from contest
        'contest_winnings',  // Prize money from contest
        'promo_credit',      // Admin/promotional credit
        'adjustment'         // Manual correction (rare, requires notes)
      ),
      allowNull: false
    },
    // Positive = credit, Negative = debit
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        notZero(value) {
          if (parseFloat(value) === 0) {
            throw new Error('Transaction amount cannot be zero');
          }
        }
      }
    },
    // Balance AFTER this transaction - critical for reconciliation
    balance_after: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    // Balance BEFORE this transaction - for audit trail
    balance_before: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    // Reference to related entity (contest_id, stripe_payment_id, etc)
    reference_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Type of reference: contest, stripe_payment, admin_action, etc'
    },
    reference_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'ID of the referenced entity'
    },
    // Human-readable description
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // For admin actions - who did it
    admin_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Admin who initiated this transaction (for promo_credit, adjustment)'
    },
    // Metadata for anything else needed
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional data: stripe_charge_id, contest_name, etc'
    },
    // Idempotency key to prevent double-processing
    idempotency_key: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      comment: 'Unique key to prevent duplicate transactions'
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
    timestamps: false, // We manage created_at ourselves, no updated_at needed
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['reference_type', 'reference_id']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['idempotency_key'],
        unique: true,
        where: {
          idempotency_key: { [sequelize.Sequelize.Op.ne]: null }
        }
      }
    ]
  });

  return Transaction;
};