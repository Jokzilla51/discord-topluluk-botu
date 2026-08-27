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
  const current = data.staffStats[userId] || {};
  data.staffStats[userId] = { ...STAFF_STAT_DEFAULTS, ...current };
  return data.staffStats[userId];
}

module.exports = {
  STAFF_STAT_DEFAULTS,
  ensureStaffStats
};
