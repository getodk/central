const { execSync, spawn } = require('node:child_process');

const { assert } = require('chai');

const logPrefix =`[${__filename.split('/').at(-1)}]`;
const log = (...args) => console.log(logPrefix, ...args);

describe('service image', () => {
  describe('DB_SSL handling', () => {
    const runService = (...args) => new Promise(resolve => {
      const stdcombi = [];

      const process = spawn('docker', [ 'compose', 'run', ...args, 'service' ], { cwd:'..' });

      const appendOutput = data => stdcombi.push(data.toString());
      process.stdout.on('data', appendOutput);
      process.stderr.on('data', appendOutput);

      const timer = setTimeout(() => { process.kill(); }, 8_000);

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

    it('should reject DB_SSL=true', async function() {
      this.timeout(10_000);

      // when
      const { stdcombi } = await runService('--env', 'DB_SSL=true');

      // then
      assertIncludes(stdcombi, '!!! ODK Central backend will not start until this issue is resolved.');
      assertNotIncludes(stdcombi, 'running migrations..');
    });

    it('should start OK if DB_SSL is not set', async function() {
      this.timeout(10_000);

      // when
      const { stdcombi } = await runService();

      // then
      assertIncludes(stdcombi, 'running migrations..');
      assertNotIncludes(stdcombi, '!!! ODK Central backend will not start until this issue is resolved.');
    });

    // TODO what to do for other values of DB_SSL?  what to do if DB_SSL is empty string?
  });
});

function assertIncludes(stdcombi, expectedLine) {
  assert.include(stdcombi, 'running migrations..', `Could not find line '${expectedLine}' in stdcombi:\n${stdcombi.join('\n')}`);
}

function assertNotIncludes(stdcombi, expectedLine) {
  assert.notInclude(stdcombi, 'running migrations..', `Found unexpected line '${expectedLine}' in stdcombi:\n${stdcombi.join('\n')}`);
}
