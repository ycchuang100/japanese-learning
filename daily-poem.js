const https = require('https');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function generatePoem() {
  return new Promise((resolve, reject) => {
    const themes = [
      '孤獨與等待', '時間的流逝', '離別與思念', '人生的轉折',
      '夜晚與星空', '雨與淚水', '旅途與歸處', '愛與失去',
      '春天的終結', '記憶與遺忘', '勇氣與脆弱', '相遇與緣分'
    ];
    const today = new Date();
    const theme = themes[today.getDate() % themes.length];

    // 極簡prompt，分兩步驟，先只要句子
    const prompt = `以「${theme}」為主題創作一句原創日文美句。
只回傳以下JSON，不加任何說明或markdown，所有值不含換行符：
{"jp":"日文句子(10-15字)","yomi":"平假名","zh":"中文譯","theme":"${theme}","w1":"單字1","r1":"讀音1","m1":"意思1","w2":"單字2","r2":"讀音2","m2":"意思2","w3":"單字3","r3":"讀音3","m3":"意思3","note":"文法說明15字內"}`;

    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 400 }
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
          if (resp.error) throw new Error(resp.error.message);
          const text = resp.candidates[0].content.parts[0].text;
          // Try to find JSON object
          const jsonMatch = text.match(/\{[^{}]*\}/s);
          if (!jsonMatch) throw new Error('No JSON found\nRaw: ' + text.substring(0, 300));
          const raw = JSON.parse(jsonMatch[0]);
          // Normalize flat format to nested vocab
          const poem = {
            jp: raw.jp, yomi: raw.yomi, zh: raw.zh, theme: raw.theme,
            note: raw.note,
            vocab: [
              { word: raw.w1, kana: raw.r1, meaning: raw.m1 },
              { word: raw.w2, kana: raw.r2, meaning: raw.m2 },
              { word: raw.w3, kana: raw.r3, meaning: raw.m3 }
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
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();
