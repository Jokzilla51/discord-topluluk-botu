'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isLikelyStaffRoleName,
  isTagScanTarget,
  memberHasConfiguredTag,
  normalizeTagValue
} = require('../index');

function createMember(options = {}) {
  return {
    guild: { id: options.guildId || 'guild-vyron' },
    user: {
      username: options.username || null,
      globalName: options.globalName || null,
      primaryGuild: options.primaryGuild || null
    },
    nickname: options.nickname || null,
    displayName: options.displayName || null
  };
}

test('Discord Sunucu Tagı doğru sunucu ve etkin kimlikle eşleşir', () => {
  const member = createMember({
    primaryGuild: {
      identityGuildId: 'guild-vyron',
      identityEnabled: true,
      tag: 'VYRN'
    }
  });

  assert.equal(memberHasConfiguredTag(member, 'VYRN'), true);
  assert.equal(memberHasConfiguredTag(member, 'vyrn'), true);
  assert.equal(memberHasConfiguredTag(member, 'ϟVYRN'), true);
});

test('isimde VYRN yazması Discord Sunucu Tagı yerine geçmez', () => {
  assert.equal(memberHasConfiguredTag(createMember({ username: 'VYRN_Player', nickname: 'ϟVYRN Kaan' }), 'VYRN'), false);
});

test('kapalı, eksik veya başka sunucuya ait Guild Tag kabul edilmez', () => {
  assert.equal(memberHasConfiguredTag(createMember({
    primaryGuild: { identityGuildId: 'guild-vyron', identityEnabled: false, tag: 'VYRN' }
  }), 'VYRN'), false);
  assert.equal(memberHasConfiguredTag(createMember({
    primaryGuild: { identityGuildId: 'guild-vyron', identityEnabled: null, tag: 'VYRN' }
  }), 'VYRN'), false);
  assert.equal(memberHasConfiguredTag(createMember({
    primaryGuild: { identityGuildId: 'other-guild', identityEnabled: true, tag: 'VYRN' }
  }), 'VYRN'), false);
  assert.equal(memberHasConfiguredTag(createMember(), 'VYRN'), false);
  assert.equal(normalizeTagValue('  İST  '), 'ist');
});

test('tag tarama kapsamı normal üyeyi dışarıda bırakıp klan kadrosunu alır', () => {
  const createRoleCache = roles => {
    const cache = new Map(roles.map(role => [role.id, role]));
    cache.some = callback => [...cache.values()].some(callback);
    return cache;
  };
  const guildRoleCache = createRoleCache([
    { id: 'everyone', name: '@everyone' },
    { id: 'member', name: 'Üye' },
    { id: 'clan', name: 'Vyron • Klan Üyesi' }
  ]);
  const guild = { roles: { cache: guildRoleCache } };
  const createScopedMember = roleId => ({
    user: { bot: false },
    guild,
    roles: { cache: createRoleCache([guildRoleCache.get('everyone'), guildRoleCache.get(roleId)]) }
  });

  assert.equal(isTagScanTarget(createScopedMember('member'), { clanRoleId: 'clan' }), false);
  assert.equal(isTagScanTarget(createScopedMember('clan'), { clanRoleId: 'clan' }), true);
});

test('yetkili rol tanıma mod kelimesini model gibi alakasız adlarda eşleştirmez', () => {
  assert.equal(isLikelyStaffRoleName('Deneme Moderatör'), true);
  assert.equal(isLikelyStaffRoleName('D.Mod'), true);
  assert.equal(isLikelyStaffRoleName('Yönetici'), true);
  assert.equal(isLikelyStaffRoleName('3D Model Ekibi'), false);
  assert.equal(isLikelyStaffRoleName('Modern Tasarımcı'), false);
  assert.equal(isLikelyStaffRoleName('Destek Bildirimleri'), false);
});
