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

      const timer = setTimeout(() => { process.kill(); }, 2_000);

      process.on('close', (code, signal) => {
        clearTimeout(timer);
        const asLines = datas => datas.join('').split('\n');
        resolve({ code, signal, stdcombi:asLines(stdcombi) });
      });
    });

    before(function () {
      this.timeout(120_000);
      log('Building "service" docker image...');
      execSync('touch .env', { cwd:'..', stdio:['ignore', 'inherit', 'inherit'] });
      execSync('docker compose build service', { cwd:'..', stdio:['ignore', 'inherit', 'inherit'] });
      log('"service" docker image built OK.');
    });

    it('should reject DB_SSL=true', async function() {
      this.timeout(5000);

      // when
      const { stdcombi } = await runService('--env', 'DB_SSL=true');

      // then
      assert.include(stdcombi, '!!! ODK Central backend will not start until this issue is resolved.', `Full output: \n${stdcombi.join('\n')}`);
      assert.notInclude(stdcombi, 'running migrations..');
    });

    it('should start OK if DB_SSL is not set', async function() {
      this.timeout(5000);

      // when
      const { stdcombi } = await runService();

      // then
      assert.include(stdcombi, 'running migrations..', `Full output: \n${stdcombi.join('\n')}`);
      assert.notInclude(stdcombi, '!!! ODK Central backend will not start until this issue is resolved.');
    });

    // TODO what to do for other values of DB_SSL?  what to do if DB_SSL is empty string?
  });
});
