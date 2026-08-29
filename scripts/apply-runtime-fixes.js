'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');
let source = fs.readFileSync(indexPath, 'utf8');

if (source.includes('// VYRON_PATCH_V3')) {
  console.log('Vyron fixes already applied.');
  process.exit(0);
}

function replaceRequired(regex, replacement, label) {
  if (!regex.test(source)) {
    throw new Error(`Patch hedefi bulunamadı: ${label}`);
  }
  source = source.replace(regex, replacement);
}

// Atomik veri kaydı: yazma yarıda kesilirse data.json bozulmasın.
replaceRequired(
  /function saveData\(data, triggerSync = true\) \{[\s\S]*?\n\}/,
  `function saveData(data, triggerSync = true) {
  const tempFile = \`${'${DATA_FILE}'}.${'${process.pid}'}.tmp\`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DATA_FILE);
    if (triggerSync) triggerCloudSave();
  } catch (err) {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
    console.error('Veri kaydetme hatası:', err);
  }
}`,
  'saveData'
);

// Discord yedeğini mesaj gövdesine sığdırmak yerine JSON dosyası olarak sakla.
replaceRequired(
  /async function syncDataFromDiscordCloud\(guild\) \{[\s\S]*?\n\}\n\nasync function syncDataToDiscordCloud\(guild\) \{[\s\S]*?\n\}/,
  `async function syncDataFromDiscordCloud(guild) {
  try {
    const ch = await getOrCreateBackupChannel(guild);
    if (!ch) return;
    const messages = await ch.messages.fetch({ limit: 10 }).catch(() => null);
    if (!messages || messages.size === 0) return;

    let cloudData = null;
    for (const msg of messages.values()) {
      const jsonAttachment = msg.attachments?.find(a => a.name === 'vyron-bot-data.json' || a.name?.endsWith('.json'));
      if (jsonAttachment) {
        const response = await fetch(jsonAttachment.url).catch(() => null);
        if (response?.ok) {
          cloudData = JSON.parse(await response.text());
          break;
        }
      }
      const jsonMatch = msg.content?.match(/\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\`/);
      if (jsonMatch?.[1]) {
        cloudData = JSON.parse(jsonMatch[1]);
        break;
      }
    }
    if (!cloudData) return;

    const localData = loadData();
    if (cloudData.ticketStaffRoleIds?.length) localData.ticketStaffRoleIds = [...new Set([...localData.ticketStaffRoleIds, ...cloudData.ticketStaffRoleIds])];
    if (cloudData.applyStaffRoleIds?.length) localData.applyStaffRoleIds = [...new Set([...localData.applyStaffRoleIds, ...cloudData.applyStaffRoleIds])];
    for (const key of ['ticketCategoryId', 'applyCategoryId', 'applyClanRoleId', 'aboneChannelId', 'aboneRoleId', 'aboneLogChannelId', 'botVoiceChannelId']) {
      if (cloudData[key]) localData[key] = cloudData[key];
    }
    if (cloudData.userSubscribedChannels) localData.userSubscribedChannels = { ...localData.userSubscribedChannels, ...cloudData.userSubscribedChannels };
    saveData(localData, false);
    console.log(\`💾 Discord yedeğinden veriler geri yüklendi: ${'${guild.name}'}\`);
  } catch (err) {
    console.error('Bulut veri senkronizasyon hatası:', err);
  }
}

async function syncDataToDiscordCloud(guild) {
  try {
    const ch = await getOrCreateBackupChannel(guild);
    if (!ch) return;
    const data = loadData();
    const backupJson = JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2);
    await ch.send({
      content: \`📦 Otomatik Vyron bot yedeği • ${'${new Date().toLocaleString(\'tr-TR\')}'}\`,
      files: [{ attachment: Buffer.from(backupJson, 'utf8'), name: 'vyron-bot-data.json' }]
    });
  } catch (err) {
    console.error('Bulut veri kaydetme hatası:', err);
  }
}`,
  'cloud backup'
);

