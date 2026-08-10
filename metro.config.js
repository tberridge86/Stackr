const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const escapePathForRegex = (targetPath) => targetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ignoredProjectDirs = ['.cache', '.metro-cache', '.tmp', 'tmp', 'dist', 'web-build'].map(
  (dir) => new RegExp(`${escapePathForRegex(path.resolve(__dirname, dir))}${escapePathForRegex(path.sep)}.*`)
);
const existingBlockList = config.resolver.blockList;

config.resolver.assetExts.push('onnx', 'ort', 'bin', 'jfif', 'wasm');
config.resolver.blockList = Array.isArray(existingBlockList)
  ? [...existingBlockList, ...ignoredProjectDirs]
  : [existingBlockList, ...ignoredProjectDirs].filter(Boolean);
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@': path.resolve(__dirname),
};

module.exports = config;
