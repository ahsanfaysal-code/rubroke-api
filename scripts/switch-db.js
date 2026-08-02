// Rewrites ONLY the Prisma DATASOURCE provider. The repo is committed with
// "postgresql" (production target). Locally we flip it to "sqlite" only when
// DATABASE_URL is a local file (sqlite) URL. Used at build/start time on host.
const fs = require('fs');
const path = require('path');

const envProvider = (process.env.PRISMA_PROVIDER || '').toLowerCase().trim();

let provider = envProvider;
if (!provider) {
  const dbUrl = process.env.DATABASE_URL || '';
  // Local dev with a sqlite file -> use sqlite; everything else -> postgresql.
  if (dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite:')) {
    provider = 'sqlite';
  } else {
    provider = 'postgresql';
  }
}

const allowed = new Set(['sqlite', 'postgresql', 'mysql', 'sqlserver']);
if (!allowed.has(provider)) {
  console.error(`Invalid provider "${provider}". Defaulting to postgresql.`);
  provider = 'postgresql';
}

const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Locate the `datasource db { ... }` block by header + first closing brace.
const header = 'datasource db {';
const start = schema.indexOf(header);
if (start === -1) {
  console.error('Could not find "datasource db {" in schema. Aborting.');
  process.exit(1);
}
const end = schema.indexOf('}', start);
if (end === -1) {
  console.error('Could not find closing brace for datasource block. Aborting.');
  process.exit(1);
}

const before = schema.slice(0, start);
const block = schema.slice(start, end);
const after = schema.slice(end);

if (!/provider\s*=\s*"/.test(block)) {
  console.error('No provider line found inside datasource block. Aborting.');
  process.exit(1);
}
const newBlock = block.replace(/(provider\s*=\s*)"[^"]*"/, `$1"${provider}"`);

schema = before + newBlock + after;
fs.writeFileSync(schemaPath, schema);
console.log(`Prisma datasource provider set to "${provider}".`);