// OCR: yalnızca gerçek abonelik durumunu, doğru kanal adını ve tam ekran işaretlerini kabul et.
replaceRequired(
  /async function analyzeYoutubeScreenshot\(imageUrl, width, height\) \{[\s\S]*?\n\}\n\n\/\/ ----------------------------------------------------\n\/\/ 7\/24 SES/,
  `async function analyzeYoutubeScreenshot(imageUrl, width, height) {
  try {
    if (!Tesseract) {
      try { Tesseract = require('tesseract.js'); }
      catch { return { isValid: false, reason: 'ocr_unavailable', message: 'OCR modülü hazır değil.' }; }
    }

    const result = await Tesseract.recognize(imageUrl, 'eng', { logger: () => {} });
    const rawText = (result?.data?.text || '').toLowerCase();
    const cleanText = rawText
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/\\|/g, 'l').replace(/\\s+/g, ' ');
    const compactText = cleanText.replace(/[^a-z0-9]/g, '');

    const subscribedPhrases = ['abone olundu', 'abonesiniz', 'subscribed', 'subscription active'];
    const hasSubscribedState = subscribedPhrases.some(p => cleanText.includes(p)) ||
      compactText.includes('aboneolundu') || compactText.includes('abonesiniz') || compactText.includes('subscribed');

    // "Abone ol" butonu görünüyorsa kullanıcı henüz abone değildir.
    const hasSubscribeButton = (cleanText.includes('abone ol') || compactText.includes('aboneol')) &&
      !cleanText.includes('abone olundu') && !compactText.includes('aboneolundu');

    const detectedBirim = compactText.includes('birimfonksiyons') ||
      compactText.includes('birimfonksiyon') || compactText.includes('birimfonkslyons');
    const detectedFroz = compactText.includes('xfrozzeq') ||
      compactText.includes('frozzeq') || compactText.includes('xfrozeq');

    if (detectedBirim && detectedFroz) {
      return { isValid: false, reason: 'multiple_channels', message: 'Her kanal için ayrı tam ekran SS gönderin.' };
    }
    if (!detectedBirim && !detectedFroz) {
      return { isValid: false, reason: 'wrong_channel', message: 'Hedef YouTube kanalı okunamadı.' };
    }
    if (hasSubscribeButton || !hasSubscribedState) {
      return { isValid: false, reason: 'sub_not_found', message: 'Abone Olundu / Subscribed durumu okunamadı.' };
    }

    const minDimensionOk = Number(width) >= 600 && Number(height) >= 600;
    const ratio = width && height ? Math.max(width, height) / Math.min(width, height) : 0;
    const ratioOk = ratio >= 1.2 && ratio <= 2.6;
    const statusSignals = [
      /\\b([01]?\\d|2[0-3])[:.]([0-5]\\d)\\b/.test(cleanText),
      cleanText.includes('%'), cleanText.includes('wifi'), cleanText.includes('4g'), cleanText.includes('5g'),
      cleanText.includes('lte'), cleanText.includes('youtube'), cleanText.includes('youtube.com'),
      cleanText.includes('shorts'), cleanText.includes('home'), cleanText.includes('ana sayfa'),
      cleanText.includes('subscriptions'), cleanText.includes('abonelikler'), cleanText.includes('search'), cleanText.includes('arama')
    ].filter(Boolean).length;

    if (!minDimensionOk || !ratioOk || statusSignals < 2) {
      return { isValid: false, reason: 'not_fullscreen', message: 'Görsel tam ekran veya yeterince net görünmüyor.' };
    }

    return {
      isValid: true,
      detectedBirim,
      detectedFroz,
      isFullScreen: true,
      ocrText: cleanText.slice(0, 1000)
    };
  } catch (error) {
    console.error('OCR Analiz Hatası:', error);
    return { isValid: false, reason: 'error', message: 'OCR işlemi başarısız oldu.' };
  }
}

// ----------------------------------------------------
// 7/24 SES`,
  'OCR analyzer'
);

