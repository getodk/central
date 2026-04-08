const { defineConfig, devices } = require('@playwright/test');

const reporter = [ ['list'] ];
if(process.env.CI) reporter.push(['github']);

module.exports = defineConfig({
  outputDir: '.playwright-report',
  testDir: 'nginx/src/playwright',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
        launchOptions: {
          args: [
            '--host-resolver-rules=MAP odk-nginx.example.test 127.0.0.1',
          ],
        },
      },
    },
  ],
});
