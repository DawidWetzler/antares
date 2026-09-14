import { ShortcutRecord } from 'common/shortcuts';
import { ipcRenderer } from 'electron';
import Store from 'electron-store';
import { defineStore } from 'pinia';
import { ref } from 'vue';

import { AvailableLocale, i18n } from '@/i18n';

const settingsStore = new Store({ name: 'settings' });
const shortcutsStore = new Store({ name: 'shortcuts' });
const isDarkTheme = window.matchMedia('(prefers-color-scheme: dark)');
const defaultAppTheme = isDarkTheme.matches ? 'dark' : 'light';
const prefersDark = ref(isDarkTheme.matches);
// Up to 0.8.0 a single `editor_theme` covered both colour schemes. Keep it as the
// fallback for whichever scheme the user has not picked a theme for since.
const legacyEditorTheme = (): string => {
   const stored = settingsStore.get('editor_theme') as string;

   return stored && stored !== 'auto' ? stored : null;
};

isDarkTheme.addEventListener('change', e => {
   prefersDark.value = e.matches;
});

export type EditorFontSize = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
export type ApplicationTheme = 'light' | 'dark' | 'system';

export const useSettingsStore = defineStore('settings', {
   state: () => ({
      locale: settingsStore.get('locale', 'en-US') as AvailableLocale,
      allowPrerelease: settingsStore.get('allow_prerelease', false) as boolean,
      explorebarSize: settingsStore.get('explorebar_size', null) as number,
      notificationsTimeout: settingsStore.get('notifications_timeout', 5) as number,
      showTableSize: settingsStore.get('show_table_size', false) as boolean,
      dataTabLimit: settingsStore.get('data_tab_limit', 1000) as number,
      autoComplete: settingsStore.get('auto_complete', true) as boolean,
      lineWrap: settingsStore.get('line_wrap', true) as boolean,
      executeSelected: settingsStore.get('execute_selected', true) as boolean,
      applicationTheme: settingsStore.get('application_theme', defaultAppTheme) as ApplicationTheme,
      editorThemeLight: settingsStore.get('editor_theme_light', legacyEditorTheme() ?? 'sqlserver') as string,
      editorThemeDark: settingsStore.get('editor_theme_dark', legacyEditorTheme() ?? 'twilight') as string,
      editorFontSize: settingsStore.get('editor_font_size', 'medium') as EditorFontSize,
      restoreTabs: settingsStore.get('restore_tabs', true) as boolean,
      disableBlur: settingsStore.get('disable_blur', false) as boolean,
      shortcuts: shortcutsStore.get('shortcuts', []) as ShortcutRecord[],
      defaultCopyType: settingsStore.get('default_copy_type', 'cell') as string
   }),
   getters: {
      resolvedTheme: (state): 'light' | 'dark' => state.applicationTheme === 'system'
         ? (prefersDark.value ? 'dark' : 'light')
         : state.applicationTheme,
      resolvedEditorTheme (state): string {
         return this.resolvedTheme === 'dark' ? state.editorThemeDark : state.editorThemeLight;
      }
   },
   actions: {
      changeLocale (locale: AvailableLocale) {
         this.locale = locale;
         i18n.global.locale = locale;
         settingsStore.set('locale', this.locale);
      },
      changePageSize (limit: number) {
         this.dataTabLimit = limit;
         settingsStore.set('data_tab_limit', this.dataTabLimit);
      },
      changeAllowPrerelease (allow: boolean) {
         this.allowPrerelease = allow;
         settingsStore.set('allow_prerelease', this.allowPrerelease);
      },
      updateNotificationsTimeout (timeout: number) {
         this.notificationsTimeout = timeout;
         settingsStore.set('notifications_timeout', this.notificationsTimeout);
      },
      changeShowTableSize (show: boolean) {
         this.showTableSize = show;
         settingsStore.set('show_table_size', this.showTableSize);
      },
      changeExplorebarSize (size: number) {
         this.explorebarSize = size;
         settingsStore.set('explorebar_size', this.explorebarSize);
      },
      changeAutoComplete (val: boolean) {
         this.autoComplete = val;
         settingsStore.set('auto_complete', this.autoComplete);
      },
      changeLineWrap (val: boolean) {
         this.lineWrap = val;
         settingsStore.set('line_wrap', this.lineWrap);
      },
      changeExecuteSelected (val: boolean) {
         this.executeSelected = val;
         settingsStore.set('execute_selected', this.executeSelected);
      },
      changeApplicationTheme (theme: ApplicationTheme) {
         this.applicationTheme = theme;
         settingsStore.set('application_theme', this.applicationTheme);
         ipcRenderer.send('refresh-theme-settings');
      },
      changeEditorTheme (theme: string) {
         if (this.resolvedTheme === 'dark') {
            this.editorThemeDark = theme;
            settingsStore.set('editor_theme_dark', theme);
         }
         else {
            this.editorThemeLight = theme;
            settingsStore.set('editor_theme_light', theme);
         }
      },
      changeEditorFontSize (size: EditorFontSize) {
         this.editorFontSize = size;
         settingsStore.set('editor_font_size', this.editorFontSize);
      },
      changeRestoreTabs (val: boolean) {
         this.restoreTabs = val;
         settingsStore.set('restore_tabs', this.restoreTabs);
      },
      changeDisableBlur (val: boolean) {
         this.disableBlur = val;
         settingsStore.set('disable_blur', this.disableBlur);
      },
      updateShortcuts (shortcuts: ShortcutRecord[]) {
         this.shortcuts = shortcuts;
      },
      changeDefaultCopyType (type: string) {
         this.defaultCopyType = type;
         settingsStore.set('default_copy_type', this.defaultCopyType);
      }
   }
});
