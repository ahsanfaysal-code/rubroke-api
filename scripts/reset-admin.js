// Securely reset the admin password without ever writing the secret to a file.
// Usage (local dev):  node scripts/reset-admin.js
// On the host, run via SSH:  node scripts/reset-admin.js   (then type the new password)
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const prisma = new PrismaClient();
const EMAIL = 'admin@rubroke.com';

function askPassword() {
  return new Promise((resolve) => {
    // Prefer env var (non-interactive / automated runs). Never logged.
    if (process.env.NEW_ADMIN_PASSWORD) return resolve(process.env.NEW_ADMIN_PASSWORD);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter new admin password: ', (pw) => {
      rl.close();
      resolve(pw);
    });
  });
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!admin) {
    console.error(`No admin found with email ${EMAIL}. Run makeAdmin first.`);
    process.exit(1);
  }
  const password = await askPassword();
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { email: EMAIL }, data: { password: hashed } });
  console.log('Admin password updated successfully.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
