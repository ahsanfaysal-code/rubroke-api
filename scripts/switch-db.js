// Rewrites ONLY the Prisma DATASOURCE provider based on PRISMA_PROVIDER, or
// auto-detects from DATABASE_URL. The generator provider (prisma-client-js)
// is left completely untouched. Used at build time on the host.
// - local dev: DATABASE_URL is a file/sqlite path and PRISMA_PROVIDER unset -> sqlite
// - Render/prod: DATABASE_URL is a postgres:// URL -> postgresql (unless PRISMA_PROVIDER overrides)
const fs = require('fs');
const path = require('path');

const envProvider = (process.env.PRISMA_PROVIDER || '').toLowerCase().trim();

let provider = envProvider;
if (!provider) {
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
    provider = 'postgresql';
  } else {
    provider = 'sqlite';
  }
}

const allowed = new Set(['sqlite', 'postgresql', 'mysql', 'sqlserver']);
if (!allowed.has(provider)) {
  console.error(`Invalid provider "${provider}". Defaulting to sqlite.`);
  provider = 'sqlite';
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
const block = schema.slice(start, end); // from "datasource db {" up to just before "}"
const after = schema.slice(end);        // starting at "}"

// Replace provider= inside this block only.
if (!/provider\s*=\s*"/.test(block)) {
  console.error('No provider line found inside datasource block. Aborting.');
  process.exit(1);
}
const newBlock = block.replace(/(provider\s*=\s*)"[^"]*"/, `$1"${provider}"`);

schema = before + newBlock + after;
fs.writeFileSync(schemaPath, schema);
console.log(`Prisma datasource provider set to "${provider}".`);
