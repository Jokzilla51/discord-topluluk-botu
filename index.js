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
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const express = require('express');
const ms = require('ms');
require('dotenv').config();

// ==========================================
// 1. EXPRESS WEB SUNUCUSU (Render 7/24 İçin)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Vyron Discord Botu</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #0f172a; color: #fff;">
        <h1 style="color: #38bdf8;">⚔️ Vyron Klan & Topluluk Botu</h1>
        <p style="font-size: 18px; color: #4ade80;">✅ Durum: 7/24 Aktif ve Çalışıyor!</p>
        <p style="color: #94a3b8;">Render Web Service üzerinde barındırılıyor.</p>
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

// Aktif çekiliş hafızası
const activeGiveaways = new Map();

// ==========================================
// 3. SLASH KOMUTLARI
// ==========================================
const commands = [
  // 1. Yardım
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Botun tüm komutlarını ve Vyron klan yönetim kılavuzunu gösterir.'),

  // 2. Sunucu Baştan Aşağı Kurma (Vyron Özel Şablonu)
  new SlashCommandBuilder()
    .setName('sunucu-kur')
    .setDescription('Vyron klanı için tüm kategori, sohbet, klan, yetkili ve ses kanallarını otomatik kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(option =>
      option.setName('otomatik_paneller')
        .setDescription('Doğrulama, Ticket ve Kurallar panellerini de otomatik kursun mu? (Varsayılan: Evet)')
        .setRequired(false)
    ),

  // 3. Ticket / Destek Paneli Kurma
  new SlashCommandBuilder()
    .setName('ticket-kur')
    .setDescription('Kanalda butonlu destek talebi (ticket) paneli oluşturur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Panelin gönderileceği metin kanalı')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption(option =>
      option.setName('yetkili_rol')
        .setDescription('Destek taleplerini görebilecek yetkili rol')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('kategori')
        .setDescription('Ticket kanallarının açılacağı kategori')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  // 4. Çekiliş Başlatma
  new SlashCommandBuilder()
    .setName('cekilis')
    .setDescription('Sunucuda süreli ve ödüllü çekiliş başlatır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('sure')
        .setDescription('Çekiliş süresi (Örn: 10s, 5m, 1h, 1d)')
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
    )
    .addChannelOption(option =>
      option.setName('kanal')
        .setDescription('Çekilişin yapılacağı kanal')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    ),

  // 5. Doğrulama Paneli Kurma
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

  // 6. Mesaj Temizleme (Moderasyon)
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
  client.user.setActivity('⚔️ Vyron Klanı & Topluluğu', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('⚡ Komutlar sunucunuza anında (0 saniye gecikmeyle) yükleniyor...');
    
    // 1. Botun bulunduğu tüm sunuculara anında yükle (Bekleme süresi 0 olur!)
    const guilds = await client.guilds.fetch();
    for (const [guildId] of guilds) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands.map(cmd => cmd.toJSON()) }
      );
      console.log(`✅ Komutlar bu sunucuya anında yüklendi: ${guildId}`);
    }

    // 2. Global olarak da kaydet
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
  } catch (error) {
    console.error('❌ Komut kaydı hatası:', error);
  }
});

// Yeni sunucuya eklendiğinde de anında komutları yükle
client.on('guildCreate', async (guild) => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log(`✅ Yeni sunucuya komutlar anında yüklendi: ${guild.name}`);
  } catch (err) {
    console.error('Yeni sunucu komut yükleme hatası:', err);
  }
});

