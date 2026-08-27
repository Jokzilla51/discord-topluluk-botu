'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ensureStaffStats } = require('../src/staff-stats');

test('eski yetkili istatistiğini yeni alanlarla kayıpsız tamamlar', () => {
  const data = { staffStats: { user1: { totalVoice: 5000, customMetric: 7 } } };
  const stats = ensureStaffStats(data, 'user1');

  assert.equal(stats.totalVoice, 5000);
  assert.equal(stats.weeklyVoice, 0);
  assert.equal(stats.customMetric, 7);
});
