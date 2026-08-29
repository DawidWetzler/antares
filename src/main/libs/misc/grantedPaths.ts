import Store from 'electron-store';
import * as path from 'path';

const isWindows = process.platform === 'win32';

const normalize = (filePath: string, opts: { isWindows: boolean }): string => {
   if (typeof filePath !== 'string') return null;

   const resolved = opts.isWindows ? path.win32.resolve(filePath) : path.posix.resolve(filePath);

   // win32 paths are case-insensitive
   return opts.isWindows ? resolved.toLowerCase() : resolved;
};

export function matchesGrant (filePath: string, granted: Iterable<string>, opts: { isWindows: boolean }): boolean {
   const wanted = normalize(filePath, opts);
   if (wanted === null) return false;

   for (const grant of granted) {
      if (normalize(grant, opts) === wanted) return true;
   }

   return false;
}

interface StoredTab { filePath?: string }

const savedTabFilePaths = (): string[] => {
   // Runs during main-process startup: a throw here means the window never opens.
   try {
      const tabs = new Store({ name: 'tabs' }).store as Record<string, StoredTab[]>;

      return Object.values(tabs)
         .flatMap(workspaceTabs => Array.isArray(workspaceTabs) ? workspaceTabs : [])
         .map(tab => tab?.filePath)
         .filter(filePath => typeof filePath === 'string' && filePath !== '');
   }
   catch {
      return [];
   }
};

const grantsStore = new Store({
   name: 'granted-paths',
   // Once, on the first launch that has the allowlist: a fresh store records version 0.0.0.
   // Re-reading the renderer-written tabs on every launch would hand back this very permission.
   migrations: {
      '0.7.35': store => store.set('paths', savedTabFilePaths())
   }
});

const granted = new Set<string>(grantsStore.get('paths', []) as string[]);

export function grantPath (filePath: string): void {
   if (typeof filePath !== 'string' || filePath === '' || granted.has(filePath)) return;

   granted.add(filePath);
   grantsStore.set('paths', [...granted]);
}

export function isPathGranted (filePath: string): boolean {
   return matchesGrant(filePath, granted, { isWindows });
}