// ==========================================
// 5. ETKİLEŞİM VE İŞLEMLER
// ==========================================
client.on('interactionCreate', async (interaction) => {
  try {
    // --- A. SLASH KOMUTLARI ---
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // 1. /yardim
      if (commandName === 'yardim') {
        const helpEmbed = new EmbedBuilder()
          .setColor('#8B5CF6')
          .setTitle('⚔️ Vyron Klan Botu Komut Merkezi')
          .setDescription('Vyron klanı ve topluluğu için optimize edilmiş yönetim sistemleri:')
          .addFields(
            { name: '🏛️ `/sunucu-kur`', value: 'Tüm klan kategorilerini, sohbetlerini, klan ses odalarını ve yetkili odalarını otomatik sıfırdan kurar.' },
            { name: '🎫 `/ticket-kur`', value: 'Butonlu destek paneli kurar. Kullanıcıya özel kilitli destek odası açar.' },
            { name: '🎉 `/cekilis`', value: 'Süreli, butonlu ve otomatik kazanan seçen çekiliş başlatır.' },
            { name: '🛡️ `/dogrulama-kur`', value: 'Gelen üyeler için tek tıkla rol veren doğrulama paneli oluşturur.' },
            { name: '🧹 `/sil`', value: 'Kanaldaki istenmeyen mesajları topluca siler (1-100 adet).' }
          )
          .setFooter({ text: 'Vyron Clan Management System' })
          .setTimestamp();

        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
      }

      // 2. /sunucu-kur (TÜM SUNUCUYU OTOMATİK KURMA)
      if (commandName === 'sunucu-kur') {
        await interaction.deferReply({ ephemeral: true });

        const autoPanels = interaction.options.getBoolean('otomatik_paneller') ?? true;
        const guild = interaction.guild;

        // Mevcut rolleri eşleştirme
        const memberRole = guild.roles.cache.find(r => r.name.includes('Üye') || r.name.includes('Vyron • Üye')) || guild.roles.everyone;
        const clanMemberRole = guild.roles.cache.find(r => r.name.includes('Klan Üye') || r.name.includes('Has Klan'));
        const staffRole = guild.roles.cache.find(r => r.name.includes('Yönetici') || r.name.includes('Yetkili') || r.name.includes('Admin') || r.name.includes('Mod'));
        const ticketStaffRole = guild.roles.cache.find(r => r.name.includes('Ticket') || r.name.includes('Destek')) || staffRole || guild.roles.everyone;

        await interaction.editReply({ content: '⚙️ **Vyron Sunucu Kurulumu Başlatıldı!** Kategoriler ve kanallar inşa ediliyor, lütfen birkaç saniye bekleyin...' });

        // --- 1. BİLGİLENDİRME & GİRİŞ KATEGORİSİ ---
        const catInfo = await guild.channels.create({
          name: '📢・VYRON BİLGİLENDİRME',
          type: ChannelType.GuildCategory
        });

        const chRules = await guild.channels.create({
          name: '📜・kurallar',
          type: ChannelType.GuildText,
          parent: catInfo.id,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
        });

        const chAnnounce = await guild.channels.create({
          name: '📢・duyurular',
          type: ChannelType.GuildText,
          parent: catInfo.id,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
        });

        const chVerify = await guild.channels.create({
          name: '🛡️・doğrulama',
          type: ChannelType.GuildText,
          parent: catInfo.id,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
        });

        const chGiveaway = await guild.channels.create({
          name: '🎉・çekilişler',
          type: ChannelType.GuildText,
          parent: catInfo.id,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
        });

        const chSocial = await guild.channels.create({
          name: '🌐・sosyal-medya',
          type: ChannelType.GuildText,
          parent: catInfo.id,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
        });

        // --- 2. VYRON GENEL TOPLULUK SOHBETİ ---
        const catChat = await guild.channels.create({
          name: '💬・VYRON GENEL TOPLULUK',
          type: ChannelType.GuildCategory
        });

        await guild.channels.create({ name: '💬・sohbet', type: ChannelType.GuildText, parent: catChat.id });
        await guild.channels.create({ name: '📸・foto-medya', type: ChannelType.GuildText, parent: catChat.id });
        await guild.channels.create({ name: '🤖・bot-komut', type: ChannelType.GuildText, parent: catChat.id });
        await guild.channels.create({ name: '💡・öneri-anket', type: ChannelType.GuildText, parent: catChat.id });

        // --- 3. VYRON KLAN ÖZEL BÖLÜMÜ (KLAN ÜYELERİNE ÖZEL) ---
        const clanOverwrites = [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
        ];
        if (clanMemberRole) {
          clanOverwrites.push({
            id: clanMemberRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect]
          });
        }
        if (staffRole) {
          clanOverwrites.push({
            id: staffRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect]
          });
        }

        const catClan = await guild.channels.create({
          name: '⚔️・VYRON KLAN MERKEZİ',
          type: ChannelType.GuildCategory,
          permissionOverwrites: clanOverwrites
        });

        await guild.channels.create({ name: '📜・klan-duyuru', type: ChannelType.GuildText, parent: catClan.id });
        await guild.channels.create({ name: '⚔️・klan-sohbet', type: ChannelType.GuildText, parent: catClan.id });
        await guild.channels.create({ name: '🎯・klan-taktik-sandık', type: ChannelType.GuildText, parent: catClan.id });
        await guild.channels.create({ name: '🔊・Klan Ses 1', type: ChannelType.GuildVoice, parent: catClan.id, userLimit: 5 });
        await guild.channels.create({ name: '🔊・Klan Ses 2', type: ChannelType.GuildVoice, parent: catClan.id, userLimit: 10 });
        await guild.channels.create({ name: '🔊・Klan Toplantı', type: ChannelType.GuildVoice, parent: catClan.id });

        // --- 4. GENEL SES ODALARI ---
        const catVoice = await guild.channels.create({
          name: '🔊・GENEL SES ODALARI',
          type: ChannelType.GuildCategory
        });

        await guild.channels.create({ name: '🔊・Sohbet Odası #1', type: ChannelType.GuildVoice, parent: catVoice.id });
        await guild.channels.create({ name: '🔊・Sohbet Odası #2', type: ChannelType.GuildVoice, parent: catVoice.id });
        await guild.channels.create({ name: '🎮・Oyun Odası (Duo)', type: ChannelType.GuildVoice, parent: catVoice.id, userLimit: 2 });
        await guild.channels.create({ name: '🎮・Oyun Odası (Trio)', type: ChannelType.GuildVoice, parent: catVoice.id, userLimit: 3 });
        await guild.channels.create({ name: '🎮・Oyun Odası (Squad)', type: ChannelType.GuildVoice, parent: catVoice.id, userLimit: 4 });
        await guild.channels.create({ name: '💤・AFK / Dinlenme', type: ChannelType.GuildVoice, parent: catVoice.id });

        // --- 5. DESTEK VE TICKET KATEGORİSİ ---
        const catTicket = await guild.channels.create({
          name: '🎫・VYRON DESTEK MERKEZİ',
          type: ChannelType.GuildCategory
        });

        const chTicketPanel = await guild.channels.create({
          name: '📩・destek-talebi',
          type: ChannelType.GuildText,
          parent: catTicket.id,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
        });

        // --- 6. YETKİLİ YÖNETİM MERKEZİ (GİZLİ) ---
        const staffOverwrites = [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
        ];
        if (staffRole) {
          staffOverwrites.push({
            id: staffRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect]
          });
        }

        const catStaff = await guild.channels.create({
          name: '🛡️・YETKİLİ MERKEZİ',
          type: ChannelType.GuildCategory,
          permissionOverwrites: staffOverwrites
        });

        await guild.channels.create({ name: '🔒・yetkili-sohbet', type: ChannelType.GuildText, parent: catStaff.id });
        await guild.channels.create({ name: '📋・yetkili-duyuru', type: ChannelType.GuildText, parent: catStaff.id });
        await guild.channels.create({ name: '🔨・ceza-kayıt-log', type: ChannelType.GuildText, parent: catStaff.id });
        await guild.channels.create({ name: '🔊・Yetkili Ses Odası', type: ChannelType.GuildVoice, parent: catStaff.id });
        await guild.channels.create({ name: '🔊・Yönetim Toplantı Odası', type: ChannelType.GuildVoice, parent: catStaff.id });

        // --- OTOMATİK PANELLERİ GÖNDERME ---
        if (autoPanels) {
          // 1. Kurallar Mesajı
          const rulesEmbed = new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle(`📜 ${guild.name} - Sunucu Kuralları`)
            .setDescription(
              '**1.** Saygı ve nezaket esastır. Küfür, hakaret ve argo yasaktır.\n' +
              '**2.** Reklam yapmak (DM dahil) kesinlikle yasaktır ve sınırsız uzaklaştırma sebebidir.\n' +
              '**3.** Dini, milli, ırkçı ve siyasi tartışmalar yapmak yasaktır.\n' +
              '**4.** Spam, flood ve gereksiz büyük harf (CAPS) kullanımı yasaktır.\n' +
              '**5.** Yetkililerin uyarılarına ve kararlarına uymak zorunludur.\n\n' +
              '*(Sunucuda bulunan herkes bu kuralları okumuş ve kabul etmiş sayılır.)*'
            )
            .setFooter({ text: 'Vyron Clan • Adaletli ve Güvenli Topluluk' })
            .setTimestamp();
          await chRules.send({ embeds: [rulesEmbed] });

          // 2. Doğrulama Paneli
          if (memberRole && memberRole.id !== guild.roles.everyone.id) {
            const verifyEmbed = new EmbedBuilder()
              .setColor('#10B981')
              .setTitle(`🛡️ ${guild.name} - Doğrulama ve Giriş`)
              .setDescription(
                'Vyron sunucusuna hoş geldiniz!\n\n' +
                'Kanallara erişim sağlamak, klan sohbetlerine katılmak ve sunucuya tam erişim kazanmak için aşağıdaki **"✅ Doğrula ve Giriş Yap"** butonuna basınız.'
              )
              .setFooter({ text: 'Vyron Güvenlik Sistemi' });

            const verifyRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`verify_role_${memberRole.id}`)
                .setLabel('✅ Doğrula ve Giriş Yap')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛡️')
            );
            await chVerify.send({ embeds: [verifyEmbed], components: [verifyRow] });
          }

          // 3. Ticket Paneli
          const ticketEmbed = new EmbedBuilder()
            .setColor('#3B82F6')
            .setTitle(`📩 ${guild.name} - Destek Talebi Paneli`)
            .setDescription(
              'Vyron yetkili ekibine ulaşmak, klan başvurusu yapmak, şikayet veya öneride bulunmak için aşağıdaki butona basarak özel destek odası açabilirsiniz.'
            )
            .addFields(
              { name: '⏰ Destek', value: '7/24 Talep Oluşturabilirsiniz.', inline: true },
              { name: '🛡️ Yetkili Ekip', value: `${ticketStaffRole || 'Yetkililer'}`, inline: true }
            )
            .setFooter({ text: 'Lütfen gereksiz yere talep açmayınız.' });

          const ticketRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_create_${ticketStaffRole.id}_${catTicket.id}`)
              .setLabel('📩 Destek Talebi Aç')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🎫')
          );
          await chTicketPanel.send({ embeds: [ticketEmbed], components: [ticketRow] });
        }

        const successEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle('🎉 Vyron Sunucu Kurulumu Başarıyla Tamamlandı!')
          .setDescription('Sunucunuz baştan aşağı profesyonel bir klan ve topluluk düzenine getirildi.')
          .addFields(
            { name: '📢 Bilgilendirme', value: '`#kurallar`, `#duyurular`, `#doğrulama`, `#çekilişler`, `#sosyal-medya`' },
            { name: '💬 Genel Topluluk', value: '`#sohbet`, `#foto-medya`, `#bot-komut`, `#öneri-anket`' },
            { name: '⚔️ Vyron Klan Bölümü', value: '`#klan-duyuru`, `#klan-sohbet`, `#klan-taktik`, `3 Ses Kanalı`' },
            { name: '🔊 Genel Sesler', value: '`Sohbet #1-2`, `Duo/Trio/Squad Oyun Odaları`, `AFK Odası`' },
            { name: '🎫 Destek & Yetkili', value: '`#destek-talebi`, `#yetkili-sohbet`, `#ceza-kayıt`, `Toplantı Odaları`' }
          )
          .setFooter({ text: 'Vyron Clan Pro Server System' })
          .setTimestamp();

        return interaction.editReply({ content: '', embeds: [successEmbed] });
      }

      // 3. /ticket-kur
      if (commandName === 'ticket-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const supportRole = interaction.options.getRole('yetkili_rol');
        const category = interaction.options.getChannel('kategori');

        const ticketEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setTitle(`📩 ${interaction.guild.name} - Destek Talebi Paneli`)
          .setDescription('Yetkili ekibimizle iletişime geçmek için aşağıdaki **"Destek Talebi Aç"** butonuna tıklayınız.')
          .addFields(
            { name: '⏰ Destek Saatleri', value: '7/24 Talep oluşturabilirsiniz.', inline: true },
            { name: '🛡️ Yetkili Ekip', value: `${supportRole}`, inline: true }
          )
          .setFooter({ text: 'Lütfen gereksiz yere talep açmayınız.' })
          .setTimestamp();

        const ticketRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_create_${supportRole.id}_${category ? category.id : 'none'}`)
            .setLabel('📩 Destek Talebi Aç')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎫')
        );

        await targetChannel.send({ embeds: [ticketEmbed], components: [ticketRow] });

        return interaction.reply({
          content: `✅ Ticket paneli başarıyla ${targetChannel} kanalına gönderildi! (Yetkili Rol: ${supportRole})`,
          ephemeral: true
        });
      }

      // 4. /cekilis
      if (commandName === 'cekilis') {
        const durationStr = interaction.options.getString('sure');
        const prize = interaction.options.getString('odul');
        const winnerCount = interaction.options.getInteger('kazanan_sayisi') || 1;
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;

        const durationMs = ms(durationStr);
        if (!durationMs || durationMs < 5000 || durationMs > 30 * 24 * 60 * 60 * 1000) {
          return interaction.reply({
            content: '❌ Geçersiz süre! Lütfen geçerli bir süre girin (Örn: `30s`, `10m`, `2h`, `1d`).',
            ephemeral: true
          });
        }

        const endTime = Math.floor((Date.now() + durationMs) / 1000);
        const giveawayId = `gw_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const giveawayEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setTitle(`🎉 ÇEKİLİŞ: ${prize}`)
          .setDescription(
            `Katılmak için aşağıdaki **"🎉 Katıl"** butonuna basınız!\n\n` +
            `🎁 **Ödül:** ${prize}\n` +
            `👑 **Kazanan Sayısı:** ${winnerCount}\n` +
            `⏳ **Bitiş:** <t:${endTime}:R> (<t:${endTime}:f>)\n` +
            `📢 **Başlatan:** ${interaction.user}`
          )
          .setFooter({ text: `0 Katılımcı • ID: ${giveawayId}` })
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
          channelId: targetChannel.id,
          messageId: giveawayMsg.id,
          prize,
          winnerCount,
          endTime,
          hostId: interaction.user.id,
          participants: new Set()
        });

        await interaction.reply({
          content: `✅ Çekiliş başarıyla ${targetChannel} kanalında başlatıldı!`,
          ephemeral: true
        });

        setTimeout(async () => {
          const gw = activeGiveaways.get(giveawayId);
          if (!gw) return;

          try {
            const fetchChannel = await client.channels.fetch(gw.channelId);
            const fetchMsg = await fetchChannel.messages.fetch(gw.messageId);

            const participantArray = Array.from(gw.participants);

            if (participantArray.length === 0) {
              const endedEmbedNoWin = new EmbedBuilder()
                .setColor('#EF4444')
                .setTitle(`🎉 ÇEKİLİŞ SONA ERDİ: ${gw.prize}`)
                .setDescription(`❌ Yeterli katılım olmadığı için kazanan belirlenemedi.\n🎁 **Ödül:** ${gw.prize}`)
                .setFooter({ text: 'Çekiliş Tamamlandı' })
                .setTimestamp();

              await fetchMsg.edit({ embeds: [endedEmbedNoWin], components: [] });
              await fetchChannel.send(`⚠️ **Çekiliş Bitti:** [${gw.prize}] için kimse katılmadı.`);
            } else {
              const shuffled = participantArray.sort(() => 0.5 - Math.random());
              const winners = shuffled.slice(0, Math.min(gw.winnerCount, participantArray.length));
              const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

              const endedEmbed = new EmbedBuilder()
                .setColor('#10B981')
                .setTitle(`🎉 ÇEKİLİŞ SONA ERDİ: ${gw.prize}`)
                .setDescription(
                  `👑 **Kazanan(lar):** ${winnerMentions}\n` +
                  `🎁 **Ödül:** ${gw.prize}\n` +
                  `👥 **Toplam Katılımcı:** ${participantArray.length}\n` +
                  `📢 **Düzenleyen:** <@${gw.hostId}>`
                )
                .setFooter({ text: 'Tebrikler!' })
                .setTimestamp();

              await fetchMsg.edit({ embeds: [endedEmbed], components: [] });
              await fetchChannel.send(`🎉 Tebrikler ${winnerMentions}! **${gw.prize}** ödülünü kazandınız! 🥳`);
            }
          } catch (err) {
            console.error('Çekiliş sonlandırılırken hata:', err);
          } finally {
            activeGiveaways.delete(giveawayId);
          }
        }, durationMs);

        return;
      }

      // 5. /dogrulama-kur
      if (commandName === 'dogrulama-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const role = interaction.options.getRole('verilecek_rol');

        const verifyEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle(`🛡️ ${interaction.guild.name} Doğrulama`)
          .setDescription('Sunucumuza hoş geldiniz! Kanallara erişim sağlamak için aşağıdaki **"Doğrula"** butonuna basınız.')
          .addFields({ name: '🔑 Verilecek Rol', value: `${role}`, inline: true })
          .setFooter({ text: `${interaction.guild.name} Güvenlik Sistemi` })
          .setTimestamp();

        const verifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`verify_role_${role.id}`)
            .setLabel('✅ Doğrula ve Giriş Yap')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🛡️')
        );

        await targetChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });

        return interaction.reply({
          content: `✅ Doğrulama paneli ${targetChannel} kanalına kuruldu! (Rol: ${role})`,
          ephemeral: true
        });
      }

      // 6. /sil (Mesaj Silme)
      if (commandName === 'sil') {
        const amount = interaction.options.getInteger('miktar');
        await interaction.channel.bulkDelete(amount, true);

        return interaction.reply({
          content: `🧹 Başarıyla **${amount}** adet mesaj temizlendi!`,
          ephemeral: true
        });
      }
    }

    // --- B. BUTON ETKİLEŞİMLERİ ---
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // 1. TICKET OLUŞTURMA
      if (customId.startsWith('ticket_create_')) {
        const parts = customId.split('_');
        const roleId = parts[2];
        const categoryId = parts[3];

        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName);

        if (existingChannel) {
          return interaction.reply({
            content: `⚠️ Zaten açık bir destek talebiniz bulunuyor: ${existingChannel}`,
            ephemeral: true
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const permissionOverwrites = [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels
            ]
          }
        ];

        if (roleId && roleId !== 'none') {
          permissionOverwrites.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          });
        }

        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: (categoryId && categoryId !== 'none') ? categoryId : null,
          permissionOverwrites
        });

        const insideEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setTitle(`📩 Destek Talebi: #${ticketChannel.name}`)
          .setDescription(
            `Merhaba ${interaction.user}! Destek talebiniz oluşturuldu.\n\n` +
            `Lütfen sorununuzu veya talebinizi detaylı bir şekilde buraya yazın. Vyron yetkili ekibimiz en kısa sürede ilgilenecektir.`
          )
          .addFields(
            { name: '👤 Talep Sahibi', value: `${interaction.user}`, inline: true },
            { name: '🔒 Talebi Kapatmak', value: 'İşiniz bittiğinde aşağıdaki butona basabilirsiniz.', inline: true }
          )
          .setTimestamp();

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_close_action')
            .setLabel('🔒 Talebi Kapat')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
        );

        await ticketChannel.send({
          content: `${interaction.user} ${roleId && roleId !== 'none' ? `<@&${roleId}>` : ''}`,
          embeds: [insideEmbed],
          components: [closeRow]
        });

        return interaction.editReply({
          content: `✅ Destek talebiniz açıldı: ${ticketChannel}`
        });
      }

      // 2. TICKET KAPATMA
      if (customId === 'ticket_close_action') {
        const closeEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setDescription('🔒 Bu destek talebi **5 saniye içinde kapatılacak ve silinecektir**...');

        await interaction.reply({ embeds: [closeEmbed] });

        setTimeout(async () => {
          try {
            await interaction.channel.delete();
          } catch (err) {
            console.error('Ticket kanalı silinirken hata:', err);
          }
        }, 5000);
        return;
      }

      // 3. DOĞRULAMA
      if (customId.startsWith('verify_role_')) {
        const roleId = customId.replace('verify_role_', '');
        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) {
          return interaction.reply({
            content: '❌ Doğrulama rolü sunucuda bulunamadı. Lütfen yöneticilere bildiriniz.',
            ephemeral: true
          });
        }

        const member = interaction.member;

        if (member.roles.cache.has(role.id)) {
          return interaction.reply({
            content: 'ℹ️ Zaten daha önce doğrulanmışsınız ve role sahipsiniz!',
            ephemeral: true
          });
        }

        try {
          await member.roles.add(role);
          return interaction.reply({
            content: `✅ Başarıyla doğrulandınız! **${role.name}** rolü hesabınıza tanımlandı. Vyron sunucusuna hoş geldiniz! ⚔️`,
            ephemeral: true
          });
        } catch (err) {
          console.error('Rol verme hatası:', err);
          return interaction.reply({
            content: '❌ Rol verilirken yetki hatası oluştu! Botun rolü, verilecek rolden listede daha yukarıda olmalıdır.',
            ephemeral: true
          });
        }
      }

      // 4. ÇEKİLİŞ KATILMA
      if (customId.startsWith('gw_join_')) {
        const giveawayId = customId.replace('gw_join_', '');
        const gw = activeGiveaways.get(giveawayId);

        if (!gw) {
          return interaction.reply({
            content: '❌ Bu çekiliş sona ermiş veya geçerliliğini yitirmiş.',
            ephemeral: true
          });
        }

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

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFooter({ text: `${updatedCount} Katılımcı • ID: ${giveawayId}` });

        await interaction.message.edit({ embeds: [updatedEmbed], components: [updatedRow] });

        if (joined) {
          return interaction.reply({
            content: `🎉 **${gw.prize}** çekilişine başarıyla katıldınız! Bol şanslar!`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: `⚠️ **${gw.prize}** çekilişinden ayrıldınız.`,
            ephemeral: true
          });
        }
      }
    }
  } catch (error) {
    console.error('Etkileşim hatası:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Bir hata meydana geldi!', ephemeral: true }).catch(() => {});
    }
  }
});

// ==========================================
// 6. GİRİŞ YAPMA (LOGIN)
// ==========================================
if (!process.env.TOKEN) {
  console.warn('⚠️ DİKKAT: TOKEN bulunamadı!');
} else {
  client.login(process.env.TOKEN).catch(err => {
    console.error('❌ Bot Discord\'a bağlanamadı:', err.message);
  });
}
