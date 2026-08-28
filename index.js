/**
 * ============================================================================
 * ⚔️ VYRON TICKET, KLAN BAŞVURU & YAPAY ZEKA (OCR) ABONE DOĞRULAMA BOTU
 * ============================================================================
 * İÇERDİĞİ SİSTEMLER:
 * 1. ⚔️ Anydesk Onaylı Klan Başvuru Sistemi (Form + Özel Oda + DM Bildirimleri + Otomatik Kapatma)
 * 2. 🎫 Kategorili Destek (Ticket) Sistemi (Açılır Menü + Özel Oda + Kapatma)
 * 3. 🤖 Yapay Zeka (Tesseract OCR) 2 Kanal & Tam Ekran Zorunlu YouTube Abone Doğrulama
 * 4. 🔊 Toplu Ses Odası Taşıma & Çekme (/ses-tasi)
 * 
 * 🔒 Moderasyon, Ceza veya Tehlikeli Roller İÇERMEZ. %100 Güvenlidir.
 * ============================================================================
 */

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

let Tesseract;
try {
  Tesseract = require('tesseract.js');
} catch (e) {
  console.log('Tesseract.js ilk yüklemede hazır değil, gerektiğinde çağrılacak.');
}

// ==========================================
// 1. WEB SUNUCUSU (RENDER 7/24 UPTIME)
// ==========================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>⚔️ Vyron Ticket, Klan Başvuru & OCR Abone Botu 7/24 Aktif!</h1>');
}).listen(PORT, () => {
  console.log(`🌐 Web sunucusu ${PORT} portunda aktif.`);
});

// ==========================================
// 2. VERİ YÖNETİMİ & SABİTLER
// ==========================================
const DATA_FILE = path.join(__dirname, 'data.json');
const FOOTER_TEXT = 'Vyron Klanı • Güvenli Sistemler';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ticketStaffRoleIds: parsed.ticketStaffRoleIds || [],
        applyStaffRoleIds: parsed.applyStaffRoleIds || [],
        ticketCategoryId: parsed.ticketCategoryId || null,
        applyCategoryId: parsed.applyCategoryId || null,
        applyClanRoleId: parsed.applyClanRoleId || null,
        aboneChannelId: parsed.aboneChannelId || null,
        aboneRoleId: parsed.aboneRoleId || null,
        aboneLogChannelId: parsed.aboneLogChannelId || null,
        userSubscribedChannels: parsed.userSubscribedChannels || {}
      };
    }
  } catch (err) {
    console.error('Veri yükleme hatası:', err);
  }
  return {
    ticketStaffRoleIds: [],
    applyStaffRoleIds: [],
    ticketCategoryId: null,
    applyCategoryId: null,
    applyClanRoleId: null,
    aboneChannelId: null,
    aboneRoleId: null,
    aboneLogChannelId: null,
    userSubscribedChannels: {}
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Veri kaydetme hatası:', err);
  }
}

// Bellek İçi Takipçiler
const activeClaimedTickets = new Map(); // channelId -> { claimedBy, claimedAt }
const ticketTranscripts = new Map();     // channelId -> Array<{ author, content, timestamp }>

// ==========================================
// 3. YAPAY ZEKA (OCR) MOTORU (2 KANAL & TAM EKRAN ZORUNLU)
// ==========================================
async function analyzeYoutubeScreenshot(imageUrl) {
  try {
    if (!Tesseract) {
      try {
        Tesseract = require('tesseract.js');
      } catch (err) {
        console.error('Tesseract modülü bulunamadı.');
        return { isValid: false, error: 'Tesseract OCR modülü hazır değil.' };
      }
    }

    const result = await Tesseract.recognize(imageUrl, 'eng', {
      logger: () => {}
    });

    const rawText = (result?.data?.text || '').toLowerCase();
    
    // Karakter normalizasyonu
    const cleanText = rawText
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');

    // 1. ABONELİK İBARESİ KONTROLÜ
    const subKeywords = [
      'abone olundu', 'abonesiniz', 'abone', 'abonelik', 'subscribed', 'subscriber',
      'subscribers', 'abonniert', 'abonne', 'suscrito', 'bildirim', 'bildirimler',
      'zil', 'tumu', 'tum bildirimler', 'all notifications'
    ];
    const hasSub = subKeywords.some(k => cleanText.includes(k));

    // 2. TAM EKRAN / ARAYÜZ (FULLSCREEN) KONTROLÜ
    const uiKeywords = [
      'shorts', 'abonelikler', 'kitaplik', 'ana sayfa', 'home', 'subscriptions',
      'library', 'you', 'youtube', 'video', 'videolar', 'oynatma', 'begen',
      'paylas', 'indir', 'kaydet', 'yorum', 'arama', 'search', 'views',
      'goruntulenme', 'begenme', 'like', 'dislike', 'share', 'chrome',
      'google', 'opera', 'edge', 'com', 'http', 'https', 'abone ol'
    ];
    const matchedUI = uiKeywords.filter(k => cleanText.includes(k));
    
    // Saat Formatı Tespiti (Örn: 14:35, 20.15, 8:40, 11:22 PM)
    const timeMatch = cleanText.match(/\b\d{1,2}[:.]\d{2}\b/);
    const hasTimeOrBattery = timeMatch !== null || cleanText.includes('%') || cleanText.includes('4g') || cleanText.includes('5g') || cleanText.includes('lte') || cleanText.includes('wifi');

    const isFullScreen = (matchedUI.length >= 2) || (hasTimeOrBattery && matchedUI.length >= 1) || matchedUI.length >= 3;

    // 3. HEDEF KANAL KONTROLÜ (1. Kanal: @birimfonksiyons / 2. Kanal: @xFrozzeq)
    const isBirimChannel = cleanText.includes('birimfonksiyons') ||
                           cleanText.includes('birimfonksiyon') ||
                           cleanText.includes('birim') ||
                           cleanText.includes('fonksiyon');

    const isFrozChannel = cleanText.includes('xfrozzeq') ||
                          cleanText.includes('frozzeq') ||
                          cleanText.includes('froz') ||
                          cleanText.includes('sarsilmaz');

    const isVyronChannel = cleanText.includes('vyron');

    const detectedBirim = isBirimChannel || isVyronChannel;
    const detectedFroz = isFrozChannel;

    // Doğrulama Kontrolleri
    if (!hasSub) {
      return {
        isValid: false,
        reason: 'sub_not_found',
        message: 'Görselde "Abone Olundu" veya "Subscribed" yazısı tespit edilemedi.'
      };
    }

    if (!isFullScreen) {
      return {
        isValid: false,
        reason: 'not_fullscreen',
        message: 'Yüklediğiniz görsel kırpılmış görünüyor! Lütfen saat, şarj veya tarayıcı çubuğunun gözüktüğü TAM EKRAN ekran görüntüsü yükleyiniz.'
      };
    }

    if (!detectedBirim && !detectedFroz) {
      return {
        isValid: false,
        reason: 'wrong_channel',
        message: 'Bu ekran görüntüsü @birimfonksiyons veya @xFrozzeq kanallarımıza ait değil!'
      };
    }

    return {
      isValid: true,
      detectedBirim,
      detectedFroz,
      isFullScreen: true
    };
  } catch (error) {
    console.error('OCR Analiz Hatası:', error);
    return { isValid: false, reason: 'error', message: error.message };
  }
}

