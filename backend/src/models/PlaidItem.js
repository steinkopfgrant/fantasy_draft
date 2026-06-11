// backend/src/models/PlaidItem.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PlaidItem = sequelize.define('PlaidItem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // Plaid's identifier for this bank connection ("Item"). One Item = one
    // bank login, which may expose multiple accounts.
    item_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    // SECURITY: this is a live credential to the user's bank. In Sandbox it is
    // harmless test data, but BEFORE going to Production this MUST be encrypted
    // at rest (e.g. app-level AES via a KMS-held key), not stored plaintext.
    // See encryptAccessToken()/decryptAccessToken() hooks in plaidService.js.
    access_token: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    institution_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    institution_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // The specific account selected for funding (deposits/withdrawals), once
    // the user picks one. Mask is the last 2-4 digits, safe to display.
    account_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    account_mask: {
      type: DataTypes.STRING,
      allowNull: true
    },
    account_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    account_subtype: {
      type: DataTypes.STRING,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'revoked', 'error'),
      defaultValue: 'active'
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
    tableName: 'plaid_items',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { unique: true, fields: ['item_id'] }
    ]
  });

  PlaidItem.associate = (db) => {
    if (db.User) {
      db.User.hasMany(PlaidItem, { foreignKey: 'user_id', as: 'plaidItems' });
      PlaidItem.belongsTo(db.User, { foreignKey: 'user_id' });
    }
  };

  return PlaidItem;
};