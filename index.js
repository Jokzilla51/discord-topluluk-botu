const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
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
      <head><title>Discord Bot Durumu</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #0f172a; color: #fff;">
        <h1 style="color: #38bdf8;">🤖 Discord Hepsi-Bir-Arada Botu</h1>
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
// 2. DISCORD CLIENT BAŞLATMA
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

// Çekiliş verilerini geçici hafızada tutma
const activeGiveaways = new Map();

// ==========================================
// 3. SLASH KOMUTLARININ TANIMLANMASI
// ==========================================
const commands = [
  // 1. Yardım Komutu
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('Botun tüm komutlarını ve kullanım kılavuzunu gösterir.'),

  // 2. Ticket / Destek Paneli Kurma
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
    )
    .addStringOption(option =>
      option.setName('aciklama')
        .setDescription('Panelde yazacak özel açıklama')
        .setRequired(false)
    ),

  // 3. Çekiliş Başlatma
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
        .setDescription('Çekiliş ödülü (Örn: Discord Nitro, 1000 Robux)')
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

  // 4. Doğrulama Paneli Kurma
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
        .setDescription('Doğrulama butonuna basana verilecek rol (Örn: @Üye)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('baslik')
        .setDescription('Panel başlığı (Varsayılan: Sunucu Doğrulama)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('aciklama')
        .setDescription('Panel açıklaması')
        .setRequired(false)
    )
];

// ==========================================
// 4. BOT HAZIR OLDUĞUNDA (READY)
// ==========================================
client.once('ready', async () => {
  console.log(`🤖 Bot giriş yaptı: ${client.user.tag}`);
  client.user.setActivity('🎫 Ticket | 🎉 Çekiliş | 🛡️ Doğrulama', { type: 3 }); // Watching

  // Slash komutlarını Discord API'ye yükle
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('⚡ Slash (/) komutları Discord API\'ye kaydediliyor...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log('✅ Slash komutları başarıyla kaydedildi!');
  } catch (error) {
    console.error('❌ Slash komutları kaydedilirken hata oluştu:', error);
  }
});

