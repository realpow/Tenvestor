const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const AdmZip = require('adm-zip');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const EXCHANGE_CACHE_TTL = 30 * 60 * 1000;

const EXIM_API_KEY = process.env.EXIM_API_KEY || 'SEU6wpviRp8Z79d8iBiXxijWUvyefPjA';
const DART_API_KEY = process.env.DART_API_KEY || 'd0331ea6a2bc04d8f9e65b51592a2f611d4dbda5';
const DART_CACHE_TTL = 24 * 60 * 60 * 1000;

// 확인 필요: DART 고유번호는 opendart.fss.or.kr > 공시정보 > 고유번호 검색으로 확인
const DART_CORP_CODES = {
  skt:     '00126380',
  kt:      '00104516',
  lgu:     '00254573',
  samsung: '00164779',
};

const MAIN_CURRENCIES = ['USD', 'EUR', 'JPY(100)', 'CNH', 'GBP', 'AUD', 'CAD', 'SGD', 'HKD'];

app.use(express.static(path.join(__dirname, 'public')));

const CATEGORIES = {
  all:      { label: '전체',       queries: ['SK텔레콤', 'SKT 뉴스'] },
  telecom:  { label: '5G/통신',    queries: ['SK텔레콤 5G', 'SKT 통신망', 'SK텔레콤 네트워크'] },
  ai:       { label: 'AI/클라우드', queries: ['SK텔레콤 AI', 'SKT 인공지능', 'SK텔레콤 클라우드'] },
  media:    { label: '미디어/콘텐츠', queries: ['SK텔레콤 Wavve', 'SK텔레콤 미디어', 'T맵 SK텔레콤'] },
  security: { label: '보안/ICT',   queries: ['SK텔레콤 정보보안', 'SKT 사이버보안', 'SK텔레콤 해킹'] },
  mobility: { label: '모빌리티/UAM', queries: ['SK텔레콤 UAM', 'T맵 모빌리티', 'SK텔레콤 자율주행'] },
  global:   { label: '글로벌/투자', queries: ['SK텔레콤 투자', 'SK텔레콤 해외', 'SK텔레콤 인수합병'] }
};

const COMPANIES = {
  skt:     { label: 'SK텔레콤', queries: ['SK텔레콤', 'SKT'] },
  kt:      { label: 'KT',       queries: ['KT 통신', 'KT 기가'] },
  lgu:     { label: 'LG유플러스', queries: ['LG유플러스', 'LGU+'] },
  samsung: { label: '삼성전자',  queries: ['삼성전자 IT', '삼성 반도체'] },
  apple:   { label: 'Apple',    queries: ['애플 아이폰 한국', 'Apple Korea'] },
  google:  { label: 'Google',   queries: ['구글 한국 뉴스', 'Google AI Korea'] },
  meta:    { label: 'Meta',     queries: ['메타 AI 뉴스', 'Meta Facebook Korea'] },
  amazon:  { label: 'Amazon',   queries: ['아마존 AWS 한국', 'Amazon cloud Korea'] }
};

const STOPWORDS = new Set([
  '이','가','을','를','은','는','의','에','에서','로','으로','와','과','도','만','부터','까지',
  '이다','있다','했다','한다','하는','하고','되다','됩니다','합니다','했습니다','있습니다',
  '위해','통해','대한','관련','위한','지난','올해','이번','지난해','올해의','등에','등이',
  '제공','사업','서비스','회사','기업','대표','통한','따른','등을','등의','또','및','더',
  '이후','현재','이상','이하','그','이','오는','한','vs','기자','뉴스','보도','발표',
  'sk','skt','kt','lg','a','the','of','in','for','on','with','at','by','to',
  '속','전','후','내','간','위','아래','오늘','내일','어제','올','는데','으며','이며'
]);

