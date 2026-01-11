const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for TensorFlow.js model files
config.resolver.assetExts.push('bin');
config.resolver.assetExts.push('json');

module.exports = config;
