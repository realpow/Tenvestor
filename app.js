'use strict';

// ── 설정 (API 키는 config.js에서 주입, 절대 여기에 하드코딩하지 말 것) ──
const _ext = window.TENVESTOR_CONFIG || {};
const CONFIG = {
  EXIM_API_KEY: _ext.EXIM_API_KEY || '',
  DART_API_KEY: _ext.DART_API_KEY || '',
  CACHE_TTL:    5  * 60 * 1000,
  EXIM_TTL:     30 * 60 * 1000,
  DART_TTL:     24 * 60 * 60 * 1000,
};

// ── 회사별 뉴스 검색 쿼리 (미국: Google News / 한국: 네이버 뉴스) ──
const COMPANIES = {
  // 미국 (Google News RSS)
  google:       { label: 'Google',          queries: ['Google AI Alphabet stock'] },
  ibm:          { label: 'IBM',             queries: ['IBM quantum AI news'] },
  nvidia:       { label: 'Nvidia',          queries: ['Nvidia GPU AI stock'] },
  micron:       { label: 'Micron',          queries: ['Micron Technology memory stock'] },
  sandisk:      { label: 'SanDisk',         queries: ['SanDisk Western Digital storage'] },
  marvell:      { label: 'Marvell',         queries: ['Marvell Technology semiconductor'] },
  broadcom:     { label: 'Broadcom',        queries: ['Broadcom chip AI stock'] },
  tesla:        { label: 'Tesla',           queries: ['Tesla EV Elon Musk stock'] },
  spacex:       { label: 'SpaceX',          queries: ['SpaceX Starship launch'] },
  ionq:         { label: 'IonQ',            queries: ['IonQ quantum computing stock'] },
  quantinuum:   { label: 'Quantinuum',      queries: ['Quantinuum Honeywell quantum'] },
  inflection:   { label: 'Inflection',      queries: ['Inflection AI Pi chatbot'] },
  // 한국 (네이버 뉴스 RSS)
  samsung:      { label: '삼성전자',        queries: ['삼성전자 주가'],      source: 'naver' },
  skhynix:      { label: 'SK하이닉스',      queries: ['SK하이닉스 주가'],    source: 'naver' },
  celltrion:    { label: '셀트리온',        queries: ['셀트리온 주가'],      source: 'naver' },
  samsungsdi:   { label: '삼성SDI',         queries: ['삼성SDI 주가'],       source: 'naver' },
  posco:        { label: 'POSCO홀딩스',     queries: ['POSCO홀딩스 주가'],   source: 'naver' },
  lgenergy:     { label: 'LG에너지솔루션',  queries: ['LG에너지솔루션 주가'], source: 'naver' },
  hyundai:      { label: '현대차',          queries: ['현대차 주가'],        source: 'naver' },
  hyundaimobis: { label: '현대모비스',      queries: ['현대모비스 주가'],    source: 'naver' },
  hyosung:      { label: '효성중공업',      queries: ['효성중공업 주가'],    source: 'naver' },
  lselectric:   { label: 'LS ELECTRIC',    queries: ['LS ELECTRIC 주가'],   source: 'naver' },
  hdhyundai:    { label: 'HD현대일렉트릭', queries: ['HD현대일렉트릭 주가'], source: 'naver' },
  seah:         { label: '세아베스틸지주',  queries: ['세아베스틸지주 주가'], source: 'naver' },
  poongsan:     { label: '풍산',            queries: ['풍산 주가'],          source: 'naver' },
};

// ── 카테고리별 검색 쿼리 ─────────────────────────────────
const CATEGORIES = {
  all:           { queries: ['미국 증시 주요 뉴스', '한국 증시 오늘'] },
  'us-market':   { queries: ['S&P500 나스닥 다우존스', '뉴욕증시 오늘'] },
  'kr-market':   { queries: ['코스피 오늘', '코스닥 오늘', '한국증시 오늘'], source: 'naver' },
  bigtech:       { queries: ['Google Nvidia Tesla IBM Broadcom AI stock'] },
  semiconductor: { queries: ['반도체 HBM 삼성 SK하이닉스', 'TSMC Micron chip AI'] },
  quantum:       { queries: ['IonQ Quantinuum quantum computing', '양자컴퓨터 뉴스'] },
  'bond-fx':     { queries: ['미국 국채 금리 연준', '달러 원화 환율'] },
  commodity:     { queries: ['WTI 국제유가 금 시세', '구리 원자재 원유'] },
};

