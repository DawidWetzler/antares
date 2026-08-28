import { WebFrameMain } from 'electron';
import * as path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isWindows = process.platform === 'win32';
const indexPath = path.resolve(__dirname, 'index.html');

export function isTrustedFrameUrl (frameUrl: string, indexPath: string, opts: { isWindows: boolean; isDev: boolean }): boolean {
   // A frame that never navigated reports an empty url, and `new URL` throws on it. Out of an
   // ipcMain handler that throw reaches the user as a failed action; refusing has to be a value.
   let url: URL;
   try {
      url = new URL(frameUrl);
   }
   catch {
      return false;
   }

   if (opts.isDev && url.host === 'localhost:9080') return true;

   // frame.url is percent-encoded ("C:/Program Files" -> "C:/Program%20Files"), so the comparison
   // has to happen in URL space; a raw path never matches an install directory containing a space.
   const indexUrl = new URL(`file:///${indexPath.replace(/^\//, '')}`).href;

   // win32 paths are case-insensitive, and the drive letter casing is not ours to predict
   return opts.isWindows
      ? url.href.toLowerCase() === indexUrl.toLowerCase()
      : url.href === indexUrl;
}

export function validateSender (frame: WebFrameMain) {
   return isTrustedFrameUrl(frame.url, indexPath, { isWindows, isDev: isDevelopment });
}
