'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = Object.freeze({
  schemaVersion: 2,
  staffRoleIds: [],
  ticketStaffRoleIds: [],
  aboneStaffRoleIds: [],
  applyCategoryId: null,
  ticketCategoryId: null,
  clanRoleId: null,
  hasClanRoleId: null,
  aboneRoleId: null,
  aboneLogChannelId: null,
  staffStats: {},
  staffLeaderboardChannelId: null,
  staffLeaderboardMessageId: null,
  lastDailyResetDate: '',
  tagText: 'VYRN',
  tagLogChannelId: null,
  tagRoleId: null,
  tagRequiredRoleIds: [],
  tagUsers: {},
  gearLogChannelId: null,
  userLevels: {},
  securityMode: true,
  giveaways: {},
  polls: {},
  openTickets: {},
  ticketClaims: {},
  announcementAcks: {},
  afkUsers: {},
  applicationCounter: 1
});

function cloneDefault(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeData(value) {
  const parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = { ...cloneDefault(DEFAULT_DATA), ...parsed, schemaVersion: 2 };

  for (const key of ['staffRoleIds', 'ticketStaffRoleIds', 'aboneStaffRoleIds', 'tagRequiredRoleIds']) {
    normalized[key] = Array.isArray(normalized[key]) ? [...new Set(normalized[key].filter(Boolean))] : [];
  }

  for (const key of [
    'staffStats',
    'tagUsers',
    'userLevels',
    'giveaways',
    'polls',
    'openTickets',
    'ticketClaims',
    'announcementAcks',
    'afkUsers'
  ]) {
    if (!normalized[key] || typeof normalized[key] !== 'object' || Array.isArray(normalized[key])) {
      normalized[key] = {};
    }
  }

  normalized.securityMode = normalized.securityMode !== false;
  if (!String(parsed.tagText || '').trim() || ['ϟVYRN', '⚡VYRN'].includes(parsed.tagText)) {
    normalized.tagText = 'VYRN';
  }
  normalized.applicationCounter = Number.isInteger(normalized.applicationCounter) && normalized.applicationCounter > 0
    ? normalized.applicationCounter
    : 1;
  return normalized;
}

function createDataStore(filePath) {
  const resolvedPath = path.resolve(filePath);

  function loadData() {
    try {
      if (!fs.existsSync(resolvedPath)) return normalizeData();
      return normalizeData(JSON.parse(fs.readFileSync(resolvedPath, 'utf8')));
    } catch (error) {
      console.error('Data okuma hatası:', error);
      return normalizeData();
    }
  }

  function saveData(data) {
    const normalized = normalizeData(data);
    const directory = path.dirname(resolvedPath);
    const tempPath = `${resolvedPath}.${process.pid}.tmp`;

    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      fs.renameSync(tempPath, resolvedPath);
      return normalized;
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      console.error('Data kaydetme hatası:', error);
      throw error;
    }
  }

  return { loadData, saveData, filePath: resolvedPath };
}

module.exports = {
  DEFAULT_DATA,
  createDataStore,
  normalizeData
};
