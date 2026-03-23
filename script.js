/* ═══════════════════════════════════════════════════════════════════
   TRADEX PRO — script.js
   Full dashboard logic: auth guard, navigation, TradingView chart,
   explore markets, leaderboard engine, static news, community, AI
═══════════════════════════════════════════════════════════════════ */

/* ── Firebase init ── */
firebase.initializeApp(window.TRADEX_FIREBASE_CONFIG);
var auth = firebase.auth();

/* ══════════════════════════════════════
   AUTH GUARD — check login on load
══════════════════════════════════════ */
var currentUser = null;

auth.onAuthStateChanged(function(user) {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  initDashboard(user);
});

function initDashboard(user) {
  var name = user.displayName || user.email.split('@')[0] || 'Trader';
  var initials = name.substring(0,2).toUpperCase();

  document.getElementById('tnUserName').textContent = name;
  document.getElementById('tnAvatar').textContent   = initials;

  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('homeGreeting').textContent  = greeting + ', ' + name + ' 👋';
  document.getElementById('aiGreeting').textContent    = greeting + ', ' + name;

  // Hide loader, show dash
  document.getElementById('pageLoader').style.display = 'none';
  document.getElementById('dashRoot').style.display   = 'flex';

  // Boot all modules
  initMarketData();
  initExplore();
  initNews();
  lbRender();
  renderTopTraders();
  updateChallengeCount();
  loadChart(); // prime the chart
}

function confirmSignOut() {
  if (confirm('Sign out of TradeX Pro?')) {
    auth.signOut().then(function() { window.location.href = 'index.html'; });
  }
}

/* ══════════════════════════════════════
   NAVIGATION
══════════════════════════════════════ */
var currentPage = 'home';

function navTo(page, triggerEl) {
  if (page === currentPage) return;
  currentPage = page;

  // Hide all pages
  document.querySelectorAll('.dash-page').forEach(function(p){ p.classList.remove('on'); });
  var target = document.getElementById('page-' + page);
  if (target) target.classList.add('on');

  // Update top nav
  document.querySelectorAll('.tn-btn').forEach(function(b){ b.classList.toggle('on', b.dataset.page === page); });
  // Update bottom nav
  document.querySelectorAll('.bn-btn').forEach(function(b){ b.classList.toggle('on', b.dataset.page === page); });

  // Lazy-load chart when trade page is visited
  if (page === 'trade') loadChart();
  if (page === 'explore') filterExplore('');
}

/* ══════════════════════════════════════
   COMMUNITY SUB-NAV
══════════════════════════════════════ */
function commNav(btn) {
  var target = btn.dataset.cs;
  document.querySelectorAll('.comm-sub-btn').forEach(function(b){ b.classList.toggle('on', b.dataset.cs === target); });
  document.querySelectorAll('.comm-section').forEach(function(s){ s.classList.toggle('on', s.id === 'cs-' + target); });
  if (target === 'toptraders') renderTopTraders();
}

/* ══════════════════════════════════════
   MARKET DATA (static realistic data,
   no broken external API calls)
══════════════════════════════════════ */
var MARKET_DATA = [
  { sym:'BTCUSD',  name:'Bitcoin',        cat:'Crypto',      price:68420,    chg:+1.82, icon:'₿',   color:'#f5b731' },
  { sym:'ETHUSD',  name:'Ethereum',       cat:'Crypto',      price:3512,     chg:+0.97, icon:'Ξ',   color:'#8ca8ff' },
  { sym:'EURUSD',  name:'Euro / Dollar',  cat:'Forex',       price:1.0842,   chg:-0.08, icon:'€',   color:'#5b78ff' },
  { sym:'GBPUSD',  name:'Pound / Dollar', cat:'Forex',       price:1.2734,   chg:+0.14, icon:'£',   color:'#4de8ab' },
  { sym:'USDJPY',  name:'Dollar / Yen',   cat:'Forex',       price:149.62,   chg:+0.31, icon:'¥',   color:'#fb923c' },
  { sym:'XAUUSD',  name:'Gold Spot',      cat:'Commodities', price:2318.40,  chg:+0.54, icon:'Au',  color:'#f5c842' },
  { sym:'XAGUSD',  name:'Silver Spot',    cat:'Commodities', price:27.84,    chg:+0.72, icon:'Ag',  color:'#b8c4d8' },
  { sym:'USOIL',   name:'WTI Crude Oil',  cat:'Commodities', price:82.14,    chg:-0.38, icon:'🛢',  color:'#fb923c' },
  { sym:'SPX',     name:'S&P 500',        cat:'Indices',     price:5284.20,  chg:+0.43, icon:'US',  color:'#4de8ab' },
  { sym:'NDX',     name:'Nasdaq 100',     cat:'Indices',     price:18642,    chg:+0.61, icon:'NQ',  color:'#38bdf8' },
  { sym:'NIFTY',   name:'Nifty 50',       cat:'Indices',     price:22519,    chg:+0.28, icon:'IN',  color:'#f97316' },
  { sym:'AAPL',    name:'Apple Inc.',     cat:'Stocks',      price:186.40,   chg:+1.12, icon:'🍎',  color:'#b8c4d8' },
  { sym:'TSLA',    name:'Tesla Inc.',     cat:'Stocks',      price:171.20,   chg:-2.14, icon:'T',   color:'#e05c00' },
  { sym:'GOOGL',   name:'Alphabet Inc.',  cat:'Stocks',      price:171.90,   chg:+0.88, icon:'G',   color:'#4285f4' },
  { sym:'BNBUSD',  name:'BNB',           cat:'Crypto',      price:594,      chg:+0.42, icon:'B',   color:'#f5b731' },
  { sym:'SOLUSD',  name:'Solana',         cat:'Crypto',      price:172,      chg:+3.21, icon:'S◎',  color:'#9b6bff' },
];

