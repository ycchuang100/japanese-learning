const https = require('https');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function callGemini(theme) {
  return new Promise((resolve, reject) => {
    // Ask for a simple numbered list format — much easier to parse than JSON
    const prompt = `以「${theme}」為主題，創作一句原創日文美句（10-15字，帶詩意，中島みゆき風格）。
請用以下格式回答，每行一個欄位，不要加其他說明：
JP: （日文句子）
YOMI: （完整平假名讀音）
ZH: （中文翻譯）
W1: （重要單字1）
R1: （單字1讀音）
M1: （單字1意思）
W2: （重要單字2）
R2: （單字2讀音）
M2: （單字2意思）
W3: （重要單字3）
R3: （單字3讀音）
M3: （單字3意思）
NOTE: （文法說明，15字內）`;

    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 500 }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const resp = JSON.parse(data);
          if (resp.error) {
            reject(new Error(`API ${resp.error.code}: ${resp.error.message}`));
            return;
          }
          const text = resp.candidates[0].content.parts[0].text;
          console.log('📝 Raw response:\n' + text);

          // Parse line-by-line format
          function getLine(key) {
            const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
            return m ? m[1].trim() : '';
          }

          const jp = getLine('JP');
          if (!jp) throw new Error('Cannot find JP field in response');

          const poem = {
            jp,
            yomi: getLine('YOMI'),
            zh: getLine('ZH'),
            theme,
            note: getLine('NOTE'),
            vocab: [
              { word: getLine('W1'), kana: getLine('R1'), meaning: getLine('M1') },
              { word: getLine('W2'), kana: getLine('R2'), meaning: getLine('M2') },
              { word: getLine('W3'), kana: getLine('R3'), meaning: getLine('M3') }
            ]
          };
          resolve(poem);
        } catch(e) {
          reject(new Error('Parse error: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function generatePoem() {
  const themes = [
    '孤獨與等待', '時間的流逝', '離別與思念', '人生的轉折',
    '夜晚與星空', '雨與淚水', '旅途與歸處', '愛與失去',
    '春天的終結', '記憶與遺忘', '勇氣與脆弱', '相遇與緣分'
  ];
  const theme = themes[new Date().getDate() % themes.length];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`🔄 嘗試第 ${attempt} 次（主題：${theme}）...`);
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
    console.log('✅ Saved!');
    console.log('🌸 JP:', poem.jp);
    console.log('🇹🇼 ZH:', poem.zh);
    console.log('📖 YOMI:', poem.yomi);
  } catch(e) {
    console.error('❌ All retries failed:', e.message);
    process.exit(1);
  }
}

main();
