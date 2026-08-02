// Production entrypoint used by Render's startCommand.
// 1) Sync the database schema (creates tables if missing)
// 2) Seed the admin account if it doesn't exist
// 3) Start the Express server
const { execSync } = require('child_process');
const path = require('path');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

try {
  run('npx prisma db push --skip-generate --accept-data-loss');
} catch (e) {
  console.error('prisma db push failed; continuing to start server anyway.');
}

try {
  run('node scripts/seed-admin.js');
} catch (e) {
  console.error('seed-admin failed; continuing.');
}

// Start the actual server (src/index.js listens on PORT).
require('../src/index.js');
