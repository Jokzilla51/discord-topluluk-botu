'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');
let source = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

if (source.includes('// VYRON_HARDENING_V4')) {
  console.log('✅ V4 hardening already applied.');
  process.exit(0);
}

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) {
    console.warn(`⚠️ V4 hedefi bulunamadı: ${label}`);
    return false;
  }
  source = source.replace(search, replacement);
  return true;
}

function replaceRegex(regex, replacement, label) {
  if (!regex.test(source)) {
    console.warn(`⚠️ V4 regex hedefi bulunamadı: ${label}`);
    return false;
  }
  source = source.replace(regex, replacement);
  return true;
}

// -----------------------------------------------------------------------------
// 1) Sağlık endpointi: Render gerçek JSON health kontrolü yapabilsin.
// -----------------------------------------------------------------------------
replaceRegex(
  /http\.createServer\(\(req, res\) => \{[\s\S]*?\}\)\.listen\(PORT, \(\) => \{\n\s*console\.log\(`🌐 Web sunucusu \$\{PORT\} portunda aktif\.`\);\n\}\);/,
  `http.createServer((req, res) => {
  if (req.url === '/healthz') {
    const ready = Boolean(client?.isReady?.());
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: ready, discordReady: ready, uptime: Math.floor(process.uptime()) }));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>⚔️ Vyron Ticket, Klan Başvuru & OCR Abone Botu 7/24 Aktif!</h1>');
}).listen(PORT, () => {
  console.log(\`🌐 Web sunucusu \${PORT} portunda aktif.\`);
});`,
  'healthz'
);

// -----------------------------------------------------------------------------
// 2) Persist edilen state alanlarını loadData içinde koru.
// -----------------------------------------------------------------------------
replaceOnce(
  `        botVoiceChannelId: parsed.botVoiceChannelId || null,\n        userSubscribedChannels: parsed.userSubscribedChannels || {}\n`,
  `        botVoiceChannelId: parsed.botVoiceChannelId || null,\n        userSubscribedChannels: parsed.userSubscribedChannels || {},\n        openTickets: parsed.openTickets || {},\n        openApplications: parsed.openApplications || {},\n        ticketClaims: parsed.ticketClaims || {}\n`,
  'loadData persisted fields'
);
replaceOnce(
  `    botVoiceChannelId: null,\n    userSubscribedChannels: {}\n`,
  `    botVoiceChannelId: null,\n    userSubscribedChannels: {},\n    openTickets: {},\n    openApplications: {},\n    ticketClaims: {}\n`,
  'default persisted fields'
);

// -----------------------------------------------------------------------------
// 3) Kalıcı claim/ticket yardımcıları + OCR kullanıcı kilidi.
// -----------------------------------------------------------------------------
replaceOnce(
  `const activeClaimedTickets = new Map(); // channelId -> { claimedBy, claimedAt }\nconst ticketTranscripts = new Map();     // channelId -> Array<{ author, content, timestamp }>\n`,
  `const activeClaimedTickets = new Map(); // channelId -> { claimedBy, claimedAt }\nconst ticketTranscripts = new Map();     // channelId -> Array<{ author, content, timestamp }>\nconst ocrCooldowns = new Map();\n\nfunction clearPersistentChannelState(data, channelId) {\n  for (const [userId, savedChannelId] of Object.entries(data.openTickets || {})) {\n    if (savedChannelId === channelId) delete data.openTickets[userId];\n  }\n  for (const [userId, savedChannelId] of Object.entries(data.openApplications || {})) {\n    if (savedChannelId === channelId) delete data.openApplications[userId];\n  }\n  if (data.ticketClaims) delete data.ticketClaims[channelId];\n  saveData(data);\n}\n\n// VYRON_HARDENING_V4\n`,
  'persistent helpers'
);

// -----------------------------------------------------------------------------
// 4) OCR spam/cooldown: aynı kullanıcı arka arkaya kuyruğu dolduramasın.
// -----------------------------------------------------------------------------
replaceOnce(
  `    if (isAboneChannel && message.attachments.size > 0) {\n`,
  `    if (isAboneChannel && message.attachments.size > 0) {\n      const now = Date.now();\n      const lastOcrAt = ocrCooldowns.get(message.author.id) || 0;\n      const cooldownMs = 4000;\n      if (now - lastOcrAt < cooldownMs) {\n        const remaining = Math.ceil((cooldownMs - (now - lastOcrAt)) / 1000);\n        await message.reply({ content: \`⏳ OCR kuyruğunu korumak için **\${remaining} saniye** sonra tekrar SS gönder. Aynı mesajda iki SS gönderebilirsin.\` }).catch(() => {});\n        return;\n      }\n      ocrCooldowns.set(message.author.id, now);\n`,
  'OCR cooldown'
);

