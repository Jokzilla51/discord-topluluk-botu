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
        lastDailyResetDate: parsed.lastDailyResetDate || ''
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
    lastDailyResetDate: ''
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Data kaydetme hatası:', e);
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
// (Kanala atılan SS'leri yakalamak için MessageContent, ses takibi için GuildVoiceStates aktif)
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const activeGiveaways = new Map();
const activeScrims = new Map();
const activePolls = new Map();
const activeEvents = new Map();
const userSubProgress = new Map();
const activeClaimedTickets = new Map();
let applicationCounter = 1;

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

    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
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

    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
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

    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
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
    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
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

// 5. Sadece Yöneticilerin Görebileceği #temiz-log Kanalı
async function getOrCreateCleanLogChannel(guild) {
  try {
    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
    let ch = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('temiz-log') || c.name.includes('onay-log')));
    if (!ch) {
      ch = await guild.channels.create({
        name: '✅・temiz-log',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] }
        ]
      });
    }
    return ch;
  } catch (err) {
    console.error('Temiz log kanalı oluşturma hatası:', err);
    return null;
  }
}

// 6. Sadece Yöneticilerin Görebileceği #hile-log Kanalı
async function getOrCreateCheatLogChannel(guild) {
  try {
    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
    let ch = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('hile-log') || c.name.includes('kont-edilen') || c.name.includes('kont-log')));
    if (!ch) {
      ch = await guild.channels.create({
        name: '🚫・hile-log',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] }
        ]
      });
    }
    return ch;
  } catch (err) {
    console.error('Hile log kanalı oluşturma hatası:', err);
    return null;
  }
}

// 7. Yetkili / Yönetici Kontrolü
function isStaffMember(member, data) {
  if (!member || !member.roles) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      member.permissions.has(PermissionFlagsBits.ManageRoles) ||
      member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;

  const allStaffRoles = [
    ...(data?.staffRoleIds || []),
    ...(data?.ticketStaffRoleIds || []),
    ...(data?.aboneStaffRoleIds || [])
  ];
  return member.roles.cache.some(r => allStaffRoles.includes(r.id) || r.name.toLowerCase().includes('yetkili') || r.name.toLowerCase().includes('mod') || r.name.toLowerCase().includes('admin'));
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

// Yetkili Mesai Sisteminin Canlı Olup Olmadığını Kontrol Eden Fonksiyon (Yarın Sabah 09:00'a Kadar Bekler)
function isStaffTrackingLive() {
  const now = new Date();
  const turkeyDate = new Date(now.getTime() + (3 * 60 * 60 * 1000));
  const year = turkeyDate.getUTCFullYear();
  const month = String(turkeyDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(turkeyDate.getUTCDate()).padStart(2, '0');
  const hour = turkeyDate.getUTCHours();
  const dateStr = `${year}-${month}-${day}`;

  // 26 Ağustos 2026 saat 09:00'dan önce başlatma (Yarın sabah 09:00'da başlar)
  if (dateStr < '2026-08-26') return false;
  if (dateStr === '2026-08-26' && hour < 9) return false;
  return true;
}

// 8. #yetkili-sıralaması Kanalı
async function getOrCreateStaffLeaderboardChannel(guild) {
  try {
    const data = loadData();
    if (data.staffLeaderboardChannelId) {
      const savedCh = guild.channels.cache.get(data.staffLeaderboardChannelId);
      if (savedCh) return savedCh;
    }

    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
    let ch = channels.find(c =>
      c && c.type === ChannelType.GuildText &&
      (c.name.includes('yetkili-siralama') || c.name.includes('yetkili-mesai') || c.name.includes('yetkili-tablo') || c.name.includes('mesai-takip'))
    );

    if (!ch) {
      ch = await guild.channels.create({
        name: '📊・yetkili-sıralaması',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels] }
        ]
      });
      data.staffLeaderboardChannelId = ch.id;
      saveData(data);
    }
    return ch;
  } catch (err) {
    console.error('Yetkili sıralama kanalı oluşturma hatası:', err);
    return null;
  }
}

