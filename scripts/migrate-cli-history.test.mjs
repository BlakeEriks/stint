import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cliAdoptedFiles } from './migrate-cli-history.mjs';

describe('cliAdoptedFiles', () => {
  it('matches a filename to the CLI version by its numeric prefix', () => {
    const files = ['00000000000001_schema.sql', '00000000000002_integrity.sql'];
    const cliVersions = ['00000000000001'];
    assert.deepEqual(cliAdoptedFiles(files, cliVersions), [
      '00000000000001_schema.sql',
    ]);
  });

  it('adopts nothing the CLI has not recorded', () => {
    const files = ['00000000000001_schema.sql'];
    assert.deepEqual(cliAdoptedFiles(files, []), []);
  });

  it('adopts every file the CLI has recorded, in file order', () => {
    const files = ['00000000000001_schema.sql', '00000000000002_integrity.sql'];
    const cliVersions = ['00000000000002', '00000000000001'];
    assert.deepEqual(cliAdoptedFiles(files, cliVersions), files);
  });
});
