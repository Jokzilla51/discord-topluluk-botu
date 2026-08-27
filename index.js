const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const express = require('express');
const ms = require('ms');
const fs = require('fs');
const path = require('path');
let Tesseract = null;
try {
  Tesseract = require('tesseract.js');
} catch (e) {
  console.warn('⚠️ [BİLGİ] tesseract.js henüz yüklenmemiş. GitHub üzerinde package.json dosyasını güncelleyiniz.');
}
require('dotenv').config();

// Sabit Marka İmzası (Footer)
const FOOTER_TEXT = 'discord.gg/vyronmc • Made by profosyonel456';

// ==========================================
// 0. KALICI VERİ DEPOLAMA SİSTEMİ (JSON)
// (Render yeniden başlasa bile ayarlar silinmez)
// ==========================================
const DATA_FILE = path.join(__dirname, 'bot_data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return {
        staffRoleIds: parsed.staffRoleIds || [],
        ticketStaffRoleIds: parsed.ticketStaffRoleIds || [],
        aboneStaffRoleIds: parsed.aboneStaffRoleIds || [],
        applyCategoryId: parsed.applyCategoryId || null,
        ticketCategoryId: parsed.ticketCategoryId || null,
        clanRoleId: parsed.clanRoleId || null,
        aboneRoleId: parsed.aboneRoleId || null,
        aboneLogChannelId: parsed.aboneLogChannelId || null,
        staffStats: parsed.staffStats || {},
        staffLeaderboardChannelId: parsed.staffLeaderboardChannelId || null,
        staffLeaderboardMessageId: parsed.staffLeaderboardMessageId || null,
        lastDailyResetDate: parsed.lastDailyResetDate || '',
        tagText: parsed.tagText || 'VYRN',
        tagLogChannelId: parsed.tagLogChannelId || null,
        tagRoleId: parsed.tagRoleId || null,
        tagRequiredRoleIds: parsed.tagRequiredRoleIds || [],
        tagUsers: parsed.tagUsers || {},
        gearLogChannelId: parsed.gearLogChannelId || null
      };
    }
  } catch (e) {
    console.error('Data okuma hatası:', e);
  }
  return {
    staffRoleIds: [],
    ticketStaffRoleIds: [],
    aboneStaffRoleIds: [],
    applyCategoryId: null,
    ticketCategoryId: null,
    clanRoleId: null,
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
    gearLogChannelId: null
  };
}

let cloudSaveTimeout = null;
let cachedBackupChannelId = null;
let cachedBackupMessageId = null;

function triggerCloudSave() {
  if (cloudSaveTimeout) clearTimeout(cloudSaveTimeout);
  cloudSaveTimeout = setTimeout(async () => {
    try {
      for (const [_, guild] of client.guilds.cache) {
        await syncDataToDiscordCloud(guild);
      }
    } catch (e) {}
  }, 30000); // 30 saniye debounce (Discord API rate limitini tamamen engeller)
}

function saveData(data, triggerSync = true) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    if (triggerSync) {
      triggerCloudSave();
    }
  } catch (e) {
    console.error('Data kaydetme hatası:', e);
  }
}

// 1.1. DISCORD BULUT YEDEKLEME SİSTEMİ (Render Yeniden Başlatılsa Bile Verileri Otomatik Geri Yükler)
async function getOrCreateBackupChannel(guild) {
  try {
    if (cachedBackupChannelId) {
      const ch = guild.channels.cache.get(cachedBackupChannelId);
      if (ch) return ch;
    }

    let ch = guild.channels.cache.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('vyron-bot-data') || c.name.includes('bot-data-backup') || c.name.includes('bot-yedek')));
    if (!ch) {
      ch = await guild.channels.create({
        name: '🔒・vyron-bot-data',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
        ]
      });
    }
    if (ch) cachedBackupChannelId = ch.id;
    return ch;
  } catch (e) {
    return null;
  }
}

async function syncDataFromDiscordCloud(guild) {
  try {
    const ch = await getOrCreateBackupChannel(guild);
    if (!ch) return;

    const messages = await ch.messages.fetch({ limit: 10 }).catch(() => null);
    if (!messages || messages.size === 0) return;

    const backupMsg = messages.find(m => m.content.startsWith('```json\n/* VYRON_DATA_BACKUP */'));
    if (backupMsg) {
      cachedBackupMessageId = backupMsg.id;
      const jsonStr = backupMsg.content.replace('```json\n/* VYRON_DATA_BACKUP */\n', '').replace('\n```', '');
      const cloudData = JSON.parse(jsonStr);
      
      const localData = loadData();
      if (cloudData.staffStats && Object.keys(cloudData.staffStats).length > 0) {
        localData.staffStats = cloudData.staffStats;
      }
      if (cloudData.tagUsers && Object.keys(cloudData.tagUsers).length > 0) {
        localData.tagUsers = cloudData.tagUsers;
      }
      if (cloudData.lastDailyResetDate) {
        localData.lastDailyResetDate = cloudData.lastDailyResetDate;
      }
      if (cloudData.gearLogChannelId) {
        localData.gearLogChannelId = cloudData.gearLogChannelId;
      }
      if (cloudData.tagRoleId) {
        localData.tagRoleId = cloudData.tagRoleId;
      }
      
      saveData(localData, false);
      console.log('✅ Discord Bulutundan Tüm Yetkili Puanları ve Veriler Başarıyla Geri Yüklendi!');
    }
  } catch (err) {
    console.error('Bulut veri geri yükleme hatası:', err.message);
  }
}

async function syncDataToDiscordCloud(guild) {
  try {
    const ch = await getOrCreateBackupChannel(guild);
    if (!ch) return;

    const data = loadData();
    const jsonStr = '```json\n/* VYRON_DATA_BACKUP */\n' + JSON.stringify(data, null, 2) + '\n```';

    let existingMsg = null;
    if (cachedBackupMessageId) {
      existingMsg = await ch.messages.fetch(cachedBackupMessageId).catch(() => null);
    }
    if (!existingMsg) {
      const messages = await ch.messages.fetch({ limit: 10 }).catch(() => null);
      existingMsg = messages ? messages.find(m => m.content.startsWith('```json\n/* VYRON_DATA_BACKUP */')) : null;
    }

    if (existingMsg) {
      cachedBackupMessageId = existingMsg.id;
      await existingMsg.edit(jsonStr).catch(() => {});
    } else {
      const newMsg = await ch.send(jsonStr).catch(() => null);
      if (newMsg) cachedBackupMessageId = newMsg.id;
    }
  } catch (err) {
    console.error('Bulut veri kaydetme hatası:', err.message);
  }
}

// ==========================================
// 1. EXPRESS WEB SUNUCUSU (Render 7/24 İçin)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Vyron Discord Botu</title>
        <meta charset="utf-8">
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding-top: 60px; background-color: #0b0f19; color: #f8fafc;">
        <h1 style="color: #38bdf8; font-size: 32px;">⚔️ Vyron Klan & Topluluk Botu</h1>
        <div style="display: inline-block; padding: 12px 24px; background: #1e293b; border-radius: 12px; border: 1px solid #334155; margin-top: 15px;">
          <p style="font-size: 20px; color: #4ade80; margin: 0; font-weight: bold;">✅ Sistem Durumu: 7/24 Aktif & Çevrim İçi</p>
        </div>
        <p style="color: #94a3b8; margin-top: 25px; font-size: 16px;">
          🌐 Discord: <a href="https://discord.gg/vyronmc" style="color: #38bdf8; text-decoration: none; font-weight: bold;">discord.gg/vyronmc</a>
        </p>
        <p style="color: #64748b; font-size: 14px;">Made by <b style="color: #a855f7;">profosyonel456</b></p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🌐 Express web sunucusu ${PORT} portunda aktif edildi.`);
});

// ==========================================
// 2. DISCORD CLIENT & BELLEK HAVUZLARI
// (Kanala atılan SS'leri yakalamak için MessageContent, ses takibi için GuildVoiceStates, tag ve üye değişiklikleri için GuildMembers/Presences aktif)
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

const activeGiveaways = new Map();
const activeScrims = new Map();
const activePolls = new Map();
const activeEvents = new Map();
const userSubProgress = new Map();
const activeClaimedTickets = new Map();
const ticketActionLocks = new Set();
const tempVoiceChannels = new Set();
const tempVoiceOwners = new Map();
const userXpCooldowns = new Map();
const userMessageHistory = new Map();
const userAfkData = new Map();
const joinTimestamps = [];
const activeAnnouncementAcks = new Map();
let applicationCounter = 1;

// Level & XP Hesaplama Fonksiyonları
function getLevelFromXP(xp = 0) {
  return Math.floor(0.1 * Math.sqrt(xp)) || 0;
}

function getXPForNextLevel(level = 0) {
  return Math.round(Math.pow((level + 1) / 0.1, 2));
}

function getXPForCurrentLevel(level = 0) {
  return Math.round(Math.pow(level / 0.1, 2));
}

// Görsel İlerleme Çubuğu Üretici (Progress Bar)
function generateProgressBar(current, total, barLength = 12) {
  if (total <= 0) return '`[░░░░░░░░░░░░]` **%0**';
  const percentage = Math.min(Math.max(current / total, 0), 1);
  const filled = Math.round(percentage * barLength);
  const empty = Math.max(barLength - filled, 0);
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `\`[${bar}]\` **%${Math.round(percentage * 100)}**`;
}

// 🧹 Bellek Temizleyici & Hafıza Koruyucu (Her 30 dakikada bir eski kuyrukları temizler)
setInterval(() => {
  try {
    const now = Date.now();
    // 1. 2 saatten eski abone doğrulama aşamalarını temizle
    for (const [uId, prog] of userSubProgress.entries()) {
      if (prog.updatedAt && (now - prog.updatedAt > 2 * 60 * 60 * 1000)) {
        userSubProgress.delete(uId);
      }
    }
    // 2. Silinmiş ticket kanallarının kayıtlarını temizle
    for (const [chId] of activeClaimedTickets.entries()) {
      if (!client.channels.cache.has(chId)) {
        activeClaimedTickets.delete(chId);
      }
    }
  } catch (e) {}
}, 30 * 60 * 1000);

// ==========================================
// YARDIMCI FONKSİYONLAR: YAPAY ZEKA / OCR GÖRSEL ANALİZİ
// ==========================================

// Görselin Gerçek Boyutlarını (Genişlik & Yükseklik) Doğrulayan Fonksiyon
async function getImageDimensions(attachment) {
  let w = attachment.width || 0;
  let h = attachment.height || 0;

  if (w > 0 && h > 0) return { width: w, height: h };

  try {
    const res = await fetch(attachment.url);
    const buffer = Buffer.from(await res.arrayBuffer());

    // 1. PNG Boyut Okuma (Bytes 16..24)
    if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      w = buffer.readUInt32BE(16);
      h = buffer.readUInt32BE(20);
      return { width: w, height: h };
    }

    // 2. JPEG / JPG Boyut Okuma
    if (buffer.length >= 8 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xFF && (buffer[offset + 1] === 0xC0 || buffer[offset + 1] === 0xC2)) {
          h = buffer.readUInt16BE(offset + 5);
          w = buffer.readUInt16BE(offset + 7);
          return { width: w, height: h };
        }
        offset++;
      }
    }
  } catch (e) {
    console.error('Görsel boyut okuma hatası:', e);
  }

  return { width: w, height: h };
}

// Tam Ekran Çözünürlük & Oran Kontrolü (1080p ve Orijinal Ekran Şartı)
function isImageFullScreen(width, height) {
  if (!width || !height) return false;

  // 1. Bilgisayar / Monitör Ekranı (Genişlik >= Yükseklik)
  if (width >= height) {
    // Bilgisayarda en az 1080px genişlik VE en az 650px yükseklik şartı!
    if (width < 1080 || height < 650) {
      return false; // Kırpılmış!
    }
    const ratio = width / height;
    // Standart monitör oranları (16:9 = 1.77, 16:10 = 1.6, 21:9 = 2.33, 4:3 = 1.33)
    if (ratio < 1.25 || ratio > 2.45) {
      return false; // Kırpılmış şerit!
    }
    return true;
  }

  // 2. Telefon / Mobil Ekranı (Yükseklik > Genişlik)
  if (height > width) {
    // Telefonda en az 1080px yükseklik VE en az 550px genişlik şartı!
    if (height < 1080 || width < 550) {
      return false; // Kırpılmış!
    }
    const ratio = height / width;
    // Standart telefon ekran oranları (16:9, 18:9, 19.5:9, 20:9, 21:9)
    if (ratio < 1.45 || ratio > 2.45) {
      return false; // Kırpılmış!
    }
    return true;
  }

  return false;
}

// YouTube Ekran Görüntüsünü (PNG/JPG) Otomatik Okuyan ve Kanalları Ayrı Ayrı Doğrulayan Motor
async function analyzeYoutubeScreenshot(imageUrl) {
  try {
    if (!Tesseract) {
      try {
        Tesseract = require('tesseract.js');
      } catch (err) {
        console.error('Tesseract modülü bulunamadı. Lütfen GitHub package.json güncelleyiniz.');
        return { isBirim: false, isFroz: false, hasSubscribed: false, error: 'Tesseract modülü eksik' };
      }
    }

    const result = await Tesseract.recognize(imageUrl, 'eng', {
      logger: () => {}
    });

    const rawText = (result?.data?.text || '').toLowerCase();
    
    // Karakterleri normalize et
    const cleanText = rawText
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');

    // 1. Abonelik Doğrulama İfadeleri (Türkçe & İngilizce)
    const hasSubscribed = cleanText.includes('subscribed') ||
                          cleanText.includes('olundu') ||
                          cleanText.includes('abonesiniz') ||
                          cleanText.includes('abonelikten') ||
                          (cleanText.includes('abone') && (cleanText.includes('zil') || cleanText.includes('bildirim') || cleanText.includes('tum') || cleanText.includes('all') || cleanText.includes('bell')));

    // 2. Kanal 1: birim (@birimfonksiyons / smp canavarı)
    const isBirim = (cleanText.includes('birim') || cleanText.includes('birimfonksiyons') || cleanText.includes('fonksiyon') || cleanText.includes('smp canavari') || cleanText.includes('smp canavarı')) && hasSubscribed;

    // 3. Kanal 2: Froz (@xFrozzeq / frozzeq)
    const isFroz = (cleanText.includes('froz') || cleanText.includes('xfrozzeq') || cleanText.includes('frozzeq')) && hasSubscribed;

    return {
      isBirim,
      isFroz,
      hasSubscribed,
      rawSnippet: rawText.substring(0, 120).replace(/\n/g, ' ')
    };
  } catch (error) {
    console.error('Yapay Zeka OCR analiz hatası:', error);
    return {
      isBirim: false,
      isFroz: false,
      hasSubscribed: false,
      error: error.message
    };
  }
}

// 1. Başvuru Odalarının Açılacağı Kategori
async function getOrCreateApplyCategory(guild) {
  try {
    const data = loadData();
    if (data.applyCategoryId) {
      const savedCat = guild.channels.cache.get(data.applyCategoryId);
      if (savedCat) return savedCat;
    }

    const channels = guild.channels.cache;
    let cat = channels.find(c =>
      c && c.type === ChannelType.GuildCategory &&
      (c.name.toLowerCase().includes('destek') || c.name.toLowerCase().includes('başvuru') || c.name.toLowerCase().includes('ticket') || c.name.toLowerCase().includes('talep'))
    );

    if (!cat) {
      cat = await guild.channels.create({
        name: '・ Destek',
        type: ChannelType.GuildCategory
      });
      data.applyCategoryId = cat.id;
      saveData(data);
    }
    return cat;
  } catch (err) {
    console.error('Başvuru kategori bulma hatası:', err);
    return null;
  }
}

// 2. Ticket / Destek Odalarının Açılacağı Kategori
async function getOrCreateTicketCategory(guild) {
  try {
    const data = loadData();
    if (data.ticketCategoryId) {
      const savedCat = guild.channels.cache.get(data.ticketCategoryId);
      if (savedCat) return savedCat;
    }

    const channels = guild.channels.cache;
    let cat = channels.find(c =>
      c && c.type === ChannelType.GuildCategory &&
      (c.name.toLowerCase().includes('destek') || c.name.toLowerCase().includes('ticket') || c.name.toLowerCase().includes('talep') || c.name.toLowerCase().includes('başvuru'))
    );

    if (!cat) {
      cat = await guild.channels.create({
        name: '・ Destek',
        type: ChannelType.GuildCategory
      });
      data.ticketCategoryId = cat.id;
      saveData(data);
    }
    return cat;
  } catch (err) {
    console.error('Ticket kategori bulma hatası:', err);
    return null;
  }
}

// 3. Abone Kanıt Kanalı (#🌌・abone-kanit - Herkesin SS attığı yer)
async function getOrCreateAboneLogChannel(guild) {
  try {
    const data = loadData();
    if (data.aboneLogChannelId) {
      const savedCh = guild.channels.cache.get(data.aboneLogChannelId);
      if (savedCh) return savedCh;
    }

    const channels = guild.channels.cache;
    let ch = channels.find(c =>
      c && c.type === ChannelType.GuildText &&
      (c.name.includes('abone-kanit') || c.name.includes('abone-kanıt') || c.name.includes('abone-ss') || c.name.includes('abone'))
    );

    if (!ch) {
      ch = await guild.channels.create({
        name: '🌌・abone-kanit',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AddReactions] }
        ]
      });
      data.aboneLogChannelId = ch.id;
      saveData(data);
    }
    return ch;
  } catch (err) {
    console.error('Abone kanıt kanalı hatası:', err);
    return null;
  }
}

// 4. Turnuva Katılımcı Listesi Kanalı
async function getOrCreateTourneyChannel(guild) {
  try {
    const channels = guild.channels.cache;
    let ch = channels.find(c =>
      c && c.type === ChannelType.GuildText &&
      (c.name.includes('turnuva-gelecek') || c.name.includes('turnuva-katilim') || c.name.includes('turnuva-kayit') || c.name.includes('gelecek-olanlar'))
    );

    if (!ch) {
      ch = await guild.channels.create({
        name: '🏆・turnuva-gelecek-olanlar',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages]
          },
          {
            id: client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels]
          }
        ]
      });

      const welcomeListEmbed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setTitle('🏆 VYRON KLAN TURNUVASI - KATILIMCI LİSTESİ')
        .setDescription(
          `Bu kanalda turnuvaya katılacak tüm üyelerin Discord ve **Minecraft IGN** bilgileri anlık olarak listelenir.\n\n` +
          `Turnuva duyurusundaki **"⚔️ Turnuvaya Katıl (IGN Yaz)"** butonuna basarak adınızı buraya ekleyebilirsiniz!`
        )
        .setFooter({ text: FOOTER_TEXT });

      await ch.send({ embeds: [welcomeListEmbed] }).catch(() => {});
    }
    return ch;
  } catch (err) {
    console.error('Turnuva kanalı oluşturma hatası:', err);
    return null;
  }
}

// 5. Yetkililerin Görebileceği #temiz-log Kanalı
async function getOrCreateCleanLogChannel(guild) {
  try {
    const data = loadData();
    const channels = guild.channels.cache;
    let ch = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('temiz-log') || c.name.includes('onay-log')));
    if (!ch) {
      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] }
      ];
      const allStaffRoleIds = getAllStaffRoleIdsForGuild(guild, data);
      allStaffRoleIds.forEach(roleId => {
        const r = guild.roles.cache.get(roleId);
        if (r) {
          permissionOverwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
          });
        }
      });
      ch = await guild.channels.create({
        name: '✅・temiz-log',
        type: ChannelType.GuildText,
        permissionOverwrites
      });
    }
    return ch;
  } catch (err) {
    console.error('Temiz log kanalı oluşturma hatası:', err);
    return null;
  }
}

// 6. Yetkililerin Görebileceği #hile-log Kanalı
async function getOrCreateCheatLogChannel(guild) {
  try {
    const data = loadData();
    const channels = guild.channels.cache;
    let ch = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('hile-log') || c.name.includes('kont-edilen') || c.name.includes('kont-log')));
    if (!ch) {
      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] }
      ];
      const allStaffRoleIds = getAllStaffRoleIdsForGuild(guild, data);
      allStaffRoleIds.forEach(roleId => {
        const r = guild.roles.cache.get(roleId);
        if (r) {
          permissionOverwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
          });
        }
      });
      ch = await guild.channels.create({
        name: '🚫・hile-log',
        type: ChannelType.GuildText,
        permissionOverwrites
      });
    }
    return ch;
  } catch (err) {
    console.error('Hile log kanalı oluşturma hatası:', err);
    return null;
  }
}



// 6.3. Sunucudaki Tüm Yetkili Rollerini (JSON + Otomatik İsim Eşleşmesi) Kalıcı Olarak Toplama
function getAllStaffRoleIdsForGuild(guild, data) {
  const staffRoleIds = new Set([
    ...(data?.staffRoleIds || []),
    ...(data?.ticketStaffRoleIds || []),
    ...(data?.aboneStaffRoleIds || [])
  ]);

  const staffKeywords = [
    'yetkili', 'mod', 'admin', 'denet', 'aac', 'yardımcı', 'yardimci',
    'sr.', 'staff', 'destek', 'üst yetkili', 'ust yetkili',
    'd.mod', 'd-mod', 'd.admin', 'd-admin', 'd.yardımcı', 'd-yardimci'
  ];

  if (guild && guild.roles && guild.roles.cache) {
    guild.roles.cache.forEach(role => {
      const name = role.name.toLowerCase();
      if (staffKeywords.some(kw => name.includes(kw))) {
        staffRoleIds.add(role.id);
      }
    });
  }

  return Array.from(staffRoleIds);
}

// 6.4. Ticket / Başvuru Açılışında D.Admin Altındaki Tüm Yetkilileri Etiketleme (Yönetici, Admin, D.Admin hariç)
function getPingableStaffRoles(guild, data) {
  const allStaffIds = getAllStaffRoleIdsForGuild(guild, data);
  const pingableList = [];

  for (const roleId of allStaffIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    const name = role.name.toLowerCase();
    // Yönetici, Admin, D.Admin, Kurucu, Owner etiketlenmez
    if (name.includes('yönetici') || name.includes('yonetici') || name.includes('admin') || name.includes('kurucu') || name.includes('owner') || name.includes('d.admin') || name.includes('d-admin')) {
      continue;
    }
    pingableList.push(roleId);
  }

  return pingableList;
}

// 7. Yetkili / Yönetici Kontrolü (Tüm Yetkili Rollerini ve Yetkileri Güvenle Tanır)
function isStaffMember(member, data) {
  if (!member) return false;

  // 1. İzin kontrolü (Permissions)
  if (member.permissions && typeof member.permissions.has === 'function') {
    if (member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        member.permissions.has(PermissionFlagsBits.ManageRoles) ||
        member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
        member.permissions.has(PermissionFlagsBits.KickMembers) ||
        member.permissions.has(PermissionFlagsBits.BanMembers) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return true;
    }
  }

  // 2. Rol ID'lerini topla (hem cache'den hem raw array'den güvenle alır)
  const guild = member.guild;
  const userRoleIds = Array.isArray(member.roles)
    ? member.roles
    : (member.roles?.cache ? Array.from(member.roles.cache.keys()) : []);

  if (userRoleIds.length === 0) return false;

  // 3. Sunucudaki tüm yetkili rolleriyle eşleştir
  const allStaffRoleIds = getAllStaffRoleIdsForGuild(guild, data);
  if (userRoleIds.some(id => allStaffRoleIds.includes(id))) return true;

  // 4. İsim bazlı anahtar kelime eşleşmesi
  const staffKeywords = [
    'yetkili', 'mod', 'admin', 'denet', 'aac', 'yardımcı', 'yardimci',
    'sr.', 'kurucu', 'ekip', 'staff', 'destek', 'üst yetkili', 'ust yetkili',
    'd.mod', 'd-mod', 'd.admin', 'd-admin', 'd.yardımcı', 'd-yardimci', 'yonetici', 'yönetici'
  ];

  if (guild && guild.roles && guild.roles.cache) {
    return userRoleIds.some(id => {
      const role = guild.roles.cache.get(id);
      if (!role) return false;
      const rName = role.name.toLowerCase();
      return staffKeywords.some(kw => rName.includes(kw));
    });
  }

  return false;
}

// 7.1. Tag Zorunlu Olan Kadroyu Kontrol Etme (Komutla eklenen roller veya Klan & Yetkili kadrosu)
function isClanOrStaffMember(member, data) {
  if (!member) return false;
  if (isStaffMember(member, data)) return true;

  const guild = member.guild;
  const userRoleIds = Array.isArray(member.roles)
    ? member.roles
    : (member.roles?.cache ? Array.from(member.roles.cache.keys()) : []);

  // 1. Yönetici komutuyla eklenen zorunlu tag rolleri
  const requiredRoleIds = data?.tagRequiredRoleIds || [];
  if (requiredRoleIds.length > 0) {
    return userRoleIds.some(id => requiredRoleIds.includes(id));
  }

  // 2. Klan rolleri
  if (guild && guild.roles && guild.roles.cache) {
    return userRoleIds.some(id => {
      const r = guild.roles.cache.get(id);
      if (!r) return false;
      const name = r.name.toLowerCase();
      return name.includes('klan üye') || name.includes('has klan') || name.includes('klan') || (data?.clanRoleId && r.id === data.clanRoleId);
    });
  }

  return false;
}

// Süre Biçimlendirme (Saat & Dakika)
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 Dk';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins} Dk`;
  return `${hours} Saat ${mins} Dk`;
}

// Yetkili Mesai Sisteminin Canlı Olup Olmadığını Kontrol Eden Fonksiyon (7/24 Daima Aktiftir)
function isStaffTrackingLive() {
  return true;
}

