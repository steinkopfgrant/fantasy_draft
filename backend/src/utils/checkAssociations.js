// backend/src/utils/checkAssociations.js
// Run this to check your model associations: node src/utils/checkAssociations.js

const db = require('../models');

console.log('Checking model associations...\n');

// Check Contest model
if (db.Contest) {
  console.log('Contest associations:');
  const contestAssociations = db.Contest.associations;
  for (const [key, value] of Object.entries(contestAssociations || {})) {
    console.log(`  - ${key}: ${value.target.name} (as: ${value.as})`);
  }
  console.log('');
}

// Check ContestEntry model
if (db.ContestEntry) {
  console.log('ContestEntry associations:');
  const entryAssociations = db.ContestEntry.associations;
  for (const [key, value] of Object.entries(entryAssociations || {})) {
    console.log(`  - ${key}: ${value.target.name} (as: ${value.as})`);
  }
  console.log('');
}

// Check if Entry model exists
if (db.Entry) {
  console.log('Entry model exists');
  console.log('Entry associations:');
  const entryAssociations = db.Entry.associations;
  for (const [key, value] of Object.entries(entryAssociations || {})) {
    console.log(`  - ${key}: ${value.target.name} (as: ${value.as})`);
  }
  console.log('');
}

// List all available models
console.log('All available models:');
Object.keys(db).forEach(modelName => {
  if (modelName !== 'sequelize' && modelName !== 'Sequelize' && typeof db[modelName] === 'function') {
    console.log(`  - ${modelName}`);
  }
});

process.exit(0);