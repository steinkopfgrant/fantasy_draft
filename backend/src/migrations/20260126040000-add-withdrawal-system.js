// backend/src/db/migrations/20260126040000-add-withdrawal-system.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔄 Starting withdrawal system migration...');

      // ============================================
      // 1. ADD W9 FIELDS TO USERS TABLE
      // ============================================
      const userColumns = await queryInterface.describeTable('users');

      if (!userColumns.w9_submitted) {
        await queryInterface.addColumn('users', 'w9_submitted', {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        }, { transaction });
        console.log('  ✅ Added users.w9_submitted');
      }

      if (!userColumns.w9_submitted_at) {
        await queryInterface.addColumn('users', 'w9_submitted_at', {
          type: Sequelize.DATE,
          allowNull: true
        }, { transaction });
        console.log('  ✅ Added users.w9_submitted_at');
      }

      if (!userColumns.legal_name) {
        await queryInterface.addColumn('users', 'legal_name', {
          type: Sequelize.STRING(255),
          allowNull: true
        }, { transaction });
        console.log('  ✅ Added users.legal_name');
      }

      if (!userColumns.tax_address) {
        await queryInterface.addColumn('users', 'tax_address', {
          type: Sequelize.TEXT,
          allowNull: true
        }, { transaction });
        console.log('  ✅ Added users.tax_address');
      }

      // ============================================
      // 2. CREATE WITHDRAWAL_REQUESTS TABLE
      // ============================================
      const tables = await queryInterface.showAllTables();

      if (!tables.includes('withdrawal_requests')) {
        await queryInterface.createTable('withdrawal_requests', {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE'
          },
          amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          status: {
            type: Sequelize.STRING(20),
            defaultValue: 'pending'
          },
          payout_method: {
            type: Sequelize.STRING(50),
            defaultValue: 'bank_ach'
          },
          stripe_payout_id: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          stripe_transfer_id: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          reviewed_by: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'users', key: 'id' }
          },
          reviewed_at: {
            type: Sequelize.DATE,
            allowNull: true
          },
          rejection_reason: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          admin_notes: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          completed_at: {
            type: Sequelize.DATE,
            allowNull: true
          },
          metadata: {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: {}
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
          }
        }, { transaction });

        // Add indexes
        await queryInterface.addIndex('withdrawal_requests', ['user_id'], { transaction });
        await queryInterface.addIndex('withdrawal_requests', ['status'], { transaction });
        await queryInterface.addIndex('withdrawal_requests', ['created_at'], { transaction });
        await queryInterface.addIndex('withdrawal_requests', ['payout_method'], { transaction });

        console.log('  ✅ Created withdrawal_requests table');
      }

      await transaction.commit();
      console.log('✅ Withdrawal system migration complete!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('🔄 Rolling back withdrawal system migration...');

      // Drop table
      await queryInterface.dropTable('withdrawal_requests', { transaction });

      // Remove user columns
      await queryInterface.removeColumn('users', 'w9_submitted', { transaction });
      await queryInterface.removeColumn('users', 'w9_submitted_at', { transaction });
      await queryInterface.removeColumn('users', 'legal_name', { transaction });
      await queryInterface.removeColumn('users', 'tax_address', { transaction });

      await transaction.commit();
      console.log('✅ Rollback complete');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};