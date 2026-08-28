import { MenuItemSpec } from 'common/interfaces/menu';
import { ipcRenderer } from 'electron';

import { unproxify } from '../libs/unproxify';

export default class {
   static minimize (): Promise<void> {
      return ipcRenderer.invoke('minimize-window');
   }

   /** Resolves with the maximized state *after* the toggle. */
   static toggleMaximize (): Promise<boolean> {
      return ipcRenderer.invoke('toggle-maximize-window');
   }

   static isMaximized (): Promise<boolean> {
      return ipcRenderer.invoke('is-window-maximized');
   }

   static reload (): Promise<void> {
      return ipcRenderer.invoke('reload-window');
   }

   static openDevTools (): Promise<void> {
      return ipcRenderer.invoke('open-dev-tools');
   }

   /** Resolves with the id of the chosen item, or null if the menu was dismissed. */
   static showContextMenu (items: MenuItemSpec[]): Promise<string | null> {
      return ipcRenderer.invoke('show-context-menu', unproxify(items));
   }
}