var AV_COLORS = ['#1a3a8f','#1a5a3c','#5a1e72','#7a3a14','#14527a','#3a1472','#145a5a','#721438'];
function avColor(n) { var h=0; for(var i=0;i<n.length;i++) h=(h*37+n.charCodeAt(i))>>>0; return AV_COLORS[h%AV_COLORS.length]; }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtPrice(v,sym) {
  if(sym==='EURUSD'||sym==='GBPUSD') return v.toFixed(4);
  if(v>1000) return v.toLocaleString(undefined,{maximumFractionDigits:0});
  if(v>10)   return v.toFixed(2);
  return v.toFixed(4);
}

function initMarketData() {
  // Stats cards
  var btc   = MARKET_DATA.find(function(d){ return d.sym==='BTCUSD'; });
  var eur   = MARKET_DATA.find(function(d){ return d.sym==='EURUSD'; });
  var gold  = MARKET_DATA.find(function(d){ return d.sym==='XAUUSD'; });
  var nifty = MARKET_DATA.find(function(d){ return d.sym==='NIFTY'; });

  function fillStat(valId, chgId, item) {
    document.getElementById(valId).textContent = fmtPrice(item.price, item.sym);
    var el = document.getElementById(chgId);
    el.textContent = (item.chg>=0?'+':'')+item.chg.toFixed(2)+'%';
    el.className = 'sc-chg ' + (item.chg>=0?'up':'dn');
  }
  fillStat('stat-btc','stat-btc-chg', btc);
  fillStat('stat-eur','stat-eur-chg', eur);
  fillStat('stat-gold','stat-gold-chg', gold);
  fillStat('stat-nifty','stat-nifty-chg', nifty);

  // Market list (home)
  var list = document.getElementById('marketList');
  var topItems = MARKET_DATA.slice(0,8);
  list.innerHTML = topItems.map(function(d){
    var chgCls = d.chg>=0?'up':'dn';
    return '<div class="market-item" onclick="openSymbolInChart(\''+d.sym+'\')">'
      +'<div class="mi-icon" style="background:'+d.color+'22">'
        +'<span style="font-size:14px;font-weight:800;color:'+d.color+'">'+esc(d.icon)+'</span>'
      +'</div>'
      +'<div class="mi-info">'
        +'<div class="mi-name">'+esc(d.sym)+'</div>'
        +'<div class="mi-sub">'+esc(d.name)+'</div>'
      +'</div>'
      +'<div>'
        +'<div class="mi-price">'+fmtPrice(d.price,d.sym)+'</div>'
        +'<div class="mi-chg '+chgCls+'">'+(d.chg>=0?'+':'')+d.chg.toFixed(2)+'%</div>'
      +'</div>'
    +'</div>';
  }).join('');
}

function openSymbolInChart(sym) {
  document.getElementById('tvSymbol').value = sym;
  navTo('trade');
  setTimeout(loadChart, 200);
}

