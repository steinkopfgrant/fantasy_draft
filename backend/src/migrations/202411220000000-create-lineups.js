// backend/src/migrations/[timestamp]-create-lineups.js
// Name it something like: 20241122000000-create-lineups.js

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('lineups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contest_entry_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'contest_entries',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contest_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'contests',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      contest_type: {
        type: Sequelize.STRING(10),
        allowNull: false
      },
      week: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      roster: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'drafted'
      },
      live_score: {
        type: Sequelize.DECIMAL(6, 2),
        defaultValue: 0
      },
      final_score: {
        type: Sequelize.DECIMAL(6, 2),
        defaultValue: null
      },
      rank: {
        type: Sequelize.INTEGER,
        defaultValue: null
      },
      payout: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('lineups', ['user_id']);
    await queryInterface.addIndex('lineups', ['contest_id']);
    await queryInterface.addIndex('lineups', ['contest_entry_id']);
    await queryInterface.addIndex('lineups', ['status']);
    await queryInterface.addIndex('lineups', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('lineups');
  }
};