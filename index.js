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

const activeGiveaways = new Map();

// ==========================================
// 3. SLASH KOMUTLARI
// ==========================================
const commands = [
  // 1. Yardım
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Botun tüm komutlarını ve sistem kılavuzunu gösterir.'),

  // 2. Sunucu Baştan Aşağı Kurma (Vyron Özel Şablonu)
  new SlashCommandBuilder()
    .setName('sunucu-kur')
    .setDescription('Vyron klanı için tüm kategori, sohbet, klan, yetkili ve ses kanallarını otomatik kurar.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(option =>
      option.setName('otomatik_paneller')
        .setDescription('Doğrulama, Başvuru, Ticket ve Kurallar panellerini otomatik kursun mu? (Varsayılan: Evet)')
        .setRequired(false)
    ),

  // 3. Klan Başvuru Paneli Kurma (Anydesk & Kontrol Odası Destekli)
  new SlashCommandBuilder()
    .setName('basvuru-kur')
    .setDescription('Anydesk ve özel kontrol odası destekli klan başvuru paneli kurar.')
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
        .setDescription('Başvuruyu inceleyecek yetkili rolü')
        .setRequired(false)
    ),

  // 4. Genel Destek (Ticket) Paneli Kurma
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

  // 5. Çekiliş Başlatma
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

  // 6. Doğrulama Paneli Kurma
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

  // 7. Mesaj Temizleme (Moderasyon)
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
  client.user.setActivity('⚔️ Vyron Klanı & Destek Merkezi', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('⚡ Komutlar sunucunuza anında yükleniyor...');
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
          .setTitle('⚔️ Vyron Klan Botu Komut Merkezi')
          .setDescription('Vyron klanı ve topluluğu için sistem ayrımı:')
          .addFields(
            { name: '⚔️ `/basvuru-kur`', value: 'Klan alımları için formlu ve Anydesk kontrol odalı klan başvuru sistemi.' },
            { name: '🎫 `/ticket-kur`', value: 'Genel sunucu soruları, şikayet ve destek için butonlu ticket sistemi.' },
            { name: '🏛️ `/sunucu-kur`', value: 'Tüm klan kategorilerini, sohbetlerini, klan ses odalarını ve panelleri sıfırdan kurar.' },
            { name: '🎉 `/cekilis`', value: 'Süreli, butonlu ve otomatik kazanan seçen çekiliş başlatır.' },
            { name: '🛡️ `/dogrulama-kur`', value: 'Gelen üyeler için tek tıkla `@Vyron • Üye` rolü veren doğrulama paneli.' },
            { name: '🧹 `/sil`', value: 'Kanaldaki istenmeyen mesajları topluca siler (1-100 adet).' }
          )
          .setFooter({ text: 'Vyron Clan Management System' })
          .setTimestamp();

        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
      }

      // 2. /basvuru-kur (YALNIZCA KLAN ALIMLARI İÇİN)
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
            `📌 **Klan Alım Süreci:**\n` +
            `1️⃣ Aşağıdaki **"⚔️ Klan Başvurusu Yap"** butonuna basarak formu doldurun.\n` +
            `2️⃣ Yetkililerimiz başvurunuzu inceler ve adınıza özel **Anydesk Kontrol Odası** açar.\n` +
            `3️⃣ Kontrolden başarıyla geçen oyunculara **${clanRole}** rolü tanımlanır!\n\n` +
            `👇 Başvurmak için butona basınız.`
          )
          .setFooter({ text: 'Vyron Clan Recruitment System' })
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

      // 3. /ticket-kur (YALNIZCA GENEL DESTEK VE ŞİKAYETLER İÇİN)
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
        return interaction.reply({ content: `✅ Genel Destek paneli kuruldu!`, ephemeral: true });
      }

      // 4. /sunucu-kur (TÜM SUNUCUYU OTOMATİK KURMA)
      if (commandName === 'sunucu-kur') {
        await interaction.deferReply({ ephemeral: true });

        const autoPanels = interaction.options.getBoolean('otomatik_paneller') ?? true;
        const guild = interaction.guild;

        const memberRole = guild.roles.cache.find(r => r.name.includes('Üye') || r.name.includes('Vyron • Üye')) || guild.roles.everyone;
        const clanMemberRole = guild.roles.cache.find(r => r.name.includes('Klan Üye') || r.name.includes('Has Klan'));
        const staffRole = guild.roles.cache.find(r => r.name.includes('Yönetici') || r.name.includes('Yetkili') || r.name.includes('Admin') || r.name.includes('Mod'));
        const ticketStaffRole = guild.roles.cache.find(r => r.name.includes('Ticket') || r.name.includes('Destek')) || staffRole || guild.roles.everyone;

        await interaction.editReply({ content: '⚙️ **Vyron Sunucu Kurulumu Başlatıldı!** Kategoriler ve kanallar inşa ediliyor...' });

        // 1. Bilgilendirme
        const catInfo = await guild.channels.create({ name: '📢・VYRON BİLGİLENDİRME', type: ChannelType.GuildCategory });
        const chRules = await guild.channels.create({ name: '📜・kurallar', type: ChannelType.GuildText, parent: catInfo.id, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }] });
        await guild.channels.create({ name: '📢・duyurular', type: ChannelType.GuildText, parent: catInfo.id, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }] });
        const chVerify = await guild.channels.create({ name: '🛡️・doğrulama', type: ChannelType.GuildText, parent: catInfo.id, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }] });
        const chApply = await guild.channels.create({ name: '📝・klan-başvuru', type: ChannelType.GuildText, parent: catInfo.id, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }] });
        await guild.channels.create({ name: '🎉・çekilişler', type: ChannelType.GuildText, parent: catInfo.id, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }] });

        // 2. Genel Topluluk
        const catChat = await guild.channels.create({ name: '💬・VYRON GENEL TOPLULUK', type: ChannelType.GuildCategory });
        await guild.channels.create({ name: '💬・sohbet', type: ChannelType.GuildText, parent: catChat.id });
        await guild.channels.create({ name: '📸・foto-medya', type: ChannelType.GuildText, parent: catChat.id });
        await guild.channels.create({ name: '🤖・bot-komut', type: ChannelType.GuildText, parent: catChat.id });
        await guild.channels.create({ name: '💡・öneri-anket', type: ChannelType.GuildText, parent: catChat.id });

        // 3. Klan Merkezi (Gizli)
        const clanOverwrites = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
        if (clanMemberRole) clanOverwrites.push({ id: clanMemberRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] });
        if (staffRole) clanOverwrites.push({ id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] });

        const catClan = await guild.channels.create({ name: '⚔️・VYRON KLAN MERKEZİ', type: ChannelType.GuildCategory, permissionOverwrites: clanOverwrites });
        await guild.channels.create({ name: '📜・klan-duyuru', type: ChannelType.GuildText, parent: catClan.id });
        await guild.channels.create({ name: '⚔️・klan-sohbet', type: ChannelType.GuildText, parent: catClan.id });
        await guild.channels.create({ name: '🎯・klan-taktik-sandık', type: ChannelType.GuildText, parent: catClan.id });
        await guild.channels.create({ name: '🔊・Klan Ses 1', type: ChannelType.GuildVoice, parent: catClan.id, userLimit: 5 });
        await guild.channels.create({ name: '🔊・Klan Ses 2', type: ChannelType.GuildVoice, parent: catClan.id, userLimit: 10 });
        await guild.channels.create({ name: '🔊・Klan Toplantı', type: ChannelType.GuildVoice, parent: catClan.id });

        // 4. Genel Sesler
        const catVoice = await guild.channels.create({ name: '🔊・GENEL SES ODALARI', type: ChannelType.GuildCategory });
        await guild.channels.create({ name: '🔊・Sohbet Odası #1', type: ChannelType.GuildVoice, parent: catVoice.id });
        await guild.channels.create({ name: '🔊・Sohbet Odası #2', type: ChannelType.GuildVoice, parent: catVoice.id });
        await guild.channels.create({ name: '🎮・Oyun Odası (Duo)', type: ChannelType.GuildVoice, parent: catVoice.id, userLimit: 2 });
        await guild.channels.create({ name: '🎮・Oyun Odası (Trio)', type: ChannelType.GuildVoice, parent: catVoice.id, userLimit: 3 });
        await guild.channels.create({ name: '🎮・Oyun Odası (Squad)', type: ChannelType.GuildVoice, parent: catVoice.id, userLimit: 4 });
        await guild.channels.create({ name: '💤・AFK / Dinlenme', type: ChannelType.GuildVoice, parent: catVoice.id });

        // 5. Destek
        const catTicket = await guild.channels.create({ name: '🎫・VYRON DESTEK MERKEZİ', type: ChannelType.GuildCategory });
        const chTicketPanel = await guild.channels.create({ name: '📩・destek-talebi', type: ChannelType.GuildText, parent: catTicket.id, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }] });

        // 6. Yetkili Merkezi (Gizli)
        const staffOverwrites = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
        if (staffRole) staffOverwrites.push({ id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect] });

        const catStaff = await guild.channels.create({ name: '🛡️・YETKİLİ MERKEZİ', type: ChannelType.GuildCategory, permissionOverwrites: staffOverwrites });
        await guild.channels.create({ name: '🔒・yetkili-sohbet', type: ChannelType.GuildText, parent: catStaff.id });
        const chApplyLog = await guild.channels.create({ name: '📝・başvuru-log', type: ChannelType.GuildText, parent: catStaff.id });
        await guild.channels.create({ name: '📋・yetkili-duyuru', type: ChannelType.GuildText, parent: catStaff.id });
        await guild.channels.create({ name: '🔨・ceza-kayıt-log', type: ChannelType.GuildText, parent: catStaff.id });
        await guild.channels.create({ name: '🔊・Yetkili Ses Odası', type: ChannelType.GuildVoice, parent: catStaff.id });

        // Otomatik Paneller
        if (autoPanels) {
          // Kurallar
          const rulesEmbed = new EmbedBuilder()
            .setColor('#EF4444')
            .setTitle(`📜 ${guild.name} - Sunucu Kuralları`)
            .setDescription(
              '**1.** Saygı ve nezaket esastır. Küfür, hakaret ve argo yasaktır.\n' +
              '**2.** Reklam yapmak (DM dahil) kesinlikle yasaktır.\n' +
              '**3.** Dini, milli, ırkçı ve siyasi tartışmalar yapmak yasaktır.\n' +
              '**4.** Spam ve flood yasaktır.\n' +
              '**5.** Yetkililerin kararlarına uymak zorunludur.'
            )
            .setFooter({ text: 'Vyron Clan System' });
          await chRules.send({ embeds: [rulesEmbed] });

          // Doğrulama Paneli
          if (memberRole && memberRole.id !== guild.roles.everyone.id) {
            const verifyEmbed = new EmbedBuilder()
              .setColor('#10B981')
              .setTitle(`🛡️ ${guild.name} - Doğrulama`)
              .setDescription('Sunucuya tam erişim kazanmak için aşağıdaki butona basınız.')
              .setFooter({ text: 'Vyron Güvenlik' });

            const verifyRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`verify_role_${memberRole.id}`)
                .setLabel('✅ Doğrula ve Giriş Yap')
                .setStyle(ButtonStyle.Success)
            );
            await chVerify.send({ embeds: [verifyEmbed], components: [verifyRow] });
          }

          // Ticket Paneli (Yalnızca Genel Destek & Şikayet)
          const ticketEmbed = new EmbedBuilder()
            .setColor('#3B82F6')
            .setTitle(`📩 ${guild.name} - Genel Destek & Şikayet Paneli`)
            .setDescription('Sunucuyla ilgili sorularınız, önerileriniz veya şikayetleriniz için yetkililerle özel destek odası açabilirsiniz.\n\n*(Klan alımı için lütfen `#klan-başvuru` kanalını kullanın).*')
            .setFooter({ text: 'Vyron Destek' });

          const ticketRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_create_${ticketStaffRole.id}_${catTicket.id}`)
              .setLabel('📩 Destek Talebi Aç')
              .setStyle(ButtonStyle.Primary)
          );
          await chTicketPanel.send({ embeds: [ticketEmbed], components: [ticketRow] });

          // Başvuru Paneli (Yalnızca Klan Alımı)
          if (clanMemberRole) {
            const applyEmbed = new EmbedBuilder()
              .setColor('#8B5CF6')
              .setTitle(`⚔️ ${guild.name} - Klan Başvuru Paneli`)
              .setDescription('Vyron klanına katılmak için butona basarak formu doldurunuz. Yetkililerimiz inceleyip Anydesk Kontrol Odası açacaktır.')
              .setFooter({ text: 'Vyron Recruitment' });

            const applyRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_open_apply_${chApplyLog.id}_${clanMemberRole.id}_${staffRole ? staffRole.id : 'none'}`)
                .setLabel('⚔️ Klan Başvurusu Yap')
                .setStyle(ButtonStyle.Primary)
            );
            await chApply.send({ embeds: [applyEmbed], components: [applyRow] });
          }
        }

        const successEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle('🎉 Vyron Sunucu ve Başvuru Sistemi Kuruldu!')
          .setDescription('Tüm klan ve topluluk kanalları, Anydesk kontrol paneli ve destek sistemleri hazır.')
          .setTimestamp();

        return interaction.editReply({ content: '', embeds: [successEmbed] });
      }

      // 5. /cekilis
      if (commandName === 'cekilis') {
        const durationStr = interaction.options.getString('sure');
        const prize = interaction.options.getString('odul');
        const winnerCount = interaction.options.getInteger('kazanan_sayisi') || 1;
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;

        const durationMs = ms(durationStr);
        if (!durationMs || durationMs < 5000) {
          return interaction.reply({ content: '❌ Geçersiz süre (Örn: `10m`, `1h`, `1d`).', ephemeral: true });
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
            `⏳ **Bitiş:** <t:${endTime}:R>\n` +
            `📢 **Başlatan:** ${interaction.user}`
          )
          .setFooter({ text: `0 Katılımcı • ID: ${giveawayId}` });

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

        await interaction.reply({ content: `✅ Çekiliş başlatıldı!`, ephemeral: true });

        setTimeout(async () => {
          const gw = activeGiveaways.get(giveawayId);
          if (!gw) return;

          try {
            const fetchChannel = await client.channels.fetch(gw.channelId);
            const fetchMsg = await fetchChannel.messages.fetch(gw.messageId);
            const participantArray = Array.from(gw.participants);

            if (participantArray.length === 0) {
              await fetchMsg.edit({ content: '❌ Yeterli katılım olmadığı için çekiliş iptal edildi.', components: [] });
            } else {
              const shuffled = participantArray.sort(() => 0.5 - Math.random());
              const winners = shuffled.slice(0, Math.min(gw.winnerCount, participantArray.length));
              const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

              const endedEmbed = new EmbedBuilder()
                .setColor('#10B981')
                .setTitle(`🎉 ÇEKİLİŞ SONA ERDİ: ${gw.prize}`)
                .setDescription(`👑 **Kazanan(lar):** ${winnerMentions}\n🎁 **Ödül:** ${gw.prize}`)
                .setTimestamp();

              await fetchMsg.edit({ embeds: [endedEmbed], components: [] });
              await fetchChannel.send(`🎉 Tebrikler ${winnerMentions}! **${gw.prize}** kazandınız! 🥳`);
            }
          } catch (err) {
            console.error('Çekiliş hata:', err);
          } finally {
            activeGiveaways.delete(giveawayId);
          }
        }, durationMs);
        return;
      }

      // 6. /dogrulama-kur
      if (commandName === 'dogrulama-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const role = interaction.options.getRole('verilecek_rol');

        const verifyEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle(`🛡️ ${interaction.guild.name} Doğrulama`)
          .setDescription('Sunucumuza hoş geldiniz! Kanallara erişim sağlamak için aşağıdaki butona basınız.')
          .setFooter({ text: 'Güvenlik Sistemi' });

        const verifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`verify_role_${role.id}`)
            .setLabel('✅ Doğrula ve Giriş Yap')
            .setStyle(ButtonStyle.Success)
        );

        await targetChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });
        return interaction.reply({ content: `✅ Doğrulama paneli kuruldu!`, ephemeral: true });
      }

      // 7. /sil
      if (commandName === 'sil') {
        const amount = interaction.options.getInteger('miktar');
        await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({ content: `🧹 **${amount}** mesaj silindi!`, ephemeral: true });
      }
    }

    // ----------------------------------------------------
    // B. MODAL AÇMA & GÖNDERME (KLAN BAŞVURUSU)
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

      const inputExp = new TextInputBuilder()
        .setCustomId('experience')
        .setLabel('PvP / Elytra / Trap Tecrübeniz:')
        .setPlaceholder('Örn: 3 yıldır Elytra PvP ve Crystal/Netherite oynuyorum.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const inputAnydesk = new TextInputBuilder()
        .setCustomId('anydesk_ready')
        .setLabel('Anydesk / PC Kontrolüne Hazır mısınız?')
        .setPlaceholder('Evet hazırım / Kontrolü kabul ediyorum.')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(inputIgn),
        new ActionRowBuilder().addComponents(inputAgeActive),
        new ActionRowBuilder().addComponents(inputExp),
        new ActionRowBuilder().addComponents(inputAnydesk)
      );

      return interaction.showModal(modal);
    }

    // Form Doldurulup Gönderildiğinde
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_clan_apply_')) {
      const parts = interaction.customId.split('_');
      const logChannelId = parts[3];
      const clanRoleId = parts[4];
      const staffRoleId = parts[5];

      const ign = interaction.fields.getTextInputValue('ign');
      const ageActive = interaction.fields.getTextInputValue('age_active');
      const experience = interaction.fields.getTextInputValue('experience');
      const anydeskReady = interaction.fields.getTextInputValue('anydesk_ready');

      const logChannel = interaction.guild.channels.cache.get(logChannelId);
      if (!logChannel) {
        return interaction.reply({ content: '❌ Başvuru log kanalı bulunamadı!', ephemeral: true });
      }

      const applicant = interaction.user;

      const appLogEmbed = new EmbedBuilder()
        .setColor('#8B5CF6')
        .setTitle(`⚔️ Yeni Klan Başvurusu: ${ign}`)
        .setDescription(`Aşağıda başvuru yapan adayın bilgileri yer almaktadır:`)
        .addFields(
          { name: '👤 Discord Hesabı', value: `${applicant} (${applicant.tag} - \`${applicant.id}\`)`, inline: false },
          { name: '🎮 Oyun İçi Nick (IGN)', value: `\`${ign}\``, inline: true },
          { name: '⏰ Yaş & Aktiflik', value: `${ageActive}`, inline: true },
          { name: '🖥️ Anydesk / PC Kontrol', value: `\`${anydeskReady}\``, inline: true },
          { name: '⚔️ PvP / Elytra Tecrübesi', value: `>>> ${experience}`, inline: false }
        )
        .setFooter({ text: 'Anydesk Kontrol Odası açmak için aşağıdaki butonu kullanabilirsiniz.' })
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`app_kontrol_${applicant.id}_${clanRoleId}_${staffRoleId}`)
          .setLabel('🖥️ Anydesk Kontrol Odası Aç')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔍'),
        new ButtonBuilder()
          .setCustomId(`app_accept_${applicant.id}_${clanRoleId}`)
          .setLabel('✅ Doğrudan Kabul Et')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`app_reject_${applicant.id}`)
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

    // ----------------------------------------------------
    // C. BAŞVURU BUTON İŞLEMLERİ (ÖZEL KONTROL ODASI & ROL)
    // ----------------------------------------------------
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // 1. ANYDESK KONTROL ODASI AÇMA BUTONU
      if (customId.startsWith('app_kontrol_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const clanRoleId = parts[3];
        const staffRoleId = parts[4];

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
        if (!applicant) {
          return interaction.reply({ content: '❌ Aday sunucudan ayrılmış!', ephemeral: true });
        }

        const channelName = `kontrol-${applicant.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        // Zaten açık mı kontrol
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

        // Adaya DM bildirimi
        try {
          await applicant.send({
            content: `🔔 **Vyron Klan Başvurunuz İçin Anydesk Kontrol Odası Açıldı!**\nLütfen sunucumuzdaki ${kontrolChannel} kanalına geçip Anydesk kodunuzu iletiniz.`
          });
        } catch (e) {}

        const kontrolEmbed = new EmbedBuilder()
          .setColor('#F59E0B')
          .setTitle('🖥️ Vyron Klan - Anydesk & Test Kontrol Odası')
          .setDescription(
            `Merhaba ${applicant}! Klan başvurunuz değerlendirmeye alındı ve adınıza özel kontrol odası açıldı.\n\n` +
            `📌 **Yapmanız Gerekenler:**\n` +
            `1. [Anydesk](https://anydesk.com) uygulamasını açıp 9 haneli kodunuzu buraya yazın.\n` +
            `2. Kontrol Yetkiliniz: ${interaction.user}\n` +
            `3. Ses kanalına (` + '`🔊・Yetkili Ses Odası`' + `) katılın.\n\n` +
            `Yetkili kontrol durumuna göre aşağıdaki butonları kullanarak sonucu onaylayacaktır:`
          )
          .setFooter({ text: 'Vyron Clan Security & Control' })
          .setTimestamp();

        const kontrolRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`kontrol_pass_${applicant.id}_${clanRoleId}`)
            .setLabel('✅ Kontrolden Geçti (Klan Rolü Ver)')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🛡️'),
          new ButtonBuilder()
            .setCustomId(`kontrol_fail_${applicant.id}`)
            .setLabel('❌ Hile / Başarısız (Reddet)')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`kontrol_afk_${applicant.id}`)
            .setLabel('🔒 Odayı Kapat')
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

      // 2. KONTROLDEN GEÇTİ
      if (customId.startsWith('kontrol_pass_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const clanRoleId = parts[3];

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
        const clanRole = interaction.guild.roles.cache.get(clanRoleId);

        if (applicant && clanRole) {
          await applicant.roles.add(clanRole).catch(() => {});
          try {
            await applicant.send({
              content: `🎉 **Tebrikler ${applicant.user.username}!** Vyron klanımızın Anydesk kontrolünden başarıyla geçtiniz ve **${clanRole.name}** rolünüz verildi. Klana hoş geldiniz! ⚔️`
            });
          } catch (e) {}
        }

        const passEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle('🎉 Kontrol Başarılı - Klana Hoş Geldin!')
          .setDescription(`Tebrikler ${applicant}! Anydesk kontrolünden başarıyla geçtiniz ve **${clanRole ? clanRole.name : 'Klan Üyesi'}** rolü tanımlandı!\n\n🔒 Bu oda 5 saniye içinde kapatılacaktır.`);

        await interaction.reply({ embeds: [passEmbed] });

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 3. KONTROL BAŞARISIZ
      if (customId.startsWith('kontrol_fail_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);

        if (applicant) {
          try {
            await applicant.send({
              content: `❌ Merhaba, Vyron klan başvurunuz Anydesk kontrolü sonucunda yetkililer tarafından **reddedilmiştir**.`
            });
          } catch (e) {}
        }

        const failEmbed = new EmbedBuilder()
          .setColor('#EF4444')
          .setTitle('❌ Kontrol Başarısız')
          .setDescription(`${applicant ? applicant.user.tag : 'Aday'} klan kontrolünden geçemedi. Oda 5 saniye içinde kapatılacaktır.`);

        await interaction.reply({ embeds: [failEmbed] });

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 4. ODAYI KAPAT
      if (customId.startsWith('kontrol_afk_')) {
        const afkEmbed = new EmbedBuilder()
          .setColor('#6B7280')
          .setTitle('🔒 Oda Kapatılıyor')
          .setDescription(`Kontrol odası yetkili tarafından sonlandırıldı. 5 saniye içinde siliniyor...`);

        await interaction.reply({ embeds: [afkEmbed] });

        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 5. DOĞRUDAN KABUL ET
      if (customId.startsWith('app_accept_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
        const clanRoleId = parts[3];

        const applicant = await interaction.guild.members.fetch(applicantId).catch(() => null);
        const clanRole = interaction.guild.roles.cache.get(clanRoleId);

        if (!applicant) {
          return interaction.reply({ content: '❌ Aday sunucudan ayrılmış!', ephemeral: true });
        }

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

      // 6. REDDET
      if (customId.startsWith('app_reject_')) {
        const parts = customId.split('_');
        const applicantId = parts[2];
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

      // 7. GENEL DESTEK TICKET OLUŞTURMA
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
          .setTimestamp();

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_close_action').setLabel('🔒 Talebi Kapat').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );

        await ticketChannel.send({ content: `${interaction.user} ${roleId && roleId !== 'none' ? `<@&${roleId}>` : ''}`, embeds: [insideEmbed], components: [closeRow] });
        return interaction.editReply({ content: `✅ Destek talebiniz açıldı: ${ticketChannel}` });
      }

      // 8. TICKET KAPATMA
      if (customId === 'ticket_close_action') {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor('#EF4444').setDescription('🔒 Destek talebi 5 saniye içinde kapatılacak...')] });
        setTimeout(async () => {
          await interaction.channel.delete().catch(() => {});
        }, 5000);
        return;
      }

      // 9. DOĞRULAMA
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

      // 10. ÇEKİLİŞ KATILMA
      if (customId.startsWith('gw_join_')) {
        const giveawayId = customId.replace('gw_join_', '');
        const gw = activeGiveaways.get(giveawayId);

        if (!gw) return interaction.reply({ content: '❌ Çekiliş sona ermiş.', ephemeral: true });

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

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `${updatedCount} Katılımcı • ID: ${giveawayId}` });
        await interaction.message.edit({ embeds: [updatedEmbed], components: [updatedRow] });

        return interaction.reply({
          content: joined ? `🎉 **${gw.prize}** çekilişine katıldınız!` : `⚠️ Çekilişten ayrıldınız.`,
          ephemeral: true
        });
      }
    }
  } catch (error) {
    console.error('Etkileşim hatası:', error);
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
