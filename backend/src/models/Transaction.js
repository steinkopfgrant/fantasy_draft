// backend/src/models/Transaction.js
module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define('Transaction', {
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
      }
    },
    type: {
      type: DataTypes.STRING, // Changed from ENUM to STRING for flexibility
      allowNull: false,
      validate: {
        isIn: [['deposit', 'withdrawal', 'contest_win', 'contest_entry', 'contest_refund', 'signup_bonus', 'admin_bonus', 'ticket_purchase', 'ticket_use', 'other']]
      }
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    balance_after: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    contest_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'contests',
        key: 'id'
      }
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'transactions',
    timestamps: false,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['contest_id']
      },
      {
        fields: ['type']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  Transaction.associate = function(models) {
    Transaction.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'User'
    });
    Transaction.belongsTo(models.Contest, {
      foreignKey: 'contest_id',
      as: 'Contest'
    });
  };

  return Transaction;
};