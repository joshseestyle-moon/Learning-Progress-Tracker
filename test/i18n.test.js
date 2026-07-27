const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert');

// i18n.js 是給瀏覽器用的 ES module（用到 localStorage、export），不能直接 require。
// 這裡只把 TRANSLATIONS 與 VALID_LANGS 兩段宣告切出來，在乾淨的 vm context 求值。
const I18N_PATH = path.join(__dirname, '..', 'public', 'js', 'i18n.js');
const SRC = fs.readFileSync(I18N_PATH, 'utf8');

function loadDictionaries() {
  const start = SRC.indexOf('const TRANSLATIONS');
  const end = SRC.indexOf('const VALID_LANGS');
  assert.ok(start !== -1, 'i18n.js 找不到 TRANSLATIONS 宣告（檔案結構改了？）');
  assert.ok(end > start, 'i18n.js 找不到 VALID_LANGS 宣告，或它跑到 TRANSLATIONS 前面了');

  const langsMatch = /const VALID_LANGS\s*=\s*(\[[^\]]*\])/.exec(SRC);
  assert.ok(langsMatch, 'i18n.js 的 VALID_LANGS 不是預期的陣列字面量');

  return {
    TRANSLATIONS: vm.runInNewContext(SRC.slice(start, end) + '\nTRANSLATIONS;'),
    VALID_LANGS: vm.runInNewContext(langsMatch[1]),
  };
}

const { TRANSLATIONS, VALID_LANGS } = loadDictionaries();

// 缺漏時把 key 列出來（上限 15 個，避免大量缺漏時洗版）
const preview = (keys) => {
  const list = [...keys].sort();
  return list.length <= 15
    ? list.join(', ')
    : list.slice(0, 15).join(', ') + ` …（另有 ${list.length - 15} 個）`;
};

test('i18n: VALID_LANGS 與 TRANSLATIONS 的語言一致', () => {
  const dictLangs = Object.keys(TRANSLATIONS).sort();
  assert.deepEqual(
    dictLangs,
    [...VALID_LANGS].sort(),
    `VALID_LANGS=${JSON.stringify(VALID_LANGS)} 但 TRANSLATIONS 有 ${JSON.stringify(dictLangs)}` +
    '——新增語言時兩處都要改'
  );
});

test('i18n: 三個字典的 key 完全相同（漏翻譯會靜默 fallback 成中文，只能靠這裡擋）', () => {
  const [reference, ...others] = VALID_LANGS;
  const refKeys = new Set(Object.keys(TRANSLATIONS[reference]));
  const problems = [];

  for (const lang of others) {
    const langKeys = new Set(Object.keys(TRANSLATIONS[lang]));
    const missing = [...refKeys].filter((k) => !langKeys.has(k));
    const extra = [...langKeys].filter((k) => !refKeys.has(k));
    if (missing.length) problems.push(`${lang} 少了 ${missing.length} 個 key：${preview(missing)}`);
    if (extra.length) problems.push(`${lang} 多了 ${extra.length} 個 ${reference} 沒有的 key：${preview(extra)}`);
  }

  assert.equal(problems.length, 0, '\n' + problems.join('\n'));
});

test('i18n: 沒有空字串或純空白的翻譯', () => {
  const blanks = [];
  for (const lang of VALID_LANGS) {
    for (const [key, value] of Object.entries(TRANSLATIONS[lang])) {
      if (typeof value !== 'string' || value.trim() === '') blanks.push(`${lang}/${key}`);
    }
  }
  assert.equal(blanks.length, 0, `以下翻譯是空的：${preview(blanks)}`);
});
