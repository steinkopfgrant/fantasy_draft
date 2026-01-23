const io = require('socket.io-client');

const SERVER = 'https://fantasydraft-production.up.railway.app';
const ROOM_ID = process.argv[2]; // Pass room ID as argument

if (!ROOM_ID) {
  console.log('Usage: node testRaceCondition.js <roomId>');
  process.exit(1);
}

// Two test accounts that are in the same draft
const users = [
  { username: 'loadtest1', password: 'loadtest1' },
  { username: 'loadtest2', password: 'loadtest2' }
];

async function login(username, password) {
  const res = await fetch(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  return data.token;
}

async function testSimultaneousPicks() {
  console.log('🔥 Race Condition Test');
  console.log('='.repeat(40));
  
  // Login both users
  const tokens = await Promise.all(
    users.map(u => login(u.username, u.password))
  );
  
  console.log('✅ Both users logged in');
  
  // Connect both sockets
  const sockets = tokens.map((token, i) => {
    const socket = io(SERVER, { auth: { token } });
    socket.on('connect', () => console.log(`✅ ${users[i].username} connected`));
    socket.on('error', (err) => console.log(`❌ ${users[i].username} error:`, err));
    socket.on('pick_made', (data) => console.log(`📍 Pick made:`, data.username, data.player?.name));
    socket.on('pick_rejected', (data) => console.log(`🚫 Pick rejected:`, data.reason));
    return socket;
  });
  
  // Wait for connections
  await new Promise(r => setTimeout(r, 2000));
  
  // Join the room
  sockets.forEach((s, i) => {
    s.emit('join_draft', { visitorId: users[i].username, roomId: ROOM_ID });
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // SIMULTANEOUS PICKS - both try to pick at exact same moment
  console.log('\n🚨 Firing simultaneous picks NOW...\n');
  
  const pickData = {
    visitorId: 'test',
    roomId: ROOM_ID,
    player: { name: 'Patrick Mahomes', position: 'QB', salary: 5 },
    position: 'QB1'
  };
  
  // Fire both at exact same time
  sockets[0].emit('make_pick', { ...pickData, visitorId: users[0].username });
  sockets[1].emit('make_pick', { ...pickData, visitorId: users[1].username });
  
  // Wait for responses
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('\n✅ Test complete - check if only ONE pick went through');
  
  sockets.forEach(s => s.disconnect());
  process.exit(0);
}

testSimultaneousPicks().catch(console.error);