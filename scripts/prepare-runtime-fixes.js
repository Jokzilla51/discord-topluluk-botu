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

// Manuel abone onayı her durumda 2/2 olmaya çalışsın; hata deployu durdurmasın.
try {
  require('./apply-manual-2of2-fix');
} catch (error) {
  console.warn('Manuel 2/2 patch atlandı:', error.message);
}

// OCR HIZLANDIRMA:
// Tesseract.recognize() her SS'de yeni worker açıp kapatır. Tek worker'ı önceden
// hazırlayıp tekrar kullanarak özellikle ikinci ve sonraki doğrulamaları hızlandır.
source = readIndex();
if (!source.includes('// VYRON_SHARED_OCR_WORKER')) {
  const tesseractAnchor = `let Tesseract;\ntry {\n  Tesseract = require('tesseract.js');\n} catch (e) {\n  console.log('Tesseract.js ilk yüklemede hazır değil, gerektiğinde çağrılacak.');\n}\n`;

  const sharedWorkerCode = `${tesseractAnchor}\n// VYRON_SHARED_OCR_WORKER\nlet sharedOcrWorkerPromise = null;\nlet sharedOcrQueue = Promise.resolve();\n\nasync function getSharedOcrWorker() {\n  if (!sharedOcrWorkerPromise) {\n    sharedOcrWorkerPromise = (async () => {\n      if (!Tesseract) Tesseract = require('tesseract.js');\n      const worker = await Tesseract.createWorker('eng', undefined, { logger: () => {} });\n      return worker;\n    })().catch(error => {\n      sharedOcrWorkerPromise = null;\n      throw error;\n    });\n  }\n  return sharedOcrWorkerPromise;\n}\n\nasync function recognizeWithSharedWorker(imageUrl) {\n  const job = sharedOcrQueue.then(async () => {\n    let worker = await getSharedOcrWorker();\n    try {\n      return await worker.recognize(imageUrl);\n    } catch (error) {\n      try { await worker.terminate(); } catch {}\n      sharedOcrWorkerPromise = null;\n      worker = await getSharedOcrWorker();\n      return worker.recognize(imageUrl);\n    }\n  });\n\n  sharedOcrQueue = job.catch(() => {});\n  return job;\n}\n\nsetTimeout(() => {\n  getSharedOcrWorker()\n    .then(() => console.log('⚡ OCR worker hazır.'))\n    .catch(error => console.error('OCR worker ön yükleme hatası:', error.message));\n}, 1500);\n`;

  if (source.includes(tesseractAnchor)) {
    source = source.replace(tesseractAnchor, sharedWorkerCode);
  } else {
    console.warn('OCR worker ekleme noktası bulunamadı; mevcut OCR davranışı korunuyor.');
  }
}

const recognizeRegex = /await Tesseract\.recognize\(imageUrl,\s*'eng',\s*\{\s*logger:\s*\(\)\s*=>\s*\{\}\s*\}\s*\)/g;
if (recognizeRegex.test(source)) {
  source = source.replace(recognizeRegex, 'await recognizeWithSharedWorker(imageUrl)');
  console.log('⚡ OCR tek worker kullanımına geçirildi.');
}

writeIndex(source);

// Healthz, ID tabanlı ticket/başvuru takibi, kalıcı claim, OCR cooldown,
// private log kanalları ve kullanıcıya interaction hata cevabı.
try {
  require('./apply-hardening-v4');
} catch (error) {
  console.warn('V4 hardening atlandı:', error.message);
}

console.log('✅ Vyron runtime hazırlığı tamamlandı.');