// ==========================================
// 11. TÜM SUNUCU ALTYAPISINI VE PANELLERİ OTOMATİK KURMA MOTORU
// ==========================================
async function autoSetupGuildInfrastructure(guild) {
  try {
    if (!guild) return { createdItems: [] };
    const data = loadData();
    const roles = guild.roles.cache;
    const channels = guild.channels.cache;
    const createdItems = [];

    // 1. EKSİK ROLLERİ TESPİT ET (VARSA ASLA TEKRAR OLUŞTURMA, DİREKT BAĞLA)
    let rMember = roles.find(r => r.name.toLowerCase().includes('vyron • üye') || r.name.toLowerCase() === 'üye' || r.name.toLowerCase() === 'vyron üye' || (r.name.toLowerCase().includes('üye') && !r.name.toLowerCase().includes('klan')));
    if (!rMember) {
      rMember = await guild.roles.create({
        name: 'Vyron • Üye',
        color: '#10B981',
        reason: 'Vyron Bot Otomatik Altyapı Kurulumu'
      }).catch(() => null);
      if (rMember) createdItems.push(`🏷️ **@Vyron • Üye** rolü oluşturuldu`);
    }

    let rAbone = roles.find(r => r.name.toLowerCase().includes('abone'));
    if (!rAbone) {
      rAbone = await guild.roles.create({
        name: 'Vyron • Abone',
        color: '#EF4444',
        reason: 'Vyron Bot Otomatik Altyapı Kurulumu'
      }).catch(() => null);
      if (rAbone) {
        data.aboneRoleId = rAbone.id;
        createdItems.push(`🏷️ **@Vyron • Abone** rolü oluşturuldu`);
      }
    } else {
      data.aboneRoleId = rAbone.id;
    }

    let rTag = roles.find(r => r.name.toLowerCase().includes('tag') || r.name.toLowerCase().includes('vyrn'));
    if (!rTag) {
      rTag = await guild.roles.create({
        name: 'Vyron • Tag',
        color: '#8B5CF6',
        reason: 'Vyron Bot Otomatik Altyapı Kurulumu'
      }).catch(() => null);
      if (rTag) {
        data.tagRoleId = rTag.id;
        createdItems.push(`🏷️ **@Vyron • Tag** rolü oluşturuldu`);
      }
    } else {
      data.tagRoleId = rTag.id;
    }

    let rClan = roles.find(r => r.name.toLowerCase().includes('klan üye') && !r.name.toLowerCase().includes('has')) || roles.find(r => r.name.toLowerCase() === 'klan üyesi');
    if (!rClan) {
      rClan = await guild.roles.create({
        name: 'Vyron • Klan Üyesi',
        color: '#F59E0B',
        reason: 'Vyron Bot Otomatik Altyapı Kurulumu'
      }).catch(() => null);
      if (rClan) {
        data.clanRoleId = rClan.id;
        if (!data.tagRequiredRoleIds) data.tagRequiredRoleIds = [];
        if (!data.tagRequiredRoleIds.includes(rClan.id)) data.tagRequiredRoleIds.push(rClan.id);
        createdItems.push(`🏷️ **@Vyron • Klan Üyesi** rolü oluşturuldu`);
      }
    } else {
      data.clanRoleId = rClan.id;
      if (!data.tagRequiredRoleIds) data.tagRequiredRoleIds = [];
      if (!data.tagRequiredRoleIds.includes(rClan.id)) data.tagRequiredRoleIds.push(rClan.id);
    }

    let rHasClan = roles.find(r => r.name.toLowerCase().includes('has klan'));
    if (!rHasClan) {
      rHasClan = await guild.roles.create({
        name: 'Vyron • Has Klan Üyesi',
        color: '#6366F1',
        reason: 'Vyron Bot Otomatik Altyapı Kurulumu'
      }).catch(() => null);
      if (rHasClan) {
        if (!data.tagRequiredRoleIds) data.tagRequiredRoleIds = [];
        if (!data.tagRequiredRoleIds.includes(rHasClan.id)) data.tagRequiredRoleIds.push(rHasClan.id);
        createdItems.push(`🏷️ **@Vyron • Has Klan Üyesi** rolü oluşturuldu`);
      }
    } else {
      if (!data.tagRequiredRoleIds) data.tagRequiredRoleIds = [];
      if (!data.tagRequiredRoleIds.includes(rHasClan.id)) data.tagRequiredRoleIds.push(rHasClan.id);
    }

    let rStaff = roles.find(r => r.name.toLowerCase().includes('yetkili') || r.name.toLowerCase().includes('staff') || r.name.toLowerCase().includes('mod') || r.name.toLowerCase().includes('admin'));
    if (!rStaff) {
      rStaff = await guild.roles.create({
        name: 'Vyron • Yetkili',
        color: '#3B82F6',
        reason: 'Vyron Bot Otomatik Altyapı Kurulumu'
      }).catch(() => null);
      if (rStaff) {
        if (!data.staffRoleIds) data.staffRoleIds = [];
        if (!data.staffRoleIds.includes(rStaff.id)) data.staffRoleIds.push(rStaff.id);
        createdItems.push(`🏷️ **@Vyron • Yetkili** rolü oluşturuldu`);
      }
    } else {
      if (!data.staffRoleIds) data.staffRoleIds = [];
      if (!data.staffRoleIds.includes(rStaff.id)) data.staffRoleIds.push(rStaff.id);
    }

    // 2. KATEGORİLERİ KONTROL ET & BAĞLA (VARSA OLUŞTURMA)
    const applyCat = await getOrCreateApplyCategory(guild);
    const ticketCat = await getOrCreateTicketCategory(guild);
    if (applyCat) data.applyCategoryId = applyCat.id;
    if (ticketCat) data.ticketCategoryId = ticketCat.id;

    // 3. KANALLARI VE PANELLERİ KONTROL ET & BAĞLA (VARSA ASLA TEKRAR OLUŞTURMA)

    // 3.1. KLAN BAŞVURU KANALI & PANELİ (#⚔️・klan-başvuru)
    let chApply = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('klan-başvuru') || c.name.includes('klan-basvuru') || c.name.includes('basvuru')));
    if (!chApply) {
      chApply = await guild.channels.create({
        name: '⚔️・klan-başvuru',
        type: ChannelType.GuildText,
        parent: applyCat ? applyCat.id : null,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] }
        ]
      }).catch(() => null);
      if (chApply) createdItems.push(`📁 **#⚔️・klan-başvuru** kanalı oluşturuldu`);
    }

    if (chApply) {
      const applyMsgs = await chApply.messages.fetch({ limit: 10 }).catch(() => null);
      const hasApplyPanel = applyMsgs && applyMsgs.some(m => m.author.id === client.user.id && (m.components.length > 0 || m.embeds[0]?.title?.includes('Klan Başvuru')));
      if (!hasApplyPanel) {
        const applyEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setAuthor({ name: `${guild.name} • Klan Alım & Kadro Kayıt`, iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('⚔️ VYRON KLAN BAŞVURU & ANYDESK KONTROL PANELİ')
          .setDescription(
            `Vyron klanımızın resmi kadrosuna katılmak ve maçlarda/turnuvalarda yer almak için başvuru yapabilirsiniz!\n\n` +
            `📌 **Başvuru Aşamaları:**\n` +
            `1️⃣ Aşağıdaki **"⚔️ Klan Başvurusu Yap"** butonuna basınız.\n` +
            `2️⃣ Formu (Minecraft Adı, Yaş, Oyun Tarzı) doldurunuz.\n` +
            `3️⃣ Adınıza özel açılan gizli başvuru ticket odasında yetkililerimiz Anydesk kontrolünüzü sağlayacaktır.\n\n` +
            `👇 *Kadroya katılmak için hemen butona basınız:*`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Anydesk Güvenlikli Başvuru Motoru` });

        const applyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_open_apply_default')
            .setLabel('⚔️ Klan Başvurusu Yap')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
        );

        await chApply.send({ embeds: [applyEmbed], components: [applyRow] }).catch(() => {});
        createdItems.push(`✅ **Klan Başvuru Paneli** kuruldu: ${chApply}`);
      }
    }

    // 3.2. DESTEK & TICKET KANALI & PANELİ (#🎫・destek-talebi)
    let chTicket = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('destek-talebi') || c.name.includes('destek') || c.name.includes('ticket')));
    if (!chTicket) {
      chTicket = await guild.channels.create({
        name: '🎫・destek-talebi',
        type: ChannelType.GuildText,
        parent: ticketCat ? ticketCat.id : null,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] }
        ]
      }).catch(() => null);
      if (chTicket) createdItems.push(`📁 **#🎫・destek-talebi** kanalı oluşturuldu`);
    }

    if (chTicket) {
      const ticketMsgs = await chTicket.messages.fetch({ limit: 10 }).catch(() => null);
      const hasTicketPanel = ticketMsgs && ticketMsgs.some(m => m.author.id === client.user.id && (m.components.length > 0 || m.embeds[0]?.title?.includes('Destek')));
      if (!hasTicketPanel) {
        const ticketMenuEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setAuthor({ name: `${guild.name} • 7/24 Destek Merkezi`, iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('📩 RESMİ DESTEK & TICKET İLETİŞİM PANELİ')
          .setDescription(
            `Aşağıdaki açılır menüden açmak istediğiniz **talep kategorisini** seçiniz.\n` +
            `Seçim yaptığınızda sizin adınıza özel şifreli bir destek odası oluşturulacaktır.\n\n` +
            `🤝 **Partnerlik:** Sunucu & klan partnerlik görüşmeleri.\n` +
            `🎁 **Çekiliş:** Çekiliş ödülü teslimi ve sponsorluk.\n` +
            `📢 **Reklam:** Reklam satın alma & iş birliği.\n` +
            `🚀 **İnvite & Boost:** Davet ve Boost ödül teslim talebi.\n` +
            `📩 **Genel Destek:** Sorular, öneriler ve şikayetler.\n` +
            `❓ **Diğer:** Diğer tüm özel konular.`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Kategorili Talep Motoru` });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_select_main_none')
          .setPlaceholder('📂 Bir destek kategorisi seçiniz...')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Partnerlik').setDescription('Partnerlik görüşmeleri için tıklayınız.').setValue('partnerlik').setEmoji('🤝'),
            new StringSelectMenuOptionBuilder().setLabel('Çekiliş').setDescription('Çekiliş ödül teslimi için tıklayınız.').setValue('cekilis').setEmoji('🎁'),
            new StringSelectMenuOptionBuilder().setLabel('Reklam').setDescription('Reklam satın almak istiyorsanız tıklayınız.').setValue('reklam').setEmoji('📢'),
            new StringSelectMenuOptionBuilder().setLabel('İnvite & Boost').setDescription('Davet veya Boost ödülünüzü almak için tıklayınız.').setValue('invite').setEmoji('🚀'),
            new StringSelectMenuOptionBuilder().setLabel('Genel Destek').setDescription('Genel soru, öneri ve destek için tıklayınız.').setValue('destek').setEmoji('📩'),
            new StringSelectMenuOptionBuilder().setLabel('Diğer').setDescription('Diğer tüm özel konularınız için tıklayınız.').setValue('diger').setEmoji('❓')
          );

        const ticketRow = new ActionRowBuilder().addComponents(selectMenu);
        await chTicket.send({ embeds: [ticketMenuEmbed], components: [ticketRow] }).catch(() => {});
        createdItems.push(`✅ **Destek & Ticket Paneli** kuruldu: ${chTicket}`);
      }
    }

    // 3.3. ABONE KANIT KANALI & BİLGİ AFİŞİ (#🌌・abone-kanit)
    const chAboneLog = await getOrCreateAboneLogChannel(guild);
    if (chAboneLog) {
      data.aboneLogChannelId = chAboneLog.id;
      const aboneMsgs = await chAboneLog.messages.fetch({ limit: 10 }).catch(() => null);
      const hasAboneInfo = aboneMsgs && aboneMsgs.some(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('Abone'));
      if (!hasAboneInfo) {
        const aboneEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setAuthor({ name: 'Vyron Yapay Zeka Abone Sistemi', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🔴 YAPAY ZEKA DESTEKLİ OTOMATİK ABONE ROLÜ')
          .setDescription(
            `Klanımıza özel tüm FPS Boost Texture Packlerine, özel etkinliklere ve avantajlara erişmek için **Abone Rolü** alabilirsiniz!\n\n` +
            `📺 **Abone Olunacak Kanallar:**\n` +
            `• **[birimfonksiyons](https://www.youtube.com/@birimfonksiyons)**\n` +
            `• **[xFrozzeq](https://www.youtube.com/@xFrozzeq)**\n\n` +
            `📸 **Nasıl Alınır?**\n` +
            `Yukarıdaki kanallara abone olduğunuzun ekran görüntüsünü (SS) bu kanala yükleyiniz. Yapay zeka motorumuz görseli 1 saniyede inceleyip rolünüzü otomatik olarak teslim edecektir! 🤖⚡`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Yapay Zeka OCR Motoru` });

        await chAboneLog.send({ embeds: [aboneEmbed] }).catch(() => {});
      }
    }

    // 3.4. GEAR KANALI (#🎒・gear-verilenler-ekip)
    let chGear = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('gear-verilenler') || c.name.includes('gear-log') || c.name.includes('gear')));
    if (!chGear) {
      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AddReactions] }
      ];
      const allStaffRoleIds = getAllStaffRoleIdsForGuild(guild, data);
      allStaffRoleIds.forEach(roleId => {
        const r = guild.roles.cache.get(roleId);
        if (r) {
          permissionOverwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
          });
        }
      });

      chGear = await guild.channels.create({
        name: '🎒・gear-verilenler-ekip',
        type: ChannelType.GuildText,
        permissionOverwrites
      }).catch(() => null);
      if (chGear) {
        data.gearLogChannelId = chGear.id;
        createdItems.push(`🔒 **#🎒・gear-verilenler-ekip** kanalı oluşturuldu`);
      }
    } else {
      data.gearLogChannelId = chGear.id;
    }

    // 3.5. TAG LOG KANALI (#🏷️・tag-log)
    // Tag sistemi kaldırıldı - tag log kanalı artık oluşturulmuyor

    // 3.6. CANLI YETKİLİ SIRALAMASI KANALI (#👑・yetkili-siralama)
    let chLeaderboard = await getOrCreateStaffLeaderboardChannel(guild);
    if (!chLeaderboard) {
      chLeaderboard = await guild.channels.create({
        name: '👑・yetkili-siralama',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] }
        ]
      }).catch(() => null);
      if (chLeaderboard) {
        data.staffLeaderboardChannelId = chLeaderboard.id;
        createdItems.push(`👑 **#👑・yetkili-siralama** kanalı oluşturuldu`);
      }
    }

    // 3.7. TURNUVA, TEMİZ-LOG, HİLE-LOG, YETKİLİ-DUYURU
    await getOrCreateTourneyChannel(guild);
    await getOrCreateCleanLogChannel(guild);
    await getOrCreateCheatLogChannel(guild);

    let chStaffAnnounce = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('yetkili-duyuru') || c.name.includes('yetkili-haber')));
    if (!chStaffAnnounce) {
      chStaffAnnounce = await guild.channels.create({
        name: '📢・yetkili-duyuru',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] }
        ]
      }).catch(() => null);
      if (chStaffAnnounce) createdItems.push(`📢 **#📢・yetkili-duyuru** kanalı oluşturuldu`);
    }

    saveData(data);
    await syncDataToDiscordCloud(guild);
    await updateStaffLeaderboard(guild);

    return { createdItems, data };
  } catch (err) {
    console.error('Otomatik altyapı kurulum hatası:', err);
    return { createdItems: [], error: err.message };
  }
}

// 8. #yetkili-sıralaması Kanalı (Yalnızca kaydedilen veya mevcut kanalı kullanır, kafasına göre yeni kanal oluşturmaz)
async function getOrCreateStaffLeaderboardChannel(guild) {
  try {
    const data = loadData();
    if (data.staffLeaderboardChannelId) {
      const savedCh = guild.channels.cache.get(data.staffLeaderboardChannelId);
      if (savedCh) return savedCh;
    }

    const channels = guild.channels.cache;
    const ch = channels.find(c =>
      c && c.type === ChannelType.GuildText &&
      (c.name.includes('yetkili-siralama') || c.name.includes('yetkili-mesai') || c.name.includes('yetkili-tablo') || c.name.includes('mesai-takip'))
    );

    if (ch) {
      data.staffLeaderboardChannelId = ch.id;
      saveData(data);
      return ch;
    }

    return null;
  } catch (err) {
    console.error('Yetkili sıralama kanalı bulma hatası:', err);
    return null;
  }
}

