const dns = require('dns');
const mongoose = require('mongoose');

let listenersRegistered = false;
let dnsConfigured = false;

function configureSrvDns(mongoUri) {
  if (dnsConfigured || !mongoUri.startsWith('mongodb+srv://')) {
    return;
  }

  const servers = (process.env.MONGODB_DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map(function(server) {
      return server.trim();
    })
    .filter(Boolean);

  if (servers.length) {
    dns.setServers(servers);
  }

  dnsConfigured = true;
}

function registerConnectionListeners() {
  if (listenersRegistered) {
    return;
  }

  mongoose.connection.on('connected', function() {
    console.log('MongoDB connected');
  });

  mongoose.connection.on('error', function(error) {
    console.error('MongoDB connection error:', error.message);
  });

  mongoose.connection.on('disconnected', function() {
    console.warn('MongoDB disconnected');
  });

  listenersRegistered = true;
}

async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  configureSrvDns(mongoUri);

  const options = {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000)
  };

  if (process.env.MONGODB_DB_NAME) {
    options.dbName = process.env.MONGODB_DB_NAME;
  }

  registerConnectionListeners();

  return mongoose.connect(mongoUri, options);
}

module.exports = {
  connectDatabase
};