// Yetkili kontrolünde rol adına "içeriyor" araması yapma; kayıtlı rol, gerçek izin veya tam rol adı kullan.
replaceRequired(
  /function getAllStaffRoles\(guild, data\) \{[\s\S]*?\n\}\n\nfunction isStaffMember\(member, data\) \{[\s\S]*?\n\}/,
  `function getAllStaffRoles(guild, data) {
  const staffRoleIds = new Set([...(data?.ticketStaffRoleIds || []), ...(data?.applyStaffRoleIds || [])]);
  const exactNames = new Set(['aac', 'ticket yetkili', 'denetleyici', 'denetimci', 'd. admin', 'd.admin', 'd. mod', 'd.mod', 'admin', 'moderatör', 'moderator', 'yetkili', 'staff', 'yönetici', 'yonetici', 'kurucu', 'lider']);
  return guild.roles.cache.filter(role =>
    staffRoleIds.has(role.id) ||
    role.permissions.has(PermissionFlagsBits.Administrator) ||
    role.permissions.has(PermissionFlagsBits.ManageGuild) ||
    role.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    exactNames.has(role.name.toLowerCase().trim())
  );
}

function isStaffMember(member, data) {
  if (!member) return false;
  if (member.guild && member.id === member.guild.ownerId) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ModerateMembers)) return true;
  const staffRoleIds = new Set([...(data?.ticketStaffRoleIds || []), ...(data?.applyStaffRoleIds || [])]);
  const exactNames = new Set(['aac', 'ticket yetkili', 'denetleyici', 'denetimci', 'd. admin', 'd.admin', 'd. mod', 'd.mod', 'admin', 'moderatör', 'moderator', 'yetkili', 'staff', 'yönetici', 'yonetici', 'kurucu', 'lider']);
  return member.roles?.cache?.some(role => staffRoleIds.has(role.id) || exactNames.has(role.name.toLowerCase().trim())) || false;
}`,
  'staff permissions'
);

