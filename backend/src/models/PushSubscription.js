module.exports = (sequelize, DataTypes) => {
  const PushSubscription = sequelize.define('PushSubscription', {
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
    endpoint: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    p256dh: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    auth: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'push_subscriptions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'endpoint']
      }
    ]
  });

  PushSubscription.associate = (models) => {
    PushSubscription.belongsTo(models.User, { foreignKey: 'user_id' });
  };

  return PushSubscription;
};