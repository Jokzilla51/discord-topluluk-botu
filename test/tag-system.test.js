'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isLikelyStaffRoleName,
  isTagScanTarget,
  memberHasConfiguredTag,
  normalizeTagValue
} = require('../index');

function createMember(names = {}) {
  return {
    user: {
      username: names.username || null,
      globalName: names.globalName || null
    },
    nickname: names.nickname || null,
    displayName: names.displayName || null
  };
}

test('tag eşleşmesi kullanıcı adı, global ad ve sunucu takma adında çalışır', () => {
  assert.equal(memberHasConfiguredTag(createMember({ username: 'VYRN_Player' }), 'vyrn'), true);
  assert.equal(memberHasConfiguredTag(createMember({ globalName: '✦ Ahmet' }), '✦'), true);
  assert.equal(memberHasConfiguredTag(createMember({ nickname: 'Kaan | VYRN' }), 'VYRN'), true);
  assert.equal(memberHasConfiguredTag(createMember({ displayName: 'NormalOyuncu' }), 'VYRN'), false);
});

test('tag karşılaştırması Unicode ve Türkçe büyük/küçük harfe dayanıklıdır', () => {
  assert.equal(normalizeTagValue('  İST  '), 'ist');
  assert.equal(memberHasConfiguredTag(createMember({ nickname: 'İST • Oyuncu' }), 'ist'), true);
  assert.equal(memberHasConfiguredTag(createMember({ nickname: 'ϟ VYRN Oyuncu' }), 'ϟVYRN'), true);
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