// ── 미국/한국 종목 분류 (섹션 분리용) ─────────────────────
const US_COMPANIES  = ['google','ibm','nvidia','micron','sandisk','marvell','broadcom','tesla','spacex','ionq','quantinuum','inflection'];
const KR_COMPANIES  = ['samsung','skhynix','celltrion','samsungsdi','posco','lgenergy','hyundai','hyundaimobis','hyosung','lselectric','hdhyundai','seah','poongsan'];
const KR_CATEGORIES = ['kr-market'];
const US_CATEGORIES = ['us-market','bigtech','semiconductor','quantum','bond-fx','commodity'];

const MAIN_CURRENCIES = ['USD', 'EUR', 'JPY(100)', 'CNH'];

const STOPWORDS = new Set([
  '이','가','을','를','은','는','의','에','에서','로','으로','와','과','도','만',
  '이다','있다','했다','한다','하는','하고','되다','됩니다','합니다','했습니다',
  '위해','통해','대한','관련','지난','올해','이번','지난해','등에','등이',
  '제공','사업','서비스','회사','기업','통한','따른','등을','등의','또','및',
  '이후','현재','이상','이하','오는','한','기자','뉴스','보도','발표','속보',
  'a','the','of','in','for','on','with','at','by','to','and','is','are','vs',
  '속','전','후','내','간','위','오늘','내일','어제','올','는데','으며','이며'
]);

// ── 인메모리 캐시 ─────────────────────────────────────────
const cache = new Map();
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) { cache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data, ttl) {
  cache.set(key, { data, ts: Date.now(), ttl });
}

// ── 상태 ──────────────────────────────────────────────────
const state = {
  mode: 'news',
  category: 'all',
  companies: [],
  date: 'overnight',
  searchMode: false,
  searchKeyword: '',
  allArticles: [],
  autoRefreshTimer: null
};

const $ = id => document.getElementById(id);

