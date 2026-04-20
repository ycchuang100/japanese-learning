// ═══════════════════════════════════════════════════════════
// 每日日文美句生成腳本（中島みゆき風格）
// 執行：node daily-poem.js
// ═══════════════════════════════════════════════════════════

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

    const prompt = `你是一位日文詩句創作者，風格深受中島みゆき影響——深沉、細膩、帶有人生哲理。

請以「${theme}」為主題，創作一句原創日文美句，然後用JSON格式回覆。

要求：
- 日文句子長度10-20字
- 帶有詩意和哲理感
- 適合日文初中級學習者（可以有漢字但要附讀音）
- 不能抄襲任何現有歌詞

只回傳純JSON，不要任何markdown或其他文字：
{
  "jp": "日文句子",
  "yomi": "完整平假名讀音",
  "zh": "中文翻譯",
  "theme": "${theme}",
  "vocab": [
    {"word": "單字", "kana": "讀音", "meaning": "意思"},
    {"word": "單字2", "kana": "讀音2", "meaning": "意思2"},
    {"word": "單字3", "kana": "讀音3", "meaning": "意思3"}
  ],
  "note": "一句關於這個句子語感或文法的說明（繁體中文，30字以內）"
}`;

    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 2000 }
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
          const text = resp.candidates[0].content.parts[0].text;
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const clean = jsonMatch ? jsonMatch[0] : text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
          const poem = JSON.parse(clean);
          resolve(poem);
        } catch(e) {
          reject(new Error('Gemini parse error: ' + e.message + '\nRaw: ' + data.substring(0,300)));
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
  console.log('📅 Date:', new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}));

  if (!GEMINI_API_KEY) { console.error('❌ GEMINI_API_KEY not set'); process.exit(1); }

  try {
    console.log('✍️  Generating poem with Gemini...');
    const poem = await generatePoem();
    const today = new Date().toISOString().split('T')[0];
    const output = { date: today, generatedAt: new Date().toISOString(), ...poem };
    fs.writeFileSync(path.join(__dirname, 'today-poem.json'), JSON.stringify(output, null, 2), 'utf8');
    console.log('✅ Saved to today-poem.json');
    console.log('🌸 Poem:', poem.jp);
    console.log('🇹🇼 Translation:', poem.zh);
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();
