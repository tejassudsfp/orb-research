/* global module */
// electron-builder `beforeBuild` hook (P5.4). Returning false tells electron-builder that node_modules are handled
// outside it: the staged app (release/stage/app) has no dependencies, and the sidecar's tree is copied as
// extraResources by scripts/dist-stage.ts. Without this, electron-builder falls back to the workspace root and packs
// the root's whole dependency tree into app.asar.
module.exports = async function beforeBuild() {
  return false;
};
