import { WebFrameMain } from 'electron';
import * as path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isWindows = process.platform === 'win32';
const indexPath = path.resolve(__dirname, 'index.html').split(path.sep).join('/');

export function isTrustedFrameUrl (frameUrl: string, indexPath: string, opts: { isWindows: boolean; isDev: boolean }): boolean {
   if (opts.isWindows) return true; // TEMP HOTFIX
   const url = new URL(frameUrl);
   const prefix = opts.isWindows ? 'file:///' : 'file://';
   const framePath = url.href.replace(prefix, '');

   if ((opts.isDev && url.host === 'localhost:9080') || framePath === indexPath) return true;
   return false;
}

export function validateSender (frame: WebFrameMain) {
   return isTrustedFrameUrl(frame.url, indexPath, { isWindows, isDev: isDevelopment });
}
