const { execSync, spawn } = require('node:child_process');

const { assert } = require('chai');

const logPrefix =`[${__filename.split('/').at(-1)}]`;
const log = (...args) => console.log(logPrefix, ...args);

describe('service image', () => {
  describe('DB_SSL handling', () => {
    // Pre-8e05cf3b2e8cbaa2effae2b1d3213fe23f0545cb, odk-central-backend checked
    // DB_SSL like so:
    //
    //     if (ssl != null && ssl !== true)
    //       return Problem.internal.invalidDatabaseConfig({ reason: 'If ssl is specified, its value can only be true.' });
    //
    // This was passed into config in the getodk/central repo pre-d10cccb34bb3abd893563bbe26ed5160df66b972
    // via:
    //
    //     docker-compose.yml: - DB_SSL=${DB_SSL:-null}
    //     files/service/config.json.template: "ssl": ${DB_SSL},

    const generatingServiceConfig = 'generating local service configuration..';
    const unresolvedIssue = '!!! ODK Central backend will not start until this issue is resolved.';
    const finishedMarkers = [
      unresolvedIssue,
      generatingServiceConfig,
    ];

    const runService = (...args) => new Promise(resolve => {
      const stdcombi = [];

      const process = spawn('docker', [ 'compose', 'run', ...args, 'service' ], { cwd:'..' });

      const appendOutput = data => {
        const str = data.toString();
        stdcombi.push(str);

        // Allow short-circuiting of tests - execution time varies
        // wildly depending if docker images are pre-built or not.
        const lines = str.split('\n');
        if(lines.some(line => finishedMarkers.includes(line))) process.kill();
      };
      process.stdout.on('data', appendOutput);
      process.stderr.on('data', appendOutput);

      const timer = setTimeout(() => { process.kill(); }, 9_000);

      process.on('close', (code, signal) => {
        clearTimeout(timer);
        const asLines = datas => datas.join('').split('\n');
        resolve({ code, signal, stdcombi:asLines(stdcombi) });
      });
    });

    before(function () {
      this.timeout(120_000);

      const exec = cmd => execSync(cmd, { cwd:'..', stdio:['ignore', 'inherit', 'inherit'] });

      log('Building "service" docker image...');
      exec('touch .env');
      exec('docker compose pull --include-deps service');
      exec('docker compose build --with-dependencies service');
      log('"service" docker image built OK.');
    });

    [
      '', // e.g. if passed via `docker compose run --env DB_SSL=`
      'true',
      'false',
    ].forEach(badVal => {
      it(`should fail to start if DB_SSL=${badVal}`, async function() {
        this.timeout(10_000);

        // when
        const { stdcombi } = await runService('--env', `DB_SSL=${badVal}`);

        // then
        assertIncludes(stdcombi, unresolvedIssue);
        assertNotIncludes(stdcombi, generatingServiceConfig);
      });
    });

    [
      'null',
    ].forEach(goodVal => {
      it(`should start OK if DB_SSL=${goodVal}`, async function() {
        this.timeout(10_000);

        // when
        const { stdcombi } = await runService('--env', `DB_SSL=${goodVal}`);

        // then
        assertIncludes(stdcombi, generatingServiceConfig);
        assertNotIncludes(stdcombi, unresolvedIssue);
      });
    });

    it('should start OK if DB_SSL is not set', async function() {
      this.timeout(10_000);

      // when
      const { stdcombi } = await runService();

      // then
      assertIncludes(stdcombi, generatingServiceConfig);
      assertNotIncludes(stdcombi, unresolvedIssue);
    });
  });
});

function assertIncludes(stdcombi, expectedLine) {
  assert.include(stdcombi, expectedLine, `Could not find line '${expectedLine}' in stdcombi:\n${stdcombi.join('\n')}`);
}

function assertNotIncludes(stdcombi, expectedLine) {
  assert.notInclude(stdcombi, expectedLine, `Found unexpected line '${expectedLine}' in stdcombi:\n${stdcombi.join('\n')}`);
}
