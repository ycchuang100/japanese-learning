const https = require('https');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractFields(text) {
  // Extract fields directly with regex instead of JSON.parse
  function getVal(key) {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`) );
    return m ? m[1] : '';
  }
  const jp = getVal('jp');
  if (!jp) throw new Error('Cannot find jp field in: ' + text.substring(0, 300));
  return {
    jp, yomi: getVal('yomi'), zh: getVal('zh'),
    theme: getVal('theme'), note: getVal('note'),
    vocab: [
      { word: getVal('w1'), kana: getVal('r1'), meaning: getVal('m1') },
      { word: getVal('w2'), kana: getVal('r2'), meaning: getVal('m2') },
      { word: getVal('w3'), kana: getVal('r3'), meaning: getVal('m3') }
    ]
  };
}

function callGemini(theme) {
  return new Promise((resolve, reject) => {
    const prompt = `以「${theme}」為主題創作一句原創日文美句。只回傳以下JSON，不加任何說明或markdown，所有值不含換行符：{"jp":"日文句子10-15字","yomi":"平假名","zh":"中文譯","theme":"${theme}","w1":"單字1","r1":"讀音1","m1":"意思1","w2":"單字2","r2":"讀音2","m2":"意思2","w3":"單字3","r3":"讀音3","m3":"意思3","note":"文法說明15字內"}`;

    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const resp = JSON.parse(data);
          if (resp.error) {
            reject(new Error(`API error ${resp.error.code}: ${resp.error.message}`));
            return;
          }
          const text = resp.candidates[0].content.parts[0].text;
          // Use regex field extraction instead of JSON.parse — tolerates truncation
          const poem = extractFields(text);
          resolve(poem);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function generatePoem() {
  const themes = [
    '孤獨與等待','時間的流逝','離別與思念','人生的轉折',
    '夜晚與星空','雨與淚水','旅途與歸處','愛與失去',
    '春天的終結','記憶與遺忘','勇氣與脆弱','相遇與緣分'
  ];
  const theme = themes[new Date().getDate() % themes.length];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`🔄 嘗試第 ${attempt} 次...`);
      const poem = await callGemini(theme);
      return poem;
    } catch(e) {
      console.log(`⚠️  第 ${attempt} 次失敗：${e.message}`);
      if (attempt < 3) {
        console.log('⏳ 等待 30 秒後重試...');
        await sleep(30000);
      } else {
        throw e;
      }
    }
  }
}

async function main() {
  console.log('🌸 Starting daily poem generation...');
  console.log('📅 Date:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));
  if (!GEMINI_API_KEY) { console.error('❌ GEMINI_API_KEY not set'); process.exit(1); }
  try {
    const poem = await generatePoem();
    const today = new Date().toISOString().split('T')[0];
    const output = { date: today, generatedAt: new Date().toISOString(), ...poem };
    fs.writeFileSync(path.join(__dirname, 'today-poem.json'), JSON.stringify(output, null, 2), 'utf8');
    console.log('✅ Saved! Poem:', poem.jp);
    console.log('🇹🇼', poem.zh);
  } catch(e) {
    console.error('❌ All retries failed:', e.message);
    process.exit(1);
  }
}

main();
