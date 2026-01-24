const io = require('socket.io-client');

const SERVER = 'https://fantasydraft-production.up.railway.app';
const ROOM_ID = process.argv[2];

if (!ROOM_ID) {
  console.log('Usage: node testRaceCondition.js <roomId>');
  console.log('  roomId should be an active draft room where aaaaaa is the current drafter');
  process.exit(1);
}

const attacker = { username: 'aaaaaa', password: 'aaaaaa' };

async function login(username, password) {
  const res = await fetch(`${SERVER}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  return data.token;
}

async function testDoublePick() {
  console.log('🔥 Double-Pick Race Condition Test');
  console.log('='.repeat(50));
  console.log('Scenario: Same user, two tabs, same pick\n');
  
  const token = await login(attacker.username, attacker.password);
  console.log('✅ Logged in as', attacker.username);
  
  // Two sockets with SAME token (simulating two browser tabs)
  const socket1 = io(SERVER, { auth: { token } });
  const socket2 = io(SERVER, { auth: { token } });
  
  let pickSuccessCount = 0;
  let pickRejectCount = 0;
  let draftState = null;
  
  const setupSocket = (socket, tabNum) => {
    return new Promise((resolve) => {
      socket.on('connect', () => {
        console.log(`✅ Tab ${tabNum} socket connected`);
      });
      
      socket.on('authenticated', (data) => {
        console.log(`✅ Tab ${tabNum} authenticated as ${data.user?.username}`);
        resolve(); // Each socket resolves its own promise
      });
      
      socket.on('error', (err) => {
        console.log(`❌ Tab ${tabNum} error:`, err.message || err);
        if (err.message?.includes('pick') || err.message?.includes('turn') || err.message?.includes('progress')) {
          pickRejectCount++;
        }
      });
      
      socket.on('draft-error', (err) => {
        console.log(`❌ Tab ${tabNum} draft-error:`, err.message || err);
        pickRejectCount++;
      });
      
      socket.on('pick-error', (err) => {
        console.log(`🚫 Tab ${tabNum} PICK REJECTED:`, err.error || err.message);
        pickRejectCount++;
      });
      
      socket.on('pick-success', (data) => {
        pickSuccessCount++;
        console.log(`📍 Tab ${tabNum} PICK ACCEPTED`);
      });
      
      socket.on('player-picked', (data) => {
        console.log(`📢 Tab ${tabNum} saw player-picked: ${data.player?.name} (isAutoPick: ${data.isAutoPick || false})`);
      });
      
      socket.on('draft-state', (state) => {
        console.log(`📋 Tab ${tabNum} got draft-state - Turn: ${state.currentTurn}, Status: ${state.status}`);
        if (!draftState || state.currentTurn >= (draftState.currentTurn || 0)) {
          draftState = state;
        }
      });
      
      socket.emit('authenticate', { token });
    });
  };
  
  // Wait for both sockets to authenticate
  await Promise.race([
    Promise.all([
      setupSocket(socket1, 1),
      setupSocket(socket2, 2)
    ]),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 10000))
  ]);
  
  console.log('\n📡 Both tabs authenticated, joining draft room...\n');
  
  socket1.emit('join-room', { roomId: ROOM_ID });
  socket2.emit('join-room', { roomId: ROOM_ID });
  
  await new Promise(r => setTimeout(r, 1500));
  
  console.log('📨 Requesting draft state...');
  socket1.emit('get-draft-state', { roomId: ROOM_ID });
  
  await new Promise(r => setTimeout(r, 2000));
  
  if (!draftState) {
    console.log('❌ No draft state received.');
    socket1.disconnect();
    socket2.disconnect();
    process.exit(1);
  }
  
  console.log('\n📊 Draft State:');
  console.log(`   Status: ${draftState.status}`);
  console.log(`   Current Turn: ${draftState.currentTurn}`);
  console.log(`   Teams: ${draftState.teams?.length || 0}`);
  
  if (draftState.status !== 'active') {
    console.log(`\n❌ Draft is not active (status: ${draftState.status})`);
    socket1.disconnect();
    socket2.disconnect();
    process.exit(1);
  }
  
  const currentTeamIndex = draftState.draftOrder?.[draftState.currentTurn];
  const currentTeam = draftState.teams?.[currentTeamIndex];
  
  console.log(`\n👤 Current drafter: ${currentTeam?.username || 'Unknown'}`);
  
  if (currentTeam?.username !== attacker.username) {
    console.log(`\n⚠️  It's not ${attacker.username}'s turn! (Current: ${currentTeam?.username})`);
  }
  
  // Find first undrafted player
  let targetPlayer = null;
  let targetRow = -1;
  let targetCol = -1;
  
  for (let row = 0; row < (draftState.playerBoard?.length || 0) && !targetPlayer; row++) {
    for (let col = 0; col < (draftState.playerBoard[row]?.length || 0); col++) {
      const player = draftState.playerBoard[row][col];
      if (player && !player.drafted) {
        targetPlayer = player;
        targetRow = row;
        targetCol = col;
        break;
      }
    }
  }
  
  if (!targetPlayer) {
    console.log('❌ No undrafted players found');
    socket1.disconnect();
    socket2.disconnect();
    process.exit(1);
  }
  
  const position = targetPlayer.originalPosition || targetPlayer.position;
  const rosterSlot = position === 'QB' ? 'QB' : 
                     position === 'RB' ? 'RB' :
                     position === 'WR' ? 'WR' :
                     position === 'TE' ? 'TE' : 'FLEX';
  
  console.log(`\n🎯 Target: ${targetPlayer.name} ($${targetPlayer.price}) -> ${rosterSlot}`);
  
  const pickPayload = {
    roomId: ROOM_ID,
    playerId: targetPlayer.playerId || `${targetRow}-${targetCol}`,
    playerData: targetPlayer,
    position: rosterSlot,
    slot: rosterSlot,
    roster_slot: rosterSlot,
    row: targetRow,
    col: targetCol
  };
  
  console.log('\n🚨 Firing SIMULTANEOUS picks from both tabs...\n');
  
  pickSuccessCount = 0;
  pickRejectCount = 0;
  
  // Fire both at exact same time
  socket1.emit('make-pick', pickPayload);
  socket2.emit('make-pick', pickPayload);
  
  await new Promise(r => setTimeout(r, 4000));
  
  console.log('='.repeat(50));
  console.log('📊 RESULTS:');
  console.log(`   pick-success events: ${pickSuccessCount}`);
  console.log(`   pick-error events: ${pickRejectCount}`);
  console.log('='.repeat(50));
  
  if (pickSuccessCount > 1) {
    console.log('\n🚨 RACE CONDITION BUG! Multiple picks succeeded!');
  } else if (pickSuccessCount === 1 && pickRejectCount >= 1) {
    console.log('\n✅ PROTECTED - Only one pick succeeded');
  } else if (pickSuccessCount === 0) {
    console.log('\n⚠️  Both rejected (likely not your turn)');
  } else {
    console.log('\n⚠️  Unexpected result');
  }
  
  socket1.disconnect();
  socket2.disconnect();
  process.exit(0);
}

testDoublePick().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});