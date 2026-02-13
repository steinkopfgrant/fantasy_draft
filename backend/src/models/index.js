// backend/src/models/index.js
'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../../config/config.js')[env];
const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

// Load all models
fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Set up associations after all models are loaded
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Define associations here after all models are loaded
if (db.User && db.UserAchievement && db.Achievement) {
  // User has many achievements
  db.User.hasMany(db.UserAchievement, {
    foreignKey: 'user_id',
    as: 'achievements'
  });

  db.UserAchievement.belongsTo(db.User, {
    foreignKey: 'user_id'
  });

  db.Achievement.hasMany(db.UserAchievement, {
    foreignKey: 'achievement_id'
  });

  db.UserAchievement.belongsTo(db.Achievement, {
    foreignKey: 'achievement_id'
  });
}

// Contest associations
if (db.Contest && db.ContestEntry) {
  db.Contest.hasMany(db.ContestEntry, {
    foreignKey: 'contest_id'
  });

  db.ContestEntry.belongsTo(db.Contest, {
    foreignKey: 'contest_id'
  });
}

// User and ContestEntry associations
if (db.User && db.ContestEntry) {
  db.User.hasMany(db.ContestEntry, {
    foreignKey: 'user_id'
  });

  db.ContestEntry.belongsTo(db.User, {
    foreignKey: 'user_id'
  });
}

// User and Transaction associations
if (db.User && db.Transaction) {
  db.User.hasMany(db.Transaction, {
    foreignKey: 'user_id'
  });

  db.Transaction.belongsTo(db.User, {
    foreignKey: 'user_id'
  });
}

// User and TicketTransaction associations
if (db.User && db.TicketTransaction) {
  db.User.hasMany(db.TicketTransaction, {
    foreignKey: 'user_id'
  });

  db.TicketTransaction.belongsTo(db.User, {
    foreignKey: 'user_id'
  });
}

// Contest and Transaction associations
if (db.Contest && db.Transaction) {
  db.Contest.hasMany(db.Transaction, {
    foreignKey: 'contest_id'
  });

  db.Transaction.belongsTo(db.Contest, {
    foreignKey: 'contest_id'
  });
}

// ContestEntry and DraftPick associations
if (db.ContestEntry && db.DraftPick) {
  db.ContestEntry.hasMany(db.DraftPick, {
    foreignKey: 'entry_id'
  });

  db.DraftPick.belongsTo(db.ContestEntry, {
    foreignKey: 'entry_id'
  });
}

// User and VoteHistory associations
if (db.User && db.VoteHistory) {
  db.User.hasMany(db.VoteHistory, {
    foreignKey: 'user_id'
  });

  db.VoteHistory.belongsTo(db.User, {
    foreignKey: 'user_id'
  });
}

// VotePeriod and VoteHistory associations
if (db.VotePeriod && db.VoteHistory) {
  db.VotePeriod.hasMany(db.VoteHistory, {
    foreignKey: 'vote_period_id'
  });

  db.VoteHistory.belongsTo(db.VotePeriod, {
    foreignKey: 'vote_period_id'
  });
}

// VotePeriod and BidUpPlayer associations
if (db.VotePeriod && db.BidUpPlayer) {
  db.VotePeriod.hasMany(db.BidUpPlayer, {
    foreignKey: 'vote_period_id'
  });

  db.BidUpPlayer.belongsTo(db.VotePeriod, {
    foreignKey: 'vote_period_id'
  });
}

// LINEUP ASSOCIATIONS
if (db.Lineup) {
  // Lineup belongs to User
  if (db.User) {
    db.Lineup.belongsTo(db.User, {
      foreignKey: 'user_id'
    });
    db.User.hasMany(db.Lineup, {
      foreignKey: 'user_id'
    });
  }

  // Lineup belongs to Contest
  if (db.Contest) {
    db.Lineup.belongsTo(db.Contest, {
      foreignKey: 'contest_id'
    });
    db.Contest.hasMany(db.Lineup, {
      foreignKey: 'contest_id'
    });
  }

  // Lineup belongs to ContestEntry (one-to-one)
  if (db.ContestEntry) {
    db.Lineup.belongsTo(db.ContestEntry, {
      foreignKey: 'contest_entry_id'
    });
    db.ContestEntry.hasOne(db.Lineup, {
      foreignKey: 'contest_entry_id'
    });
  }
}

// ============================================
// CONTEST RESULT ASSOCIATIONS (Settlement)
// ============================================
if (db.ContestResult) {
  // ContestResult belongs to Contest
  if (db.Contest) {
    db.ContestResult.belongsTo(db.Contest, {
      foreignKey: 'contest_id',
      as: 'contest'
    });
    db.Contest.hasMany(db.ContestResult, {
      foreignKey: 'contest_id',
      as: 'results'
    });
  }

  // ContestResult belongs to ContestEntry
  if (db.ContestEntry) {
    db.ContestResult.belongsTo(db.ContestEntry, {
      foreignKey: 'entry_id',
      as: 'entry'
    });
    db.ContestEntry.hasOne(db.ContestResult, {
      foreignKey: 'entry_id',
      as: 'result'
    });
  }

  // ContestResult belongs to User
  if (db.User) {
    db.ContestResult.belongsTo(db.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    db.User.hasMany(db.ContestResult, {
      foreignKey: 'user_id',
      as: 'contestResults'
    });
  }
}

// ============================================
// SLATE <-> CONTEST ASSOCIATIONS
// ============================================
if (db.Slate && db.Contest) {
  db.Slate.hasMany(db.Contest, { foreignKey: 'slate_id', as: 'Contests' });
  db.Contest.belongsTo(db.Slate, { foreignKey: 'slate_id', as: 'Slate' });
}

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;