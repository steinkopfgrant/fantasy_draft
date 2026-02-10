// backend/src/models/DraftLog.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DraftLog = sequelize.define('DraftLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    contest_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'contests',
        key: 'id'
      }
    },
    event_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [['draft_started', 'board_generated', 'pick', 'skip', 'auto_pick', 'draft_complete']]
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    pick_number: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    turn_number: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    player_name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    player_team: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    player_position: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    player_price: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    board_row: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    board_col: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    board_snapshot: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    roster_snapshot: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    draft_order_snapshot: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    time_remaining: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    was_auto_pick: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'draft_logs',
    timestamps: false,
    indexes: [
      { fields: ['contest_id'] },
      { fields: ['user_id'] },
      { fields: ['event_type'] },
      { fields: ['created_at'] },
      { fields: ['contest_id', 'pick_number'] }
    ]
  });

  return DraftLog;
};