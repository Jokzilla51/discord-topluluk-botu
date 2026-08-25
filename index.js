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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const express = require('express');
const ms = require('ms');
require('dotenv').config();

// Sabit Marka İmzası (Footer)
const FOOTER_TEXT = 'discord.gg/vyronmc • Made by profosyonel456';

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
// ==========================================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const activeGiveaways = new Map();
const activeScrims = new Map();
const activePolls = new Map();
const applyConfigs = new Map();
let applicationCounter = 1;

// ==========================================
// 3. GELİŞMİŞ SLASH KOMUTLARI
// ==========================================
const commands = [
  // 1. /yardim
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Vyron klan botunun tüm komutlarını ve sistem kılavuzunu gösterir.'),

  // 2. /sunucu-analiz (Eksikleri bulan ve otomatik oluşturan akıllı sistem)
  new SlashCommandBuilder()
    .setName('sunucu-analiz')
    .setDescription('Sunucuyu analiz eder, eksik kanalları/panelleri tespit edip tek tıkla otomatik kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // 3. /basvuru-kur (Seçmeli Çoklu Yetkili Rol Desteği)
  new SlashCommandBuilder()
    .setName('basvuru-kur')
    .setDescription('Adaya özel ticket açan ve seçtiğiniz yetkili rollerinin yönettiği başvuru paneli kurar.')
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
    .addRoleOption(option =>
      option.setName('yetkili_rol_1')
        .setDescription('1. Yetkili Rolü (Örn: Admin)')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('yetkili_rol_2')
        .setDescription('2. Yetkili Rolü (Örn: Moderator - İsteğe bağlı)')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option.setName('yetkili_rol_3')
        .setDescription('3. Yetkili Rolü (Örn: Ticket Yetkilisi - İsteğe bağlı)')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option.setName('yetkili_rol_4')
        .setDescription('4. Yetkili Rolü (Örn: Yönetici / Kurucu - İsteğe bağlı)')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('log_kanali')
        .setDescription('Gelen başvuruların bildirileceği yetkili log kanalı')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Başvuru ticketlarının açılacağı kategori')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 4. /haftanin-oyuncusu
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

  // 5. /scrim
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

  // 6. /kilit
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

  // 7. /klan-rutbe
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

  // 8. /ticket-kur
  new SlashCommandBuilder()
    .setName('ticket-kur')
    .setDescription('Genel destek ve şikayetler için butonlu ticket paneli oluşturur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Panelin gönderileceği metin kanalı (Örn: #destek-talebi)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('yetkili_rol')
        .setDescription('Destek taleplerini görebilecek yetkili rol (Örn: @Vyron • Ticket Yetkilisi)')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Ticket kanallarının açılacağı kategori')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 9. /cekilis
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

  // 10. /reroll
  new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Çekilişten yeni bir kazanan seçer.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('cekilis_id')
        .setDescription('Çekiliş ID veya mesaj ID')
        .setRequired(true)
    ),

  // 11. /anket
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

  // 12. /mute
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

  // 13. /unmute
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Kullanıcının susturmasını kaldırır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Susturması kaldırılacak kullanıcı')
        .setRequired(true)
    ),

  // 14. /kick
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

  // 15. /ban
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

  // 16. /duyuru
  new SlashCommandBuilder()
    .setName('duyuru')
    .setDescription('Belirtilen kanala şık bir klan/topluluk duyurusu gönderir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Duyurunun yapılacağı kanal')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption(option =>
      option.setName('baslik')
        .setDescription('Duyuru başlığı')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('mesaj')
        .setDescription('Duyuru metni')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option.setName('herkese_etiket')
        .setDescription('@everyone etiketi atılsın mı? (Varsayılan: Hayır)')
        .setRequired(false)
    ),

  // 17. /kullanici-bilgi
  new SlashCommandBuilder()
    .setName('kullanici-bilgi')
    .setDescription('Bir kullanıcının klan rolleri, katılım tarihi ve profil bilgilerini gösterir.')
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Bilgisi görüntülenecek kişi')
        .setRequired(false)
    ),

  // 18. /sunucu-bilgi
  new SlashCommandBuilder()
    .setName('sunucu-bilgi')
    .setDescription('Sunucunun ve klanın genel istatistiklerini görüntüler.'),

  // 19. /dogrulama-kur
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

  // 20. /sil
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
// 5. ETKİLEŞİM VE İŞLEMLER
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
              name: '🔍 Sunucu Denetimi & Otomatik Kurulum',
              value: '• `/sunucu-analiz` : Mevcut kanallarını analiz eder, eksik kanalları ve panelleri tek tıkla kurar.'
            },
            {
              name: '⚔️ Klan & Alım Sistemleri',
              value: '• `/basvuru-kur` : Seçtiğin yetkili rollerinin bakabileceği özel ticketlı klan alım paneli.\n• `/haftanin-oyuncusu` : Haftanın Trapcisi veya Elytracısı unvanını verir ve duyurur.\n• `/scrim` : Otomatik takım bölen klan içi maç lobisi açar.\n• `/klan-rutbe` : Has Klan Üyesi yapar veya klandan çıkarır.'
            },
            {
              name: '🛡️ Güvenlik & Moderasyon',
              value: '• `/kilit` : Kanalı kilitleyip üye mesajlarına kapatır veya açar.\n• `/mute` : Kullanıcıyı süreli susturur (Timeout) ve loglar.\n• `/unmute` : Susturmayı kaldırır.\n• `/kick` : Kullanıcıyı sunucudan atar.\n• `/ban` : Kullanıcıyı sunucudan yasaklar.\n• `/sil` : Mesajları topluca siler (1-100).\n• `/dogrulama-kur` : Butonlu üye doğrulama paneli.'
            },
            {
              name: '🎉 Çekiliş, Anket & Topluluk',
              value: '• `/anket` : Canlı sayaçlı ve çift oy korumalı oylama başlatır.\n• `/cekilis` : Kazananları otomatik etiketleyen çekiliş sistemi.\n• `/reroll` : Çekilişten yeni kazanan seçer.\n• `/duyuru` : Şık klan ve sunucu duyurusu yayınlar.\n• `/kullanici-bilgi` & `/sunucu-bilgi` : Detaylı istatistikler.'
            },
            {
              name: '🎫 Destek',
              value: '• `/ticket-kur` : Genel destek ve şikayet paneli.'
            }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
      }

      // 2. /sunucu-analiz (DETAYLI ANALİZ & OTOMATİK KURULUM BUTONU)
      if (commandName === 'sunucu-analiz') {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const botMember = await guild.members.fetch(client.user.id);
        const botRole = botMember.roles.highest;

        const roles = guild.roles.cache;
        const clanRole = roles.find(r => r.name.toLowerCase().includes('klan üye') && !r.name.toLowerCase().includes('has'));
        const hasClanRole = roles.find(r => r.name.toLowerCase().includes('has klan'));
        const memberRole = roles.find(r => r.name.toLowerCase().includes('vyron • üye') || (r.name.toLowerCase().includes('üye') && !r.name.toLowerCase().includes('klan')));
        const trapciRole = roles.find(r => r.name.toLowerCase().includes('trapci') || r.name.toLowerCase().includes('trap'));
        const elytraciRole = roles.find(r => r.name.toLowerCase().includes('elytrac') || r.name.toLowerCase().includes('elytra'));
        const ticketStaffRole = roles.find(r => r.name.toLowerCase().includes('ticket') || r.name.toLowerCase().includes('destek'));

        const roleHierarchyWarnings = [];
        if (clanRole && botRole.position <= clanRole.position) {
          roleHierarchyWarnings.push(`⚠️ **${clanRole.name}** rolü botun rolünden (\`${botRole.name}\`) yukarıda! Bot rolünü liste üzerinde yukarı taşıyın.`);
        }
        if (memberRole && botRole.position <= memberRole.position) {
          roleHierarchyWarnings.push(`⚠️ **${memberRole.name}** rolü botun rolünden yukarıda!`);
        }

        const channels = guild.channels.cache;
        const chApply = channels.find(c => c.name.includes('klan-başvuru') || c.name.includes('basvuru'));
        const chApplyLog = channels.find(c => c.name.includes('başvuru-log') || c.name.includes('basvuru-log'));
        const chVerify = channels.find(c => c.name.includes('doğrulama') || c.name.includes('dogrulama') || c.name.includes('kayıt') || c.name.includes('giris'));
        const chTicket = channels.find(c => c.name.includes('destek') || c.name.includes('ticket'));
        const chPunishLog = channels.find(c => c.name.includes('ceza-kayıt') || c.name.includes('ceza-log') || c.name.includes('moderasyon-log'));

        const actionItems = [];

        if (chApply) {
          actionItems.push(`• **Klan Başvuru Kanalı:** ${chApply} (Mevcut)`);
        } else {
          actionItems.push('• ❌ **#klan-başvuru** kanalı yok (Otomatik oluşturulacak)');
        }

        if (chVerify) {
          actionItems.push(`• **Doğrulama Kanalı:** ${chVerify} (Mevcut)`);
        } else {
          actionItems.push('• ❌ **#doğrulama** kanalı yok (Otomatik oluşturulacak)');
        }

        if (chTicket) {
          actionItems.push(`• **Destek Kanalı:** ${chTicket} (Mevcut)`);
        } else {
          actionItems.push('• ❌ **#destek-talebi** kanalı yok (Otomatik oluşturulacak)');
        }

        if (chPunishLog) {
          actionItems.push(`• **Ceza Kayıt Log:** ${chPunishLog} (Mevcut)`);
        } else {
          actionItems.push('• ⚠️ **#ceza-kayıt-log** kanalı yok (Otomatik oluşturulacak)');
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
              name: '🔍 Tespit Edilen Mevcut Kanallar',
              value: `• **Klan Başvuru:** ${chApply ? `✅ ${chApply}` : '❌ Yok (Açılacak)'}\n• **Başvuru Log:** ${chApplyLog ? `✅ ${chApplyLog}` : '❌ Yok (Açılacak)'}\n• **Doğrulama:** ${chVerify ? `✅ ${chVerify}` : '❌ Yok (Açılacak)'}\n• **Destek:** ${chTicket ? `✅ ${chTicket}` : '❌ Yok (Açılacak)'}\n• **Ceza Log:** ${chPunishLog ? `✅ ${chPunishLog}` : '❌ Yok (Açılacak)'}`,
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

      // 3. /basvuru-kur
      if (commandName === 'basvuru-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const clanRole = interaction.options.getRole('klan_rolu');
        const r1 = interaction.options.getRole('yetkili_rol_1');
        const r2 = interaction.options.getRole('yetkili_rol_2');
        const r3 = interaction.options.getRole('yetkili_rol_3');
        const r4 = interaction.options.getRole('yetkili_rol_4');
        const logChannel = interaction.options.getChannel('log_kanali');
        const category = interaction.options.getChannel('kategori');

        const selectedStaffRoleIds = [r1?.id, r2?.id, r3?.id, r4?.id].filter(Boolean);
        const selectedStaffRoleMentions = selectedStaffRoleIds.map(id => `<@&${id}>`).join(', ');

        const configKey = `applycfg_${Date.now()}`;
        applyConfigs.set(configKey, {
          clanRoleId: clanRole.id,
          staffRoleIds: selectedStaffRoleIds,
          logChannelId: logChannel ? logChannel.id : null,
          categoryId: category ? category.id : null
        });

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
            `🛡️ **İnceleyecek Yetkili Rolleri:** ${selectedStaffRoleMentions}\n\n` +
            `👇 Başvurmak için butona basınız.`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const applyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_open_apply_${configKey}`)
            .setLabel('⚔️ Klan Başvurusu Yap')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
        );

        await targetChannel.send({ embeds: [applyEmbed], components: [applyRow] });

        return interaction.reply({
          content: `✅ Klan başvuru paneli ${targetChannel} kanalına kuruldu!\n🛡️ **Yetkili Rolleri:** ${selectedStaffRoleMentions}`,
          ephemeral: true
        });
      }

      // 4. /haftanin-oyuncusu
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

      // 5. /scrim
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

      // 6. /kilit
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

      // 7. /klan-rutbe
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

      // 8. /ticket-kur
      if (commandName === 'ticket-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const supportRole = interaction.options.getRole('yetkili_rol');
        const category = interaction.options.getChannel('kategori');

        const ticketEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setTitle(`📩 ${interaction.guild.name} - Destek & Şikayet Paneli`)
          .setDescription(
            `Sunucumuz veya üyelerle ilgili sorularınız, önerileriniz veya şikayetleriniz için yetkili ekibimizle özel olarak görüşebilirsiniz.\n\n` +
            '*(⚠️ Not: Klan başvurusu yapacaksanız lütfen #klan-başvuru kanalını kullanınız).*'
          )
          .addFields(
            { name: '⏰ Destek Saatleri', value: '7/24 Talep oluşturabilirsiniz.', inline: true },
            { name: '🛡️ Destek Ekibi', value: `${supportRole}`, inline: true }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const ticketRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_create_${supportRole.id}_${category ? category.id : 'none'}`)
            .setLabel('📩 Destek Talebi Aç')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );

        await targetChannel.send({ embeds: [ticketEmbed], components: [ticketRow] });
        return interaction.reply({ content: `✅ Genel Destek paneli kuruldu!`, ephemeral: true });
      }

      // 9. /cekilis
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

      // 10. /reroll
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

      // 11. /anket
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

      // 12. /mute
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

      // 13. /unmute
      if (commandName === 'unmute') {
        const targetUser = interaction.options.getUser('kullanici');
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ Kullanıcı bulunamadı!', ephemeral: true });

        await member.timeout(null, 'Susturma kaldırıldı').catch(() => {});
        return interaction.reply({ content: `✅ ${member} kullanıcısının susturması kaldırıldı.` });
      }

      // 14. /kick
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

      // 15. /ban
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

      // 16. /duyuru
      if (commandName === 'duyuru') {
        const channel = interaction.options.getChannel('kanal');
        const title = interaction.options.getString('baslik');
        const message = interaction.options.getString('mesaj');
        const pingEveryone = interaction.options.getBoolean('herkese_etiket') ?? false;

        const announcementEmbed = new EmbedBuilder()
          .setColor('#38BDF8')
          .setTitle(`📢 ${title}`)
          .setDescription(message.replace(/\\n/g, '\n'))
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        await channel.send({
          content: pingEveryone ? '@everyone' : undefined,
          embeds: [announcementEmbed]
        });

        return interaction.reply({ content: `✅ Duyuru ${channel} kanalına başarıyla gönderildi!`, ephemeral: true });
      }

      // 17. /kullanici-bilgi
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

      // 18. /sunucu-bilgi
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

      // 19. /dogrulama-kur
      if (commandName === 'dogrulama-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const role = interaction.options.getRole('verilecek_rol');

        const verifyEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle(`🛡️ ${interaction.guild.name} Doğrulama`)
          .setDescription('Sunucumuza hoş geldiniz! Kanallara erişim sağlamak için aşağıdaki butona basınız.')
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

      // 20. /sil
      if (commandName === 'sil') {
        const amount = interaction.options.getInteger('miktar');
        await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({ content: `🧹 **${amount}** mesaj silindi!`, ephemeral: true });
      }
    }

    // ----------------------------------------------------
    // B. MODAL AÇMA & GÖNDERME
    // ----------------------------------------------------
    if (interaction.isButton() && interaction.customId.startsWith('btn_open_apply_')) {
      const configKey = interaction.customId.replace('btn_open_apply_', '');

      const modal = new ModalBuilder()
        .setCustomId(`modal_clan_apply_${configKey}`)
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

    // Form Gönderildiğinde -> SEÇİLEN YETKİLİ ROLLERİYLE TICKET AÇMA
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_clan_apply_')) {
      const configKey = interaction.customId.replace('modal_clan_apply_', '');
      const config = applyConfigs.get(configKey) || {};

      const clanRoleId = config.clanRoleId || interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('klan üye'))?.id;
      const staffRoleIds = config.staffRoleIds || [];
      const logChannelId = config.logChannelId;
      const categoryId = config.categoryId;

      const ign = interaction.fields.getTextInputValue('ign');
      const ageActive = interaction.fields.getTextInputValue('age_active');
      const oldClans = interaction.fields.getTextInputValue('old_clans') || 'Belirtilmedi';
      const experience = interaction.fields.getTextInputValue('experience');
      const anydeskReady = interaction.fields.getTextInputValue('anydesk_ready');

      const applicant = interaction.user;
      const guild = interaction.guild;

      const channelName = `başvuru-${applicant.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const existingChannel = guild.channels.cache.find(c => c.name === channelName);
      if (existingChannel) {
        return interaction.reply({
          content: `⚠️ Zaten açık bir klan başvuru odanız bulunuyor: ${existingChannel}`,
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      // İzinler: Sadece Aday, Bot ve Seçilen Yetkili Rolleri
      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: applicant.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
      ];

      staffRoleIds.forEach(roleId => {
        permissionOverwrites.push({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels]
        });
      });

      // Ticket Kanalını Aç
      const applyTicketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId || null,
        permissionOverwrites
      });

      const appId = applicationCounter++;

      const ticketEmbed = new EmbedBuilder()
        .setColor('#8B5CF6')
        .setTitle(`⚔️ Klan Başvurusu: ${ign} (No: #${String(appId).padStart(4, '0')})`)
        .setDescription(
          `Merhaba ${applicant}! Vyron klan başvurunuz başarıyla oluşturuldu ve adınıza özel bu başvuru odası açıldı.\n\n` +
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
          .setCustomId(`ticket_call_anydesk_${applicant.id}`)
          .setLabel('📢 Anydesk Kontrole Çağır')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🖥️'),
        new ButtonBuilder()
          .setCustomId(`ticket_pass_${applicant.id}_${clanRoleId || 'none'}`)
          .setLabel('✅ Temiz (Klan Rolü Ver)')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🛡️'),
        new ButtonBuilder()
          .setCustomId(`ticket_fail_modal_${applicant.id}`)
          .setLabel('🚫 Hile Çıktı (Reddet)')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`ticket_reject_close_${applicant.id}`)
          .setLabel('❌ Reddet & Kapat')
          .setStyle(ButtonStyle.Secondary)
      );

      const staffPings = staffRoleIds.map(id => `<@&${id}>`).join(' ');
      await applyTicketChannel.send({
        content: `📢 ${applicant} ${staffPings} **Yeni Klan Başvuru Talebi Açıldı!**`,
        embeds: [ticketEmbed],
        components: [ticketRow]
      });

      if (logChannelId) {
        const logChannel = guild.channels.cache.get(logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor('#8B5CF6')
            .setTitle(`📝 Yeni Başvuru Bildirimi: ${ign}`)
            .setDescription(`👤 **Aday:** ${applicant}\n📂 **Oda:** ${applyTicketChannel}\n🎮 **Nick:** \`${ign}\``)
            .setFooter({ text: FOOTER_TEXT })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }

      try {
        await applicant.send({
          content: `🔔 **Vyron Klan Başvurunuz Alındı!**\nAdınıza özel başvuru odası açıldı: ${applyTicketChannel}\nLütfen odadaki talimatları takip ediniz.`
        });
      } catch (e) {}

      return interaction.editReply({
        content: `✅ **Klan başvurunuz alındı ve özel odanız açıldı:** ${applyTicketChannel}`
      });
    }

    // Hile Sebebi Modal Formu
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_cheat_reason_')) {
      const applicantId = interaction.customId.split('_')[3];
      const cheatType = interaction.fields.getTextInputValue('cheat_type');
      const cheatNotes = interaction.fields.getTextInputValue('cheat_notes') || 'Ek not girilmedi.';

      const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);

      if (applicant) {
        try {
          await applicant.send({
            content: `🚫 Merhaba, Vyron klan başvurunuz Anydesk kontrolü sonucunda **Hile / İhlal (${cheatType})** nedeniyle reddedilmiştir.`
          });
        } catch (e) {}
      }

      const logChannel = interaction.guild.channels.cache.find(c => c.name.includes('ceza-kayıt') || c.name.includes('başvuru-log'));
      if (logChannel) {
        const cheatEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setTitle('🚫 Kontrolde Hile Tespit Edildi!')
          .addFields(
            { name: '👤 Aday', value: `${applicant ? applicant.user.tag : applicantId} (\`${applicantId}\`)`, inline: true },
            { name: '🛡️ Kontrol Eden', value: `${interaction.user.tag}`, inline: true },
            { name: '⚠️ Tespit Edilen Hile', value: `**${cheatType}**`, inline: true },
            { name: '📄 Detay / Not', value: `>>> ${cheatNotes}`, inline: false }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();
        await logChannel.send({ embeds: [cheatEmbed] }).catch(() => {});
      }

      const failEmbed = new EmbedBuilder()
        .setColor('#EF4444')
        .setTitle('🚫 Kontrol Başarısız (Hile Tespit Edildi)')
        .setDescription(`${applicant ? applicant.user.tag : 'Aday'} klan kontrolünden geçemedi.\n**Sebep:** ${cheatType}\n\n🔒 Bu oda 5 saniye içinde kapatılacaktır.`)
        .setFooter({ text: FOOTER_TEXT });

      await interaction.reply({ embeds: [failEmbed] });

      setTimeout(async () => {
        await interaction.channel.delete().catch(() => {});
      }, 5000);
      return;
    }

    // ----------------------------------------------------
    // C. BUTON ETKİLEŞİMLERİ
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
        const ticketStaffRole = roles.find(r => r.name.toLowerCase().includes('ticket') || r.name.toLowerCase().includes('destek') || r.name.toLowerCase().includes('admin') || r.name.toLowerCase().includes('mod'));

        const results = [];

        // 1. #klan-başvuru & #başvuru-log
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
          const configKey = `applycfg_${Date.now()}`;
          applyConfigs.set(configKey, {
            clanRoleId: clanRole.id,
            staffRoleIds: [member.roles.highest.id],
            logChannelId: chApplyLog.id,
            categoryId: null
          });

          const applyEmbed = new EmbedBuilder()
            .setColor('#8B5CF6')
            .setTitle(`⚔️ ${guild.name} - Klan Başvuru Paneli`)
            .setDescription(`Vyron klanımıza katılmak için aşağıdaki butona basarak formu doldurunuz. Başvurunuz gönderilince adınıza özel başvuru ticket odası açılacaktır.\n\n👇 Başvurmak için butona basınız.`)
            .setFooter({ text: FOOTER_TEXT });

          const applyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_open_apply_${configKey}`)
              .setLabel('⚔️ Klan Başvurusu Yap')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('📝')
          );

          await chApply.send({ embeds: [applyEmbed], components: [applyRow] });
          results.push(`✅ **Klan Başvuru Paneli** kuruldu: ${chApply}`);
        }

        // 2. #doğrulama
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

        // 3. #destek-talebi
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

        if (chTicket && ticketStaffRole) {
          const ticketEmbed = new EmbedBuilder()
            .setColor('#3B82F6')
            .setTitle(`📩 ${guild.name} - Destek & Şikayet Paneli`)
            .setDescription('Sunucuyla ilgili sorularınız, önerileriniz veya şikayetleriniz için yetkililerle özel destek odası açabilirsiniz.\n\n*(⚠️ Not: Klan başvurusu yapacaksanız lütfen klan başvuru kanalını kullanınız).*')
            .setFooter({ text: FOOTER_TEXT });

          const ticketRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_create_${ticketStaffRole.id}_none`)
              .setLabel('📩 Destek Talebi Aç')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🎫')
          );

          await chTicket.send({ embeds: [ticketEmbed], components: [ticketRow] });
          results.push(`✅ **Destek Paneli** kuruldu: ${chTicket}`);
        }

        // 4. #ceza-kayıt-log
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

      // 4. KLAN BAŞVURU TICKET: TEMİZ (ROL VER & SADECE DM AT)
      if (customId.startsWith('ticket_pass_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const clanRoleId = parts[3];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Kendi başvurunuzu onaylayamazsınız!', ephemeral: true });
        }

        const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                             interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isAuthorized) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
        const clanRole = interaction.guild.roles.cache.get(clanRoleId) || interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes('klan üye'));

        if (applicant && clanRole) {
          await applicant.roles.add(clanRole).catch(() => {});
          try {
            await applicant.send({
              content: `🎉 **Tebrikler ${applicant.user.username}!** Vyron klanımızın Anydesk kontrolünden başarıyla geçtiniz ve **${clanRole.name}** rolünüz tanımlandı. Klana hoş geldiniz! ⚔️`
            });
          } catch (e) {}
        }

        const passEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle('🎉 Kontrol Başarılı - Klana Alındı!')
          .setDescription(`Tebrikler ${applicant}! Anydesk kontrolünden **TEMİZ** olarak geçti ve **${clanRole ? clanRole.name : 'Klan Üyesi'}** rolü verildi!\n\n🔒 Bu başvuru odası 5 saniye içinde kapatılacaktır.`)
          .setFooter({ text: FOOTER_TEXT });

        await interaction.reply({ embeds: [passEmbed] });

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
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
          .setTitle('🚫 Hile & İhlal Tespit Tutanağı');

        const inputCheatType = new TextInputBuilder()
          .setCustomId('cheat_type')
          .setLabel('Tespit Edilen Hile / İhlal:')
          .setPlaceholder('Örn: Vape V4, AutoClicker, Reach, Kontrolü Reddetti')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const inputCheatNotes = new TextInputBuilder()
          .setCustomId('cheat_notes')
          .setLabel('Ek Kanıt / Detay Notu (İsteğe bağlı):')
          .setPlaceholder('Örn: %temp% dosyasında kalıntı bulundu.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

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
          new ButtonBuilder().setCustomId(`gw_join_${giveawayId}`).setLabel(`🎉 Katıl (${updatedCount})`).setStyle(ButtonStyle.Success)
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

      // 9. GENEL DESTEK TICKET OLUŞTURMA
      if (customId.startsWith('ticket_create_')) {
        const parts = customId.split('_');
        const roleId = parts[2];
        const categoryId = parts[3];

        const channelName = `destek-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName);

        if (existingChannel) {
          return interaction.reply({ content: `⚠️ Zaten açık bir destek talebiniz var: ${existingChannel}`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: (categoryId && categoryId !== 'none') ? categoryId : null,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
          ]
        });

        if (roleId && roleId !== 'none') {
          await ticketChannel.permissionOverwrites.create(roleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
          }).catch(() => {});
        }

        const insideEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setTitle(`📩 Genel Destek Talebi: #${ticketChannel.name}`)
          .setDescription(`Merhaba ${interaction.user}! Sunucu yetkililerimiz en kısa sürede talebinizle ilgilenecektir.\n\nLütfen sorunuzu veya şikayetinizi detaylı yazınız.`)
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close_action').setLabel('🔒 Talebi Kapat').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        await ticketChannel.send({ content: `${interaction.user} ${roleId && roleId !== 'none' ? `<@&${roleId}>` : ''}`, embeds: [insideEmbed], components: [closeRow] });
        return interaction.editReply({ content: `✅ Destek talebiniz açıldı: ${ticketChannel}` });
      }

      // 10. TICKET KAPATMA
      if (customId === 'ticket_close_action') {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor('#EF4444').setDescription('🔒 Destek talebi 5 saniye içinde kapatılacak...').setFooter({ text: FOOTER_TEXT })] });
        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 11. DOĞRULAMA
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
// 6. KESİNTİSİZ ÇALIŞMA (CRASH KORUMASI)
// ==========================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [Hata Yakalandı - UnhandledRejection]:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error('⚠️ [Hata Yakalandı - UncaughtException]:', err);
});

// ==========================================
// 7. GİRİŞ YAPMA (LOGIN)
// ==========================================
if (!process.env.TOKEN) {
  console.warn('⚠️ DİKKAT: TOKEN bulunamadı!');
} else {
  client.login(process.env.TOKEN).catch(err => {
    console.error('❌ Bot Discord\'a bağlanamadı:', err.message);
  });
}
