// backend/src/models/ticketTransaction.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TicketTransaction = sequelize.define('TicketTransaction', {
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
      type: DataTypes.ENUM('initial', 'weekly_bonus', 'draft_completion', 'purchase', 'use'),
      allowNull: false
    },
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    balance_after: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    reference_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'ticket_transactions',
    timestamps: false,
    underscored: true
  });

  return TicketTransaction;
};