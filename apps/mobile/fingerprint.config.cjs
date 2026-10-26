// Expo's `balanced` preset, the default, plus `extra`: a PR's number and
// preview travel there in its update, so they must not change the
// fingerprint that picks the one preview build (`app.config.ts`).
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: [
    'PackageJsonAndroidAndIosScriptsIfNotContainRun',
    'ExpoConfigVersions',
    'ExpoConfigRuntimeVersionIfString',
    'EasJson',
    'Easignore',
    'AutolinkingConfigPaths',
    'ExpoConfigExtraSection',
  ],
};
