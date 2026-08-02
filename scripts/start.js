// Production entrypoint used by Render's startCommand.
// 1) Sync the database schema (creates tables if missing)
// 2) Seed the admin account if it doesn't exist
// 3) Start the Express server (bind 0.0.0.0 so Render can reach it)
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

// Import the Express app and start listening.
const app = require('../src/index.js');
const port = process.env.PORT || 10000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
