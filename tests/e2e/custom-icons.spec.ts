import { expect, test } from '@playwright/test';

import {
   customIconInSidebar,
   IconFixture,
   importSettingsFile,
   launchApp,
   makeUserDataDir,
   writeIconSettingsExport
} from './helpers';

const PASSKEY = 'antares-e2e-passkey';

const iconFixtures = (): IconFixture[] => [
   {
      // Resolving `fill="currentColor"` needs the page's cascade, which only reaches an inlined SVG.
      uid: `I:E2ECURRENT${process.pid}`,
      name: 'currentcolor icon',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect x="3" y="3" width="30" height="30" fill="currentColor" /></svg>'
   },
   {
      // `adjustSVGContent` accepts a file with no `xmlns`; only a wrapping `<svg>` parent supplies it.
      uid: `I:E2ENONS${process.pid}`,
      name: 'no namespace icon',
      svg: '<svg viewBox="0 0 36 36"><rect x="3" y="3" width="30" height="30" fill="#c0392b" /></svg>'
   }
];

test.describe('custom connection icons', () => {
   test('an icon painted with currentColor inherits the sidebar colour', async () => {
      const fixtures = iconFixtures();
      const { appWindow, electronApp } = await launchApp(makeUserDataDir());

      await importSettingsFile(appWindow, writeIconSettingsExport(fixtures, PASSKEY), PASSKEY);

      const icon = customIconInSidebar(appWindow, 'currentcolor icon');
      await expect(icon, 'expect the imported custom icon in the sidebar').toBeVisible();
      await expect(
         icon.locator('rect'),
         'expect the icon SVG inline in the document — nothing else can resolve currentColor'
      ).toHaveCount(1);

      const painted = await icon.evaluate(wrapper => ({
         cascade: getComputedStyle(wrapper).color,
         fill: getComputedStyle(wrapper.querySelector('rect')).fill
      }));

      expect(painted.fill, 'expect the shape painted in the colour it inherits').toBe(painted.cascade);
      // Black on the dark settingbar is the regression being pinned, so a black cascade must not pass.
      expect(painted.cascade, 'expect the settingbar cascade not to be black').not.toBe('rgb(0, 0, 0)');

      await electronApp.close();
   });

   test('an icon with no xmlns still renders as a visible graphic', async () => {
      const fixtures = iconFixtures();
      const { appWindow, electronApp } = await launchApp(makeUserDataDir());

      await importSettingsFile(appWindow, writeIconSettingsExport(fixtures, PASSKEY), PASSKEY);

      const icon = customIconInSidebar(appWindow, 'no namespace icon');
      await expect(icon, 'expect the imported custom icon in the sidebar').toBeVisible();

      // A broken image is "visible" to Playwright, so the assertion is on painted geometry.
      const shape = icon.locator('rect');
      await expect(shape, 'expect the icon to draw its shape, not a broken-image placeholder').toHaveCount(1);

      const box = await shape.boundingBox();
      expect(box.width, 'expect the shape to occupy the 30/36 of the 36px icon it asks for').toBeGreaterThan(20);
      expect(box.height).toBeGreaterThan(20);

      await electronApp.close();
   });
});

test.describe('custom icon persistence', () => {
   const userDataDir = makeUserDataDir();

   test('an imported custom icon survives a restart', async () => {
      const [fixture] = iconFixtures();

      let app = await launchApp(userDataDir);
      await importSettingsFile(app.appWindow, writeIconSettingsExport([fixture], PASSKEY), PASSKEY);
      await expect(
         customIconInSidebar(app.appWindow, fixture.name).locator('rect'),
         'expect the imported icon painted in the session that imported it'
      ).toHaveCount(1);
      await app.electronApp.close();

      app = await launchApp(userDataDir);
      const icon = customIconInSidebar(app.appWindow, fixture.name);
      await expect(icon, 'expect the sidebar entry that owns the icon').toBeVisible();
      await expect(
         icon.locator('rect'),
         'expect the icon still painted after a restart — its record must be persisted under the key the store reads'
      ).toHaveCount(1);
      await app.electronApp.close();
   });
});
