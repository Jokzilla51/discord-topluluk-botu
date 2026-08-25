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
// 2. DISCORD CLIENT
// ==========================================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Hafıza Havuzları
const activeGiveaways = new Map();
const activeScrims = new Map();
let applicationCounter = 1;

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
    .setDescription('Mevcut sunucu kanallarını, rolleri ve izinleri analiz edip yapılması gerekenleri DM atar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // 3. /haftanin-oyuncusu
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

  // 4. /scrim
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

  // 5. /kilit
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

  // 6. /klan-rutbe
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

  // 7. /basvuru-kur
  new SlashCommandBuilder()
    .setName('basvuru-kur')
    .setDescription('Anydesk, hile modalı ve yetkili güvenlik onaylı klan başvuru paneli kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Başvuru butonunun konulacağı kanal (Örn: #klan-başvuru)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addChannelOption(option =>
      option.setName('log_kanali')
        .setDescription('Gelen başvuruların düşeceği yetkili kanalı (Örn: #başvuru-log)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('klan_rolu')
        .setDescription('Kabul edilince verilecek klan üye rolü (Örn: @Vyron • Klan Üye)')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('yetkili_rol')
        .setDescription('Başvuruları inceleyecek yetkili rolü')
        .setRequired(false)
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

  // 11. /mute
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

  // 12. /unmute
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Kullanıcının susturmasını kaldırır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('kullanici')
        .setDescription('Susturması kaldırılacak kullanıcı')
        .setRequired(true)
    ),

  // 13. /kick
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

  // 14. /ban
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

  // 15. /duyuru
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

  // 16. /anket
  new SlashCommandBuilder()
    .setName('anket')
    .setDescription('Sunucuda oylama başlatır.')
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
              name: '🔍 Sunucu Denetimi & Analiz',
              value: '• `/sunucu-analiz` : Mevcut kanallarını ve rollerini analiz edip yapılması gerekenleri DM atar.'
            },
            {
              name: '⚔️ Klan & Alım Sistemleri',
              value: '• `/basvuru-kur` : Formlu, Anydesk kontrol odalı klan başvuru paneli kurar.\n• `/haftanin-oyuncusu` : Haftanın Trapcisi veya Elytracısı unvanını verir ve duyurur.\n• `/scrim` : Otomatik takım bölen klan içi maç lobisi açar.\n• `/klan-rutbe` : Has Klan Üyesi yapar veya klandan çıkarır.'
            },
            {
              name: '🛡️ Güvenlik & Moderasyon',
              value: '• `/kilit` : Kanalı kilitleyip üye mesajlarına kapatır veya açar.\n• `/mute` : Kullanıcıyı süreli susturur (Timeout) ve loglar.\n• `/unmute` : Susturmayı kaldırır.\n• `/kick` : Kullanıcıyı sunucudan atar.\n• `/ban` : Kullanıcıyı sunucudan yasaklar.\n• `/sil` : Mesajları topluca siler (1-100).\n• `/dogrulama-kur` : Butonlu üye doğrulama paneli.'
            },
            {
              name: '🎉 Çekiliş & Topluluk',
              value: '• `/cekilis` : Kazananları otomatik etiketleyen çekiliş sistemi.\n• `/reroll` : Çekilişten yeni kazanan seçer.\n• `/duyuru` : Şık klan ve sunucu duyurusu yayınlar.\n• `/anket` : Oylama başlatır.\n• `/kullanici-bilgi` & `/sunucu-bilgi` : Detaylı istatistikler.'
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

      // 2. /sunucu-analiz
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
          roleHierarchyWarnings.push(`⚠️ **${clanRole.name}** rolü botun rolünden (\`${botRole.name}\`) yukarıda! Bot bu rolü başvuranlara veremeyebilir. Lütfen bot rolünü yukarı taşıyın.`);
        }
        if (memberRole && botRole.position <= memberRole.position) {
          roleHierarchyWarnings.push(`⚠️ **${memberRole.name}** rolü botun rolünden yukarıda! Doğrulama paneli üyelere rol veremeyebilir.`);
        }
        if (hasClanRole && botRole.position <= hasClanRole.position) {
          roleHierarchyWarnings.push(`⚠️ **${hasClanRole.name}** rolü botun rolünden yukarıda!`);
        }

        const channels = guild.channels.cache;
        const chApply = channels.find(c => c.name.includes('klan-başvuru') || c.name.includes('basvuru'));
        const chApplyLog = channels.find(c => c.name.includes('başvuru-log') || c.name.includes('basvuru-log'));
        const chVerify = channels.find(c => c.name.includes('doğrulama') || c.name.includes('dogrulama') || c.name.includes('kayıt') || c.name.includes('giris'));
        const chTicket = channels.find(c => c.name.includes('destek') || c.name.includes('ticket'));
        const chPunishLog = channels.find(c => c.name.includes('ceza-kayıt') || c.name.includes('ceza-log') || c.name.includes('moderasyon-log'));

        const actionItems = [];

        if (chApply && clanRole && chApplyLog) {
          actionItems.push(`✅ **Klan Başvuru Paneli:** Hazır! Paneli kurmak için şu komutu yazabilirsiniz:\n` +
            `└ \`/basvuru-kur kanal:#${chApply.name} log_kanali:#${chApplyLog.name} klan_rolu:@${clanRole.name}\``);
        } else {
          if (!chApply) actionItems.push('❌ **#klan-başvuru** kanalı bulunamadı. Adayların başvuru yapacağı bir metin kanalı belirleyin.');
          if (!chApplyLog) actionItems.push('❌ **#başvuru-log** kanalı bulunamadı. Gelen başvuruların düşeceği gizli yetkili kanalı oluşturun.');
          if (!clanRole) actionItems.push('❌ **Vyron • Klan Üye** rolü bulunamadı.');
        }

        if (chVerify && memberRole) {
          actionItems.push(`✅ **Doğrulama Paneli:** Hazır! Butonlu paneli kurmak için:\n` +
            `└ \`/dogrulama-kur kanal:#${chVerify.name} verilecek_rol:@${memberRole.name}\``);
        }

        if (chTicket && ticketStaffRole) {
          actionItems.push(`✅ **Destek (Ticket) Paneli:** Hazır! Paneli kurmak için:\n` +
            `└ \`/ticket-kur kanal:#${chTicket.name} yetkili_rol:@${ticketStaffRole.name}\``);
        }

        if (!chPunishLog) {
          actionItems.push('⚠️ **#ceza-kayıt-log** kanalı yok. Susturma, atma, ban ve hile kayıtlarının tutulması için bir ceza log kanalı açmanız önerilir.');
        }

        const totalMembers = guild.memberCount;
        const clanMembersCount = clanRole ? clanRole.members.size : 0;
        const hasClanCount = hasClanRole ? hasClanRole.members.size : 0;

        const reportEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle(`🛡️ ${guild.name} - Detaylı Sunucu & Güvenlik Analiz Raporu`)
          .setDescription(
            `Merhaba <@${interaction.user.id}>! Sunucunuzun mevcut kanalları, rolleri ve bot entegrasyonu başarıyla tarandı.\n\n` +
            `Aşağıda sunucunuzu %100 kusursuz hale getirmek için analiz detayları ve yapılması gerekenler yer almaktadır:`
          )
          .addFields(
            {
              name: '📊 Kadro & Üye İstatistikleri',
              value: `• **Toplam Üye:** \`${totalMembers}\`\n• **Klan Savaşçısı Sayısı:** \`${clanMembersCount}\`\n• **Has Klan Üye Sayısı:** \`${hasClanCount}\`\n• **Toplam Kanal / Rol:** \`${channels.size}\` Kanal / \`${roles.size}\` Rol`,
              inline: false
            },
            {
              name: '🛡️ Rol Hiyerarşisi & Güvenlik Durumu',
              value: roleHierarchyWarnings.length > 0 ? roleHierarchyWarnings.join('\n') : '✅ **Mükemmel!** Botun rol yetkisi klan ve üye rollerinin üzerinde, tüm rolleri sorunsuz verebilir.',
              inline: false
            },
            {
              name: '🔍 Tespit Edilen Mevcut Kanallar & Roller',
              value: `• **Klan Başvuru Kanalı:** ${chApply ? `✅ \`#${chApply.name}\`` : '❌ Yok'}\n• **Başvuru Log Kanalı:** ${chApplyLog ? `✅ \`#${chApplyLog.name}\`` : '❌ Yok'}\n• **Doğrulama Kanalı:** ${chVerify ? `✅ \`#${chVerify.name}\`` : '❌ Yok'}\n• **Destek Kanalı:** ${chTicket ? `✅ \`#${chTicket.name}\`` : '❌ Yok'}\n• **Ceza Log Kanalı:** ${chPunishLog ? `✅ \`#${chPunishLog.name}\`` : '❌ Yok'}\n• **Klan Üye Rolü:** ${clanRole ? `✅ \`@${clanRole.name}\`` : '❌ Yok'}\n• **Trapçi Rolü:** ${trapciRole ? `✅ \`@${trapciRole.name}\`` : '❌ Yok'}\n• **Elytracı Rolü:** ${elytraciRole ? `✅ \`@${elytraciRole.name}\`` : '❌ Yok'}`,
              inline: false
            },
            {
              name: '🚀 Yapılması Gerekenler & Adım Adım Kurulum Tavsiyeleri',
              value: actionItems.length > 0 ? actionItems.join('\n\n') : '✅ Sunucunuzdaki tüm temel kanallar ve roller eksiksiz görünüyor!',
              inline: false
            }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        try {
          await interaction.user.send({ embeds: [reportEmbed] });
          return interaction.editReply({
            content: `✅ **Sunucu analiz raporunuz hazırlandı ve DM kutunuza başarıyla gönderildi!** 📬 Lütfen Discord özel mesajlarınızı kontrol ediniz.`
          });
        } catch (dmErr) {
          return interaction.editReply({
            content: `⚠️ **DM kutunuz kapalı olduğu için raporu buraya bırakıyorum:**`,
            embeds: [reportEmbed]
          });
        }
      }

      // 3. /haftanin-oyuncusu
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

      // 4. /scrim
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

      // 5. /kilit
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

      // 6. /klan-rutbe
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

      // 7. /basvuru-kur
      if (commandName === 'basvuru-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const logChannel = interaction.options.getChannel('log_kanali');
        const clanRole = interaction.options.getRole('klan_rolu');
        const staffRole = interaction.options.getRole('yetkili_rol') || interaction.guild.roles.everyone;

        const applyEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle(`⚔️ ${interaction.guild.name} - Klan Başvuru Paneli`)
          .setDescription(
            `Vyron klanımıza katılmak ve klan savaşlarında yer almak ister misiniz?\n\n` +
            `📌 **Klan Alım & Kontrol Süreci:**\n` +
            `1️⃣ Aşağıdaki **"⚔️ Klan Başvurusu Yap"** butonuna basarak formu eksiksiz doldurun.\n` +
            `2️⃣ Yetkili ekibimiz başvurunuzu inceler ve adınıza özel **Anydesk Kontrol Odası** açar.\n` +
            `3️⃣ Kontrolde **temiz** çıkan adaylara doğrudan **${clanRole}** rolü tanımlanır!\n\n` +
            `👇 Başvurmak için butona basınız.`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const applyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_open_apply_${logChannel.id}_${clanRole.id}_${staffRole.id}`)
            .setLabel('⚔️ Klan Başvurusu Yap')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
        );

        await targetChannel.send({ embeds: [applyEmbed], components: [applyRow] });

        return interaction.reply({
          content: `✅ Klan başvuru paneli ${targetChannel} kanalına kuruldu! (Gelen başvurular: ${logChannel})`,
          ephemeral: true
        });
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

      // 11. /mute
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

      // 12. /unmute
      if (commandName === 'unmute') {
        const targetUser = interaction.options.getUser('kullanici');
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) return interaction.reply({ content: '❌ Kullanıcı bulunamadı!', ephemeral: true });

        await member.timeout(null, 'Susturma kaldırıldı').catch(() => {});
        return interaction.reply({ content: `✅ ${member} kullanıcısının susturması kaldırıldı.` });
      }

      // 13. /kick
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

      // 14. /ban
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

      // 15. /duyuru
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

      // 16. /anket
      if (commandName === 'anket') {
        const question = interaction.options.getString('soru');
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;

        const pollEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle('📊 RESMİ VYRON ANKETİ')
          .setDescription(`**${question}**\n\nKatılmak için aşağıdaki butonlara basınız!`)
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const pollRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('poll_yes').setLabel('Evet (0)').setStyle(ButtonStyle.Success).setEmoji('👍'),
          new ButtonBuilder().setCustomId('poll_no').setLabel('Hayır (0)').setStyle(ButtonStyle.Danger).setEmoji('👎')
        );

        await targetChannel.send({ embeds: [pollEmbed], components: [pollRow] });
        return interaction.reply({ content: `✅ Anket başlatıldı!`, ephemeral: true });
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
      const parts = interaction.customId.split('_');
      const logChannelId = parts[3];
      const clanRoleId = parts[4];
      const staffRoleId = parts[5];

      const modal = new ModalBuilder()
        .setCustomId(`modal_clan_apply_${logChannelId}_${clanRoleId}_${staffRoleId}`)
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

    // Form Gönderildiğinde
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_clan_apply_')) {
      const parts = interaction.customId.split('_');
      const logChannelId = parts[3];
      const clanRoleId = parts[4];
      const staffRoleId = parts[5];

      const ign = interaction.fields.getTextInputValue('ign');
      const ageActive = interaction.fields.getTextInputValue('age_active');
      const oldClans = interaction.fields.getTextInputValue('old_clans') || 'Belirtilmedi';
      const experience = interaction.fields.getTextInputValue('experience');
      const anydeskReady = interaction.fields.getTextInputValue('anydesk_ready');

      const logChannel = interaction.guild.channels.cache.get(logChannelId);
      if (!logChannel) {
        return interaction.reply({ content: '❌ Başvuru log kanalı bulunamadı!', ephemeral: true });
      }

      const applicant = interaction.user;
      const appId = applicationCounter++;

      const appLogEmbed = new EmbedBuilder()
        .setColor('#8B5CF6')
        .setTitle(`⚔️ Yeni Klan Başvurusu: ${ign} (No: #${String(appId).padStart(4, '0')})`)
        .setDescription(`Adayın başvuru bilgileri aşağıdadır:`)
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

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`app_kontrol_${applicant.id}_${clanRoleId}_${staffRoleId}`)
          .setLabel('🖥️ Anydesk Kontrol Odası Aç')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔍'),
        new ButtonBuilder()
          .setCustomId(`app_accept_${applicant.id}_${clanRoleId}_${staffRoleId}`)
          .setLabel('✅ Doğrudan Kabul Et')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`app_reject_${applicant.id}_${staffRoleId}`)
          .setLabel('❌ Reddet')
          .setStyle(ButtonStyle.Danger)
      );

      await logChannel.send({
        content: `${staffRoleId !== 'none' ? `<@&${staffRoleId}>` : ''} 📢 **Yeni Klan Başvurusu Geldi!**`,
        embeds: [appLogEmbed],
        components: [actionRow]
      });

      return interaction.reply({
        content: '✅ **Başvurunuz başarıyla yetkili ekibimize iletildi!** Yetkililerimiz inceledikten sonra adınıza özel Anydesk kontrol odası açacaktır. Bol şanslar! ⚔️',
        ephemeral: true
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

      // 1. SCRIM KATILMA & AYRILMA
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

      // 2. ÇEKİLİŞE KATILMA
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

      // 3. ANYDESK KONTROL ODASI AÇMA
      if (customId.startsWith('app_kontrol_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const clanRoleId = parts[3];
        const staffRoleId = parts[4];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Kendi başvurunuza işlem yapamazsınız!', ephemeral: true });
        }
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                        (staffRoleId !== 'none' && interaction.member.roles.cache.has(staffRoleId));
        if (!hasPerm) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
        if (!applicant) return interaction.reply({ content: '❌ Aday sunucudan ayrılmış!', ephemeral: true });

        const channelName = `kontrol-${applicant.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
        if (existing) {
          return interaction.reply({ content: `⚠️ Aday için zaten açık bir kontrol odası var: ${existing}`, ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const permissionOverwrites = [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: applicant.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
        ];

        if (staffRoleId && staffRoleId !== 'none') {
          permissionOverwrites.push({
            id: staffRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
          });
        }

        const kontrolChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites
        });

        try {
          await applicant.send({
            content: `🔔 **Vyron Klan Başvurunuz İçin Anydesk Kontrol Odası Açıldı!**\nLütfen sunucumuzdaki ${kontrolChannel} kanalına geçip Anydesk kodunuzu iletiniz.`
          });
        } catch (e) {}

        const kontrolEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setTitle('🖥️ Vyron Klan - Anydesk & PC Kontrol Odası')
          .setDescription(
            `Merhaba ${applicant}! Klan başvurunuz değerlendirmeye alındı ve adınıza özel kontrol odası açıldı.\n\n` +
            `👤 **Kontrol Edilen Aday:** ${applicant}\n` +
            `🛡️ **Kontrol Eden Yetkili:** ${interaction.user}\n\n` +
            `📌 **Adayın Yapması Gerekenler:**\n` +
            `1. [Anydesk](https://anydesk.com) uygulamasını açıp 9 haneli kodunuzu buraya yazın.\n` +
            `2. ` + '`🔊・Yetkili Ses Odası`' + ` kanalına katılın.\n\n` +
            `⚠️ **DİKKAT:** Aşağıdaki sonuç butonlarını **YALNIZCA KONTROL YETKİLİSİ** kullanabilir!`
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp();

        const kontrolRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`kontrol_pass_${applicant.id}_${clanRoleId}_${interaction.user.id}`)
            .setLabel('✅ Temiz - Klana Al (Rol Ver)')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🛡️'),
          new ButtonBuilder()
            .setCustomId(`kontrol_fail_modal_${applicant.id}`)
            .setLabel('🚫 Hile Tespit Edildi (Reddet)')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`kontrol_afk_${applicant.id}_${interaction.user.id}`)
            .setLabel('⏳ Aday Gelmedi / Kapat')
            .setStyle(ButtonStyle.Secondary)
        );

        await kontrolChannel.send({
          content: `📢 ${applicant} ${interaction.user} **Anydesk Kontrol Odası Başlatıldı!**`,
          embeds: [kontrolEmbed],
          components: [kontrolRow]
        });

        const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor('#F59E0B')
          .addFields({ name: '📌 Durum', value: `🔍 ${interaction.user} tarafından kontrol odası açıldı: ${kontrolChannel}`, inline: false });

        await interaction.message.edit({ embeds: [updateEmbed], components: [] });

        return interaction.editReply({
          content: `✅ ${applicant} için Anydesk kontrol odası başarıyla açıldı: ${kontrolChannel}`
        });
      }

      // 4. KONTROLDEN GEÇTİ (TEMİZ)
      if (customId.startsWith('kontrol_pass_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const clanRoleId = parts[3];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ **Kendi kontrolünüzü onaylayamazsınız!** Yalnızca yetkililer yapabilir.', ephemeral: true });
        }

        const isAuthorized = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                             interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isAuthorized) {
          return interaction.reply({ content: '❌ Bu kararı yalnızca yetkililer verebilir!', ephemeral: true });
        }

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
        const clanRole = interaction.guild.roles.cache.get(clanRoleId);

        if (applicant && clanRole) {
          await applicant.roles.add(clanRole).catch(() => {});
          try {
            await applicant.send({
              content: `🎉 **Tebrikler ${applicant.user.username}!** Vyron klanımızın Anydesk kontrolünden başarıyla geçtiniz ve **${clanRole.name}** rolünüz tanımlandı. Klana hoş geldiniz! ⚔️`
            });
          } catch (e) {}

          const clanChat = interaction.guild.channels.cache.find(c => c.name.includes('klan-sohbet'));
          if (clanChat) {
            await clanChat.send(`🎉 Hoş geldin ${applicant}! Anydesk kontrolünden temiz olarak geçip **Vyron Klanına** katıldı! ⚔️`).catch(() => {});
          }
        }

        const passEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle('🎉 Kontrol Başarılı - Klana Hoş Geldin!')
          .setDescription(`Tebrikler ${applicant}! Anydesk kontrolünden **TEMİZ** olarak geçtiniz ve **${clanRole ? clanRole.name : 'Klan Üyesi'}** rolü tanımlandı!\n\n🔒 Bu oda 5 saniye içinde kapatılacaktır.`)
          .setFooter({ text: FOOTER_TEXT });

        await interaction.reply({ embeds: [passEmbed] });

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 5. HİLE TESPİT EDİLDİ - MODAL AÇ
      if (customId.startsWith('kontrol_fail_modal_')) {
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

      // 6. ADAY GELMEDİ / ODAYI KAPAT
      if (customId.startsWith('kontrol_afk_')) {
        const applicantId = customId.split('_')[2];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Bu butonu aday kullanamaz!', ephemeral: true });
        }

        const afkEmbed = new EmbedBuilder()
          .setColor('#6B7280')
          .setTitle('🔒 Oda Kapatılıyor')
          .setDescription(`Kontrol odası yetkili (${interaction.user}) tarafından sonlandırıldı. 5 saniye içinde siliniyor...`)
          .setFooter({ text: FOOTER_TEXT });

        await interaction.reply({ embeds: [afkEmbed] });

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 7. DOĞRUDAN KABUL ET
      if (customId.startsWith('app_accept_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const clanRoleId = parts[3];
        const staffRoleId = parts[4];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Kendi başvurunuzu onaylayamazsınız!', ephemeral: true });
        }
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                        (staffRoleId !== 'none' && interaction.member.roles.cache.has(staffRoleId));
        if (!hasPerm) {
          return interaction.reply({ content: '❌ Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
        const clanRole = interaction.guild.roles.cache.get(clanRoleId);

        if (!applicant) return interaction.reply({ content: '❌ Aday sunucudan ayrılmış!', ephemeral: true });

        if (clanRole) {
          await applicant.roles.add(clanRole).catch(() => {});
          try {
            await applicant.send({
              content: `🎉 **Tebrikler ${applicant.user.username}!** Vyron klan başvurunuz doğrudan onaylandı ve **${clanRole.name}** rolünüz verildi! ⚔️`
            });
          } catch (e) {}
        }

        const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor('#10B981')
          .addFields({ name: '📢 Sonuç', value: `✅ ${interaction.user} tarafından **KABUL EDİLDİ** ve klan rolü verildi!`, inline: false });

        await interaction.message.edit({ embeds: [updateEmbed], components: [] });
        return interaction.reply({ content: `✅ ${applicant} klana kabul edildi ve rolü tanımlandı!`, ephemeral: true });
      }

      // 8. REDDET
      if (customId.startsWith('app_reject_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const staffRoleId = parts[3];

        if (interaction.user.id === applicantId) {
          return interaction.reply({ content: '❌ Bu butonu kullanamazsınız!', ephemeral: true });
        }
        const hasPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) || 
                        interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                        (staffRoleId !== 'none' && interaction.member.roles.cache.has(staffRoleId));
        if (!hasPerm) {
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

        const updateEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor('#EF4444')
          .addFields({ name: '📢 Sonuç', value: `❌ ${interaction.user} tarafından **REDDEDİLDİ**.` });

        await interaction.message.edit({ embeds: [updateEmbed], components: [] });
        return interaction.reply({ content: `❌ Başvuru reddedildi.`, ephemeral: true });
      }

      // 9. TICKET OLUŞTURMA
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

      // 12. ANKET OYLARI
      if (customId === 'poll_yes' || customId === 'poll_no') {
        return interaction.reply({ content: `🗳️ Oyunuz başarıyla kaydedildi!`, ephemeral: true });
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
