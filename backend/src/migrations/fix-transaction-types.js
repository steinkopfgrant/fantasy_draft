// backend/src/migrations/fix-transaction-types.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, change the column to TEXT temporarily
    await queryInterface.changeColumn('transactions', 'type', {
      type: Sequelize.TEXT,
      allowNull: false
    });
    
    // Update any existing values if needed
    await queryInterface.sequelize.query(`
      UPDATE transactions 
      SET type = CASE 
        WHEN type = 'purchase' THEN 'contest_entry'
        WHEN type = 'refund' THEN 'contest_refund'
        ELSE type 
      END
      WHERE type IN ('purchase', 'refund');
    `);
    
    // Now change to VARCHAR with proper length
    await queryInterface.changeColumn('transactions', 'type', {
      type: Sequelize.STRING(50),
      allowNull: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert if needed
    await queryInterface.changeColumn('transactions', 'type', {
      type: Sequelize.ENUM('deposit', 'withdrawal', 'contest_win', 'signup_bonus', 'admin_bonus', 'other'),
      allowNull: false
    });
  }
};