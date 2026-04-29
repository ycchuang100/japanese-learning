// fetch-poem.js — 每天下午4點生成日文美句
const https = require('https');
const fs = require('fs');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-lite'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const THEMES = [
  '孤獨與等待','時間的流逝','離別與思念','人生的轉折',
  '夜晚與星空','雨與淚水','旅途與歸處','愛與失去',
  '春天與櫻花','記憶與遺忘','勇氣與脆弱','相遇與緣分',
  '秋天與落葉','冬天與寂靜','希望與光明','成長與蛻變',
  '故鄉與思念','海與遠方','夢想與現實','自由與羈絆'
];

function callGemini(theme, model) {
  return new Promise((resolve, reject) => {
    const prompt = `以「${theme}」為主題，用中島みゆき的詩意風格，創作一句原創日文美句（10~18字）。
請嚴格按照以下格式回答，每行一個，不加其他說明：
JP: 日文句子
YOMI: 平假名讀音
ZH: 中文翻譯
THEME: ${theme}
W1: 單字1
R1: 讀音1
M1: 意思1
W2: 單字2
R2: 讀音2
M2: 意思2
W3: 單字3
R3: 讀音3
M3: 意思3
NOTE: 文法或語感說明（15字內）`;

    const body = JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{temperature:0.85, maxOutputTokens:400}
    });

    const options = {
      hostname:'generativelanguage.googleapis.com',
      path:`/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (r.error) throw new Error(`${r.error.code}: ${r.error.message}`);
          const text = r.candidates[0].content.parts[0].text;
          console.log('Raw response:\n' + text);

          function get(key) {
            const m = text.match(new RegExp(`^${key}:\\s*(.+)$`,'m'));
            return m ? m[1].trim() : '';
          }

          const jp = get('JP');
          if (!jp) throw new Error('JP field not found');

          resolve({
            jp, yomi: get('YOMI'), zh: get('ZH'), theme: get('THEME')||theme,
            note: get('NOTE'),
            vocab:[
              {word:get('W1'), kana:get('R1'), meaning:get('M1')},
              {word:get('W2'), kana:get('R2'), meaning:get('M2')},
              {word:get('W3'), kana:get('R3'), meaning:get('M3')}
            ]
          });
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('🌸 fetch-poem.js starting...');
  console.log('📅', new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}));

  if (!GEMINI_API_KEY) { console.error('❌ No GEMINI_API_KEY'); process.exit(1); }

  const theme = THEMES[new Date().getDate() % THEMES.length];
  console.log('🎭 Theme:', theme);

  let poem = null;
  for (const model of MODELS) {
    try {
      console.log(`🤖 Trying ${model}...`);
      poem = await callGemini(theme, model);
      console.log(`✅ ${model} succeeded`);
      break;
    } catch(e) {
      console.log(`⚠️  ${model} failed: ${e.message}`);
      await sleep(10000);
    }
  }

  if (!poem) { console.error('❌ All models failed'); process.exit(1); }

  const output = {
    date: new Date().toISOString().slice(0,10),
    generatedAt: new Date().toISOString(),
    ...poem
  };

  fs.writeFileSync('today-poem.json', JSON.stringify(output, null, 2));
  console.log('✅ Saved today-poem.json');
  console.log('🌸', poem.jp);
  console.log('🇹🇼', poem.zh);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
