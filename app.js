'use strict';

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

// 미국 / 한국 종목 분류
const US_COMPANIES  = ['apple','google','meta','amazon','microsoft','nvidia','tesla'];
const KR_COMPANIES  = ['samsung','skhynix','naver','kakao','hyundai'];
const KR_CATEGORIES = ['kr-market'];
const US_CATEGORIES = ['us-market','bigtech','semiconductor','bond-fx','commodity'];

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
  const now       = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo   = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // 간밤: 전날 오후 4시(미국 장 시작) ~ 오전 9시(KST) 범위로 근사
  const overnightStart = new Date();
  overnightStart.setDate(overnightStart.getDate() - 1);
  overnightStart.setHours(16, 0, 0, 0);

  return articles.filter(a => {
    if (state.date === 'overnight') return new Date(a.pubDate) >= overnightStart;
    if (state.date === 'today')     return new Date(a.pubDate) >= todayStart;
    if (state.date === 'week')      return new Date(a.pubDate) >= weekAgo;
    return true;
  });
}

// ── 기사 분류 ─────────────────────────────────────────────
function splitArticles(articles) {
  const hasKrFilter = state.companies.some(c => KR_COMPANIES.includes(c));
  const hasUsFilter = state.companies.some(c => US_COMPANIES.includes(c));
  const isKrCat = KR_CATEGORIES.includes(state.category);
  const isUsCat = US_CATEGORIES.includes(state.category);

  // 특정 카테고리 또는 종목 필터 적용 시 해당 섹션에만 배분
  if (isKrCat || (hasKrFilter && !hasUsFilter)) {
    return { us: [], kr: articles };
  }
  if (isUsCat || (hasUsFilter && !hasKrFilter)) {
    return { us: articles, kr: [] };
  }

  // 전체(all): 키워드 기반 분류 시도, 나머지는 us로
  const krKeywords = ['코스피','코스닥','삼성전자','SK하이닉스','네이버','카카오','현대차','한국','코스','원화'];
  const kr = articles.filter(a =>
    krKeywords.some(kw => (a.title || '').includes(kw))
  );
  const krSet = new Set(kr);
  const us = articles.filter(a => !krSet.has(a));

  return { us, kr };
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

  // 상태 헤더
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
    $('emptyMessage').textContent = state.date !== 'overnight'
      ? '선택한 기간에 뉴스가 없습니다. 기간을 변경해 보세요.'
      : '간밤 뉴스가 없습니다.';
    return;
  }

  $('emptyState').classList.add('hidden');
  $('contentWrap').classList.remove('hidden');

  const { us, kr } = splitArticles(filtered);

  // 미국 증시 섹션
  const usHeroes = us.slice(0, 3);
  const usRest   = us.slice(3);
  $('heroGrid').innerHTML    = usHeroes.map((a, i) => renderHeroCard(a, i === 0)).join('');
  $('articleList').innerHTML = usRest.length ? usRest.map(a => renderArticleRow(a)).join('') : '';
  $('listDivider').classList.toggle('hidden', usRest.length === 0);
  $('usMarketSection').classList.toggle('hidden', us.length === 0);

  // 한국 증시 섹션
  $('krArticleList').innerHTML = kr.length
    ? kr.map(a => renderArticleRow(a)).join('')
    : '';
  $('krMarketSection').classList.toggle('hidden', kr.length === 0);

  // 간밤 시각 표시
  const overnightStart = new Date();
  overnightStart.setDate(overnightStart.getDate() - 1);
  overnightStart.setHours(16, 0, 0, 0);
  const hh = String(overnightStart.getHours()).padStart(2, '0');
  const mm = String(overnightStart.getMinutes()).padStart(2, '0');
  const usTime = $('usMarketTime');
  if (usTime) usTime.textContent = `${overnightStart.getMonth()+1}/${overnightStart.getDate()} ${hh}:${mm} KST 이후`;
}

function setLastUpdated() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  $('lastUpdated').textContent = `${hh}:${mm} 갱신`;
}

// ── DART 기업개황 ────────────────────────────────────────
function corpClsLabel(cls) {
  const map = { Y: '유가증권시장', K: '코스닥', N: '코넥스', E: '기타' };
  return map[cls] || cls;
}

function formatEstDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr || '-';
  return `${dateStr.slice(0,4)}.${dateStr.slice(4,6)}.${dateStr.slice(6,8)}`;
}

function renderCorpResult(c) {
  const stockBadge = c.stockCode
    ? `<span class="corp-badge corp-badge--stock">${esc(c.stockCode)}</span>`
    : '';
  const clsBadge = c.corpCls
    ? `<span class="corp-badge">${esc(corpClsLabel(c.corpCls))}</span>`
    : '';

  const field = (label, value) => `
    <div class="corp-field">
      <span class="corp-field-label">${label}</span>
      <span class="corp-field-value">${value}</span>
    </div>`;

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
      <div class="corp-result-badges">
        ${stockBadge}${clsBadge}
      </div>
    </div>
    <div class="corp-result-grid">
      ${field('대표자',          esc(c.ceo || '-'))}
      ${field('종목명',          esc(c.stockName || '-'))}
      ${field('설립일',          esc(formatEstDate(c.estDate)))}
      ${field('결산월',          c.accMonth ? `${esc(c.accMonth)}월` : '-')}
      ${field('업종코드',        esc(c.indutyCode || '-'))}
      ${field('전화번호',        esc(c.phone || '-'))}
      ${linkField('홈페이지',    c.homepage)}
      ${linkField('IR 홈페이지', c.irUrl)}
      ${field('법인등록번호',    esc(c.jurirNo || '-'))}
      ${field('사업자등록번호',  esc(c.bizrNo || '-'))}
      ${field('주소', esc(c.address || '-'))}
      ${field('팩스번호',        esc(c.fax || '-'))}
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
  corpShowLoading('기업 정보를 불러오는 중...');
  try {
    const res  = await fetch(`/api/company?corp_code=${encodeURIComponent(corpCode)}`);
    const data = await res.json();
    corpHideLoading();
    if (!data.success) { corpShowError(data.error || '조회에 실패했습니다.'); return; }
    $('corpResult').innerHTML = renderCorpResult(data.company);
    $('corpResult').classList.remove('hidden');
    $('corpSearchResults').classList.add('hidden');
  } catch {
    corpShowError('서버 연결에 실패했습니다.');
  }
}

async function searchCorpByName() {
  const q = $('corpNameInput').value.trim();
  if (!q) return;
  corpShowLoading('기업 목록을 불러오는 중...');
  try {
    const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    corpHideLoading();
    if (!data.success) { corpShowError(data.error || '검색에 실패했습니다.'); return; }

    const results = data.results || [];
    if (results.length === 0) {
      $('corpSearchResults').innerHTML = `<p class="corp-no-result">"${esc(q)}"에 해당하는 기업이 없습니다.</p>`;
      $('corpSearchResults').classList.remove('hidden');
      return;
    }
    if (results.length === 1) {
      fetchCorpDetail(results[0].corp_code);
      return;
    }

    const rows = results.map(r => `
      <div class="corp-result-row" data-code="${esc(r.corp_code)}">
        <span class="crr-name">${esc(r.corp_name)}</span>
        <span class="crr-code">${esc(r.corp_code)}</span>
        <span class="crr-stock">${r.stock_code ? esc(r.stock_code) : ''}</span>
      </div>`).join('');

    $('corpSearchResults').innerHTML =
      `<div class="corp-result-count">${results.length}개 기업 검색됨</div>${rows}`;
    $('corpSearchResults').classList.remove('hidden');

    $('corpSearchResults').querySelectorAll('.corp-result-row').forEach(row => {
      row.addEventListener('click', () => fetchCorpDetail(row.dataset.code));
    });
  } catch {
    corpShowError('서버 연결에 실패했습니다.');
  }
}