/* ══════════════════════════════════════
   EXPLORE PAGE
══════════════════════════════════════ */
var exploreCat = 'All';
var exploreQuery = '';

function initExplore() { renderExploreGrid(); }

function exploreChip(btn) {
  exploreCat = btn.dataset.cat;
  document.querySelectorAll('#exploreChips .chip').forEach(function(c){ c.classList.toggle('on', c.dataset.cat === exploreCat); });
  renderExploreGrid();
}

function filterExplore(q) {
  exploreQuery = q.toLowerCase().trim();
  renderExploreGrid();
}

function renderExploreGrid() {
  var filtered = MARKET_DATA.filter(function(d){
    var catOk = exploreCat==='All' || d.cat===exploreCat;
    var qOk   = !exploreQuery || d.sym.toLowerCase().includes(exploreQuery) || d.name.toLowerCase().includes(exploreQuery);
    return catOk && qOk;
  });
  var g = document.getElementById('exploreGrid');
  if (!filtered.length) {
    g.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--t3);font-size:13px;">No results found.</div>';
    return;
  }
  var barColors = { Crypto:'#f5b731', Forex:'#5b78ff', Stocks:'#00c87a', Commodities:'#f5c842', Indices:'#38bdf8' };
  g.innerHTML = filtered.map(function(d){
    var chgCls = d.chg>=0?'up':'dn';
    var barColor = barColors[d.cat] || '#5b78ff';
    return '<div class="exp-card" onclick="openSymbolInChart(\''+d.sym+'\')">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
        +'<div class="exp-card-sym">'+esc(d.sym)+'</div>'
        +'<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:'+barColor+'22;color:'+barColor+';border:1px solid '+barColor+'33">'+esc(d.cat)+'</span>'
      +'</div>'
      +'<div class="exp-card-name">'+esc(d.name)+'</div>'
      +'<div class="exp-card-price">'+fmtPrice(d.price,d.sym)+'</div>'
      +'<div class="exp-card-chg '+chgCls+'">'+(d.chg>=0?'▲ +':'▼ ')+Math.abs(d.chg).toFixed(2)+'%</div>'
      +'<div class="exp-card-bar" style="background:'+barColor+'44"></div>'
    +'</div>';
  }).join('');
}

/* ══════════════════════════════════════
   TRADINGVIEW CHART
══════════════════════════════════════ */
var tvCurrentSymbol  = 'BTCUSD';
var tvCurrentTF      = 'D';
var tvWidgetLoaded   = false;

var TV_INDICATORS = [
  { id:'RSI@tv-basicstudies' },
  { id:'MACD@tv-basicstudies' },
  { id:'BB@tv-basicstudies' }
];
var showIndicators = true;

function loadChart() {
  var sym = document.getElementById('tvSymbol').value.trim().toUpperCase() || 'BTCUSD';
  tvCurrentSymbol = sym;

  var container = document.getElementById('tv-chart-container');
  container.innerHTML = '';

  var studies = showIndicators ? 'RSI,MACD,BB' : '';

  // TradingView Advanced Chart widget
  var div = document.createElement('div');
  div.className = 'tradingview-widget-container';
  div.style.height = '100%';

  var wDiv = document.createElement('div');
  wDiv.className = 'tradingview-widget-container__widget';
  wDiv.style.height = '100%';
  div.appendChild(wDiv);

  container.appendChild(div);

  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.src  = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.innerHTML = JSON.stringify({
    autosize:        true,
    symbol:          'BITSTAMP:' + sym,
    interval:        tvCurrentTF,
    timezone:        'Etc/UTC',
    theme:           'dark',
    style:           '1',
    locale:          'en',
    backgroundColor: '#0f1020',
    gridColor:       'rgba(91,120,255,0.06)',
    hide_top_toolbar: false,
    hide_legend:     false,
    save_image:      false,
    studies:         showIndicators
      ? ['RSI@tv-basicstudies','MACD@tv-basicstudies','BB@tv-basicstudies']
      : [],
    container_id:    'tv-chart-container'
  });

  div.appendChild(script);
  tvWidgetLoaded = true;
}

function setTF(btn, tf) {
  tvCurrentTF = tf;
  document.querySelectorAll('.tf-btn').forEach(function(b){ b.classList.toggle('on', b.dataset.tf===tf); });
  loadChart();
}

