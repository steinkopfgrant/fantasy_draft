// backend/src/db/migrations/20240101000004-create-market-mover-tables.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create market_mover_votes table with voting period
    await queryInterface.createTable('market_mover_votes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
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
      player_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      vote_time: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      voting_period_start: {
        type: Sequelize.DATE,
        allowNull: true
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
    
    // Create market_mover_bid_ups table
    await queryInterface.createTable('market_mover_bid_ups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      player_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      boost_percentage: {
        type: Sequelize.INTEGER,
        defaultValue: 35
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
    
    // Create market_mover_circuit_breakers table
    await queryInterface.createTable('market_mover_circuit_breakers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      player_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: false
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
    
    // Add indexes
    await queryInterface.addIndex('market_mover_votes', ['user_id']);
    await queryInterface.addIndex('market_mover_votes', ['player_name']);
    await queryInterface.addIndex('market_mover_votes', ['vote_time']);
    await queryInterface.addIndex('market_mover_votes', ['voting_period_start']);
    
    await queryInterface.addIndex('market_mover_bid_ups', ['player_name']);
    await queryInterface.addIndex('market_mover_bid_ups', ['end_time']);
    
    await queryInterface.addIndex('market_mover_circuit_breakers', ['player_name']);
    await queryInterface.addIndex('market_mover_circuit_breakers', ['end_time']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('market_mover_circuit_breakers');
    await queryInterface.dropTable('market_mover_bid_ups');
    await queryInterface.dropTable('market_mover_votes');
  }
};