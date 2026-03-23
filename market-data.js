/* ═══════════════════════════════════════════════════════════════
   TRADEX AI — market-data.js
   ───────────────────────────────────────────────────────────────
   Symbols  : BTCUSDT (Binance) · ETHUSDT (Binance) · EURUSD (Frankfurter)
   Trend    : real price-movement comparison — zero Math.random() in logic
   Levels   : approx Entry / SL / TP — NOT financial advice
   DOM IDs  : wired to exact IDs from explore.html
   Load     : MUST be the last <script> tag — overrides page stubs
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Silence the static fake-tick loop from explore.html ── */
  window.renderMarket = function () {};

  /* ══════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════ */
  var lastPrice = {};   /* { symbolKey: number } */

  /* ══════════════════════════════════════════════════════════
     getTrend(symbol, currentPrice)
     ─────────────────────────────────────────────────────────
     Returns: { trend, confidence, percentChange }

     - percent > +0.05%  → Bullish
     - percent < -0.05%  → Bearish
     - otherwise         → Neutral
     - confidence = min(95, abs(percentChange) * 1000)
     - Neutral confidence = 50
     - NO Math.random(), NO hardcoded values
  ══════════════════════════════════════════════════════════ */
  function getTrend(symbol, currentPrice) {
    if (!lastPrice[symbol]) {
      lastPrice[symbol] = currentPrice;
      return { trend: 'Neutral', confidence: 50, percentChange: 0 };
    }

    var prev          = lastPrice[symbol];
    lastPrice[symbol] = currentPrice;

    var diff          = currentPrice - prev;
    var percentChange = (diff / prev) * 100;

    if (percentChange > 0.05) {
      return {
        trend:         'Bullish',
        confidence:    Math.min(95, Math.abs(percentChange) * 1000),
        percentChange: percentChange,
      };
    }
    if (percentChange < -0.05) {
      return {
        trend:         'Bearish',
        confidence:    Math.min(95, Math.abs(percentChange) * 1000),
        percentChange: percentChange,
      };
    }
    return { trend: 'Neutral', confidence: 50, percentChange: percentChange };
  }

  /* ══════════════════════════════════════════════════════════
     getTradeLevels(trend, price)
     ─────────────────────────────────────────────────────────
     Returns: { entry, sl, tp }

     Bullish → entry = price, sl = price − 0.5%, tp = price + 1%
     Bearish → entry = price, sl = price + 0.5%, tp = price − 1%
     Neutral → entry = "No Trade", sl = "—", tp = "—"

     ⚠️ Approx values — NOT financial advice
  ══════════════════════════════════════════════════════════ */
  function getTradeLevels(trend, price) {
    if (trend === 'Bullish') {
      return {
        entry: price,
        sl:    price * 0.995,   /* −0.5% */
        tp:    price * 1.010,   /* +1.0% */
      };
    }
    if (trend === 'Bearish') {
      return {
        entry: price,
        sl:    price * 1.005,   /* +0.5% */
        tp:    price * 0.990,   /* −1.0% */
      };
    }
    return { entry: 'No Trade', sl: '—', tp: '—' };
  }

  /* Setup label from price position in session range */
  function getSetup(price, high, low, trend) {
    var range = (high - low) || 0.0001;
    var pos   = (price - low) / range;
    if (pos > 0.82)          return 'Breakout';
    if (pos < 0.18)          return 'Reversal';
    if (trend === 'Bullish') return 'Trend Continuation';
    if (trend === 'Bearish') return 'Mean Reversion';
    return 'Range Play';
  }

  /* ══════════════════════════════════════════════════════════
     HTTP HELPER
  ══════════════════════════════════════════════════════════ */
  function httpGet(url, cb) {
    console.log('[TradeX] GET', url);
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.timeout = 9000;
    x.onload = function () {
      if (x.status !== 200) { console.error('[TradeX] HTTP', x.status, url); return cb(null); }
      try { cb(JSON.parse(x.responseText)); }
      catch (e) { console.error('[TradeX] parse error', url, e); cb(null); }
    };
    x.onerror   = function () { console.error('[TradeX] network error', url); cb(null); };
    x.ontimeout = function () { console.error('[TradeX] timeout', url); cb(null); };
    x.send();
  }

  /* ══════════════════════════════════════════════════════════
     API FETCHERS
  ══════════════════════════════════════════════════════════ */

  /* Binance public 24hr ticker — no key, no CORS issues */
  function fetchBinance(pair, cb) {
    httpGet('https://api.binance.com/api/v3/ticker/24hr?symbol=' + pair, function (d) {
      if (!d || !d.lastPrice) { console.warn('[TradeX] Binance no data:', pair); return cb(null); }
      cb({
        price:     parseFloat(d.lastPrice),
        changePct: parseFloat(d.priceChangePercent),
        high:      parseFloat(d.highPrice),
        low:       parseFloat(d.lowPrice),
        prev:      parseFloat(d.prevClosePrice),
      });
    });
  }

  /* Frankfurter.app — free, no key, CORS open */
  function fetchEURUSD(cb) {
    httpGet('https://api.frankfurter.app/latest?from=EUR&to=USD', function (d) {
      if (!d || !d.rates || !d.rates.USD) { console.warn('[TradeX] Frankfurter no data'); return cb(null); }
      var p = d.rates.USD;
      cb({ price: p, changePct: 0, high: p * 1.002, low: p * 0.998, prev: p });
    });
  }

  /* ══════════════════════════════════════════════════════════
     CARD DEFINITIONS
  ══════════════════════════════════════════════════════════ */
  var CARDS = [
    { id: 'btc', name: 'Bitcoin',   ticker: 'BTC/USDT', icon: '₿', color: '#f7931a',
      fetch: function (cb) { fetchBinance('BTCUSDT', cb); } },
    { id: 'eth', name: 'Ethereum',  ticker: 'ETH/USDT', icon: '⟠', color: '#7c5cfc',
      fetch: function (cb) { fetchBinance('ETHUSDT', cb); } },
    { id: 'eur', name: 'EUR / USD', ticker: 'EURUSD',   icon: '€', color: '#4f72ff',
      fetch: fetchEURUSD },
  ];

  /* ══════════════════════════════════════════════════════════
     SCANNER SYMBOL MAP
  ══════════════════════════════════════════════════════════ */
  var SCAN_MAP = {
    BTC:     function (cb) { fetchBinance('BTCUSDT', cb); },
    BTCUSD:  function (cb) { fetchBinance('BTCUSDT', cb); },
    BTCUSDT: function (cb) { fetchBinance('BTCUSDT', cb); },
    BITCOIN: function (cb) { fetchBinance('BTCUSDT', cb); },
    ETH:     function (cb) { fetchBinance('ETHUSDT', cb); },
    ETHUSD:  function (cb) { fetchBinance('ETHUSDT', cb); },
    ETHUSDT: function (cb) { fetchBinance('ETHUSDT', cb); },
    EUR:     fetchEURUSD,
    EURUSD:  fetchEURUSD,
  };

  /* ══════════════════════════════════════════════════════════
     FORMATTING
  ══════════════════════════════════════════════════════════ */
  function fmtPrice(price, ticker) {
    if (price == null || isNaN(price)) return '—';
    var t = (ticker || '').toUpperCase();
    if ((t.indexOf('EUR') !== -1 || t.indexOf('USD') !== -1) && price < 10) return price.toFixed(5);
    if (price > 999) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price < 10)  return price.toFixed(5);
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtLevel(val, ticker) {
    return typeof val === 'number' ? fmtPrice(val, ticker) : val;
  }

  function fmtPct(pct) {
    if (pct == null || isNaN(pct)) return '—';
    var n = Number(pct);
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  /* Deterministic spark — uses trend direction only, no Math.random */
  function spark(isUp) {
    var pts = [], y = 28;
    for (var i = 0; i < 20; i++) {
      var step = isUp ? (i % 3 === 0 ? -1 : 1.2) : (i % 3 === 0 ? 1 : -1.2);
      y = Math.max(6, Math.min(34, y + step));
      pts.push(i * 8 + ',' + y.toFixed(1));
    }
    var c = isUp ? '#00c87a' : '#ff4d6d';
    return '<svg viewBox="0 0 160 40" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:40px">'
      + '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + c
      + '" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }

  /* ══════════════════════════════════════════════════════════
     RESULT CACHE   id → { quote, trend, confidence, levels }
  ══════════════════════════════════════════════════════════ */
  var _cache = {};

  /* ══════════════════════════════════════════════════════════
     FETCH ALL CARDS
  ══════════════════════════════════════════════════════════ */
  function fetchAllCards(done) {
    var remaining = CARDS.length;
    function finish() { if (--remaining === 0) done(); }
    CARDS.forEach(function (meta) {
      meta.fetch(function (q) {
        if (q) {
          var tr     = getTrend(meta.id, q.price);
          var levels = getTradeLevels(tr.trend, q.price);
          _cache[meta.id] = { quote: q, trend: tr.trend, confidence: tr.confidence, levels: levels };
          console.log('[TradeX]', meta.ticker,
            '| price:', q.price,
            '| trend:', tr.trend,
            '| conf:', tr.confidence.toFixed(2) + '%',
            '| entry:', fmtLevel(levels.entry, meta.ticker),
            '| sl:', fmtLevel(levels.sl, meta.ticker),
            '| tp:', fmtLevel(levels.tp, meta.ticker));
        } else {
          console.warn('[TradeX]', meta.ticker, '→ no data');
        }
        finish();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     MARKET CARD HTML
     Wired to CSS classes defined in explore.html:
       .market-card .market-asset .asset-icon .asset-name
       .asset-ticker .market-price .market-change.up/.down/.flat
       .trend-badge.bullish/.bearish/.neutral .conf-micro
       .card-levels .card-level-chip.sl/.tp .card-disclaimer
       .mini-spark
  ══════════════════════════════════════════════════════════ */
  function cardHTML(entry, meta) {
    var q      = entry.quote;
    var trend  = entry.trend;
    var conf   = entry.confidence;
    var levels = entry.levels;
    var isUp   = trend === 'Bullish';
    var isBear = trend === 'Bearish';
    var arrow  = isUp ? '▲' : isBear ? '▼' : '—';
    var chgCls = isUp ? 'up' : isBear ? 'down' : 'flat';
    var tCls   = isUp ? 'bullish' : isBear ? 'bearish' : 'neutral';

    var levelsHTML = '';
    if (trend !== 'Neutral') {
      levelsHTML = '<div class="card-levels">'
        + '<span class="card-level-chip">Entry<strong>' + fmtLevel(levels.entry, meta.ticker) + '</strong></span>'
        + '<span class="card-level-chip sl">SL<strong>'    + fmtLevel(levels.sl,    meta.ticker) + '</strong></span>'
        + '<span class="card-level-chip tp">TP<strong>'    + fmtLevel(levels.tp,    meta.ticker) + '</strong></span>'
        + '</div>'
        + '<div class="card-disclaimer">⚠️ Approx levels – Not financial advice</div>';
    }

    return '<div class="market-card">'
      + '<div class="market-asset">'
        + '<div class="asset-icon" style="background:' + meta.color + '22;border:1px solid ' + meta.color + '44">'
          + '<span style="color:' + meta.color + '">' + meta.icon + '</span>'
        + '</div>'
        + '<div>'
          + '<div class="asset-name">'   + meta.name   + '</div>'
          + '<div class="asset-ticker">' + meta.ticker + '</div>'
        + '</div>'
      + '</div>'
      + '<div class="market-price">' + fmtPrice(q.price, meta.ticker) + '</div>'
      + '<span class="market-change ' + chgCls + '">' + arrow + ' ' + fmtPct(q.changePct) + '</span>'
      + '<div class="trend-badge ' + tCls + '">' + trend + '<span class="conf-micro">' + conf.toFixed(1) + '%</span></div>'
      + levelsHTML
      + '<div class="mini-spark">' + spark(isUp) + '</div>'
      + '</div>';
  }

  function renderMarketGrid() {
    var grid = document.getElementById('marketGrid');
    if (!grid) { console.error('[TradeX] #marketGrid not found'); return; }
    var html = '';
    CARDS.forEach(function (meta) {
      var e = _cache[meta.id];
      if (e) html += cardHTML(e, meta);
    });
    if (!html) html = '<p style="color:rgba(238,240,255,0.3);font-size:12px;padding:20px;grid-column:1/-1">Fetching live data…</p>';
    grid.innerHTML = html;
    console.log('[TradeX] #marketGrid rendered');
  }

  /* ══════════════════════════════════════════════════════════
     IDEAS GRID  (#ideasGrid)
     CSS classes: .idea-card .idea-header .idea-tag.bull/.bear/.neutral
                  .idea-title .idea-desc .idea-meta
                  .idea-symbol .idea-time .idea-confidence-label
  ══════════════════════════════════════════════════════════ */
  function ideaCard(idea) {
    return '<div class="idea-card">'
      + '<div class="idea-header"><span class="idea-tag ' + idea.tag + '">' + idea.tagLabel + '</span></div>'
      + '<div class="idea-title">'   + idea.title      + '</div>'
      + '<div class="idea-desc">'    + idea.desc        + '</div>'
      + '<div class="idea-meta">'
        + '<span class="idea-symbol">' + idea.symbol + '</span>'
        + '<span class="idea-time">'   + idea.time   + '</span>'
        + '<span class="idea-confidence-label">Confidence: <strong style="color:var(--blue2)">' + idea.confidence + '</strong></span>'
      + '</div>'
      + '</div>';
  }

  function buildIdeas() {
    var out = [];
    CARDS.forEach(function (meta) {
      var e = _cache[meta.id];
      if (!e) return;
      var q      = e.quote;
      var trend  = e.trend;
      var conf   = e.confidence;
      var levels = e.levels;
      var isUp   = trend === 'Bullish';
      var isBear = trend === 'Bearish';
      var tag    = isUp ? 'bull' : isBear ? 'bear' : 'neutral';
      var label  = isUp ? '● BULLISH' : isBear ? '● BEARISH' : '◆ NEUTRAL';

      var levelsLine = (trend !== 'Neutral')
        ? ' Approx Entry: ' + fmtLevel(levels.entry, meta.ticker)
          + ' | SL: ' + fmtLevel(levels.sl, meta.ticker)
          + ' | TP: ' + fmtLevel(levels.tp, meta.ticker)
          + ' ⚠️ Not financial advice.'
        : '';

      out.push({
        tag:        tag,
        tagLabel:   label,
        symbol:     meta.ticker,
        time:       'Live',
        title:      meta.name
                  + (isUp   ? ' advancing — ' : isBear ? ' retreating — ' : ' stable — ')
                  + fmtPrice(q.price, meta.ticker),
        desc:       'Trend: ' + trend + ' | Confidence: ' + conf.toFixed(1) + '%. '
                  + 'Session: ' + fmtPrice(q.low, meta.ticker) + ' – ' + fmtPrice(q.high, meta.ticker) + '.'
                  + levelsLine,
        confidence: conf.toFixed(1) + '%',
      });
    });

    out.push({
      tag: 'neutral', tagLabel: '◆ WATCH', symbol: 'MACRO', time: 'Today',
      title: 'Monitor macro events this week',
      desc:  'FOMC, NFP and CPI data can override price signals. Trend and level readings may shift sharply on data releases.',
      confidence: '50%',
    });
    return out;
  }

  function renderIdeasGrid() {
    var grid = document.getElementById('ideasGrid');
    if (!grid) { console.error('[TradeX] #ideasGrid not found'); return; }
    grid.innerHTML = buildIdeas().map(ideaCard).join('');
    console.log('[TradeX] #ideasGrid rendered');
  }

  /* ══════════════════════════════════════════════════════════
     SCANNER
     Exact DOM IDs from explore.html:
       #scannerInput   #scannerResult   #scanSymbolLabel
       #rTrend         #rConf           #rConfBar
       #rSetup         #rEntry          #rSL
       #rTP            #rDisclaimer
  ══════════════════════════════════════════════════════════ */
  function g(id) { return document.getElementById(id); }

  function scanSetLoading(key) {
    var lbl = g('scanSymbolLabel'); if (lbl) lbl.textContent = 'Scanning ' + key + '…';
    var res = g('scannerResult');   if (res) { res.style.display = 'none'; res.classList.remove('show'); }
  }

  function scanShowError(key, msg) {
    var lbl = g('scanSymbolLabel'); if (lbl) lbl.textContent = key + ' — ' + msg;
    var rT  = g('rTrend');   if (rT) { rT.textContent = '—'; rT.className = 'result-value neutral'; }
    var rC  = g('rConf');    if (rC) { rC.textContent = '—'; rC.className = 'result-value neutral'; }
    var rS  = g('rSetup');   if (rS) rS.textContent = msg;
    var rB  = g('rConfBar'); if (rB) { rB.style.width = '0%'; rB.className = 'confidence-fill mid'; }
    var rE  = g('rEntry');   if (rE) rE.textContent = '—';
    var rSL = g('rSL');      if (rSL) rSL.textContent = '—';
    var rTP = g('rTP');      if (rTP) rTP.textContent = '—';
    var rd  = g('rDisclaimer'); if (rd) rd.style.display = 'none';
    var res = g('scannerResult');
    if (res) { res.style.display = 'block'; res.classList.add('show'); }
  }

  function scanShowResult(key, q) {
    /* Independent scan_ namespace so scanner doesn't affect card state */
    var tr     = getTrend('scan_' + key, q.price);
    var trend  = tr.trend;
    var conf   = tr.confidence;
    var levels = getTradeLevels(trend, q.price);
    var setup  = getSetup(q.price, q.high, q.low, trend);
    var isUp   = trend === 'Bullish';
    var isBear = trend === 'Bearish';
    var tcls   = isUp ? 'bullish' : isBear ? 'bearish' : 'neutral';
    var clvl   = conf >= 70 ? 'high' : conf >= 40 ? 'mid' : 'low';
    var ticker = key;

    /* ── Label ── */
    var lbl = g('scanSymbolLabel');
    if (lbl) lbl.textContent = key
      + '  ·  ' + fmtPrice(q.price, ticker)
      + '  ·  ' + (isUp ? '▲' : isBear ? '▼' : '—')
      + ' ' + fmtPct(q.changePct);

    /* ── Trend → #rTrend ── */
    var rT = g('rTrend');
    if (rT) { rT.textContent = trend; rT.className = 'result-value ' + tcls; }

    /* ── Confidence → #rConf ── */
    var rC = g('rConf');
    if (rC) { rC.textContent = conf.toFixed(1) + '%'; rC.className = 'result-value ' + tcls; }

    /* ── Confidence bar → #rConfBar ── */
    var rB = g('rConfBar');
    if (rB) {
      rB.className   = 'confidence-fill ' + clvl;
      rB.style.width = '0%';
      requestAnimationFrame(function () {
        setTimeout(function () { rB.style.width = conf.toFixed(1) + '%'; }, 60);
      });
    }

    /* ── Setup → #rSetup ── */
    var rS = g('rSetup');
    if (rS) rS.textContent = setup;

    /* ── Trade levels → #rEntry / #rSL / #rTP ── */
    var rE  = g('rEntry'); if (rE)  rE.textContent  = fmtLevel(levels.entry, ticker);
    var rSL = g('rSL');    if (rSL) rSL.textContent = fmtLevel(levels.sl,    ticker);
    var rTP = g('rTP');    if (rTP) rTP.textContent = fmtLevel(levels.tp,    ticker);

    /* ── Disclaimer → #rDisclaimer ── */
    var rd = g('rDisclaimer');
    if (rd) rd.style.display = trend !== 'Neutral' ? 'block' : 'none';

    /* ── Show result panel → #scannerResult ── */
    var res = g('scannerResult');
    if (res) { res.style.display = 'block'; res.classList.add('show'); }

    console.log('[TradeX] scan:', key, {
      price: q.price, trend: trend,
      confidence: conf.toFixed(2) + '%', setup: setup,
      entry: fmtLevel(levels.entry, ticker),
      sl:    fmtLevel(levels.sl,    ticker),
      tp:    fmtLevel(levels.tp,    ticker),
    });
  }

  function doScan(raw) {
    var key = (raw || '').trim().toUpperCase();
    if (!key) return;
    scanSetLoading(key);

    var fetchFn = SCAN_MAP[key];
    if (!fetchFn) {
      scanShowError(key, 'Supported: BTC · ETH · EURUSD');
      return;
    }
    fetchFn(function (q) {
      if (!q) { scanShowError(key, 'No data — check connection'); return; }
      scanShowResult(key, q);
    });
  }

  /* ══════════════════════════════════════════════════════════
     OVERRIDE PAGE STUBS
     explore.html defines empty runScanner() and quickScan().
     This file loads LAST — these assignments win.
  ══════════════════════════════════════════════════════════ */
  window.runScanner = function () {
    var inp = g('scannerInput');
    doScan(inp ? inp.value : '');
  };

  window.quickScan = function (sym) {
    var inp = g('scannerInput');
    if (inp) inp.value = sym;
    doScan(sym);
  };

  /* ══════════════════════════════════════════════════════════
     REFRESH LOOP — every 5 seconds
     flow: fetch → getTrend → getTradeLevels → render DOM
  ══════════════════════════════════════════════════════════ */
  var _timer = null;

  function tick() {
    console.log('[TradeX] ── tick ──');
    fetchAllCards(function () {
      renderMarketGrid();
      renderIdeasGrid();
      /* Expose cache to home page widget */
      if (typeof window._txOnTick === 'function') window._txOnTick(_cache);
    });
  }

  function startLiveData(ms) {
    if (_timer) clearInterval(_timer);
    tick();
    _timer = setInterval(tick, ms || 5000);
    console.log('[TradeX] live data running — every', (ms || 5000) / 1000, 's');
  }

  /* ══════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { startLiveData(5000); });
  } else {
    startLiveData(5000);
  }

  /* Browser console debug */
  window.TradeXData = {
    getTrend:       getTrend,
    getTradeLevels: getTradeLevels,
    doScan:         doScan,
    tick:           tick,
    lastPrice:      lastPrice,
    cache:          _cache,
  };

}());