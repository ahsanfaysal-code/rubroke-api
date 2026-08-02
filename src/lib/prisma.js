// Single shared PrismaClient instance for the whole app.
// Multiple PrismaClient instances against one SQLite file cause lock
// contention and "database disk image is malformed" corruption.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