async function fetchRSS(query) {
  const cacheKey = `rss_${query}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 10000
  });

  const parser = new xml2js.Parser({ explicitArray: true });
  const result = await parser.parseStringPromise(response.data);
  const items = result?.rss?.channel?.[0]?.item || [];

  const articles = items.slice(0, 15).map(item => {
    const titleRaw = item.title?.[0] || '';
    const title = (typeof titleRaw === 'object' ? titleRaw._ || '' : titleRaw)
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim();

    const sourceRaw = item.source?.[0];
    const source = (typeof sourceRaw === 'object' ? sourceRaw._ || '' : sourceRaw || '').trim();

    return { title, link: item.link?.[0] || '', pubDate: item.pubDate?.[0] || '', source };
  });

  cache.set(cacheKey, { data: articles, timestamp: Date.now() });
  return articles;
}

function dedupeByTitle(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = a.title.substring(0, 25);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortByDate(articles) {
  return articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

function extractKeywords(articles) {
  const counts = {};
  articles.forEach(a => {
    const words = a.title.split(/[\s\-·,.:!?'"()\[\]\/<>]+/);
    words.forEach(w => {
      const word = w.trim();
      if (word.length >= 2 && !STOPWORDS.has(word.toLowerCase()) && !/^\d+$/.test(word)) {
        counts[word] = (counts[word] || 0) + 1;
      }
    });
  });

  return Object.entries(counts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([keyword, count]) => ({ keyword, count }));
}

// GET /api/news?category=all&companies=skt,kt
app.get('/api/news', async (req, res) => {
  const categoryKey = req.query.category || 'all';
  const companiesParam = req.query.companies || 'skt';
  const selectedCompanies = companiesParam.split(',').map(c => c.trim()).filter(c => COMPANIES[c]);

  try {
    let queries;

    if (selectedCompanies.length === 1 && selectedCompanies[0] === 'skt') {
      const category = CATEGORIES[categoryKey] || CATEGORIES.all;
      queries = category.queries;
    } else {
      queries = selectedCompanies.flatMap(key => COMPANIES[key].queries);
    }

    const results = await Promise.allSettled(queries.map(q => fetchRSS(q)));
    const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
    const articles = sortByDate(dedupeByTitle(all)).slice(0, 40);

    res.json({ success: true, articles, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: '뉴스를 불러오는 데 실패했습니다.' });
  }
});

// GET /api/trending?companies=skt,kt
app.get('/api/trending', async (req, res) => {
  const companiesParam = req.query.companies || 'skt';
  const selectedCompanies = companiesParam.split(',').map(c => c.trim()).filter(c => COMPANIES[c]);

  try {
    const queries = selectedCompanies.map(key => COMPANIES[key].queries[0]);
    const results = await Promise.allSettled(queries.map(q => fetchRSS(q)));
    const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
    const keywords = extractKeywords(all);
    res.json({ success: true, keywords });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: '트렌드를 불러오는 데 실패했습니다.' });
  }
});

// GET /api/search?q=keyword&companies=skt
app.get('/api/search', async (req, res) => {
  const keyword = req.query.q?.trim();
  const companiesParam = req.query.companies || 'skt';
  if (!keyword) return res.status(400).json({ success: false, error: '검색어를 입력하세요.' });

  const selectedCompanies = companiesParam.split(',').map(c => c.trim()).filter(c => COMPANIES[c]);

  try {
    const queries = selectedCompanies.map(key => {
      const base = COMPANIES[key].queries[0].split(' ')[0];
      return `${base} ${keyword}`;
    });

    const results = await Promise.allSettled(queries.map(q => fetchRSS(q)));
    const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
    const articles = sortByDate(dedupeByTitle(all)).slice(0, 30);
    res.json({ success: true, articles });
  } catch (err) {
    res.status(500).json({ success: false, error: '검색에 실패했습니다.' });
  }
});

// ── DART 기업코드 전체 목록 (corpCode.xml ZIP) ─────────────
let corpCodeList   = null;
let corpCodeLoadedAt = 0;
const CORP_CODE_TTL = 24 * 60 * 60 * 1000;

async function loadCorpCodeList() {
  if (corpCodeList && Date.now() - corpCodeLoadedAt < CORP_CODE_TTL) return corpCodeList;

  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${DART_API_KEY}`;
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });

  const zip     = new AdmZip(Buffer.from(response.data));
  const xmlEntry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.xml'));
  if (!xmlEntry) throw new Error('기업코드 ZIP에 XML 파일 없음');

  const xmlStr = xmlEntry.getData().toString('utf-8');
  const parsed = await new xml2js.Parser({ explicitArray: true }).parseStringPromise(xmlStr);

  const items = parsed?.result?.list || [];
  corpCodeList = items
    .map(item => ({
      corp_code:  (item.corp_code?.[0]  || '').trim(),
      corp_name:  (item.corp_name?.[0]  || '').trim(),
      stock_code: (item.stock_code?.[0] || '').trim(),
    }))
    .filter(c => c.corp_code && c.corp_name);

  corpCodeLoadedAt = Date.now();
  console.log(`DART 기업코드 로드 완료: ${corpCodeList.length}개`);
  return corpCodeList;
}

