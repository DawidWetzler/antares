import { defineConfig } from '@playwright/test';

export default defineConfig({
   testDir: './tests/e2e',
   testMatch: '*.spec.ts',
   // Each spec launches its own Electron instance against its own userData dir and its own
   // SQLite fixture, so specs are independent. Electron is heavy, so cap the fan-out well
   // below the core count and let PW_WORKERS raise or lower it.
   fullyParallel: true,
   workers: Number(process.env.PW_WORKERS) || 3,
   // Playwright wipes its output dir on start, so two concurrent invocations would delete
   // each other's traces. PW_OUTPUT_DIR keeps parallel runs apart.
   outputDir: process.env.PW_OUTPUT_DIR || 'test-results',
   forbidOnly: !!process.env.CI,
   retries: 0,
   timeout: 90_000,
   expect: { timeout: 15_000 },
   reporter: 'list',
   use: { trace: 'retain-on-failure' }
});
