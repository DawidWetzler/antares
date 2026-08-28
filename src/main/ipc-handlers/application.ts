import { app, dialog, ipcMain, safeStorage } from 'electron';
import * as Store from 'electron-store';
import * as fs from 'fs';

import { grantPath, isPathGranted } from '../libs/misc/grantedPaths';
import { validateSender } from '../libs/misc/validateSender';
import { ShortcutRegister } from '../libs/ShortcutRegister';

export default () => {
   ipcMain.on('close-app', (event) => {
      if (!validateSender(event.senderFrame)) {
         return {
            status: 'error',
            response: 'Unauthorized process'
         };
      }
      app.exit();
   });

   ipcMain.on('set-key', (event, key) => {
      if (!validateSender(event.senderFrame)) return;

      if (safeStorage.isEncryptionAvailable()) {
         const sessionStore = new Store({
            name: 'session',
            fileExtension: ''
         });
         const encrypted = safeStorage.encryptString(key);
         sessionStore.set('key', encrypted);
         event.returnValue = true;
      }
   });

   // `sendSync`: the renderer blocks until `event.returnValue` is assigned, so a path out of
   // here that leaves it unset stops the app from starting at all.
   ipcMain.on('get-key', (event) => {
      if (!validateSender(event.senderFrame)) {
         event.returnValue = false;
         return;
      }

      if (!safeStorage.isEncryptionAvailable()) {
         event.returnValue = false;
         return;
      }
      const sessionStore = new Store({
         name: 'session',
         fileExtension: ''
      });

      try {
         const encrypted = sessionStore.get('key') as string;
         const key = safeStorage.decryptString(Buffer.from(encrypted, 'utf-8'));
         event.returnValue = key;
      }
      catch (error) {
         event.returnValue = false;
      }
   });

   ipcMain.handle('show-open-dialog', async (event, options) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      const result = await dialog.showOpenDialog(options);
      if (!result.canceled) result.filePaths.forEach(grantPath);
      return result;
   });

   ipcMain.handle('show-save-dialog', async (event, options) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      const result = await dialog.showSaveDialog(options);
      if (!result.canceled) grantPath(result.filePath);
      return result;
   });

   ipcMain.handle('get-download-dir-path', (event) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      return app.getPath('downloads');
   });

   ipcMain.handle('resotre-default-shortcuts', (event) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      const shortCutRegister = ShortcutRegister.getInstance();
      shortCutRegister.restoreDefaults();
   });

   ipcMain.handle('reload-shortcuts', (event) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      const shortCutRegister = ShortcutRegister.getInstance();
      shortCutRegister.reload();
   });

   ipcMain.handle('update-shortcuts', (event, shortcuts) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      const shortCutRegister = ShortcutRegister.getInstance();
      shortCutRegister.updateShortcuts(shortcuts);
   });

   ipcMain.handle('unregister-shortcuts', (event) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      const shortCutRegister = ShortcutRegister.getInstance();
      shortCutRegister.unregister();
   });

   ipcMain.handle('read-file', (event, { filePath, encoding }) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      if (!isPathGranted(filePath)) return { status: 'error', response: 'File not authorized' };
      try {
         const content = fs.readFileSync(filePath, encoding);
         return content;
      }
      catch (error) {
         return { status: 'error', response: error.toString() };
      }
   });

   ipcMain.handle('write-file', (event, filePath, content) => {
      if (!validateSender(event.senderFrame)) return { status: 'error', response: 'Unauthorized process' };
      if (!isPathGranted(filePath)) return { status: 'error', response: 'File not authorized' };
      try {
         fs.writeFileSync(filePath, content, 'utf-8');
         return { status: 'success' };
      }
      catch (error) {
         return { status: 'error', response: error.toString() };
      }
   });
};
