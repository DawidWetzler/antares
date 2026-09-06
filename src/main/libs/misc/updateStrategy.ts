export type UpdateStrategy = 'none' | 'notify' | 'auto';

/**
 * Which update flow a build is allowed to run.
 *
 * `none`: something else owns updates. The Store and the Linux packages are
 * upgraded by whatever installed them, so the in-app updater stays out of it.
 *
 * `notify`: tell the user a release exists and send them to the download page.
 * Installing over a running app needs a signature macOS and Windows will accept,
 * and these builds are unsigned, so a downloaded update would be refused by
 * Gatekeeper and flagged by SmartScreen.
 *
 * `auto`: download and install in place. Only the AppImage, which no platform
 * asks to be signed.
 */
export const updateStrategy = (
   platform: NodeJS.Platform,
   { isWindowsStore, isAppImage }: { isWindowsStore: boolean; isAppImage: boolean }
): UpdateStrategy => {
   if (isWindowsStore) return 'none';
   if (platform === 'linux') return isAppImage ? 'auto' : 'none';
   if (platform === 'darwin' || platform === 'win32') return 'notify';

   return 'auto';
};