function toggleIndicators() {
  showIndicators = !showIndicators;
  var btn = document.querySelector('.tv-ind-btn');
  btn.textContent = showIndicators ? '⊕ Indicators' : '○ Indicators';
  btn.style.color = showIndicators ? 'var(--teal)' : 'var(--t3)';
  btn.style.borderColor = showIndicators ? 'rgba(0,212,168,0.25)' : 'var(--b0)';
  loadChart();
}

// Enter key on symbol input
document.getElementById('tvSymbol').addEventListener('keydown', function(e){
  if(e.key==='Enter') loadChart();
});

/* ══════════════════════════════════════
   LEADERBOARD ENGINE
══════════════════════════════════════ */
var LB_KEY  = 'txpro_lb_v3';
var lbData  = [];
var lbSort  = 'score';

function lbLoad() {
  try { var r=sessionStorage.getItem(LB_KEY); if(r) lbData=JSON.parse(r); } catch(e){}
}
function lbSave() {
  try { sessionStorage.setItem(LB_KEY, JSON.stringify(lbData)); } catch(e){}
}

function lbComputeScores() {
  if(!lbData.length) return;
  var mxP=Math.max.apply(null,lbData.map(function(d){return d.profit;}));
  var mxW=Math.max.apply(null,lbData.map(function(d){return d.winRate;}));
  var mxT=Math.max.apply(null,lbData.map(function(d){return d.trades;}));
  var mxC=Math.max.apply(null,lbData.map(function(d){return d.consist;}));
  lbData.forEach(function(d){
    d.score=Math.round(((mxP?d.profit/mxP:0)*.4+(mxW?d.winRate/mxW:0)*.3+(mxT?d.trades/mxT:0)*.15+(mxC?d.consist/mxC:0)*.15)*1000);
  });
}

var LB_KEY_MAP={score:'score',profit:'profit',winrate:'winRate',trades:'trades',consist:'consist'};
function lbSorted(){
  var k=LB_KEY_MAP[lbSort]||'score';
  return lbData.slice().sort(function(a,b){return b[k]-a[k];});
}

function lbSetSort(key, btn) {
  lbSort=key;
  document.querySelectorAll('#lbSortTabs .sort-tab').forEach(function(t){t.classList.toggle('on',t.dataset.k===key);});
  lbRender();
}

function medalCls(r){return r===1?'g':r===2?'s':r===3?'b':'n';}
function medalIcon(r){return r===1?'🥇':r===2?'🥈':r===3?'🥉':r;}
function rowRkCls(r){return r===1?'lb-row rk1':r===2?'lb-row rk2':r===3?'lb-row rk3':'lb-row';}
function avInit(n){var p=n.trim().split(/[\s_\-\.]+/);return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():n.substring(0,2).toUpperCase();}
function conColorFn(v){return v>=80?'var(--teal)':v>=55?'var(--blue)':'rgba(255,255,255,0.2)';}

function lbRender() {
  lbLoad();
  lbComputeScores();
  var sorted=lbSorted();
  var wrap=document.getElementById('lbRows');
  var emp=document.getElementById('lbEmpty');
  wrap.innerHTML='';
  if(!sorted.length){emp.style.display='block';return;}
  emp.style.display='none';

  sorted.forEach(function(d,idx){
    var rank=idx+1;
    var row=document.createElement('div');
    row.className=rowRkCls(rank);
    row.style.animationDelay=(idx*.04)+'s';
    var profCls=d.profit>=0?'up':'dn';
    row.innerHTML=
      '<div class="rank-b '+medalCls(rank)+'">'+medalIcon(rank)+'</div>'
      +'<div class="lb-user">'
        +'<div class="lb-av" style="background:'+avColor(d.name)+'">'+esc(avInit(d.name))+'</div>'
        +'<span class="lb-name">'+esc(d.name)+'</span>'
      +'</div>'
      +'<div class="lb-val '+profCls+'">'+(d.profit>=0?'+':'')+d.profit.toFixed(1)+'%</div>'
      +'<div class="lb-val mid">'+d.winRate.toFixed(0)+'%</div>'
      +'<div class="lb-val mid">'+d.trades+'</div>'
      +'<div class="con-wrap">'
        +'<span style="font-family:var(--f-m);font-size:11px;color:var(--t2)">'+d.consist+'</span>'
        +'<div class="con-bar-bg"><div class="con-bar" style="width:'+d.consist+'%;background:'+conColorFn(d.consist)+'"></div></div>'
      +'</div>';
    wrap.appendChild(row);
  });
}

