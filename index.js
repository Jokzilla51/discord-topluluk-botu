/**
 * ============================================================================
 * ⚔️ VYRON SADE TICKET & KLAN BAŞVURU SİSTEMİ (PURE TICKET & APPLY BOT)
 * ============================================================================
 * SADECE 2 SİSTEM İÇERİR:
 * 1. Anydesk Onaylı Klan Başvuru Sistemi (Form + Özel Oda + Yetkili Butonları)
 * 2. Kategorili Destek (Ticket) Sistemi (Açılır Menü + Özel Oda + Kapatma)
 * 
 * ⛔ Sıralama, Liderlik, Moderasyon, Ceza veya Tehlikeli Komutlar İÇERMEZ.
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

// ==========================================
// 1. WEB SUNUCUSU (RENDER 7/24 UPTIME)
// ==========================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>⚔️ Vyron Ticket & Klan Başvuru Botu 7/24 Aktif!</h1>');
}).listen(PORT, () => {
  console.log(`🌐 Web sunucusu ${PORT} portunda aktif.`);
});

// ==========================================
// 2. VERİ YÖNETİMİ & SABİTLER
// ==========================================
const DATA_FILE = path.join(__dirname, 'data.json');
const FOOTER_TEXT = 'Vyron Klanı • Ticket & Başvuru Sistemi';

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
        applyClanRoleId: parsed.applyClanRoleId || null
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
    applyClanRoleId: null
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
// 3. YARDIMCI FONKSİYONLAR
// ==========================================
function isStaffMember(member, data) {
  if (!member) return false;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions && member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  
  const staffRoleIds = [
    ...(data?.ticketStaffRoleIds || []),
    ...(data?.applyStaffRoleIds || [])
  ];

  if (member.roles && member.roles.cache) {
    return member.roles.cache.some(r =>
      staffRoleIds.includes(r.id) ||
      r.name.toLowerCase().includes('yetkili') ||
      r.name.toLowerCase().includes('staff') ||
      r.name.toLowerCase().includes('mod') ||
      r.name.toLowerCase().includes('admin') ||
      r.name.toLowerCase().includes('yönetici') ||
      r.name.toLowerCase().includes('kurucu')
    );
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

// ==========================================
// 4. SLASH KOMUTLARI (TANIMLAR - SADECE 7 KOMUT)
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
        .setDescription('Başvurusu onaylanan üyelere otomatik verilecek rol (Örn: @Vyron • Klan Üyesi)')
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
    )
];

// ==========================================
// 5. CLIENT & EVENTLER
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once('ready', async () => {
  console.log(`🤖 Vyron Ticket & Klan Başvuru Botu aktif: ${client.user.tag}`);
  client.user.setActivity('🎫 Destek & ⚔️ Klan Başvurusu', { type: 3 });

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
// 6. MESAJ İZLEYİCİ (TRANSKRİPT KAYDI)
// ==========================================
client.on('messageCreate', async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const chName = message.channel.name.toLowerCase();
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
// 7. ETKİLEŞİM İŞLEYİCİSİ (INTERACTION CREATE)
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
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Yöneticiler kullanabilir!', ephemeral: true });
        
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
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Yöneticiler kullanabilir!', ephemeral: true });
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
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Yöneticiler kullanabilir!', ephemeral: true });
        const cat = interaction.options.getChannel('kategori');
        data.applyCategoryId = cat.id;
        saveData(data);
        return interaction.reply({ content: `✅ Başvuru odaları artık **${cat.name}** kategorisinde açılacaktır.`, ephemeral: true });
      }

      // 4. /hile-rapor
      if (commandName === 'hile-rapor') {
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
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Yöneticiler kullanabilir!', ephemeral: true });
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
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Yöneticiler kullanabilir!', ephemeral: true });
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
        if (!isAdmin) return interaction.reply({ content: '🚫 Bu komutu yalnızca Yöneticiler kullanabilir!', ephemeral: true });
        const cat = interaction.options.getChannel('kategori');
        data.ticketCategoryId = cat.id;
        saveData(data);
        return interaction.reply({ content: `✅ Ticket odaları artık **${cat.name}** kategorisinde açılacaktır.`, ephemeral: true });
      }
    }

    // ----------------------------------------------------
    // B. KATEGORİLİ TICKET AÇMA (SELECT MENU)
    // ----------------------------------------------------
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select_category') {
      const selected = interaction.values[0];
      const guild = interaction.guild;
      const user = interaction.user;

      // Zaten açık ticket var mı kontrolü
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
        new ButtonBuilder().setCustomId(`btn_apply_anydesk_${user.id}`).setLabel('🛡️ Anydesk İste').setStyle(ButtonStyle.Secondary).setEmoji('🖥️')
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_apply_accept_${user.id}_${encodeURIComponent(ign)}`).setLabel('✅ Kabul Et (Klan Üyesi Yap)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`btn_apply_reject_${user.id}`).setLabel('❌ Reddet').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`btn_apply_cheat_${user.id}`).setLabel('🚫 Hileli (Logla & Reddet)').setStyle(ButtonStyle.Danger)
      );

      const staffMentions = staffRoleIds.map(id => `<@&${id}>`).join(' ') || '@here';
      await applyChannel.send({ content: `📢 ${user} klan başvurusunda bulundu! ${staffMentions}`, embeds: [formEmbed], components: [row1, row2] });

      return interaction.editReply({ content: `✅ Klan başvurunuz başarıyla alındı ve odanız açıldı: ${applyChannel}` });
    }

    // ----------------------------------------------------
    // E. BUTON AKSİYONLARI (TICKET & BAŞVURU YÖNETİMİ)
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

      // 2. ANYDESK KONTROLÜ İSTEME
      if (customId.startsWith('btn_apply_anydesk_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicantId = customId.replace('btn_apply_anydesk_', '');
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
            `⚠️ *Görüşmeden çıkmak veya kontrolü reddetmek doğrudan elenme sebebidir.*`
          )
          .setFooter({ text: FOOTER_TEXT });

        await interaction.channel.send({ content: `📢 <@${applicantId}> Anydesk kontrolü bekleniyor!`, embeds: [anydeskEmbed] });
        return interaction.reply({ content: '✅ Anydesk çağrısı kanala gönderildi.', ephemeral: true });
      }

      // 3. BAŞVURU KABUL ETME (KLAN ROLÜ VERME)
      if (customId.startsWith('btn_apply_accept_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const parts = customId.split('_');
        const applicantId = parts[3];
        const ign = decodeURIComponent(parts[4] || 'Oyuncu');

        const applicantMember = await interaction.guild.members.fetch(applicantId).catch(() => null);

        if (applicantMember && data.applyClanRoleId) {
          const clanRole = interaction.guild.roles.cache.get(data.applyClanRoleId);
          if (clanRole) {
            await applicantMember.roles.add(clanRole).catch(err => console.error('Rol verme hatası:', err));
          }
        }

        const acceptEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setAuthor({ name: 'Vyron Klanı • Başvuru Onaylandı', iconURL: interaction.guild.iconURL({ dynamic: true }) })
          .setTitle('🎉 〖 TEBRİKLER! KLAN BAŞVURUNUZ KABUL EDİLDİ 〗 🎉')
          .setDescription(
            `Tebrikler <@${applicantId}> (\`${ign}\`)!\n\n` +
            `Yetkilimiz ${member} tarafından yapılan inceleme ve kontroller sonucunda **Vyron Klanına kabul edildiniz.**\n\n` +
            `🛡️ Klan rolleriniz tanımlandı. Ailemize hoş geldiniz! ⚔️`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        await interaction.channel.send({ content: `🎉 <@${applicantId}> Aramıza hoş geldin!`, embeds: [acceptEmbed] });
        return interaction.reply({ content: '✅ Başvuru onaylandı ve klan rolü verildi.', ephemeral: true });
      }

      // 4. BAŞVURU REDDETME
      if (customId.startsWith('btn_apply_reject_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicantId = customId.replace('btn_apply_reject_', '');
        const rejectEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setTitle('❌ KLAN BAŞVURUNUZ ONAYLANMADI')
          .setDescription(
            `Sayın <@${applicantId}>,\n\n` +
            `Yapılan değerlendirme sonucunda klan başvurunuz maalesef **olumsuz sonuçlanmıştır.**\n\n` +
            `Gelecek alımlarda kendinizi geliştirerek tekrar başvurabilirsiniz.`
          )
          .setFooter({ text: FOOTER_TEXT });

        await interaction.channel.send({ content: `📢 <@${applicantId}>`, embeds: [rejectEmbed] });
        return interaction.reply({ content: '❌ Başvuru reddedildi olarak işaretlendi.', ephemeral: true });
      }

      // 5. HİLELİ - REDDET BUTONU
      if (customId.startsWith('btn_apply_cheat_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicantId = customId.replace('btn_apply_cheat_', '');
        const chLog = await getOrCreateCheatLogChannel(interaction.guild);

        if (chLog) {
          const logEmb = new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle('🚫 BAŞVURUDA HİLE TESPİTİ NEDENİYLE ELENDİ')
            .setDescription(`👤 **Aday:** <@${applicantId}>\n🛡️ **İnceleyen Yetkili:** ${member}\n⏰ **Tarih:** <t:${Math.floor(Date.now() / 1000)}:F>`)
            .setTimestamp();
          await chLog.send({ embeds: [logEmb] }).catch(() => {});
        }

        await interaction.channel.send({
          content: `🚫 <@${applicantId}> Anydesk / inceleme sırasında **hile veya şüpheli dosya kalıntısı** tespit edildiği için başvurunuz derhal reddedilmiştir!`
        });

        return interaction.reply({ content: '🚫 Aday hileli olarak işaretlendi ve loglandı.', ephemeral: true });
      }

      // 6. TICKET KAPATMA BUTONU
      if (customId === 'ticket_close_action') {
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
// 8. BOT BAŞLATMA
// ==========================================
client.login(process.env.TOKEN);
