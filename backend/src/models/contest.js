// backend/src/models/contest.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Contest = sequelize.define('Contest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    type: {
      type: DataTypes.ENUM('cash', 'bash', 'market', 'firesale'),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('open', 'closed', 'live', 'completed'),
      defaultValue: 'open'
    },
    entry_fee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    prize_pool: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    max_entries: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    current_entries: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    max_entries_per_user: {
      type: DataTypes.INTEGER,
      defaultValue: 150
    },
    player_board: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'contests',
    timestamps: true,
    underscored: true
  });

  return Contest;
};