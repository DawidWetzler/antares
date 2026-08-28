import { MenuItemSpec } from 'common/interfaces/menu';
import type { MenuItemConstructorOptions } from 'electron';

// `role` is a command to Electron, and the renderer is the one filling it in: an allowlist keeps
// a crafted template from reaching `quit`, `toggleDevTools` and the rest of the roster.
const ALLOWED_ROLES = ['cut', 'copy', 'paste', 'selectAll'];

export function contextMenuTemplate (items: MenuItemSpec[], onClick: (id: string) => void): MenuItemConstructorOptions[] {
   return items
      .filter(item => !item.role || ALLOWED_ROLES.includes(item.role))
      .map(item => {
         const option: MenuItemConstructorOptions = {};

         if (item.type === 'separator') return { type: 'separator' };
         if (item.role) option.role = item.role;
         if (item.label) option.label = item.label;
         if (item.id) option.click = () => onClick(item.id);

         return option;
      });
}