// -----------------------------------------------------------------------------
// 5) Ticket duplicate tespiti username yerine Discord kullanıcı ID state'i ile.
// -----------------------------------------------------------------------------
replaceRegex(
  /const existingCh = guild\.channels\.cache\.find\(c => c\.name\.includes\(`ticket-\$\{user\.username\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\/g, ''\)\}`\)\);\n\s*if \(existingCh\) \{\n\s*return interaction\.reply\(\{ content: `⚠️ Zaten açık bir destek talebiniz bulunuyor: \$\{existingCh\}`, ephemeral: true \}\);\n\s*\}/,
  `const savedTicketId = data.openTickets?.[user.id];
      const existingCh = savedTicketId ? guild.channels.cache.get(savedTicketId) : null;
      if (existingCh) {
        return interaction.reply({ content: \`⚠️ Zaten açık bir destek talebiniz bulunuyor: \${existingCh}\`, ephemeral: true });
      }
      if (savedTicketId && data.openTickets) {
        delete data.openTickets[user.id];
        saveData(data);
      }`,
  'ticket duplicate by id'
);
replaceOnce(
  `      if (!ticketChannel) {\n        return interaction.editReply({ content: '❌ Destek kanalı oluşturulamadı. Lütfen yetkiliye bildiriniz.' });\n      }\n`,
  `      if (!ticketChannel) {\n        return interaction.editReply({ content: '❌ Destek kanalı oluşturulamadı. Lütfen yetkiliye bildiriniz.' });\n      }\n      if (!data.openTickets) data.openTickets = {};\n      data.openTickets[user.id] = ticketChannel.id;\n      saveData(data);\n`,
  'persist ticket owner'
);

// -----------------------------------------------------------------------------
// 6) Başvuru duplicate tespiti de kullanıcı ID ile.
// -----------------------------------------------------------------------------
replaceRegex(
  /const existingCh = guild\.channels\.cache\.find\(c => c\.name\.includes\(`basvuru-\$\{user\.username\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\/g, ''\)\}`\)\);\n\s*if \(existingCh\) \{\n\s*return interaction\.reply\(\{ content: `⚠️ Zaten açık bir başvurunuz bulunuyor: \$\{existingCh\}`, ephemeral: true \}\);\n\s*\}/,
  `const savedApplyId = data.openApplications?.[user.id];
      const existingCh = savedApplyId ? guild.channels.cache.get(savedApplyId) : null;
      if (existingCh) {
        return interaction.reply({ content: \`⚠️ Zaten açık bir başvurunuz bulunuyor: \${existingCh}\`, ephemeral: true });
      }
      if (savedApplyId && data.openApplications) {
        delete data.openApplications[user.id];
        saveData(data);
      }`,
  'application duplicate by id'
);
replaceOnce(
  `      if (!applyChannel) {\n        return interaction.editReply({ content: '❌ Başvuru odası açılamadı. Lütfen yöneticiye bildiriniz.' });\n      }\n`,
  `      if (!applyChannel) {\n        return interaction.editReply({ content: '❌ Başvuru odası açılamadı. Lütfen yöneticiye bildiriniz.' });\n      }\n      if (!data.openApplications) data.openApplications = {};\n      data.openApplications[user.id] = applyChannel.id;\n      saveData(data);\n`,
  'persist application owner'
);

// -----------------------------------------------------------------------------
// 7) Claim restart sonrası da korunsun.
// -----------------------------------------------------------------------------
replaceOnce(
  `        const channel = interaction.channel;\n        const claim = activeClaimedTickets.get(channel.id);\n        if (claim) {\n`,
  `        const channel = interaction.channel;\n        const persistentClaim = data.ticketClaims?.[channel.id];\n        const claim = activeClaimedTickets.get(channel.id) || persistentClaim;\n        if (claim) {\n`,
  'read persistent claim'
);
replaceOnce(
  `        activeClaimedTickets.set(channel.id, {\n          claimedBy: member.id,\n          claimedAt: Date.now()\n        });\n`,
  `        const claimRecord = { claimedBy: member.id, claimedAt: Date.now() };\n        activeClaimedTickets.set(channel.id, claimRecord);\n        if (!data.ticketClaims) data.ticketClaims = {};\n        data.ticketClaims[channel.id] = claimRecord;\n        saveData(data);\n`,
  'save persistent claim'
);

// Kanal silinmeden önce kalıcı state temizliği. Tüm close/accept/reject yollarını kapsar.
source = source.replaceAll(
  `          activeClaimedTickets.delete(channel.id);\n          ticketTranscripts.delete(channel.id);\n          await channel.delete().catch(() => {});`,
  `          activeClaimedTickets.delete(channel.id);\n          ticketTranscripts.delete(channel.id);\n          clearPersistentChannelState(loadData(), channel.id);\n          await channel.delete().catch(() => {});`
);

// -----------------------------------------------------------------------------
// 8) Log kanalları private: everyone göremez; bot ve tanımlı staff görebilir.
// -----------------------------------------------------------------------------
source = source.replaceAll(
  `          id: guild.roles.everyone.id,\n          deny: [PermissionFlagsBits.SendMessages]\n        }`,
  `          id: guild.roles.everyone.id,\n          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]\n        },\n        {\n          id: client.user.id,\n          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]\n        },\n        ...getAllStaffRoles(guild, loadData()).map(role => ({\n          id: role.id,\n          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]\n        }))`
);

// -----------------------------------------------------------------------------
// 9) Interaction catch: mümkünse kullanıcıya cevap ver; Discord'da sessiz kalmasın.
// -----------------------------------------------------------------------------
replaceOnce(
  `  } catch (err) {\n    console.error('Etkileşim hatası:', err);\n  }\n});\n`,
  `  } catch (err) {\n    console.error('Etkileşim hatası:', err);\n    try {\n      const payload = { content: '❌ İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.', ephemeral: true };\n      if (interaction.deferred || interaction.replied) await interaction.followUp(payload);\n      else await interaction.reply(payload);\n    } catch {}\n  }\n});\n`,
  'interaction error response'
);

fs.writeFileSync(indexPath, source, 'utf8');
console.log('✅ V4 hardening uygulandı: healthz, ID ticket/app state, persistent claims, OCR cooldown, private logs, error replies.');
