// ═══════════════════════════════════════════════════════════
// 每日日文新聞自動分析腳本
// 執行：node fetch-and-analyze.js
// ═══════════════════════════════════════════════════════════

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || '';

// ── 1. 抓取 NHK Web Easy 最新新聞 ──────────────────────────
function fetchNHK() {
  return new Promise((resolve, reject) => {
    const url = 'https://www3.nhk.or.jp/news/easy/top-list.json';
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // NHK Easy 回傳格式：array of news items
          const items = Array.isArray(json) ? json : (json.news_easy_top_list || json.result || []);
          if (items.length === 0) throw new Error('No news items');
          // 取第一則（最新）
          const top = items[0];
          resolve({
            title: top.title || top.news_easy_title || '',
            titleYomi: top.title_yomi || top.news_easy_title_yomi || '',
            newsId: top.news_id || top.news_easy_id || '',
            date: top.news_prearranged_time || top.date || new Date().toISOString()
          });
        } catch(e) {
          // fallback：使用備用新聞
          resolve(getFallbackNews());
        }
      });
    }).on('error', () => resolve(getFallbackNews()));
  });
}

function getFallbackNews() {
  const fallbacks = [
    { title: '日本の物価が上がっています', titleYomi: 'にほんのぶっかがあがっています', newsId: 'fallback1', date: new Date().toISOString() },
    { title: '東京で大きな花火大会がありました', titleYomi: 'とうきょうでおおきなはなびたいかいがありました', newsId: 'fallback2', date: new Date().toISOString() },
    { title: '新しい技術で生活が変わっています', titleYomi: 'あたらしいぎじゅつでせいかつがかわっています', newsId: 'fallback3', date: new Date().toISOString() },
    { title: '日本の学校で新しい勉強が始まりました', titleYomi: 'にほんのがっこうであたらしいべんきょうがはじまりました', newsId: 'fallback4', date: new Date().toISOString() },
    { title: '桜の花が今年も咲きました', titleYomi: 'さくらのはながことしもさきました', newsId: 'fallback5', date: new Date().toISOString() },
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ── 2. 用 Gemini 分析新聞 ───────────────────────────────────
function analyzeWithGemini(newsTitle, newsYomi) {
  return new Promise((resolve, reject) => {
    const prompt = `你是一位日文老師，專門教台灣初學者（剛學完50音）。
請針對以下日文新聞標題進行詳細的學習分析，用繁體中文說明。

新聞標題：${newsTitle}
平假名讀音：${newsYomi || '（請自行標注）'}

請以下列JSON格式回覆，不要加任何markdown或其他文字，只回傳純JSON：
{
  "title": "${newsTitle}",
  "titleYomi": "完整平假名讀音",
  "titleZh": "中文翻譯",
  "difficulty": "初級",
  "vocab": [
    {
      "jp": "單字",
      "kana": "讀音",
      "zh": "中文意思",
      "pos": "詞性",
      "example": "例句（日文）",
      "exampleZh": "例句中文"
    }
  ],
  "grammar": {
    "pattern": "今日句型",
    "explanation": "文法說明（繁體中文）",
    "examples": [
      {"jp": "例句1", "zh": "中文1"},
      {"jp": "例句2", "zh": "中文2"}
    ],
    "tip": "給台灣學習者的提示"
  },
  "pitch": [
    {
      "word": "單字",
      "kana": "讀音",
      "pattern": "音調說明",
      "morae": ["音節1", "音節2"],
      "highs": [true, false]
    }
  ],
  "quiz": [
    {
      "q": "題目",
      "opts": ["選項A", "選項B", "選項C", "選項D"],
      "ans": 0,
      "fb": "解析說明"
    },
    {
      "q": "題目2",
      "opts": ["選項A", "選項B", "選項C", "選項D"],
      "ans": 1,
      "fb": "解析說明"
    }
  ],
  "summary": "今日學習重點（一句話）"
}

vocab請選3個最重要、最實用的單字。
pitch請選2個有代表性的單字做音調分析。
quiz出2題，測驗今日單字或文法。`;

    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
          const clean = text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
          const analysis = JSON.parse(clean);
          resolve(analysis);
        } catch(e) {
          reject(new Error('Gemini parse error: ' + e.message + '\nRaw: ' + data.substring(0,200)));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── 3. 產生今日學習 JSON ────────────────────────────────────
function buildTodayLesson(analysis, newsInfo) {
  const today = new Date().toISOString().split('T')[0];
  return {
    date: today,
    newsId: newsInfo.newsId,
    generatedAt: new Date().toISOString(),
    ...analysis
  };
}

// ── 4. 寫入 today.json ──────────────────────────────────────
function saveTodayLesson(lesson) {
  const outputPath = path.join(__dirname, 'today.json');
  fs.writeFileSync(outputPath, JSON.stringify(lesson, null, 2), 'utf8');
  console.log('✅ Saved to today.json');
  console.log('📰 Title:', lesson.title);
  console.log('🇹🇼 Translation:', lesson.titleZh);
  console.log('📚 Vocab count:', lesson.vocab?.length);
}

// ── 5. 發送 FCM 推播（選用）─────────────────────────────────
function sendFCMNotification(lesson) {
  if (!FCM_SERVER_KEY || FCM_SERVER_KEY === '') {
    console.log('⏭️  FCM_SERVER_KEY not set, skipping push notification');
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      to: '/topics/daily-lesson',
      notification: {
        title: '📰 今日日文新聞課程',
        body: lesson.title + '　' + (lesson.titleZh || ''),
        click_action: 'https://admirable-kangaroo-cf0c95.netlify.app'
      },
      data: { date: lesson.date, title: lesson.title }
    });
    const options = {
      hostname: 'fcm.googleapis.com',
      path: '/fcm/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'key=' + FCM_SERVER_KEY
      }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { console.log('🔔 FCM sent:', d); resolve(); });
    });
    req.on('error', e => { console.log('FCM error (non-fatal):', e.message); resolve(); });
    req.write(payload);
    req.end();
  });
}

// ── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting daily Japanese news analysis...');
  console.log('📅 Date:', new Date().toLocaleString('zh-TW', {timeZone: 'Asia/Taipei'}));

  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not set');
    process.exit(1);
  }

  try {
    console.log('📡 Fetching NHK news...');
    const newsInfo = await fetchNHK();
    console.log('📰 Got news:', newsInfo.title);

    console.log('🤖 Analyzing with Gemini...');
    const analysis = await analyzeWithGemini(newsInfo.title, newsInfo.titleYomi);

    const lesson = buildTodayLesson(analysis, newsInfo);
    saveTodayLesson(lesson);

    await sendFCMNotification(lesson);

    console.log('✅ Done! Today\'s lesson is ready.');
  } catch(e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

main();