// ── 유틸 ──────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)     return '방금 전';
  if (diff < 3600)   return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${dd}`;
}

function isNew(dateStr) {
  return dateStr && Date.now() - new Date(dateStr) < 2 * 60 * 60 * 1000;
}

function signalClass(dateStr) {
  if (!dateStr) return 'signal-cool';
  const diff = Date.now() - new Date(dateStr);
  if (diff < 60 * 60 * 1000)      return 'signal-hot';
  if (diff < 12 * 60 * 60 * 1000) return 'signal-warm';
  return 'signal-cool';
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 2400);
}

// ── CORS 프록시 fetch (allorigins.win, DART 등 외부 API용) ─
async function fetchCORS(url) {
  const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(12000)
  });
  return res;
}

// ── 뉴스 RSS 파싱 (미국: Google News / 한국: 네이버 뉴스) ──
function cleanText(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

// 네이버 뉴스 RSS는 <source> 태그가 없어 링크 도메인으로 대체
function extractSource(item, link) {
  const tagSource = cleanText(item.querySelector('source')?.textContent);
  if (tagSource) return tagSource;
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function fetchRSS(query, source = 'google') {
  const cacheKey = `rss_${source}_${query}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const rssUrl = source === 'naver'
    ? `https://search.naver.com/rss?where=news&query=${encodeURIComponent(query)}`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;

  const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`, {
    signal: AbortSignal.timeout(5000)
  });
  const xml = await res.text();

  const doc   = new DOMParser().parseFromString(xml, 'text/xml');
  const items = [...doc.querySelectorAll('item')].slice(0, 15);

  const articles = items.map(item => {
    const link = item.querySelector('link')?.textContent?.trim() || '';
    return {
      title:   cleanText(item.querySelector('title')?.textContent),
      link,
      pubDate: item.querySelector('pubDate')?.textContent?.trim() || '',
      source:  extractSource(item, link),
    };
  }).filter(a => a.title);

  cacheSet(cacheKey, articles, CONFIG.CACHE_TTL);
  return articles;
}

// ── 중복 제거 / 정렬 ─────────────────────────────────────
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
  return [...articles].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}

// ── 키워드 추출 (원본 server.js 방식) ────────────────────
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

// ── URL 상태 ─────────────────────────────────────────────
function pushURLState() {
  const p = new URLSearchParams();
  if (state.companies.length) p.set('companies', state.companies.join(','));
  p.set('date', state.date);
  p.set('category', state.category);
  if (state.searchMode && state.searchKeyword) p.set('q', state.searchKeyword);
  history.replaceState({}, '', `?${p.toString()}`);
}

function loadFromURL() {
  const p = new URLSearchParams(window.location.search);
  if (p.has('companies')) state.companies = p.get('companies').split(',').filter(Boolean);
  if (p.has('category'))  state.category  = p.get('category');
  if (p.has('date'))      state.date      = p.get('date');
  if (p.has('q'))         { state.searchMode = true; state.searchKeyword = p.get('q'); }
}

// ── 모드 전환 ─────────────────────────────────────────────
function switchMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));
  $('newsMode').classList.toggle('hidden', mode !== 'news');
  $('corpMode').classList.toggle('hidden', mode !== 'corp');
  $('filterBar').classList.toggle('hidden', mode !== 'news');
  $('searchWrap').classList.toggle('hidden', mode !== 'news');
  $('categoryNav').classList.toggle('hidden-nav', mode !== 'news');
}

// ── UI 동기화 ─────────────────────────────────────────────
function syncUI() {
  document.querySelectorAll('.cat-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.category === state.category));
  document.querySelectorAll('.co-btn').forEach(b =>
    b.classList.toggle('active', state.companies.includes(b.dataset.company)));
  document.querySelectorAll('.date-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.date === state.date));
  if (state.searchMode) $('searchInput').value = state.searchKeyword;
}

// ── 날짜 필터 ─────────────────────────────────────────────
function filterByDate(articles) {
  const todayStart    = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo       = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const overnightStart = new Date();
  overnightStart.setDate(overnightStart.getDate() - 1);
  overnightStart.setHours(16, 0, 0, 0);

  return articles.filter(a => {
    const d = new Date(a.pubDate);
    if (state.date === 'overnight') return d >= overnightStart;
    if (state.date === 'today')     return d >= todayStart;
    if (state.date === 'week')      return d >= weekAgo;
    return true;
  });
}

// ── 기사 분류 (US / KR 섹션) ─────────────────────────────
function splitArticles(articles) {
  const hasKr = state.companies.some(c => KR_COMPANIES.includes(c));
  const hasUs = state.companies.some(c => US_COMPANIES.includes(c));
  const isKrCat = KR_CATEGORIES.includes(state.category);
  const isUsCat = US_CATEGORIES.includes(state.category);

  if (isKrCat || (hasKr && !hasUs)) return { us: [], kr: articles };
  if (isUsCat || (hasUs && !hasKr)) return { us: articles, kr: [] };

  const krKw = ['코스피','코스닥','삼성전자','SK하이닉스','셀트리온','삼성SDI','POSCO','LG에너지','현대차','현대모비스','효성','LS','HD현대','세아','풍산','한국 증시','원화'];
  const kr = articles.filter(a => krKw.some(kw => (a.title || '').includes(kw)));
  const krSet = new Set(kr);
  return { us: articles.filter(a => !krSet.has(a)), kr };
}

// ── 렌더링 ───────────────────────────────────────────────
function showLoading() {
  $('loadingState').classList.remove('hidden');
  $('contentWrap').classList.add('hidden');
  $('emptyState').classList.add('hidden');
  $('errorBanner').classList.add('hidden');
}

function showError(msg) {
  $('loadingState').classList.add('hidden');
  $('contentWrap').classList.add('hidden');
  $('emptyState').classList.add('hidden');
  $('errorBanner').classList.remove('hidden');
  $('errorMessage').textContent = msg;
}

// ── 복합 캐시 키 ──────────────────────────────────────────
function buildNewsKey() {
  if (state.searchMode && state.searchKeyword)
    return `search_${state.searchKeyword}_${[...state.companies].sort().join(',')}`;
  if (state.companies.length)
    return `news__${[...state.companies].sort().join(',')}`;
  return `news_${state.category}_`;
}

// ── 스켈레톤 UI ───────────────────────────────────────────
function showSkeleton() {
  $('loadingState').classList.add('hidden');
  $('errorBanner').classList.add('hidden');
  $('emptyState').classList.add('hidden');
  $('contentWrap').classList.remove('hidden');
  $('usMarketSection').classList.remove('hidden');
  $('krMarketSection').classList.add('hidden');
  $('listDivider').classList.remove('hidden');

  $('heroGrid').innerHTML =
    '<div class="sk-hero sk-hero--main skeleton"></div>' +
    '<div class="sk-hero skeleton"></div>' +
    '<div class="sk-hero skeleton"></div>';

  $('articleList').innerHTML =
    Array(6).fill('<div class="sk-row skeleton"></div>').join('');

  $('krArticleList').innerHTML = '';
}

function renderHeroCard(a, isMain) {
  const sig = signalClass(a.pubDate);
  const cls = isMain ? `hero-card hero-card--main ${sig}` : `hero-card ${sig}`;
  const newBadge = isNew(a.pubDate) ? `<span class="badge-new">NEW</span>` : '';
  return `
    <a class="${cls}" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">
      <div class="hero-eyebrow">
        <span class="hero-source">${esc(a.source || '언론사')}</span>
        <span class="hero-date">${formatDate(a.pubDate)}</span>
      </div>
      ${newBadge}
      <h2 class="hero-title">${esc(a.title)}</h2>
    </a>`.trim();
}

function renderArticleRow(a) {
  const newBadge = isNew(a.pubDate) ? `<span class="badge-new">NEW</span>` : '';
  return `
    <a class="article-row ${signalClass(a.pubDate)}" href="${esc(a.link)}" target="_blank" rel="noopener noreferrer">
      <div class="row-main">
        <div class="row-top">
          <span class="row-source">${esc(a.source || '언론사')}</span>
          ${newBadge}
        </div>
        <span class="row-title">${esc(a.title)}</span>
      </div>
      <span class="row-date">${formatDate(a.pubDate)}</span>
    </a>`.trim();
}

function renderArticles(articles) {
  $('loadingState').classList.add('hidden');
  $('errorBanner').classList.add('hidden');

  const filtered = filterByDate(articles);

  if (state.searchMode) {
    $('statusLabel').textContent = '검색 결과';
    $('searchStatus').innerHTML =
      `"<strong>${esc(state.searchKeyword)}</strong>" <button class="search-clear-btn" id="clearBtn">초기화</button>`;
    $('clearBtn')?.addEventListener('click', clearSearch);
  } else {
    const catBtn = document.querySelector(`.cat-btn[data-category="${state.category}"]`);
    $('statusLabel').textContent = catBtn?.textContent || '전체';
    $('searchStatus').innerHTML = '';
  }
  $('articleCount').textContent = filtered.length > 0 ? `${filtered.length}건` : '';

  if (filtered.length === 0) {
    $('contentWrap').classList.add('hidden');
    $('emptyState').classList.remove('hidden');
    $('emptyMessage').textContent = state.date === 'overnight'
      ? '간밤 뉴스가 없습니다. 기간을 변경해 보세요.'
      : '해당 조건의 뉴스가 없습니다.';
    return;
  }

  $('emptyState').classList.add('hidden');
  $('contentWrap').classList.remove('hidden');

  const { us, kr } = splitArticles(filtered);

  const usHeroes = us.slice(0, 3);
  const usRest   = us.slice(3);
  $('heroGrid').innerHTML    = usHeroes.map((a, i) => renderHeroCard(a, i === 0)).join('');
  $('articleList').innerHTML = usRest.length ? usRest.map(a => renderArticleRow(a)).join('') : '';
  $('listDivider').classList.toggle('hidden', usRest.length === 0);
  $('usMarketSection').classList.toggle('hidden', us.length === 0);

  $('krArticleList').innerHTML = kr.length ? kr.map(a => renderArticleRow(a)).join('') : '';
  $('krMarketSection').classList.toggle('hidden', kr.length === 0);

  // 간밤 시각 배지
  const overnight = new Date();
  overnight.setDate(overnight.getDate() - 1);
  overnight.setHours(16, 0, 0, 0);
  const usTime = $('usMarketTime');
  if (usTime) {
    usTime.textContent =
      `${overnight.getMonth()+1}/${overnight.getDate()} ${String(overnight.getHours()).padStart(2,'0')}:00 KST 이후`;
  }
}

function setLastUpdated() {
  const now = new Date();
  $('lastUpdated').textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} 갱신`;
}

