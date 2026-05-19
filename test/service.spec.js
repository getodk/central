const { execSync } = require('node:child_process');

const logPrefix =`[${__filename.split('/').at(-1)}]`;
const log = (...args) => console.log(logPrefix, ...args);

describe('service image', () => {
  describe('DB_SSL handling', () => {
    before(() => {
      log('Building "service" docker image...');
      execSync('docker compose build service', { cwd:'..', stdio:['ignore', 'inherit', 'inherit'] });
      log('"service" docker image built OK.');
    });

    it('should reject DB_SSL=true', () => {
      throw new Error('TODO');
    });

    it('should start OK if DB_SSL is not set', () => {
      throw new Error('TODO');
    });

    // TODO what to do for other values of DB_SSL?  what to do if DB_SSL is empty string?
  });
});
