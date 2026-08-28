import { expect, Page, test } from '@playwright/test';

import {
   closeApp,
   customIconInSidebar,
   importSettingsFile,
   launchApp,
   makeUserDataDir,
   writeIconSettingsExport
} from './helpers';

const PASSKEY = 'antares-e2e-passkey';

/**
 * `<script>` never runs through an innerHTML insertion, so the payload uses event
 * attributes. `onmouseover` on the plain `<rect>` is the vector that matters: the other
 * three sit on elements a sanitizer drops wholesale, so without it nothing would notice
 * a sanitizer that stopped stripping event attributes — hence the hover assertion below.
 */
const MALICIOUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" onload="window.__pwned = 'svg-onload'">
   <animate attributeName="opacity" dur="0.01s" onbegin="window.__pwned = 'animate-onbegin'" />
   <image href="does-not-exist.png" width="1" height="1" onerror="window.__pwned = 'image-onerror'" />
   <rect x="3" y="3" width="30" height="30" rx="6" fill="#c0392b" onmouseover="window.__pwned = 'rect-onmouseover'" />
</svg>`;

const pwnedBy = (appWindow: Page) =>
   appWindow.evaluate(() => (window as unknown as { __pwned?: string }).__pwned);

test.describe('custom connection icons', () => {
   test('an imported icon renders without running its script', async () => {
      const fixture = { uid: `I:E2EXSS${process.pid}`, name: 'xss icon', svg: MALICIOUS_SVG };
      const exportFile = writeIconSettingsExport([fixture], PASSKEY);

      const app = await launchApp(makeUserDataDir());
      const { appWindow } = app;

      await importSettingsFile(appWindow, exportFile, PASSKEY);

      // The icon is in the DOM and it rendered *something* — otherwise the assertion
      // below would hold for an icon that silently draws nothing.
      const icon = customIconInSidebar(appWindow, fixture.name);
      await expect(icon, 'expect the imported custom icon in the sidebar').toBeVisible();
      await expect(icon.locator('> *'), 'expect the icon to render one node').toHaveCount(1);

      // The SMIL timeline and the failing subresource both fire asynchronously.
      await appWindow.waitForTimeout(500);
      expect(await pwnedBy(appWindow), 'expect no event handler from the icon SVG to have run').toBeUndefined();

      // Center of the icon, which is inside the `<rect>`, so `onmouseover` would fire here.
      await icon.hover();
      await appWindow.waitForTimeout(100);
      expect(await pwnedBy(appWindow), 'expect hovering the icon to run no event handler').toBeUndefined();

      await closeApp(app);
   });
});
