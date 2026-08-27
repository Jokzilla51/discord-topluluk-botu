'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ensureStaffStats, getPeriodMetrics } = require('../src/staff-stats');

test('eski yetkili istatistiğini yeni alanlarla kayıpsız tamamlar', () => {
  const data = { staffStats: { user1: { totalVoice: 5000, customMetric: 7 } } };
  const stats = ensureStaffStats(data, 'user1');

  assert.equal(stats.totalVoice, 5000);
  assert.equal(stats.weeklyVoice, 0);
  assert.equal(stats.customMetric, 7);
});

test('haftalık sıfır değer toplam istatistikten doldurulmaz', () => {
  const metrics = getPeriodMetrics({
    weeklyTicketClaims: 0,
    totalTicketClaims: 45,
    totalClaimed: 45,
    weeklyVoice: 0,
    totalVoice: 9_000_000
  }, 'weekly');

  assert.equal(metrics.ticketClaims, 0);
  assert.equal(metrics.voiceTime, 0);
  assert.equal(metrics.score, 0);
});
