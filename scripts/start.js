// Production entrypoint used by Render's startCommand.
// The database schema must be migrated before this command runs.
// This script only verifies the required admin bootstrap configuration and starts the API.
const { execSync } = require('child_process');
const path = require('path');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

try {
  run('node scripts/seed-admin.js');
} catch (e) {
  console.error('seed-admin failed; refusing to start.');
  process.exit(1);
}

// Import the Express app and start listening.
const app = require('../src/index.js');
const port = process.env.PORT || 10000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