// 9. Canlı Sıralama Buton Çubuğu (Bugün / Bu Hafta / Toplam)
function buildStaffLeaderboardRow(currentPeriod = 'today') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_lb_today')
      .setLabel('📅 Bugün')
      .setEmoji('⚡')
      .setStyle(currentPeriod === 'today' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_lb_weekly')
      .setLabel('📊 Bu Hafta')
      .setEmoji('📈')
      .setStyle(currentPeriod === 'weekly' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_lb_total')
      .setLabel('🏆 Genel Toplam')
      .setEmoji('👑')
      .setStyle(currentPeriod === 'total' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
}

// 9.1. Canlı Sıralama Embed'ini Oluşturma Fonksiyonu (Dönemsel Filtreli)
async function buildStaffLeaderboardEmbed(guild, data, period = 'today') {
  const staffList = [];
  const members = guild.members.cache.size > 0
    ? guild.members.cache
    : await guild.members.fetch().catch(() => guild.members.cache);

  for (const [userId, member] of members) {
    if (member.user.bot) continue;
    const isStaff = isStaffMember(member, data);
    const hasStats = data.staffStats && data.staffStats[userId] !== undefined;

    if (!isStaff && !hasStats) continue;

    const userStats = (data.staffStats && data.staffStats[userId]) || {
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
      voiceJoinedAt: null
    };

    let voiceTime = 0;
    let isCurrentlyInVoice = false;

    if (member.voice && member.voice.channelId && member.voice.channelId !== guild.afkChannelId) {
      isCurrentlyInVoice = true;
    }

    let ticketClaims = 0;
    let applyClaims = 0;
    let anydeskChecks = 0;
    let solvedTickets = 0;
    let ticketMsgs = 0;
    let gearGiven = 0;

    if (period === 'weekly') {
      voiceTime = userStats.weeklyVoice || 0;
      if (isCurrentlyInVoice && userStats.voiceJoinedAt) voiceTime += (Date.now() - userStats.voiceJoinedAt);
      ticketClaims = userStats.weeklyTicketClaims || userStats.todayTicketClaims || 0;
      applyClaims = userStats.weeklyApplyClaims || userStats.todayApplyClaims || 0;
      anydeskChecks = userStats.weeklyAnydeskChecks || userStats.todayAnydeskChecks || 0;
      solvedTickets = userStats.weeklySolvedTickets || userStats.todaySolvedTickets || 0;
      ticketMsgs = userStats.weeklyTicketMsgs || userStats.todayTicketMsgs || 0;
      gearGiven = userStats.weeklyGearGiven || userStats.todayGearGiven || 0;
    } else if (period === 'total') {
      voiceTime = userStats.totalVoice || 0;
      if (isCurrentlyInVoice && userStats.voiceJoinedAt) voiceTime += (Date.now() - userStats.voiceJoinedAt);
      ticketClaims = userStats.totalTicketClaims || userStats.weeklyTicketClaims || userStats.todayTicketClaims || 0;
      applyClaims = userStats.totalApplyClaims || userStats.weeklyApplyClaims || userStats.todayApplyClaims || 0;
      anydeskChecks = userStats.totalAnydeskChecks || userStats.weeklyAnydeskChecks || userStats.todayAnydeskChecks || 0;
      solvedTickets = userStats.totalSolvedTickets || userStats.weeklySolvedTickets || userStats.todaySolvedTickets || 0;
      ticketMsgs = userStats.totalTicketMsgs || userStats.weeklyTicketMsgs || userStats.todayTicketMsgs || 0;
      gearGiven = userStats.totalGearGiven || userStats.weeklyGearGiven || userStats.todayGearGiven || 0;
    } else {
      // 'today'
      voiceTime = userStats.todayVoice || 0;
      if (isCurrentlyInVoice && userStats.voiceJoinedAt) voiceTime += (Date.now() - userStats.voiceJoinedAt);
      ticketClaims = userStats.todayTicketClaims || userStats.todayClaimed || 0;
      applyClaims = userStats.todayApplyClaims || 0;
      anydeskChecks = userStats.todayAnydeskChecks || 0;
      solvedTickets = userStats.todaySolvedTickets || userStats.todayTickets || 0;
      ticketMsgs = userStats.todayTicketMsgs || 0;
      gearGiven = userStats.todayGearGiven || 0;
    }

    const score = Math.floor(voiceTime / 60000) * 2 +
                  ticketClaims * 20 +
                  applyClaims * 20 +
                  anydeskChecks * 30 +
                  solvedTickets * 25 +
                  ticketMsgs * 2 +
                  gearGiven * 15;

    staffList.push({
      member,
      userId,
      voiceTime,
      ticketClaims,
      applyClaims,
      anydeskChecks,
      solvedTickets,
      ticketMsgs,
      gearGiven,
      score,
      isCurrentlyInVoice
    });
  }

  // Puana ve seste kalma süresine göre sırala
  staffList.sort((a, b) => b.score - a.score || b.voiceTime - a.voiceTime);

  const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let rankText = '';

  if (staffList.length === 0) {
    rankText = '>>> ℹ️ *Henüz bu dönemde aktif olan bir yetkili bulunmuyor.*';
  } else {
    staffList.slice(0, 15).forEach((item, idx) => {
      const icon = rankIcons[idx] || `\`#${idx + 1}\``;
      const voiceStatus = item.isCurrentlyInVoice ? '🟢 **Seste**' : '⚪ **Boşta**';
      rankText += `${icon} **${item.member.displayName}** (${item.member})\n` +
        `🎙️ \`${formatDuration(item.voiceTime)}\` (${voiceStatus}) • ` +
        `✋ Ticket: \`${item.ticketClaims}\` • ⚔️ Başvuru: \`${item.applyClaims}\` • 🖥️ Anydesk: \`${item.anydeskChecks}\`\n` +
        `✅ Çözülen: \`${item.solvedTickets}\` • 💬 Mesaj: \`${item.ticketMsgs}\` • 🎒 Gear: \`${item.gearGiven}\` • ⭐ **${item.score} Puan**\n\n`;
    });
  }

  const now = new Date();
  const turkeyHour = (now.getUTCHours() + 3) % 24;
  const isShiftActive = turkeyHour >= 9 && turkeyHour < 24;

  const titles = {
    today: '👑 GÜNLÜK YETKİLİ MESAİ & LİDERLİK TABLOSU',
    weekly: '📊 HAFTALIK YETKİLİ MESAİ & LİDERLİK TABLOSU',
    total: '🏆 GENEL TOPLAM YETKİLİ KARNE & PUAN TABLOSU'
  };

  const periodDescriptions = {
    today: `📌 **Mesai Saatleri:** \`09:00 - 00:00 (Gece 12)\`\n⏱️ **Vardiya Durumu:** ${isShiftActive ? '🟢 **Aktif Mesai (09:00 - 00:00)**' : '🌙 **Gece Dinlenme Aralığı (00:00 - 09:00)**'}`,
    weekly: `📌 **Dönem:** \`Bu Haftanın Liderleri\`\n🏆 **Haftanın 1.'sine Özel Rol & Perm UP Ödülü Verilir!**`,
    total: `📌 **Dönem:** \`Tüm Zamanlar Toplamı\`\n⭐ **Klan Tarihinin En Başarılı Yetkilileri**`
  };

  const leaderboardEmbed = new EmbedBuilder()
    .setColor('#8B5CF6')
    .setAuthor({ name: 'Vyron Klan Yönetimi • Canlı Yetkili Mesai & Sıralama', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
    .setTitle(titles[period] || titles.today)
    .setDescription(
      `${periodDescriptions[period] || periodDescriptions.today}\n\n` +
      `*Yetkililerin ses süreleri, üstlendikleri talepler, ticket mesajları, çözümleri ve gear teslimatları **komutsuz olarak 7/24 otomatik** hesaplanır.*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      rankText
    )
    .setFooter({ text: `${FOOTER_TEXT} • Butonlarla dönemi değiştirebilirsiniz` })
    .setTimestamp();

  return leaderboardEmbed;
}

// 9.2. Canlı Sıralama Tablosunu Güncelle (Komutsuz & Otomatik)
async function updateStaffLeaderboard(guild) {
  try {
    const data = loadData();
    if (!data.staffStats) data.staffStats = {};

    const ch = await getOrCreateStaffLeaderboardChannel(guild);
    if (!ch) return;

    const leaderboardEmbed = await buildStaffLeaderboardEmbed(guild, data, 'today');
    const row = buildStaffLeaderboardRow('today');

    let msg = null;
    if (data.staffLeaderboardMessageId) {
      msg = await ch.messages.fetch(data.staffLeaderboardMessageId).catch(() => null);
    }

    if (msg) {
      await msg.edit({ embeds: [leaderboardEmbed], components: [row] }).catch(() => {});
    } else {
      const newMsg = await ch.send({ embeds: [leaderboardEmbed], components: [row] }).catch(() => {});
      if (newMsg) {
        data.staffLeaderboardMessageId = newMsg.id;
        data.staffLeaderboardChannelId = ch.id;
        saveData(data);
      }
    }
  } catch (err) {
    console.error('Sıralama tablosu güncelleme hatası:', err);
  }
}

// 10.1. GÜNLÜK VE HAFTALIK MESAİ & ŞAMPİYONLUK BÜLTENİ ÜRETİCİSİ
async function buildDailyStaffRecapEmbed(guild, data) {
  const staffRanking = [];
  let totalTeamVoice = 0;
  let totalTeamTickets = 0;
  let totalTeamApply = 0;
  let totalTeamAnydesk = 0;
  let totalTeamGear = 0;
  let totalTeamScore = 0;

  for (const [userId, stats] of Object.entries(data.staffStats || {})) {
    const voiceTime = stats.todayVoice || 0;
    const ticketClaims = stats.todayTicketClaims || stats.todayClaimed || 0;
    const applyClaims = stats.todayApplyClaims || 0;
    const anydeskChecks = stats.todayAnydeskChecks || 0;
    const solvedTickets = stats.todaySolvedTickets || stats.todayTickets || 0;
    const ticketMsgs = stats.todayTicketMsgs || 0;
    const gearGiven = stats.todayGearGiven || 0;

    const score = Math.floor(voiceTime / 60000) * 2 +
                  ticketClaims * 20 +
                  applyClaims * 20 +
                  anydeskChecks * 30 +
                  solvedTickets * 25 +
                  ticketMsgs * 2 +
                  gearGiven * 15;

    totalTeamVoice += voiceTime;
    totalTeamTickets += solvedTickets;
    totalTeamApply += applyClaims;
    totalTeamAnydesk += anydeskChecks;
    totalTeamGear += gearGiven;
    totalTeamScore += score;

    if (score > 0 || voiceTime > 0) {
      staffRanking.push({
        userId,
        voiceTime,
        ticketClaims,
        applyClaims,
        anydeskChecks,
        solvedTickets,
        ticketMsgs,
        gearGiven,
        score
      });
    }
  }

  staffRanking.sort((a, b) => b.score - a.score || b.voiceTime - a.voiceTime);

  const totalRegisteredStaff = guild.members.cache.filter(m => isStaffMember(m, data) && !m.user.bot).size || staffRanking.length || 1;
  const activeStaffCount = staffRanking.length;
  const participationRate = Math.min(Math.round((activeStaffCount / totalRegisteredStaff) * 100), 100);
  const participationBar = generateProgressBar(activeStaffCount, totalRegisteredStaff);

  const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let top10Text = '';

  if (staffRanking.length === 0) {
    top10Text = '>>> ℹ️ *Bugün mesaide puan toplayan yetkili bulunamadı.*';
  } else {
    staffRanking.slice(0, 10).forEach((item, index) => {
      const icon = rankIcons[index] || `\`#${index + 1}\``;
      top10Text += `${icon} **${index + 1}. <@${item.userId}>** — ⭐ **${item.score} Puan**\n` +
        `🎙️ \`${formatDuration(item.voiceTime)}\` • ✋ Ticket: \`${item.ticketClaims}\` • ⚔️ Başvuru: \`${item.applyClaims}\`\n` +
        `🖥️ Anydesk: \`${item.anydeskChecks}\` • ✅ Çözülen: \`${item.solvedTickets}\` • 🎒 Gear: \`${item.gearGiven}\`\n\n`;
    });
  }

  const topStaff = staffRanking[0];
  const topStaffMember = topStaff ? guild.members.cache.get(topStaff.userId) : null;

  const nightEmbed = new EmbedBuilder()
    .setColor('#F59E0B')
    .setAuthor({
      name: `${guild.name} • 00:00 Gün Sonu Vardiya & Şampiyonluk Raporu`,
      iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL()
    })
    .setTitle('🌙 GÜNÜN MESAİSİ TAMAMLANDI • GÜNÜN EN İYİ YETKİLİLERİ')
    .setDescription(
      `Bugünün yetkili mesaisi saat **00:00 (Gece 12)** itibarıyla tamamlandı ve istatistikler arşive aktarıldı!\n\n` +
      (topStaff ?
        `╭──────────────────────────────────────────────────╮\n` +
        `│ 👑 **GÜNÜN 1.'Sİ (GÜNÜN ŞAMPİYONU / MVP YETKİLİ):**\n` +
        `│ 🏆 <@${topStaff.userId}>\n` +
        `│ ⭐ **Toplam Puan:** \`${topStaff.score} Puan\`\n` +
        `│ 🎙️ **Seste Kalma:** \`${formatDuration(topStaff.voiceTime)}\`\n` +
        `│ ✋ **Talepler:** \`${topStaff.ticketClaims + topStaff.applyClaims} Talep\` • 🖥️ **Anydesk:** \`${topStaff.anydeskChecks} PC\`\n` +
        `│ 🎒 **Gear Teslimatı:** \`${topStaff.gearGiven} Set Dağıtıldı\`\n` +
        `╰──────────────────────────────────────────────────╯\n\n` : '') +
      `📊 **Kadro Katılım Oranı:** ${participationBar} \`(%${participationRate} Aktiflik)\`\n` +
      `📈 **Ekip Toplam Skoru:** \`${totalTeamScore.toLocaleString('tr-TR')} Puan\`\n` +
      `🎙️ **Toplam Ekip Ses Süresi:** \`${formatDuration(totalTeamVoice)}\`\n` +
      `⚔️ **Çözülen Talepler:** \`${totalTeamTickets + totalTeamApply} Adet\` • 🖥️ **Anydesk:** \`${totalTeamAnydesk} PC\` • 🎒 **Gear:** \`${totalTeamGear} Set\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 👑 GÜNÜN LİDERLİK KÜRSÜSÜ:\n\n` +
      top10Text +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *Detaylı yetkili karnesi: \`/yetkili-rapor\` • Canlı liderlik tablosu: \`/yetkili-siralama\`*\n` +
      `💎 *Tüm yetkili ekibimize özverili emekleri için teşekkür ederiz! Yarın sabah 09:00'da yeni vardiya başlayacaktır.* ⚔️🔥`
    )
    .setFooter({ text: `${FOOTER_TEXT} • Otomatik Günlük Kapanış Bülteni` })
    .setTimestamp();

  if (topStaffMember && topStaffMember.user) {
    nightEmbed.setThumbnail(topStaffMember.user.displayAvatarURL({ dynamic: true, size: 256 }));
  }

  return nightEmbed;
}

// 10.2. Gece 00:00 Otomatik Kapanış & GÜNÜN İLK 10 YETKİLİSİ RAPORU + PAZAR GECESİ HAFTALIK RAPOR
async function checkNightlyShiftReset() {
  try {
    if (!isStaffTrackingLive()) return;

    const now = new Date();
    const turkeyHour = (now.getUTCHours() + 3) % 24;
    const todayStr = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;

    // Haftanın gününü hesapla (0=Pazar, 1=Pazartesi ... 6=Cumartesi)
    const turkeyNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const dayOfWeek = turkeyNow.getUTCDay();

    const data = loadData();
    if (!data.staffStats) data.staffStats = {};

    // Gece 00:00 olduğunda ve bugün henüz kapanış yapılmadıysa
    if (turkeyHour === 0 && data.lastDailyResetDate !== todayStr) {
      data.lastDailyResetDate = todayStr;

      const guilds = client.guilds.cache;
      for (const [_, guild] of guilds) {
        const nightEmbed = await buildDailyStaffRecapEmbed(guild, data);

        const chLeaderboard = await getOrCreateStaffLeaderboardChannel(guild);
        const chAnnouncement = guild.channels.cache.find(c => 
          c && c.type === ChannelType.GuildText &&
          (c.name.includes('yetkili-duyuru') || c.name.includes('yetkili-log') || c.name.includes('genel-sohbet') || c.name.includes('duyuru'))
        );

        if (chLeaderboard) {
          await chLeaderboard.send({ content: `📢 @everyone 🌙 **GÜNÜN MESAİSİ TAMAMLANDI & İLK 10 ŞAMPİYON YETKİLİ!**`, embeds: [nightEmbed] }).catch(() => {});
        }
        if (chAnnouncement && chAnnouncement.id !== chLeaderboard?.id) {
          await chAnnouncement.send({ content: `📢 @everyone 🌙 **GÜNÜN MESAİSİ TAMAMLANDI & İLK 10 ŞAMPİYON YETKİLİ!**`, embeds: [nightEmbed] }).catch(() => {});
        }

        // 🗓️ PAZAR GECESİ HAFTALIK RAPOR (Pazar = dayOfWeek 0, ama gece yarısı olunca artık Pazartesi)
        if (dayOfWeek === 1) { // Pazartesi gece yarısı = Pazar gününün bitişi
          const weeklyRanking = [];

          for (const [userId, stats] of Object.entries(data.staffStats || {})) {
            const weeklyScore = Math.floor((stats.weeklyVoice || 0) / 60000) * 2 +
                                (stats.weeklyTicketClaims || 0) * 20 +
                                (stats.weeklyApplyClaims || 0) * 20 +
                                (stats.weeklyAnydeskChecks || 0) * 30 +
                                (stats.weeklySolvedTickets || 0) * 25 +
                                (stats.weeklyTicketMsgs || 0) * 2 +
                                (stats.weeklyGearGiven || 0) * 15;

            if (weeklyScore > 0) {
              weeklyRanking.push({ userId, stats, weeklyScore });
            }
          }

          weeklyRanking.sort((a, b) => b.weeklyScore - a.weeklyScore);

          if (weeklyRanking.length > 0) {
            const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            let weeklyText = '';

            weeklyRanking.slice(0, 10).forEach((item, index) => {
              const icon = rankIcons[index] || `\`#${index + 1}\``;
              const s = item.stats;
              const permAdvice = item.weeklyScore >= 500 ? '🟢 Perm UP Adayı' : item.weeklyScore >= 200 ? '🟡 Normal' : '🔴 Perm DOWN Adayı';
              weeklyText += `${icon} **<@${item.userId}>** — ⭐ **${item.weeklyScore} Puan** (${permAdvice})\n` +
                `🎙️ \`${formatDuration(s.weeklyVoice)}\` • ✋ \`${s.weeklyTicketClaims || 0}\` • ⚔️ \`${s.weeklyApplyClaims || 0}\` • 🖥️ \`${s.weeklyAnydeskChecks || 0}\` • 🎒 \`${s.weeklyGearGiven || 0}\`\n\n`;
            });

            // İnaktif yetkililer (0 puan)
            const allStaffIds = Object.keys(data.staffStats);
            const inactiveList = allStaffIds.filter(uid => {
              const s = data.staffStats[uid];
              const ws = Math.floor((s.weeklyVoice || 0) / 60000) * 2 +
                         (s.weeklyTicketClaims || 0) * 20 +
                         (s.weeklyApplyClaims || 0) * 20 +
                         (s.weeklyAnydeskChecks || 0) * 30 +
                         (s.weeklySolvedTickets || 0) * 25 +
                         (s.weeklyTicketMsgs || 0) * 2 +
                         (s.weeklyGearGiven || 0) * 15;
              return ws === 0;
            });

            let inactiveText = inactiveList.length > 0 
              ? inactiveList.map(uid => `• <@${uid}> — **0 Puan** 🔴`).join('\n')
              : '*Bu hafta tüm yetkililer aktifti! 🎉*';

            const weeklyEmbed = new EmbedBuilder()
              .setColor('#F59E0B')
              .setAuthor({ name: 'Vyron Klan Yönetimi • Haftalık Performans Raporu', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
              .setTitle('📅 HAFTANIN PERFORMANS RAPORU & PERM TABLOSU')
              .setDescription(
                `Bu haftanın mesaisi tamamlandı! İşte haftalık performans özeti:\n\n` +
                `### 🏆 HAFTANIN İLK 10 YETKİLİSİ:\n\n` +
                weeklyText +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `### ⚠️ BU HAFTA İNAKTİF YETKİLİLER (0 Puan):\n\n` +
                inactiveText + `\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `### 📊 PERM REHBERİ:\n` +
                `🟢 **500+ Puan** → ⭐ Perm UP Adayı\n` +
                `🟡 **200-499 Puan** → Normal Performans\n` +
                `🔴 **0-199 Puan** → ⚠️ Perm DOWN Adayı\n\n` +
                `📌 *Detaylı karne: \`/yetkili-rapor yetkili:@isim\`*`
              )
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp();

            if (chLeaderboard) {
              await chLeaderboard.send({ content: `📢 @everyone 📅 **HAFTALIK YETKİLİ PERFORMANS RAPORU!**`, embeds: [weeklyEmbed] }).catch(() => {});
            }
            if (chAnnouncement && chAnnouncement.id !== chLeaderboard?.id) {
              await chAnnouncement.send({ content: `📢 @everyone 📅 **HAFTALIK YETKİLİ PERFORMANS RAPORU!**`, embeds: [weeklyEmbed] }).catch(() => {});
            }
          }

          // Haftalık sayaçları sıfırla
          for (const [userId, stats] of Object.entries(data.staffStats || {})) {
              stats.weeklyVoice = 0;
              stats.weeklyTicketMsgs = 0;
              stats.weeklyTicketClaims = 0;
              stats.weeklyApplyClaims = 0;
              stats.weeklyAnydeskChecks = 0;
              stats.weeklySolvedTickets = 0;
              stats.weeklyGearGiven = 0;
            }
          }

        // Günlük sayaçları sıfırla (total'e eklemeden - çünkü artık gerçek zamanlı birikiyor)
        for (const [userId, stats] of Object.entries(data.staffStats || {})) {
          stats.todayVoice = 0;
          stats.todayTicketMsgs = 0;
          stats.todayTicketClaims = 0;
          stats.todayApplyClaims = 0;
          stats.todayAnydeskChecks = 0;
          stats.todaySolvedTickets = 0;
          stats.todayGearGiven = 0;
          stats.todayClaimed = 0;
          stats.todayTickets = 0;
        }

        saveData(data);
        await updateStaffLeaderboard(guild);
      }
    }
  } catch (e) {
    console.error('Gece sıfırlama hatası:', e);
  }
}

// ==========================================
// 3. GELİŞMİŞ SLASH KOMUTLARI
// ==========================================
const commands = [
  // 1. /yardim
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Vyron klan botunun tüm komutlarını ve sistem kılavuzunu gösterir.'),

  // 2. /sunucu-analiz
  new SlashCommandBuilder()
    .setName('sunucu-analiz')
    .setDescription('Sunucuyu analiz eder, eksik kanalları/panelleri tespit edip tek tıkla otomatik kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // 3. /abone-kur (FOTOĞRAFTAKİ VYRON ABONE PANELİNİ KURAR)
  new SlashCommandBuilder()
    .setName('abone-kur')
    .setDescription('Fotoğraftaki YouTube abonelik bilgilendirme panelini kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Abone panelinin gönderileceği kanal (Örn: #abone-bilgi)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('abone_rolu')
        .setDescription('Onaylanınca verilecek rol (Örn: @Vyron • Abone)')
        .setRequired(false)
    ),

  // 4. /abone-kanal (SS'LERİN DİREKT ATILACAĞI KANALI SEÇME)
  new SlashCommandBuilder()
    .setName('abone-kanal')
    .setDescription('Üyelerin fotoğraf atıp botun otomatik okuyacağı kanalı ayarlar (Örn: #abone-kanit).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Abone SS atılacak kanal')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 5. /yetkili-siralama (CANLI LİDERLİK TABLOSU)
  new SlashCommandBuilder()
    .setName('yetkili-siralama')
    .setDescription('Yetkili canlı mesai ve aktivite sıralama tablosunu yeniler ve gösterir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // 6. /yetkili-siralama-kur (SIRALAMA PANELİNİ İSTENEN KANALA KUR)
  new SlashCommandBuilder()
    .setName('yetkili-siralama-kur')
    .setDescription('Yetkili canlı mesai ve aktivite panosunu seçilen kanala kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Panonun kurulacağı kanal (Örn: #yetkili-sıralaması)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 7. /yetkili-denetim (TÜM EKİBİN CANLI DENETİMİ & PERM UP/DOWN REHBERİ)
  new SlashCommandBuilder()
    .setName('yetkili-denetim')
    .setDescription('Yetkililerin ses, ticket, başvuru ve inaktiflik analizini anında döker (Perm UP/DOWN).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('filtre')
        .setDescription('Uygulanacak denetim filtresi')
        .setRequired(false)
        .addChoices(
          { name: '👑 Genel Sıralama & Puan Tablosu', value: 'hepsi' },
          { name: '⚠️ Hiçbir Şey Yapmayanlar (İnaktifler - 0 Puan)', value: 'inaktif' },
          { name: '🎙️ Sadece Sesteki Aktiflik (Bugün & Bu Hafta)', value: 'ses' },
          { name: '🎫 Destek & Ticket İlgisi (Üstlenen & Mesaj)', value: 'ticket' },
          { name: '⚔️ Klan Başvurusu & Anydesk Kontrol', value: 'basvuru' },
          { name: '📅 Bu Haftanın Toplam Özeti (Perm UP/DOWN)', value: 'haftalik' }
        )
    ),

  // 8. /yetkili-inaktif (HİÇBİR ŞEY YAPMAYANLARI DÖKER)
  new SlashCommandBuilder()
    .setName('yetkili-inaktif')
    .setDescription('Bugün veya bu hafta 0 çeken, hiçbir iş yapmayan yetkilileri anında döker (Perm DOWN).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('zaman')
        .setDescription('Hangi zaman aralığı denetlensin?')
        .setRequired(false)
        .addChoices(
          { name: '📅 Bugün Hiçbir Şey Yapmayanlar (0 Puan)', value: 'bugun' },
          { name: '🗓️ Bu Hafta Hiçbir Şey Yapmayanlar', value: 'hafta' }
        )
    ),

  // 9. /yetkili-rapor (DETAYLI BİREYSEL KARNE)
  new SlashCommandBuilder()
    .setName('yetkili-rapor')
    .setDescription('Seçilen yetkilinin günlük, haftalık ve toplam karnesini döker (Perm Değerlendirmesi).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName('yetkili')
        .setDescription('Karnesi görüntülenecek yetkili')
        .setRequired(true)
    ),

  // 5. /basvuru-yetkili
  new SlashCommandBuilder()
    .setName('basvuru-yetkili')
    .setDescription('Klan başvuru ticketlarına bakabilecek yetkili rollerini sınırsız olarak ekler veya çıkarır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('islem')
        .setDescription('Yapılacak işlem')
        .setRequired(true)
        .addChoices(
          { name: '➕ Yetkili Rolü Ekle', value: 'ekle' },
          { name: '➖ Yetkili Rolü Çıkar', value: 'cikar' },
          { name: '📋 Yetkili Rolleri Listele', value: 'liste' }
        )
    )
    .addRoleOption(option =>
      option.setName('rol')
        .setDescription('Eklenecek veya çıkarılacak yetkili rolü')
        .setRequired(false)
    ),

  // 6. /ticket-yetkili
  new SlashCommandBuilder()
    .setName('ticket-yetkili')
    .setDescription('Ticket ve Destek taleplerine bakabilecek yetkili rollerini sınırsız olarak ekler veya çıkarır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('islem')
        .setDescription('Yapılacak işlem')
        .setRequired(true)
        .addChoices(
          { name: '➕ Ticket Yetkilisi Ekle', value: 'ekle' },
          { name: '➖ Ticket Yetkilisi Çıkar', value: 'cikar' },
          { name: '📋 Ticket Yetkililerini Listele', value: 'liste' }
        )
    )
    .addRoleOption(option =>
      option.setName('rol')
        .setDescription('Eklenecek veya çıkarılacak yetkili rolü')
        .setRequired(false)
    ),

  // 7. /basvuru-kategori
  new SlashCommandBuilder()
    .setName('basvuru-kategori')
    .setDescription('Klan başvuru ticketlarının hangi kategori altında açılacağını ayarlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Başvuru odalarının toplanacağı kategori (Örn: ・ Destek)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 8. /ticket-kategori
  new SlashCommandBuilder()
    .setName('ticket-kategori')
    .setDescription('Destek ve Ticket odalarının hangi kategori altında açılacağını ayarlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Ticket odalarının toplanacağı kategori (Örn: ・ Destek)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 9. /turnuva-duyuru
  new SlashCommandBuilder()
    .setName('turnuva-duyuru')
    .setDescription('Turnuva duyurusu yayınlar, otomatik #🏆・turnuva-gelecek-olanlar kanalını kurar ve IGN toplar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('etkinlik_adi')
        .setDescription('Etkinlik Başlığı (Örn: BÜYÜK TRAP TURNUVASI TELAFİ EVENTİ)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('tarih_saat')
        .setDescription('Etkinlik Zamanı (Örn: Bugün Saat 20:30 (8:30 PM))')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('odul')
        .setDescription('Kazanılacak Ödüller (Örn: 1 Hafta Haftanın Trapcisi Rolü + 3x Gear)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sunucu_ip')
        .setDescription('Oynanacak Minecraft Sunucu IP (Örn: play.closycraft.com.tr)')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Duyurunun yapılacağı kanal (Örn: #turnuva-etkinlik)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addAttachmentOption(option =>
      option.setName('gorsel')
        .setDescription('Turnuvaya eklenecek afiş, görsel veya GIF dosyası (Bilgisayardan sürükleyin)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('aciklama')
        .setDescription('Turnuva açıklaması / Telafi notu / Giriş komutu (İsteğe bağlı)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('herkese_etiket')
        .setDescription('@everyone ve @here etiketlensin mi? (Varsayılan: Evet)')
        .setRequired(false)
    ),

  // 10. /basvuru-kur
  new SlashCommandBuilder()
    .setName('basvuru-kur')
    .setDescription('Adaya özel ticket açan ve yetkililerin yönettiği başvuru panelini kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Başvuru butonunun konulacağı kanal (Örn: #klan-başvuru)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('klan_rolu')
        .setDescription('Kabul edilince verilecek klan üye rolü (Örn: @Vyron • Klan Üye)')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Başvuru odalarının açılacağı kategori (İsteğe bağlı, otomatik ・ Destek seçilir)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 11. /ticket-kur
  new SlashCommandBuilder()
    .setName('ticket-kur')
    .setDescription('Kategorili seçim menüsüne sahip çok amaçlı ticket ve destek paneli kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Panelin gönderileceği metin kanalı (Örn: #destek-talebi)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Ticket kanallarının açılacağı kategori (İsteğe bağlı, otomatik ・ Destek seçilir)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 12. /hile-rapor
  new SlashCommandBuilder()
    .setName('hile-rapor')
    .setDescription('Hile tespit edilen adayın kanıt SS dosyasını sürükleyip yönetici #hile-log kanalına kaydeder.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(option =>
      option.setName('aday')
        .setDescription('Hile tespit edilen aday / kullanıcı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('hile_turu')
        .setDescription('Tespit edilen hile / ihlal (Örn: Vape, Reach, AutoClicker, Kontrolü Reddetti)')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option.setName('kanit_ss')
        .setDescription('Hile kanıtı ekran görüntüsü / SS (Bilgisayarınızdan sürükleyip bırakın)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('aciklama')
        .setDescription('Yetkili inceleme detayı / Açıklama')
        .setRequired(false)
    ),

  // 13. /duyuru
  new SlashCommandBuilder()
    .setName('duyuru')
    .setDescription('Sunucuya dikkat çekici, özel efektli ve merak uyandıran epik klan duyurusu gönderir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Duyurunun yayınlanacağı kanal (Örn: #duyurular veya #klan-duyuru)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption(option =>
      option.setName('baslik')
        .setDescription('Duyuru başlığı (Örn: BÜYÜK KLAN SAVAŞI, YENİ SEZON BAŞLADI)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('mesaj')
        .setDescription('Duyuru metni (Detaylı açıklama)')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option.setName('gorsel')
        .setDescription('Duyuruya eklenecek GIF veya Resim (Bilgisayarınızdan sürükleyip bırakın)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('tema')
        .setDescription('Duyurunun görsel atmosferi ve rengi')
        .setRequired(false)
        .addChoices(
          { name: '🔥 Alev & Kritik Savaş (Kırmızı / Turuncu)', value: 'war' },
          { name: '👑 Klan Yönetimi & Resmi Bildiri (Mor / Kraliyet)', value: 'royal' },
          { name: '⚡ Siber Güncelleme & Hype (Neon Mavi)', value: 'cyber' },
          { name: '🏆 Turnuva & Büyük Ödül (Altın Sarısı)', value: 'gold' },
          { name: '🛡️ Güvenlik & Önemli Uyarı (Zümrüt Yeşili)', value: 'shield' }
        )
    )
    .addBooleanOption(option =>
      option.setName('herkese_etiket')
        .setDescription('@everyone etiketi atılsın mı? (Varsayılan: Hayır)')
        .setRequired(false)
    ),

  // 14. /haftanin-oyuncusu
  new SlashCommandBuilder()
    .setName('haftanin-oyuncusu')
    .setDescription('Haftanın Trapcisi veya Haftanın Elytracısı unvanını oyuncuya verir ve duyurur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption(option =>
      option.setName('kategori')
        .setDescription('Hangi unvan verilecek?')
        .setRequired(true)
        .addChoices(
          { name: '🔥 Haftanın Trapcisi', value: 'trapci' },
          { name: '🦅 Haftanın Elytracısı', value: 'elytraci' }
        )
    )
    .addUserOption(option =>
      option.setName('oyuncu')
        .setDescription('Ödülü kazanacak klan üyesi')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Ödül sebebi veya başarı notu')
        .setRequired(false)
    ),

  // 15. /kilit
  new SlashCommandBuilder()
    .setName('kilit')
    .setDescription('Metin kanalını üye mesajlarına kilitler veya kilidi açar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(option =>
      option.setName('durum')
        .setDescription('Kanal durumu')
        .setRequired(true)
        .addChoices(
          { name: '🔒 Kilitle (Yazmayı Kapat)', value: 'lock' },
          { name: '🔓 Kilidi Aç (Yazmayı Aç)', value: 'unlock' }
        )
    )
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Kilitlenecek kanal (Varsayılan: bu kanal)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 17. /klan-rutbe
  new SlashCommandBuilder()
    .setName('klan-rutbe')
    .setDescription('Klan üyesini Has Klan Üyesi yapar veya klandan çıkarır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('İşlem yapılacak klan üyesi')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('islem')
        .setDescription('Yapılacak rütbe işlemi')
        .setRequired(true)
        .addChoices(
          { name: '⭐ Has Klan Üye Yap (Terfi)', value: 'has_klan' },
          { name: '⚔️ Standart Klan Üye Yap', value: 'standart_klan' },
          { name: '❌ Klandan Çıkar (Rolleri Al)', value: 'cikar' }
        )
    ),

  // 18. /cekilis
  new SlashCommandBuilder()
    .setName('cekilis')
    .setDescription('Sunucuda süreli, butonlu ve otomatik kazanan etiketleyen çekiliş başlatır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('sure')
        .setDescription('Çekiliş süresi (Örn: 10s, 30s, 5m, 1h, 1d)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('odul')
        .setDescription('Çekiliş ödülü (Örn: Discord Nitro, Elit Hesap)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('kazanan_sayisi')
        .setDescription('Kaç kişi kazanacak? (Varsayılan: 1)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20)
    )
    .addStringOption(option =>
      option.setName('sart')
        .setDescription('Çekilişe katılım şartı (Tag / Abone)')
        .setRequired(false)
        .addChoices(
          { name: '🌐 Herkes Katılabilir (Şartsız)', value: 'none' },
          { name: '🏷️ Yalnızca Taglılar (@Vyron • Tag)', value: 'tag' },
          { name: '🔴 Yalnızca Aboneler (@Vyron • Abone)', value: 'abone' },
          { name: '⭐ Hem Taglı Hem Abone Olanlar', value: 'both' }
        )
    )
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Çekilişin yapılacağı kanal (Varsayılan: mevcut kanal)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 19. /reroll
  new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Çekilişten yeni bir kazanan seçer.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('cekilis_id')
        .setDescription('Çekiliş ID veya mesaj ID')
        .setRequired(true)
    ),

  // 20. /anket
  new SlashCommandBuilder()
    .setName('anket')
    .setDescription('Canlı sayaçlı resmi oylama başlatır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('soru')
        .setDescription('Oylama konusu / sorusu')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Anketin gönderileceği kanal')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 21. /mute
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Belirtilen kullanıcıyı süreli olarak susturur (Timeout).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Susturulacak kullanıcı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sure')
        .setDescription('Susturma süresi (Örn: 5m, 1h, 1d, 7d)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Susturma sebebi')
        .setRequired(false)
    ),

  // 22. /unmute
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Kullanıcının susturmasını kaldırır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Susturulacak kullanıcı')
        .setRequired(true)
    ),

  // 23. /kick
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Belirtilen kullanıcıyı sunucudan atar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Atılacak kullanıcı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Atılma sebebi')
        .setRequired(false)
    ),

  // 24. /ban
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Belirtilen kullanıcıyı sunucudan yasaklar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Yasaklanacak kullanıcı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('Yasaklanma sebebi')
        .setRequired(false)
    ),

  // 25. /kullanici-bilgi
  new SlashCommandBuilder()
    .setName('kullanici-bilgi')
    .setDescription('Bir kullanıcının klan rolleri, katılım tarihi ve profil bilgilerini gösterir.')
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Bilgisi görüntülenecek kişi')
        .setRequired(false)
    ),

  // 26. /sunucu-bilgi
  new SlashCommandBuilder()
    .setName('sunucu-bilgi')
    .setDescription('Sunucunun ve klanın genel istatistiklerini görüntüler.'),

  // 27. /dogrulama-kur
  new SlashCommandBuilder()
    .setName('dogrulama-kur')
    .setDescription('Sunucuya giren üyeler için butonlu doğrulama paneli kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Doğrulama mesajının gönderileceği kanal')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('verilecek_rol')
        .setDescription('Doğrulama butonuna basana verilecek rol (Örn: Vyron • Üye)')
        .setRequired(true)
    ),

  // 28. /sil
  new SlashCommandBuilder()
    .setName('sil')
    .setDescription('Kanaldaki belirli miktarda mesajı toplu olarak siler.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option.setName('miktar')
        .setDescription('Silinecek mesaj sayısı (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  // 33. /gear-kanal
  new SlashCommandBuilder()
    .setName('gear-kanal')
    .setDescription('Yetkililerin klan üyelerine verdiği gear SS attığı kanalı (#gear-verilenler-ekip) ayarlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Gear teslimat SS atılacak kanal (Örn: #gear-verilenler-ekip)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 34. /yetkili-terfi
  new SlashCommandBuilder()
    .setName('yetkili-terfi')
    .setDescription('Yetkiliye terfi (Perm UP) veya ihtar (Perm DOWN) verir, rollerini günceller ve duyurur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName('yetkili')
        .setDescription('Terfi/İhtar verilecek yetkili')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('islem')
        .setDescription('Uygulanacak işlem')
        .setRequired(true)
        .addChoices(
          { name: '⭐ Perm UP (Terfi)', value: 'up' },
          { name: '🔻 Perm DOWN (Rütbe Düşürme / İhtar)', value: 'down' }
        )
    )
    .addRoleOption(option =>
      option.setName('yeni_rol')
        .setDescription('Verilecek yeni yetkili rolü')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('İşlem gerekçesi / açıklaması')
        .setRequired(false)
    ),

  // 35. /gunluk-rapor
  new SlashCommandBuilder()
    .setName('gunluk-rapor')
    .setDescription('Günün yetkili mesai kapanışını ve şampiyonluk bültenini anında oluşturup yayınlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(option =>
      option.setName('kanala_gonder')
        .setDescription('Rapor yetkili ve klan kanallarına resmi duyuru olarak gönderilsin mi?')
        .setRequired(false)
    ),

  // 36. /otomatik-kurulum
  new SlashCommandBuilder()
    .setName('otomatik-kurulum')
    .setDescription('Tüm klan altyapısını, eksik rolleri, kanalları ve panelleri tek tıkla otomatik kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // 37. /seviye
  new SlashCommandBuilder()
    .setName('seviye')
    .setDescription('Kullanıcının klan içi seviyesini, toplam XP ve ilerleme kartını gösterir.')
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Seviyesine bakılacak üye (Varsayılan: kendiniz)')
        .setRequired(false)
    ),

  // 38. /top-seviye
  new SlashCommandBuilder()
    .setName('top-seviye')
    .setDescription('Sunucunun en aktif ve en yüksek seviyeli üyelerini listeler.'),

  // 43. /afk
  new SlashCommandBuilder()
    .setName('afk')
    .setDescription('AFK moduna geçer; etiketlendiğinizde bot belirttiğiniz sebebi otomatik söyler.')
    .addStringOption(option =>
      option.setName('sebep')
        .setDescription('AFK kalma sebebiniz (Örn: Yemekteyim, Ders, Maçtayım)')
        .setRequired(false)
    ),

  // 44. /sicil
  new SlashCommandBuilder()
    .setName('sicil')
    .setDescription('Yetkililer için kullanıcının sunucudaki ceza, mute, uyarı ve disiplin geçmişini listeler.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Sicili görüntülenecek üye')
        .setRequired(true)
    ),

  // 46. /yavas-mod
  new SlashCommandBuilder()
    .setName('yavas-mod')
    .setDescription('Kanalın mesaj yazma yavaş modunu (Slowmode) ayarlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(option =>
      option.setName('saniye')
        .setDescription('Mesaj aralığı saniyesi (0: Kapatır, 5, 10, 30, 60, 120)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Yavaş mod uygulanacak kanal (Varsayılan: mevcut kanal)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 49. /guvenlik-modu
  new SlashCommandBuilder()
    .setName('guvenlik-modu')
    .setDescription('Akıllı Anti-Raid ve yeni açılmış şüpheli hesap kalkanını yönetir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('durum')
        .setDescription('Güvenlik kalkanı durumu')
        .setRequired(true)
        .addChoices(
          { name: '🟢 Aktif (Anti-Raid & Şüpheli Hesap Koruması Açık)', value: 'on' },
          { name: '🔴 Devre Dışı (Korumayı Kapat)', value: 'off' }
        )
    ),

  // 50. /sunucu-istatistik
  new SlashCommandBuilder()
    .setName('sunucu-istatistik')
    .setDescription('Sunucunun anlık üye, boost, kanal, klan rolleri ve bot gecikme dashboardunu açar.'),

  // 51. /bildirim-rol-kur
  new SlashCommandBuilder()
    .setName('bildirim-rol-kur')
    .setDescription('Üyelerin tek tıkla bildirim rollerini (Duyuru, Çekiliş, Turnuva) seçebileceği paneli kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Rol seçim panelinin gönderileceği kanal')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
];

// ==========================================
// 4. BOT HAZIR OLDUĞUNDA (READY)
// ==========================================
client.once('ready', async () => {
  console.log(`🤖 Vyron Bot başarıyla aktif: ${client.user.tag}`);
  client.user.setActivity('⚔️ discord.gg/vyronmc | Made by profosyonel456', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('⚡ Sunucu komutları ve altyapı yükleniyor...');
    for (const [guildId, guild] of client.guilds.cache) {
      await syncDataFromDiscordCloud(guild);
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands.map(cmd => cmd.toJSON()) }
      );
      console.log(`✅ Komutlar yüklendi: ${guild.name} (${guildId})`);
      await autoSetupGuildInfrastructure(guild).catch(e => console.error('Otomatik altyapı kurulumu hatası:', e));
    }

    // Global komutları temizle (Çakışmayı ve çift komut gecikmesini önler)
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [] }
    ).catch(() => {});

    // Yetkili Canlı Sıralama & Mesai Takipçisi (Her 3 dakikada bir canlı günceller & Gece 00:00'da raporlar)
    setTimeout(async () => {
      const guilds = client.guilds.cache;
      for (const [_, guild] of guilds) {
        await updateStaffLeaderboard(guild).catch(() => {});
      }
    }, 10000);

    setInterval(async () => {
      const guilds = client.guilds.cache;
      for (const [_, guild] of guilds) {
        await updateStaffLeaderboard(guild).catch(() => {});
        await syncDataToDiscordCloud(guild).catch(() => {});
      }
      await checkNightlyShiftReset().catch(() => {});
    }, 3 * 60 * 1000);
  } catch (error) {
    console.error('❌ Komut kaydı hatası:', error);
  }
});

client.on('guildCreate', async (guild) => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    await autoSetupGuildInfrastructure(guild).catch(() => {});
  } catch (err) {
    console.error('Sunucu komut yükleme hatası:', err);
  }
});

// ==========================================
// 4.1. YETKİLİ SES DURUMU VE MESAİ TAKİPÇİSİ (VOICE STATE UPDATE)
// (Yetkililerin seste durduğu süreyi komutsuz olarak 7/24 otomatik hesaplar)
// ==========================================
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    // 0. GEÇİCİ ÖZEL SES ODALARI (TEMP VOICE)
    if (newState.channel && (
        newState.channel.name.toLowerCase().includes('oda oluştur') ||
        newState.channel.name.toLowerCase().includes('oda-oluştur') ||
        newState.channel.name.toLowerCase().includes('kendi odanı kur') ||
        newState.channel.name.includes('➕')
    )) {
      const parentCat = newState.channel.parentId;
      const createdVoice = await newState.guild.channels.create({
        name: `🔊 [Oda] ${member.displayName.substring(0, 20)}`,
        type: ChannelType.GuildVoice,
        parent: parentCat,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers]
          }
        ]
      }).catch(() => null);

      if (createdVoice) {
        tempVoiceChannels.add(createdVoice.id);
        await member.voice.setChannel(createdVoice).catch(() => {});
      }
    }

    // 0.1. GEÇİCİ ODALARDAN ÇIKIŞ VE SİLME
    if (oldState.channelId && tempVoiceChannels.has(oldState.channelId)) {
      const ch = oldState.channel;
      if (ch && ch.members.size === 0) {
        tempVoiceChannels.delete(oldState.channelId);
        tempVoiceOwners.delete(oldState.channelId);
        await ch.delete().catch(() => {});
      }
    }

    if (!isStaffTrackingLive()) return;

    const data = loadData();
    if (!data.staffStats) data.staffStats = {};

    const userId = member.id;
    if (!data.staffStats[userId]) {
      data.staffStats[userId] = {
        todayVoice: 0,
        totalVoice: 0,
        todayMsgs: 0,
        totalMsgs: 0,
        todayTickets: 0,
        totalTickets: 0,
        voiceJoinedAt: null
      };
    }

    const userStats = data.staffStats[userId];

    // 1. Sese Katıldı
    if (!oldState.channelId && newState.channelId) {
      if (newState.channelId !== newState.guild.afkChannelId) {
        userStats.voiceJoinedAt = Date.now();
        saveData(data);
      }
    }
    // 2. Sesten Ayrıldı
    else if (oldState.channelId && !newState.channelId) {
      if (userStats.voiceJoinedAt) {
        const duration = Date.now() - userStats.voiceJoinedAt;
        userStats.todayVoice = (userStats.todayVoice || 0) + duration;
        userStats.weeklyVoice = (userStats.weeklyVoice || 0) + duration;
        userStats.totalVoice = (userStats.totalVoice || 0) + duration;
        userStats.voiceJoinedAt = null;
        saveData(data);
      }
    }
    // 3. Kanal Değiştirdi
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      if (newState.channelId === newState.guild.afkChannelId) {
        if (userStats.voiceJoinedAt) {
          const duration = Date.now() - userStats.voiceJoinedAt;
          userStats.todayVoice = (userStats.todayVoice || 0) + duration;
          userStats.weeklyVoice = (userStats.weeklyVoice || 0) + duration;
          userStats.totalVoice = (userStats.totalVoice || 0) + duration;
          userStats.voiceJoinedAt = null;
          saveData(data);
        }
      } else {
        if (userStats.voiceJoinedAt) {
          const duration = Date.now() - userStats.voiceJoinedAt;
          userStats.todayVoice = (userStats.todayVoice || 0) + duration;
          userStats.weeklyVoice = (userStats.weeklyVoice || 0) + duration;
          userStats.totalVoice = (userStats.totalVoice || 0) + duration;
        }
        userStats.voiceJoinedAt = Date.now();
        saveData(data);
      }
    }
  } catch (err) {
    console.error('Ses takip hatası:', err);
  }
});

// ==========================================
// 4.3. AKILLI ANTİ-RAİD VE ŞÜPHELİ HESAP GÜVENLİK KALKANI
// ==========================================
client.on('guildMemberAdd', async (member) => {
  try {
    const now = Date.now();
    joinTimestamps.push(now);
    while (joinTimestamps.length > 0 && now - joinTimestamps[0] > 60000) {
      joinTimestamps.shift();
    }

    const data = loadData();
    const securityMode = data.securityMode !== false; // Varsayılan aktif

    // 1. Anti-Raid Kalkanı (10 saniyede 5+ giriş)
    const recentJoins = joinTimestamps.filter(t => now - t <= 10000);
    if (securityMode && recentJoins.length >= 5) {
      const chStaff = member.guild.channels.cache.find(c => c.name.includes('yetkili-duyuru') || c.name.includes('yetkili-chat'));
      if (chStaff) {
        const raidEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setTitle('🚨 ACİL: ANTİ-RAİD GÜVENLİK KALKANI DEVREYE GİRDİ!')
          .setDescription(`⚠️ Son 10 saniyede **${recentJoins.length} yeni üye** katıldı! Olası bir bot/raid saldırısı tespit edildi.\n🛡️ Yönetim ekibinin dikkatine!`)
          .setTimestamp();
        await chStaff.send({ content: '📢 @everyone 🚨 **RAİD ALARMI!**', embeds: [raidEmbed] }).catch(() => {});
      }
    }

    // 2. Şüpheli Yeni Açılmış Hesap Koruması (< 7 gün)
    const accountAgeDays = (now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 7) {
      const chCheatLog = await getOrCreateCheatLogChannel(member.guild);
      if (chCheatLog) {
        const suspectEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setAuthor({ name: 'Vyron Güvenlik & Şüpheli Hesap Tespiti', iconURL: member.guild.iconURL({ dynamic: true }) })
          .setTitle('⚠️ YENİ AÇILMIŞ ŞÜPHELİ HESAP KATILDI')
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setDescription(
            `👤 **Kullanıcı:** ${member} (\`${member.user.tag}\`)\n` +
            `🆔 **Discord ID:** \`${member.id}\`\n` +
            `📅 **Hesap Yaşı:** \`${accountAgeDays.toFixed(1)} Gün\` *(7 günden yeni)*\n` +
            `⏰ **Katılış Tarihi:** <t:${Math.floor(now / 1000)}:R>`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();
        await chCheatLog.send({ embeds: [suspectEmbed] }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('guildMemberAdd güvenlik hatası:', e);
  }
});

// ==========================================
// 5. KANALA ATILAN SS'LERİ OTOMATİK OKUYAN DİNLEYİCİ (MESSAGE CREATE)
// ==========================================
client.on('messageCreate', async (message) => {
  try {
    // Botların mesajlarını ve DM'leri yoksay
    if (message.author.bot || !message.guild) return;

    // 0.0. AKILLI AFK DÖNÜŞÜ VE ETİKET KORUMASI
    if (userAfkData.has(message.author.id)) {
      const afkInfo = userAfkData.get(message.author.id);
      userAfkData.delete(message.author.id);
      if (afkInfo.oldNick && message.member.manageable) {
        await message.member.setNickname(afkInfo.oldNick).catch(() => {});
      }
      const returnEmbed = new EmbedBuilder()
        .setColor('#10B981')
        .setAuthor({ name: 'Vyron AFK Asistanı', iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setDescription(`👋 Hoş geldin ${message.author}! **AFK** modundan başarıyla çıktınız. *(<t:${Math.floor(afkInfo.timestamp / 1000)}:R> önce geçmiştiniz)*`)
        .setFooter({ text: FOOTER_TEXT });

      message.channel.send({ embeds: [returnEmbed] }).then(m => setTimeout(() => m.delete().catch(() => {}), 6000)).catch(() => {});
    }

    if (message.mentions.members && message.mentions.members.size > 0) {
      for (const [_, mentionedMember] of message.mentions.members) {
        if (mentionedMember.id === message.author.id) continue;
        if (userAfkData.has(mentionedMember.id)) {
          const afkInfo = userAfkData.get(mentionedMember.id);
          const afkWarn = new EmbedBuilder()
            .setColor('#F59E0B')
            .setAuthor({ name: 'Vyron AFK Bildirimi', iconURL: mentionedMember.user.displayAvatarURL({ dynamic: true }) })
            .setDescription(`🌙 **${mentionedMember.displayName}** şu anda **AFK**!\n📝 **Sebep:** \`${afkInfo.reason}\`\n⏰ **Süre:** <t:${Math.floor(afkInfo.timestamp / 1000)}:R>`)
            .setFooter({ text: FOOTER_TEXT });

          message.reply({ embeds: [afkWarn] }).then(m => setTimeout(() => m.delete().catch(() => {}), 7000)).catch(() => {});
          break;
        }
      }
    }

    const data = loadData();
    const channelName = message.channel.name.toLowerCase();

    // Ticket / Destek / Başvuru Kanalı Kontrolü
    const isTicketChannel = channelName.startsWith('başvuru-') ||
                            channelName.startsWith('destek-') ||
                            channelName.startsWith('ticket-') ||
                            channelName.startsWith('partner-') ||
                            channelName.startsWith('cekilis-') ||
                            channelName.startsWith('reklam-') ||
                            channelName.startsWith('boost-') ||
                            (data.ticketCategoryId && message.channel.parentId === data.ticketCategoryId) ||
                            (data.applyCategoryId && message.channel.parentId === data.applyCategoryId);

    // 0. GÜVENLİK KALKANI: Anti-Link & Anti-Spam (Yönetici ve yetkililer hariç)
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) || false;
    const isStaff = isStaffMember(message.member, data);

    if (!isAdmin && !isStaff) {
      // A. Anti-Link (Discord Davet Linki Koruması)
      const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/i;
      if (inviteRegex.test(message.content)) {
        await message.delete().catch(() => {});
        const warnEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setAuthor({ name: 'Vyron Akıllı Güvenlik Kalkanı', iconURL: message.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🚫 YETKİSİZ DAVET LİNKİ ENGELLENDİ!')
          .setDescription(`Merhaba ${message.author}, sunucumuzda **reklam ve Discord davet linki** paylaşmak kesinlikle yasaktır! Mesajınız silindi.`)
          .setFooter({ text: FOOTER_TEXT });

        const sentWarn = await message.channel.send({ embeds: [warnEmbed] }).catch(() => null);
        if (sentWarn) setTimeout(() => sentWarn.delete().catch(() => {}), 6000);

        const chCheatLog = await getOrCreateCheatLogChannel(message.guild);
        if (chCheatLog) {
          const logEmbed = new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🚨 REKLAM / DAVET LİNKİ YAKALANDI')
            .addFields(
              { name: '👤 Kullanıcı', value: `${message.author} (\`${message.author.tag}\` - \`${message.author.id}\`)`, inline: true },
              { name: '📁 Kanal', value: `${message.channel}`, inline: true },
              { name: '💬 Mesaj İçeriği', value: `\`\`\`${message.content.substring(0, 1000)}\`\`\``, inline: false }
            )
            .setTimestamp();
          await chCheatLog.send({ embeds: [logEmbed] }).catch(() => {});
        }
        return;
      }

      // B. Anti-Spam (4 saniyede 5+ mesaj)
      const now = Date.now();
      const userHistory = userMessageHistory.get(message.author.id) || [];
      const recentMessages = userHistory.filter(t => now - t < 4000);
      recentMessages.push(now);
      userMessageHistory.set(message.author.id, recentMessages);

      if (recentMessages.length >= 5) {
        await message.delete().catch(() => {});
        await message.member?.timeout(60 * 1000, 'Hızlı mesaj spamı tespiti').catch(() => {});
        const spamWarn = new EmbedBuilder()
          .setColor('#EF4444')
          .setAuthor({ name: 'Vyron Güvenlik Kalkanı', iconURL: message.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('⚠️ SPAM TESPİT EDİLDİ - SÜRELİ SUSTURMA')
          .setDescription(`${message.author}, çok hızlı mesaj gönderdiğiniz için **1 dakika** susturuldunuz. Lütfen yavaşlayınız!`)
          .setFooter({ text: FOOTER_TEXT });

        const sentSpam = await message.channel.send({ embeds: [spamWarn] }).catch(() => null);
        if (sentSpam) setTimeout(() => sentSpam.delete().catch(() => {}), 6000);
        return;
      }
    }

    // 0.1. KLAN İÇİ XP KAZANIM MOTORU
    if (!message.author.bot && message.content.length >= 3 && !isTicketChannel) {
      const now = Date.now();
      const lastXpTime = userXpCooldowns.get(message.author.id) || 0;
      if (now - lastXpTime >= 60000) {
        userXpCooldowns.set(message.author.id, now);
        if (!data.userLevels) data.userLevels = {};

        const userId = message.author.id;
        const currentXP = data.userLevels[userId] || 0;
        const currentLevel = getLevelFromXP(currentXP);
        const addedXP = Math.floor(Math.random() * 11) + 15; // 15-25 XP
        const newXP = currentXP + addedXP;
        data.userLevels[userId] = newXP;

        // Seviye Atlama Kontrolü
        const newLevel = getLevelFromXP(newXP);
        if (newLevel > currentLevel) {
          const lvlEmbed = new EmbedBuilder()
            .setColor('#F59E0B')
            .setAuthor({ name: 'Vyron Seviye & Rank Sistemi', iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTitle('🎉 TEBRİKLER, SEVİYE ATLADINIZ!')
            .setDescription(`Tebrikler ${message.author}! Klan içi seviyeniz yükseldi: **Level ${newLevel}**! 🏆`)
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();

          message.channel.send({ embeds: [lvlEmbed] }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
        }
        saveData(data);
      }
    }

    // Üstlenilen Ticket Mesaj Kontrolü (Sadece üstlenen yetkili, talep sahibi ve Yönetici yazabilir)
    const claimInfo = activeClaimedTickets.get(message.channel.id);
    if (isTicketChannel && claimInfo) {
      const isClaimedStaff = message.author.id === claimInfo.claimedBy;
      const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) || false;
      const isStaff = isStaffMember(message.member, data);

      if (isStaff && !isClaimedStaff && !isAdmin) {
        await message.delete().catch(() => {});
        return message.channel.send({
          content: `⚠️ ${message.author}, bu destek talebi <@${claimInfo.claimedBy}> tarafından **üstlenilmiştir.** Yalnızca talebi üstlenen yetkili mesaj yazabilir!`
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      }

      if (isClaimedStaff) {
        claimInfo.hasStaffReplied = true;
      }
    }

    // Yetkili Ticket Mesaj Sayacı (Sadece Destek / Başvuru kanallarındaki mesajlar sayılır)
    if (isStaffTrackingLive() && isTicketChannel && isStaffMember(message.member, data)) {
      if (!data.staffStats) data.staffStats = {};
      const sId = message.author.id;
      if (!data.staffStats[sId]) {
        data.staffStats[sId] = { todayVoice: 0, weeklyVoice: 0, totalVoice: 0, todayTicketMsgs: 0, weeklyTicketMsgs: 0, totalTicketMsgs: 0, todayTicketClaims: 0, weeklyTicketClaims: 0, totalTicketClaims: 0, todayApplyClaims: 0, weeklyApplyClaims: 0, totalApplyClaims: 0, todayAnydeskChecks: 0, weeklyAnydeskChecks: 0, totalAnydeskChecks: 0, todaySolvedTickets: 0, weeklySolvedTickets: 0, totalSolvedTickets: 0, todayGearGiven: 0, weeklyGearGiven: 0, totalGearGiven: 0, voiceJoinedAt: null };
      }
      data.staffStats[sId].todayTicketMsgs = (data.staffStats[sId].todayTicketMsgs || 0) + 1;
      data.staffStats[sId].weeklyTicketMsgs = (data.staffStats[sId].weeklyTicketMsgs || 0) + 1;
      data.staffStats[sId].totalTicketMsgs = (data.staffStats[sId].totalTicketMsgs || 0) + 1;
      saveData(data);
    }

    // 🎒 Gear Verme Takibi (SADECE #gear-verilenler-ekip veya ayarlanan gear kanalı)
    const isGearChannel = (data.gearLogChannelId && message.channel.id === data.gearLogChannelId) ||
                          channelName.includes('gear-verilenler-ekip') ||
                          channelName.includes('gear-verilenler') ||
                          channelName.includes('gear-verilen') ||
                          (channelName.includes('gear') && channelName.includes('ekip')) ||
                          (channelName.includes('gear') && channelName.includes('verilen'));
    if (isStaffTrackingLive() && isGearChannel && isStaffMember(message.member, data)) {
      const hasImage = message.attachments.some(att =>
        (att.contentType && att.contentType.startsWith('image/')) ||
        /\.(png|jpe?g|webp|gif)$/i.test(att.name || '')
      );
      if (hasImage) {
        if (!data.staffStats) data.staffStats = {};
        const sId = message.author.id;
        if (!data.staffStats[sId]) {
          data.staffStats[sId] = { todayVoice: 0, weeklyVoice: 0, totalVoice: 0, todayTicketMsgs: 0, weeklyTicketMsgs: 0, totalTicketMsgs: 0, todayTicketClaims: 0, weeklyTicketClaims: 0, totalTicketClaims: 0, todayApplyClaims: 0, weeklyApplyClaims: 0, totalApplyClaims: 0, todayAnydeskChecks: 0, weeklyAnydeskChecks: 0, totalAnydeskChecks: 0, todaySolvedTickets: 0, weeklySolvedTickets: 0, totalSolvedTickets: 0, todayGearGiven: 0, weeklyGearGiven: 0, totalGearGiven: 0, voiceJoinedAt: null };
        }
        const gearCount = message.attachments.filter(att =>
          (att.contentType && att.contentType.startsWith('image/')) ||
          /\.(png|jpe?g|webp|gif)$/i.test(att.name || '')
        ).size;
        data.staffStats[sId].todayGearGiven = (data.staffStats[sId].todayGearGiven || 0) + gearCount;
        data.staffStats[sId].weeklyGearGiven = (data.staffStats[sId].weeklyGearGiven || 0) + gearCount;
        data.staffStats[sId].totalGearGiven = (data.staffStats[sId].totalGearGiven || 0) + gearCount;
        saveData(data);

        await message.react('🎒').catch(() => {});
      }
    }

    // 4. AKILLI KLAN ASİSTANI (OTOMATİK SSS & IP YANITLAYICI)
    const lowerContent = message.content.toLowerCase().trim();
    if (lowerContent === 'ip' || lowerContent === 'ip ne' || lowerContent === 'sunucu ip' || lowerContent === 'vyron ip' || lowerContent === '!ip' || lowerContent === '.ip') {
      const ipEmbed = new EmbedBuilder()
        .setColor('#10B981')
        .setAuthor({ name: 'Vyron Minecraft Bilgi Asistanı', iconURL: message.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
        .setTitle('🎮 VYRON RESMİ MINECRAFT SUNUCU BİLGİSİ')
        .setDescription(
          `🌐 **Sunucu IP Adresi:** \`play.vyronmc.com\`\n` +
          `⚙️ **Desteklenen Sürümler:** \`1.20.x - 1.21.x\`\n` +
          `⚔️ **Oyun Modları:** \`PvP / SMP / BoxPvP / Trap\`\n\n` +
          `*İyi oyunlar dileriz! Klanımıza ve sunucumuza hoş geldiniz.* 💎⚔️`
        )
        .setFooter({ text: FOOTER_TEXT });

      await message.reply({ embeds: [ipEmbed] }).catch(() => {});
      return;
    }

    if (lowerContent === 'pack' || lowerContent === 'texture pack' || lowerContent === 'klan pack' || lowerContent === '!pack' || lowerContent === '.pack') {
      const packEmbed = new EmbedBuilder()
        .setColor('#8B5CF6')
        .setAuthor({ name: 'Vyron Minecraft Bilgi Asistanı', iconURL: message.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
        .setTitle('📦 VYRON ÖZEL TEXTURE & BUTON PACKLERİ')
        .setDescription(
          `Klanımıza özel tüm FPS Boost ve PvP Texture Packlerine erişmek için **Abone Rolü** almanız yeterlidir!\n\n` +
          `🔴 **Nasıl Alınır?**\n` +
          `**[birim](https://www.youtube.com/@birimfonksiyons)** ve **[Froz](https://www.youtube.com/@xFrozzeq)** YouTube kanallarına abone olup SS'i <#${data.aboneLogChannelId || 'abone-kanit'}> kanalına atınız. Bot yapay zeka ile rolünüzü anında verecektir! 🤖📸`
        )
        .setFooter({ text: FOOTER_TEXT });

      await message.reply({ embeds: [packEmbed] }).catch(() => {});
      return;
    }

    // Abone Kanıt Kanalı mı kontrol et
    const isTargetChannel = (data.aboneLogChannelId && message.channel.id === data.aboneLogChannelId) ||
                            channelName.includes('abone-kanit') ||
                            channelName.includes('abone-kanıt') ||
                            channelName.includes('abone-ss') ||
                            channelName.includes('abone');

    if (!isTargetChannel) return;

    // Mesajdaki tüm görsel eklerini topla
    const imageAttachments = message.attachments.filter(att =>
      (att.contentType && att.contentType.startsWith('image/')) ||
      /\.(png|jpe?g|webp|bmp|gif)$/i.test(att.name || '') ||
      /\.(png|jpe?g|webp|bmp|gif)/i.test(att.url || '')
    );

    // Eğer görsel yoksa işlem yapma
    if (imageAttachments.size === 0) return;

    const guild = message.guild;
    const member = message.member;

    // 1. Abone Rolünü Bul
    const aboneRole = (data.aboneRoleId && guild.roles.cache.get(data.aboneRoleId)) ||
                      guild.roles.cache.find(r => r.name.toLowerCase().includes('vyron • abone')) ||
                      guild.roles.cache.find(r => r.name.toLowerCase().includes('abone'));

    if (!aboneRole) {
      return message.reply({ content: '❌ Sunucuda Abone rolü bulunamadı! Lütfen yöneticilere bildiriniz.' }).catch(() => {});
    }

    // Zaten Abone Rolü Varsa
    if (member.roles.cache.has(aboneRole.id)) {
      return message.reply({ content: `ℹ️ ${message.author}, zaten **${aboneRole.name}** rolüne sahipsiniz!` }).catch(() => {});
    }

    // 2. Kırpılmış Ekran Görüntüsü ve Çözünürlük Kontrolü (Anti-Crop & FullScreen)
    let hasCroppedImage = false;
    let detectedDims = '';

    for (const [_, att] of imageAttachments) {
      const dims = await getImageDimensions(att);
      if (!isImageFullScreen(dims.width, dims.height)) {
        hasCroppedImage = true;
        detectedDims = `${dims.width}x${dims.height}`;
        break;
      }
    }

    if (hasCroppedImage) {
      await message.react('❌').catch(() => {});
      const cropWarningEmbed = new EmbedBuilder()
        .setColor('#EF4444')
        .setAuthor({ name: 'Vyron Güvenlik & Doğrulama Sistemi', iconURL: guild.iconURL({ dynamic: true }) })
        .setTitle('❌ KIRPILMIŞ / DÜŞÜK BOYUTLU GÖRSEL TESPİT EDİLDİ!')
        .setDescription(
          `Merhaba ${message.author}! Gönderdiğiniz görsel **kırpılmış veya tam ekran olmadığı** için reddedildi. ${detectedDims ? `\`(${detectedDims})\`` : ''}\n\n` +
          `📌 **ZORUNLU KURAL (TAM EKRAN SS):**\n` +
          `Lütfen görseli **kesinlikle kırpmadan**, telefonunuzun veya monitörünüzün **TAM EKRANINI (saat, şarj, bildirim veya tarayıcı sekmeleri gözükecek şekilde)** atınız!\n\n` +
          `🖥️ **Bilgisayar:** En az 1080px genişlik (1920x1080 vb.)\n` +
          `📱 **Telefon:** En az 1080px yükseklik (1080x2400 vb.)\n\n` +
          `👇 Lütfen kırpılmamış orijinal tam ekran SS ile tekrar deneyiniz!`
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      return message.reply({ embeds: [cropWarningEmbed] }).catch(() => {});
    }

    // 3. Kullanıcıya analiz mesajı gönder
    const loadingMsg = await message.reply({
      content: `🔍 **Yapay Zeka Ekran Görüntünüzü İnceliyor...**\n*Lütfen bekleyiniz, YouTube abonelikleriniz okunuyor...* ⏳`
    }).catch(() => null);

    // 4. Kullanıcının Mevcut İlerlemesini Al (2 Kanal İçin Hafıza)
    let userProgress = userSubProgress.get(message.author.id) || { birim: false, froz: false, updatedAt: Date.now() };

    // Atılan tüm görselleri OCR ile tara
    for (const [_, att] of imageAttachments) {
      const ocrResult = await analyzeYoutubeScreenshot(att.url);
      if (ocrResult.isBirim) userProgress.birim = true;
      if (ocrResult.isFroz) userProgress.froz = true;
    }

    userProgress.updatedAt = Date.now();

    // 5. DURUM DEĞERLENDİRMESİ

    // DURUM A: 2 KANALIN İKİSİ DE TAMAMLANDI (2/2) 🎉
    if (userProgress.birim && userProgress.froz) {
      await member.roles.add(aboneRole).catch(console.error);
      userSubProgress.delete(message.author.id); // Hafızayı temizle

      const successEmbed = new EmbedBuilder()
        .setColor('#10B981')
        .setAuthor({ name: 'Vyron Otomatik Abone Onay Sistemi', iconURL: guild.iconURL({ dynamic: true }) })
        .setTitle('🎉 TEBRİKLER! HER İKİ KANAL DA DOĞRULANDI (2/2)')
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
        .setDescription(
          `Tebrikler ${message.author}! Her iki YouTube kanal aboneliğiniz başarıyla doğrulandı ve **${aboneRole}** rolünüz verildi.\n\n` +
          `✅ 1. Kanal: **[birim](https://www.youtube.com/@birimfonksiyons)** (@birimfonksiyons)\n` +
          `✅ 2. Kanal: **[Froz](https://www.youtube.com/@xFrozzeq)** (@xFrozzeq)\n\n` +
          `🎁 Artık özel texture packlere, private buton packlerine ve VIP çekilişlere tam erişebilirsiniz! Keyifli oyunlar dileriz. ⚔️💎`
        )
        .addFields(
          { name: '⏰ Onay Zamanı', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      if (loadingMsg) {
        await loadingMsg.edit({ content: `🎉 ${message.author}`, embeds: [successEmbed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [successEmbed] }).catch(() => {});
      }

      await message.react('✅').catch(() => {});
      await message.react('🎉').catch(() => {});
      return;
    }

    // DURUM B: YALNIZCA 1. KANAL (birim) ONAYLANDI (1/2)
    if (userProgress.birim && !userProgress.froz) {
      userSubProgress.set(message.author.id, userProgress);

      const stepEmbed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setAuthor({ name: 'Vyron Abone Onay Sistemi (1/2)', iconURL: guild.iconURL({ dynamic: true }) })
        .setTitle('🟡 1/2 KANAL ONAYLANDI: birim (@birimfonksiyons)')
        .setDescription(
          `Merhaba ${message.author}! **[birim](https://www.youtube.com/@birimfonksiyons)** kanalına aboneliğiniz başarıyla onaylandı! ✅\n\n` +
          `📌 **ŞİMDİ 2. ADIM (ROL İÇİN ZORUNLU):**\n` +
          `Lütfen 2. kanal olan **[Froz (@xFrozzeq)](https://www.youtube.com/@xFrozzeq)** kanalına abone olduğunuz **kırpılmamış tam ekran SS'i** buraya atınız!\n\n` +
          `*(İki kanal da tamamlanınca ${aboneRole} rolünüz saniyeler içinde otomatik verilecektir).*`
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      if (loadingMsg) {
        await loadingMsg.edit({ content: `🟡 ${message.author}`, embeds: [stepEmbed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [stepEmbed] }).catch(() => {});
      }

      await message.react('1️⃣').catch(() => {});
      return;
    }

    // DURUM C: YALNIZCA 2. KANAL (Froz) ONAYLANDI (1/2)
    if (!userProgress.birim && userProgress.froz) {
      userSubProgress.set(message.author.id, userProgress);

      const stepEmbed = new EmbedBuilder()
        .setColor('#F59E0B')
        .setAuthor({ name: 'Vyron Abone Onay Sistemi (1/2)', iconURL: guild.iconURL({ dynamic: true }) })
        .setTitle('🟡 1/2 KANAL ONAYLANDI: Froz (@xFrozzeq)')
        .setDescription(
          `Merhaba ${message.author}! **[Froz](https://www.youtube.com/@xFrozzeq)** kanalına aboneliğiniz başarıyla onaylandı! ✅\n\n` +
          `📌 **ŞİMDİ 2. ADIM (ROL İÇİN ZORUNLU):**\n` +
          `Lütfen diğer kanal olan **[birim (@birimfonksiyons)](https://www.youtube.com/@birimfonksiyons)** kanalına abone olduğunuz **kırpılmamış tam ekran SS'i** buraya atınız!\n\n` +
          `*(İki kanal da tamamlanınca ${aboneRole} rolünüz saniyeler içinde otomatik verilecektir).*`
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      if (loadingMsg) {
        await loadingMsg.edit({ content: `🟡 ${message.author}`, embeds: [stepEmbed] }).catch(() => {});
      } else {
        await message.reply({ embeds: [stepEmbed] }).catch(() => {});
      }

      await message.react('1️⃣').catch(() => {});
      return;
    }

    // DURUM D: HİÇBİR KANAL VEYA ABONELİK TESPİT EDİLEMEDİ
    const failEmbed = new EmbedBuilder()
      .setColor('#EF4444')
      .setAuthor({ name: 'Vyron Abone Onay Sistemi', iconURL: guild.iconURL({ dynamic: true }) })
      .setTitle('⚠️ ABONELİK TESPİT EDİLEMEDİ (2 KANAL DA ZORUNLUDUR)')
      .setDescription(
        `Merhaba ${message.author}! Gönderdiğiniz görselde [birim](https://www.youtube.com/@birimfonksiyons) veya [Froz](https://www.youtube.com/@xFrozzeq) kanallarına **'Abone Olundu'** *(veya Subscribed)* yazısı okunamadı.\n\n` +
        `📌 **ZORUNLU KURALLAR:**\n` +
        `1️⃣ **KESİNLİKLE TAM EKRAN OLMALIDIR:** Görseli kırpmadan, tüm telefon veya monitör ekranınızı SS alınız.\n` +
        `2️⃣ **İKİ KANAL DA ZORUNLUDUR:**\n` +
        `• 🎬 1. Kanal: **[birim](https://www.youtube.com/@birimfonksiyons)**\n` +
        `• 🎬 2. Kanal: **[Froz](https://www.youtube.com/@xFrozzeq)**\n` +
        `3️⃣ **ABONELİK YAZISI:** Kanalda **'Abone Olundu / Subscribed'** butonunun net ve okunaklı olduğundan emin olunuz.\n\n` +
        `👇 Lütfen kırpılmamış tam ekran görüntülerinizi bu kanala yükleyiniz!`
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    if (loadingMsg) {
      await loadingMsg.edit({ content: `⚠️ ${message.author}`, embeds: [failEmbed] }).catch(() => {});
    } else {
      await message.reply({ embeds: [failEmbed] }).catch(() => {});
    }

    await message.react('❌').catch(() => {});
  } catch (err) {
    console.error('Mesaj SS okuma hatası:', err);
  }
});

// ==========================================
// 5.1. İNTERAKTİF YARDIM MENÜSÜ ÜRETİCİSİ
// ==========================================
function buildHelpMenu(category = 'home') {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('📂 Bir modül/kategori seçiniz...')
    .addOptions([
      { label: 'Ana Sayfa & Genel Bakış', value: 'home', emoji: '⚔️', description: 'Botun tüm modüllerine genel bakış' },
      { label: 'Yetkili Mesai & Sıralama', value: 'staff', emoji: '👑', description: 'Canlı ses, ticket, gear takibi ve perm up/down' },
      { label: 'Klan & Anydesk Başvuru', value: 'clan', emoji: '🛡️', description: 'Ticketli Anydesk onaylı klan alım paneli' },
      { label: 'Kategorili Destek / Ticket', value: 'ticket', emoji: '🎫', description: 'Gelişmiş talep ve ticket yönetimi' },
      { label: 'Turnuva, Event & IGN Kayıt', value: 'event', emoji: '🏆', description: 'Otomatik katılımcı listeli turnuva duyurusu' },
      { label: 'Güvenlik & Moderasyon', value: 'mod', emoji: '🔨', description: 'Kilit, mute, kick, ban, sil ve doğrulama' },
      { label: 'Yapay Zeka Abone & Çekiliş', value: 'community', emoji: '🎉', description: 'Yapay zeka ile YouTube SS okuma ve çekilişler' }
    ]);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor('#8B5CF6')
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  if (category === 'staff') {
    embed.setTitle('👑 Yetkili Mesai, Denetim & Canlı Sıralama Modülü')
      .setDescription('Yetkililerin ses süreleri, üstlendikleri talepler, ticket mesajları, çözümleri ve gear teslimatları **7/24 otomatik** hesaplanır.')
      .addFields(
        { name: '`/yetkili-siralama`', value: 'Canlı liderlik tablosunu açar (Günlük/Haftalık/Toplam filtre butonları).' },
        { name: '`/yetkili-siralama-kur [kanal]`', value: 'Liderlik tablosunu belirlenen kanala sabitler ve 7/24 otomatik günceller.' },
        { name: '`/yetkili-denetim [filtre]`', value: 'Tüm ekibin anlık ses, destek, başvuru, anydesk ve Haftalık Perm UP/DOWN karnesini döker.' },
        { name: '`/yetkili-inaktif`', value: 'Bugün veya bu hafta 0 çeken inaktif yetkilileri döker (Perm DOWN).' },
        { name: '`/yetkili-terfi [yetkili] [islem] [yeni_rol]`', value: 'Yetkiliye Perm UP (Terfi) veya Perm DOWN (İhtar) verir ve duyurur.' },
        { name: '`/yetkili-rapor [yetkili]`', value: 'Seçilen yetkilinin günlük/haftalık karnesini ve sistem tavsiyesini döker.' },
        { name: '`/gunluk-rapor [kanala_gonder]`', value: '00:00 Gün sonu şampiyonluk ve mesai bültenini anında oluşturup yayınlar.' },
        { name: '`/gear-kanal [kanal]`', value: 'Gear teslimat SS atılacak kanalı (`#gear-verilenler-ekip`) ayarlar.' }
      );
  } else if (category === 'clan') {
    embed.setTitle('⚔️ Klan, Minecraft & Sunucu Takip Modülü')
      .setDescription('Anydesk onaylı başvuru ve canlı Minecraft sunucu monitörü:')
      .addFields(
        { name: '`/basvuru-kur [kanal] [kategori]`', value: 'Anydesk onaylı klan başvuru ticket paneli kurar.' },
        { name: '`/haftanin-oyuncusu [kullanici] [kategori]`', value: 'Haftanın Trapcisi veya Elytracısı unvanını verir.' },
        { name: '`/klan-rutbe [kullanici] [rutbe]`', value: 'Has Klan Üyesi yapar veya klandan çıkarır.' },
        { name: '`/hile-rapor [üye] [hile_türü] [kanıt_ss]`', value: 'Hile kanıt SS dosyasını `#🚫・hile-log` kanalına loglar.' }
      );
  } else if (category === 'ticket') {
    embed.setTitle('🎫 Kategorili Destek & Ticket Sistemi')
      .setDescription('Partnerlik, Çekiliş, Reklam, Boost, Destek ve Diğer kategorili talep sistemi:')
      .addFields(
        { name: '`/ticket-kur [kanal] [kategori]`', value: 'Açılır menülü kategorili ticket panelini kurar.' },
        { name: '`/ticket-yetkili [işlem] [rol]`', value: 'Ticketları görebilecek yetkili rollerini sınırsız ekler/çıkarır.' },
        { name: '`/ticket-kategori [kategori]`', value: 'Ticket odalarının açılacağı kategoriyi ayarlar.' }
      );
  } else if (category === 'event') {
    embed.setTitle('🏆 Turnuva, Event & Topluluk Etkinlikleri')
      .setDescription('Turnuva ve IGN toplama modülü:')
      .addFields(
        { name: '`/turnuva-duyuru [kanal] [baslik] [odul] [tarih]`', value: 'Katılım sayaçlı turnuva kayıt sistemi kurar.' },
        { name: '`/duyuru [kanal] [baslik] [mesaj] [gorsel]`', value: 'Resim veya GIF içeren temalı klan duyurusu atar.' }
      );
  } else if (category === 'mod') {
    embed.setTitle('🛡️ Güvenlik & Moderasyon Modülü')
      .setDescription('Sunucu içi tam moderasyon, Anti-Raid ve güvenlik araçları:')
      .addFields(
        { name: '`/guvenlik-modu [durum]`', value: 'Akıllı Anti-Raid ve yeni açılmış şüpheli hesap kalkanını yönetir.' },
        { name: '`/sicil [kullanici]`', value: 'Kullanıcının geçmiş mute, ceza ve disiplin sicil dosyasını açar.' },
        { name: '`/yavas-mod [saniye] [kanal]`', value: 'Kanalın mesaj yazma yavaş modunu (Slowmode) ayarlar.' },
        { name: '`/kilit [kanal] [durum]`', value: 'Kanalı kilitler veya açar.' },
        { name: '`/mute [kullanici] [sure] [sebep]`', value: 'Kullanıcıyı süreli susturur (Timeout).' },
        { name: '`/unmute [kullanici]`', value: 'Susturmayı kaldırır.' },
        { name: '`/kick [kullanici] [sebep]`', value: 'Kullanıcıyı sunucudan atar.' },
        { name: '`/ban [kullanici] [sebep]`', value: 'Kullanıcıyı yasaklar.' },
        { name: '`/sil [miktar]`', value: 'Mesajları topluca siler (1-100).' }
      );
  } else if (category === 'community') {
    embed.setTitle('🎁 Seviye, Bildirim Rolleri, Dashboard & Çekiliş')
      .setDescription('Klan içi seviye kartı, canlı sunucu aktivite paneli ve bildirim seçim merkezi:')
      .addFields(
        { name: '`/sunucu-istatistik`', value: 'Sunucunun anlık üye, boost, kanal, klan rolleri ve ping dashboardunu açar.' },
        { name: '`/bildirim-rol-kur [kanal]`', value: 'Üyelerin tek tıkla bildirim rollerini seçebileceği paneli kurar.' },
        { name: '`/seviye [kullanici]`', value: 'Kullanıcının seviyesini, toplam XP ve ilerleme kartını gösterir.' },
        { name: '`/top-seviye`', value: 'Sunucunun en yüksek seviyeli üyelerini listeler.' },
        { name: '`/afk [sebep]`', value: 'AFK moduna geçer; etiketlendiğinizde bot sebebi otomatik bildirir.' },
        { name: '`/cekilis [kanal] [odul] [sure] [kazanan_sayisi] [sart]`', value: 'Abone şartlı veya şartsız canlı çekiliş başlatır.' },
        { name: '`/reroll [mesaj_id]`', value: 'Çekilişten yeni kazanan seçer.' },
        { name: '`/anket [kanal] [soru] [secenekler]`', value: 'Canlı sayaçlı anket başlatır.' },
        { name: '`/otomatik-kurulum`', value: 'Tüm klan altyapısını ve panellerini tek tıkla otomatik kurar.' },
        { name: '`/abone-kur [kanal] [abone_rolu]`', value: 'Abone bilgilendirme panelini kurar.' },
        { name: '`/abone-kanal [kanal]`', value: 'Üyelerin SS atacağı kanalı (`#abone-kanit`) ayarlar.' }
      );
  } else {
    // 'home'
    embed.setTitle('╭─── 〖 ⚔️ VYRON VIP KLAN BOTU 〗 ───╮')
      .setDescription(
        `Hoş geldiniz! **Vyron** klanı ve topluluğu için özel olarak geliştirilmiş en gelişmiş VIP yönetim sistemi.\n\n` +
        `👇 **Aşağıdaki menüden incelemek istediğiniz modülü seçiniz:**\n\n` +
        `👑 **Yetkili Mesai & Sıralama**\n` +
        `⚔️ **Klan, Minecraft & Canlı Sunucu Takibi**\n` +
        `🎫 **Kategorili Destek / Ticket**\n` +
        `🏆 **Turnuva, Event & IGN Kayıt**\n` +
        `🛡️ **Güvenlik, Anti-Raid & Moderasyon**\n` +
        `🎁 **Seviye, Bildirim Rolleri & Çekiliş**\n\n` +
        `╰──────────────────────────────╯`
      );
  }

  return { embeds: [embed], components: [row] };
}

// ==========================================
// 6. ETKİLEŞİM VE İŞLEMLER (SLASH & BUTONLAR)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  try {
    // ----------------------------------------------------
    // A. SLASH KOMUTLARI
    // ----------------------------------------------------
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // 1. /yardim (İnteraktif Açılır Menülü Elit Yardım Rehberi)
      if (commandName === 'yardim') {
        const helpData = buildHelpMenu('home');
        return interaction.reply({
          embeds: helpData.embeds,
          components: helpData.components,
          ephemeral: true
        });
      }

      // 2. /abone-kur (FOTOĞRAFTAKİ DETAYLI BİLGİLENDİRME & KANALA YÖNLENDİRME)
      if (commandName === 'abone-kur') {
        await interaction.deferReply({ ephemeral: true });
        const targetChannel = interaction.options.getChannel('kanal');
        const customRole = interaction.options.getRole('abone_rolu');
        const guild = interaction.guild;

        const data = loadData();
        const roleToUse = customRole || guild.roles.cache.find(r => r.name.toLowerCase().includes('abone')) || guild.roles.cache.find(r => r.name.toLowerCase().includes('vyron • abone'));

        if (roleToUse) {
          data.aboneRoleId = roleToUse.id;
          saveData(data);
        }

        const chAboneLog = await getOrCreateAboneLogChannel(guild);

        const aboneEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setAuthor({ name: 'Vyron Abone Rolü Bilgilendirme', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🔴 VYRON ABONE ROLÜ VE ÖZEL AVANTAJLARI')
          .setDescription(
            `### 👑 ${roleToUse ? roleToUse : '@Vyron • Abone'} İçeriği Nedir?\n\n` +
            `🔹 **O Arayıp Bulamadığınız Profil kodları ve Texture Packler**\n` +
            `🔹 **Private Buton Packleri (Haftada bir kişiye özel buton pack'i kazanma şansı!)**\n` +
            `🔹 **Abonelere özel VIP çekilişler (Gear, Kredi, VIP, Özel Roller)**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 📌 ${roleToUse ? roleToUse : '@Vyron • Abone'} Almak İçin Ne Yapmalısınız?\n\n` +
            `Sadece yapmanız gereken aşağıdaki YouTube kanallarına abone olup **KESİNLİKLE KIRPILMAMIŞ TAM EKRAN** ScreenShot (SS) alıp ${chAboneLog ? chAboneLog : '`#abone-kanit`'} kanalına yüklemektir:\n\n` +
            `🎬 **1. Kanal:** [youtube.com/@birimfonksiyons](https://www.youtube.com/@birimfonksiyons) *(birim / smp canavarı)*\n` +
            `🎬 **2. Kanal:** [youtube.com/@xFrozzeq](https://www.youtube.com/@xFrozzeq) *(Froz)*\n\n` +
            `⚠️ **DİKKAT:** Kırpılmış veya sahte fotoğraflar kabul edilmez. Fotoğrafta kanal adı ve **'Abone Olundu'** *(veya İngilizce **'Subscribed'**)* yazısı net gözükmelidir.\n\n` +
            `🤖 **Botumuz ${chAboneLog ? chAboneLog : 'kanala'} attığınız görseli yapay zeka ile okuyup rolünüzü anında otomatik verecektir!**`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const aboneRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('1. Kanal (birim)')
            .setStyle(ButtonStyle.Link)
            .setURL('https://www.youtube.com/@birimfonksiyons')
            .setEmoji('🔴'),
          new ButtonBuilder()
            .setLabel('2. Kanal (Froz)')
            .setStyle(ButtonStyle.Link)
            .setURL('https://www.youtube.com/@xFrozzeq')
            .setEmoji('🔴')
        );

        await targetChannel.send({
          content: '📢 @everyone @here 🔴 **VYRON RESMİ ABONE ROLÜ DUYURUSU!**',
          embeds: [aboneEmbed],
          components: [aboneRow]
        });

        return interaction.editReply({
          content: `✅ **Abone paneli ${targetChannel} kanalına kuruldu!**\n📸 Üyelerin SS atacağı kanal: ${chAboneLog || '#abone-kanit'}\n🏷️ Tanımlanan Rol: ${roleToUse ? roleToUse.name : 'Abone'}`
        });
      }

      // 3. /abone-kanal
      if (commandName === 'abone-kanal') {
        const channel = interaction.options.getChannel('kanal');
        const data = loadData();
        data.aboneLogChannelId = channel.id;
        saveData(data);

        return interaction.reply({
          content: `✅ **Abone kanıt kanalı ayarlandı:** ${channel}\nArtık üyeler bu kanala fotoğraf attığında bot yapay zeka ile okuyup rolü otomatik verecektir! 🤖📸`,
          ephemeral: true
        });
      }

      // 4. /yetkili-siralama
      if (commandName === 'yetkili-siralama') {
        await interaction.deferReply({ ephemeral: false });
        const guild = interaction.guild;
        const data = loadData();
        const leaderboardEmbed = await buildStaffLeaderboardEmbed(guild, data, 'today');
        const row = buildStaffLeaderboardRow('today');
        return interaction.editReply({
          embeds: [leaderboardEmbed],
          components: [row]
        });
      }

      // 5. /yetkili-siralama-kur
      if (commandName === 'yetkili-siralama-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const data = loadData();
        data.staffLeaderboardChannelId = targetChannel.id;
        data.staffLeaderboardMessageId = null; // Sıfırdan yeni pano gönder
        saveData(data);

        await interaction.deferReply({ ephemeral: true });
        await updateStaffLeaderboard(interaction.guild);
        return interaction.editReply({
          content: `✅ **Yetkili canlı mesai panosu ${targetChannel} kanalına başarıyla kuruldu!**\n` +
                   `Bot bu panodaki sıralamayı komutsuz olarak 7/24 otomatik güncelleyecektir. 👑📊`
        });
      }

      // 6. /yetkili-denetim (TÜM EKİBİN CANLI DENETİMİ & PERM UP/DOWN REHBERİ)
      if (commandName === 'yetkili-denetim') {
        await interaction.deferReply({ ephemeral: true });
        const filter = interaction.options.getString('filtre') || 'hepsi';
        const guild = interaction.guild;
        const data = loadData();
        if (!data.staffStats) data.staffStats = {};

        const members = await guild.members.fetch().catch(() => guild.members.cache);
        const staffList = [];

        for (const [userId, member] of members) {
          if (member.user.bot) continue;
          const isStaff = isStaffMember(member, data);
          const hasStats = data.staffStats[userId] !== undefined;
          if (!isStaff && !hasStats) continue;

          const stats = data.staffStats[userId] || {
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
            voiceJoinedAt: null
          };

          let liveVoice = stats.todayVoice || 0;
          let isInVoice = false;
          if (member.voice?.channelId && member.voice.channelId !== guild.afkChannelId) {
            isInVoice = true;
            if (stats.voiceJoinedAt) {
              liveVoice += (Date.now() - stats.voiceJoinedAt);
            }
          }

          const dailyScore = Math.floor(liveVoice / 60000) * 2 +
                             ((stats.todayTicketClaims || stats.todayClaimed || 0) * 20) +
                             ((stats.todayApplyClaims || 0) * 20) +
                             ((stats.todayAnydeskChecks || 0) * 30) +
                             ((stats.todaySolvedTickets || stats.todayTickets || 0) * 25) +
                             ((stats.todayTicketMsgs || 0) * 2) +
                             ((stats.todayGearGiven || 0) * 15);

          const weeklyScore = Math.floor(((stats.weeklyVoice || 0) + (liveVoice - (stats.todayVoice || 0))) / 60000) * 2 +
                              ((stats.weeklyTicketClaims || stats.totalClaimed || 0) * 20) +
                              ((stats.weeklyApplyClaims || 0) * 20) +
                              ((stats.weeklyAnydeskChecks || 0) * 30) +
                              ((stats.weeklySolvedTickets || stats.totalTickets || 0) * 25) +
                              ((stats.weeklyTicketMsgs || stats.totalTicketMsgs || 0) * 2) +
                              ((stats.weeklyGearGiven || 0) * 15);

          staffList.push({
            member,
            userId,
            stats,
            liveVoice,
            isInVoice,
            dailyScore,
            weeklyScore
          });
        }

        let embedTitle = '👑 YETKİLİ EKİBİ PERFORMANS & DENETİM RAPORU';
        let embedColor = '#8B5CF6';
        let reportText = '';

        // FİLTRE 1: İNAKTİFLER (Hiçbir şey yapmayanlar - 0 Puan)
        if (filter === 'inaktif') {
          embedTitle = '⚠️ HİÇBİR ŞEY YAPMAYANLAR (İNAKTİF YETKİLİLER)';
          embedColor = '#EF4444';
          const inactives = staffList.filter(s => s.dailyScore === 0 && s.liveVoice === 0);

          if (inactives.length === 0) {
            reportText = '✅ **Harika!** Bugün tüm yetkililer seste veya ticketlarda aktiflik gösterdi.';
          } else {
            reportText = `🚨 **Bugün 0 Puan Çeken Yetkililer (${inactives.length} Kişi) - Perm DOWN Adayları:**\n\n` +
              inactives.map((item, idx) => `**#${idx + 1}** ${item.member} (\`${item.member.user.tag}\`) • Rol: \`${item.member.roles.highest.name}\`\n>>> *Seste: 0 Dk • Ticket: 0 • Anydesk: 0 • Gear: 0*`).join('\n\n');
          }
        }
        // FİLTRE 2: SES AKTİFLİĞİ
        else if (filter === 'ses') {
          embedTitle = '🎙️ YETKİLİ SES AKTİFLİĞİ & NÖBET SIRALAMASI';
          embedColor = '#3B82F6';
          staffList.sort((a, b) => b.liveVoice - a.liveVoice);

          reportText = staffList.slice(0, 20).map((item, idx) => {
            const voiceStatus = item.isInVoice ? '🟢 **Şu an Seste**' : '⚪ **Boşta**';
            return `**#${idx + 1}** ${item.member} • ${voiceStatus}\n` +
                   `⏱️ **Bugün Seste:** \`${formatDuration(item.liveVoice)}\` | 🗓️ **Haftalık:** \`${formatDuration(item.stats.weeklyVoice || item.stats.totalVoice || 0)}\``;
          }).join('\n\n');
        }
        // FİLTRE 3: DESTEK & TICKET İLGİSİ
        else if (filter === 'ticket') {
          embedTitle = '🎫 DESTEK & TICKET İLGİSİ SIRALAMASI';
          embedColor = '#10B981';
          staffList.sort((a, b) => ((b.stats.todayTicketClaims || b.stats.todayClaimed || 0) + (b.stats.todayTicketMsgs || 0)) - ((a.stats.todayTicketClaims || a.stats.todayClaimed || 0) + (a.stats.todayTicketMsgs || 0)));

          reportText = staffList.slice(0, 20).map((item, idx) => {
            const claims = item.stats.todayTicketClaims || item.stats.todayClaimed || 0;
            const msgs = item.stats.todayTicketMsgs || 0;
            const solved = item.stats.todaySolvedTickets || item.stats.todayTickets || 0;
            return `**#${idx + 1}** ${item.member}\n` +
                   `✋ **Üstlenen Destek:** \`${claims} adet\` • 💬 **Ticket Mesajı:** \`${msgs} adet\` • ✅ **Kapatılan:** \`${solved} adet\``;
          }).join('\n\n');
        }
        // FİLTRE 4: BAŞVURU & ANYDESK
        else if (filter === 'basvuru') {
          embedTitle = '⚔️ KLAN BAŞVURUSU & ANYDESK KONTROLÜ RAPORU';
          embedColor = '#F59E0B';
          staffList.sort((a, b) => ((b.stats.todayAnydeskChecks || 0) + (b.stats.todayApplyClaims || 0)) - ((a.stats.todayAnydeskChecks || 0) + (a.stats.todayApplyClaims || 0)));

          reportText = staffList.slice(0, 20).map((item, idx) => {
            const applyClaims = item.stats.todayApplyClaims || 0;
            const anydesk = item.stats.todayAnydeskChecks || 0;
            return `**#${idx + 1}** ${item.member}\n` +
                   `⚔️ **Üstlenilen Başvuru:** \`${applyClaims} adet\` • 🖥️ **Anydesk Kontrolü (Temiz/Hile):** \`${anydesk} adet\``;
          }).join('\n\n');
        }
        // FİLTRE 5: HAFTALIK ÖZET (PERM UP/DOWN)
        else if (filter === 'haftalik') {
          embedTitle = '📅 BU HAFTANIN GENEL KARNESİ & PERM REHBERİ';
          embedColor = '#8B5CF6';
          staffList.sort((a, b) => b.weeklyScore - a.weeklyScore);

          const activeList = staffList.filter(s => s.weeklyScore > 0).slice(0, 15);
          const inactiveList = staffList.filter(s => s.weeklyScore === 0);

          let activeText = activeList.map((item, idx) => {
            const icon = idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
            return `${icon} ${item.member} • ⭐ **${item.weeklyScore} Haftalık Puan**\n` +
                   `🎙️ Seste: \`${formatDuration(item.stats.weeklyVoice || 0)}\` • ✋ Destek: \`${item.stats.weeklyTicketClaims || item.stats.totalClaimed || 0}\` • 🖥️ Anydesk: \`${item.stats.weeklyAnydeskChecks || 0}\` • 🎒 Gear: \`${item.stats.weeklyGearGiven || 0}\``;
          }).join('\n\n');

          reportText = `### 🌟 Bu Haftanın En Çalışkanları (Perm UP Adayları):\n` +
                       (activeText || 'Henüz haftalık veri toplanmadı.') +
                       `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                       `### ⚠️ Bu Hafta Hiçbir Şey Yapmayanlar (${inactiveList.length} Kişi):\n` +
                       (inactiveList.length > 0 ? inactiveList.map(i => `• ${i.member} (\`${i.member.roles.highest.name}\`)`).join(', ') : '✅ *Bu hafta herkes çalıştı.*');
        }
        // FİLTRE 6: GENEL SIRALAMA (HEPSİ)
        else {
          staffList.sort((a, b) => b.dailyScore - a.dailyScore || b.liveVoice - a.liveVoice);
          const topList = staffList.slice(0, 15);
          const inactives = staffList.filter(s => s.dailyScore === 0);

          reportText = `### 🏆 Bugünün Canlı Sıralaması:\n` +
            topList.map((item, idx) => {
              const icon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
              const voiceStatus = item.isInVoice ? '🟢' : '⚪';
              return `${icon} ${item.member} (${voiceStatus}) • ⭐ **${item.dailyScore} Puan**\n` +
                     `🎙️ Seste: \`${formatDuration(item.liveVoice)}\` • ✋ Destek: \`${item.stats.todayTicketClaims || item.stats.todayClaimed || 0}\` • ⚔️ Başvuru: \`${item.stats.todayApplyClaims || 0}\` • 🖥️ Anydesk: \`${item.stats.todayAnydeskChecks || 0}\` • 🎒 Gear: \`${item.stats.todayGearGiven || 0}\``;
            }).join('\n\n') +
            `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `⚠️ **Bugün Hiçbir Şey Yapmayanlar (${inactives.length} Kişi):** ` +
            (inactives.length > 0 ? inactives.slice(0, 10).map(i => `${i.member}`).join(', ') + (inactives.length > 10 ? ` *ve ${inactives.length - 10} kişi daha*` : '') : '✅ *Yok*');
        }

        const auditEmbed = new EmbedBuilder()
          .setColor(embedColor)
          .setAuthor({ name: `${guild.name} • Yetkili Yönetim & Denetim Paneli`, iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle(embedTitle)
          .setDescription(reportText)
          .setFooter({ text: `${FOOTER_TEXT} • Perm UP/DOWN Yönetici Paneli` })
          .setTimestamp();

        return interaction.editReply({ embeds: [auditEmbed] });
      }

      // 7. /yetkili-inaktif (HİÇBİR ŞEY YAPMAYANLARI DÖKER)
      if (commandName === 'yetkili-inaktif') {
        await interaction.deferReply({ ephemeral: true });
        const timeRange = interaction.options.getString('zaman') || 'bugun';
        const guild = interaction.guild;
        const data = loadData();
        if (!data.staffStats) data.staffStats = {};

        const members = await guild.members.fetch().catch(() => guild.members.cache);
        const inactives = [];

        for (const [userId, member] of members) {
          if (member.user.bot) continue;
          if (!isStaffMember(member, data)) continue;

          const stats = data.staffStats[userId] || {};
          let score = 0;
          let voiceTime = 0;

          if (timeRange === 'bugun') {
            let liveVoice = stats.todayVoice || 0;
            if (member.voice?.channelId && member.voice.channelId !== guild.afkChannelId && stats.voiceJoinedAt) {
              liveVoice += (Date.now() - stats.voiceJoinedAt);
            }
            voiceTime = liveVoice;
            score = Math.floor(liveVoice / 60000) * 2 +
                    ((stats.todayTicketClaims || stats.todayClaimed || 0) * 20) +
                    ((stats.todayApplyClaims || 0) * 20) +
                    ((stats.todayAnydeskChecks || 0) * 30) +
                    ((stats.todaySolvedTickets || stats.todayTickets || 0) * 25) +
                    ((stats.todayTicketMsgs || 0) * 2) +
                    ((stats.todayGearGiven || 0) * 15);
          } else {
            voiceTime = stats.weeklyVoice || 0;
            score = Math.floor(voiceTime / 60000) * 2 +
                    ((stats.weeklyTicketClaims || stats.totalClaimed || 0) * 20) +
                    ((stats.weeklyApplyClaims || 0) * 20) +
                    ((stats.weeklyAnydeskChecks || 0) * 30) +
                    ((stats.weeklySolvedTickets || stats.totalTickets || 0) * 25) +
                    ((stats.weeklyTicketMsgs || stats.totalTicketMsgs || 0) * 2) +
                    ((stats.weeklyGearGiven || 0) * 15);
          }

          if (score === 0 && voiceTime === 0) {
            inactives.push(member);
          }
        }

        const inactEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setAuthor({ name: `${guild.name} • İnaktif Yetkili Denetimi`, iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle(`⚠️ ${timeRange === 'bugun' ? 'BUGÜN' : 'BU HAFTA'} HİÇBİR ŞEY YAPMAYAN YETKİLİLER`)
          .setDescription(
            `Aşağıdaki yetkililer ${timeRange === 'bugun' ? 'bugün' : 'bu hafta'} **0 saat seste kalmış, 0 ticket bakmış, 0 gear vermiş ve 0 puan çekmiştir.**\n` +
            `*(Perm DOWN / Yetki Düşürme kararlarınız için doğrudan kanıttır).* \n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            (inactives.length > 0
              ? inactives.map((m, idx) => `**${idx + 1}.** ${m} (\`${m.user.tag}\`) • Rol: \`${m.roles.highest.name}\``).join('\n\n')
              : `✅ **Tebrikler!** ${timeRange === 'bugun' ? 'Bugün' : 'Bu hafta'} inaktif hiçbir yetkili bulunmuyor, herkes çalıştı!`)
          )
          .setFooter({ text: `${FOOTER_TEXT} • Toplam İnaktif: ${inactives.length} Yetkili` })
          .setTimestamp();

        return interaction.editReply({ embeds: [inactEmbed] });
      }

      // 8. /yetkili-rapor (DETAYLI BİREYSEL KARNE)
      if (commandName === 'yetkili-rapor') {
        await interaction.deferReply({ ephemeral: true });
        const targetUser = interaction.options.getUser('yetkili');
        const guild = interaction.guild;
        const data = loadData();

        const stats = data.staffStats?.[targetUser.id] || {
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
          voiceJoinedAt: null
        };

        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        let liveVoice = stats.todayVoice || 0;
        let isInVoice = false;
        if (member?.voice?.channelId && member.voice.channelId !== guild.afkChannelId) {
          isInVoice = true;
          if (stats.voiceJoinedAt) {
            liveVoice += (Date.now() - stats.voiceJoinedAt);
          }
        }

        const dailyScore = Math.floor(liveVoice / 60000) * 2 +
                           ((stats.todayTicketClaims || stats.todayClaimed || 0) * 20) +
                           ((stats.todayApplyClaims || 0) * 20) +
                           ((stats.todayAnydeskChecks || 0) * 30) +
                           ((stats.todaySolvedTickets || stats.todayTickets || 0) * 25) +
                           ((stats.todayTicketMsgs || 0) * 2) +
                           ((stats.todayGearGiven || 0) * 15);

        const weeklyScore = Math.floor(((stats.weeklyVoice || 0) + (liveVoice - (stats.todayVoice || 0))) / 60000) * 2 +
                            ((stats.weeklyTicketClaims || stats.totalClaimed || 0) * 20) +
                            ((stats.weeklyApplyClaims || 0) * 20) +
                            ((stats.weeklyAnydeskChecks || 0) * 30) +
                            ((stats.weeklySolvedTickets || stats.totalTickets || 0) * 25) +
                            ((stats.weeklyTicketMsgs || stats.totalTicketMsgs || 0) * 2) +
                            ((stats.weeklyGearGiven || 0) * 15);

        let permEvaluation = '🟡 Normal Yetkili (Gereksinimleri karşılıyor)';
        if (dailyScore >= 300 || weeklyScore >= 1500) {
          permEvaluation = '🟢 ⭐ YILDIZ YETKİLİ (Perm UP Adayı - Yüksek Aktiflik)';
        } else if (dailyScore === 0 && weeklyScore === 0) {
          permEvaluation = '🔴 ⚠️ İNAKTİF YETKİLİ (Perm DOWN Adayı - Sıfır Aktiflik)';
        }

        const userReportEmbed = new EmbedBuilder()
          .setColor(dailyScore > 0 ? '#10B981' : '#EF4444')
          .setAuthor({ name: `${targetUser.username} • Resmi Yetkili Performans Karnesi`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
          .setTitle(`📊 Yetkili Mesai & Perm Değerlendirme Karnesi`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: '👤 Yetkili', value: `${targetUser} (\`${targetUser.tag}\`)`, inline: true },
            { name: '🏷️ En Yüksek Rol', value: member ? `\`${member.roles.highest.name}\`` : 'Bilinmiyor', inline: true },
            { name: '🎙️ Ses Durumu', value: isInVoice ? `🟢 Seste (${member.voice.channel.name})` : '⚪ Boşta', inline: true },
            { name: '⭐ Günlük Puan', value: `\`${dailyScore} Puan\``, inline: true },
            { name: '🌟 Bu Haftaki Puan', value: `\`${weeklyScore} Puan\``, inline: true },
            { name: '🎯 Sistem Tavsiyesi', value: `\`${permEvaluation}\``, inline: false },
            {
              name: '📅 BUGÜNKÜ PERFORMANS',
              value: `• 🎙️ **Seste Kalma:** \`${formatDuration(liveVoice)}\`\n` +
                     `• ✋ **Üstlenilen Destek:** \`${stats.todayTicketClaims || stats.todayClaimed || 0} adet\`\n` +
                     `• ⚔️ **Üstlenilen Başvuru:** \`${stats.todayApplyClaims || 0} adet\`\n` +
                     `• 🖥️ **Anydesk Kontrolü:** \`${stats.todayAnydeskChecks || 0} adet\`\n` +
                     `• 🎒 **Gear Verme (#ekip):** \`${stats.todayGearGiven || 0} adet\`\n` +
                     `• 💬 **Ticket Mesajı:** \`${stats.todayTicketMsgs || 0} adet\`\n` +
                     `• ✅ **Çözülen / Kapatılan:** \`${stats.todaySolvedTickets || stats.todayTickets || 0} adet\``,
              inline: true
            },
            {
              name: '🗓️ BU HAFTAKİ PERFORMANS',
              value: `• 🎙️ **Seste Kalma:** \`${formatDuration(stats.weeklyVoice || 0)}\`\n` +
                     `• ✋ **Üstlenilen Destek:** \`${stats.weeklyTicketClaims || stats.totalClaimed || 0} adet\`\n` +
                     `• ⚔️ **Üstlenilen Başvuru:** \`${stats.weeklyApplyClaims || 0} adet\`\n` +
                     `• 🖥️ **Anydesk Kontrolü:** \`${stats.weeklyAnydeskChecks || 0} adet\`\n` +
                     `• 🎒 **Gear Verme (#ekip):** \`${stats.weeklyGearGiven || 0} adet\`\n` +
                     `• 💬 **Ticket Mesajı:** \`${stats.weeklyTicketMsgs || stats.totalTicketMsgs || 0} adet\`\n` +
                     `• ✅ **Çözülen / Kapatılan:** \`${stats.weeklySolvedTickets || stats.totalTickets || 0} adet\``,
              inline: true
            }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.editReply({ embeds: [userReportEmbed] });
      }

      // 4. /basvuru-yetkili
      if (commandName === 'basvuru-yetkili') {
        const action = interaction.options.getString('islem');
        const role = interaction.options.getRole('rol');
        const data = loadData();

        if (action === 'ekle') {
          if (!role) return interaction.reply({ content: '❌ Lütfen eklemek istediğiniz rolü seçiniz!', ephemeral: true });
          if (!data.staffRoleIds.includes(role.id)) {
            data.staffRoleIds.push(role.id);
            saveData(data);
          }
          return interaction.reply({ content: `✅ ${role} rolü klan başvurusu yetkili listesine eklendi! Artık açılan tüm başvuru odalarını görebilecekler.`, ephemeral: true });
        }

        if (action === 'cikar') {
          if (!role) return interaction.reply({ content: '❌ Lütfen çıkarmak istediğiniz rolü seçiniz!', ephemeral: true });
          data.staffRoleIds = data.staffRoleIds.filter(id => id !== role.id);
          saveData(data);
          return interaction.reply({ content: `✅ ${role} rolü klan başvurusu yetkili listesinden çıkarıldı.`, ephemeral: true });
        }

        if (action === 'liste') {
          if (data.staffRoleIds.length === 0) {
            return interaction.reply({ content: 'ℹ️ Kayıtlı özel bir başvuru yetkili rolü bulunmuyor (Varsayılan olarak Yönetici yetkisine sahip herkes görebilir).', ephemeral: true });
          }
          const roleMentions = data.staffRoleIds.map(id => `• <@&${id}> (\`${id}\`)`).join('\n');
          const listEmbed = new EmbedBuilder()
            .setColor('#8B5CF6')
            .setTitle('🛡️ Kayıtlı Başvuru Yetkili Rolleri')
            .setDescription(`Aşağıdaki rollere sahip tüm üyeler klan başvuru ticket odalarını görebilir ve yönetebilir:\n\n${roleMentions}`)
            .setFooter({ text: FOOTER_TEXT });

          return interaction.reply({ embeds: [listEmbed], ephemeral: true });
        }
      }

      // 5. /ticket-yetkili
      if (commandName === 'ticket-yetkili') {
        const action = interaction.options.getString('islem');
        const role = interaction.options.getRole('rol');
        const data = loadData();

        if (action === 'ekle') {
          if (!role) return interaction.reply({ content: '❌ Lütfen eklemek istediğiniz rolü seçiniz!', ephemeral: true });
          if (!data.ticketStaffRoleIds.includes(role.id)) {
            data.ticketStaffRoleIds.push(role.id);
            saveData(data);
          }
          return interaction.reply({ content: `✅ ${role} rolü Destek / Ticket yetkili listesine eklendi! Artık açılan tüm ticketları görebilecekler.`, ephemeral: true });
        }

        if (action === 'cikar') {
          if (!role) return interaction.reply({ content: '❌ Lütfen çıkarmak istediğiniz rolü seçiniz!', ephemeral: true });
          data.ticketStaffRoleIds = data.ticketStaffRoleIds.filter(id => id !== role.id);
          saveData(data);
          return interaction.reply({ content: `✅ ${role} rolü Destek / Ticket yetkili listesinden çıkarıldı.`, ephemeral: true });
        }

        if (action === 'liste') {
          if (data.ticketStaffRoleIds.length === 0) {
            return interaction.reply({ content: 'ℹ️ Kayıtlı özel bir ticket yetkili rolü bulunmuyor (Varsayılan olarak Yönetici yetkisine sahip herkes görebilir).', ephemeral: true });
          }
          const roleMentions = data.ticketStaffRoleIds.map(id => `• <@&${id}> (\`${id}\`)`).join('\n');
          const listEmbed = new EmbedBuilder()
            .setColor('#3B82F6')
            .setTitle('📩 Kayıtlı Destek & Ticket Yetkili Rolleri')
            .setDescription(`Aşağıdaki rollere sahip tüm üyeler açılan destek ve ticket odalarını görebilir ve yönetebilir:\n\n${roleMentions}`)
            .setFooter({ text: FOOTER_TEXT });

          return interaction.reply({ embeds: [listEmbed], ephemeral: true });
        }
      }

      // 6. /basvuru-kategori
      if (commandName === 'basvuru-kategori') {
        const category = interaction.options.getChannel('kategori');
        const data = loadData();
        data.applyCategoryId = category.id;
        saveData(data);

        return interaction.reply({
          content: `✅ Başvuru odalarının açılacağı kategori başarıyla ayarlandı: **${category.name}**\nArtık tüm yeni klan başvuruları bu kategorinin altında açılacaktır! 📂`,
          ephemeral: true
        });
      }

      // 7. /ticket-kategori
      if (commandName === 'ticket-kategori') {
        const category = interaction.options.getChannel('kategori');
        const data = loadData();
        data.ticketCategoryId = category.id;
        saveData(data);

        return interaction.reply({
          content: `✅ Destek & Ticket odalarının açılacağı kategori başarıyla ayarlandı: **${category.name}**\nArtık tüm yeni ticketlar bu kategorinin altında açılacaktır! 📂`,
          ephemeral: true
        });
      }

      // 8. /hile-rapor
      if (commandName === 'hile-rapor') {
        const targetUser = interaction.options.getUser('aday');
        const cheatType = interaction.options.getString('hile_turu');
        const proofAttachment = interaction.options.getAttachment('kanit_ss');
        const details = interaction.options.getString('aciklama') || 'Anydesk incelemesinde tespit edildi.';

        const guild = interaction.guild;
        const chCheatLog = await getOrCreateCheatLogChannel(guild);

        if (chCheatLog) {
          const cheatEmbed = new EmbedBuilder()
            .setColor('#EF4444')
            .setAuthor({ name: 'Vyron Klan Güvenlik & İnceleme Sistemi', iconURL: guild.iconURL({ dynamic: true }) })
            .setTitle('🚫 HİLE TESPİT EDİLDİ & BAŞVURU REDDEDİLDİ')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
              { name: '👤 Discord Kullanıcısı', value: `${targetUser} (\`${targetUser.tag}\`)`, inline: true },
              { name: '🆔 Discord ID', value: `\`${targetUser.id}\``, inline: true },
              { name: '🌐 Discord Profili', value: `[Profili Aç](https://discord.com/users/${targetUser.id})`, inline: true },
              { name: '⚠️ Tespit Edilen Hile', value: `**${cheatType}**`, inline: true },
              { name: '🛡️ Kontrol Eden Yetkili', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
              { name: '⏰ İşlem Tarihi', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
              { name: '📄 Yetkili Açıklaması / Detay', value: `>>> ${details}`, inline: false }
            )
            .setImage(proofAttachment.url)
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();

          await chCheatLog.send({ embeds: [cheatEmbed] }).catch(() => {});
        }

        try {
          await targetUser.send({
            content: `🚫 Merhaba, Vyron klan başvurunuz Anydesk kontrolü sonucunda **Hile / İhlal (${cheatType})** tespiti nedeniyle reddedilmiştir.`
          });
        } catch (e) {}

        return interaction.reply({
          content: `✅ **Hile raporu ve kanıt SS'i ${chCheatLog || '#hile-log'} kanalına başarıyla aktarıldı!** 📸🛡️`,
          ephemeral: true
        });
      }

      // 9. /turnuva-duyuru
      if (commandName === 'turnuva-duyuru') {
        await interaction.deferReply({ ephemeral: true });

        const eventName = interaction.options.getString('etkinlik_adi');
        const dateTime = interaction.options.getString('tarih_saat');
        const prize = interaction.options.getString('odul');
        const serverIp = interaction.options.getString('sunucu_ip');
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
        const attachedImage = interaction.options.getAttachment('gorsel');
        const extraNote = interaction.options.getString('aciklama') || 'Dün eklenti (plugin) kaynaklı yaşanan aksaklık nedeniyle ertelenen Trap Turnuvamız, bu akşam telafi ödülleriyle birlikte bomba gibi gerçekleşiyor! Tüm savaşçılarımızı bekliyoruz.';
        const pingEveryone = interaction.options.getBoolean('herkese_etiket') ?? true;

        const guild = interaction.guild;
        const attendeesChannel = await getOrCreateTourneyChannel(guild);
        const eventId = `event_${Date.now()}`;

        const tournamentEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setAuthor({
            name: `${guild.name.toUpperCase()} • RESMİ KLAN ETKİNLİĞİ & BÜYÜK TURNUVA`,
            iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL()
          })
          .setTitle(`🏆 〖 ${eventName.toUpperCase()} 〗 🏆`)
          .setDescription(
            `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
            `  ⚔️ **VYRON RESMİ ESPOR ETKİNLİĞİ** ⚔️\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            `>>> ${extraNote.replace(/\\n/g, '\n')}\n\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n` +
            `⏰ **Başlama Zamanı:** 🔥 **${dateTime}**\n` +
            `🌐 **Sunucu IP Adresi:** 🎮 \`${serverIp}\`\n` +
            `🎁 **Büyük Turnuva Ödülü:** 💎 **${prize}**\n` +
            `🚪 **Oyunda Katılım Komutu:** 💡 \`/event join\` *(Zamanı gelince oyunda yazınız)*\n` +
            `📋 **Kayıtlı Liste:** ${attendeesChannel ? `${attendeesChannel}` : '`#turnuva-gelecek-olanlar`'}\n` +
            `👑 **Düzenleyen:** ${interaction.user}\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈`
          )
          .setFooter({ text: `0 Katılımcı Kayıtlı • ${FOOTER_TEXT}` })
          .setTimestamp();

        if (attachedImage && attachedImage.url) {
          tournamentEmbed.setImage(attachedImage.url);
        }

        const eventRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_tourney_register_${eventId}`)
            .setLabel('⚔️ Turnuvaya Katıl (IGN Yaz)')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🔥')
        );

        const contentPing = pingEveryone
          ? `📢 @everyone @here 🏆 **BÜYÜK TRAP TURNUVASI & TELAFİ EVENTİ DUYURUSU!** ⚔️\n*(Detaylar ve IP aşağıdadır)*`
          : undefined;

        const sentMsg = await targetChannel.send({
          content: contentPing,
          embeds: [tournamentEmbed],
          components: [eventRow]
        });

        activeEvents.set(eventId, {
          eventId,
          channelId: targetChannel.id,
          messageId: sentMsg.id,
          attendeesChannelId: attendeesChannel ? attendeesChannel.id : null,
          eventName,
          attendees: new Map()
        });

        return interaction.editReply({
          content: `✅ **Turnuva duyurusu ${targetChannel} kanalına yayınlandı!**\n📋 Katılanların Minecraft adlarının listeleneceği kanal: ${attendeesChannel || '#turnuva-gelecek-olanlar'}`
        });
      }

      // 10. /sunucu-analiz
      if (commandName === 'sunucu-analiz') {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const botMember = await guild.members.fetch(client.user.id);
        const botRole = botMember.roles.highest;

        const roles = guild.roles.cache;
        const clanRole = roles.find(r => r.name.toLowerCase().includes('klan üye') && !r.name.toLowerCase().includes('has'));
        const hasClanRole = roles.find(r => r.name.toLowerCase().includes('has klan'));
        const memberRole = roles.find(r => r.name.toLowerCase().includes('vyron • üye') || (r.name.toLowerCase().includes('üye') && !r.name.toLowerCase().includes('klan')));

        const roleHierarchyWarnings = [];
        if (clanRole && botRole.position <= clanRole.position) {
          roleHierarchyWarnings.push(`⚠️ **${clanRole.name}** rolü botun rolünden (\`${botRole.name}\`) yukarıda! Bot rolünü liste üzerinde yukarı taşıyın.`);
        }
        if (memberRole && botRole.position <= memberRole.position) {
          roleHierarchyWarnings.push(`⚠️ **${memberRole.name}** rolü botun rolünden yukarıda!`);
        }

        const channels = guild.channels.cache;
        const chApply = channels.find(c => c.name.includes('klan-başvuru') || c.name.includes('basvuru'));
        const chTourney = channels.find(c => c.name.includes('turnuva-gelecek') || c.name.includes('turnuva-katilim') || c.name.includes('turnuva-kayit'));
        const chCleanLog = channels.find(c => c.name.includes('temiz-log') || c.name.includes('onay-log'));
        const chCheatLog = channels.find(c => c.name.includes('hile-log') || c.name.includes('kont-edilen') || c.name.includes('kont-log'));
        const chVerify = channels.find(c => c.name.includes('doğrulama') || c.name.includes('dogrulama') || c.name.includes('kayıt') || c.name.includes('giris'));
        const chTicket = channels.find(c => c.name.includes('destek') || c.name.includes('ticket'));
        const chAboneLog = channels.find(c => c.name.includes('abone-kanit') || c.name.includes('abone-log') || c.name.includes('abone'));

        const actionItems = [];

        if (chApply) {
          actionItems.push(`• **Klan Başvuru Kanalı:** ${chApply} (Mevcut)`);
        } else {
          actionItems.push('• ⚔️ **#klan-başvuru** kanalı yok (Otomatik oluşturulacak)');
        }

        if (chTourney) {
          actionItems.push(`• **Turnuva Katılımcı Listesi:** ${chTourney} (Mevcut)`);
        } else {
          actionItems.push('• 🏆 **#🏆・turnuva-gelecek-olanlar** kanalı yok (Otomatik oluşturulacak)');
        }

        if (chCleanLog) {
          actionItems.push(`• **Yönetici Temiz Log:** ${chCleanLog} (Mevcut)`);
        } else {
          actionItems.push('• 🔒 **#✅・temiz-log** kanalı yok (Yöneticiye özel açılacak)');
        }

        if (chCheatLog) {
          actionItems.push(`• **Yönetici Hile Log:** ${chCheatLog} (Mevcut)`);
        } else {
          actionItems.push('• 🔒 **#🚫・hile-log** kanalı yok (Yöneticiye özel açılacak)');
        }

        if (chAboneLog) {
          actionItems.push(`• **Abone Kanıt Kanalı:** ${chAboneLog} (Mevcut)`);
        } else {
          actionItems.push('• 🔴 **#🌌・abone-kanit** kanalı yok (Otomatik oluşturulacak)');
        }

        if (chVerify) {
          actionItems.push(`• **Doğrulama Kanalı:** ${chVerify} (Mevcut)`);
        } else {
          actionItems.push('• 🛡️ **#doğrulama** kanalı yok (Otomatik oluşturulacak)');
        }

        if (chTicket) {
          actionItems.push(`• **Destek Kanalı:** ${chTicket} (Mevcut)`);
        } else {
          actionItems.push('• 📩 **#destek-talebi** kanalı yok (Otomatik oluşturulacak)');
        }

        const totalMembers = guild.memberCount;
        const clanMembersCount = clanRole ? clanRole.members.size : 0;
        const hasClanCount = hasClanRole ? hasClanRole.members.size : 0;

        const reportEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle(`🛡️ ${guild.name} - Sunucu & Güvenlik Analiz Raporu`)
          .setDescription(
            `Merhaba <@${interaction.user.id}>! Sunucunuzun mevcut kanalları, rolleri ve bot izinleri tarandı.\n\n` +
            `Aşağıdaki **"⚡ Eksikleri Otomatik Tamamla / Kur"** butonuna basarak eksik olan tüm kanalları otomatik açtırabilir ve panellerini anında kurdurabilirsiniz!`
          )
          .addFields(
            {
              name: '📊 Kadro & Üye İstatistikleri',
              value: `• **Toplam Üye:** \`${totalMembers}\`\n• **Klan Savaşçısı:** \`${clanMembersCount}\`\n• **Has Klan Üye:** \`${hasClanCount}\`\n• **Toplam Kanal / Rol:** \`${channels.size}\` Kanal / \`${roles.size}\` Rol`,
              inline: false
            },
            {
              name: '🛡️ Rol Hiyerarşisi Durumu',
              value: roleHierarchyWarnings.length > 0 ? roleHierarchyWarnings.join('\n') : '✅ **Mükemmel!** Botun rol yetkisi klan ve üye rollerinin üzerinde.',
              inline: false
            },
            {
              name: '🔍 Tespit Edilen Log & Panel Kanalları',
              value: `• **Turnuva Katılım:** ${chTourney ? `✅ ${chTourney}` : '❌ Yok (Açılacak)'}\n• **Abone Kanıt:** ${chAboneLog ? `✅ ${chAboneLog}` : '❌ Yok (Açılacak)'}\n• **Klan Başvuru:** ${chApply ? `✅ ${chApply}` : '❌ Yok'}\n• **Temiz Log:** ${chCleanLog ? `✅ ${chCleanLog}` : '🔒 Yok (Açılacak)'}\n• **Hile Log:** ${chCheatLog ? `✅ ${chCheatLog}` : '🔒 Yok (Açılacak)'}\n• **Doğrulama:** ${chVerify ? `✅ ${chVerify}` : '❌ Yok'}\n• **Destek:** ${chTicket ? `✅ ${chTicket}` : '❌ Yok'}`,
              inline: false
            },
            {
              name: '🚀 Otomatik Kurulacak Sistemler',
              value: actionItems.join('\n'),
              inline: false
            }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const autoFixRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_autofix_missing_${guild.id}`)
            .setLabel('⚡ Eksikleri Otomatik Tamamla / Kur')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🛠️')
        );

        try {
          await interaction.user.send({ embeds: [reportEmbed], components: [autoFixRow] });
          return interaction.editReply({
            content: `✅ **Sunucu analiz raporunuz hazırlandı ve DM kutunuza gönderildi!** 📬\n(DM kutunuzdaki yeşil butona basarak eksik kanalları ve panelleri tek tıkla kurabilirsiniz).`
          });
        } catch (dmErr) {
          return interaction.editReply({
            content: `⚠️ **DM kutunuz kapalı olduğu için raporu buraya bırakıyorum:**`,
            embeds: [reportEmbed],
            components: [autoFixRow]
          });
        }
      }

      // 11. /basvuru-kur
      if (commandName === 'basvuru-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const clanRole = interaction.options.getRole('klan_rolu');
        const category = interaction.options.getChannel('kategori');

        const data = loadData();
        data.clanRoleId = clanRole.id;
        if (category) data.applyCategoryId = category.id;
        saveData(data);

        const applyEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle(`⚔️ ${interaction.guild.name} - Klan Başvuru Paneli`)
          .setDescription(
            `Vyron klanımıza katılmak ve klan savaşlarında yer almak ister misiniz?\n\n` +
            `📌 **Klan Alım & Kontrol Süreci:**\n` +
            `1️⃣ Aşağıdaki **"⚔️ Klan Başvurusu Yap"** butonuna basarak formu doldurun.\n` +
            `2️⃣ Formu gönderdiğiniz an adınıza özel gizli **Başvuru Ticket Odası** açılır.\n` +
            `3️⃣ Yetkililerimiz odanızdan sizi **Anydesk Kontrolüne** çağırır ve inceleme yapar.\n` +
            `4️⃣ Kontrolden başarıyla geçen oyunculara **${clanRole}** rolü tanımlanır!\n\n` +
            `👇 Başvurmak için butona basınız.`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const applyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_open_apply_default')
            .setLabel('⚔️ Klan Başvurusu Yap')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
        );

        await targetChannel.send({ embeds: [applyEmbed], components: [applyRow] });

        return interaction.reply({
          content: `✅ Klan başvuru paneli ${targetChannel} kanalına kuruldu!\n📁 **Kategori:** ${category ? category.name : 'Otomatik・Destek Kategorisi'}\n💡 *(Yetkili rollerini eklemek için /basvuru-yetkili islem:ekle rol:... komutunu kullanabilirsiniz)*`,
          ephemeral: true
        });
      }

      // 12. /ticket-kur
      if (commandName === 'ticket-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const category = interaction.options.getChannel('kategori');

        if (category) {
          const data = loadData();
          data.ticketCategoryId = category.id;
          saveData(data);
        }

        const ticketMenuEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setTitle(`📩 ${interaction.guild.name} - Destek & İletişim Paneli`)
          .setDescription(
            `Aşağıdaki açılır menüden açmak istediğiniz **talep kategorisini** seçiniz.\n` +
            `Talebinize göre yetkili ekibimiz sizinle özel odanızda ilgilenecektir.\n\n` +
            `🤝 **Partnerlik:** Partnerlik görüşmeleri için.\n` +
            `🎁 **Çekiliş:** Çekiliş ödülü teslimi veya sponsorluk.\n` +
            `📢 **Reklam:** Sunucu içi reklam satın alma & anlaşmalar.\n` +
            `🚀 **İnvite & Boost:** Davet ve Takviye ödüllerini talep etme.\n` +
            `📩 **Genel Destek:** Sorular, öneriler ve şikayetler.\n` +
            `❓ **Diğer:** Diğer tüm özel konular ve talepleriniz için.\n\n` +
            `*(⚠️ Klan başvurusu yapacaksanız lütfen #klan-başvuru kanalını kullanınız).*`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`ticket_select_main_${category ? category.id : 'none'}`)
          .setPlaceholder('📂 Bir kategori seçiniz...')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Partnerlik').setDescription('Partnerlik İçin Tıklayınız.').setValue('partnerlik').setEmoji('🤝'),
            new StringSelectMenuOptionBuilder().setLabel('Çekiliş').setDescription('Çekilişi Almak İçin Tıklayınız.').setValue('cekilis').setEmoji('🎁'),
            new StringSelectMenuOptionBuilder().setLabel('Reklam').setDescription('Reklam Satın Almak İstiyorsanız Tıklayınız.').setValue('reklam').setEmoji('📢'),
            new StringSelectMenuOptionBuilder().setLabel('İnvite & Boost').setDescription('İnvite Veya Boost Ödülünüzü Almak İçin Tıklayınız.').setValue('boost').setEmoji('🚀'),
            new StringSelectMenuOptionBuilder().setLabel('Genel Destek').setDescription('Genel soru, öneri ve yardım talepleri için.').setValue('destek').setEmoji('📩'),
            new StringSelectMenuOptionBuilder().setLabel('Diğer').setDescription('Diğer tüm konular ve talepleriniz için.').setValue('diger').setEmoji('❓')
          );

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);

        await targetChannel.send({ embeds: [ticketMenuEmbed], components: [selectRow] });
        return interaction.reply({
          content: `✅ Kategorili Destek paneli ${targetChannel} kanalına kuruldu!\n📁 **Kategori:** ${category ? category.name : 'Otomatik・Destek Kategorisi'}\n💡 *(Yetkili rollerini eklemek için /ticket-yetkili islem:ekle rol:... komutunu kullanabilirsiniz)*`,
          ephemeral: true
        });
      }

      // 13. /duyuru
      if (commandName === 'duyuru') {
        const channel = interaction.options.getChannel('kanal');
        const title = interaction.options.getString('baslik');
        const message = interaction.options.getString('mesaj');
        const theme = interaction.options.getString('tema') || 'royal';
        const attachedImage = interaction.options.getAttachment('gorsel');
        const pingEveryone = interaction.options.getBoolean('herkese_etiket') ?? false;

        let themeColor = '#8B5CF6';
        let themeBadge = '👑 RESMİ KLAN BİLDİRİSİ';
        let themeIcon = '👑';
        let bannerText = 'VYRON ROYAL ANNOUNCEMENT';

        if (theme === 'war') {
          themeColor = '#EF4444';
          themeBadge = '⚔️ KRİTİK SAVAŞ & OPERASYON';
          themeIcon = '🔥';
          bannerText = 'VYRON WARZONE DISPATCH';
        } else if (theme === 'cyber') {
          themeColor = '#00F0FF';
          themeBadge = '⚡ SİSTEM & ÖNEMLİ GÜNCELLEME';
          themeIcon = '⚡';
          bannerText = 'VYRON SYSTEM UPDATE';
        } else if (theme === 'gold') {
          themeColor = '#F59E0B';
          themeBadge = '🏆 BÜYÜK TURNUVA & ÖDÜL';
          themeIcon = '🌟';
          bannerText = 'VYRON CHAMPIONSHIP EVENT';
        } else if (theme === 'shield') {
          themeColor = '#10B981';
          themeBadge = '🛡️ GÜVENLİK & TOPLULUK';
          themeIcon = '💠';
          bannerText = 'VYRON SECURITY & PROTOCOL';
        }

        const formattedText = message.replace(/\\n/g, '\n');
        const ackId = `ack_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        activeAnnouncementAcks.set(ackId, new Set());

        const epicAnnouncementEmbed = new EmbedBuilder()
          .setColor(themeColor)
          .setAuthor({
            name: `${interaction.guild.name.toUpperCase()} • ${themeBadge}`,
            iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL()
          })
          .setTitle(`${themeIcon} 〖 ${title.toUpperCase()} 〗 ${themeIcon}`)
          .setDescription(
            `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
            `  ✦ **${bannerText}** ✦\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            `>>> ${formattedText}\n\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n` +
            `👑 **Yetkili:** ${interaction.user} • 🏷️ **Tür:** \`${themeBadge}\`\n` +
            `⏰ **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Resmi Duyuru Sistemi` })
          .setTimestamp();

        if (attachedImage && attachedImage.url) {
          epicAnnouncementEmbed.setImage(attachedImage.url);
        }

        const ackRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_announcement_ack_${ackId}`)
            .setLabel('👍 Okudum & Onayladım (0)')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💎')
        );

        const contentPing = pingEveryone
          ? `📢 @everyone ⚡ **DİKKAT! YENİ RESMİ VYRON DUYURUSU YAYINLANDI!** ⚔️`
          : undefined;

        await channel.send({
          content: contentPing,
          embeds: [epicAnnouncementEmbed],
          components: [ackRow]
        });

        return interaction.reply({ content: `✅ Şekilli ve havalı duyuru ${channel} kanalına başarıyla yayınlandı! 🚀`, ephemeral: true });
      }

      // 14. /haftanin-oyuncusu
      if (commandName === 'haftanin-oyuncusu') {
        const category = interaction.options.getString('kategori');
        const targetUser = interaction.options.getUser('oyuncu');
        const reason = interaction.options.getString('sebep') || 'Hafta boyunca gösterdiği üstün klan performansı ve savaş yeteneği!';

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ Oyuncu sunucuda bulunamadı!', ephemeral: true });

        const isTrap = category === 'trapci';
        const roleName = isTrap ? 'Vyron • Haftanın Trapcisi' : 'Vyron • Haftanın Elytracısı';
        const roleEmoji = isTrap ? '🔥' : '🦅';
        const roleColor = isTrap ? '#F97316' : '#06B6D4';

        const targetRole = interaction.guild.roles.cache.find(r => {
          const n = r.name.toLowerCase();
          return isTrap ? (n.includes('trapci') || n.includes('trap')) : (n.includes('elytrac') || n.includes('elytra'));
        });
        
        if (!targetRole) {
          return interaction.reply({
            content: `❌ Sunucuda **${roleName}** rolü bulunamadı! Lütfen sunucu ayarlarında bu rolün olduğundan emin olun.`,
            ephemeral: true
          });
        }

        for (const [memberId, m] of targetRole.members) {
          if (memberId !== member.id) {
            await m.roles.remove(targetRole).catch(() => {});
          }
        }
        await member.roles.add(targetRole).catch(() => {});

        const awardEmbed = new EmbedBuilder()
          .setColor(roleColor)
          .setAuthor({ name: `${interaction.guild.name} • Haftanın En İyileri`, iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle(`${roleEmoji} 〖 HAFTANIN OYUNCUSU SEÇİLDİ 〗 ${roleEmoji}`)
          .setDescription(
            `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
            `  👑 **${roleName.toUpperCase()}** 👑\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            `Tebrikler ${member}! Bu hafta Vyron klanımızda sergilediğin üstün mücadele ve yetenekle bu unvanı kazandın! ⚔️💎\n\n` +
            `🏆 **Ödüllendirilen Savaşçı:** ${member} (\`${targetUser.tag}\`)\n` +
            `🎖️ **Kazanılan Özel Rol:** ${targetRole}\n` +
            `👑 **Ödülü Takdim Eden:** ${interaction.user}\n` +
            `⏰ **Tarih:** <t:${Math.floor(Date.now() / 1000)}:D>\n\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n` +
            `📜 **Haftanın Başarı Notu:**\n>>> ${reason}`
          )
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .setFooter({ text: `${FOOTER_TEXT} • Vyron Hall of Fame` })
          .setTimestamp();

        const announceChannel = interaction.guild.channels.cache.find(c => c.name.includes('klan-duyuru') || c.name.includes('duyurular')) || interaction.channel;
        await announceChannel.send({ content: `📢 🏆 ${member} **${roleName}** unvanına layık görüldü! Herkes tebrik etsin! 🎉`, embeds: [awardEmbed] });

        return interaction.reply({ content: `✅ ${member} kullanıcısına **${roleName}** unvanı verildi ve şık duyurusu geçildi!`, ephemeral: true });
      }



      // 16. /kilit
      if (commandName === 'kilit') {
        const action = interaction.options.getString('durum');
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
        const everyone = interaction.guild.roles.everyone;

        if (action === 'lock') {
          await targetChannel.permissionOverwrites.edit(everyone, { SendMessages: false });
          const lockEmbed = new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🔒 Kanal Kilitlendi')
            .setDescription(`Bu kanal yetkili (${interaction.user}) tarafından geçici olarak **yazmaya kapatılmıştır.**`)
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();
          await targetChannel.send({ embeds: [lockEmbed] });
          return interaction.reply({ content: `🔒 ${targetChannel} başarıyla kilitlendi!`, ephemeral: true });
        } else {
          await targetChannel.permissionOverwrites.edit(everyone, { SendMessages: null });
          const unlockEmbed = new EmbedBuilder()
            .setColor('#10B981')
            .setTitle('🔓 Kanal Kilidi Açıldı')
            .setDescription(`Kanal kilidi yetkili (${interaction.user}) tarafından kaldırıldı. Sohbet serbesttir.`)
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();
          await targetChannel.send({ embeds: [unlockEmbed] });
          return interaction.reply({ content: `🔓 ${targetChannel} kilidi açıldı!`, ephemeral: true });
        }
      }

      // 17. /klan-rutbe
      if (commandName === 'klan-rutbe') {
        const targetUser = interaction.options.getUser('kullanici');
        const action = interaction.options.getString('islem');
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) return interaction.reply({ content: '❌ Kullanıcı sunucuda bulunamadı!', ephemeral: true });

        const hasRole = interaction.guild.roles.cache.find(r => r.name.includes('Has Klan'));
        const normalRole = interaction.guild.roles.cache.find(r => r.name.includes('Klan Üye'));

        if (action === 'has_klan') {
          if (hasRole) await member.roles.add(hasRole).catch(() => {});
          if (normalRole) await member.roles.add(normalRole).catch(() => {});
          return interaction.reply({ content: `⭐ ${member} başarıyla **Vyron • Has Klan Üyesi** rütbesine terfi ettirildi!` });
        } else if (action === 'standart_klan') {
          if (hasRole) await member.roles.remove(hasRole).catch(() => {});
          if (normalRole) await member.roles.add(normalRole).catch(() => {});
          return interaction.reply({ content: `⚔️ ${member} **Vyron • Klan Üyesi** yapıldı.` });
        } else if (action === 'cikar') {
          if (hasRole) await member.roles.remove(hasRole).catch(() => {});
          if (normalRole) await member.roles.remove(normalRole).catch(() => {});
          return interaction.reply({ content: `❌ ${member} klandan çıkarıldı ve klan rolleri alındı.` });
        }
      }

      // 18. /cekilis
      if (commandName === 'cekilis') {
        const durationStr = interaction.options.getString('sure');
        const prize = interaction.options.getString('odul');
        const winnerCount = interaction.options.getInteger('kazanan_sayisi') || 1;
        const reqOption = interaction.options.getString('sart') || 'none';
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;

        const durationMs = ms(durationStr);
        if (!durationMs || durationMs < 5000) {
          return interaction.reply({ content: '❌ Geçersiz süre (Örn: `10s`, `30s`, `5m`, `1h`, `1d`). Minimum 5 saniye olmalıdır.', ephemeral: true });
        }

        let reqBadge = '🌐 Şartsız (Herkes Katılabilir)';
        if (reqOption === 'tag') reqBadge = '🏷️ Şart: @Vyron • Tag (Klan Tagı)';
        else if (reqOption === 'abone') reqBadge = '🔴 Şart: @Vyron • Abone (YouTube)';
        else if (reqOption === 'both') reqBadge = '⭐ Şart: Hem Taglı Hem Abone';

        const endTime = Math.floor((Date.now() + durationMs) / 1000);
        const giveawayId = `gw_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const giveawayEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setTitle(`🎉 ÇEKİLİŞ BAŞLADI: ${prize}`)
          .setDescription(
            `Katılmak için aşağıdaki **"🎉 Katıl"** butonuna basınız!\n\n` +
            `🎁 **Ödül:** **${prize}**\n` +
            `👑 **Kazanan Sayısı:** **${winnerCount}**\n` +
            `🔒 **Katılım Şartı:** \`${reqBadge}\`\n` +
            `⏳ **Kalan Süre:** <t:${endTime}:R> (<t:${endTime}:f>)\n` +
            `📢 **Düzenleyen:** ${interaction.user}`
          )
          .setFooter({ text: `0 Katılımcı • ${FOOTER_TEXT}` })
          .setTimestamp(new Date(Date.now() + durationMs));

        const joinBtn = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`gw_join_${giveawayId}`)
            .setLabel('🎉 Katıl (0)')
            .setStyle(ButtonStyle.Success)
        );

        const giveawayMsg = await targetChannel.send({
          content: '🎉 **YENİ ÇEKİLİŞ BAŞLADI!** 🎉',
          embeds: [giveawayEmbed],
          components: [joinBtn]
        });

        activeGiveaways.set(giveawayId, {
          giveawayId,
          channelId: targetChannel.id,
          messageId: giveawayMsg.id,
          prize,
          winnerCount,
          reqOption,
          endTime,
          hostId: interaction.user.id,
          participants: new Set()
        });

        await interaction.reply({ content: `✅ Çekiliş başarıyla ${targetChannel} kanalında başlatıldı! (Süre: ${durationStr} | Şart: ${reqBadge})`, ephemeral: true });

        setTimeout(async () => {
          const gw = activeGiveaways.get(giveawayId);
          if (!gw) return;

          try {
            const fetchChannel = await client.channels.fetch(gw.channelId).catch(() => null);
            if (!fetchChannel) return;

            const fetchMsg = await fetchChannel.messages.fetch(gw.messageId).catch(() => null);
            const participantArray = Array.from(gw.participants);

            if (participantArray.length === 0) {
              if (fetchMsg) {
                const cancelEmbed = new EmbedBuilder()
                  .setColor('#EF4444')
                  .setTitle(`🎉 ÇEKİLİŞ SONA ERDİ: ${gw.prize}`)
                  .setDescription(`❌ Yeterli katılım olmadığı için kazanan belirlenemedi.\n🎁 **Ödül:** ${gw.prize}`)
                  .setFooter({ text: FOOTER_TEXT })
                  .setTimestamp();

                await fetchMsg.edit({ content: '⚠️ **ÇEKİLİŞ İPTAL EDİLDİ!**', embeds: [cancelEmbed], components: [] }).catch(() => {});
              }
              await fetchChannel.send(`⚠️ **Çekiliş Bitti:** [**${gw.prize}**] çekilişine hiç katılım olmadığı için kazanan seçilemedi.`);
            } else {
              const shuffled = [...participantArray].sort(() => 0.5 - Math.random());
              const winners = shuffled.slice(0, Math.min(gw.winnerCount, participantArray.length));
              const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

              const endedEmbed = new EmbedBuilder()
                .setColor('#10B981')
                .setTitle(`🎉 ÇEKİLİŞ SONUÇLANDI: ${gw.prize}`)
                .setDescription(
                  `👑 **Kazanan(lar):** ${winnerMentions}\n` +
                  `🎁 **Kazanılan Ödül:** **${gw.prize}**\n` +
                  `👥 **Toplam Katılımcı:** ${participantArray.length}\n` +
                  `📢 **Düzenleyen:** <@${gw.hostId}>`
                )
                .setFooter({ text: FOOTER_TEXT })
                .setTimestamp();

              if (fetchMsg) {
                await fetchMsg.edit({
                  content: '🎉 **ÇEKİLİŞ SONUÇLANDI!** 🎉',
                  embeds: [endedEmbed],
                  components: []
                }).catch(() => {});
              }

              await fetchChannel.send({
                content: `🥳 🎉 **TEBRİKLER** ${winnerMentions}!\n🎁 **${gw.prize}** çekilişini kazandınız!\nLütfen ödülünüzü almak için yetkili ekiple iletişime geçiniz.`
              });
            }
          } catch (err) {
            console.error('Çekiliş sonlandırılırken hata:', err);
          }
        }, durationMs);
        return;
      }

      // 19. /reroll
      if (commandName === 'reroll') {
        const queryId = interaction.options.getString('cekilis_id');
        let targetGw = null;

        for (const [id, data] of activeGiveaways) {
          if (id === queryId || data.messageId === queryId) {
            targetGw = data;
            break;
          }
        }

        if (!targetGw || targetGw.participants.size === 0) {
          return interaction.reply({ content: '❌ Çekiliş bulunamadı veya katılımcı yok!', ephemeral: true });
        }

        const participantArray = Array.from(targetGw.participants);
        const randomWinner = participantArray[Math.floor(Math.random() * participantArray.length)];

        const channel = await client.channels.fetch(targetGw.channelId).catch(() => null);
        if (channel) {
          await channel.send(`🔄 **YENİDEN ÇEKİLİŞ:** Tebrikler <@${randomWinner}>! **${targetGw.prize}** çekilişinin yeni kazananı oldunuz! 🥳`);
        }

        return interaction.reply({ content: `✅ Yeni kazanan belirlendi: <@${randomWinner}>`, ephemeral: true });
      }

      // 20. /anket
      if (commandName === 'anket') {
        const question = interaction.options.getString('soru');
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;
        const pollId = `poll_${Date.now()}`;

        const pollEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle('📊 RESMİ VYRON ANKETİ')
          .setDescription(
            `**${question}**\n\n` +
            `👍 **Evet:** \`0 Oy (%0)\`\n` +
            `👎 **Hayır:** \`0 Oy (%0)\`\n\n` +
            `Katılmak için aşağıdaki butonlara basınız!`
          )
          .setFooter({ text: `ID: ${pollId} • ${FOOTER_TEXT}` })
          .setTimestamp();

        const pollRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`poll_vote_yes_${pollId}`).setLabel('👍 Evet (0)').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`poll_vote_no_${pollId}`).setLabel('👎 Hayır (0)').setStyle(ButtonStyle.Danger)
        );

        const pollMsg = await targetChannel.send({ embeds: [pollEmbed], components: [pollRow] });

        activePolls.set(pollId, {
          pollId,
          question,
          messageId: pollMsg.id,
          channelId: targetChannel.id,
          yesVoters: new Set(),
          noVoters: new Set()
        });

        return interaction.reply({ content: `✅ Canlı sayaçlı anket ${targetChannel} kanalında başlatıldı!`, ephemeral: true });
      }

      // 21. /mute
      if (commandName === 'mute') {
        const targetUser = interaction.options.getUser('kullanici');
        const durationStr = interaction.options.getString('sure');
        const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';

        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ Kullanıcı sunucuda bulunamadı!', ephemeral: true });

        const durationMs = ms(durationStr);
        if (!durationMs || durationMs < 5000 || durationMs > ms('28d')) {
          return interaction.reply({ content: '❌ Geçersiz süre! (Minimum 5s, maksimum 28d olmalıdır. Örn: `10m`, `2h`, `1d`)', ephemeral: true });
        }

        await member.timeout(durationMs, reason).catch(err => {
          return interaction.reply({ content: `❌ Susturma uygulanamadı: Botun yetkisi bu üyeden düşük olabilir!`, ephemeral: true });
        });

        const logChannel = interaction.guild.channels.cache.find(c => c.name.includes('ceza-kayıt'));
        if (logChannel) {
          const muteLog = new EmbedBuilder()
            .setColor('#F59E0B')
            .setTitle('🔇 Kullanıcı Susturuldu (Timeout)')
            .addFields(
              { name: '👤 Susturulan', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
              { name: '🛡️ Yetkili', value: `${interaction.user.tag}`, inline: true },
              { name: '⏳ Süre', value: `${durationStr}`, inline: true },
              { name: '📄 Sebep', value: `>>> ${reason}`, inline: false }
            )
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();
          await logChannel.send({ embeds: [muteLog] }).catch(() => {});
        }

        return interaction.reply({ content: `✅ ${member} kullanıcısı **${durationStr}** süreyle susturuldu. (Sebep: ${reason})` });
      }

      // 22. /unmute
      if (commandName === 'unmute') {
        const targetUser = interaction.options.getUser('kullanici');
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ Kullanıcı bulunamadı!', ephemeral: true });

        await member.timeout(null, 'Susturma kaldırıldı').catch(() => {});
        return interaction.reply({ content: `✅ ${member} kullanıcısının susturması kaldırıldı.` });
      }

      // 23. /kick
      if (commandName === 'kick') {
        const targetUser = interaction.options.getUser('kullanici');
        const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ Kullanıcı bulunamadı!', ephemeral: true });

        await member.kick(reason).catch(err => {
          return interaction.reply({ content: `❌ Atma işlemi başarısız: Botun yetkisi yetersiz!`, ephemeral: true });
        });

        const logChannel = interaction.guild.channels.cache.find(c => c.name.includes('ceza-kayıt'));
        if (logChannel) {
          const kickLog = new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('👢 Kullanıcı Sunucudan Atıldı (Kick)')
            .addFields(
              { name: '👤 Atılan', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
              { name: '🛡️ Yetkili', value: `${interaction.user.tag}`, inline: true },
              { name: '📄 Sebep', value: `>>> ${reason}`, inline: false }
            )
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();
          await logChannel.send({ embeds: [kickLog] }).catch(() => {});
        }

        return interaction.reply({ content: `👢 **${targetUser.tag}** sunucudan atıldı! (Sebep: ${reason})` });
      }

      // 24. /ban
      if (commandName === 'ban') {
        const targetUser = interaction.options.getUser('kullanici');
        const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi.';

        await interaction.guild.members.ban(targetUser.id, { reason }).catch(err => {
          return interaction.reply({ content: `❌ Yasaklama işlemi başarısız: Botun yetkisi yetersiz!`, ephemeral: true });
        });

        const logChannel = interaction.guild.channels.cache.find(c => c.name.includes('ceza-kayıt'));
        if (logChannel) {
          const banLog = new EmbedBuilder()
            .setColor('#B91C1C')
            .setTitle('🔨 Kullanıcı Yasaklandı (Ban)')
            .addFields(
              { name: '👤 Yasaklanan', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
              { name: '🛡️ Yetkili', value: `${interaction.user.tag}`, inline: true },
              { name: '📄 Sebep', value: `>>> ${reason}`, inline: false }
            )
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();
          await logChannel.send({ embeds: [banLog] }).catch(() => {});
        }

        return interaction.reply({ content: `🔨 **${targetUser.tag}** sunucudan yasaklandı! (Sebep: ${reason})` });
      }

      // 25. /kullanici-bilgi
      if (commandName === 'kullanici-bilgi') {
        const user = interaction.options.getUser('kullanici') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        const infoEmbed = new EmbedBuilder()
          .setColor('#6366F1')
          .setTitle(`👤 Kullanıcı Bilgisi: ${user.tag}`)
          .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: '🆔 Kullanıcı ID', value: `\`${user.id}\``, inline: true },
            { name: '📅 Hesap Kuruluş', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: '📥 Sunucuya Katılış', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Bilinmiyor', inline: true },
            { name: '🎭 Rolleri', value: member ? member.roles.cache.filter(r => r.name !== '@everyone').map(r => `${r}`).join(', ') || 'Rolü yok' : 'Yok', inline: false }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.reply({ embeds: [infoEmbed], ephemeral: true });
      }

      // 26. /sunucu-bilgi
      if (commandName === 'sunucu-bilgi') {
        const guild = interaction.guild;
        const totalMembers = guild.memberCount;
        const clanMembers = guild.roles.cache.find(r => r.name.includes('Klan Üye'))?.members.size || 0;

        const serverEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle(`🏛️ ${guild.name} - Sunucu & Klan İstatistikleri`)
          .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: '👑 Sunucu Sahibi', value: `<@${guild.ownerId}>`, inline: true },
            { name: '👥 Toplam Üye', value: `**${totalMembers}**`, inline: true },
            { name: '⚔️ Klan Üye Sayısı', value: `**${clanMembers}**`, inline: true },
            { name: '📂 Toplam Kanal', value: `**${guild.channels.cache.size}**`, inline: true },
            { name: '🎭 Toplam Rol', value: `**${guild.roles.cache.size}**`, inline: true },
            { name: '📅 Kuruluş Tarihi', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.reply({ embeds: [serverEmbed], ephemeral: true });
      }

      // 27. /dogrulama-kur
      if (commandName === 'dogrulama-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const role = interaction.options.getRole('verilecek_rol');

        const verifyEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle(`🛡️ ${interaction.guild.name} Doğrulama`)
          .setDescription('Sunucumuza hoş geldiniz! Kanallara tam erişim kazanmak için aşağıdaki butona basınız.')
          .setFooter({ text: FOOTER_TEXT });

        const verifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`verify_role_${role.id}`)
            .setLabel('✅ Doğrula ve Giriş Yap')
            .setStyle(ButtonStyle.Success)
        );

        await targetChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });
        return interaction.reply({ content: `✅ Doğrulama paneli kuruldu!`, ephemeral: true });
      }

      // 28. /sil
      if (commandName === 'sil') {
        const amount = interaction.options.getInteger('miktar');
        await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({ content: `🧹 **${amount}** mesaj silindi!`, ephemeral: true });
      }



      // 33. /gear-kanal
      if (commandName === 'gear-kanal') {
        const targetChannel = interaction.options.getChannel('kanal');
        const data = loadData();
        data.gearLogChannelId = targetChannel.id;
        saveData(data);

        return interaction.reply({
          content: `✅ **Gear teslimat kanalı başarıyla ayarlandı:** ${targetChannel}\n` +
                   `Artık yetkililer bu kanala gear teslimat SS'i attığında bot bunu otomatik tespit edip **+15 Puan** yetkili mesaisine ekleyecektir! 🎒⚔️`,
          ephemeral: true
        });
      }

      // 34. /yetkili-terfi
      if (commandName === 'yetkili-terfi') {
        await interaction.deferReply({ ephemeral: false });
        const targetUser = interaction.options.getUser('yetkili');
        const actionType = interaction.options.getString('islem');
        const newRole = interaction.options.getRole('yeni_rol');
        const reason = interaction.options.getString('sebep') || 'Yönetim kurulu değerlendirmesi ve haftalık karne performansı.';

        const guild = interaction.guild;
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
          return interaction.editReply({ content: '❌ Sunucuda böyle bir yetkili bulunamadı!' });
        }

        await targetMember.roles.add(newRole).catch(() => {});

        const isUp = actionType === 'up';
        const terfiEmbed = new EmbedBuilder()
          .setColor(isUp ? '#10B981' : '#EF4444')
          .setAuthor({ name: `${guild.name.toUpperCase()} • YÖNETİM KURULU KARARI`, iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle(isUp ? '⭐ 〖 RESMİ YETKİLİ TERFİ (PERM UP) 〗 ⭐' : '🔻 〖 DİSİPLİN & RÜTBE DÜŞÜRME (PERM DOWN) 〗 🔻')
          .setDescription(
            `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
            `  ${isUp ? '🎉 **YETKİ YÜKSELTME BİLDİRİSİ**' : '⚠️ **DİSİPLİN VE İHTAR KARARI**'}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            `Sayın ${targetMember} (\`${targetUser.tag}\`),\n` +
            `Klan yönetimimiz tarafından gerçekleştirilen denetim sonucunda yetki durumunuz güncellenmiştir:\n\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n` +
            `📌 **İşlem Türü:** ${isUp ? '🟢 **PERM UP (Yetki Yükseltme)**' : '🔴 **PERM DOWN (Yetki Düşürme / İhtar)**'}\n` +
            `🎖️ **Yeni Rütbe / Rol:** ${newRole}\n` +
            `🛡️ **İşlemi Yapan Yönetici:** ${interaction.user}\n` +
            `⏰ **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n\n` +
            `📝 **Gerekçe & Değerlendirme:**\n>>> ${reason}`
          )
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .setFooter({ text: `${FOOTER_TEXT} • Yetkili Yönetim Sistemi` })
          .setTimestamp();

        const chLog = guild.channels.cache.find(c => c.name.includes('yetkili-log') || c.name.includes('yetkili-duyuru') || c.name.includes('terfi-log')) || interaction.channel;
        if (chLog && chLog.id !== interaction.channelId) {
          await chLog.send({
            content: `📢 ${targetMember} ${isUp ? '🎉 **Tebrikler, yeni rütben hayırlı olsun!**' : '⚠️ **Lütfen mesai ve kurallara dikkat ediniz!**'}`,
            embeds: [terfiEmbed]
          }).catch(() => {});
        }

        try {
          await targetUser.send({
            content: `📢 **${guild.name}** klanında yetki rütbeniz güncellendi!`,
            embeds: [terfiEmbed]
          });
        } catch (e) {}

        return interaction.editReply({ embeds: [terfiEmbed] });
      }

      // 35. /gunluk-rapor
      if (commandName === 'gunluk-rapor') {
        await interaction.deferReply({ ephemeral: true });
        const shouldSendPublic = interaction.options.getBoolean('kanala_gonder') || false;
        const guild = interaction.guild;
        const data = loadData();

        const recapEmbed = await buildDailyStaffRecapEmbed(guild, data);

        if (shouldSendPublic) {
          const chLeaderboard = await getOrCreateStaffLeaderboardChannel(guild);
          const chAnnouncement = guild.channels.cache.find(c =>
            c && c.type === ChannelType.GuildText &&
            (c.name.includes('yetkili-duyuru') || c.name.includes('yetkili-log') || c.name.includes('genel-sohbet') || c.name.includes('duyuru'))
          );

          if (chLeaderboard) {
            await chLeaderboard.send({ content: `📢 @everyone 🌙 **GÜNÜN MESAİSİ TAMAMLANDI & İLK 10 ŞAMPİYON YETKİLİ!**`, embeds: [recapEmbed] }).catch(() => {});
          }
          if (chAnnouncement && chAnnouncement.id !== chLeaderboard?.id) {
            await chAnnouncement.send({ content: `📢 @everyone 🌙 **GÜNÜN MESAİSİ TAMAMLANDI & İLK 10 ŞAMPİYON YETKİLİ!**`, embeds: [recapEmbed] }).catch(() => {});
          }

          return interaction.editReply({
            content: `✅ **Günlük mesai ve şampiyonluk bülteni başarıyla kanallara resmi duyuru olarak gönderildi!** 🌙🏆`,
            embeds: [recapEmbed]
          });
        }

        return interaction.editReply({
          content: `📊 **Günün mesai ve şampiyonluk bülteni önizlemesi:** *(Kanala göndermek için \`kanala_gonder: True\` seçiniz)*`,
          embeds: [recapEmbed]
        });
      }

      // 36. /otomatik-kurulum
      if (commandName === 'otomatik-kurulum') {
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        const result = await autoSetupGuildInfrastructure(guild);

        const setupEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setAuthor({ name: `${guild.name} • Otomatik Altyapı & Panel Kurucu`, iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🚀 KLAN ALTYAPISI & PANELLERİ BAŞARIYLA KURULDU!')
          .setDescription(
            `Sunucunuzun tüm eksik rolleri, kategorileri, log kanalları ve interaktif butonlu panelleri saniyeler içinde otomatik olarak hazırlandı!\n\n` +
            (result.createdItems && result.createdItems.length > 0 
              ? `### 🛠️ Yapılan İşlemler & Kurulan Paneller:\n` + result.createdItems.map(i => `• ${i}`).join('\n') + `\n\n`
              : `✅ *Tüm rol, kategori, kanal ve panelleriniz zaten tam ve eksiksiz durumda!*\n\n`) +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 **Aktif Sistemler:**\n` +
            `• ⚔️ **#klan-başvuru** *(Anydesk Kontrollü Ticket Paneli)*\n` +
            `• 🎫 **#destek-talebi** *(Kategorili Destek Paneli)*\n` +
            `• 🔴 **#abone-kanit** *(Yapay Zeka YouTube SS Okuyucu)*\n` +
            `• 👑 **#yetkili-siralama** *(7/24 Canlı Mesai Tablosu)*\n` +
            `• 🏷️ **#tag-log** & 🎒 **#gear-verilenler-ekip**\n` +
            `• 📢 **#yetkili-duyuru** & 🏆 **#turnuva-gelecek-olanlar**\n\n` +
            `💎 *Artık hiçbir manuel ayar yapmanıza gerek yoktur, bot her şeyi otomatik yönetmektedir!* ⚔️🔥`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Otomatik Bootstrap Motoru` })
          .setTimestamp();

        return interaction.editReply({ embeds: [setupEmbed] });
      }

      // 37. /seviye
      if (commandName === 'seviye') {
        const targetUser = interaction.options.getUser('kullanici') || interaction.user;
        const data = loadData();
        const userLevels = data.userLevels || {};

        const totalXP = userLevels[targetUser.id] || 0;
        const currentLevel = getLevelFromXP(totalXP);
        const currentLvlXP = getXPForCurrentLevel(currentLevel);
        const nextLvlXP = getXPForNextLevel(currentLevel);
        const progressXP = totalXP - currentLvlXP;
        const neededXP = nextLvlXP - currentLvlXP;

        // Sunucu İçi Sıralama Hesabı
        const sortedUsers = Object.entries(userLevels).sort(([, a], [, b]) => b - a);
        const userRankIndex = sortedUsers.findIndex(([uid]) => uid === targetUser.id);
        const rankText = userRankIndex !== -1 ? `#${userRankIndex + 1}` : `#${sortedUsers.length + 1}`;

        const progressBar = generateProgressBar(progressXP, neededXP, 12);

        const levelEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setAuthor({ name: `${targetUser.username} • Seviye & Aktivite Kartı`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
          .setTitle(`🎖️ KLAN İÇİ RÜTBE & SEVİYE KARTI`)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .setDescription(
            `👤 **Kullanıcı:** ${targetUser}\n` +
            `🏆 **Sunucu Sıralaması:** \`${rankText}\` / \`${interaction.guild.memberCount}\` Üye\n` +
            `⭐ **Mevcut Seviye:** \`Level ${currentLevel}\`\n` +
            `📈 **İlerleme Durumu:** ${progressBar}\n` +
            `✨ **Deneyim Puanı (XP):** \`${totalXP.toLocaleString('tr-TR')} XP\` *(Sonraki seviyeye: ${(neededXP - progressXP).toLocaleString('tr-TR')} XP)*\n\n` +
            `💬 *Sohbette mesaj yazarak ve ses odalarında vakit geçirerek XP kazanabilir ve seviyenizi yükseltebilirsiniz!*`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Klan İçi Seviye Motoru` })
          .setTimestamp();

        return interaction.reply({ embeds: [levelEmbed] });
      }

      // 38. /top-seviye
      if (commandName === 'top-seviye') {
        const data = loadData();
        const userLevels = data.userLevels || {};

        const sortedUsers = Object.entries(userLevels).sort(([, a], [, b]) => b - a).slice(0, 10);

        if (sortedUsers.length === 0) {
          return interaction.reply({ content: 'ℹ️ Henüz sunucuda XP kazanmış aktif bir üye bulunmuyor.', ephemeral: true });
        }

        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const leaderboardLines = sortedUsers.map(([userId, xp], index) => {
          const lvl = getLevelFromXP(xp);
          return `${medals[index]} <@${userId}> • **Level ${lvl}** (\`${xp.toLocaleString('tr-TR')} XP\`)`;
        });

        const topEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setAuthor({ name: `${interaction.guild.name} • En Aktif Üyeler`, iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('👑 EN YÜKSEK SEVİYELİ VE AKTİF KLAN ÜYELERİ')
          .setDescription(
            `Sunucumuzda sohbette ve seste en çok vakit geçiren ilk 10 üye:\n\n` +
            leaderboardLines.join('\n\n') +
            `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💡 *Siz de mesaj yazarak ve seste kalarak liderlik tablosuna adınızı yazdırabilirsiniz!*`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Seviye Liderlik Tablosu` })
          .setTimestamp();

        return interaction.reply({ embeds: [topEmbed] });
      }





      // 43. /afk
      if (commandName === 'afk') {
        const reason = interaction.options.getString('sebep') || 'Şu anda meşgulüm / AFK';
        const member = interaction.member;

        userAfkData.set(interaction.user.id, {
          reason,
          timestamp: Date.now(),
          oldNick: member.displayName
        });

        if (member.manageable && !member.displayName.startsWith('[AFK]')) {
          await member.setNickname(`[AFK] ${member.displayName.substring(0, 25)}`).catch(() => {});
        }

        const afkEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setAuthor({ name: 'Vyron Akıllı AFK Sistemi', iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
          .setTitle('🌙 AFK MODUNA GEÇİLDİ')
          .setDescription(
            `${interaction.user}, başarıyla **AFK** moduna geçtiniz!\n\n` +
            `📝 **AFK Sebebi:** \`${reason}\`\n` +
            `💬 *Biri sizi etiketlediğinde bot bu sebebi otomatik bildirecektir. Sohbete mesaj yazdığınızda AFK modu otomatik kapanacaktır.*`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.reply({ embeds: [afkEmbed] });
      }

      // 44. /sicil
      if (commandName === 'sicil') {
        const targetUser = interaction.options.getUser('kullanici');
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        const isBanned = interaction.guild.bans.cache.get(targetUser.id);
        const isMuted = targetMember?.isCommunicationDisabled() || false;
        const muteUntil = isMuted ? targetMember.communicationDisabledUntil : null;

        const sicilEmbed = new EmbedBuilder()
          .setColor(isMuted || isBanned ? '#EF4444' : '#10B981')
          .setAuthor({ name: `${targetUser.username} • Adli Sicil & Disiplin Dosyası`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
          .setTitle('📜 RESMİ KULLANICI DİSİPLİN VE SİCİL KAYDI')
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .setDescription(
            `👤 **Kullanıcı:** ${targetUser} (\`${targetUser.tag}\`)\n` +
            `🆔 **Discord ID:** \`${targetUser.id}\`\n` +
            `📅 **Sunucuya Katılış:** ${targetMember ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>` : '`Sunucuda Değil`'}\n` +
            `📆 **Hesap Oluşturma:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### ⚖️ Güncel Ceza Durumu:\n` +
            `• **Mute / Susturma:** ${isMuted ? `🔴 **Aktif Mute Var** *(Bitiş: <t:${Math.floor(muteUntil.getTime() / 1000)}:R>)*` : '🟢 **Temiz (Aktif ceza yok)**'}\n` +
            `• **Ban / Yasaklama:** ${isBanned ? '🔴 **Yasaklı Üye**' : '🟢 **Yasak Yok**'}\n\n` +
            `💡 *Yetkili ekibi sunucu disiplinini korumak için cezaları otomatik uygular.*`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Disiplin & Güvenlik` })
          .setTimestamp();

        return interaction.reply({ embeds: [sicilEmbed], ephemeral: true });
      }



      // 46. /yavas-mod
      if (commandName === 'yavas-mod') {
        const seconds = interaction.options.getInteger('saniye');
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;

        await targetChannel.setRateLimitPerUser(seconds).catch(() => {});

        const slowEmbed = new EmbedBuilder()
          .setColor(seconds > 0 ? '#F59E0B' : '#10B981')
          .setTitle(seconds > 0 ? '⏳ YAVAŞ MOD ETKİNLEŞTİRİLDİ' : '🚀 YAVAŞ MOD KALDIRILDI')
          .setDescription(
            seconds > 0
              ? `${targetChannel} kanalında mesaj yazma aralığı **${seconds} saniye** olarak ayarlandı.`
              : `${targetChannel} kanalında yavaş mod devre dışı bırakıldı. Sohbet serbesttir!`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.reply({ embeds: [slowEmbed] });
      }



      // 49. /guvenlik-modu
      if (commandName === 'guvenlik-modu') {
        const mode = interaction.options.getString('durum');
        const data = loadData();
        data.securityMode = mode === 'on';
        saveData(data);
        await syncDataToDiscordCloud(interaction.guild);

        const secEmbed = new EmbedBuilder()
          .setColor(mode === 'on' ? '#10B981' : '#EF4444')
          .setTitle(mode === 'on' ? '🛡️ GÜVENLİK KALKANI & ANTİ-RAİD AKTİF!' : '⚠️ GÜVENLİK KALKANI DEVRE DIŞI')
          .setDescription(
            mode === 'on'
              ? `✅ **Anti-Raid & Şüpheli Hesap Kalkanı başarıyla açıldı!**\n• 10 saniyede 5+ hızlı giriş olursa yetkililer anında uyarılır.\n• 7 günden yeni hesaplar loglara kaydedilir.`
              : `⚠️ Güvenlik modu kapatıldı. Sunucu giriş koruması standart moda alındı.`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.reply({ embeds: [secEmbed] });
      }

      // 50. /sunucu-istatistik
      if (commandName === 'sunucu-istatistik') {
        const guild = interaction.guild;
        const totalMembers = guild.memberCount;
        const onlineMembers = guild.members.cache.filter(m => m.presence?.status === 'online' || m.presence?.status === 'dnd' || m.presence?.status === 'idle').size;
        const botCount = guild.members.cache.filter(m => m.user.bot).size;
        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
        const roleCount = guild.roles.cache.size;
        const boostLevel = guild.premiumTier;
        const boostCount = guild.premiumSubscriptionCount || 0;

        const data = loadData();
        const tagRole = data.tagRoleId ? guild.roles.cache.get(data.tagRoleId) : null;
        const tagCount = tagRole ? tagRole.members.size : 0;
        const aboneRole = data.aboneRoleId ? guild.roles.cache.get(data.aboneRoleId) : null;
        const aboneCount = aboneRole ? aboneRole.members.size : 0;

        const statEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setAuthor({ name: `${guild.name} • Canlı Aktivite Dashboardu`, iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('📊 RESMİ KLAN & SUNUCU METRİKLERİ')
          .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
          .setDescription(
            `👑 **Sunucu Sahibi:** <@${guild.ownerId}>\n` +
            `📅 **Sunucu Açılış:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n` +
            `⚡ **Bot Pingi (Gecikme):** \`${client.ws.ping} ms\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `### 👥 Üye ve Aktivite Dağılımı:\n` +
            `• **Toplam Üye:** \`${totalMembers}\`\n` +
            `• **Aktif Üyeler:** \`${onlineMembers}\` *(Online/DND/Idle)*\n` +
            `• **Sistem Botları:** \`${botCount}\`\n\n` +
            `### 🏷️ Klan ve Topluluk Katılımı:\n` +
            `• **Resmi Tag Taşıyanlar:** \`${tagCount} Üye\`\n` +
            `• **VIP Aboneler:** \`${aboneCount} Üye\`\n\n` +
            `### 💎 Sunucu Seviyesi ve Kanallar:\n` +
            `• **Boost / Takviye:** \`Level ${boostLevel} (${boostCount} Boost)\`\n` +
            `• **Metin Kanalları:** \`${textChannels}\` • **Ses Kanalları:** \`${voiceChannels}\`\n` +
            `• **Toplam Rol Sayısı:** \`${roleCount}\``
          )
          .setFooter({ text: `${FOOTER_TEXT} • Canlı Metrik Sistemi` })
          .setTimestamp();

        return interaction.reply({ embeds: [statEmbed] });
      }

      // 51. /bildirim-rol-kur
      if (commandName === 'bildirim-rol-kur') {
        const targetChannel = interaction.options.getChannel('kanal');

        const notifEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setAuthor({ name: `${interaction.guild.name} • Bildirim Seçim Merkezi`, iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🔔 KLAN VE ETKİNLİK BİLDİRİM ROLLERİ')
          .setDescription(
            `Sunucumuzda gereksiz bildirim kirliliği yaşamamak için ilgilendiğiniz etkinliklerin bildirimlerini aşağıdaki butonlara basarak açıp kapatabilirsiniz.\n\n` +
            `📢 **Duyuru Bildirimi:** Önemli sunucu ve klan duyuruları için ping alır.\n` +
            `🎁 **Çekiliş Bildirimi:** VIP çekilişler ve gear ödülleri başladığında ping alır.\n` +
            `🏆 **Turnuva Bildirimi:** Turnuva ve IGN kayıtları başladığında ping alır.\n` +
            `⚔️ **Klan Maçı Bildirimi:** Resmi klan savaşları için ping alır.\n\n` +
            `👇 *Butona tekrar basarak rolü istediğiniz zaman bırakabilirsiniz!*`
          )
          .setFooter({ text: FOOTER_TEXT });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_notif_duyuru').setLabel('📢 Duyurular').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('btn_notif_cekilis').setLabel('🎁 Çekilişler').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('btn_notif_turnuva').setLabel('🏆 Turnuvalar').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('btn_notif_mac').setLabel('⚔️ Klan Maçları').setStyle(ButtonStyle.Danger)
        );

        await targetChannel.send({ embeds: [notifEmbed], components: [row] });
        return interaction.reply({ content: `✅ Bildirim rol seçim paneli ${targetChannel} kanalına başarıyla kuruldu!`, ephemeral: true });
      }
    }

    // ----------------------------------------------------
    // B. SEÇİM MENÜSÜ (SELECT MENU) ETKİLEŞİMLERİ
    // ----------------------------------------------------
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'help_category_select') {
        const category = interaction.values[0] || 'home';
        const helpData = buildHelpMenu(category);
        await interaction.deferUpdate().catch(() => {});
        return interaction.editReply({
          embeds: helpData.embeds,
          components: helpData.components
        });
      }

      if (interaction.customId.startsWith('ticket_select_')) {
      const selectedCategory = interaction.values[0];
      const applicant = interaction.user;
      const guild = interaction.guild;
      const data = loadData();

      let prefix = 'destek';
      let catTitle = 'Genel Destek & Soru';
      let catDesc = 'Yetkili ekibimiz en kısa sürede sizinle ilgilenecektir.';
      let catEmoji = '📩';

      if (selectedCategory === 'partnerlik') {
        prefix = 'partner';
        catTitle = '🤝 Partnerlik Başvurusu & İletişim';
        catDesc = 'Partnerlik şartları ve karşılıklı tanıtım için lütfen sunucu bağlantınızı ve üye sayınızı yazınız.';
        catEmoji = '🤝';
      } else if (selectedCategory === 'cekilis') {
        prefix = 'çekiliş';
        catTitle = '🎁 Çekiliş & Sponsorluk Talebi';
        catDesc = 'Kazandığınız çekiliş ödülünü teslim almak veya sunucumuzda çekiliş sponsoru olmak için detayları iletiniz.';
        catEmoji = '🎁';
      } else if (selectedCategory === 'reklam') {
        prefix = 'reklam';
        catTitle = '📢 Reklam Satın Alma & Görüşme';
        catDesc = 'Sunucumuzda reklam (@everyone / @here / özel kanal) satın almak ve fiyat tarifesini öğrenmek için lütfen bekleyiniz.';
        catEmoji = '📢';
      } else if (selectedCategory === 'boost') {
        prefix = 'boost';
        catTitle = '🚀 İnvite & Boost Ödül Talebi';
        catDesc = 'Yaptığınız davet sayısı veya sunucuya bastığınız Boost karşılığı ödülünüzü almak için kanıtınızı yazınız.';
        catEmoji = '🚀';
      } else if (selectedCategory === 'diger') {
        prefix = 'diğer';
        catTitle = '❓ Diğer Talepler & Özel Konular';
        catDesc = 'Diğer tüm özel soru, öneri veya yardım talepleriniz için lütfen konuyu detaylı yazınız.';
        catEmoji = '❓';
      }

      const cleanUsername = applicant.username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const channelName = `${prefix}-${cleanUsername}`;

      const existingChannel = guild.channels.cache.find(c => c.name === channelName);
      if (existingChannel) {
        return interaction.reply({
          content: `⚠️ Zaten açık bir **${catTitle}** odanız bulunmaktadır: ${existingChannel}`,
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const targetCategory = await getOrCreateTicketCategory(guild);

      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: applicant.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ];

      // Tüm yetkili rollerine otomatik kalıcı görünürlük ve yönetim yetkisi ver
      const allStaffRoleIds = getAllStaffRoleIdsForGuild(guild, data);
      allStaffRoleIds.forEach(roleId => {
        const r = guild.roles.cache.get(roleId);
        if (r) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ManageChannels
            ]
          });
        }
      });

      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: targetCategory ? targetCategory.id : null,
        permissionOverwrites
      });

      const insideEmbed = new EmbedBuilder()
        .setColor('#3B82F6')
        .setTitle(`${catEmoji} ${catTitle}`)
        .setDescription(
          `Merhaba ${applicant}! **${catTitle}** kategorisinde özel destek odanız oluşturuldu.\n\n` +
          `📌 **Bilgilendirme:** >>> ${catDesc}\n\n` +
          `Yetkili ekibimiz en kısa sürede size yanıt verecektir.`
        )
        .addFields(
          { name: '👤 Talep Sahibi', value: `${applicant} (\`${applicant.tag}\`)`, inline: true },
          { name: '🏷️ Kategori', value: `\`${selectedCategory.toUpperCase()}\``, inline: true }
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_claim_action')
          .setLabel('✋ Talebi Üstlen')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✋'),
        new ButtonBuilder()
          .setCustomId('ticket_close_action')
          .setLabel('🔒 Talebi Kapat')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );

      const pingableTicketStaffIds = getPingableStaffRoles(guild, data);
      const staffPings = pingableTicketStaffIds.length > 0 ? pingableTicketStaffIds.map(id => `<@&${id}>`).join(' ') : '';
      await ticketChannel.send({
        content: `📢 ${applicant} ${staffPings} **Yeni Destek Talebi Açıldı!**`,
        embeds: [insideEmbed],
        components: [closeRow]
      });

      return interaction.editReply({ content: `✅ **${catTitle}** odanız **${targetCategory ? targetCategory.name : 'Destek'}** kategorisi altında açıldı: ${ticketChannel}` });
    }
  }

    // ----------------------------------------------------
    // C. MODAL AÇMA & GÖNDERME
    // ----------------------------------------------------
    // 0.1. Ticket / Başvuru Üstlenme Butonu (✋ Talebi Üstlen)
    if (interaction.isButton() && interaction.customId.startsWith('ticket_claim_action')) {
      const data = loadData();
      const member = interaction.member;

      if (!isStaffMember(member, data)) {
        return interaction.reply({ content: '❌ Bu talebi yalnızca yetkililer üstlenebilir!', ephemeral: true });
      }

      const channel = interaction.channel;

      if (ticketActionLocks.has(channel.id)) {
        return interaction.reply({
          content: '⏳ Bu talep üzerinde şu anda başka bir işlem yürütülüyor, lütfen bekleyiniz.',
          ephemeral: true
        });
      }
      ticketActionLocks.add(channel.id);

      const existingClaim = activeClaimedTickets.get(channel.id);
      if (existingClaim) {
        ticketActionLocks.delete(channel.id);
        return interaction.reply({
          content: `⚠️ Bu destek talebi zaten <@${existingClaim.claimedBy}> tarafından üstlenilmiştir!`,
          ephemeral: true
        });
      }

      const staffId = interaction.user.id;

      // 5 Dakika İçinde Yanıt Vermeme Kontrolü (DM & Kanal Uyarısı)
      const claimInfo = {
        claimedBy: staffId,
        claimedAt: Date.now(),
        hasStaffReplied: false,
        timer: null
      };

      claimInfo.timer = setTimeout(async () => {
        try {
          const current = activeClaimedTickets.get(channel.id);
          if (current && !current.hasStaffReplied) {
            // 1. Yetkiliye Özel DM Uyarısı
            try {
              await interaction.user.send({
                content: `⚠️ **DİKKAT:** **${interaction.guild.name}** sunucusunda üstlendiğiniz **#${channel.name}** destek biletine **5 dakikadır hiçbir yanıt vermediniz!**\nLütfen talep sahibiyle iletişime geçiniz.`
              });
            } catch (e) {}

            // 2. Kanal İçi Uyarı Mesajı
            await channel.send({
              content: `⚠️ ${interaction.user}, üstlendiğiniz bu destek talebine **5 dakikadır herhangi bir cevap yazmadınız!** Lütfen talep sahibiyle ilgileniniz.`
            }).catch(() => {});
          }
        } catch (e) {}
      }, 5 * 60 * 1000);

      activeClaimedTickets.set(channel.id, claimInfo);

      // Yetkili İstatistiklerini Güncelle (Yarın 09:00'dan itibaren)
      if (isStaffTrackingLive()) {
        if (!data.staffStats) data.staffStats = {};
        if (!data.staffStats[staffId]) {
          data.staffStats[staffId] = {
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
            voiceJoinedAt: null
          };
        }
        const isApply = channel.name.includes('basvuru') || channel.name.includes('başvuru') || interaction.customId.includes('applicant');
        if (isApply) {
          data.staffStats[staffId].todayApplyClaims = (data.staffStats[staffId].todayApplyClaims || 0) + 1;
          data.staffStats[staffId].weeklyApplyClaims = (data.staffStats[staffId].weeklyApplyClaims || 0) + 1;
          data.staffStats[staffId].totalApplyClaims = (data.staffStats[staffId].totalApplyClaims || 0) + 1;
        } else {
          data.staffStats[staffId].todayTicketClaims = (data.staffStats[staffId].todayTicketClaims || data.staffStats[staffId].todayClaimed || 0) + 1;
          data.staffStats[staffId].weeklyTicketClaims = (data.staffStats[staffId].weeklyTicketClaims || data.staffStats[staffId].totalClaimed || 0) + 1;
          data.staffStats[staffId].totalTicketClaims = (data.staffStats[staffId].totalTicketClaims || data.staffStats[staffId].totalClaimed || 0) + 1;
        }
        data.staffStats[staffId].todayClaimed = (data.staffStats[staffId].todayClaimed || 0) + 1;
        data.staffStats[staffId].totalClaimed = (data.staffStats[staffId].totalClaimed || 0) + 1;
        saveData(data);
      }

      const claimEmbed = new EmbedBuilder()
        .setColor('#10B981')
        .setAuthor({ name: 'Vyron Destek & Klan Yönetimi', iconURL: interaction.guild.iconURL({ dynamic: true }) })
        .setTitle('✋ TALEP YETKİLİ TARAFINDAN ÜSTLENİLDİ!')
        .setDescription(
          `Bu destek talebi yetkilimiz ${interaction.user} (\`${interaction.user.tag}\`) tarafından **üstlenildi.**\n\n` +
          `🔒 *Talebe özel ilgi için yalnızca talebi üstlenen yetkili mesaj yazabilir.*\n` +
          `⏱️ *Yetkilinin 5 dakika içinde ilk yanıtı vermesi beklenmektedir.*`
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      ticketActionLocks.delete(channel.id);
      return interaction.reply({ embeds: [claimEmbed] });
    }

    // 1. Turnuva Katılım Modalı Açma
    if (interaction.isButton() && interaction.customId.startsWith('btn_tourney_register_')) {
      const eventId = interaction.customId.replace('btn_tourney_register_', '');

      const modal = new ModalBuilder()
        .setCustomId(`modal_tourney_reg_${eventId}`)
        .setTitle('🏆 Turnuva Katılım & IGN Kaydı');

      const inputIgn = new TextInputBuilder()
        .setCustomId('mc_ign')
        .setLabel('Minecraft Oyun İçi Nickiniz (IGN):')
        .setPlaceholder('Örn: VyronSavasci_PvP')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputClass = new TextInputBuilder()
        .setCustomId('player_class')
        .setLabel('PvP / Trap / Elytra Rolünüz:')
        .setPlaceholder('Örn: Trapci / Elytracı / Tank')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputIgn),
        new ActionRowBuilder().addComponents(inputClass)
      );

      return interaction.showModal(modal);
    }

    // 2. Turnuva Modalı Gönderildiğinde
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_tourney_reg_')) {
      await interaction.deferReply({ ephemeral: true });

      const eventId = interaction.customId.replace('modal_tourney_reg_', '');
      const eventData = activeEvents.get(eventId);

      const ign = interaction.fields.getTextInputValue('mc_ign').trim();
      const playerClass = interaction.fields.getTextInputValue('player_class') || 'Savaşçı';
      const user = interaction.user;
      const guild = interaction.guild;

      let attendeesChannel = await getOrCreateTourneyChannel(guild);
      if (!attendeesChannel) {
        attendeesChannel = interaction.channel;
      }

      let attendeeIndex = 1;
      if (eventData) {
        eventData.attendees.set(user.id, { ign, playerClass, time: Date.now() });
        attendeeIndex = eventData.attendees.size;
      }

      if (attendeesChannel) {
        const attendeeEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setAuthor({ name: `${user.tag} Turnuvaya Katılıyor!`, iconURL: user.displayAvatarURL({ dynamic: true }) })
          .setTitle(`⚔️ Turnuva Katılımcı Kaydı: #${String(attendeeIndex).padStart(2, '0')}`)
          .addFields(
            { name: '👤 Discord Üyesi', value: `${user} (\`${user.tag}\`)`, inline: true },
            { name: '🎮 Minecraft IGN', value: `\`${ign}\``, inline: true },
            { name: '🛡️ Uzmanlık / Rol', value: `\`${playerClass}\``, inline: true },
            { name: '⏰ Kayıt Tarihi', value: `<t:${Math.floor(Date.now() / 1000)}:f> (<t:${Math.floor(Date.now() / 1000)}:R>)`, inline: false }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        await attendeesChannel.send({
          content: `📢 **Yeni Katılımcı:** ${user} ➔ Minecraft IGN: **\`${ign}\`**`,
          embeds: [attendeeEmbed]
        }).catch(console.error);
      }

      if (eventData) {
        try {
          const mainChannel = guild.channels.cache.get(eventData.channelId);
          if (mainChannel) {
            const mainMsg = await mainChannel.messages.fetch(eventData.messageId).catch(() => null);
            if (mainMsg && mainMsg.embeds.length > 0) {
              const updatedEmbed = EmbedBuilder.from(mainMsg.embeds[0])
                .setFooter({ text: `${attendeeIndex} Katılımcı Kayıtlı • ${FOOTER_TEXT}` });

              const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`btn_tourney_register_${eventId}`)
                  .setLabel(`⚔️ Turnuvaya Katıl (${attendeeIndex})`)
                  .setStyle(ButtonStyle.Success)
                  .setEmoji('🔥')
              );

              await mainMsg.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {});
            }
          }
        } catch (e) {}
      }

      return interaction.editReply({
        content: `🎉 **Turnuva kaydınız başarıyla alındı!**\n🎮 **Minecraft Nickiniz:** \`${ign}\`\n📋 İsminiz ${attendeesChannel} kanalına yazıldı!`
      });
    }

    // 3. Klan Başvuru Modalı Açma
    if (interaction.isButton() && interaction.customId.startsWith('btn_open_apply_')) {
      const modal = new ModalBuilder()
        .setCustomId('modal_clan_apply_submit')
        .setTitle('⚔️ Vyron Klan Başvuru Formu');

      const inputIgn = new TextInputBuilder()
        .setCustomId('ign')
        .setLabel('Oyun İçi Adınız (IGN / Nick):')
        .setPlaceholder('Örn: VyronMaster_PvP')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputAgeActive = new TextInputBuilder()
        .setCustomId('age_active')
        .setLabel('Yaşınız ve Günlük Aktifliğiniz:')
        .setPlaceholder('Örn: Yaş: 17, Günde 5-6 saat aktifim.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const inputOldClans = new TextInputBuilder()
        .setCustomId('old_clans')
        .setLabel('Eski Klanlarınız (Varsa):')
        .setPlaceholder('Örn: Strix, Avenor (veya Yok)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const inputExp = new TextInputBuilder()
        .setCustomId('experience')
        .setLabel('PvP / Elytra / Trap Tecrübeniz:')
        .setPlaceholder('Örn: 3 yıldır Elytra PvP & Crystal oynuyorum.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const inputAnydesk = new TextInputBuilder()
        .setCustomId('anydesk_ready')
        .setLabel('Anydesk / PC Kontrolünü Kabul Ediyor musunuz?')
        .setPlaceholder('Evet hazırım / Kontrolü kabul ediyorum.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputIgn),
        new ActionRowBuilder().addComponents(inputAgeActive),
        new ActionRowBuilder().addComponents(inputOldClans),
        new ActionRowBuilder().addComponents(inputExp),
        new ActionRowBuilder().addComponents(inputAnydesk)
      );

      return interaction.showModal(modal);
    }

    // Form Gönderildiğinde -> KATEGORİ ALTINDA TICKET AÇMA
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_clan_apply_')) {
      const data = loadData();
      const applicant = interaction.user;
      const guild = interaction.guild;

      const ign = interaction.fields.getTextInputValue('ign');
      const ageActive = interaction.fields.getTextInputValue('age_active');
      const oldClans = interaction.fields.getTextInputValue('old_clans') || 'Belirtilmedi';
      const experience = interaction.fields.getTextInputValue('experience');
      const anydeskReady = interaction.fields.getTextInputValue('anydesk_ready');

      const channelName = `başvuru-${applicant.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const existingChannel = guild.channels.cache.find(c => c.name === channelName);
      if (existingChannel) {
        return interaction.reply({
          content: `⚠️ Zaten açık bir klan başvuru odanız bulunuyor: ${existingChannel}`,
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const targetCategory = await getOrCreateApplyCategory(guild);

      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: applicant.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ];

      // Tüm yetkili rollerine otomatik kalıcı görünürlük ve yönetim yetkisi ver
      const allStaffRoleIds = getAllStaffRoleIdsForGuild(guild, data);
      allStaffRoleIds.forEach(roleId => {
        const r = guild.roles.cache.get(roleId);
        if (r) {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ManageChannels
            ]
          });
        }
      });

      const applyTicketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: targetCategory ? targetCategory.id : null,
        permissionOverwrites
      });

      const appId = applicationCounter++;
      const clanRoleId = data.clanRoleId ||
        guild.roles.cache.find(r => r.name.toLowerCase() === 'vyron • klan üyesi')?.id ||
        guild.roles.cache.find(r => r.name.toLowerCase() === 'klan üyesi')?.id ||
        guild.roles.cache.find(r => r.name.toLowerCase().includes('klan üye') && !r.name.toLowerCase().includes('has'))?.id ||
        guild.roles.cache.find(r => r.name.toLowerCase().includes('klan') && !r.name.toLowerCase().includes('has'))?.id ||
        'none';

      const ticketEmbed = new EmbedBuilder()
        .setColor('#8B5CF6')
        .setTitle(`⚔️ Klan Başvurusu: ${ign} (No: #${String(appId).padStart(4, '0')})`)
        .setDescription(
          `Merhaba ${applicant}! Vyron klan başvurunuz başarıyla oluşturuldu ve **${targetCategory ? targetCategory.name : 'Destek'}** kategorisi altında odanız açıldı.\n\n` +
          `Yetkililerimiz bilgilerinizi inceleyecek ve aşağıdaki butonlarla sizi **Anydesk Kontrolüne** çağıracaktır.`
        )
        .addFields(
          { name: '👤 Discord Hesabı', value: `${applicant} (${applicant.tag} - \`${applicant.id}\`)`, inline: false },
          { name: '🎮 Oyun İçi Nick (IGN)', value: `\`${ign}\``, inline: true },
          { name: '⏰ Yaş & Aktiflik', value: `${ageActive}`, inline: true },
          { name: '🏰 Eski Klanları', value: `${oldClans}`, inline: true },
          { name: '🖥️ Anydesk Kontrol Onayı', value: `\`${anydeskReady}\``, inline: true },
          { name: '⚔️ PvP / Elytra / Trap Tecrübesi', value: `>>> ${experience}`, inline: false }
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      const ticketRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_claim_action_${applicant.id}`)
          .setLabel('✋ Başvuruyu Üstlen')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✋'),
        new ButtonBuilder()
          .setCustomId(`ticket_call_anydesk_${applicant.id}`)
          .setLabel('📢 Anydesk Çağır')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🖥️'),
        new ButtonBuilder()
          .setCustomId(`ticket_pass_modal_${applicant.id}_${clanRoleId}`)
          .setLabel('✅ Temiz (Onayla)')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🛡️'),
        new ButtonBuilder()
          .setCustomId(`ticket_fail_modal_${applicant.id}`)
          .setLabel('🚫 Hile')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ticket_reject_close_${applicant.id}`)
          .setLabel('❌ Reddet')
          .setStyle(ButtonStyle.Secondary)
      );

      const pingableStaffRoleIds = getPingableStaffRoles(guild, data);
      const staffPings = pingableStaffRoleIds.length > 0 ? pingableStaffRoleIds.map(id => `<@&${id}>`).join(' ') : '';
      await applyTicketChannel.send({
        content: `📢 ${applicant} ${staffPings} **Yeni Klan Başvuru Talebi Açıldı!**`,
        embeds: [ticketEmbed],
        components: [ticketRow]
      });

      try {
        await applicant.send({
          content: `🔔 **Vyron Klan Başvurunuz Alındı!**\nAdınıza özel başvuru odası açıldı: ${applyTicketChannel}\nLütfen odadaki talimatları takip ediniz.`
        });
      } catch (e) {}

      return interaction.editReply({
        content: `✅ **Klan başvurunuz alındı ve kategorisi altında odanız açıldı:** ${applyTicketChannel}`
      });
    }

    // 4. TEMİZ KONTROL MODAL GÖNDERİLDİĞİNDE
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_pass_confirm_')) {
      const parts = interaction.customId.split('_');
      const applicantId = parts[3];
      const clanRoleId = parts[4];

      const checkNotes = interaction.fields.getTextInputValue('pass_notes') || 'Anydesk kontrolü yapıldı, tamamen temiz.';

      const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
      const data = loadData();
      const roleIdToUse = (clanRoleId && clanRoleId !== 'none') ? clanRoleId : data.clanRoleId;
      const clanRole = (roleIdToUse && roleIdToUse !== 'none' && interaction.guild.roles.cache.get(roleIdToUse)) ||
        interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'vyron • klan üyesi') ||
        interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'klan üyesi') ||
        interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('klan üye') && !r.name.toLowerCase().includes('has')) ||
        interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('klan') && !r.name.toLowerCase().includes('has'));

      // Yetkili Talep İstatistiğini Güncelle (Yarın 09:00'dan itibaren)
      if (isStaffTrackingLive()) {
        if (!data.staffStats) data.staffStats = {};
        const staffId = interaction.user.id;
        if (!data.staffStats[staffId]) {
          data.staffStats[staffId] = {
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
            voiceJoinedAt: null
          };
        }
        data.staffStats[staffId].todayAnydeskChecks = (data.staffStats[staffId].todayAnydeskChecks || 0) + 1;
        data.staffStats[staffId].weeklyAnydeskChecks = (data.staffStats[staffId].weeklyAnydeskChecks || 0) + 1;
        data.staffStats[staffId].totalAnydeskChecks = (data.staffStats[staffId].totalAnydeskChecks || 0) + 1;
        data.staffStats[staffId].todaySolvedTickets = (data.staffStats[staffId].todaySolvedTickets || data.staffStats[staffId].todayTickets || 0) + 1;
        data.staffStats[staffId].weeklySolvedTickets = (data.staffStats[staffId].weeklySolvedTickets || data.staffStats[staffId].totalTickets || 0) + 1;
        data.staffStats[staffId].totalSolvedTickets = (data.staffStats[staffId].totalSolvedTickets || data.staffStats[staffId].totalTickets || 0) + 1;
        data.staffStats[staffId].todayTickets = (data.staffStats[staffId].todayTickets || 0) + 1;
        data.staffStats[staffId].totalTickets = (data.staffStats[staffId].totalTickets || 0) + 1;
        saveData(data);
      }

      if (applicant && clanRole) {
        await applicant.roles.add(clanRole).catch(() => {});
        try {
          await applicant.send({
            content: `🎉 **Tebrikler ${applicant.user.username}!** Vyron klanımızın Anydesk kontrolünden başarıyla geçtiniz ve **${clanRole.name}** rolünüz tanımlandı. Klana hoş geldiniz! ⚔️`
          });
        } catch (e) {}
      }

      const guild = interaction.guild;
      const chCleanLog = await getOrCreateCleanLogChannel(guild);

      if (chCleanLog) {
        const userObj = applicant ? applicant.user : { tag: 'Bilinmiyor', id: applicantId, displayAvatarURL: () => client.user.displayAvatarURL() };

        const passLogEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setAuthor({ name: 'Vyron Klan Alım & Güvenlik Sistemi', iconURL: guild.iconURL({ dynamic: true }) })
          .setTitle('✅ KLAN BAŞVURUSU ONAYLANDI (TEMİZ)')
          .setThumbnail(userObj.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: '👤 Discord Kullanıcısı', value: `${applicant ? applicant : applicantId} (\`${userObj.tag}\`)`, inline: true },
            { name: '🆔 Discord ID', value: `\`${applicantId}\``, inline: true },
            { name: '🌐 Discord Profili', value: `[Profili Aç](https://discord.com/users/${applicantId})`, inline: true },
            { name: '🏷️ Tanımlanan Rol', value: `\`${clanRole ? clanRole.name : 'Klan Üyesi'}\``, inline: true },
            { name: '🛡️ Kontrol Eden Yetkili', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
            { name: '⏰ Onay Tarihi', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
            { name: '📝 Yetkili Notu', value: `>>> ${checkNotes}`, inline: false }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        await chCleanLog.send({ embeds: [passLogEmbed] }).catch(() => {});
      }

      const passEmbed = new EmbedBuilder()
        .setColor('#10B981')
        .setTitle('🎉 Kontrol Başarılı - Klana Alındı!')
        .setDescription(`Tebrikler ${applicant}! Anydesk kontrolünden **TEMİZ** olarak geçti, **${clanRole ? clanRole.name : 'Klan Üyesi'}** rolü verildi ve onay kaydı **${chCleanLog || '#temiz-log'}** kanalına aktarıldı!\n\n🔒 Bu başvuru odası 5 saniye içinde kapatılacaktır.`)
        .setFooter({ text: FOOTER_TEXT });

      await interaction.reply({ embeds: [passEmbed] });

      setTimeout(async () => {
        await interaction.channel.delete().catch(() => {});
      }, 5000);
      return;
    }

    // 5. HİLE KONTROL MODAL GÖNDERİLDİĞİNDE
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_cheat_reason_')) {
      const applicantId = interaction.customId.split('_')[3];
      const cheatType = interaction.fields.getTextInputValue('cheat_type');
      const cheatNotes = interaction.fields.getTextInputValue('cheat_notes') || 'Belirtilmedi.';

      const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);

      // Yetkili Talep İstatistiğini Güncelle (Yarın 09:00'dan itibaren)
      if (isStaffTrackingLive()) {
        const data = loadData();
        if (!data.staffStats) data.staffStats = {};
        const staffId = interaction.user.id;
        if (!data.staffStats[staffId]) {
          data.staffStats[staffId] = {
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
            voiceJoinedAt: null
          };
        }
        data.staffStats[staffId].todayAnydeskChecks = (data.staffStats[staffId].todayAnydeskChecks || 0) + 1;
        data.staffStats[staffId].weeklyAnydeskChecks = (data.staffStats[staffId].weeklyAnydeskChecks || 0) + 1;
        data.staffStats[staffId].totalAnydeskChecks = (data.staffStats[staffId].totalAnydeskChecks || 0) + 1;
        data.staffStats[staffId].todaySolvedTickets = (data.staffStats[staffId].todaySolvedTickets || data.staffStats[staffId].todayTickets || 0) + 1;
        data.staffStats[staffId].weeklySolvedTickets = (data.staffStats[staffId].weeklySolvedTickets || data.staffStats[staffId].totalTickets || 0) + 1;
        data.staffStats[staffId].totalSolvedTickets = (data.staffStats[staffId].totalSolvedTickets || data.staffStats[staffId].totalTickets || 0) + 1;
        data.staffStats[staffId].todayTickets = (data.staffStats[staffId].todayTickets || 0) + 1;
        data.staffStats[staffId].totalTickets = (data.staffStats[staffId].totalTickets || 0) + 1;
        saveData(data);
      }

      if (applicant) {
        try {
          await applicant.send({
            content: `🚫 Merhaba, Vyron klan başvurunuz Anydesk kontrolü sonucunda **Hile / İhlal (${cheatType})** tespiti nedeniyle reddedilmiştir.`
          });
        } catch (e) {}
      }

      const guild = interaction.guild;
      const chCheatLog = await getOrCreateCheatLogChannel(guild);

      if (chCheatLog) {
        const userObj = applicant ? applicant.user : { tag: 'Bilinmiyor', id: applicantId, displayAvatarURL: () => client.user.displayAvatarURL() };

        const cheatEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setAuthor({ name: 'Vyron Klan Güvenlik & İnceleme Sistemi', iconURL: guild.iconURL({ dynamic: true }) })
          .setTitle('🚫 HİLE TESPİT EDİLDİ & BAŞVURU REDDEDİLDİ')
          .setThumbnail(userObj.displayAvatarURL({ dynamic: true, size: 256 }))
          .addFields(
            { name: '👤 Discord Kullanıcısı', value: `${applicant ? applicant : applicantId} (\`${userObj.tag}\`)`, inline: true },
            { name: '🆔 Discord ID', value: `\`${applicantId}\``, inline: true },
            { name: '🌐 Discord Profili', value: `[Profili Aç](https://discord.com/users/${applicantId})`, inline: true },
            { name: '⚠️ Tespit Edilen Hile', value: `**${cheatType}**`, inline: true },
            { name: '🛡️ Kontrol Eden Yetkili', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
            { name: '⏰ İşlem Tarihi', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
            { name: '📄 Yetkili Açıklaması / Detay', value: `>>> ${cheatNotes}`, inline: false }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        await chCheatLog.send({ embeds: [cheatEmbed] }).catch(() => {});
      }

      const failEmbed = new EmbedBuilder()
        .setColor('#EF4444')
        .setTitle('🚫 Kontrol Başarısız (Hile Tespit Edildi & Raporlandı)')
        .setDescription(`${applicant ? applicant.user.tag : 'Aday'} kontrolden elendi.\n**Hile:** ${cheatType}\n📸 Kayıt **${chCheatLog || '#hile-log'}** kanalına aktarıldı.\n\n🔒 Bu oda 5 saniye içinde kapatılacaktır.`)
        .setFooter({ text: FOOTER_TEXT });

      await interaction.reply({ embeds: [failEmbed] });

      setTimeout(async () => {
        await interaction.channel.delete().catch(() => {});
      }, 5000);
      return;
    }

    // ----------------------------------------------------
    // D. BUTON ETKİLEŞİMLERİ
    // ----------------------------------------------------
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // 0.1. YETKİLİ SIRALAMASI DÖNEM GEÇİŞ BUTONLARI (Bugün / Bu Hafta / Toplam)
      if (customId === 'btn_lb_today' || customId === 'btn_lb_weekly' || customId === 'btn_lb_total') {
        const period = customId === 'btn_lb_weekly' ? 'weekly' : customId === 'btn_lb_total' ? 'total' : 'today';
        const guild = interaction.guild;
        const data = loadData();
        const leaderboardEmbed = await buildStaffLeaderboardEmbed(guild, data, period);
        const row = buildStaffLeaderboardRow(period);
        await interaction.deferUpdate().catch(() => {});
        return interaction.editReply({
          embeds: [leaderboardEmbed],
          components: [row]
        });
      }
      // 1. ANKET OYLAMA
      if (customId.startsWith('poll_vote_yes_') || customId.startsWith('poll_vote_no_')) {
        const isYes = customId.startsWith('poll_vote_yes_');
        const pollId = customId.replace('poll_vote_yes_', '').replace('poll_vote_no_', '');
        const poll = activePolls.get(pollId);

        if (!poll) {
          return interaction.reply({ content: '❌ Bu anket sona ermiş veya bot yeniden başlatılmış.', ephemeral: true });
        }

        const userId = interaction.user.id;
        let userAction = '';

        if (isYes) {
          if (poll.yesVoters.has(userId)) {
            poll.yesVoters.delete(userId);
            userAction = 'Oyunuzu geri çektiniz.';
          } else {
            poll.yesVoters.add(userId);
            poll.noVoters.delete(userId);
            userAction = '👍 **Evet** olarak oyunuz kaydedildi!';
          }
        } else {
          if (poll.noVoters.has(userId)) {
            poll.noVoters.delete(userId);
            userAction = 'Oyunuzu geri çektiniz.';
          } else {
            poll.noVoters.add(userId);
            poll.yesVoters.delete(userId);
            userAction = '👎 **Hayır** olarak oyunuz kaydedildi!';
          }
        }

        const yesCount = poll.yesVoters.size;
        const noCount = poll.noVoters.size;
        const totalVotes = yesCount + noCount;

        const yesPercent = totalVotes > 0 ? Math.round((yesCount / totalVotes) * 100) : 0;
        const noPercent = totalVotes > 0 ? Math.round((noCount / totalVotes) * 100) : 0;

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setDescription(
            `**${poll.question}**\n\n` +
            `👍 **Evet:** \`${yesCount} Oy (%${yesPercent})\`\n` +
            `👎 **Hayır:** \`${noCount} Oy (%${noPercent})\`\n\n` +
            `📊 **Toplam Oy:** \`${totalVotes}\``
          );

        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`poll_vote_yes_${pollId}`).setLabel(`👍 Evet (${yesCount})`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`poll_vote_no_${pollId}`).setLabel(`👎 Hayır (${noCount})`).setStyle(ButtonStyle.Danger)
        );

        await interaction.message.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {});
        return interaction.reply({ content: `🗳️ ${userAction}`, ephemeral: true });
      }

      // 2. OTOMATİK EKSİK KANALLARI OLUŞTURMA VE PANELLERİ KURMA BUTONU
      if (customId.startsWith('btn_autofix_missing_')) {
        const guildId = customId.replace('btn_autofix_missing_', '');
        const guild = client.guilds.cache.get(guildId) || interaction.guild || client.guilds.cache.first();

        if (!guild) {
          return interaction.reply({ content: '❌ Sunucu bulunamadı!', ephemeral: true });
        }

        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        const data = loadData();
        if (!member || (!member.permissions.has(PermissionFlagsBits.Administrator) && !isStaffMember(member, data))) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca sunucu yöneticileri ve yetkililer yapabilir!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const result = await autoSetupGuildInfrastructure(guild);

        const completionEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setAuthor({ name: `${guild.name} • Otomatik Altyapı Kurulumu`, iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🎉 Sunucu Eksikleri & Paneller Otomatik Olarak Kuruldu!')
          .setDescription(
            `Bot sunucunuzdaki tüm eksik rolleri, kanalları ve panelleri başarıyla oluşturdu:\n\n` +
            (result.createdItems && result.createdItems.length > 0 
              ? result.createdItems.map(i => `• ${i}`).join('\n\n')
              : `✅ *Tüm rol ve panelleriniz zaten tam ve eksiksiz durumda!*`)
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.editReply({ embeds: [completionEmbed] });
      }

      // 3. ANYDESK KONTROLE ÇAĞIR BUTONU
      if (customId.startsWith('ticket_call_anydesk_')) {
        const applicantId = customId.split('_')[3];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const data = loadData();
        const isAuthorized = isStaffMember(interaction.member, data);
        if (!isAuthorized) {
          return interaction.reply({ content: '❌ Bu butonu yalnızca yetkililer kullanabilir!', ephemeral: true });
        }

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);

        await interaction.channel.send({
          content: `📢 ${applicant} **ANYDESK KONTROLÜNE ÇAĞRILDINIZ!**\n🛡️ **Kontrol Yetkiliniz:** ${interaction.user}\n📌 Lütfen 9 haneli Anydesk kodunuzu buraya yazınız ve yetkili ses kanalına katılınız.`
        });

        if (applicant) {
          try {
            await applicant.send({
              content: `🔔 **Vyron Klan Başvurusu:** Yetkili (${interaction.user.tag}) sizi **Anydesk Kontrol Odasına** çağırdı! Lütfen sunucudaki başvuru kanalınıza (${interaction.channel}) geçip kodunuzu iletiniz.`
            });
          } catch (e) {}
        }

        return interaction.reply({ content: `✅ ${applicant} başarıyla Anydesk kontrolüne çağrıldı ve DM bildirimi iletildi!`, ephemeral: true });
      }

      // 4. KLAN BAŞVURU TICKET: TEMİZ MODAL AÇ
      if (customId.startsWith('ticket_pass_modal_')) {
        const parts = customId.split('_');
        const applicantId = parts[3];
        const clanRoleId = parts[4];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Kendi başvurunuzu onaylayamazsınız!', ephemeral: true });
        }

        const data = loadData();
        const isAuthorized = isStaffMember(interaction.member, data);
        if (!isAuthorized) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_pass_confirm_${applicantId}_${clanRoleId}`)
          .setTitle('✅ Temiz Kontrol Onayı');

        const inputNotes = new TextInputBuilder()
          .setCustomId('pass_notes')
          .setLabel('Kontrol Notu & Açıklama:')
          .setPlaceholder('Örn: Anydesk kontrolü yapıldı, tamamen temiz.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputNotes)
        );

        return interaction.showModal(modal);
      }

      // 5. KLAN BAŞVURU TICKET: HİLE MODAL AÇ
      if (customId.startsWith('ticket_fail_modal_')) {
        const applicantId = customId.split('_')[3];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Bu butonu aday kullanamaz!', ephemeral: true });
        }

        const data = loadData();
        const isAuthorized = isStaffMember(interaction.member, data);
        if (!isAuthorized) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_cheat_reason_${applicantId}`)
          .setTitle('🚫 Hile Tespiti & Tutanak');

        const inputCheatType = new TextInputBuilder()
          .setCustomId('cheat_type')
          .setLabel('Tespit Edilen Hile / İhlal:')
          .setPlaceholder('Örn: Vape V4, AutoClicker, Reach, Kontrolü Reddetti')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const inputCheatNotes = new TextInputBuilder()
          .setCustomId('cheat_notes')
          .setLabel('Hile Detayı / Açıklama:')
          .setPlaceholder('Örn: %temp% ve prefetch klasöründe kalıntı bulundu.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputCheatType),
          new ActionRowBuilder().addComponents(inputCheatNotes)
        );

        return interaction.showModal(modal);
      }

      // 6. KLAN BAŞVURU TICKET: REDDET & KAPAT
      if (customId.startsWith('ticket_reject_close_')) {
        const applicantId = customId.split('_')[3];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Bu butonu aday kullanamaz!', ephemeral: true });
        }

        const data = loadData();
        const isAuthorized = isStaffMember(interaction.member, data);
        if (!isAuthorized) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);

        // Yetkili Talep İstatistiğini Güncelle (Yarın 09:00'dan itibaren)
        if (isStaffTrackingLive()) {
          const data = loadData();
          if (!data.staffStats) data.staffStats = {};
          const staffId = interaction.user.id;
          if (!data.staffStats[staffId]) {
            data.staffStats[staffId] = {
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
              voiceJoinedAt: null
            };
          }
          data.staffStats[staffId].todaySolvedTickets = (data.staffStats[staffId].todaySolvedTickets || data.staffStats[staffId].todayTickets || 0) + 1;
          data.staffStats[staffId].weeklySolvedTickets = (data.staffStats[staffId].weeklySolvedTickets || data.staffStats[staffId].totalTickets || 0) + 1;
          data.staffStats[staffId].totalSolvedTickets = (data.staffStats[staffId].totalSolvedTickets || data.staffStats[staffId].totalTickets || 0) + 1;
          data.staffStats[staffId].todayTickets = (data.staffStats[staffId].todayTickets || 0) + 1;
          data.staffStats[staffId].totalTickets = (data.staffStats[staffId].totalTickets || 0) + 1;
          saveData(data);
        }

        if (applicant) {
          try {
            await applicant.send({
              content: `❌ Merhaba, Vyron klan başvurunuz yetkililer tarafından incelenerek uygun görülmemiştir.`
            });
          } catch (e) {}
        }

        await interaction.reply({ embeds: [new EmbedBuilder().setColor('#EF4444').setDescription('❌ Başvuru reddedildi. Oda 5 saniye içinde kapatılacaktır...').setFooter({ text: FOOTER_TEXT })] });

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }



      // 8. ÇEKİLİŞE KATILMA
      if (customId.startsWith('gw_join_')) {
        const giveawayId = customId.replace('gw_join_', '');
        const gw = activeGiveaways.get(giveawayId);

        if (!gw) return interaction.reply({ content: '❌ Bu çekiliş sona ermiş.', ephemeral: true });

        const userId = interaction.user.id;
        const member = interaction.member;
        const data = loadData();

        // Katılım Şartı Kontrolü
        if (gw.reqOption && gw.reqOption !== 'none' && !gw.participants.has(userId)) {
          const hasTag = true; // Tag sistemi kaldırıldı
          const hasAbone = data.aboneRoleId && member.roles.cache.has(data.aboneRoleId);

          if (gw.reqOption === 'tag' && !hasTag) {
            return interaction.reply({
              content: `❌ Bu çekilişe katılabilmek için **@Vyron • Tag** taşımanız veya isminizde **VYRN** klan tagı olması gerekmektedir!`,
              ephemeral: true
            });
          }

          if (gw.reqOption === 'abone' && !hasAbone) {
            return interaction.reply({
              content: `❌ Bu çekilişe katılabilmek için **@Vyron • Abone** rolüne sahip olmanız gerekmektedir! (#abone-kanit kanalından alabilirsiniz)`,
              ephemeral: true
            });
          }

          if (gw.reqOption === 'both' && (!hasTag || !hasAbone)) {
            return interaction.reply({
              content: `❌ Bu çekilişe katılabilmek için **hem @Vyron • Tag hem de @Vyron • Abone** rollerine sahip olmanız gerekmektedir!`,
              ephemeral: true
            });
          }
        }

        let joined = false;

        if (gw.participants.has(userId)) {
          gw.participants.delete(userId);
          joined = false;
        } else {
          gw.participants.add(userId);
          joined = true;
        }

        const updatedCount = gw.participants.size;
        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`gw_join_${giveawayId}`)
            .setLabel(`🎉 Katıl (${updatedCount})`)
            .setStyle(ButtonStyle.Success)
        );

        if (interaction.message.embeds && interaction.message.embeds.length > 0) {
          const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `${updatedCount} Katılımcı • ${FOOTER_TEXT}` });
          await interaction.message.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {});
        }

        return interaction.reply({
          content: joined ? `🎉 **${gw.prize}** çekilişine katıldınız! (Toplam Katılımcı: **${updatedCount}**)` : `⚠️ Çekilişten ayrıldınız.`,
          ephemeral: true
        });
      }

      // 9. TICKET KAPATMA
      if (customId === 'ticket_close_action') {
        // Yetkili Talep İstatistiğini Güncelle (Yarın 09:00'dan itibaren)
        if (isStaffTrackingLive()) {
          const data = loadData();
          if (!data.staffStats) data.staffStats = {};
          const staffId = interaction.user.id;
          if (!data.staffStats[staffId]) {
            data.staffStats[staffId] = {
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
              voiceJoinedAt: null
            };
          }
          data.staffStats[staffId].todaySolvedTickets = (data.staffStats[staffId].todaySolvedTickets || data.staffStats[staffId].todayTickets || 0) + 1;
          data.staffStats[staffId].weeklySolvedTickets = (data.staffStats[staffId].weeklySolvedTickets || data.staffStats[staffId].totalTickets || 0) + 1;
          data.staffStats[staffId].totalSolvedTickets = (data.staffStats[staffId].totalSolvedTickets || data.staffStats[staffId].totalTickets || 0) + 1;
          data.staffStats[staffId].todayTickets = (data.staffStats[staffId].todayTickets || 0) + 1;
          data.staffStats[staffId].totalTickets = (data.staffStats[staffId].totalTickets || 0) + 1;
          saveData(data);
        }

        await interaction.reply({ embeds: [new EmbedBuilder().setColor('#EF4444').setDescription('🔒 Destek talebi 5 saniye içinde kapatılacak...').setFooter({ text: FOOTER_TEXT })] });
        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 10. DOĞRULAMA
      if (customId.startsWith('verify_role_')) {
        const roleId = customId.replace('verify_role_', '');
        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) return interaction.reply({ content: '❌ Rol bulunamadı!', ephemeral: true });

        const member = interaction.member;
        if (member.roles.cache.has(role.id)) {
          return interaction.reply({ content: 'ℹ️ Zaten doğrulanmışsınız!', ephemeral: true });
        }

        await member.roles.add(role).catch(() => {});
        return interaction.reply({ content: `✅ Başarıyla doğrulandınız! **${role.name}** rolü verildi. Hoş geldiniz! 🎉`, ephemeral: true });
      }



      // 12. BİLDİRİM ROLLERİ TOGGLE
      if (customId.startsWith('btn_notif_')) {
        const type = customId.replace('btn_notif_', ''); // duyuru, cekilis, turnuva, mac
        const guild = interaction.guild;
        const member = interaction.member;

        const roleNames = {
          duyuru: 'Vyron • Duyuru Bildirimi',
          cekilis: 'Vyron • Çekiliş Bildirimi',
          turnuva: 'Vyron • Turnuva Bildirimi',
          mac: 'Vyron • Klan Maçı Bildirimi'
        };

        const targetRoleName = roleNames[type] || 'Vyron • Duyuru Bildirimi';
        let role = guild.roles.cache.find(r => r.name.toLowerCase() === targetRoleName.toLowerCase());

        if (!role) {
          role = await guild.roles.create({
            name: targetRoleName,
            color: type === 'duyuru' ? '#3B82F6' : (type === 'cekilis' ? '#10B981' : (type === 'turnuva' ? '#F59E0B' : '#EF4444')),
            reason: 'Vyron Bildirim Rolü Otomatik Oluşturuldu'
          }).catch(() => null);
        }

        if (!role) return interaction.reply({ content: '❌ Rol ayarlanamadı!', ephemeral: true });

        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role).catch(() => {});
          return interaction.reply({ content: `🔕 **${role.name}** rolü üzerinizden kaldırıldı. Artık bu bildirimleri almayacaksınız.`, ephemeral: true });
        } else {
          await member.roles.add(role).catch(() => {});
          return interaction.reply({ content: `🔔 **${role.name}** rolü başarıyla verildi! Artık bu bildirimleri alacaksınız.`, ephemeral: true });
        }
      }

      // 13. DUYURU OKUNDU & ONAYLANDI BUTONU
      if (customId.startsWith('btn_announcement_ack_')) {
        const ackId = customId.replace('btn_announcement_ack_', '');
        let acks = activeAnnouncementAcks.get(ackId);
        if (!acks) {
          acks = new Set();
          activeAnnouncementAcks.set(ackId, acks);
        }

        const userId = interaction.user.id;
        if (acks.has(userId)) {
          return interaction.reply({ content: 'ℹ️ Bu duyuruyu zaten daha önce okuyup onayladınız!', ephemeral: true });
        }

        acks.add(userId);

        const newRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_announcement_ack_${ackId}`)
            .setLabel(`👍 Okudum & Onayladım (${acks.size})`)
            .setStyle(ButtonStyle.Success)
            .setEmoji('💎')
        );

        await interaction.message.edit({ components: [newRow] }).catch(() => {});
        return interaction.reply({ content: `✅ **Duyuruyu başarıyla okudunuz ve onayladınız!** Katkınız için teşekkürler. 💎`, ephemeral: true });
      }
    }
  } catch (error) {
    console.error('Etkileşim hatası:', error);
  }
});

// ==========================================
// 7. KESİNTİSİZ ÇALIŞMA (CRASH KORUMASI)
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [Hata Yakalandı - UnhandledRejection]:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error('⚠️ [Hata Yakalandı - UncaughtException]:', err);
});

// ==========================================
// 8. GİRİŞ YAPMA (LOGIN)
// ==========================================
if (!process.env.TOKEN) {
  console.warn('⚠️ DİKKAT: TOKEN bulunamadı!');
} else {
  client.login(process.env.TOKEN).catch(err => {
    console.error('❌ Bot Discord\'a bağlanamadı:', err.message);
  });
}
