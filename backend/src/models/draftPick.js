// backend/src/models/draftPick.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DraftPick = sequelize.define('DraftPick', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    entry_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'contest_entries',
        key: 'id'
      }
    },
    pick_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    player_data: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    roster_slot: {
      type: DataTypes.ENUM('QB', 'RB', 'WR', 'TE', 'FLEX'),
      allowNull: false
    },
    is_auto_pick: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'draft_picks',
    timestamps: false,
    underscored: true
  });

  return DraftPick;
};