// fetch-news.js — 每天早上8點抓 NHK 新聞並用 Gemini 分析
const https = require('https');
const fs = require('fs');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-lite'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 抓 NHK Web Easy 最新新聞 ─────────────────────────────────
function fetchNHK() {
  return new Promise((resolve) => {
    const url = 'https://www3.nhk.or.jp/news/easy/top-list.json';
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const items = Array.isArray(list) ? list : (list.news_easy_top_list || []);
          // 今天日期
          const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
          // 優先找今天的新聞，沒有就取第一則
          const item = items.find(i => (i.news_prearranged_time||'').startsWith(today)) || items[0];
          if (!item) throw new Error('empty list');
          resolve({
            title: item.title || item.news_easy_title || '',
            yomi: item.title_yomi || item.news_easy_title_yomi || '',
            date: (item.news_prearranged_time || new Date().toISOString()).slice(0,10)
          });
        } catch(e) {
          console.log('NHK fetch failed, using fallback:', e.message);
          // fallback: 用日期做 seed 選不同句子
          const seeds = [
            {title:'東京で大雨が続いています', yomi:'とうきょうでおおあめがつづいています'},
            {title:'日本の物価が上がっています', yomi:'にほんのぶっかがあがっています'},
            {title:'新しい技術で生活が変わっています', yomi:'あたらしいぎじゅつでせいかつがかわっています'},
            {title:'桜の花が各地で咲きました', yomi:'さくらのはながかくちでさきました'},
            {title:'子どもたちが新学期を迎えました', yomi:'こどもたちがしんがっきをむかえました'},
            {title:'海外からの観光客が増えています', yomi:'かいがいからのかんこうきゃくがふえています'},
            {title:'政府が新しい計画を発表しました', yomi:'せいふがあたらしいけいかくをはっぴょうしました'},
          ];
          const idx = new Date().getDate() % seeds.length;
          resolve({ ...seeds[idx], date: new Date().toISOString().slice(0,10) });
        }
      });
    });
    req.on('error', () => {
      const seeds = [
        {title:'日本経済が回復しています', yomi:'にほんけいざいがかいふくしています'},
        {title:'台風が日本に近づいています', yomi:'たいふうがにほんにちかづいています'},
      ];
      resolve({ ...seeds[new Date().getDate()%2], date: new Date().toISOString().slice(0,10) });
    });
  });
}

// ── Gemini 分析 ──────────────────────────────────────────────
function analyzeWithGemini(title, yomi, model) {
  return new Promise((resolve, reject) => {
    const prompt = `你是日文老師，學生剛學完50音。請分析這則日文新聞標題，用繁體中文說明。
新聞：${title}
讀音：${yomi}

只回傳純JSON（不加markdown），格式：
{"titleZh":"中文翻譯","vocab":[{"jp":"單字","kana":"讀音","zh":"意思","pos":"詞性"},{"jp":"單字2","kana":"讀音2","zh":"意思2","pos":"詞性"},{"jp":"單字3","kana":"讀音3","zh":"意思3","pos":"詞性"}],"grammar":{"pattern":"句型","explanation":"說明30字","examples":[{"jp":"例句","zh":"翻譯"},{"jp":"例句2","zh":"翻譯2"}],"tip":"台灣學習者提示"},"pitch":[{"word":"單字","kana":"讀音","morae":["音","節"],"highs":[true,false],"note":"音調說明"},{"word":"單字2","kana":"讀音2","morae":["音","節"],"highs":[false,true],"note":"說明2"}],"quiz":[{"q":"題目","opts":["A","B","C","D"],"ans":1,"fb":"解析"},{"q":"題目2","opts":["A","B","C","D"],"ans":0,"fb":"解析2"}],"summary":"今日學習重點一句話"}`;

    const body = JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{temperature:0.3, maxOutputTokens:2000}
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
          const m = text.match(/\{[\s\S]*\}/);
          if (!m) throw new Error('no JSON in response');
          resolve(JSON.parse(m[0]));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('🚀 fetch-news.js starting...');
  console.log('📅', new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}));

  if (!GEMINI_API_KEY) { console.error('❌ No GEMINI_API_KEY'); process.exit(1); }

  const news = await fetchNHK();
  console.log('📰 News:', news.title);

  let analysis = null;
  for (const model of MODELS) {
    try {
      console.log(`🤖 Trying ${model}...`);
      analysis = await analyzeWithGemini(news.title, news.yomi, model);
      console.log(`✅ ${model} succeeded`);
      break;
    } catch(e) {
      console.log(`⚠️  ${model} failed: ${e.message}`);
      await sleep(10000);
    }
  }

  if (!analysis) { console.error('❌ All models failed'); process.exit(1); }

  const output = {
    date: news.date,
    generatedAt: new Date().toISOString(),
    title: news.title,
    titleYomi: news.yomi,
    ...analysis
  };

  fs.writeFileSync('today.json', JSON.stringify(output, null, 2));
  console.log('✅ Saved today.json');
  console.log('📖', analysis.titleZh);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