// OCR mesaj akışı: aynı mesajda 1 veya 2 SS destekle, iki kanal da doğrulanmadan rol verme.
replaceRequired(
  /    if \(isAboneChannel && message\.attachments\.size > 0\) \{[\s\S]*?\n    \}\n\n    \/\/ ----------------------------------------------------\n    \/\/ B\. TICKET KANAL MESAJLARINI TRANSKRİPTE EKLEME/,
  `    if (isAboneChannel && message.attachments.size > 0) {
      const images = [...message.attachments.values()].filter(a => a.contentType?.startsWith('image/'));
      if (images.length > 0) {
        await message.react('⏳').catch(() => {});
        const results = [];
        for (const attachment of images.slice(0, 2)) {
          results.push({ attachment, result: await analyzeYoutubeScreenshot(attachment.url, attachment.width, attachment.height) });
        }

        const valid = results.filter(x => x.result.isValid);
        const dataUserId = message.author.id;
        if (!data.userSubscribedChannels) data.userSubscribedChannels = {};
        if (!data.userSubscribedChannels[dataUserId]) data.userSubscribedChannels[dataUserId] = { birim: false, froz: false };
        const userSubs = data.userSubscribedChannels[dataUserId];

        for (const item of valid) {
          if (item.result.detectedBirim) userSubs.birim = true;
          if (item.result.detectedFroz) userSubs.froz = true;
        }
        if (valid.length) saveData(data);
        await message.reactions.removeAll().catch(() => {});

        if (userSubs.birim && userSubs.froz) {
          const guild = message.guild;
          let roleToAssign = data.aboneRoleId ? guild.roles.cache.get(data.aboneRoleId) : null;
          if (!roleToAssign) roleToAssign = guild.roles.cache.find(r => r.name.toLowerCase().trim() === 'vyron abone' || r.name.toLowerCase().includes('vyron') && r.name.toLowerCase().includes('abone'));

          let roleGiven = false;
          if (roleToAssign && message.member) {
            try { await message.member.roles.add(roleToAssign); roleGiven = true; }
            catch (e) { console.error('Abone rol verme hatası:', e); }
          }

          await message.react('✅').catch(() => {});
          const successEmbed = new EmbedBuilder()
            .setColor('#10B981')
            .setTitle('✅ 2/2 KANAL DOĞRULANDI')
            .setDescription(\`${'${message.author}'} iki YouTube kanalına aboneliğini doğruladı.\\n\\n✅ @birimfonksiyons\\n✅ @xFrozzeq\\n\\n${'${roleGiven ? `💎 ${roleToAssign.name} rolü verildi.` : `⚠️ Abone rolü bulunamadı veya botun rol yetkisi yetersiz.`}'}\`)
            .setFooter({ text: FOOTER_TEXT }).setTimestamp();
          await message.reply({ embeds: [successEmbed] });

          const chLog = await getOrCreateAboneLogChannel(guild);
          if (chLog) {
            const logEmbed = new EmbedBuilder().setColor('#10B981').setTitle('🔴 2/2 ABONE ONAYI')
              .setDescription(\`👤 ${'${message.author}'}\\n✅ @birimfonksiyons\\n✅ @xFrozzeq\`).setTimestamp();
            await chLog.send({ embeds: [logEmbed] }).catch(() => {});
          }
        } else if (valid.length > 0) {
          await message.react('🟡').catch(() => {});
          const missing = !userSubs.birim ? '@birimfonksiyons' : '@xFrozzeq';
          await message.reply({ embeds: [new EmbedBuilder().setColor('#F59E0B').setTitle('🟡 1/2 KANAL ONAYLANDI').setDescription(\`✅ Bir kanal doğrulandı.\\n❗ Eksik kanal: **${'${missing}'}**\\n\\nO kanalın da **tam ekran** SS'ini gönder.\`)] });
        } else {
          await message.react('❌').catch(() => {});
          const reason = results[0]?.result?.reason;
          const reasonText = reason === 'not_fullscreen' ? 'SS tam ekran veya yeterince net değil.' :
            reason === 'wrong_channel' ? 'Doğru YouTube kanalı okunamadı.' :
            reason === 'multiple_channels' ? 'İki kanalı tek montaj görselde değil, ayrı tam ekran SS olarak gönder.' :
            '"Abone Olundu / Subscribed" durumu okunamadı.';
          const failEmbed = new EmbedBuilder().setColor('#EF4444').setTitle('❌ KANIT DOĞRULANAMADI')
            .setDescription(\`${'${reasonText}'}\\n\\n1. @birimfonksiyons\\n2. @xFrozzeq\\n\\nİki kanala da abone olup tam ekran SS gönder.\`)
            .setFooter({ text: FOOTER_TEXT });
          const failRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(\`btn_abone_manual_req_${'${message.author.id}'}\`).setLabel('Yetkili İncelemesi').setStyle(ButtonStyle.Secondary)
          );
          await message.reply({ embeds: [failEmbed], components: [failRow] });
        }
      }
    }

    // ----------------------------------------------------
    // B. TICKET KANAL MESAJLARINI TRANSKRİPTE EKLEME`,
  'OCR message flow'
);

// /bot-ses komutunu chat-input scope içine geri al.
replaceRequired(
  /        return interaction\.editReply\(\{ embeds: \[moveEmbed\] \}\);\n      \}\n    \}\n\n      \/\/ 11\. \/bot-ses/,
  `        return interaction.editReply({ embeds: [moveEmbed] });
      }

      // 11. /bot-ses`,
  'bot-ses opening scope'
);
replaceRequired(
  /        return interaction\.reply\(\{ embeds: \[voiceEmbed\] \}\);\n      \}\n\n        \/\/ ----------------------------------------------------\n    \/\/ B\. KATEGORİLİ TICKET/,
  `        return interaction.reply({ embeds: [voiceEmbed] });
      }
    }

    // ----------------------------------------------------
    // B. KATEGORİLİ TICKET`,
  'bot-ses closing scope'
);

source = source.replace(
  '// ==========================================\n// 9. BOT BAŞLATMA',
  '// VYRON_PATCH_V3\n// ==========================================\n// 9. BOT BAŞLATMA'
);

fs.writeFileSync(indexPath, source, 'utf8');
console.log('Vyron güvenlik/OCR düzeltmeleri index.js üzerine uygulandı.');
