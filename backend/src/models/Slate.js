// backend/src/models/Slate.js
'use strict';

module.exports = (sequelize, DataTypes) => {
  const Slate = sequelize.define('Slate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    sport: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'nfl'
    },
    week: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    season: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2025
    },
    game_start_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    closes_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    scores_locked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active'
      // active -> closed -> settled
    },
    settled_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'slates',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Slate;
};