// ── 환율 티커 (한국수출입은행 API) ────────────────────────
function getDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

async function loadRateTicker() {
  const cached = cacheGet('exchange_rates');
  if (cached) {
    renderRateTicker(cached);
    return;
  }

  if (!CONFIG.EXIM_API_KEY) {
    $('rateTickerInner').innerHTML = '<span class="rate-ticker-loading">config.js에 EXIM_API_KEY를 설정하세요</span>';
    return;
  }

  try {
    let rates = [];
    // 영업일 기준 최근 5일 재시도 (원본 server.js 방식)
    for (let offset = 0; offset <= 5; offset++) {
      const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${CONFIG.EXIM_API_KEY}&searchdate=${getDateStr(offset)}&data=AP01`;
      try {
        const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0]?.result === 1) {
          rates = data.filter(r => MAIN_CURRENCIES.includes(r.cur_unit));
          break;
        }
      } catch { /* 이전 날짜로 재시도 */ }
    }

    if (!rates.length) throw new Error('환율 데이터 없음');

    const result = rates.map(r => ({
      code: r.cur_unit,
      name: r.cur_nm,
      rate: r.deal_bas_r,
    }));
    cacheSet('exchange_rates', result, CONFIG.EXIM_TTL);
    renderRateTicker(result);
  } catch {
    $('rateTickerInner').innerHTML = '<span class="rate-ticker-loading">환율 연결 오류</span>';
  }
}

function renderRateTicker(rates) {
  const itemHTML = rates.map(r => {
    const code = r.code === 'JPY(100)' ? 'JPY¥100' : r.code;
    return `<span class="rate-item">
      <span class="ri-code">${esc(code)}</span>
      <span class="ri-value">${esc(r.rate)}</span>
      <span class="ri-name">${esc(r.name)}</span>
    </span>`;
  }).join('');
  // 좌→우 루프를 위해 두 번 반복
  $('rateTickerInner').innerHTML = itemHTML + itemHTML;
  $('rateTickerInner').style.animation = 'none';
  void $('rateTickerInner').offsetWidth;
  $('rateTickerInner').style.animation = '';
}

// ── 뉴스 키워드 티커 ─────────────────────────────────────
async function loadTicker() {
  try {
    const queryObjs = state.companies.length
      ? state.companies.map(k => COMPANIES[k])
          .filter(Boolean)
          .map(c => ({ query: c.queries[0], source: c.source || 'google' }))
      : (CATEGORIES[state.category] || CATEGORIES.all).queries.map(q => ({
          query: q,
          source: (CATEGORIES[state.category] || CATEGORIES.all).source || 'google'
        }));

    const results = await Promise.allSettled(queryObjs.slice(0, 3).map(q => fetchRSS(q.query, q.source)));
    const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
    const keywords = extractKeywords(all);

    if (!keywords.length) {
      $('tickerInner').innerHTML = '<span class="ticker-loading">분석 데이터 부족</span>';
      return;
    }
    const kwHTML = keywords.map(k =>
      `<span class="ticker-kw" data-keyword="${esc(k.keyword)}">${esc(k.keyword)}<span class="kw-count">${k.count}</span></span>`
    ).join('');
    $('tickerInner').innerHTML = kwHTML + kwHTML;

    $('tickerInner').querySelectorAll('.ticker-kw').forEach(el => {
      el.addEventListener('click', () => {
        const kw = el.dataset.keyword;
        $('searchInput').value = kw;
        state.searchMode    = true;
        state.searchKeyword = kw;
        pushURLState();
        fetchAndRender();
      });
    });
  } catch {
    $('tickerInner').innerHTML = '<span class="ticker-loading">연결 오류</span>';
  }
}

// ── 뉴스 데이터 페치 (Google News RSS 직접) ──────────────
async function fetchNews() {
  let queryObjs;
  if (state.companies.length) {
    queryObjs = state.companies.flatMap(k => {
      const c = COMPANIES[k];
      if (!c) return [];
      const source = c.source || 'google';
      return c.queries.map(q => ({ query: q, source }));
    });
  } else {
    const cat = CATEGORIES[state.category] || CATEGORIES.all;
    const source = cat.source || 'google';
    queryObjs = cat.queries.map(q => ({ query: q, source }));
  }

  const results = await Promise.allSettled(queryObjs.map(q => fetchRSS(q.query, q.source)));
  const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  return sortByDate(dedupeByTitle(all)).slice(0, 50);
}

async function fetchSearchNews(keyword) {
  const baseQueryObjs = state.companies.length
    ? state.companies.map(k => {
        const c = COMPANIES[k];
        const base = (c?.queries[0] || '').split(' ')[0];
        return { query: `${base} ${keyword}`, source: c?.source || 'google' };
      })
    : [{ query: keyword, source: 'google' }];

  const results = await Promise.allSettled(baseQueryObjs.map(q => fetchRSS(q.query, q.source)));
  const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  return sortByDate(dedupeByTitle(all)).slice(0, 30);
}

async function fetchAndRender() {
  syncUI();
  pushURLState();

  const key = buildNewsKey();
  const cached = cacheGet(key);
  if (cached) {
    state.allArticles = cached;
    renderArticles(cached);
    return;
  }

  showSkeleton();
  try {
    const articles = state.searchMode && state.searchKeyword
      ? await fetchSearchNews(state.searchKeyword)
      : await fetchNews();
    state.allArticles = articles;
    cacheSet(key, articles, CONFIG.CACHE_TTL);
    renderArticles(articles);
    setLastUpdated();
  } catch (err) {
    showError(`뉴스를 불러오지 못했습니다: ${err.message}`);
  }
}

function clearSearch() {
  state.searchMode    = false;
  state.searchKeyword = '';
  $('searchInput').value = '';
  $('searchStatus').innerHTML = '';
  fetchAndRender();
  loadTicker();
}

// ── DART 기업개황 (CORS 프록시 직접 호출) ────────────────
function corpClsLabel(cls) {
  return ({ Y: '유가증권시장', K: '코스닥', N: '코넥스', E: '기타' })[cls] || cls;
}

function formatEstDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr || '-';
  return `${dateStr.slice(0,4)}.${dateStr.slice(4,6)}.${dateStr.slice(6,8)}`;
}

function renderCorpResult(c) {
  const stockBadge = c.stockCode
    ? `<span class="corp-badge corp-badge--stock">${esc(c.stockCode)}</span>` : '';
  const clsBadge = c.corpCls
    ? `<span class="corp-badge">${esc(corpClsLabel(c.corpCls))}</span>` : '';

  const field = (label, value) =>
    `<div class="corp-field"><span class="corp-field-label">${label}</span><span class="corp-field-value">${value}</span></div>`;
  const linkField = (label, url) => {
    if (!url) return field(label, '-');
    const display = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return field(label, `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(display)}</a>`);
  };

  return `
    <div class="corp-result-header">
      <div class="corp-result-names">
        <span class="corp-result-name-ko">${esc(c.name || '-')}</span>
        <span class="corp-result-name-en">${esc(c.nameEng || '')}</span>
      </div>
      <div class="corp-result-badges">${stockBadge}${clsBadge}</div>
    </div>
    <div class="corp-result-grid">
      ${field('대표자',         esc(c.ceo || '-'))}
      ${field('종목명',         esc(c.stockName || '-'))}
      ${field('설립일',         esc(formatEstDate(c.estDate)))}
      ${field('결산월',         c.accMonth ? `${esc(c.accMonth)}월` : '-')}
      ${field('업종코드',       esc(c.indutyCode || '-'))}
      ${field('전화번호',       esc(c.phone || '-'))}
      ${linkField('홈페이지',   c.homepage)}
      ${linkField('IR 홈페이지',c.irUrl)}
      ${field('법인등록번호',   esc(c.jurirNo || '-'))}
      ${field('사업자등록번호', esc(c.bizrNo || '-'))}
      ${field('주소',           esc(c.address || '-'))}
      ${field('팩스번호',       esc(c.fax || '-'))}
    </div>`;
}

function corpShowLoading(msg) {
  $('corpLoadingMsg').textContent = msg || '불러오는 중...';
  $('corpLoading').classList.remove('hidden');
  $('corpError').classList.add('hidden');
  $('corpSearchResults').classList.add('hidden');
  $('corpResult').classList.add('hidden');
  $('corpSearchBtn').disabled = true;
}

function corpHideLoading() {
  $('corpLoading').classList.add('hidden');
  $('corpSearchBtn').disabled = false;
}

function corpShowError(msg) {
  corpHideLoading();
  $('corpError').classList.remove('hidden');
  $('corpErrorMsg').textContent = msg;
}

async function fetchCorpDetail(corpCode) {
  const cacheKey = `dart_${corpCode}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    $('corpResult').innerHTML = renderCorpResult(cached);
    $('corpResult').classList.remove('hidden');
    corpHideLoading();
    return;
  }

  corpShowLoading('기업 정보를 불러오는 중...');
  try {
    const url = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${CONFIG.DART_API_KEY}&corp_code=${corpCode}`;
    const res  = await fetchCORS(url);
    const d    = await res.json();
    corpHideLoading();

    if (d.status !== '000') {
      corpShowError(d.message || 'DART 조회 실패');
      return;
    }
    const company = {
      name:       d.corp_name,     nameEng:   d.corp_name_eng,
      stockName:  d.stock_name,    stockCode: d.stock_code,
      ceo:        d.ceo_nm,        address:   d.adres,
      homepage:   d.hm_url,        irUrl:     d.ir_url,
      phone:      d.phn_no,        fax:       d.fax_no,
      indutyCode: d.induty_code,   jurirNo:   d.jurir_no,
      bizrNo:     d.bizr_no,       estDate:   d.est_dt,
      accMonth:   d.acc_mt,        corpCls:   d.corp_cls,
    };
    cacheSet(cacheKey, company, CONFIG.DART_TTL);
    $('corpResult').innerHTML = renderCorpResult(company);
    $('corpResult').classList.remove('hidden');
    $('corpSearchResults').classList.add('hidden');
  } catch {
    corpShowError('DART 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

async function searchCorpByName() {
  const q = $('corpNameInput').value.trim();
  if (!q) return;

  // 8자리 숫자면 corp_code 직접 조회
  if (/^\d{8}$/.test(q)) {
    fetchCorpDetail(q);
    return;
  }

  corpShowLoading('기업 검색 중...');
  try {
    // DART corpCode.xml(ZIP)은 정적 환경에서 파싱 불가 → 회사명으로 DART company.json 직접 시도
    // 확인 필요: DART는 이름 검색 API를 공식 제공하지 않음. 8자리 고유번호로 직접 조회 권장.
    corpHideLoading();
    $('corpSearchResults').innerHTML = `
      <p class="corp-no-result">
        회사명 검색은 DART 고유번호(8자리)가 필요합니다.<br>
        <a href="https://dart.fss.or.kr/dsac001/mainAll.do" target="_blank" rel="noopener"
           style="color:var(--ink-2);border-bottom:0.5px solid var(--rule-sub)">
          DART에서 고유번호 확인 →
        </a><br><br>
        고유번호를 입력란에 직접 입력하면 바로 조회됩니다.
      </p>`;
    $('corpSearchResults').classList.remove('hidden');
  } catch {
    corpShowError('검색에 실패했습니다.');
  }
}

// ── 이벤트 바인딩 ─────────────────────────────────────────
function bindEvents() {
  document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.addEventListener('click', () => switchMode(btn.dataset.mode)));

  $('corpSearchBtn').addEventListener('click', searchCorpByName);
  $('corpNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchCorpByName();
  });

  document.querySelectorAll('.cat-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      if (state.searchMode) clearSearch();
      state.category = btn.dataset.category;
      fetchAndRender();
      loadTicker();
    }));

  document.querySelectorAll('.co-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const key = btn.dataset.company;
      const idx = state.companies.indexOf(key);
      if (idx === -1) state.companies.push(key);
      else            state.companies.splice(idx, 1);
      fetchAndRender();
      loadTicker();
    }));

  document.querySelectorAll('.date-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      state.date = btn.dataset.date;
      syncUI();
      pushURLState();
      renderArticles(state.allArticles);
    }));

  const doSearch = () => {
    const kw = $('searchInput').value.trim();
    if (!kw) { if (state.searchMode) clearSearch(); return; }
    state.searchMode    = true;
    state.searchKeyword = kw;
    fetchAndRender();
  };
  $('searchBtn').addEventListener('click', doSearch);
  $('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter')  doSearch();
    if (e.key === 'Escape') clearSearch();
  });

  $('shareBtn').addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast('링크가 복사되었습니다.'));
    } else {
      const ta = Object.assign(document.createElement('textarea'), {
        value: url, style: 'position:fixed;opacity:0'
      });
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('링크가 복사되었습니다.');
    }
  });

  $('refreshBtn').addEventListener('click', () => {
    cache.clear();
    $('refreshBtn').classList.add('spinning');
    Promise.all([fetchAndRender(), loadTicker(), loadRateTicker()])
      .finally(() => $('refreshBtn').classList.remove('spinning'));
  });
}

// ── 자동 갱신 ─────────────────────────────────────────────
function startAutoRefresh() {
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = setInterval(() => {
    cache.clear();
    fetchAndRender();
    loadTicker();
    loadRateTicker();
  }, 5 * 60 * 1000);
}

// ── 백그라운드 프리페치 ───────────────────────────────────
async function prefetchCategories() {
  const order = ['all', 'us-market', 'kr-market', 'bigtech'];
  for (const cat of order) {
    const key = `news_${cat}_`;
    if (cacheGet(key)) continue;
    const queries = CATEGORIES[cat]?.queries || [];
    const source  = CATEGORIES[cat]?.source || 'google';
    try {
      const results = await Promise.allSettled(queries.map(q => fetchRSS(q, source)));
      const all = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
      if (all.length) {
        cacheSet(key, sortByDate(dedupeByTitle(all)).slice(0, 50), CONFIG.CACHE_TTL);
      }
    } catch { /* silent */ }
    await new Promise(r => setTimeout(r, 300));
  }
}

// ── 초기화 ────────────────────────────────────────────────
function init() {
  loadFromURL();
  syncUI();
  bindEvents();
  fetchAndRender();
  loadTicker();
  loadRateTicker();
  startAutoRefresh();
  setTimeout(prefetchCategories, 1500);
}

document.addEventListener('DOMContentLoaded', init);