function lbAddEntry() {
  var name    = document.getElementById('lb-name').value.trim();
  var profit  = parseFloat(document.getElementById('lb-profit').value);
  var winRate = parseFloat(document.getElementById('lb-wr').value);
  var trades  = parseInt(document.getElementById('lb-trades').value,10);
  var consist = parseFloat(document.getElementById('lb-consist').value);
  var errEl   = document.getElementById('lb-err');
  errEl.textContent='';

  if(!name||name.length<2)                    return errEl.textContent='Username must be at least 2 chars.';
  if(isNaN(profit))                           return errEl.textContent='Enter a valid profit value.';
  if(isNaN(winRate)||winRate<0||winRate>100)  return errEl.textContent='Win rate must be 0–100.';
  if(isNaN(trades)||trades<1)                 return errEl.textContent='Trades must be at least 1.';
  if(isNaN(consist)||consist<0||consist>100)  return errEl.textContent='Consistency must be 0–100.';

  lbLoad();
  var idx=lbData.findIndex(function(r){return r.name.toLowerCase()===name.toLowerCase();});
  var entry={name:name,profit:profit,winRate:winRate,trades:trades,consist:consist,score:0};
  if(idx>=0) lbData[idx]=entry; else lbData.push(entry);
  lbSave();
  lbRender();
  renderTopTraders();

  ['lb-name','lb-profit','lb-wr','lb-trades','lb-consist'].forEach(function(id){document.getElementById(id).value='';});
  showToast('✓ '+name+' added to leaderboard');
}

/* ══════════════════════════════════════
   TOP TRADERS (derived from leaderboard)
══════════════════════════════════════ */
function renderTopTraders() {
  lbLoad();
  lbComputeScores();
  var sorted=lbData.slice().sort(function(a,b){return b.score-a.score;}).slice(0,10);
  var list=document.getElementById('topTradersList');
  var empty=document.getElementById('topTradersEmpty');

  if(!sorted.length){
    list.innerHTML='';
    empty.style.display='block';
    return;
  }
  empty.style.display='none';
  list.innerHTML=sorted.map(function(d,i){
    var rank=i+1;
    var rankIcon=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'#'+rank;
    var isPro=d.score>=600;
    return '<div class="trader-card">'
      +'<div class="tc-rank">'+rankIcon+'</div>'
      +'<div class="tc-av" style="background:'+avColor(d.name)+'">'+esc(avInit(d.name))+'</div>'
      +'<div class="tc-info">'
        +'<div class="tc-name">'+esc(d.name)+(isPro?'<span class="tc-badge">✓ PRO</span>':'')+'</div>'
        +'<div class="tc-meta">Score: '+d.score+' &bull; '+d.trades+' trades &bull; '+d.winRate.toFixed(0)+'% WR</div>'
      +'</div>'
      +'<div class="tc-pnl">'+(d.profit>=0?'+':'')+d.profit.toFixed(1)+'%</div>'
      +'<button class="follow-btn" onclick="toggleFollow(this)">Follow</button>'
    +'</div>';
  }).join('');
}

function toggleFollow(btn) {
  btn.classList.toggle('on');
  btn.textContent = btn.classList.contains('on') ? 'Following' : 'Follow';
}

