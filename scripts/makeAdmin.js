const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@rubroke.com';
  const password = 'admin'; // simple for dev
  
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  
  if (existingAdmin) {
    console.log('Admin already exists.');
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      name: 'Super Admin',
      email,
      password: hashedPassword,
      role: 'admin',
    },
  });

  console.log('Admin user created: admin@rubroke.com / admin');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
