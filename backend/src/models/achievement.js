// backend/src/models/achievement.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Achievement = sequelize.define('Achievement', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    icon: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    category: {
      type: DataTypes.ENUM('draft', 'win', 'participation', 'special', 'milestone'),
      allowNull: false
    },
    points: {
      type: DataTypes.INTEGER,
      defaultValue: 10
    },
    requirement_type: {
      type: DataTypes.ENUM('count', 'streak', 'unique', 'threshold'),
      allowNull: false
    },
    requirement_value: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    reward_type: {
      type: DataTypes.ENUM('badge', 'avatar', 'emote', 'clothing', 'title'),
      allowNull: false
    },
    reward_data: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'achievements',
    timestamps: true,
    underscored: true
  });

  return Achievement;
};