// 9. Canlı Sıralama Tablosunu Güncelle (Komutsuz & Otomatik)
async function updateStaffLeaderboard(guild) {
  try {
    const data = loadData();
    if (!data.staffStats) data.staffStats = {};

    const ch = await getOrCreateStaffLeaderboardChannel(guild);
    if (!ch) return;

    // Eğer yarın sabah 09:00'dan önce ise geri sayım paneli göster
    if (!isStaffTrackingLive()) {
      const preEmbed = new EmbedBuilder()
        .setColor('#8B5CF6')
        .setAuthor({ name: 'Vyron Klan Yönetimi • Canlı Yetkili Mesai & Sıralama', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
        .setTitle('👑 GÜNLÜK YETKİLİ MESAİ & LİDERLİK TABLOSU')
        .setDescription(
          `📌 **Mesai Saatleri:** \`09:00 - 00:00 (Gece 12)\`\n` +
          `⏱️ **Vardiya Durumu:** ⏳ **Resmi Başlangıç: Yarın Sabah 09:00**\n\n` +
          `*Yetkili mesai ve liderlik sistemi yarın sabah 09:00'da resmi olarak başlayacaktır. Tüm yetkililer eşit ve sıfır puanla başlayacaktır.*\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `>>> ℹ️ *Sistem yarın sabah 09:00'da canlı takibe başlayacaktır.*`
        )
        .setFooter({ text: `${FOOTER_TEXT} • Otomatik Canlı Tablo` })
        .setTimestamp();

      const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('staff_refresh_leaderboard').setLabel('🔄 Tabloyu Yenile').setStyle(ButtonStyle.Secondary).setEmoji('⚡')
      );

      let msg = null;
      if (data.staffLeaderboardMessageId) {
        msg = await ch.messages.fetch(data.staffLeaderboardMessageId).catch(() => null);
      }
      if (msg) {
        await msg.edit({ embeds: [preEmbed], components: [refreshRow] }).catch(() => {});
      } else {
        const newMsg = await ch.send({ embeds: [preEmbed], components: [refreshRow] }).catch(() => {});
        if (newMsg) {
          data.staffLeaderboardMessageId = newMsg.id;
          data.staffLeaderboardChannelId = ch.id;
          saveData(data);
        }
      }
      return;
    }

    const now = new Date();
    const turkeyHour = (now.getUTCHours() + 3) % 24;
    const isShiftActive = turkeyHour >= 9 && turkeyHour < 24;

    const staffList = [];
    const members = await guild.members.fetch().catch(() => guild.members.cache);

    for (const [userId, member] of members) {
      if (member.user.bot) continue;
      const isStaff = isStaffMember(member, data);
      const hasStats = data.staffStats[userId] !== undefined;

      if (!isStaff && !hasStats) continue;

      const userStats = data.staffStats[userId] || {
        todayVoice: 0,
        totalVoice: 0,
        todayTicketMsgs: 0,
        totalTicketMsgs: 0,
        todayClaimed: 0,
        totalClaimed: 0,
        todayTickets: 0,
        totalTickets: 0,
        voiceJoinedAt: null
      };

      let liveVoiceTime = userStats.todayVoice || 0;
      let isCurrentlyInVoice = false;

      if (member.voice && member.voice.channelId && member.voice.channelId !== guild.afkChannelId) {
        isCurrentlyInVoice = true;
        if (userStats.voiceJoinedAt) {
          liveVoiceTime += (Date.now() - userStats.voiceJoinedAt);
        }
      }

      // Puan Formülü: 1 dk seste = 2p, 1 üstlenilen talep = 20p, 1 çözülen talep = 25p, 1 ticket mesajı = 2p
      const score = Math.floor(liveVoiceTime / 60000) * 2 +
                    (userStats.todayClaimed || 0) * 20 +
                    (userStats.todayTickets || 0) * 25 +
                    (userStats.todayTicketMsgs || 0) * 2;

      staffList.push({
        member,
        userId,
        todayVoice: liveVoiceTime,
        totalVoice: (userStats.totalVoice || 0) + (liveVoiceTime - (userStats.todayVoice || 0)),
        todayTicketMsgs: userStats.todayTicketMsgs || 0,
        todayClaimed: userStats.todayClaimed || 0,
        todayTickets: userStats.todayTickets || 0,
        score,
        isCurrentlyInVoice
      });
    }

    // Puana ve seste kalma süresine göre sırala
    staffList.sort((a, b) => b.score - a.score || b.todayVoice - a.todayVoice);

    const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    let rankText = '';

    if (staffList.length === 0) {
      rankText = '>>> ℹ️ *Henüz mesai yapan veya seste aktif olan bir yetkili bulunmuyor.*';
    } else {
      staffList.slice(0, 15).forEach((item, idx) => {
        const icon = rankIcons[idx] || `\`#${idx + 1}\``;
        const voiceStatus = item.isCurrentlyInVoice ? '🟢 **Seste**' : '⚪ **Boşta**';
        rankText += `${icon} **${item.member.displayName}** (${item.member})\n` +
          `🎙️ **Seste:** \`${formatDuration(item.todayVoice)}\` (${voiceStatus})\n` +
          `✋ **Üstlenen:** \`${item.todayClaimed} talep\` • 💬 **Destek Mesajı:** \`${item.todayTicketMsgs} adet\` • ✅ **Çözülen:** \`${item.todayTickets} adet\`\n` +
          `⭐ **Performans Puanı:** \`${item.score} Puan\`\n\n`;
      });
    }

    const leaderboardEmbed = new EmbedBuilder()
      .setColor('#8B5CF6')
      .setAuthor({ name: 'Vyron Klan Yönetimi • Canlı Yetkili Mesai & Sıralama', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
      .setTitle('👑 GÜNLÜK YETKİLİ MESAİ & LİDERLİK TABLOSU')
      .setDescription(
        `📌 **Mesai Saatleri:** \`09:00 - 00:00 (Gece 12)\`\n` +
        `⏱️ **Vardiya Durumu:** ${isShiftActive ? '🟢 **Aktif Mesai (Saat 09:00 - 00:00)**' : '🌙 **Gece Dinlenme Aralığı (00:00 - 09:00)**'}\n\n` +
        `*Yetkililerin ses süreleri, üstlendikleri talepler, ticket mesajları ve çözümleri **komutsuz olarak 7/24 otomatik** hesaplanır ve canlı güncellenir.*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        rankText
      )
      .setFooter({ text: `${FOOTER_TEXT} • Otomatik Canlı Tablo` })
      .setTimestamp();

    const refreshRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('staff_refresh_leaderboard')
        .setLabel('🔄 Tabloyu Yenile')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚡')
    );

    let msg = null;
    if (data.staffLeaderboardMessageId) {
      msg = await ch.messages.fetch(data.staffLeaderboardMessageId).catch(() => null);
    }

    if (msg) {
      await msg.edit({ embeds: [leaderboardEmbed], components: [refreshRow] }).catch(() => {});
    } else {
      const newMsg = await ch.send({ embeds: [leaderboardEmbed], components: [refreshRow] }).catch(() => {});
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

// 10. Gece 00:00 Otomatik Kapanış & Günün Yıldızı Raporu
async function checkNightlyShiftReset() {
  try {
    if (!isStaffTrackingLive()) return; // Yarın sabah 09:00'dan önce çalışmaz

    const now = new Date();
    const turkeyHour = (now.getUTCHours() + 3) % 24;
    const todayStr = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;

    const data = loadData();
    if (!data.staffStats) data.staffStats = {};

    // Gece 00:00 olduğunda ve bugün henüz kapanış yapılmadıysa
    if (turkeyHour === 0 && data.lastDailyResetDate !== todayStr) {
      data.lastDailyResetDate = todayStr;

      const guilds = client.guilds.cache;
      for (const [_, guild] of guilds) {
        const ch = await getOrCreateStaffLeaderboardChannel(guild);
        if (ch) {
          let topStaff = null;
          let topScore = -1;

          for (const [userId, stats] of Object.entries(data.staffStats || {})) {
            const score = Math.floor((stats.todayVoice || 0) / 60000) * 2 +
                          (stats.todayClaimed || 0) * 20 +
                          (stats.todayTickets || 0) * 25 +
                          (stats.todayTicketMsgs || 0) * 2;

            if (score > topScore && score > 0) {
              topScore = score;
              topStaff = { userId, stats, score };
            }
          }

          if (topStaff) {
            const nightEmbed = new EmbedBuilder()
              .setColor('#10B981')
              .setAuthor({ name: 'Vyron Klan Yönetimi • Gece Kapanış Raporu', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
              .setTitle('🌙 GÜNÜN MESAİSİ TAMAMLANDI & GÜNÜN YILDIZI!')
              .setDescription(
                `Bugünün mesaisi saat **00:00** itibarıyla tamamlandı!\n\n` +
                `🏆 **GÜNÜN EN ÇALIŞKAN YETKİLİSİ:** <@${topStaff.userId}>\n` +
                `🎙️ **Seste Süre:** \`${formatDuration(topStaff.stats.todayVoice)}\`\n` +
                `✋ **Üstlenilen Talep:** \`${topStaff.stats.todayClaimed || 0} adet\`\n` +
                `💬 **Destek Mesajı:** \`${topStaff.stats.todayTicketMsgs || 0} adet\`\n` +
                `✅ **Çözülen Talep:** \`${topStaff.stats.todayTickets || 0} adet\`\n` +
                `⭐ **Kazanılan Toplam Puan:** \`${topStaff.score} Puan\`\n\n` +
                `Tüm yetkili ekibimize emekleri için teşekkür ederiz! Yarın sabah 09:00'da yeni vardiya başlayacaktır. ⚔️💎`
              )
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp();

            await ch.send({ content: `📢 @everyone 🌙 **GÜNÜN YETKİLİ MESAİ RAPORU!**`, embeds: [nightEmbed] }).catch(() => {});
          }
        }

        // Günlük sayaçları toplam hafızaya aktar ve günlükleri sıfırla
        for (const [userId, stats] of Object.entries(data.staffStats || {})) {
          stats.totalVoice = (stats.totalVoice || 0) + (stats.todayVoice || 0);
          stats.totalTicketMsgs = (stats.totalTicketMsgs || 0) + (stats.todayTicketMsgs || 0);
          stats.totalClaimed = (stats.totalClaimed || 0) + (stats.todayClaimed || 0);
          stats.totalTickets = (stats.totalTickets || 0) + (stats.todayTickets || 0);
          stats.todayVoice = 0;
          stats.todayTicketMsgs = 0;
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

  // 7. /yetkili-rapor (DETAYLI YETKİLİ KARNESİ)
  new SlashCommandBuilder()
    .setName('yetkili-rapor')
    .setDescription('Seçilen yetkilinin (veya genel ekibin) günlük ve toplam mesai karnesini gösterir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option =>
      option.setName('yetkili')
        .setDescription('Raporu görüntülenecek yetkili (Boş bırakılırsa genel özet çıkar)')
        .setRequired(false)
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

  // 15. /scrim
  new SlashCommandBuilder()
    .setName('scrim')
    .setDescription('Klan içi maç için otomatik takım dağıtıcılı scrim lobisi başlatır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option =>
      option.setName('format')
        .setDescription('Kaça kaç maç yapılacak?')
        .setRequired(true)
        .addChoices(
          { name: '⚔️ 2v2 (Toplam 4 Kişi)', value: '4' },
          { name: '⚔️ 3v3 (Toplam 6 Kişi)', value: '6' },
          { name: '⚔️ 4v4 (Toplam 8 Kişi)', value: '8' },
          { name: '⚔️ 5v5 (Toplam 10 Kişi)', value: '10' }
        )
    )
    .addStringOption(option =>
      option.setName('aciklama')
        .setDescription('Maç açıklaması veya sunucu IP bilgisi (İsteğe bağlı)')
        .setRequired(false)
    ),

  // 16. /kilit
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
    console.log('⚡ Tüm komutlar sunuculara anında yükleniyor...');
    const guilds = await client.guilds.fetch();
    for (const [guildId] of guilds) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands.map(cmd => cmd.toJSON()) }
      );
      console.log(`✅ Komutlar yüklendi: ${guildId}`);
    }

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );

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
    if (!isStaffTrackingLive()) return; // Yarın sabah 09:00'a kadar ses takibi kapalı

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

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
        userStats.totalVoice = (userStats.totalVoice || 0) + duration;
        userStats.voiceJoinedAt = null;
        saveData(data);
      }
    }
    // 3. Kanal Değiştirdi
    else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      if (newState.channelId === newState.guild.afkChannelId) {
        // AFK odasına geçtiyse süreyi durdur
        if (userStats.voiceJoinedAt) {
          const duration = Date.now() - userStats.voiceJoinedAt;
          userStats.todayVoice = (userStats.todayVoice || 0) + duration;
          userStats.totalVoice = (userStats.totalVoice || 0) + duration;
          userStats.voiceJoinedAt = null;
          saveData(data);
        }
      } else {
        // Normal odaya geçtiyse
        if (userStats.voiceJoinedAt) {
          const duration = Date.now() - userStats.voiceJoinedAt;
          userStats.todayVoice = (userStats.todayVoice || 0) + duration;
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
// 5. KANALA ATILAN SS'LERİ OTOMATİK OKUYAN DİNLEYİCİ (MESSAGE CREATE)
// ==========================================
client.on('messageCreate', async (message) => {
  try {
    // Botların mesajlarını ve DM'leri yoksay
    if (message.author.bot || !message.guild) return;

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

    // Üstlenilen Ticket Mesaj Kontrolü (Sadece üstlenen yetkili, talep sahibi ve Yönetici yazabilir)
    const claimInfo = activeClaimedTickets.get(message.channel.id);
    if (isTicketChannel && claimInfo) {
      const isClaimedStaff = message.author.id === claimInfo.claimedBy;
      const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
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
        data.staffStats[sId] = {
          todayVoice: 0,
          totalVoice: 0,
          todayTicketMsgs: 0,
          totalTicketMsgs: 0,
          todayClaimed: 0,
          totalClaimed: 0,
          todayTickets: 0,
          totalTickets: 0,
          voiceJoinedAt: null
        };
      }
      data.staffStats[sId].todayTicketMsgs = (data.staffStats[sId].todayTicketMsgs || 0) + 1;
      data.staffStats[sId].totalTicketMsgs = (data.staffStats[sId].totalTicketMsgs || 0) + 1;
      saveData(data);
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
// 6. ETKİLEŞİM VE İŞLEMLER (SLASH & BUTONLAR)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  try {
    // ----------------------------------------------------
    // A. SLASH KOMUTLARI
    // ----------------------------------------------------
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // 1. /yardim
      if (commandName === 'yardim') {
        const helpEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle('⚔️ Vyron Klan & Topluluk Botu Komut Rehberi')
          .setDescription('Vyron klanı ve topluluğu için gelişmiş yönetim sistemi:')
          .addFields(
            {
              name: '🤖 Yapay Zeka ile Otomatik Abone Rolü (Komutsuz)',
              value: '• Üyeler doğrudan `#abone-kanit` kanalına YouTube SS fotoğrafı atar.\n• Bot görseli yapay zeka ile otomatik okur, "Abone Olundu" yazısını tespit ettiği an **rolü kendisi verir!**\n• `/abone-kur` : Bilgilendirme panelini kurar.\n• `/abone-kanal` : SS atılacak kanalı ayarlar.'
            },
            {
              name: '🏆 Turnuva, Event & IGN Kayıt',
              value: '• `/turnuva-duyuru` : Katılım sayaçlı, Minecraft IGN toplayan ve `#🏆・turnuva-gelecek-olanlar` kanalına listeleyen turnuva sistemi.\n• `/duyuru` : Direkt GIF / Resim dosyası sürükleyip bırakabileceğiniz efektli ve temalı klan duyurusu.'
            },
            {
              name: '👑 Komutsuz Yetkili Mesai & Canlı Sıralama',
              value: '• 09:00 - 00:00 mesai saatlerinde yetkililerin seste kalma süreleri, mesajları ve çözdükleri talepler **komutsuz olarak 7/24 otomatik** hesaplanır!\n• Gece 00:00\'da günün yıldızı yetkilisi ilan edilir.\n• `/yetkili-siralama` : Canlı sıralama panosunu gösterir / yeniler.\n• `/yetkili-siralama-kur` : Sıralama tablosunu belirlenen kanala kurar.\n• `/yetkili-rapor` : Detaylı yetkili mesai karnesi gösterir.'
            },
            {
              name: '🔍 Sunucu Denetimi & Otomatik Kurulum',
              value: '• `/sunucu-analiz` : Mevcut kanallarını analiz eder, eksik kanalları ve panelleri tek tıkla kurar.'
            },
            {
              name: '⚔️ Klan & Başvuru Yönetimi (Sınırsız Yetkili)',
              value: '• `/basvuru-kur` : Kategori altında Anydesk onaylı başvuru ticket paneli kurar.\n• `/basvuru-yetkili` : Başvuru odalarını görebilecek yetkili rollerini sınırsız olarak ekler/çıkarır.\n• `/basvuru-kategori` : Başvuruların açılacağı kategoriyi ayarlar.\n• `/hile-rapor` : Hile kanıt SS dosyasını sürükleyip yönetici `#🚫・hile-log` kanalına loglar.\n• `/haftanin-oyuncusu` : Haftanın Trapcisi veya Elytracısı unvanını verir ve duyurur.\n• `/scrim` : Otomatik takım bölen klan içi maç lobisi açar.\n• `/klan-rutbe` : Has Klan Üyesi yapar veya klandan çıkarır.'
            },
            {
              name: '🎫 Kategorili Destek & Ticket (Sınırsız Yetkili)',
              value: '• `/ticket-kur` : Partnerlik, Çekiliş, Reklam, Boost, Destek ve Diğer kategorili açılır menülü ticket paneli.\n• `/ticket-yetkili` : Ticketları görebilecek yetkili rollerini sınırsız ekler/çıkarır.\n• `/ticket-kategori` : Ticket odalarının açılacağı kategoriyi ayarlar.'
            },
            {
              name: '🛡️ Güvenlik & Moderasyon',
              value: '• `/kilit` : Kanalı kilitleyip üye mesajlarına kapatır veya açar.\n• `/mute` : Kullanıcıyı süreli susturur (Timeout) ve loglar.\n• `/unmute` : Susturmayı kaldırır.\n• `/kick` : Kullanıcıyı sunucudan atar.\n• `/ban` : Kullanıcıyı sunucudan yasaklar.\n• `/sil` : Mesajları topluca siler (1-100).\n• `/dogrulama-kur` : Butonlu üye doğrulama paneli.'
            },
            {
              name: '🎉 Çekiliş, Anket & Topluluk',
              value: '• `/anket` : Canlı sayaçlı ve çift oy korumalı oylama başlatır.\n• `/cekilis` : Kazananları otomatik etiketleyen çekiliş sistemi.\n• `/reroll` : Çekilişten yeni kazanan seçer.\n• `/kullanici-bilgi` & `/sunucu-bilgi` : Detaylı istatistikler.'
            }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
      }

      // 2. /abone-kur (FOTOĞRAFTAKİ DETAYLI BİLGİLENDİRME & KANALA YÖNLENDİRME)
      if (commandName === 'abone-kur') {
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

        return interaction.reply({
          content: `✅ **Abone paneli ${targetChannel} kanalına kuruldu!**\n📸 Üyelerin SS atacağı kanal: ${chAboneLog || '#abone-kanit'}\n🏷️ Tanımlanan Rol: ${roleToUse ? roleToUse.name : 'Abone'}`,
          ephemeral: true
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
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        await updateStaffLeaderboard(guild);
        const data = loadData();
        const ch = guild.channels.cache.get(data.staffLeaderboardChannelId);
        return interaction.editReply({
          content: `✅ **Yetkili canlı mesai sıralaması güncellendi!**\n📊 Sıralama Panosu: ${ch || '#yetkili-sıralaması'}`
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

      // 6. /yetkili-rapor
      if (commandName === 'yetkili-rapor') {
        const targetUser = interaction.options.getUser('yetkili');
        const data = loadData();
        const guild = interaction.guild;

        if (targetUser) {
          const stats = data.staffStats?.[targetUser.id] || {
            todayVoice: 0,
            totalVoice: 0,
            todayTicketMsgs: 0,
            totalTicketMsgs: 0,
            todayClaimed: 0,
            totalClaimed: 0,
            todayTickets: 0,
            totalTickets: 0
          };

          const member = await guild.members.fetch(targetUser.id).catch(() => null);
          let liveVoice = stats.todayVoice || 0;
          if (member?.voice?.channelId && member.voice.channelId !== guild.afkChannelId && stats.voiceJoinedAt) {
            liveVoice += (Date.now() - stats.voiceJoinedAt);
          }

          const dailyScore = Math.floor(liveVoice / 60000) * 2 +
                             (stats.todayClaimed || 0) * 20 +
                             (stats.todayTickets || 0) * 25 +
                             (stats.todayTicketMsgs || 0) * 2;

          const userReportEmbed = new EmbedBuilder()
            .setColor('#8B5CF6')
            .setAuthor({ name: `${targetUser.username} • Yetkili Mesai Karnesi`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
            .setTitle(`📊 Yetkili Performans Detayı`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
              { name: '👤 Yetkili', value: `${targetUser} (\`${targetUser.tag}\`)`, inline: true },
              { name: '🎙️ Ses Durumu', value: member?.voice?.channelId ? `🟢 Seste (${member.voice.channel.name})` : '⚪ Boşta', inline: true },
              { name: '⭐ Günlük Puan', value: `\`${dailyScore} Puan\``, inline: true },
              { name: '📅 Bugünkü Seste Kalma', value: `\`${formatDuration(liveVoice)}\``, inline: true },
              { name: '✋ Bugünkü Üstlenilen Talep', value: `\`${stats.todayClaimed || 0} adet\``, inline: true },
              { name: '💬 Bugünkü Destek Mesajı', value: `\`${stats.todayTicketMsgs || 0} adet\``, inline: true },
              { name: '✅ Bugünkü Çözülen Talep', value: `\`${stats.todayTickets || 0} adet\``, inline: true },
              { name: '🏆 Toplam Seste Kalma (Genel)', value: `\`${formatDuration(stats.totalVoice || 0)}\``, inline: true },
              { name: '✋ Toplam Üstlenilen Talep', value: `\`${stats.totalClaimed || 0} adet\``, inline: true },
              { name: '💬 Toplam Destek Mesajı', value: `\`${stats.totalTicketMsgs || 0} adet\``, inline: true },
              { name: '✅ Toplam Çözülen Talep', value: `\`${stats.totalTickets || 0} adet\``, inline: true }
            )
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();

          return interaction.reply({ embeds: [userReportEmbed], ephemeral: true });
        } else {
          const ch = await getOrCreateStaffLeaderboardChannel(guild);
          await updateStaffLeaderboard(guild);
          return interaction.reply({
            content: `📊 **Tüm yetkililerin canlı mesai sıralaması ${ch} kanalında yer almaktadır!**\nBelirli bir yetkilinin detaylı karnesini görmek için \`/yetkili-rapor yetkili:@isim\` komutunu kullanabilirsiniz.`,
            ephemeral: true
          });
        }
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
            name: `${guild.name} • RESMİ KLAN ETKİNLİĞİ & TURNUVA`,
            iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL()
          })
          .setTitle(`🏆 〖 ${eventName.toUpperCase()} 〗 🏆`)
          .setDescription(
            `╭──────────────────────────────────────────────────╮\n` +
            `│ ⚔️ **VYRON KLAN TRAP TURNUVASI & TELAFİ EVENTİ**\n` +
            `╰──────────────────────────────────────────────────╯\n\n` +
            `>>> ${extraNote.replace(/\\n/g, '\n')}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .addFields(
            { name: '⏰ Başlama Zamanı', value: `🔥 **${dateTime}**`, inline: true },
            { name: '🌐 Sunucu IP Adresi', value: `🎮 \`${serverIp}\``, inline: true },
            { name: '🎁 Büyük Turnuva Ödülü', value: `💎 **${prize}**`, inline: false },
            { name: '🚪 Oyunda Katılım Komutu', value: '💡 `/event join` *(Zamanı gelince oyunda yazınız)*', inline: true },
            { name: '📋 Kayıtlı Katılımcı Listesi', value: attendeesChannel ? `${attendeesChannel}` : '`#turnuva-gelecek-olanlar`', inline: true },
            { name: '👑 Düzenleyen Yetkili', value: `${interaction.user}`, inline: true }
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
        let themeBadge = '👑 RESMİ KLAN DUYURUSU';
        let themeIcon = '✦';

        if (theme === 'war') {
          themeColor = '#EF4444';
          themeBadge = '⚔️ KRİTİK SAVAŞ & OPERASYON BİLDİRİSİ';
          themeIcon = '🔥';
        } else if (theme === 'cyber') {
          themeColor = '#00F0FF';
          themeBadge = '⚡ SİSTEM & ÖNEMLİ GÜNCELLEME';
          themeIcon = '⚡';
        } else if (theme === 'gold') {
          themeColor = '#F59E0B';
          themeBadge = '🏆 BÜYÜK TURNUVA & ÖDÜLLÜ ETKİNLİK';
          themeIcon = '🌟';
        } else if (theme === 'shield') {
          themeColor = '#10B981';
          themeBadge = '🛡️ GÜVENLİK & TOPLULUK KURALLARI';
          themeIcon = '💠';
        }

        const formattedText = message.replace(/\\n/g, '\n');

        const epicAnnouncementEmbed = new EmbedBuilder()
          .setColor(themeColor)
          .setAuthor({
            name: `${interaction.guild.name} • ${themeBadge}`,
            iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL()
          })
          .setTitle(`${themeIcon} 〖 ${title.toUpperCase()} 〗 ${themeIcon}`)
          .setDescription(
            `>>> ${formattedText}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .addFields(
            { name: '👑 Yetkili', value: `${interaction.user}`, inline: true },
            { name: '🏷️ Kategori', value: `\`${themeBadge}\``, inline: true },
            { name: '⏰ Yayın Zamanı', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        if (attachedImage && attachedImage.url) {
          epicAnnouncementEmbed.setImage(attachedImage.url);
        }

        const contentPing = pingEveryone
          ? `📢 @everyone ⚡ **DİKKAT! YENİ RESMİ VYRON DUYURUSU YAYINLANDI!** ⚔️`
          : undefined;

        await channel.send({
          content: contentPing,
          embeds: [epicAnnouncementEmbed]
        });

        return interaction.reply({ content: `✅ GIF/Görselli epik duyuru ${channel} kanalına başarıyla yayınlandı! 🚀`, ephemeral: true });
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
          .setTitle(`${roleEmoji} HAFTANIN OYUNCUSU SEÇİLDİ: ${roleName.toUpperCase()}`)
          .setDescription(
            `Tebrikler ${member}! Bu hafta Vyron klanımızda sergilediğin üstün mücadeleyle **${roleName}** unvanını kazandın! ⚔️\n\n` +
            `🏆 **Ödüllendirilen Savaşçı:** ${member}\n` +
            `📜 **Başarı Notu:** >>> ${reason}\n` +
            `👑 **Ödülü Veren:** ${interaction.user}`
          )
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const announceChannel = interaction.guild.channels.cache.find(c => c.name.includes('klan-duyuru') || c.name.includes('duyurular')) || interaction.channel;
        await announceChannel.send({ content: `📢 🏆 ${member} **${roleName}** unvanına layık görüldü! Herkes tebrik etsin! 🎉`, embeds: [awardEmbed] });

        return interaction.reply({ content: `✅ ${member} kullanıcısına **${roleName}** unvanı verildi ve duyurusu geçildi!`, ephemeral: true });
      }

      // 15. /scrim
      if (commandName === 'scrim') {
        const requiredCount = parseInt(interaction.options.getString('format'));
        const desc = interaction.options.getString('aciklama') || 'Vyron klan içi antrenman / scrim karşılaşması.';
        const scrimId = `scrim_${Date.now()}`;

        const scrimEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setTitle(`⚔️ VYRON KLAN SCRIM LOBİSİ (${requiredCount / 2}v${requiredCount / 2})`)
          .setDescription(
            `**${desc}**\n\n` +
            `🎯 **Gereken Oyuncu:** \`0 / ${requiredCount}\`\n` +
            `👥 **Katılanlar:** Henüz kimse katılmadı.\n\n` +
            `Maça girmek için aşağıdaki **"⚔️ Katıl"** butonuna basınız. Sayı tamamlanınca bot otomatik **Kırmızı** ve **Mavi** takımları kuracaktır!`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const scrimRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`scrim_join_${scrimId}_${requiredCount}`).setLabel('⚔️ Maça Katıl (0)').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`scrim_leave_${scrimId}_${requiredCount}`).setLabel('❌ Ayrıl').setStyle(ButtonStyle.Secondary)
        );

        const scrimMsg = await interaction.channel.send({ content: '📢 @here **YENİ SCRIM LOBİSİ AÇILDI!** ⚔️', embeds: [scrimEmbed], components: [scrimRow] });

        activeScrims.set(scrimId, {
          channelId: interaction.channel.id,
          messageId: scrimMsg.id,
          requiredCount,
          desc,
          hostId: interaction.user.id,
          players: new Set()
        });

        return interaction.reply({ content: `✅ Scrim lobisi başlatıldı!`, ephemeral: true });
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
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;

        const durationMs = ms(durationStr);
        if (!durationMs || durationMs < 5000) {
          return interaction.reply({ content: '❌ Geçersiz süre (Örn: `10s`, `30s`, `5m`, `1h`, `1d`). Minimum 5 saniye olmalıdır.', ephemeral: true });
        }

        const endTime = Math.floor((Date.now() + durationMs) / 1000);
        const giveawayId = `gw_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const giveawayEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setTitle(`🎉 ÇEKİLİŞ BAŞLADI: ${prize}`)
          .setDescription(
            `Katılmak için aşağıdaki **"🎉 Katıl"** butonuna basınız!\n\n` +
            `🎁 **Ödül:** **${prize}**\n` +
            `👑 **Kazanan Sayısı:** **${winnerCount}**\n` +
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
          endTime,
          hostId: interaction.user.id,
          participants: new Set()
        });

        await interaction.reply({ content: `✅ Çekiliş başarıyla ${targetChannel} kanalında başlatıldı! (Süre: ${durationStr})`, ephemeral: true });

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
    }

    // ----------------------------------------------------
    // B. SEÇİM MENÜSÜ (SELECT MENU) ETKİLEŞİMLERİ
    // ----------------------------------------------------
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_select_')) {
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

      const ticketStaffRoleIds = data.ticketStaffRoleIds || [];
      ticketStaffRoleIds.forEach(roleId => {
        const r = guild.roles.cache.get(roleId);
        if (r) {
          permissionOverwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels]
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

      const staffPings = ticketStaffRoleIds.map(id => `<@&${id}>`).join(' ');
      await ticketChannel.send({ content: `${applicant} ${staffPings}`, embeds: [insideEmbed], components: [closeRow] });

      return interaction.editReply({ content: `✅ **${catTitle}** odanız **${targetCategory ? targetCategory.name : 'Destek'}** kategorisi altında açıldı: ${ticketChannel}` });
    }

    // ----------------------------------------------------
    // C. MODAL AÇMA & GÖNDERME
    // ----------------------------------------------------
    // 0. Yetkili Sıralamasını Yenile Butonu
    if (interaction.isButton() && interaction.customId === 'staff_refresh_leaderboard') {
      await interaction.deferUpdate().catch(() => {});
      await updateStaffLeaderboard(interaction.guild);
      return;
    }

    // 0.1. Ticket / Başvuru Üstlenme Butonu (✋ Talebi Üstlen)
    if (interaction.isButton() && interaction.customId.startsWith('ticket_claim_action')) {
      const data = loadData();
      const member = interaction.member;

      if (!isStaffMember(member, data)) {
        return interaction.reply({ content: '❌ Bu talebi yalnızca yetkililer üstlenebilir!', ephemeral: true });
      }

      const channel = interaction.channel;
      const existingClaim = activeClaimedTickets.get(channel.id);
      if (existingClaim) {
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
            totalVoice: 0,
            todayTicketMsgs: 0,
            totalTicketMsgs: 0,
            todayClaimed: 0,
            totalClaimed: 0,
            todayTickets: 0,
            totalTickets: 0,
            voiceJoinedAt: null
          };
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

      const staffRoleIds = data.staffRoleIds || [];
      staffRoleIds.forEach(roleId => {
        const r = guild.roles.cache.get(roleId);
        if (r) {
          permissionOverwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels]
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

      const staffPings = staffRoleIds.map(id => `<@&${id}>`).join(' ');
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
          data.staffStats[staffId] = { todayVoice: 0, totalVoice: 0, todayTicketMsgs: 0, totalTicketMsgs: 0, todayClaimed: 0, totalClaimed: 0, todayTickets: 0, totalTickets: 0, voiceJoinedAt: null };
        }
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
          data.staffStats[staffId] = { todayVoice: 0, totalVoice: 0, todayTicketMsgs: 0, totalTicketMsgs: 0, todayClaimed: 0, totalClaimed: 0, todayTickets: 0, totalTickets: 0, voiceJoinedAt: null };
        }
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
        if (!member || !member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca sunucu yöneticileri yapabilir!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const roles = guild.roles.cache;
        const channels = guild.channels.cache;

        const clanRole = roles.find(r => r.name.toLowerCase().includes('klan üye') && !r.name.toLowerCase().includes('has')) || roles.find(r => r.name.toLowerCase().includes('klan'));
        const memberRole = roles.find(r => r.name.toLowerCase().includes('vyron • üye') || (r.name.toLowerCase().includes('üye') && !r.name.toLowerCase().includes('klan')));

        const results = [];

        let chTourney = await getOrCreateTourneyChannel(guild);
        results.push(`🏆 **#🏆・turnuva-gelecek-olanlar** kanalı hazır: ${chTourney}`);

        let chAboneLog = await getOrCreateAboneLogChannel(guild);
        results.push(`🔴 **#🌌・abone-kanit** kanalı hazır: ${chAboneLog}`);

        let applyCat = await getOrCreateApplyCategory(guild);
        results.push(`📁 **Kategori:** ${applyCat.name}`);

        let chApply = channels.find(c => c.name.includes('klan-başvuru') || c.name.includes('basvuru'));
        if (!chApply) {
          chApply = await guild.channels.create({
            name: 'klan-başvuru',
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
              { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
            ]
          });
          results.push(`📁 **#klan-başvuru** kanalı oluşturuldu: ${chApply}`);
        }

        let chCleanLog = await getOrCreateCleanLogChannel(guild);
        results.push(`🔒 **#✅・temiz-log** kanalı hazır: ${chCleanLog}`);

        let chCheatLog = await getOrCreateCheatLogChannel(guild);
        results.push(`🔒 **#🚫・hile-log** kanalı hazır: ${chCheatLog}`);

        let chApplyLog = channels.find(c => c.name.includes('başvuru-log') || c.name.includes('basvuru-log'));
        if (!chApplyLog) {
          chApplyLog = await guild.channels.create({
            name: 'başvuru-log',
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
              { id: member.roles.highest.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
            ]
          });
          results.push(`🔒 **#başvuru-log** kanalı oluşturuldu: ${chApplyLog}`);
        }

        if (chApply && clanRole) {
          const data = loadData();
          data.clanRoleId = clanRole.id;
          data.applyCategoryId = applyCat.id;
          saveData(data);

          const applyEmbed = new EmbedBuilder()
            .setColor('#8B5CF6')
            .setTitle(`⚔️ ${guild.name} - Klan Başvuru Paneli`)
            .setDescription(`Vyron klanımıza katılmak için aşağıdaki butona basarak formu doldurunuz. Başvurunuz gönderilince adınıza özel başvuru ticket odası açılacaktır.\n\n👇 Başvurmak için butona basınız.`)
            .setFooter({ text: FOOTER_TEXT });

          const applyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('btn_open_apply_default')
              .setLabel('⚔️ Klan Başvurusu Yap')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('📝')
          );

          await chApply.send({ embeds: [applyEmbed], components: [applyRow] });
          results.push(`✅ **Klan Başvuru Paneli** kuruldu: ${chApply}`);
        }

        let chVerify = channels.find(c => c.name.includes('doğrulama') || c.name.includes('dogrulama') || c.name.includes('kayıt') || c.name.includes('giris'));
        if (!chVerify) {
          chVerify = await guild.channels.create({
            name: 'doğrulama',
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
              { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
            ]
          });
          results.push(`📁 **#doğrulama** kanalı oluşturuldu: ${chVerify}`);
        }

        if (chVerify && memberRole) {
          const verifyEmbed = new EmbedBuilder()
            .setColor('#10B981')
            .setTitle(`🛡️ ${guild.name} Doğrulama`)
            .setDescription('Sunucumuza hoş geldiniz! Kanallara tam erişim kazanmak için aşağıdaki butona basınız.')
            .setFooter({ text: FOOTER_TEXT });

          const verifyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`verify_role_${memberRole.id}`)
              .setLabel('✅ Doğrula ve Giriş Yap')
              .setStyle(ButtonStyle.Success)
          );

          await chVerify.send({ embeds: [verifyEmbed], components: [verifyRow] });
          results.push(`✅ **Doğrulama Paneli** kuruldu: ${chVerify}`);
        }

        let chTicket = channels.find(c => c.name.includes('destek') || c.name.includes('ticket'));
        if (!chTicket) {
          chTicket = await guild.channels.create({
            name: 'destek-talebi',
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
              { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
            ]
          });
          results.push(`📁 **#destek-talebi** kanalı oluşturuldu: ${chTicket}`);
        }

        if (chTicket) {
          const ticketMenuEmbed = new EmbedBuilder()
            .setColor('#3B82F6')
            .setTitle(`📩 ${guild.name} - Destek & İletişim Paneli`)
            .setDescription(
              `Aşağıdaki açılır menüden açmak istediğiniz **talep kategorisini** seçiniz.\n` +
              `Talebinize göre yetkili ekibimiz sizinle özel odanızda ilgilenecektir.\n\n` +
              `🤝 **Partnerlik:** Partnerlik görüşmeleri için.\n` +
              `🎁 **Çekiliş:** Çekiliş ödülü teslimi / sponsorluk.\n` +
              `📢 **Reklam:** Reklam satın alma & görüşme.\n` +
              `🚀 **İnvite & Boost:** Davet ve Boost ödül talebi.\n` +
              `📩 **Genel Destek:** Sorular, öneriler ve şikayetler.\n` +
              `❓ **Diğer:** Diğer tüm konular ve talepleriniz için.`
            )
            .setFooter({ text: FOOTER_TEXT });

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`ticket_select_main_none`)
            .setPlaceholder('📂 Bir kategori seçiniz...')
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel('Partnerlik').setDescription('Partnerlik İçin Tıklayınız.').setValue('partnerlik').setEmoji('🤝'),
              new StringSelectMenuOptionBuilder().setLabel('Çekiliş').setDescription('Çekilişi Almak İçin Tıklayınız.').setValue('cekilis').setEmoji('🎁'),
              new StringSelectMenuOptionBuilder().setLabel('Reklam').setDescription('Reklam Satın Almak İstiyorsanız Tıklayınız.').setValue('reklam').setEmoji('📢'),
              new StringSelectMenuOptionBuilder().setLabel('İnvite & Boost').setDescription('İnvite Veya Boost Ödülünüzü Almak İçin Tıklayınız.').setValue('boost').setEmoji('🚀'),
              new StringSelectMenuOptionBuilder().setLabel('Genel Destek').setDescription('Genel soru ve yardım talepleri için.').setValue('destek').setEmoji('📩'),
              new StringSelectMenuOptionBuilder().setLabel('Diğer').setDescription('Diğer tüm konular ve talepleriniz için.').setValue('diger').setEmoji('❓')
            );

          await chTicket.send({ embeds: [ticketMenuEmbed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
          results.push(`✅ **Kategorili Destek Paneli** kuruldu: ${chTicket}`);
        }

        let chPunishLog = channels.find(c => c.name.includes('ceza-kayıt') || c.name.includes('ceza-log') || c.name.includes('moderasyon-log'));
        if (!chPunishLog) {
          chPunishLog = await guild.channels.create({
            name: 'ceza-kayıt-log',
            type: ChannelType.GuildText,
            permissionOverwrites: [
              { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
              { id: member.roles.highest.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
            ]
          });
          results.push(`🔒 **#ceza-kayıt-log** kanalı oluşturuldu: ${chPunishLog}`);
        }

        const completionEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle('🎉 Sunucu Eksikleri Otomatik Olarak Kuruldu!')
          .setDescription(`Bot sunucundaki eksik kanalları oluşturdu ve panelleri yerleştirdi:\n\n${results.join('\n\n')}`)
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

        const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                             interaction.member.permissions.has(PermissionFlagsBits.Administrator);
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

        const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                             interaction.member.permissions.has(PermissionFlagsBits.Administrator);
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

        const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                             interaction.member.permissions.has(PermissionFlagsBits.Administrator);
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

        const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                             interaction.member.permissions.has(PermissionFlagsBits.Administrator);
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
            data.staffStats[staffId] = { todayVoice: 0, totalVoice: 0, todayTicketMsgs: 0, totalTicketMsgs: 0, todayClaimed: 0, totalClaimed: 0, todayTickets: 0, totalTickets: 0, voiceJoinedAt: null };
          }
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

      // 7. SCRIM KATILMA & AYRILMA
      if (customId.startsWith('scrim_join_') || customId.startsWith('scrim_leave_')) {
        const isJoin = customId.startsWith('scrim_join_');
        const parts = customId.split('_');
        const scrimId = `${parts[2]}_${parts[3]}`;
        const requiredCount = parseInt(parts[4]);

        const scrim = activeScrims.get(scrimId);
        if (!scrim) return interaction.reply({ content: '❌ Bu scrim lobisi sona ermiş!', ephemeral: true });

        const userId = interaction.user.id;

        if (isJoin) {
          if (scrim.players.has(userId)) {
            return interaction.reply({ content: 'ℹ️ Zaten bu scrim lobisine katılmışsınız!', ephemeral: true });
          }
          scrim.players.add(userId);
        } else {
          if (!scrim.players.has(userId)) {
            return interaction.reply({ content: 'ℹ️ Zaten bu lobide değilsiniz!', ephemeral: true });
          }
          scrim.players.delete(userId);
        }

        const currentCount = scrim.players.size;
        const playerList = Array.from(scrim.players).map((id, index) => `${index + 1}. <@${id}>`).join('\n') || 'Henüz kimse katılmadı.';

        if (currentCount >= requiredCount) {
          const shuffledPlayers = Array.from(scrim.players).sort(() => 0.5 - Math.random());
          const half = Math.floor(shuffledPlayers.length / 2);
          const redTeam = shuffledPlayers.slice(0, half).map(id => `• <@${id}>`).join('\n');
          const blueTeam = shuffledPlayers.slice(half).map(id => `• <@${id}>`).join('\n');

          const readyEmbed = new EmbedBuilder()
            .setColor('#10B981')
            .setTitle(`🔥 SCRIM TAKIMLARI BELİRLENDİ! (${half}v${half})`)
            .setDescription(`Tüm oyuncular hazır! Takımlar kura ile belirlendi:\n\n` +
              `🔴 **KIRMIZI TAKIM:**\n${redTeam}\n\n` +
              `🔵 **MAVİ TAKIM:**\n${blueTeam}\n\n` +
              `⚔️ **Bol şanslar savaşçılar!** Odaya geçip maça başlayabilirsiniz.`
            )
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();

          await interaction.message.edit({ content: '🔥 **SCRIM MAÇI BAŞLIYOR!** 🔥', embeds: [readyEmbed], components: [] }).catch(() => {});
          activeScrims.delete(scrimId);

          return interaction.reply({ content: `🎉 Scrim doldu ve takımlar kuruldu!`, ephemeral: true });
        } else {
          const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setDescription(
              `**${scrim.desc}**\n\n` +
              `🎯 **Gereken Oyuncu:** \`${currentCount} / ${requiredCount}\`\n` +
              `👥 **Katılanlar:**\n${playerList}\n\n` +
              `Maça girmek için aşağıdaki **"⚔️ Katıl"** butonuna basınız!`
            );

          const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`scrim_join_${scrimId}_${requiredCount}`).setLabel(`⚔️ Maça Katıl (${currentCount})`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`scrim_leave_${scrimId}_${requiredCount}`).setLabel('❌ Ayrıl').setStyle(ButtonStyle.Secondary)
          );

          await interaction.message.edit({ embeds: [updateEmbed], components: [updatedRow] }).catch(() => {});

          return interaction.reply({
            content: isJoin ? `✅ Scrim lobisine katıldınız! (${currentCount}/${requiredCount})` : `⚠️ Scrim lobisinden ayrıldınız.`,
            ephemeral: true
          });
        }
      }

      // 8. ÇEKİLİŞE KATILMA
      if (customId.startsWith('gw_join_')) {
        const giveawayId = customId.replace('gw_join_', '');
        const gw = activeGiveaways.get(giveawayId);

        if (!gw) return interaction.reply({ content: '❌ Bu çekiliş sona ermiş.', ephemeral: true });

        const userId = interaction.user.id;
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
            data.staffStats[staffId] = { todayVoice: 0, totalVoice: 0, todayTicketMsgs: 0, totalTicketMsgs: 0, todayClaimed: 0, totalClaimed: 0, todayTickets: 0, totalTickets: 0, voiceJoinedAt: null };
          }
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