/* ══════════════════════════════════════
   STATIC NEWS DATA (no external API)
══════════════════════════════════════ */
var NEWS_DATA = [
  { cat:'Economy',     tag:'tag-macro',   src:'Reuters',      time:'12m ago',  headline:'Fed holds rates steady as inflation shows signs of cooling', summary:'The Federal Reserve kept interest rates unchanged, signaling patience as PCE inflation edges toward its 2% target. Markets priced in two cuts for 2024.' },
  { cat:'Crypto',      tag:'tag-crypto',  src:'CoinDesk',     time:'28m ago',  headline:'Bitcoin ETF inflows hit $620M in single session — institutional demand surge', summary:'Spot BTC ETFs recorded their strongest single-day inflow since launch, pushing AUM above $52 billion as BlackRock led with $340M in new capital.' },
  { cat:'Forex',       tag:'tag-forex',   src:'Bloomberg',    time:'44m ago',  headline:'EUR/USD slips below 1.085 as ECB rate-cut signals strengthen', summary:'The euro weakened against the dollar after ECB President Lagarde hinted at a June rate reduction, diverging from the Fed\'s wait-and-see stance.' },
  { cat:'Commodities', tag:'tag-comm',    src:'FT',           time:'1h ago',   headline:'Gold retreats from record high as DXY strengthens on jobs data', summary:'XAU/USD pulled back to $2,318 after strong US non-farm payrolls data lifted the dollar index, reducing demand for the safe-haven metal.' },
  { cat:'Stocks',      tag:'tag-stocks',  src:'CNBC',         time:'1h 15m',   headline:'S&P 500 closes above 5,280 — tech leads rally on earnings beat', summary:'The index added 0.43% as Microsoft and Alphabet reported Q1 profits ahead of estimates, boosting the Nasdaq Composite to a two-month high.' },
  { cat:'Economy',     tag:'tag-macro',   src:'Nikkei',       time:'2h ago',   headline:'Bank of Japan signals further tightening as yen hits 150 vs USD', summary:'BOJ Governor Ueda indicated the central bank could raise rates again if wages continue rising, providing the strongest hawkish signal in months.' },
  { cat:'Forex',       tag:'tag-forex',   src:'MarketWatch',  time:'2h 30m',   headline:'GBP/USD tests 1.275 resistance after UK CPI beats estimates', summary:'Sterling advanced after UK consumer prices rose 3.2% YoY, above the 3.1% forecast, reducing expectations for a near-term Bank of England rate cut.' },
  { cat:'Crypto',      tag:'tag-crypto',  src:'The Block',    time:'3h ago',   headline:'Ethereum gas fees drop to 3-year low amid layer-2 adoption boom', summary:'Average transaction costs on Ethereum mainnet fell below $1 as Base, Arbitrum and Optimism collectively processed more transactions than the base layer.' },
  { cat:'Stocks',      tag:'tag-stocks',  src:'Barrons',      time:'3h 20m',   headline:'Nifty 50 breaks 22,500 resistance on strong FII inflows', summary:'Indian equities rallied 0.28% as foreign institutional investors bought ₹3,200 crore worth of stocks, the highest net purchase in six weeks.' },
  { cat:'Commodities', tag:'tag-comm',    src:'Bloomberg',    time:'4h ago',   headline:'WTI crude slides to $82 on demand concerns and rising US inventories', summary:'Oil prices dropped 0.38% after EIA data showed a 2.1M barrel build in US crude inventories, exceeding analyst expectations of a 500K barrel increase.' },
];

var newsActiveCat = 'All';

function newsChip(btn) {
  newsActiveCat = btn.dataset.nc;
  document.querySelectorAll('#newsChips .chip').forEach(function(c){ c.classList.toggle('on', c.dataset.nc===newsActiveCat); });
  renderNews();
}

function renderNews() {
  var filtered = NEWS_DATA.filter(function(n){
    return newsActiveCat==='All' || n.cat===newsActiveCat;
  });
  var feed = document.getElementById('newsFeed');
  if(!filtered.length){
    feed.innerHTML='<div style="text-align:center;padding:40px 20px;color:var(--t3);font-size:13px;">No news in this category.</div>';
    return;
  }
  feed.innerHTML = filtered.map(function(n,i){
    return '<div class="news-card" style="animation-delay:'+(i*.05)+'s">'
      +'<div class="nc-top">'
        +'<span class="nc-tag '+n.tag+'">'+esc(n.cat)+'</span>'
        +'<span class="nc-time">'+esc(n.time)+'</span>'
        +'<span class="nc-src">'+esc(n.src)+'</span>'
      +'</div>'
      +'<div class="nc-headline">'+esc(n.headline)+'</div>'
      +'<div class="nc-summary">'+esc(n.summary)+'</div>'
    +'</div>';
  }).join('');
}

function initNews() { renderNews(); }

/* ══════════════════════════════════════
   CHALLENGES
══════════════════════════════════════ */
function updateChallengeCount() {
  lbLoad();
  var count = Math.max(lbData.length + 12, 12); // floor at 12
  var el = document.getElementById('ch-count');
  if(el) el.textContent = count + ' participants';
}

function joinChallenge(btn) {
  btn.textContent = '✓ Joined!';
  btn.style.background = 'rgba(0,200,122,0.15)';
  btn.style.color = 'var(--green)';
  btn.disabled = true;
  showToast('✓ Challenge joined! Good luck!');
}

/* ══════════════════════════════════════
   TRADEX AI (Groq or stub)
══════════════════════════════════════ */
var AI_API_KEY = ''; // Set your Groq key: https://console.groq.com/keys
var AI_MODEL   = 'llama-3.3-70b-versatile';
var aiHistory  = [];

