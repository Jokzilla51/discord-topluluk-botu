'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { client, commands } = require('../index');

test.after(() => client.destroy());

test('slash komut adları benzersiz ve Discord JSON çıktıları geçerli', () => {
  const names = commands.map(command => command.name);
  assert.equal(new Set(names).size, names.length);

  for (const command of commands) {
    const json = command.toJSON();
    assert.equal(json.name, command.name);
    assert.ok(json.description.length > 0);
  }
});

test('tanımlanan her slash komutunun interaction handlerı var', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const handledNames = new Set(
    [...source.matchAll(/commandName === '([^']+)'/g)].map(match => match[1])
  );

  const missingHandlers = commands
    .map(command => command.name)
    .filter(name => !handledNames.has(name));

  assert.deepEqual(missingHandlers, []);
});
