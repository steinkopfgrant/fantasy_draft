#!/usr/bin/env node
// backend/scripts/generateSecrets.js
// Run this to generate secure secrets for your environment variables

const crypto = require('crypto');

console.log('🔐 Generating secure secrets for your .env file:\n');

console.log('================================');
console.log('JWT_SECRET (use this in Railway):');
console.log('================================');
console.log(crypto.randomBytes(64).toString('hex'));

console.log('\n================================');
console.log('SESSION_SECRET:');
console.log('================================');
console.log(crypto.randomBytes(32).toString('hex'));

console.log('\n================================');
console.log('New VAPID Keys (regenerate if old ones were in git):');
console.log('================================');

// Generate VAPID keys using web-push if available
try {
  const webpush = require('web-push');
  const vapidKeys = webpush.generateVAPIDKeys();
  console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
  console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
} catch (e) {
  console.log('(Install web-push to generate VAPID keys: npm install web-push)');
  console.log('Then run: npx web-push generate-vapid-keys');
}

console.log('\n================================');
console.log('INSTRUCTIONS:');
console.log('================================');
console.log('1. Copy the JWT_SECRET above');
console.log('2. Go to Railway dashboard → Variables');
console.log('3. Add/update JWT_SECRET with the new value');
console.log('4. Redeploy your backend');
console.log('');
console.log('⚠️  IMPORTANT: Never commit these values to git!');
console.log('⚠️  If your old .env.example had real keys, regenerate everything!');