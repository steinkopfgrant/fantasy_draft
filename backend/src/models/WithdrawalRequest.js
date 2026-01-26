// backend/src/models/WithdrawalRequest.js
// Model for tracking withdrawal requests

module.exports = (sequelize, DataTypes) => {
  const WithdrawalRequest = sequelize.define('WithdrawalRequest', {
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
      allowNull: false,
      validate: {
        min: 0.01
      }
    },
    status: {
      type: DataTypes.ENUM(
        'pending',      // Awaiting admin review
        'approved',     // Approved, awaiting processing
        'processing',   // Being processed
        'completed',    // Successfully paid out
        'rejected',     // Rejected by admin
        'cancelled',    // Cancelled by user
        'failed'        // Payment provider failure
      ),
      defaultValue: 'pending'
    },
    payout_method: {
      type: DataTypes.STRING(50),
      defaultValue: 'bank_transfer'
    },
    stripe_payout_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    stripe_transfer_id: {
      type: DataTypes.STRING(255),
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
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'withdrawal_requests',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] }
    ]
  });

  WithdrawalRequest.associate = function(models) {
    WithdrawalRequest.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    WithdrawalRequest.belongsTo(models.User, {
      foreignKey: 'reviewed_by',
      as: 'reviewer'
    });
  };

  // Instance method to check if cancellable
  WithdrawalRequest.prototype.canBeCancelled = function() {
    return this.status === 'pending';
  };

  return WithdrawalRequest;
};