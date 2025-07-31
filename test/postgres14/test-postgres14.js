const { assert } = require('chai');

const { Client } = require('pg');

describe('postgres14', () => {
  describe('VACUUM', () => {
    const table = 'vac_test_table';

    let client;

    beforeEach(async () => {
      client = new Client({
        host: '0.0.0.0',
        port: 5432,
        user: 'odk',
        password: 'odk',
        database: 'odk',
      });
      await client.connect();

      console.log('beforeEach()', 'maintenance_work_mem:', await client.query(`SELECT current_setting('maintenance_work_mem')`));
      console.log('beforeEach()', 'max_parallel_maintenance_workers:', await client.query(`SELECT current_setting('max_parallel_maintenance_workers')`));
      await client.query(`ALTER SYSTEM SET max_parallel_maintenance_workers = 8`);

      await client.query(`
        DROP TABLE IF EXISTS ${table};

        CREATE TABLE ${table} (
            id SERIAL PRIMARY KEY,
            data TEXT,
            value1 INT,
            value2 INT,
            value3 INT,
            value4 INT,
            value5 INT
        );

        CREATE INDEX idx_force_shm_v_1 ON ${table} (value1);
        CREATE INDEX idx_force_shm_v_2 ON ${table} (value2);
        CREATE INDEX idx_force_shm_v_3 ON ${table} (value3);
        CREATE INDEX idx_force_shm_v_4 ON ${table} (value4);
        CREATE INDEX idx_force_shm_v_5 ON ${table} (value5);
      `);
    });

    afterEach(done => {
      client?.end(done);
    });

    async function rowsExist(rows) {
      await client.query(`
        INSERT INTO ${table} (data, value1, value2, value3, value4, value5)
          SELECT md5(RANDOM()::TEXT)
               , (RANDOM() * 100000)::INTEGER
               , (RANDOM() * 100000)::INTEGER
               , (RANDOM() * 100000)::INTEGER
               , (RANDOM() * 100000)::INTEGER
               , (RANDOM() * 100000)::INTEGER
          FROM GENERATE_SERIES(1, $1)
        `,
        [ rows ],
      );
    }

    async function generateChurn() {
      await client.query(`DELETE FROM ${table} WHERE id % 2 = 0`);
      await client.query(`UPDATE ${table} SET value1 = value1 + 1 WHERE id % 3 = 0`);
      await client.query(`UPDATE ${table} SET value2 = value2 + 1 WHERE id % 5 = 0`);
    }

    async function vacuum() {
      console.log(`vac:`, await client.query(`VACUUM (VERBOSE, PARALLEL 2) ${table}`));
    }

    it('should succeed with 500 rows', async () => {
      // given
      await rowsExist(500);
      // and
      await generateChurn();

      // when
      await vacuum();

      // then
      // no error was thrown
    });

    it('should fail with 1 million rows', async function() {
      this.timeout(30_000);

      // given
      await rowsExist(1_000_000);
      // and
      await generateChurn();

      // when
      let caught;
      try {
        await vacuum();
      } catch(err) {
        console.log('Caught error:', err);
        caught = err;
      }

      // then
      assert.isDefined(caught, 'An error should have been thrown while vacuuming, but it completed successfully');
      assert.match(caught.message, /^could not resize shared memory segment ".*" to \d+ bytes: No space left on device$/);
    });
  });
});
