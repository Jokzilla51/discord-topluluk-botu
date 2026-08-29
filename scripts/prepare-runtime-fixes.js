'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');

function readIndex() {
  return fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');
}

function writeIndex(source) {
  fs.writeFileSync(indexPath, source, 'utf8');
}

// Önce eski kapsamlı düzeltmeleri dene. Başarısız olursa deployu öldürme.
try {
  writeIndex(readIndex());
  require('./apply-runtime-fixes');
} catch (error) {
  console.warn('Kapsamlı runtime patch atlandı:', error.message);
}

// Ticket/başvuru etkileşimlerini bozan /bot-ses scope hatasını kesin olarak düzelt.
let source = readIndex();
const brokenOpen = `        return interaction.editReply({ embeds: [moveEmbed] });\n      }\n    }\n\n      // 11. /bot-ses`;
const fixedOpen = `        return interaction.editReply({ embeds: [moveEmbed] });\n      }\n\n      // 11. /bot-ses`;
if (source.includes(brokenOpen)) {
  source = source.replace(brokenOpen, fixedOpen);
  console.log('✅ /bot-ses commandName scope açılışı düzeltildi.');
}

const brokenClose = `        return interaction.reply({ embeds: [voiceEmbed] });\n      }\n\n        // ----------------------------------------------------\n    // B. KATEGORİLİ TICKET`;
const fixedClose = `        return interaction.reply({ embeds: [voiceEmbed] });\n      }\n    }\n\n    // ----------------------------------------------------\n    // B. KATEGORİLİ TICKET`;
if (source.includes(brokenClose)) {
  source = source.replace(brokenClose, fixedClose);
  console.log('✅ /bot-ses commandName scope kapanışı düzeltildi.');
}

// discord.js v15 hazırlığı; mevcut v14'te de çalışır.
source = source.replace("client.once('ready', async () => {", "client.once('clientReady', async () => {");
writeIndex(source);

// Manuel 2/2 düzeltmesini yalnızca ana OCR patch uygulanmışsa dene.
if (source.includes('// VYRON_PATCH_V3')) {
  try {
    require('./apply-manual-2of2-fix');
  } catch (error) {
    console.warn('Manuel 2/2 patch atlandı:', error.message);
  }
}

console.log('✅ Vyron runtime hazırlığı tamamlandı.');
