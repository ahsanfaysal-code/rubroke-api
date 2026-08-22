// Creates the admin account on first deploy if it doesn't exist.
// Credentials must be supplied through the environment. Never logs secrets.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be configured before seeding an admin account.');
  }
  if (PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
  }

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log('Admin already exists, skipping seed.');
    return;
  }
  const hashed = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.create({
    data: { name: 'Super Admin', email: EMAIL, password: hashed, role: 'admin' },
  });
  console.log('Admin account seeded.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