// ── 환율 티커 ────────────────────────────────────────────
async function loadRateTicker() {
  try {
    const res  = await fetch('/api/exchange');
    const data = await res.json();
    if (!data.success || !data.rates.length) {
      $('rateTickerInner').innerHTML = '<span class="rate-ticker-loading">환율 정보 없음</span>';
      return;
    }
    const itemHTML = data.rates.map(r => {
      const code = r.code === 'JPY(100)' ? 'JPY¥100' : r.code;
      return `<span class="rate-item">
        <span class="ri-code">${esc(code)}</span>
        <span class="ri-value">${esc(r.rate)}</span>
        <span class="ri-name">${esc(r.name)}</span>
      </span>`;
    }).join('');
    $('rateTickerInner').innerHTML = itemHTML + itemHTML;
    $('rateTickerInner').style.animation = 'none';
    void $('rateTickerInner').offsetWidth;
    $('rateTickerInner').style.animation = '';
  } catch {
    $('rateTickerInner').innerHTML = '<span class="rate-ticker-loading">환율 연결 오류</span>';
  }
}

// ── 뉴스 키워드 티커 ─────────────────────────────────────
async function loadTicker() {
  const companiesParam = state.companies.join(',');
  try {
    const res  = await fetch(`/api/trending?companies=${encodeURIComponent(companiesParam)}`);
    const data = await res.json();
    if (!data.success || data.keywords.length === 0) {
      $('tickerInner').innerHTML = '<span class="ticker-loading">분석 데이터 부족</span>';
      return;
    }
    const kwHTML = data.keywords.map(k =>
      `<span class="ticker-kw" data-keyword="${esc(k.keyword)}">${esc(k.keyword)}<span class="kw-count">${k.count}</span></span>`
    ).join('');
    $('tickerInner').innerHTML = kwHTML + kwHTML;
    $('tickerInner').querySelectorAll('.ticker-kw').forEach(el => {
      el.addEventListener('click', () => {
        const kw = el.dataset.keyword;
        $('searchInput').value = kw;
        state.searchMode = true;
        state.searchKeyword = kw;
        pushURLState();
        fetchAndRender();
      });
    });
  } catch {
    $('tickerInner').innerHTML = '<span class="ticker-loading">연결 오류</span>';
  }
}

// ── 데이터 페치 ───────────────────────────────────────────
async function fetchAndRender() {
  showLoading();
  syncUI();
  pushURLState();

  const companiesParam = state.companies.join(',');

  try {
    let url;
    if (state.searchMode && state.searchKeyword) {
      url = `/api/search?q=${encodeURIComponent(state.searchKeyword)}&companies=${encodeURIComponent(companiesParam)}`;
    } else {
      url = `/api/news?category=${state.category}&companies=${encodeURIComponent(companiesParam)}`;
    }
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '오류 발생');
    state.allArticles = data.articles;
    renderArticles(state.allArticles);
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

// ── 이벤트 ───────────────────────────────────────────────
function bindEvents() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  $('corpSearchBtn').addEventListener('click', searchCorpByName);
  $('corpNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchCorpByName();
  });

  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.searchMode) clearSearch();
      state.category = btn.dataset.category;
      fetchAndRender();
    });
  });

  document.querySelectorAll('.co-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.company;
      const idx = state.companies.indexOf(key);
      if (idx === -1) {
        state.companies.push(key);
      } else {
        state.companies.splice(idx, 1);
      }
      fetchAndRender();
      loadTicker();
    });
  });

  document.querySelectorAll('.date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.date = btn.dataset.date;
      syncUI();
      pushURLState();
      renderArticles(state.allArticles);
    });
  });

  const doSearch = () => {
    const kw = $('searchInput').value.trim();
    if (!kw) { if (state.searchMode) clearSearch(); return; }
    state.searchMode = true;
    state.searchKeyword = kw;
    fetchAndRender();
  };
  $('searchBtn').addEventListener('click', doSearch);
  $('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
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
    $('refreshBtn').classList.add('spinning');
    Promise.all([fetchAndRender(), loadTicker(), loadRateTicker()])
      .finally(() => $('refreshBtn').classList.remove('spinning'));
  });
}

// ── 자동 갱신 ─────────────────────────────────────────────
function startAutoRefresh() {
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);
  state.autoRefreshTimer = setInterval(() => {
    fetchAndRender();
    loadTicker();
  }, 5 * 60 * 1000);
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
}

document.addEventListener('DOMContentLoaded', init);
