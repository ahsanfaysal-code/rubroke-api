// Creates the admin account on first deploy if it doesn't exist.
// Password comes from ADMIN_PASSWORD env (falls back to dev default).
// Never logs the password. Safe to run on every deploy.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const EMAIL = process.env.ADMIN_EMAIL || 'admin@rubroke.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log('Admin already exists, skipping seed.');
    return;
  }
  const hashed = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.create({
    data: { name: 'Super Admin', email: EMAIL, password: hashed, role: 'admin' },
  });
  console.log('Admin seeded:', EMAIL);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
