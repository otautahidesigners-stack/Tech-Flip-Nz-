#!/usr/bin/env node
// Run this on YOUR OWN computer to turn a real admin password into the
// value that goes in Vercel's ADMIN_PASSWORD_HASH environment variable.
// Your plaintext password is never sent anywhere by this script and is not
// logged, saved, or transmitted - it only exists in your own terminal.
//
// Usage:
//   node scripts/hash-password.js "your real password here"
//
// Then copy the printed "scrypt$..." value into Vercel:
//   Project -> Settings -> Environment Variables -> ADMIN_PASSWORD_HASH

import crypto from 'crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js "your password"');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
const stored = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;

console.log('\nADMIN_PASSWORD_HASH value (copy this into Vercel):\n');
console.log(stored);
console.log('\nThis value is safe to paste into Vercel\'s environment variables.');
console.log('It is NOT your password and cannot be turned back into it.\n');
