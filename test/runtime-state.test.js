'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  hydrateGiveaway,
  hydratePoll,
  serializeGiveaway,
  serializePoll
} = require('../src/runtime-state');

test('çekiliş katılımcıları JSON ile Set arasında kayıpsız çevrilir', () => {
  const serialized = serializeGiveaway({ giveawayId: 'gw1', participants: new Set(['u1', 'u2']) });
  assert.deepEqual(serialized.participants, ['u1', 'u2']);
  assert.deepEqual([...hydrateGiveaway(serialized).participants], ['u1', 'u2']);
});

test('anket oyları JSON ile Set arasında kayıpsız çevrilir', () => {
  const serialized = serializePoll({
    pollId: 'poll1',
    yesVoters: new Set(['u1']),
    noVoters: new Set(['u2'])
  });
  const hydrated = hydratePoll(serialized);
  assert.equal(hydrated.yesVoters.has('u1'), true);
  assert.equal(hydrated.noVoters.has('u2'), true);
});