var AI_SYSTEM = 'You are TradeXAI, a trading assistant inside TradeX Pro. Rules: Reply in max 4 lines only. Be short, direct, trading-focused. No markdown, no bullet points, no formatting symbols. Cover only what the trader needs: key level, signal, or rule. Refuse non-trading topics in one line. You know Forex, Crypto, Indian stocks (Nifty/BankNifty), US stocks, Gold, technical analysis (RSI, MACD, Bollinger Bands, Fibonacci, candlesticks, price action), smart money concepts (order blocks, FVG, BOS/CHOCH), risk management, and options basics.';

var aiWelcomeHidden = false;

function aiHideWelcome() {
  if(aiWelcomeHidden) return;
  aiWelcomeHidden = true;
  var w = document.getElementById('aiWelcome');
  if(w) w.style.display='none';
}

function aiEsc(t){ return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function aiAddUserMsg(text) {
  var chat=document.getElementById('aiChat');
  var d=document.createElement('div');
  d.className='ai-msg-user';
  d.innerHTML='<div class="ai-user-bubble"><div class="ai-user-txt">'+aiEsc(text)+'</div></div>';
  chat.appendChild(d);
  chat.scrollTop=99999;
}

function aiAddTyping() {
  var chat=document.getElementById('aiChat');
  var d=document.createElement('div');
  d.className='ai-msg-ai'; d.id='aiTyping';
  d.innerHTML='<div class="ai-av"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.6"><circle cx="12" cy="12" r="10"/></svg></div>'
    +'<div class="ai-typing-bubble"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>';
  chat.appendChild(d);
  chat.scrollTop=99999;
}

function aiRemoveTyping() {
  var el=document.getElementById('aiTyping');
  if(el) el.remove();
}

function aiAddAnswer(text) {
  var clean=text.replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/#{1,6}\s/g,'').replace(/`(.*?)`/g,'$1').trim();
  var chat=document.getElementById('aiChat');
  var d=document.createElement('div');
  d.className='ai-msg-ai';
  d.innerHTML='<div class="ai-av"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.6"><circle cx="12" cy="12" r="10"/><circle cx="8.5" cy="12" r=".5" fill="white" stroke="none"/><circle cx="12" cy="12" r=".5" fill="white" stroke="none"/><circle cx="15.5" cy="12" r=".5" fill="white" stroke="none"/></svg></div>'
    +'<div class="ai-answer-card">'
    +aiEsc(clean).replace(/\n\n/g,'</div><div class="ai-answer-card" style="margin-top:6px;">').replace(/\n/g,' ')
    +'</div>';
  chat.appendChild(d);
  chat.scrollTop=99999;
}

function aiAddError(msg) {
  var chat=document.getElementById('aiChat');
  var d=document.createElement('div');
  d.className='ai-msg-ai';
  d.innerHTML='<div class="ai-av" style="background:rgba(255,77,109,.4)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.6"><circle cx="12" cy="12" r="10"/></svg></div>'
    +'<div class="ai-answer-card" style="border-color:rgba(255,77,109,.25);color:rgba(255,160,160,.85);">'+aiEsc(msg)+'</div>';
  chat.appendChild(d);
  chat.scrollTop=99999;
}

async function aiCallAPI(question) {
  if(!AI_API_KEY) {
    // Fallback: smart static responses when no API key set
    return generateStaticAIResponse(question);
  }
  aiHistory.push({role:'user',content:question});
  var messages=[{role:'system',content:AI_SYSTEM}].concat(aiHistory.slice(-10));
  var response = await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+AI_API_KEY},
    body:JSON.stringify({model:AI_MODEL,messages:messages,temperature:.6,max_tokens:160,top_p:.85})
  });
  if(!response.ok){
    var err=await response.json().catch(function(){return{};});
    throw new Error(err.error&&err.error.message?err.error.message:'HTTP '+response.status);
  }
  var data=await response.json();
  var reply='';
  try{reply=data.choices[0].message.content.trim();}catch(e){reply='Could not get a response. Try again.';}
  aiHistory.push({role:'assistant',content:reply});
  return reply;
}

