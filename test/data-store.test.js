'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDataStore, normalizeData } = require('../src/data-store');

test('normalizeData XP, güvenlik ve bilinmeyen alanları korur', () => {
  const data = normalizeData({
    userLevels: { '123': 450 },
    securityMode: false,
    futureFeature: { enabled: true }
  });

  assert.equal(data.userLevels['123'], 450);
  assert.equal(data.securityMode, false);
  assert.deepEqual(data.futureFeature, { enabled: true });
});

test('veri deposu kaydet/yükle turunda kalıcı alanları düşürmez', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vyron-store-'));
  const file = path.join(directory, 'bot_data.json');
  const store = createDataStore(file);

  const saved = store.loadData();
  saved.userLevels.user1 = 1250;
  saved.securityMode = false;
  saved.polls.poll1 = { question: 'Test' };
  store.saveData(saved);

  const loaded = store.loadData();
  assert.equal(loaded.userLevels.user1, 1250);
  assert.equal(loaded.securityMode, false);
  assert.equal(loaded.polls.poll1.question, 'Test');
});