// GET /api/company-search?q=삼성전자
app.get('/api/company-search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.status(400).json({ success: false, error: '검색어를 입력하세요.' });

  try {
    const list = await loadCorpCodeList();
    const lower = q.toLowerCase();
    const results = list
      .filter(c => c.corp_name.toLowerCase().includes(lower))
      .slice(0, 15)
      .map(c => ({ corp_code: c.corp_code, corp_name: c.corp_name, stock_code: c.stock_code }));

    res.json({ success: true, results });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: '기업코드 목록을 불러오지 못했습니다.' });
  }
});

// ── DART 기업개황 ──────────────────────────────────────────
app.get('/api/company', async (req, res) => {
  const corpCode = (req.query.corp_code || '').trim();
  if (!/^\d{8}$/.test(corpCode)) {
    return res.status(400).json({ success: false, error: '고유번호는 8자리 숫자여야 합니다.' });
  }

  const cacheKey = `dart_${corpCode}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < DART_CACHE_TTL) {
    return res.json({ success: true, company: cached.data });
  }

  try {
    const url = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${DART_API_KEY}&corp_code=${corpCode}`;
    const response = await axios.get(url, { timeout: 8000 });
    const d = response.data;

    if (d.status !== '000') {
      return res.status(502).json({ success: false, error: d.message || 'DART 조회 실패' });
    }

    const company = {
      name:      d.corp_name,
      nameEng:   d.corp_name_eng,
      stockName: d.stock_name,
      stockCode: d.stock_code,
      ceo:       d.ceo_nm,
      address:   d.adres,
      homepage:  d.hm_url,
      irUrl:     d.ir_url,
      phone:     d.phn_no,
      fax:       d.fax_no,
      indutyCode:d.induty_code,
      jurirNo:   d.jurir_no,
      bizrNo:    d.bizr_no,
      estDate:   d.est_dt,
      accMonth:  d.acc_mt,
      corpCls:   d.corp_cls,
    };

    cache.set(cacheKey, { data: company, timestamp: Date.now() });
    res.json({ success: true, company });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: '기업 정보를 불러오는 데 실패했습니다.' });
  }
});

// ── 환율 ──────────────────────────────────────────────────
function getDateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

async function fetchExchangeRates() {
  const cacheKey = 'exchange_rates';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < EXCHANGE_CACHE_TTL) return cached.data;

  let rates = [];
  for (let offset = 0; offset <= 5; offset++) {
    const searchdate = getDateStr(offset);
    const url = `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${EXIM_API_KEY}&searchdate=${searchdate}&data=AP01`;
    try {
      const response = await axios.get(url, { timeout: 8000 });
      const data = response.data;
      if (Array.isArray(data) && data.length > 0 && data[0].result === 1) {
        rates = data.filter(r => MAIN_CURRENCIES.includes(r.cur_unit));
        break;
      }
    } catch { /* 이전 날짜로 재시도 */ }
  }

  const result = rates.map(r => ({
    code: r.cur_unit,
    name: r.cur_nm,
    rate: r.deal_bas_r,
    ttb: r.ttb,
    tts: r.tts
  }));

  cache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

app.get('/api/exchange', async (req, res) => {
  try {
    const rates = await fetchExchangeRates();
    res.json({ success: true, rates });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: '환율 정보를 불러오는 데 실패했습니다.' });
  }
});

app.listen(PORT, () => console.log(`SK텔레콤 뉴스 서버: http://localhost:${PORT}`));
