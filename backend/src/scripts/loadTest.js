#!/usr/bin/env node
const { io } = require('socket.io-client');
const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'https://fantasydraft-production.up.railway.app';
const MAX_USERS = parseInt(process.argv[2]) || 10;
const DURATION = parseInt(process.argv[3]) || 30000;

// Existing test accounts (username = password)
const TEST_ACCOUNTS = [
  'loadtest1', 'loadtest2', 'loadtest3', 'loadtest4', 'loadtest5',
  'loadtest6', 'loadtest7', 'loadtest8', 'loadtest9', 'loadtest10',
  'loadtest11', 'loadtest12', 'loadtest13', 'loadtest14', 'loadtest15',
  'loadtest16', 'loadtest17', 'loadtest18', 'loadtest19', 'loadtest20',
  'loadtest21', 'loadtest22', 'loadtest23', 'loadtest24', 'loadtest25',
  'loadtest26', 'loadtest27', 'loadtest28', 'loadtest29', 'loadtest30',
  'loadtest31', 'loadtest32', 'loadtest33', 'loadtest34', 'loadtest35',
  'loadtest36', 'loadtest37', 'loadtest38', 'loadtest39', 'loadtest40',
  'loadtest41', 'loadtest42', 'loadtest43', 'loadtest44', 'loadtest45',
  'loadtest46', 'loadtest47', 'loadtest48', 'loadtest49', 'loadtest50'
];

const metrics = {
  loggedIn: 0,
  connected: 0,
  failed: 0,
  requests: 0,
  errors: [],
  latencies: []
};

class TestUser {
  constructor(id) {
    this.id = id;
    this.username = TEST_ACCOUNTS[id % TEST_ACCOUNTS.length];
    this.token = null;
    this.socket = null;
  }

  async login() {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.username,
          password: this.username  // password = username
        })
      });
      metrics.latencies.push(Date.now() - start);
      metrics.requests++;
      
      const data = await res.json();
      if (data.token) {
        this.token = data.token;
        metrics.loggedIn++;
        return true;
      } else {
        metrics.errors.push(`Login ${this.username}: ${data.error || 'No token'}`);
      }
    } catch (e) {
      metrics.errors.push(`Login ${this.username}: ${e.message}`);
    }
    metrics.failed++;
    return false;
  }

  async connectSocket() {
    return new Promise((resolve) => {
      this.socket = io(BASE_URL, {
        auth: { token: this.token },
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      const timeout = setTimeout(() => {
        metrics.errors.push(`Socket timeout ${this.username}`);
        metrics.failed++;
        resolve(false);
      }, 15000);

      this.socket.on('connect', () => {
        clearTimeout(timeout);
        metrics.connected++;
        resolve(true);
      });

      this.socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        metrics.errors.push(`Socket ${this.username}: ${err.message}`);
        metrics.failed++;
        resolve(false);
      });
    });
  }

  async doRandomAction() {
    const start = Date.now();
    try {
      await fetch(`${BASE_URL}/api/contests`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      metrics.latencies.push(Date.now() - start);
      metrics.requests++;
    } catch (e) {
      metrics.errors.push(`Action ${this.username}: ${e.message}`);
    }
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
  }
}

async function checkServer() {
  console.log(`\n🏥 Checking ${BASE_URL}...`);
  try {
    const res = await fetch(`${BASE_URL}/api/debug/resources`);
    const data = await res.json();
    console.log(`✅ Server OK - Memory: ${data.memory?.heapUsed}, Sockets: ${data.sockets?.connected}`);
    return true;
  } catch (e) {
    console.log(`❌ Server check failed: ${e.message}`);
    return false;
  }
}

async function printStats() {
  try {
    const res = await fetch(`${BASE_URL}/api/debug/resources`);
    const data = await res.json();
    console.log(`   Server: ${data.memory?.heapUsed} heap, ${data.sockets?.connected} sockets, ${data.drafts?.active} drafts`);
  } catch (e) { /* ignore */ }
}

async function run() {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 BIDBLITZ LOAD TEST');
  console.log('='.repeat(50));
  console.log(`   URL: ${BASE_URL}`);
  console.log(`   Users: ${MAX_USERS}`);
  console.log(`   Duration: ${DURATION/1000}s`);
  console.log(`   Accounts: ${TEST_ACCOUNTS.slice(0, MAX_USERS).join(', ')}`);

  await checkServer();

  const users = [];
  console.log(`\n📈 Logging in ${MAX_USERS} users...`);

  for (let i = 0; i < MAX_USERS; i++) {
    const user = new TestUser(i);
    users.push(user);
    
    (async () => {
      if (await user.login()) {
        await user.connectSocket();
      }
    })();
    
    await new Promise(r => setTimeout(r, 300)); // 300ms between users
    
    if ((i + 1) % 5 === 0) {
      console.log(`   ${i + 1}/${MAX_USERS} users started`);
      await printStats();
    }
  }

  // Wait for all logins to complete
  await new Promise(r => setTimeout(r, 3000));
  
  console.log(`\n✅ Login complete: ${metrics.loggedIn} logged in, ${metrics.connected} sockets connected`);
  console.log(`\n⏳ Running load for ${DURATION/1000}s...`);
  
  // Random actions during test
  const actionInterval = setInterval(() => {
    users.forEach(u => {
      if (u.token && Math.random() > 0.5) {
        u.doRandomAction();
      }
    });
  }, 1000);

  const statusInterval = setInterval(async () => {
    console.log(`   Logged in: ${metrics.loggedIn} | Sockets: ${metrics.connected} | Requests: ${metrics.requests} | Errors: ${metrics.errors.length}`);
    await printStats();
  }, 5000);

  await new Promise(r => setTimeout(r, DURATION));

  clearInterval(actionInterval);
  clearInterval(statusInterval);

  // Cleanup
  console.log('\n🧹 Disconnecting...');
  users.forEach(u => u.disconnect());
  await new Promise(r => setTimeout(r, 2000));

  // Results
  const sorted = [...metrics.latencies].sort((a, b) => a - b);
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESULTS');
  console.log('='.repeat(50));
  console.log(`   Logged In:   ${metrics.loggedIn}`);
  console.log(`   Connected:   ${metrics.connected}`);
  console.log(`   Failed:      ${metrics.failed}`);
  console.log(`   Requests:    ${metrics.requests}`);
  console.log(`   Avg Latency: ${sorted.length ? Math.round(sorted.reduce((a,b)=>a+b,0)/sorted.length) : 0}ms`);
  console.log(`   p95 Latency: ${sorted[Math.floor(sorted.length * 0.95)] || 0}ms`);
  
  if (metrics.errors.length > 0) {
    console.log(`\n❌ Errors (${metrics.errors.length}):`);
    metrics.errors.slice(-10).forEach(e => console.log(`   ${e}`));
  }

  console.log('\n🏥 Final server state:');
  await printStats();
  console.log('\n✅ Done!\n');
}

run().catch(console.error);