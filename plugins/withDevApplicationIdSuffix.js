const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Gives debug builds a `.dev` application id.
 *
 * The phone used for measuring is also a closed-test tester, and a development
 * build would otherwise have to replace the Play install — costing that tester
 * their opted-in copy, which the 12-testers-for-14-days rule counts. With the
 * suffix the two sit side by side.
 *
 * This lives in a plugin rather than in `android/app/build.gradle` because
 * `expo prebuild` regenerates that file and silently drops hand edits.
 */
module.exports = function withDevApplicationIdSuffix(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes('applicationIdSuffix ".dev"')) {
      return cfg;
    }
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(debug\s*\{\s*\n\s*signingConfig signingConfigs\.debug)/,
      '$1\n            applicationIdSuffix ".dev"'
    );
    return cfg;
  });
};
