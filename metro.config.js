const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prevent Metro from resolving into server/node_modules
config.resolver.blockList = [/server\/node_modules\/.*/];

module.exports = config;