// ==========================================
// 4. YARDIMCI FONKSİYONLAR
// ==========================================
function isStaffMember(member, data) {
  if (!member) return false;
  if (member.guild && member.id === member.guild.ownerId) return true;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  
  const staffRoleIds = [
    ...(data?.ticketStaffRoleIds || []),
    ...(data?.applyStaffRoleIds || [])
  ];

  if (member.roles && member.roles.cache) {
    return member.roles.cache.some(r => {
      if (staffRoleIds.includes(r.id)) return true;

      const name = r.name.toLowerCase();
      const staffKeywords = [
        'aac',              // AAC / Anydesk & Anti-Cheat
        'ticket yetkili',   // Ticket Yetkilisi
        'ticket',           // Ticket
        'denetleyici',      // Denetleyici
        'denetimci',        // Denetimci
        'denetim',          // Denetim
        'd. admin',         // Deneme Admin
        'd.admin',          // D.Admin
        'd. mod',           // Deneme Mod
        'd.mod',            // D.Mod
        'admin',            // Admin
        'mod',              // Mod / Moderatör
        'yetkili',          // Yetkili
        'staff',            // Staff
        'yönetici',         // Yönetici
        'yonetici',         // Yonetici
        'kurucu',           // Kurucu
        'lider',            // Klan Lideri
        'kontrol'           // Hile / Anydesk Kontrol
      ];

      return staffKeywords.some(keyword => name.includes(keyword));
    });
  }
  return false;
}

async function getOrCreateCheatLogChannel(guild) {
  let ch = guild.channels.cache.find(c =>
    c.name === '🚫・hile-log' ||
    c.name === 'hile-log' ||
    c.name.includes('hile-log')
  );
  if (!ch) {
    ch = await guild.channels.create({
      name: '🚫・hile-log',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.SendMessages]
        }
      ]
    }).catch(() => null);
  }
  return ch;
}

async function getOrCreateAboneLogChannel(guild) {
  let ch = guild.channels.cache.find(c =>
    c.name === '🔴・abone-log' ||
    c.name === 'abone-log' ||
    c.name.includes('abone-log')
  );
  if (!ch) {
    ch = await guild.channels.create({
      name: '🔴・abone-log',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.SendMessages]
        }
      ]
    }).catch(() => null);
  }
  return ch;
}

// ==========================================
// 5. SLASH KOMUTLARI (TANIMLAR)
// ==========================================
const commands = [
  // 1. /basvuru-kur
  new SlashCommandBuilder()
    .setName('basvuru-kur')
    .setDescription('Anydesk onaylı resmi klan başvuru panelini kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Başvuru panelinin gönderileceği kanal (Örn: #klan-başvuru)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('klan_rolu')
        .setDescription('Başvurusu onaylanan üyelere otomatik verilecek klan rolü')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Başvuru ticket odalarının açılacağı kategori')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 2. /basvuru-yetkili
  new SlashCommandBuilder()
    .setName('basvuru-yetkili')
    .setDescription('Klan başvurularını inceleyecek yetkili rollerini ekler veya çıkarır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('islem')
        .setDescription('Yapılacak işlem')
        .setRequired(true)
        .addChoices(
          { name: '➕ Yetkili Rolü Ekle', value: 'ekle' },
          { name: '➖ Yetkili Rolü Çıkar', value: 'cikar' },
          { name: '📋 Rolleri Listele', value: 'liste' }
        )
    )
    .addRoleOption(option =>
      option.setName('rol')
        .setDescription('Eklenecek veya çıkarılacak yetkili rolü')
        .setRequired(false)
    ),

  // 3. /basvuru-kategori
  new SlashCommandBuilder()
    .setName('basvuru-kategori')
    .setDescription('Klan başvuru odalarının otomatik açılacağı kategoriyi ayarlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Başvuru kanallarının açılacağı kategori')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 4. /hile-rapor
  new SlashCommandBuilder()
    .setName('hile-rapor')
    .setDescription('Anydesk veya oyun içinde tespit edilen hile kanıtını log kanalına kaydeder.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('aday')
        .setDescription('Hile tespit edilen oyuncu/aday')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('hile_turu')
        .setDescription('Tespit edilen hile türü (Örn: Vape, Drip, Reach, Hitbox, Makro)')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option.setName('kanit_ss')
        .setDescription('Hile ekran görüntüsü / videosu')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('aciklama')
        .setDescription('Detaylı açıklama')
        .setRequired(false)
    ),

  // 5. /ticket-kur
  new SlashCommandBuilder()
    .setName('ticket-kur')
    .setDescription('Kategorili gelişmiş destek/ticket talep panelini kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Ticket panelinin gönderileceği kanal (Örn: #destek-talebi)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Ticket odalarının açılacağı kategori')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 6. /ticket-yetkili
  new SlashCommandBuilder()
    .setName('ticket-yetkili')
    .setDescription('Destek taleplerini yönetecek yetkili rollerini ekler veya çıkarır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('islem')
        .setDescription('Yapılacak işlem')
        .setRequired(true)
        .addChoices(
          { name: '➕ Yetkili Rolü Ekle', value: 'ekle' },
          { name: '➖ Yetkili Rolü Çıkar', value: 'cikar' },
          { name: '📋 Rolleri Listele', value: 'liste' }
        )
    )
    .addRoleOption(option =>
      option.setName('rol')
        .setDescription('Eklenecek veya çıkarılacak rol')
        .setRequired(false)
    ),

  // 7. /ticket-kategori
  new SlashCommandBuilder()
    .setName('ticket-kategori')
    .setDescription('Destek ticket odalarının açılacağı kategoriyi ayarlar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Ticket kanallarının açılacağı kategori')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 8. /abone-kur (Yapay Zeka OCR Otomatik Abone Paneli)
  new SlashCommandBuilder()
    .setName('abone-kur')
    .setDescription('Yapay Zeka (OCR) ile YouTube SS okuyan otomatik abone onay panelini kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Abone bilgilendirme ve yönlendirme panelinin gönderileceği kanal')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('abone_rolu')
        .setDescription('SS onaylandığında otomatik verilecek abone rolü (Örn: @Abone)')
        .setRequired(false)
    ),

  // 9. /abone-kanal (SS Atılacak Kanal)
  new SlashCommandBuilder()
    .setName('abone-kanal')
    .setDescription('Üyelerin YouTube abone ekran görüntüsü (SS) atacağı kanalı belirler.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Ekran görüntüsü atılacak kanal (Örn: #abone-ss)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 10. /ses-tasi (Toplu Ses Taşıma & Çekme)
  new SlashCommandBuilder()
    .setName('ses-tasi')
    .setDescription('Bir ses odasındaki tüm üyeleri topluca başka bir ses odasına taşır veya çeker.')
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
    .addChannelOption(option =>
      option.setName('kaynak_kanal')
        .setDescription('İçindeki üyelerin taşınacağı ses odası')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    )
    .addChannelOption(option =>
      option.setName('hedef_kanal')
        .setDescription('Üyelerin aktarılacağı hedef ses odası (Seçilmezse bulunduğunuz odaya çeker)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
    )
];

// ==========================================
// 6. CLIENT & EVENTLER
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once('ready', async () => {
  console.log(`🤖 Vyron Bot aktif: ${client.user.tag}`);
  client.user.setActivity('🎫 Destek • ⚔️ Klan • 🤖 AI OCR', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('⚡ Slash komutları yükleniyor...');
    for (const [guildId, guild] of client.guilds.cache) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands.map(cmd => cmd.toJSON()) }
      );
      console.log(`✅ Komutlar yüklendi: ${guild.name} (${guildId})`);
    }

    // Global komutları temizle
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [] }
    ).catch(() => {});
  } catch (err) {
    console.error('Komut yükleme hatası:', err);
  }
});

client.on('guildCreate', async (guild) => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
  } catch (e) {}
});

