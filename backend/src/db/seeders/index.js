const db = require('../../models');
const bcrypt = require('bcrypt');

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');

    // Create test users
    const users = await createTestUsers();
    console.log(`✅ Created ${users.length} test users`);

    // Create some test entries and completed drafts
    await createTestEntries(users);
    console.log('✅ Created test contest entries');

    console.log('🎉 Database seeding complete!');
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

async function createTestUsers() {
  const testUsers = [
    { username: 'testuser1', email: 'test1@example.com', password: 'password123' },
    { username: 'testuser2', email: 'test2@example.com', password: 'password123' },
    { username: 'testuser3', email: 'test3@example.com', password: 'password123' },
    { username: 'testuser4', email: 'test4@example.com', password: 'password123' },
    { username: 'testuser5', email: 'test5@example.com', password: 'password123' }
  ];

  const users = [];
  for (const userData of testUsers) {
    const [user, created] = await db.User.findOrCreate({
      where: { email: userData.email },
      defaults: {
        ...userData,
        balance: 1000,
        tickets: 10
      }
    });
    
    if (created) {
      console.log(`Created user: ${user.username}`);
    }
    users.push(user);
  }

  return users;
}

async function createTestEntries(users) {
  // Get a Market Mover contest
  const contest = await db.Contest.findOne({ where: { type: 'market' } });
  if (!contest) return;

  // Create a completed draft room
  const roomId = `${contest.id}_room_test`;
  
  // Create entries for first 5 users
  for (let i = 0; i < Math.min(5, users.length); i++) {
    const user = users[i];
    
    // Check if entry already exists
    const existingEntry = await db.ContestEntry.findOne({
      where: {
        user_id: user.id,
        contest_id: contest.id
      }
    });

    if (!existingEntry) {
      // Create completed entry with sample roster
      const entry = await db.ContestEntry.create({
        user_id: user.id,
        contest_id: contest.id,
        draft_room_id: roomId,
        draft_position: i,
        status: 'completed',
        roster: {
          QB: { name: 'Josh Allen', team: 'BUF', position: 'QB', price: 5 },
          RB: { name: 'Saquon Barkley', team: 'PHI', position: 'RB', price: 5 },
          WR: { name: 'Justin Jefferson', team: 'MIN', position: 'WR', price: 5 },
          TE: { name: 'Travis Kelce', team: 'KC', position: 'TE', price: 4 },
          FLEX: { name: 'Tyreek Hill', team: 'MIA', position: 'WR', price: 4 }
        },
        lineup: [
          { player: { name: 'Josh Allen', team: 'BUF', position: 'QB', price: 5 }, rosterSlot: 'QB' },
          { player: { name: 'Saquon Barkley', team: 'PHI', position: 'RB', price: 5 }, rosterSlot: 'RB' },
          { player: { name: 'Justin Jefferson', team: 'MIN', position: 'WR', price: 5 }, rosterSlot: 'WR' },
          { player: { name: 'Travis Kelce', team: 'KC', position: 'TE', price: 4 }, rosterSlot: 'TE' },
          { player: { name: 'Tyreek Hill', team: 'MIA', position: 'WR', price: 4 }, rosterSlot: 'FLEX' }
        ],
        total_spent: 23,
        total_points: Math.floor(Math.random() * 50) + 100,
        completed_at: new Date()
      });

      console.log(`Created entry for ${user.username}`);
    }
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase().then(() => process.exit(0));
}

module.exports = seedDatabase;