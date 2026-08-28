import { mdiImageBrokenVariant } from '@mdi/js';
import { expect, test } from '@playwright/test';

import {
   closeApp,
   customIconInSidebar,
   CustomIconRecord,
   iconConnectionFixture,
   IconFixture,
   importSettingsFile,
   launchApp,
   makeUserDataDir,
   readConnectionsStore,
   seedConnectionsStore,
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
      const app = await launchApp(makeUserDataDir());
      const { appWindow } = app;

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

      await closeApp(app);
   });

   test('an icon with no xmlns still renders as a visible graphic', async () => {
      const fixtures = iconFixtures();
      const app = await launchApp(makeUserDataDir());
      const { appWindow } = app;

      await importSettingsFile(appWindow, writeIconSettingsExport(fixtures, PASSKEY), PASSKEY);

      const icon = customIconInSidebar(appWindow, 'no namespace icon');
      await expect(icon, 'expect the imported custom icon in the sidebar').toBeVisible();

      // A broken image is "visible" to Playwright, so the assertion is on painted geometry.
      const shape = icon.locator('rect');
      await expect(shape, 'expect the icon to draw its shape, not a broken-image placeholder').toHaveCount(1);

      const box = await shape.boundingBox();
      expect(box.width, 'expect the shape to occupy the 30/36 of the 36px icon it asks for').toBeGreaterThan(20);
      expect(box.height).toBeGreaterThan(20);

      await closeApp(app);
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
      await closeApp(app);

      app = await launchApp(userDataDir);
      const icon = customIconInSidebar(app.appWindow, fixture.name);
      await expect(icon, 'expect the sidebar entry that owns the icon').toBeVisible();
      await expect(
         icon.locator('rect'),
         'expect the icon still painted after a restart — its record must be persisted under the key the store reads'
      ).toHaveCount(1);
      await closeApp(app);
   });
});

test.describe('a missing custom icon record', () => {
   const userDataDir = makeUserDataDir();

   test('does not stop the app from starting', async () => {
      const iconUid = `I:E2EORPHAN${process.pid}`;
      const name = `orphan icon ${process.pid}`;

      // `removeIconHandler` (ModalConnectionAppearance.vue:221) reaches this state in-app.
      let app = await launchApp(userDataDir);
      await seedConnectionsStore(app.appWindow, iconConnectionFixture(iconUid, name));
      await closeApp(app);

      // `launchApp` waits for `#footer` — the shell the crash used to swallow.
      app = await launchApp(userDataDir);

      const entry = app.appWindow.locator('#settingbar .settingbar-element', { hasText: name });
      await expect(entry, 'expect the sidebar entry to still be listed').toBeVisible();

      await expect(
         customIconInSidebar(app.appWindow, name).locator('svg path'),
         'expect the broken-image placeholder glyph in place of the lost icon'
      ).toHaveAttribute('d', mdiImageBrokenVariant);

      await entry.click();
      await expect(entry, 'expect the clicked connection selected').toHaveClass(/selected/);

      expect(
         app.rendererErrors.join('\n'),
         'expect no renderer error from the missing icon record'
      ).not.toMatch(/Buffer|base64/i);

      await closeApp(app);
   });
});

test.describe('custom icons imported before the key rename', () => {
   const userDataDir = makeUserDataDir();

   test('are migrated to the key the store reads', async () => {
      const [orphaned, current] = iconFixtures();
      const record = (fixture: IconFixture): CustomIconRecord =>
         ({ uid: fixture.uid, base64: Buffer.from(fixture.svg, 'utf-8').toString('base64') });

      // What a pre-3dc85625 import left: records under the dead `customIcons` key, plus one the UI wrote to the live key.
      let app = await launchApp(userDataDir);
      await seedConnectionsStore(app.appWindow, {
         ...iconConnectionFixture(orphaned.uid, orphaned.name),
         customIcons: [record(orphaned)],
         custom_icons: [record(current)]
      });
      await closeApp(app);

      app = await launchApp(userDataDir);
      await expect(
         customIconInSidebar(app.appWindow, orphaned.name).locator('rect'),
         'expect the icon recovered from the dead key and painted'
      ).toHaveCount(1);

      expect(
         (await readConnectionsStore<CustomIconRecord[]>(app.appWindow, 'custom_icons')).map(i => i.uid),
         'expect the icon added through the UI kept alongside the recovered one'
      ).toEqual([current.uid, orphaned.uid]);

      expect(
         await readConnectionsStore(app.appWindow, 'customIcons'),
         'expect the dead key gone, so the migration cannot run a second time'
      ).toBeUndefined();

      await closeApp(app);
   });
});
