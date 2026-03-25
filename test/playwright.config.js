const { defineConfig, devices } = require('@playwright/test');

const dockerHosts = [
  'odk-nginx.example.test',
];

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
            // N.B. this will ONLY work on chromium
            `--host-resolver-rules=${dockerHosts.map(host => `MAP ${host} 127.0.0.1`).join(',')}`,
          ],
        },
      },
    },
  ],
});
