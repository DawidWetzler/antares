import { MenuItemSpec } from 'common/interfaces/menu';
import { BrowserWindow, ipcMain, Menu } from 'electron';

import { contextMenuTemplate } from '../libs/misc/contextMenuTemplate';
import { validateSender } from '../libs/misc/validateSender';

export default () => {
   ipcMain.handle('minimize-window', (event) => {
      if (!validateSender(event.senderFrame)) return;
      BrowserWindow.fromWebContents(event.sender)?.minimize();
   });

   ipcMain.handle('toggle-maximize-window', (event) => {
      if (!validateSender(event.senderFrame)) return false;
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return false;

      if (window.isMaximized())
         window.unmaximize();
      else
         window.maximize();

      return window.isMaximized();
   });

   ipcMain.handle('is-window-maximized', (event) => {
      if (!validateSender(event.senderFrame)) return false;
      return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
   });

   ipcMain.handle('reload-window', (event) => {
      if (!validateSender(event.senderFrame)) return;
      BrowserWindow.fromWebContents(event.sender)?.reload();
   });

   ipcMain.handle('open-dev-tools', (event) => {
      if (!validateSender(event.senderFrame)) return;
      BrowserWindow.fromWebContents(event.sender)?.webContents.openDevTools();
   });

   ipcMain.handle('show-context-menu', (event, items: MenuItemSpec[]) => {
      if (!validateSender(event.senderFrame)) return null;
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) return null;

      return new Promise<string | null>((resolve) => {
         // Electron fires an item's `click` AND the popup callback, in that order; the first
         // resolve wins and the second is a no-op, but the guard keeps the intent readable.
         let settled = false;
         const settle = (id: string | null) => {
            if (settled) return;
            settled = true;
            resolve(id);
         };

         Menu
            .buildFromTemplate(contextMenuTemplate(items, settle))
            .popup({ window, callback: () => settle(null) });
      });
   });
};
