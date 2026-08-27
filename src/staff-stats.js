'use strict';

const STAFF_STAT_DEFAULTS = Object.freeze({
  todayVoice: 0,
  weeklyVoice: 0,
  totalVoice: 0,
  todayTicketMsgs: 0,
  weeklyTicketMsgs: 0,
  totalTicketMsgs: 0,
  todayTicketClaims: 0,
  weeklyTicketClaims: 0,
  totalTicketClaims: 0,
  todayApplyClaims: 0,
  weeklyApplyClaims: 0,
  totalApplyClaims: 0,
  todayAnydeskChecks: 0,
  weeklyAnydeskChecks: 0,
  totalAnydeskChecks: 0,
  todaySolvedTickets: 0,
  weeklySolvedTickets: 0,
  totalSolvedTickets: 0,
  todayGearGiven: 0,
  weeklyGearGiven: 0,
  totalGearGiven: 0,
  todayClaimed: 0,
  totalClaimed: 0,
  todayTickets: 0,
  totalTickets: 0,
  voiceJoinedAt: null
});

function ensureStaffStats(data, userId) {
  if (!data.staffStats || typeof data.staffStats !== 'object') data.staffStats = {};
  data.staffStats[userId] = normalizeStaffStats(data.staffStats[userId]);
  return data.staffStats[userId];
}

function normalizeStaffStats(value) {
  const current = value && typeof value === 'object' ? value : {};
  const normalized = { ...STAFF_STAT_DEFAULTS, ...current };

  // v1 alanlarını yalnızca yeni karşılığı hiç yoksa bir kez taşır. Sıfır geçerli bir değerdir.
  if (current.todayTicketClaims == null && current.todayClaimed != null) {
    normalized.todayTicketClaims = current.todayClaimed;
  }
  if (current.totalTicketClaims == null && current.totalClaimed != null) {
    normalized.totalTicketClaims = current.totalClaimed;
  }
  if (current.todaySolvedTickets == null && current.todayTickets != null) {
    normalized.todaySolvedTickets = current.todayTickets;
  }
  if (current.totalSolvedTickets == null && current.totalTickets != null) {
    normalized.totalSolvedTickets = current.totalTickets;
  }

  return normalized;
}

function calculateScore(metrics) {
  return Math.floor(metrics.voiceTime / 60_000) * 2 +
    metrics.ticketClaims * 20 +
    metrics.applyClaims * 20 +
    metrics.anydeskChecks * 30 +
    metrics.solvedTickets * 25 +
    metrics.ticketMsgs * 2 +
    metrics.gearGiven * 15;
}

function getPeriodMetrics(value, period = 'today', activeVoiceMs = 0) {
  const stats = normalizeStaffStats(value);
  const prefix = period === 'weekly' ? 'weekly' : period === 'total' ? 'total' : 'today';
  const metrics = {
    voiceTime: Number(stats[`${prefix}Voice`] || 0) + Math.max(0, Number(activeVoiceMs || 0)),
    ticketClaims: Number(stats[`${prefix}TicketClaims`] || 0),
    applyClaims: Number(stats[`${prefix}ApplyClaims`] || 0),
    anydeskChecks: Number(stats[`${prefix}AnydeskChecks`] || 0),
    solvedTickets: Number(stats[`${prefix}SolvedTickets`] || 0),
    ticketMsgs: Number(stats[`${prefix}TicketMsgs`] || 0),
    gearGiven: Number(stats[`${prefix}GearGiven`] || 0)
  };

  return { ...metrics, score: calculateScore(metrics) };
}

module.exports = {
  STAFF_STAT_DEFAULTS,
  calculateScore,
  ensureStaffStats,
  getPeriodMetrics,
  normalizeStaffStats
};
