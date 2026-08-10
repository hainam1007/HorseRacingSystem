const path = require('path');
const { spawn } = require('child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

async function run() {
  const replicaSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: 'wiredTiger'
    }
  });

  try {
    const child = spawn(process.execPath, [
      path.join(__dirname, 'backupJockeyFlow.e2e.js')
    ], {
      stdio: 'inherit',
      env: Object.assign({}, process.env, {
        MONGODB_URI: replicaSet.getUri(),
        MONGODB_DB_NAME: 'horse_racing_backup_e2e',
        MONGODB_SERVER_SELECTION_TIMEOUT_MS: '10000'
      })
    });

    const exitCode = await new Promise(function(resolve, reject) {
      child.on('error', reject);
      child.on('exit', function(code) {
        resolve(code === null ? 1 : code);
      });
    });

    if (exitCode !== 0) {
      throw new Error('Backup jockey E2E exited with code ' + exitCode);
    }
  } finally {
    await replicaSet.stop();
  }
}

run().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