// ==========================================
// 5. ETKİLEŞİMLER (COMMAND & BUTTON HANDLER)
// ==========================================
client.on('interactionCreate', async (interaction) => {
  try {
    // --- A. SLASH KOMUTLARI ---
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // 1. /yardim
      if (commandName === 'yardim') {
        const helpEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('📚 Bot Komut ve Yönetim Kılavuzu')
          .setDescription('Botumuz 3 ana sistem üzerine kurulmuştur: **Ticket, Çekiliş ve Doğrulama**.')
          .addFields(
            {
              name: '🎫 Destek (Ticket) Sistemi',
              value: '`/ticket-kur [kanal] [yetkili_rol] [kategori] [aciklama]`\nBelirttiğiniz kanala şık bir destek paneli gönderir. Kullanıcılar tek tıkla özel oda açar.'
            },
            {
              name: '🎉 Çekiliş (Giveaway) Sistemi',
              value: '`/cekilis [sure] [odul] [kazanan_sayisi] [kanal]`\nOtomatik butonlu, süresi bitince rastgele kazananı seçip etiketleyen çekiliş başlatır.'
            },
            {
              name: '🛡️ Doğrulama (Verification) Sistemi',
              value: '`/dogrulama-kur [kanal] [verilecek_rol] [baslik] [aciklama]`\nSunucuya yeni katılanların butona basarak rol alıp içeri girmesini sağlar.'
            }
          )
          .setFooter({ text: `${interaction.guild.name} • 7/24 Aktif`, iconURL: interaction.guild.iconURL() })
          .setTimestamp();

        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
      }

      // 2. /ticket-kur
      if (commandName === 'ticket-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const supportRole = interaction.options.getRole('yetkili_rol');
        const category = interaction.options.getChannel('kategori');
        const customDesc = interaction.options.getString('aciklama') || 
          'Yetkili ekibimizle iletişime geçmek, şikayet veya öneride bulunmak için aşağıdaki **"Destek Talebi Aç"** butonuna tıklayınız.';

        const ticketEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setTitle(`📩 ${interaction.guild.name} - Destek Talebi Paneli`)
          .setDescription(customDesc)
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

      // 3. /cekilis
      if (commandName === 'cekilis') {
        const durationStr = interaction.options.getString('sure');
        const prize = interaction.options.getString('odul');
        const winnerCount = interaction.options.getInteger('kazanan_sayisi') || 1;
        const targetChannel = interaction.options.getChannel('kanal') || interaction.channel;

        const durationMs = ms(durationStr);
        if (!durationMs || durationMs < 5000 || durationMs > 30 * 24 * 60 * 60 * 1000) {
          return interaction.reply({
            content: '❌ Geçersiz süre! Lütfen geçerli bir süre girin (Örn: `30s`, `10m`, `2h`, `1d`). Minimum 5 saniye olmalıdır.',
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

        // Çekiliş verisini kaydet
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

        // Süre bittiğinde kazananı belirle
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
              // Rastgele kazananları seç
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

      // 4. /dogrulama-kur
      if (commandName === 'dogrulama-kur') {
        const targetChannel = interaction.options.getChannel('kanal');
        const role = interaction.options.getRole('verilecek_rol');
        const title = interaction.options.getString('baslik') || `🛡️ ${interaction.guild.name} Doğrulama`;
        const desc = interaction.options.getString('aciklama') || 
          'Sunucumuza hoş geldiniz! Kanallara erişim sağlamak ve bot hesapları engellemek için aşağıdaki **"Doğrula"** butonuna basınız.';

        const verifyEmbed = new EmbedBuilder()
          .setColor('#10B981')
          .setTitle(title)
          .setDescription(desc)
          .addFields(
            { name: '🔑 Verilecek Rol', value: `${role}`, inline: true },
            { name: '✨ Kolay Doğrulama', value: 'Tek tıkla anında erişim.', inline: true }
          )
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
          content: `✅ Doğrulama paneli ${targetChannel} kanalına başarıyla kuruldu! (Rol: ${role})`,
          ephemeral: true
        });
      }
    }

    // --- B. BUTON ETKİLEŞİMLERİ ---
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // 1. TICKET OLUŞTURMA BUTONU
      if (customId.startsWith('ticket_create_')) {
        const parts = customId.split('_');
        const roleId = parts[2];
        const categoryId = parts[3];

        // Kullanıcının daha önce açılmış kanalı var mı kontrol
        const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName);

        if (existingChannel) {
          return interaction.reply({
            content: `⚠️ Zaten açık bir destek talebiniz bulunuyor: ${existingChannel}`,
            ephemeral: true
          });
        }

        await interaction.deferReply({ ephemeral: true });

        // İzinler
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

        // Yetkili rol izni
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

        // Kanal oluştur
        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: (categoryId && categoryId !== 'none') ? categoryId : null,
          permissionOverwrites
        });

        // Ticket içi bilgilendirme mesajı
        const insideEmbed = new EmbedBuilder()
          .setColor('#3B82F6')
          .setTitle(`📩 Destek Talebi: #${ticketChannel.name}`)
          .setDescription(
            `Merhaba ${interaction.user}! Destek talebiniz oluşturuldu.\n\n` +
            `Lütfen sorununuzu veya talebinizi detaylı bir şekilde buraya yazın. Yetkili ekibimiz en kısa sürede ilgilenecektir.`
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

      // 2. TICKET KAPATMA BUTONU
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

      // 3. DOĞRULAMA BUTONU
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
            content: `✅ Başarıyla doğrulandınız! **${role.name}** rolü hesabınıza tanımlandı. Sunucumuza hoş geldiniz! 🎉`,
            ephemeral: true
          });
        } catch (err) {
          console.error('Rol verme hatası:', err);
          return interaction.reply({
            content: '❌ Rol verilirken bir yetki hatası oluştu! Botun rolü, verilecek rolden yukarıda olmalıdır.',
            ephemeral: true
          });
        }
      }

      // 4. ÇEKİLİŞE KATILMA BUTONU
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

        // Buton ve Embed güncelle
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
  console.warn('⚠️ DİKKAT: .env dosyasında TOKEN bulunamadı! Botu başlatmadan önce TOKEN tanımlamalısınız.');
} else {
  client.login(process.env.TOKEN).catch(err => {
    console.error('❌ Bot Discord\'a bağlanamadı. Token hatalı veya Intent\'ler kapalı olabilir:', err.message);
  });
}
