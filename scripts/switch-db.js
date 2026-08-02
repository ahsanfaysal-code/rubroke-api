// Rewrites the Prisma datasource provider based on PRISMA_PROVIDER.
// Used at build time on the host: local dev stays sqlite, prod uses postgresql.
const fs = require('fs');
const path = require('path');

const provider = (process.env.PRISMA_PROVIDER || 'sqlite').toLowerCase();
const allowed = new Set(['sqlite', 'postgresql', 'mysql', 'sqlserver']);
if (!allowed.has(provider)) {
  console.error(`Invalid PRISMA_PROVIDER "${provider}". Defaulting to sqlite.`);
  return;
}

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');
schema = schema.replace(/provider\s*=\s*"[^"]*"/, `provider = "${provider}"`);
fs.writeFileSync(schemaPath, schema);
console.log(`Prisma datasource provider set to "${provider}".`);
