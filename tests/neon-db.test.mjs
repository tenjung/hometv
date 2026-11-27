import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toPg} from '../server/neon-db.mjs';

test('SQLite placeholders become numbered Postgres parameters', () => {
  assert.equal(toPg('SELECT a FROM t WHERE id = ? AND rev = ?'), 'SELECT a FROM t WHERE id = $1 AND rev = $2');
  assert.equal(toPg('INSERT INTO s (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    'INSERT INTO s (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
});

test('question marks inside quoted literals and identifiers are left alone', () => {
  assert.equal(toPg("SELECT '?' AS \"q?\", x FROM t WHERE y = ?"), "SELECT '?' AS \"q?\", x FROM t WHERE y = $1");
});
