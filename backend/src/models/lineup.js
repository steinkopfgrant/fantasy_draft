// backend/src/models/lineup.js
module.exports = (sequelize, DataTypes) => {
  const Lineup = sequelize.define('Lineup', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    contest_entry_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'contest_entries', key: 'id' },
      unique: true
    },
    contest_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'contests', key: 'id' }
    },
    contest_type: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    week: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },
    roster: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'drafted'
    },
    live_score: {
      type: DataTypes.DECIMAL(6,2),
      defaultValue: 0
    },
    final_score: {
      type: DataTypes.DECIMAL(6,2),
      defaultValue: null
    },
    rank: {
      type: DataTypes.INTEGER,
      defaultValue: null
    },
    payout: {
      type: DataTypes.DECIMAL(10,2),
      defaultValue: 0
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
    tableName: 'lineups',
    timestamps: true,
    underscored: true
  });

  return Lineup;
};