// ==========================================
// 7. MESAJ İZLEYİCİ (AI OCR & TRANSKRİPT)
// ==========================================
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const data = loadData();

    // ----------------------------------------------------
    // A. YAPAY ZEKA (OCR) YOUTUBE ABONE DOĞRULAMA (2 KANAL ZORUNLU)
    // ----------------------------------------------------
    const chName = message.channel.name.toLowerCase();
    const isAboneChannel = (data.aboneChannelId && message.channel.id === data.aboneChannelId) ||
                           chName.includes('abone-ss') || chName.includes('abone-yetki') || chName.includes('abone-onay') || chName.includes('abone-kanali');

    if (isAboneChannel && message.attachments.size > 0) {
      const attachment = message.attachments.first();
      const isImage = attachment.contentType && attachment.contentType.startsWith('image/');

      if (isImage) {
        await message.react('⏳').catch(() => {});

        const ocrResult = await analyzeYoutubeScreenshot(attachment.url);

        if (ocrResult.isValid) {
          const userId = message.author.id;
          if (!data.userSubscribedChannels) data.userSubscribedChannels = {};
          if (!data.userSubscribedChannels[userId]) {
            data.userSubscribedChannels[userId] = { birim: false, froz: false };
          }

          const userSubs = data.userSubscribedChannels[userId];
          if (ocrResult.detectedBirim) userSubs.birim = true;
          if (ocrResult.detectedFroz) userSubs.froz = true;
          saveData(data);

          const hasBothChannels = userSubs.birim && userSubs.froz;

          await message.reactions.removeAll().catch(() => {});

          if (hasBothChannels) {
            await message.react('✅').catch(() => {});

            const guild = message.guild;
            let roleGiven = false;
            let roleToAssign = data.aboneRoleId ? guild.roles.cache.get(data.aboneRoleId) : null;
            
            if (!roleToAssign) {
              roleToAssign = guild.roles.cache.find(r => r.name.toLowerCase().includes('abone') || r.name.toLowerCase().includes('vyron • abone'));
            }

            if (roleToAssign && message.member) {
              await message.member.roles.add(roleToAssign).catch(e => console.error('Abone rol verme hatası:', e));
              roleGiven = true;
            }

            // Kanala Tam Onay Mesajı
            const successEmbed = new EmbedBuilder()
              .setColor('#10B981')
              .setAuthor({ name: 'Vyron Yapay Zeka (AI OCR) Onay Sistemi', iconURL: message.author.displayAvatarURL({ dynamic: true }) })
              .setTitle('🎉 2 KANAL ABONELİĞİ DE BAŞARIYLA DOĞRULANDI!')
              .setDescription(
                `Tebrikler ${message.author}!\n\n` +
                `Yapay zeka (OCR) ekran görüntülerinizi inceledi ve **her iki resmi YouTube kanalımıza** olan aboneliğinizi onayladı:\n\n` +
                `✅ **1. Kanal:** \`@birimfonksiyons\` (Abone Olundu)\n` +
                `✅ **2. Kanal:** \`@xFrozzeq\` (Abone Olundu)\n\n` +
                (roleGiven ? `💎 **${roleToAssign.name}** rolünüz otomatik olarak tanımlandı!` : `💎 Abonelikleriniz onaylandı!`) + `\n` +
                `Ailemize hoş geldiniz! ⚔️`
              )
              .setFooter({ text: `${FOOTER_TEXT} • Otomatik AI Doğrulama` })
              .setTimestamp();

            await message.reply({ embeds: [successEmbed] });

            // Abone Log Kanalına Gönder
            const chLog = await getOrCreateAboneLogChannel(guild);
            if (chLog) {
              const logEmbed = new EmbedBuilder()
                .setColor('#10B981')
                .setAuthor({ name: 'Otomatik Abone Log', iconURL: guild.iconURL({ dynamic: true }) })
                .setTitle('🔴 YENİ ABONE ROLÜ VERİLDİ (2 KANAL TAM)')
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                  { name: '👤 Kullanıcı', value: `${message.author} (\`${message.author.tag}\` - \`${message.author.id}\`)`, inline: true },
                  { name: '🤖 Doğrulama', value: '`2/2 Kanal Tam Ekran OCR Onaylı`', inline: true },
                  { name: '⏰ Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                )
                .setImage(attachment.url)
                .setFooter({ text: FOOTER_TEXT })
                .setTimestamp();

              await chLog.send({ embeds: [logEmbed] }).catch(() => {});
            }
          } else {
            // Kısmi Onay (1/2 Kanal Tamamlandı)
            await message.react('🟡').catch(() => {});

            const completedChannel = ocrResult.detectedBirim ? '@birimfonksiyons' : '@xFrozzeq';
            const missingChannel = !userSubs.birim ? '1. Kanal (@birimfonksiyons)' : '2. Kanal (@xFrozzeq)';
            const missingLink = !userSubs.birim ? 'https://www.youtube.com/@birimfonksiyons' : 'https://www.youtube.com/@xFrozzeq';

            const partialEmbed = new EmbedBuilder()
              .setColor('#F59E0B')
              .setAuthor({ name: 'Vyron Yapay Zeka (AI OCR) Doğrulama', iconURL: message.author.displayAvatarURL({ dynamic: true }) })
              .setTitle('🟡 1/2 KANAL ONAYLANDI (SON ADIM!)')
              .setDescription(
                `Sayın ${message.author},\n\n` +
                `✅ **${completedChannel}** kanalımıza aboneliğiniz başarıyla doğrulandı!\n\n` +
                `⚠️ **Abone rolünü alabilmek için 2. kanalımıza da abone olmanız zorunludur.**\n\n` +
                `📌 **Kalan Kanal:** [${missingChannel}](${missingLink})\n` +
                `👉 Lütfen şimdi bu kanalın da **TAM EKRAN** ekran görüntüsünü bu kanala yükleyiniz.`
              )
              .setFooter({ text: `${FOOTER_TEXT} • 2 Kanal Zorunluluğu` })
              .setTimestamp();

            await message.reply({ embeds: [partialEmbed] });
          }
        } else {
          await message.reactions.removeAll().catch(() => {});
          await message.react('❌').catch(() => {});

          let failTitle = '❌ ABONELİK TESPİT EDİLEMEDİ';
          let failDesc = `Sayın ${message.author},\n\nYüklediğiniz ekran görüntüsünde **"Abone Olundu"** veya **"Subscribed"** yazısı net olarak tespit edilemedi.\n\n📌 Lütfen resmi YouTube kanallarımıza abone olup **tam ekran** bir görüntü yükleyiniz.`;

          if (ocrResult.reason === 'not_fullscreen') {
            failTitle = '⚠️ TAM EKRAN EKRAN GÖRÜNTÜSÜ GEREKLİ';
            failDesc = `Sayın ${message.author},\n\n` +
              `Yüklediğiniz ekran görüntüsü **kırpılmış** olarak algılandı!\n\n` +
              `🛡️ **Sahte / Kırpılmış SS Koruması:**\n` +
              `• Lütfen sadece abone butonunu kırparak atmayınız.\n` +
              `• **Telefonun üst saati, şarj yüzdesi** veya **bilgisayarın tarayıcı / görev çubuğunun** gözüktüğü **TAM EKRAN (Fullscreen)** ekran görüntüsü yükleyiniz.\n\n` +
              `🔍 *Sistemimiz kırpılmış görselleri güvenlik amacıyla otomatik olarak reddetmektedir.*`;
          } else if (ocrResult.reason === 'wrong_channel') {
            failTitle = '❌ HEDEF RESMİ KANAL BULUNAMADI';
            failDesc = `Sayın ${message.author},\n\n` +
              `Yüklediğiniz ekran görüntüsü resmi klan YouTube kanallarımıza ait değil!\n\n` +
              `📌 **Abone Olmanız Gereken Kanallar:**\n` +
              `1. [1. Kanal: @birimfonksiyons](https://www.youtube.com/@birimfonksiyons)\n` +
              `2. [2. Kanal: @xFrozzeq](https://www.youtube.com/@xFrozzeq)\n\n` +
              `👉 Lütfen bu kanallara abone olarak **TAM EKRAN** SS atınız.`;
          }

          const failEmbed = new EmbedBuilder()
            .setColor('#EF4444')
            .setAuthor({ name: 'Yapay Zeka (OCR) Doğrulama Kalkanı', iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTitle(failTitle)
            .setDescription(failDesc)
            .setFooter({ text: `${FOOTER_TEXT} • 2 Kanal & Tam Ekran Koruması` });

          await message.reply({ embeds: [failEmbed] });
        }
      }
    }

    // ----------------------------------------------------
    // B. TICKET KANAL MESAJLARINI TRANSKRİPTE EKLEME
    // ----------------------------------------------------
    const isTicket = chName.startsWith('ticket-') || chName.startsWith('basvuru-') || chName.startsWith('talep-');
    if (isTicket) {
      if (!ticketTranscripts.has(message.channel.id)) {
        ticketTranscripts.set(message.channel.id, []);
      }
      const history = ticketTranscripts.get(message.channel.id);
      history.push({
        author: `${message.author.tag} (${message.author.id})`,
        content: message.content || '[Medya / Ek]',
        timestamp: new Date().toLocaleTimeString('tr-TR')
      });
      if (history.length > 200) history.shift();
    }
  } catch (err) {
    console.error('Mesaj log hatası:', err);
  }
});

