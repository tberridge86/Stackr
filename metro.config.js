const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('onnx', 'ort', 'bin', 'jfif');
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@': path.resolve(__dirname),
};

module.exports = config;
