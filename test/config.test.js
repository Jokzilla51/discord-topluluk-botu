'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadConfig, parseBoolean, parsePort, validateConfig } = require('../src/config');

test('boolean ve port ortam değişkenleri güvenli biçimde ayrıştırılır', () => {
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('OFF', true), false);
  assert.equal(parsePort('8080'), 8080);
  assert.equal(parsePort('99999'), 3000);
});

test('guild komut kapsamı GUILD_ID gerektirir', () => {
  const config = loadConfig({ TOKEN: 'test', COMMAND_SCOPE: 'guild' });
  assert.deepEqual(validateConfig(config), ['COMMAND_SCOPE=guild kullanılırken GUILD_ID zorunludur.']);
});