// ==========================================
// 8. ETKİLEŞİM İŞLEYİCİSİ (INTERACTION CREATE)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  try {
    const data = loadData();

    // ----------------------------------------------------
    // A. SLASH KOMUTLARI
    // ----------------------------------------------------
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;
      const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) || interaction.user.id === interaction.guild?.ownerId;

      // 1. /basvuru-kur
      if (commandName === 'basvuru-kur') {
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Sunucu Yöneticileri kullanabilir!', ephemeral: true });
        
        const targetChannel = interaction.options.getChannel('kanal');
        const clanRole = interaction.options.getRole('klan_rolu');
        const category = interaction.options.getChannel('kategori');

        if (clanRole) data.applyClanRoleId = clanRole.id;
        if (category) data.applyCategoryId = category.id;
        saveData(data);

        const applyEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setAuthor({ name: `${interaction.guild.name.toUpperCase()} • RESMİ KLAN ALIMI`, iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('⚔️ 〖 RESMİ KLAN BAŞVURU MERKEZİ 〗 ⚔️')
          .setDescription(
            `╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮\n` +
            `  👑 **VYRON KLANINA KATILMAK İÇİN BAŞVUR**\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            `Klanımıza katılmak, espor & klan savaşlarında yer almak istiyorsanız aşağıdaki butona tıklayarak başvuru formunu doldurunuz.\n\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n` +
            `📌 **Başvuru & Alım Şartları:**\n` +
            `• 🎮 Aktif Minecraft & Elytra / SMP PvP deneyimi\n` +
            `• 🖥️ **Anydesk / Hile Kontrolünü** eksiksiz kabul etmek\n` +
            `• 🎙️ Seste mikrofon açabilmek ve saygılı olmak\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n\n` +
            `👇 *Başvuru odanızı açmak için aşağıdaki butona basınız:*`
          )
          .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
          .setFooter({ text: `${FOOTER_TEXT} • Anydesk Onaylı Alım` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_open_apply_main')
            .setLabel('⚔️ Klan Başvurusu Yap')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
        );

        await targetChannel.send({ embeds: [applyEmbed], components: [row] });
        return interaction.reply({ content: `✅ **Klan başvuru paneli ${targetChannel} kanalına başarıyla kuruldu!**`, ephemeral: true });
      }

      // 2. /basvuru-yetkili
      if (commandName === 'basvuru-yetkili') {
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Sunucu Yöneticileri kullanabilir!', ephemeral: true });
        const action = interaction.options.getString('islem');
        const role = interaction.options.getRole('rol');

        if (action === 'ekle') {
          if (!role) return interaction.reply({ content: '❌ Lütfen bir rol seçiniz!', ephemeral: true });
          if (!data.applyStaffRoleIds.includes(role.id)) {
            data.applyStaffRoleIds.push(role.id);
            saveData(data);
          }
          return interaction.reply({ content: `✅ ${role} rolü **Başvuru Yetkilileri** listesine eklendi!`, ephemeral: true });
        } else if (action === 'cikar') {
          if (!role) return interaction.reply({ content: '❌ Lütfen bir rol seçiniz!', ephemeral: true });
          data.applyStaffRoleIds = data.applyStaffRoleIds.filter(id => id !== role.id);
          saveData(data);
          return interaction.reply({ content: `✅ ${role} rolü listeden çıkarıldı.`, ephemeral: true });
        } else {
          const list = data.applyStaffRoleIds.map(id => `<@&${id}>`).join(', ') || '*Kayıtlı rol yok.*';
          return interaction.reply({ content: `📋 **Kayıtlı Başvuru Yetkili Rolleri:**\n${list}`, ephemeral: true });
        }
      }

      // 3. /basvuru-kategori
      if (commandName === 'basvuru-kategori') {
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Sunucu Yöneticileri kullanabilir!', ephemeral: true });
        const cat = interaction.options.getChannel('kategori');
        data.applyCategoryId = cat.id;
        saveData(data);
        return interaction.reply({ content: `✅ Başvuru odaları artık **${cat.name}** kategorisinde açılacaktır.`, ephemeral: true });
      }

      // 4. /hile-rapor
      if (commandName === 'hile-rapor') {
        if (!isStaffMember(interaction.member, data)) {
          return interaction.reply({ content: '🚫 Bu komutu yalnızca yetkililer kullanabilir!', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('aday');
        const cheatType = interaction.options.getString('hile_turu');
        const proofAttachment = interaction.options.getAttachment('kanit_ss');
        const desc = interaction.options.getString('aciklama') || 'Anydesk / Oyun içi kontrol sırasında tespit edildi.';

        const chLog = await getOrCreateCheatLogChannel(interaction.guild);
        if (!chLog) return interaction.reply({ content: '❌ Hile log kanalı bulunamadı!', ephemeral: true });

        const cheatEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setAuthor({ name: 'Vyron Güvenlik & Hile Denetim', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTitle('🚫 〖 HİLE / İLLEGAL YAZILIM TESPİT EDİLDİ 〗 🚫')
          .addFields(
            { name: '👤 Şüpheli Oyuncu', value: `${targetUser} (\`${targetUser.tag}\` - \`${targetUser.id}\`)`, inline: true },
            { name: '🛡️ Denetleyen Yetkili', value: `${interaction.user}`, inline: true },
            { name: '⚠️ Hile / Yazılım Türü', value: `\`${cheatType}\``, inline: true },
            { name: '⏰ Tespit Tarihi', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
            { name: '📝 Yetkili Notu', value: `>>> ${desc}`, inline: false }
          )
          .setImage(proofAttachment.url)
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        await chLog.send({ embeds: [cheatEmbed] });
        return interaction.reply({ content: `✅ ${targetUser} hakkındaki hile raporu başarıyla ${chLog} kanalına iletildi.`, ephemeral: true });
      }

      // 5. /ticket-kur
      if (commandName === 'ticket-kur') {
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Sunucu Yöneticileri kullanabilir!', ephemeral: true });
        const targetChannel = interaction.options.getChannel('kanal');
        const category = interaction.options.getChannel('kategori');

        if (category) data.ticketCategoryId = category.id;
        saveData(data);

        const ticketEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setAuthor({ name: `${interaction.guild.name.toUpperCase()} • DESTEK MERKEZİ`, iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🎫 〖 KULLANICI DESTEK & TALEP MERKEZİ 〗 🎫')
          .setDescription(
            `Merhaba! Bir sorununuz, talebiniz veya iş birliği teklifiniz mi var?\n` +
            `Aşağıdaki menüden ilgili departmanı seçerek anında destek talebi oluşturabilirsiniz.\n\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n` +
            `📂 **Mevcut Destek Departmanları:**\n` +
            `• 🤝 **Partnerlik & Sunucu Anlaşmaları**\n` +
            `• 🎉 **Çekiliş & Ödül Teslimatı**\n` +
            `• 📢 **Reklam & Sponsorluk**\n` +
            `• 🚀 **Server Boost & VIP Avantajları**\n` +
            `• ⚙️ **Genel Destek & Şikayet**\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n\n` +
            `👇 *Lütfen aşağıdaki menüden işlem türünü seçiniz:*`
          )
          .setFooter({ text: `${FOOTER_TEXT} • 7/24 Aktif Destek` });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_select_category')
          .setPlaceholder('📂 Destek almak istediğiniz konuyu seçiniz...')
          .addOptions([
            { label: 'Partnerlik & Anlaşma', value: 'partner', emoji: '🤝', description: 'Sunucu partnerlik görüşmeleri' },
            { label: 'Çekiliş & Ödül Teslim', value: 'giveaway', emoji: '🎉', description: 'Kazandığınız ödüllerin teslimatı' },
            { label: 'Reklam & Sponsorluk', value: 'sponsor', emoji: '📢', description: 'Reklam ve özel sponsorluk talepleri' },
            { label: 'Boost & VIP Avantajları', value: 'boost', emoji: '🚀', description: 'Sunucuya boost basanlara özel roller' },
            { label: 'Genel Destek & Şikayet', value: 'general', emoji: '⚙️', description: 'Kural ihlalleri, soru ve öneriler' }
          ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await targetChannel.send({ embeds: [ticketEmbed], components: [row] });
        return interaction.reply({ content: `✅ **Ticket paneli ${targetChannel} kanalına başarıyla gönderildi!**`, ephemeral: true });
      }

      // 6. /ticket-yetkili
      if (commandName === 'ticket-yetkili') {
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Sunucu Yöneticileri kullanabilir!', ephemeral: true });
        const action = interaction.options.getString('islem');
        const role = interaction.options.getRole('rol');

        if (action === 'ekle') {
          if (!role) return interaction.reply({ content: '❌ Lütfen bir rol seçiniz!', ephemeral: true });
          if (!data.ticketStaffRoleIds.includes(role.id)) {
            data.ticketStaffRoleIds.push(role.id);
            saveData(data);
          }
          return interaction.reply({ content: `✅ ${role} rolü **Ticket Yetkilileri** listesine eklendi!`, ephemeral: true });
        } else if (action === 'cikar') {
          if (!role) return interaction.reply({ content: '❌ Lütfen bir rol seçiniz!', ephemeral: true });
          data.ticketStaffRoleIds = data.ticketStaffRoleIds.filter(id => id !== role.id);
          saveData(data);
          return interaction.reply({ content: `✅ ${role} rolü listeden çıkarıldı.`, ephemeral: true });
        } else {
          const list = data.ticketStaffRoleIds.map(id => `<@&${id}>`).join(', ') || '*Kayıtlı rol yok.*';
          return interaction.reply({ content: `📋 **Kayıtlı Ticket Yetkili Rolleri:**\n${list}`, ephemeral: true });
        }
      }

      // 7. /ticket-kategori
      if (commandName === 'ticket-kategori') {
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Sunucu Yöneticileri kullanabilir!', ephemeral: true });
        const cat = interaction.options.getChannel('kategori');
        data.ticketCategoryId = cat.id;
        saveData(data);
        return interaction.reply({ content: `✅ Ticket odaları artık **${cat.name}** kategorisinde açılacaktır.`, ephemeral: true });
      }

      // 8. /abone-kur
      if (commandName === 'abone-kur') {
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Sunucu Yöneticileri kullanabilir!', ephemeral: true });
        const targetChannel = interaction.options.getChannel('kanal');
        const customRole = interaction.options.getRole('abone_rolu');
        const guild = interaction.guild;

        const roleToUse = customRole || guild.roles.cache.find(r => r.name.toLowerCase().includes('abone')) || guild.roles.cache.find(r => r.name.toLowerCase().includes('vyron • abone'));

        if (roleToUse) {
          data.aboneRoleId = roleToUse.id;
          saveData(data);
        }

        const roleMention = roleToUse ? `<@&${roleToUse.id}>` : '@Vyron • Abone';
        const channelMention = data.aboneChannelId ? `<#${data.aboneChannelId}>` : targetChannel;

        const aboneEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setAuthor({ name: 'Vyron Abone Rolü Bilgilendirme', iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🔴 VYRON ABONE ROLÜ BİLGİLENDİRME')
          .setDescription(
            `## 🌟 ${roleMention} içeriği nedir?\n\n` +
            `> 💎 **O Arayıp Bulamadığınız Profil kodları ve Texture Packler**\n\n` +
            `> 🎁 **Private Buton Packleri** Haftada bir kişiye özel buton pack'i kazanma şansı!\n\n` +
            `> ⚔️ **Abonelere özel çekilişler (gear, kredi, vip)**\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `## ❓ ${roleMention} Almak için ne yapmalısınız?\n\n` +
            `Sadece yapmanız gereken aşağıdaki youtube kanallarına abone olup **TAM EKRANLI BİR ŞEKİLDE** ScreenShot alıp ${channelMention} kanalına SS'i atmanızdır.\n\n` +
            `📌 **1. Kanal:** https://www.youtube.com/@birimfonksiyons\n` +
            `📌 **2. Kanal:** https://www.youtube.com/@xFrozzeq\n\n` +
            `*(Her iki kanala da abone olmak ve tam ekran SS yüklemek zorunludur).*`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Yapay Zeka (OCR) Doğrulama` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('🔴 1. Kanal: @birimfonksiyons')
            .setStyle(ButtonStyle.Link)
            .setURL('https://www.youtube.com/@birimfonksiyons')
            .setEmoji('▶️'),
          new ButtonBuilder()
            .setLabel('🔴 2. Kanal: @xFrozzeq')
            .setStyle(ButtonStyle.Link)
            .setURL('https://www.youtube.com/@xFrozzeq')
            .setEmoji('▶️')
        );

        await targetChannel.send({ content: '@everyone @here', embeds: [aboneEmbed], components: [row] });
        return interaction.reply({ content: `✅ **Abone paneli ${targetChannel} kanalına başarıyla gönderildi!**`, ephemeral: true });
      }

      // 9. /abone-kanal
      if (commandName === 'abone-kanal') {
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Sunucu Yöneticileri kullanabilir!', ephemeral: true });
        const ch = interaction.options.getChannel('kanal');
        data.aboneChannelId = ch.id;
        saveData(data);
        return interaction.reply({ content: `✅ Yapay Zeka (OCR) ekran görüntüsü kanalı ${ch} olarak ayarlandı! Üyeler buraya SS attığında bot otomatik okuyacaktır.`, ephemeral: true });
      }

      // 10. /ses-tasi (TOPLU SES ODASI TAŞIMA VE ÇEKME)
      if (commandName === 'ses-tasi') {
        if (!isStaffMember(interaction.member, data) && !interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
          return interaction.reply({ content: '🚫 Bu komutu yalnızca yetkililer kullanabilir!', ephemeral: true });
        }

        const sourceChannel = interaction.options.getChannel('kaynak_kanal');
        let targetChannel = interaction.options.getChannel('hedef_kanal');

        if (!targetChannel) {
          targetChannel = interaction.member.voice?.channel;
        }

        if (!targetChannel) {
          return interaction.reply({
            content: '❌ Lütfen bir **hedef ses kanalı** seçiniz veya kendiniz bir **ses odasına giriş yapınız!**',
            ephemeral: true
          });
        }

        if (sourceChannel.id === targetChannel.id) {
          return interaction.reply({
            content: '⚠️ Kaynak kanal ile hedef kanal aynı olamaz!',
            ephemeral: true
          });
        }

        const membersToMove = Array.from(sourceChannel.members.values());
        if (membersToMove.length === 0) {
          return interaction.reply({
            content: `⚠️ ${sourceChannel} kanalında taşınacak hiç kimse bulunmuyor!`,
            ephemeral: true
          });
        }

        await interaction.deferReply({ ephemeral: false });

        let movedCount = 0;
        let failCount = 0;

        for (const m of membersToMove) {
          try {
            await m.voice.setChannel(targetChannel);
            movedCount++;
            await new Promise(r => setTimeout(r, 150));
          } catch (e) {
            failCount++;
          }
        }

        const moveEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setAuthor({ name: `${interaction.guild.name} • Toplu Ses Taşıma`, iconURL: interaction.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL() })
          .setTitle('🔊 〖 TOPLU SES TAŞIMA İŞLEMİ TAMAMLANDI 〗 🔊')
          .setDescription(
            `Yetkili ${interaction.user} tarafından ses odası aktarımı gerçekleştirildi:\n\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈\n` +
            `📤 **Kaynak Oda:** ${sourceChannel} (\`${sourceChannel.name}\`)\n` +
            `📥 **Hedef Oda:** ${targetChannel} (\`${targetChannel.name}\`)\n` +
            `👥 **Taşınan Kişi Sayısı:** \`${movedCount} üye\`\n` +
            (failCount > 0 ? `⚠️ *(${failCount} kişi bağlantı/yetki hatası sebebiyle taşınamadı).*` : '') + `\n` +
            `◈ ━━━━━━━━━━━━━━━━ ❖ ━━━━━━━━━━━━━━━━ ◈`
          )
          .setFooter({ text: `${FOOTER_TEXT} • Ses Yönetim Sistemi` })
          .setTimestamp();

        return interaction.editReply({ embeds: [moveEmbed] });
      }
    }

    // ----------------------------------------------------
    // B. KATEGORİLİ TICKET AÇMA (SELECT MENU)
    // ----------------------------------------------------
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
      const selected = interaction.values[0];
      const guild = interaction.guild;
      const user = interaction.user;

      const existingCh = guild.channels.cache.find(c => c.name.includes(`ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`));
      if (existingCh) {
        return interaction.reply({ content: `⚠️ Zaten açık bir destek talebiniz bulunuyor: ${existingCh}`, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const deptNames = {
        partner: 'Partnerlik',
        giveaway: 'Çekiliş-Ödül',
        sponsor: 'Sponsorluk',
        boost: 'Boost-VIP',
        general: 'Genel-Destek'
      };

      const deptTitle = deptNames[selected] || 'Destek';
      const staffRoleIds = data.ticketStaffRoleIds || [];

      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory]
        },
        {
          id: client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks]
        }
      ];

      for (const rId of staffRoleIds) {
        const r = guild.roles.cache.get(rId);
        if (r) {
          overwrites.push({
            id: r.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory]
          });
        }
      }

      const cleanUserName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
      const ticketChannel = await guild.channels.create({
        name: `ticket-${cleanUserName}`,
        type: ChannelType.GuildText,
        parent: data.ticketCategoryId || null,
        permissionOverwrites: overwrites
      }).catch(err => {
        console.error('Kanal açma hatası:', err);
        return null;
      });

      if (!ticketChannel) {
        return interaction.editReply({ content: '❌ Destek kanalı oluşturulamadı. Lütfen yetkiliye bildiriniz.' });
      }

      const welcomeEmbed = new EmbedBuilder()
        .setColor('#3B82F6')
        .setAuthor({ name: `${guild.name} • Destek Talebi`, iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setTitle(`🎫 ${deptTitle.toUpperCase()} TALEBİ AÇILDI`)
        .setDescription(
          `Hoş geldiniz ${user}!\n\n` +
          `Yetkili ekibimiz en kısa sürede sizinle ilgilenecektir.\n` +
          `Lütfen sorununuzu veya talebinizi detaylıca bu kanala yazınız.\n\n` +
          `📂 **Departman:** \`${deptTitle}\`\n` +
          `⏰ **Açılış Saati:** <t:${Math.floor(Date.now() / 1000)}:R>`
        )
        .setFooter({ text: FOOTER_TEXT });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_claim_action').setLabel('✋ Talebi Üstlen').setStyle(ButtonStyle.Success).setEmoji('📌'),
        new ButtonBuilder().setCustomId('ticket_close_action').setLabel('🔒 Talebi Kapat').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
      );

      const staffMentions = staffRoleIds.map(id => `<@&${id}>`).join(' ') || '@here';
      await ticketChannel.send({ content: `${user} | ${staffMentions}`, embeds: [welcomeEmbed], components: [row] });

      return interaction.editReply({ content: `✅ Destek talebiniz oluşturuldu: ${ticketChannel}` });
    }

    // ----------------------------------------------------
    // C. KLAN BAŞVURUSU BUTONU & MODAL FORMU
    // ----------------------------------------------------
    if (interaction.isButton() && interaction.customId === 'btn_open_apply_main') {
      const guild = interaction.guild;
      const user = interaction.user;

      const existingCh = guild.channels.cache.find(c => c.name.includes(`basvuru-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`));
      if (existingCh) {
        return interaction.reply({ content: `⚠️ Zaten açık bir başvurunuz bulunuyor: ${existingCh}`, ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_clan_apply_form')
        .setTitle('⚔️ Vyron Klanı Başvuru Formu');

      const ignInput = new TextInputBuilder()
        .setCustomId('apply_ign')
        .setLabel('Minecraft Oyun İçi Adınız (IGN)')
        .setPlaceholder('Örn: Jokzilla51')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(16);

      const ageInput = new TextInputBuilder()
        .setCustomId('apply_age')
        .setLabel('Yaşınız & Günlük Aktiflik Süreniz')
        .setPlaceholder('Örn: 17 yaşındayım, günde 4-5 saat aktifim')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const expInput = new TextInputBuilder()
        .setCustomId('apply_exp')
        .setLabel('PvP Deneyiminiz & Uzmanlık Alanınız')
        .setPlaceholder('Örn: 3 yıldır Elytra / SMP PvP oynuyorum, Crystal/Anchor biliyorum')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const anydeskInput = new TextInputBuilder()
        .setCustomId('apply_anydesk_confirm')
        .setLabel('Anydesk Hile Taramasını Kabul Ediyor Musunuz?')
        .setPlaceholder('Evet, her an Anydesk vermeyi kabul ediyorum.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(ignInput),
        new ActionRowBuilder().addComponents(ageInput),
        new ActionRowBuilder().addComponents(expInput),
        new ActionRowBuilder().addComponents(anydeskInput)
      );

      return interaction.showModal(modal);
    }

    // ----------------------------------------------------
    // D. KLAN BAŞVURU FORMU GÖNDERİLDİĞİNDE KANAL AÇMA
    // ----------------------------------------------------
    if (interaction.isModalSubmit() && interaction.customId === 'modal_clan_apply_form') {
      const guild = interaction.guild;
      const user = interaction.user;

      const ign = interaction.fields.getTextInputValue('apply_ign');
      const age = interaction.fields.getTextInputValue('apply_age');
      const exp = interaction.fields.getTextInputValue('apply_exp');
      const anydeskConfirm = interaction.fields.getTextInputValue('apply_anydesk_confirm');

      await interaction.deferReply({ ephemeral: true });

      const staffRoleIds = data.applyStaffRoleIds || [];
      const overwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory]
        },
        {
          id: client.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks]
        }
      ];

      for (const rId of staffRoleIds) {
        const r = guild.roles.cache.get(rId);
        if (r) {
          overwrites.push({
            id: r.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory]
          });
        }
      }

      const cleanUserName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 15);
      const applyChannel = await guild.channels.create({
        name: `basvuru-${cleanUserName}`,
        type: ChannelType.GuildText,
        parent: data.applyCategoryId || null,
        permissionOverwrites: overwrites
      }).catch(err => {
        console.error('Başvuru kanalı açma hatası:', err);
        return null;
      });

      if (!applyChannel) {
        return interaction.editReply({ content: '❌ Başvuru odası açılamadı. Lütfen yöneticiye bildiriniz.' });
      }

      const formEmbed = new EmbedBuilder()
        .setColor('#8B5CF6')
        .setAuthor({ name: `${guild.name} • Yeni Klan Başvurusu`, iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setTitle('⚔️ 〖 YENİ KLAN BAŞVURUSU GELDİ 〗 ⚔️')
        .setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(ign)}/128`)
        .addFields(
          { name: '👤 Başvuran Aday', value: `${user} (\`${user.tag}\` - \`${user.id}\`)`, inline: true },
          { name: '🎮 Minecraft IGN', value: `\`${ign}\``, inline: true },
          { name: '🎂 Yaş & Aktiflik', value: `${age}`, inline: true },
          { name: '⚔️ PvP Deneyimi & Geçmiş', value: `>>> ${exp}`, inline: false },
          { name: '🖥️ Anydesk Taahhüdü', value: `\`${anydeskConfirm}\``, inline: false }
        )
        .setFooter({ text: `${FOOTER_TEXT} • Başvuru Takip Sistemi` })
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_apply_claim_${user.id}`).setLabel('✋ Başvuruyu Üstlen').setStyle(ButtonStyle.Primary).setEmoji('📌'),
        new ButtonBuilder().setCustomId(`btn_apply_anydesk_${user.id}`).setLabel('🛡️ Anydesk İste (DM Bildir)').setStyle(ButtonStyle.Secondary).setEmoji('🖥️')
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_apply_accept_${user.id}_${encodeURIComponent(ign)}`).setLabel('✅ Temiz - Klan Rolü Ver').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`btn_apply_reject_${user.id}`).setLabel('❌ Reddet').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`btn_apply_cheat_${user.id}`).setLabel('🚫 Hileli (Logla & Reddet)').setStyle(ButtonStyle.Danger)
      );

      const staffMentions = staffRoleIds.map(id => `<@&${id}>`).join(' ') || '@here';
      await applyChannel.send({ content: `📢 ${user} klan başvurusunda bulundu! ${staffMentions}`, embeds: [formEmbed], components: [row1, row2] });

      return interaction.editReply({ content: `✅ Klan başvurunuz başarıyla alındı ve odanız açıldı: ${applyChannel}` });
    }

    // ----------------------------------------------------
    // E. BUTON AKSİYONLARI (SADECE YETKİLİLER KULLANABİLİR)
    // ----------------------------------------------------
    if (interaction.isButton()) {
      const customId = interaction.customId;
      const member = interaction.member;

      // 1. TICKET / BAŞVURU ÜSTLENME
      if (customId === 'ticket_claim_action' || customId.startsWith('btn_apply_claim_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const channel = interaction.channel;
        const claim = activeClaimedTickets.get(channel.id);
        if (claim) {
          return interaction.reply({ content: `⚠️ Bu talep zaten <@${claim.claimedBy}> tarafından üstlenilmiştir!`, ephemeral: true });
        }

        activeClaimedTickets.set(channel.id, {
          claimedBy: member.id,
          claimedAt: Date.now()
        });

        await channel.send({
          content: `📌 **TALEP ÜSTLENDİ:** Bu görüşme ${member} tarafından **üstlenilmiştir.** Sizinle bu yetkilimiz ilgilenecektir.`
        });

        return interaction.reply({ content: `✅ Talebi başarıyla üstlendiniz!`, ephemeral: true });
      }

      // 2. ANYDESK KONTROLÜ İSTEME (KANAL + ADAYA ÖZEL DM BİLDİRİMİ)
      if (customId.startsWith('btn_apply_anydesk_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicantId = customId.replace('btn_apply_anydesk_', '');
        const applicantMember = await interaction.guild.members.fetch(applicantId).catch(() => null);

        let dmSent = false;
        if (applicantMember) {
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor('#F59E0B')
              .setAuthor({ name: `${interaction.guild.name} • Klan Başvurusu Anydesk Çağrısı`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
              .setTitle('🛡️ YETKİLİ SİZDEN ANYDESK KODUNUZU TALEP EDİYOR!')
              .setDescription(
                `Sayın ${applicantMember},\n\n` +
                `**${interaction.guild.name}** klan başvurunuz için yetkilimiz **${member.user.tag}** sizden **Anydesk adres kodunuzu** istemektedir.\n\n` +
                `📌 **Lütfen Hemen:**\n` +
                `1. AnyDesk programını açınız.\n` +
                `2. **9 haneli adres kodunuzu** başvuru odanız olan ${interaction.channel} kanalına yazınız.\n` +
                `3. Yetkilimiz bağlandığında ekrandan onay veriniz.\n\n` +
                `⚠️ *Herhangi bir gecikme veya reddetme durumunda başvurunuz iptal edilecektir.*`
              )
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp();

            await applicantMember.send({ embeds: [dmEmbed] });
            dmSent = true;
          } catch (e) {
            dmSent = false;
          }
        }

        const anydeskEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setTitle('🛡️ ANYDESK & HİLE TARAMASI ÇAĞRISI')
          .setDescription(
            `Sayın <@${applicantId}>,\n\n` +
            `Yetkilimiz ${member} tarafından klan alım süreciniz için **Anydesk / Hile Kontrolü** talep edilmiştir.\n\n` +
            `📌 **Yapmanız Gerekenler:**\n` +
            `1. [AnyDesk Resmi Sitesinden](https://anydesk.com) programı açınız.\n` +
            `2. Ekranda görünen **9 haneli adres kodunuzu** bu kanala yazınız.\n` +
            `3. Yetkilimiz bağlandığında ekrandan onay veriniz.\n\n` +
            (dmSent ? `📬 *Adaya özelden DM bildirimi başarıyla iletildi.*` : `🔒 *(Adayın DM kutusu kapalı olduğu için bildirim yalnızca buradan yapıldı).*`)
          )
          .setFooter({ text: FOOTER_TEXT });

        await interaction.channel.send({ content: `📢 <@${applicantId}> Anydesk kontrolü bekleniyor!`, embeds: [anydeskEmbed] });
        return interaction.reply({ content: `✅ Anydesk çağrısı yapıldı${dmSent ? ' ve adaya özelden DM iletildi' : ''}.`, ephemeral: true });
      }

      // 3. TEMİZ - BAŞVURU KABUL ETME (KLAN ROLÜ VERME + ÖZEL DM + 5 SANİYEDE KANALI KAPATMA)
      if (customId.startsWith('btn_apply_accept_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const parts = customId.split('_');
        const applicantId = parts[3];
        const ign = decodeURIComponent(parts[4] || 'Oyuncu');
        const channel = interaction.channel;

        const applicantMember = await interaction.guild.members.fetch(applicantId).catch(() => null);

        let roleGiven = false;
        if (applicantMember) {
          const roleId = data.applyClanRoleId;
          const clanRole = (roleId && interaction.guild.roles.cache.get(roleId)) ||
                           interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('klan üyesi') || r.name.toLowerCase().includes('klan uyesi') || r.name.toLowerCase().includes('vyron • klan'));
          if (clanRole) {
            await applicantMember.roles.add(clanRole).catch(err => console.error('Rol verme hatası:', err));
            roleGiven = true;
          }
        }

        if (applicantMember) {
          try {
            const acceptDmEmbed = new EmbedBuilder()
              .setColor('#10B981')
              .setAuthor({ name: `${interaction.guild.name} • Başvuru Sonucu: ONAYLANDI`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
              .setTitle('🎉 TEBRİKLER! KLAN BAŞVURUNUZ KABUL EDİLDİ ⚔️')
              .setDescription(
                `Tebrikler ${applicantMember} (\`${ign}\`)!\n\n` +
                `**${interaction.guild.name}** klan başvurunuz yetkilimiz **${member.user.tag}** tarafından incelenmiş ve **TEMİZ** olarak onaylanmıştır.\n\n` +
                `🛡️ Sunucudaki klan rolleriniz tanımlanmıştır. Ailemize ve savaş kadromuza hoş geldiniz!`
              )
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp();

            await applicantMember.send({ embeds: [acceptDmEmbed] });
          } catch (e) {}
        }

        const acceptEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setAuthor({ name: 'Vyron Klanı • Başvuru Onaylandı', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTitle('🎉 〖 BAŞVURU KABUL EDİLDİ (TEMİZ) 〗 🎉')
          .setDescription(
            `Tebrikler <@${applicantId}> (\`${ign}\`)!\n\n` +
            `Yetkilimiz ${member} tarafından yapılan inceleme ve kontroller sonucunda **Vyron Klanına kabul edildiniz.**\n\n` +
            (roleGiven ? `✅ Klan rolleriniz başarıyla tanımlandı.` : `⚠️ *Klan rolü bulunamadı, lütfen manuel rol veriniz.*`) + `\n\n` +
            `🔒 **Başvuru tamamlandı. Bu oda 5 saniye içinde otomatik olarak kapatılacaktır...**`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        await interaction.reply({ content: '✅ Başvuru onaylandı, klan rolü verildi ve adaya DM gönderildi. Kanal 5 saniye içinde kapatılıyor...' });
        await channel.send({ content: `🎉 <@${applicantId}> Aramıza hoş geldin!`, embeds: [acceptEmbed] });

        setTimeout(async () => {
          activeClaimedTickets.delete(channel.id);
          ticketTranscripts.delete(channel.id);
          await channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 4. BAŞVURU REDDETME (KANAL + ÖZEL DM + 5 SANİYEDE KANALI KAPATMA)
      if (customId.startsWith('btn_apply_reject_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicantId = customId.replace('btn_apply_reject_', '');
        const applicantMember = await interaction.guild.members.fetch(applicantId).catch(() => null);
        const channel = interaction.channel;

        if (applicantMember) {
          try {
            const rejectDmEmbed = new EmbedBuilder()
              .setColor('#EF4444')
              .setAuthor({ name: `${interaction.guild.name} • Başvuru Sonucu: REDDEDİLDİ`, iconURL: interaction.guild.iconURL({ dynamic: true }) })
              .setTitle('❌ KLAN BAŞVURUNUZ ONAYLANMADI')
              .setDescription(
                `Sayın ${applicantMember},\n\n` +
                `**${interaction.guild.name}** klan başvurunuz yetkilimiz **${member.user.tag}** tarafından yapılan değerlendirme sonucunda maalesef **olumsuz sonuçlanmıştır.**\n\n` +
                `Gelecek alımlarda kendinizi geliştirerek tekrar başvurabilirsiniz.`
              )
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp();

            await applicantMember.send({ embeds: [rejectDmEmbed] });
          } catch (e) {}
        }

        const rejectEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setTitle('❌ KLAN BAŞVURUNUZ ONAYLANMADI')
          .setDescription(
            `Sayın <@${applicantId}>,\n\n` +
            `Yetkilimiz ${member} tarafından yapılan değerlendirme sonucunda klan başvurunuz maalesef **olumsuz sonuçlanmıştır.**\n\n` +
            `🔒 **Bu başvuru odası 5 saniye içinde otomatik olarak silinecektir.**`
          )
          .setFooter({ text: FOOTER_TEXT });

        await interaction.reply({ content: '❌ Başvuru reddedildi ve adaya DM iletildi. Kanal 5 saniye içinde kapatılıyor...' });
        await channel.send({ content: `📢 <@${applicantId}>`, embeds: [rejectEmbed] });

        setTimeout(async () => {
          activeClaimedTickets.delete(channel.id);
          ticketTranscripts.delete(channel.id);
          await channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 5. HİLELİ - REDDET BUTONU (LOG + ÖZEL DM + 5 SANİYEDE KANALI KAPATMA)
      if (customId.startsWith('btn_apply_cheat_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicantId = customId.replace('btn_apply_cheat_', '');
        const applicantMember = await interaction.guild.members.fetch(applicantId).catch(() => null);
        const chLog = await getOrCreateCheatLogChannel(interaction.guild);
        const channel = interaction.channel;

        if (chLog) {
          const logEmb = new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🚫 BAŞVURUDA HİLE TESPİTİ NEDENİYLE ELENDİ')
            .setDescription(`👤 **Aday:** <@${applicantId}>\n🛡️ **İnceleyen Yetkili:** ${member}\n⏰ **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`)
            .setTimestamp();
          await chLog.send({ embeds: [logEmb] }).catch(() => {});
        }

        if (applicantMember) {
          try {
            await applicantMember.send({
              content: `🚫 **${interaction.guild.name}** klan başvurunuz, yapılan Anydesk / inceleme sırasında **hile veya şüpheli dosya kalıntısı** tespit edildiği için reddedilmiştir!`
            });
          } catch (e) {}
        }

        const cheatEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setTitle('🚫 HİLE TESPİTİ SEBEBİYLE BAŞVURU İPTAL EDİLDİ')
          .setDescription(
            `Sayın <@${applicantId}>,\n\n` +
            `Anydesk / inceleme sırasında **hile veya şüpheli dosya kalıntısı** tespit edildiği için başvurunuz derhal reddedilmiştir.\n\n` +
            `🔒 **Bu başvuru odası 5 saniye içinde otomatik olarak silinecektir.**`
          )
          .setFooter({ text: FOOTER_TEXT });

        await interaction.reply({ content: '🚫 Aday hileli olarak işaretlendi, loglandı ve DM atıldı. Kanal 5 saniye içinde kapatılıyor...' });
        await channel.send({ content: `🚫 <@${applicantId}>`, embeds: [cheatEmbed] });

        setTimeout(async () => {
          activeClaimedTickets.delete(channel.id);
          ticketTranscripts.delete(channel.id);
          await channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 6. TICKET KAPATMA BUTONU
      if (customId === 'ticket_close_action') {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Destek talebini yalnızca yetkililer kapatabilir!', ephemeral: true });
        }

        const channel = interaction.channel;
        await interaction.reply({ content: '🔒 Destek talebi kapatılıyor ve kanal 5 saniye içinde siliniyor...' });

        setTimeout(async () => {
          activeClaimedTickets.delete(channel.id);
          ticketTranscripts.delete(channel.id);
          await channel.delete().catch(() => {});
        }, 5000);
      }
    }
  } catch (err) {
    console.error('Etkileşim hatası:', err);
  }
});

// ==========================================
// 9. BOT BAŞLATMA
// ==========================================
client.login(process.env.TOKEN);