// Smart static fallback when no Groq key is configured
var STATIC_RESPONSES = {
  'btc':      'BTC is trading around $68,400 with bullish structure on the daily chart. Key support at $66,800; resistance at $70,000. RSI at 58 — neutral. Watch for breakout above $70K for next leg up.',
  'bitcoin':  'BTC structure remains bullish above $65K. Daily close above $70K would confirm continuation toward $74K–$76K. Stop below $65,000 for swing longs.',
  'nifty':    'Nifty 50 at 22,519. Immediate support 22,200; resistance 22,800. BankNifty showing relative strength. Options PCR above 1.1 — mildly bullish bias.',
  'rsi':      'RSI above 70 = overbought, look for bearish divergence or reversal candles to short. RSI below 30 = oversold, look for bullish divergence to long. Divergence is stronger than raw levels.',
  'macd':     'MACD bullish crossover: signal line crosses below histogram — buy. Bearish: signal crosses above — sell. Confirm with price action: a MACD cross during consolidation is weak.',
  'risk':      'Rule: never risk more than 1–2% of your account per trade. R:R minimum 1:2. If SL = 50 pts on 10,000 account at 1% risk, max loss = ₹100. Adjust position size accordingly.',
  'gold':     'Gold XAU/USD at $2,318. Support at $2,280; resistance $2,350 and $2,400 (ATH). Dollar strength is the main headwind. Hold above $2,280 = bullish trend intact.',
  'eurusd':   'EUR/USD at 1.0842. ECB rate cut expectations weigh on euro. Support 1.0780; resistance 1.0920. Bias is short on rallies toward 1.0920 until Fed stance shifts.',
  'default':  'I can help with technical analysis, trade setups, risk management, and market insights. Ask me about a specific symbol, indicator, or strategy for a focused answer.'
};

function generateStaticAIResponse(q) {
  var ql = q.toLowerCase();
  for(var key in STATIC_RESPONSES) {
    if(ql.includes(key)) return STATIC_RESPONSES[key];
  }
  return STATIC_RESPONSES.default;
}

function aiAsk(q) {
  aiHideWelcome();
  aiAddUserMsg(q);
  aiAddTyping();
  Promise.resolve(aiCallAPI(q))
    .then(function(a){ aiRemoveTyping(); aiAddAnswer(a); })
    .catch(function(e){ aiRemoveTyping(); aiAddError('Error: '+e.message); });
}

function aiSend() {
  var inp=document.getElementById('aiInput');
  var q=inp.value.trim();
  if(!q) return;
  inp.value='';
  aiAsk(q);
}

function aiChip(q) { aiAsk(q); }

document.getElementById('aiInput').addEventListener('keydown',function(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSend();}
});

/* ══════════════════════════════════════
   TOAST NOTIFICATION
══════════════════════════════════════ */
var toastTimer = null;
function showToast(msg) {
  var existing=document.querySelector('.toast');
  if(existing) existing.remove();
  var t=document.createElement('div');
  t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ if(t.parentNode) t.remove(); },2800);
}

/* ══════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════ */
document.addEventListener('keydown',function(e){
  if(e.altKey) {
    var map={'1':'home','2':'explore','3':'trade','4':'community','5':'ai'};
    if(map[e.key]){e.preventDefault();navTo(map[e.key]);}
  }
});

/* ══════════════════════════════════════
   LEADERBOARD ADD — Enter key
══════════════════════════════════════ */
['lb-name','lb-profit','lb-wr','lb-trades','lb-consist'].forEach(function(id){
  var el=document.getElementById(id);
  if(el) el.addEventListener('keydown',function(e){if(e.key==='Enter') lbAddEntry();});
});
// 🔥 Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 🔥 TERA REAL CONFIG (yaha apna daal)


// 🔥 INIT
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 🔥 GOOGLE LOGIN FUNCTION
const provider = new GoogleAuthProvider();
const firebaseConfig = {
  apiKey: "AIzaSyDCAEoDTMlDMkEFy2Qc0RoWq4bzwMPsLP8",
  authDomain: "tradexpro-4d534.firebaseapp.com",
  projectId: "tradexpro-4d534",
  storageBucket: "tradexpro-4d534.firebasestorage.app",
  messagingSenderId: "552654194329",
  appId: "1:552654194329:web:64e7f248de9ac7591d1a08"
};
document.getElementById("googleLoginBtn").addEventListener("click", () => {
  signInWithPopup(auth, provider)
    .then((result) => {
      console.log("SUCCESS:", result.user);
      alert("Login success");
      window.location.href = "dashboard.html";
    })
    .catch((error) => {
      console.error(error);
      alert(error.message);
    });
});