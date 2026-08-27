'use strict';

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parsePort(value) {
  const port = Number.parseInt(value || '3000', 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3000;
}

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function loadConfig(env = process.env) {
  const commandScope = String(env.COMMAND_SCOPE || (env.GUILD_ID ? 'guild' : 'global')).toLowerCase();

  return {
    token: String(env.TOKEN || '').trim(),
    guildId: String(env.GUILD_ID || '').trim(),
    port: parsePort(env.PORT),
    commandScope: commandScope === 'guild' ? 'guild' : 'global',
    registerCommands: parseBoolean(env.REGISTER_COMMANDS, true),
    autoSetupOnReady: parseBoolean(env.AUTO_SETUP_ON_READY, false),
    discordBackupEnabled: parseBoolean(env.DISCORD_BACKUP_ENABLED, false),
    ocrEnabled: parseBoolean(env.OCR_ENABLED, true),
    ocrMaxBytes: parsePositiveInteger(env.OCR_MAX_BYTES, 8 * 1024 * 1024),
    ocrMaxImages: Math.min(parsePositiveInteger(env.OCR_MAX_IMAGES, 3), 5),
    footerText: String(env.FOOTER_TEXT || 'discord.gg/vyronmc • Made by profosyonel456').trim(),
    activityText: String(env.ACTIVITY_TEXT || '⚔️ discord.gg/vyronmc').trim()
  };
}

function validateConfig(config) {
  const errors = [];
  if (!config.token) errors.push('TOKEN tanımlı değil.');
  if (config.commandScope === 'guild' && !config.guildId) {
    errors.push('COMMAND_SCOPE=guild kullanılırken GUILD_ID zorunludur.');
  }
  return errors;
}

module.exports = {
  loadConfig,
  parseBoolean,
  parsePort,
  parsePositiveInteger,
  validateConfig
};
