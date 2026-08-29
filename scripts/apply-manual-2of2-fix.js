'use strict';

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');
let source = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

if (source.includes('// VYRON_MANUAL_2OF2')) process.exit(0);

function replaceRequired(regex, replacement, label) {
  if (!regex.test(source)) throw new Error(`Manual 2/2 patch hedefi bulunamadı: ${label}`);
  source = source.replace(regex, replacement);
}

replaceRequired(
  /const row = new ActionRowBuilder\(\)\.addComponents\(\n\s*new ButtonBuilder\(\)\.setCustomId\(`btn_abone_staff_grant_\$\{interaction\.user\.id\}`\)[\s\S]*?new ButtonBuilder\(\)\.setCustomId\(`btn_abone_staff_reject_\$\{interaction\.user\.id\}`\)\.setLabel\('❌ Reddet'\)\.setStyle\(ButtonStyle\.Danger\)\n\s*\);/,
  `const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(\`btn_abone_staff_mark_birim_\${interaction.user.id}\`).setLabel('✅ 1. Kanalı Onayla').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(\`btn_abone_staff_mark_froz_\${interaction.user.id}\`).setLabel('✅ 2. Kanalı Onayla').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(\`btn_abone_staff_reject_\${interaction.user.id}\`).setLabel('❌ Reddet').setStyle(ButtonStyle.Danger)
        );`,
  'manual request buttons'
);

replaceRequired(
  /\s*\/\/ 8\. YETKİLİ MANUEL ABONE ROLÜ VERME[\s\S]*?\n\s*\/\/ 9\. YETKİLİ MANUEL ABONE REDDETME/,
  `
      // 8. YETKİLİ MANUEL ABONE KANAL ONAYI (2/2 ZORUNLU)
      if (customId.startsWith('btn_abone_staff_mark_birim_') || customId.startsWith('btn_abone_staff_mark_froz_')) {
        if (!isStaffMember(member, data)) {
          return interaction.reply({ content: '🚫 Bu işlemi yalnızca yetkililer yapabilir!', ephemeral: true });
        }

        const isBirim = customId.startsWith('btn_abone_staff_mark_birim_');
        const applicantId = customId.replace(isBirim ? 'btn_abone_staff_mark_birim_' : 'btn_abone_staff_mark_froz_', '');
        if (!data.userSubscribedChannels) data.userSubscribedChannels = {};
        if (!data.userSubscribedChannels[applicantId]) data.userSubscribedChannels[applicantId] = { birim: false, froz: false };

        const userSubs = data.userSubscribedChannels[applicantId];
        if (isBirim) userSubs.birim = true;
        else userSubs.froz = true;
        saveData(data);

        const bothDone = userSubs.birim && userSubs.froz;
        let roleGiven = false;
        let roleToAssign = data.aboneRoleId ? interaction.guild.roles.cache.get(data.aboneRoleId) : null;
        if (!roleToAssign) {
          roleToAssign = interaction.guild.roles.cache.find(r => r.name.toLowerCase().trim() === 'vyron abone' || (r.name.toLowerCase().includes('vyron') && r.name.toLowerCase().includes('abone')));
        }

        const applicantMember = await interaction.guild.members.fetch(applicantId).catch(() => null);
        if (bothDone && applicantMember && roleToAssign) {
          try {
            await applicantMember.roles.add(roleToAssign);
            roleGiven = true;
            await applicantMember.send({ content: \`🎉 **\${interaction.guild.name}** için iki YouTube kanalının abonelik kanıtı da onaylandı ve **\${roleToAssign.name}** rolün verildi.\` }).catch(() => {});
          } catch (e) {
            console.error('Manuel abone rol verme hatası:', e);
          }
        }

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(bothDone ? '#10B981' : '#F59E0B')
          .setTitle(bothDone ? '✅ 2/2 KANAL MANUEL ONAYLANDI' : '🟡 1/2 KANAL MANUEL ONAYLANDI')
          .setDescription(
            \`👤 **Üye:** <@\${applicantId}>\\n\` +
            \`✅ **@birimfonksiyons:** \${userSubs.birim ? 'Onaylı' : 'Eksik'}\\n\` +
            \`✅ **@xFrozzeq:** \${userSubs.froz ? 'Onaylı' : 'Eksik'}\\n\` +
            \`🛡️ **İnceleyen:** \${member}\\n\` +
            (bothDone ? (roleGiven ? `💎 Rol verildi.` : `⚠️ 2/2 tamam ama rol verilemedi; bot rol sırasını/yetkisini kontrol et.`) : `❗ İkinci kanal da onaylanmadan rol verilmez.`)
          );

        await interaction.update({ embeds: [updatedEmbed], components: [] });
        return;
      }

      // 9. YETKİLİ MANUEL ABONE REDDETME`,
  'manual grant handler'
);

source = source.replace('// VYRON_PATCH_V3', '// VYRON_PATCH_V3\n// VYRON_MANUAL_2OF2');
fs.writeFileSync(indexPath, source, 'utf8');
console.log('Manuel abone onayı 2/2 zorunlu hale getirildi.');
