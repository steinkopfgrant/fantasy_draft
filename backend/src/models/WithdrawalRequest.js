// backend/src/models/WithdrawalRequest.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WithdrawalRequest extends Model {
    static associate(models) {
      WithdrawalRequest.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });
      WithdrawalRequest.belongsTo(models.User, {
        foreignKey: 'reviewed_by',
        as: 'reviewer'
      });
    }
  }

  WithdrawalRequest.init({
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
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      allowNull: false
      // pending, approved, processing, completed, rejected, cancelled, failed
    },
    payout_method: {
      type: DataTypes.STRING(50),
      defaultValue: 'bank_ach'
      // bank_ach, paypal, venmo
    },
    // Stripe-related fields
    stripe_payout_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    stripe_transfer_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    // Admin review
    reviewed_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    admin_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Extra data
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'WithdrawalRequest',
    tableName: 'withdrawal_requests',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
      { fields: ['payout_method'] }
    ]
  });

  return WithdrawalRequest;
};