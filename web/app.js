/* Global Plastics Watch — Compare Dashboard (vanilla JS, no dependencies).
   State-driven render() + event delegation; zoom/pan/tooltip applied imperatively;
   the time-lens year scrub updates the map/legend/ranks partially (no full re-render). */
(function () {
  "use strict";

  // ---- config (the handoff's tweakable theme/behavior props) ----
  var CONFIG = { defaultLens: 'mis', riversOn: true, accent: '#0e7490', ramp: 'warm' };
  document.documentElement.style.setProperty('--accent', CONFIG.accent);

  var PAL_warm = ['#fde2c4', '#fbc985', '#f6a049', '#ee7a2d', '#d4521b', '#991f0f'];
  var PAL_teal = ['#d4ebee', '#a3d8dd', '#69bfc7', '#36a0aa', '#1d7882', '#0c4f57'];
  var NODATA = '#d8e0e6', SEA = '#e7eef3';
  var BASE = { x: 0, y: 14, w: 720, h: 292 };
  var CONTS = ['Asia', 'Africa', 'Europe', 'North America', 'South America', 'Oceania'];
  var LENSES = {
    mis: { label: 'Mismanaged waste', short: 'Mismanaged', unit: 'tonnes / year', kind: 'snap', key: 'mis', blurb: 'Plastic littered, dumped or openly burned — the stuff most likely to leak to nature.' },
    ocean: { label: 'Ocean-emission share', short: 'Ocean share', unit: '% of world', kind: 'snap', key: 'ocean', blurb: 'Each country’s share of all plastic entering the sea.' },
    pc: { label: 'Waste per person', short: 'Per capita', unit: 'kg / person / day', kind: 'snap', key: 'pc', blurb: 'Plastic waste generated per person — high in rich economies.' },
    exports: { label: 'Waste exports', short: 'Exports', unit: 'tonnes / year', kind: 'time', key: 'exports', blurb: 'Plastic scrap shipped abroad. Scrub the years to watch China’s 2018 import ban reshape the trade.' }
  };
  var LORDER = ['mis', 'ocean', 'pc', 'exports'];
  var A = CONFIG.accent;
  function pal() { return CONFIG.ramp === 'teal' ? PAL_teal : PAL_warm; }

  var state = {
    loaded: false, err: null, lens: LENSES[CONFIG.defaultLens] ? CONFIG.defaultLens : 'mis',
    year: null, regions: [], rivers: CONFIG.riversOn !== false, selIso: null, compare: [],
    trendMode: 'prod', playing: false, exportOpen: false, aboutOpen: false, search: '', toast: null
  };
  var view = { scale: 1, cx: BASE.x + BASE.w / 2, cy: BASE.y + BASE.h / 2 };
  var pan = { active: false, x: 0, y: 0, moved: false };
  var raf = null, playT = null, toastT = null;
  var DATA, RIVERS, META, PROD, REGIONS, TRADE, PROJECTS, byIso = {}, expSeries, oceanSeries;
  var kMis, kRiver, kProdL, kProdF, kOceL, kOceF;

  var app = document.getElementById('app');
  var el = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- pure functions ----
  function proj(lon, lat) { return [(lon + 180) * 2, (90 - lat) * 2]; }
  function ringPath(ring) { var d = ''; for (var i = 0; i < ring.length; i++) { var p = proj(ring[i][0], ring[i][1]); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } return d + 'Z'; }
  function geomPath(g) { var d = '', P = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (var a = 0; a < P.length; a++) for (var b = 0; b < P[a].length; b++) d += ringPath(P[a][b]); return d; }
  function bbox(f) { var mnx = 180, mxx = -180, mny = 90, mxy = -90, P = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; P.forEach(function (p) { p.forEach(function (r) { r.forEach(function (pt) { if (pt[0] < mnx) mnx = pt[0]; if (pt[0] > mxx) mxx = pt[0]; if (pt[1] < mny) mny = pt[1]; if (pt[1] > mxy) mxy = pt[1]; }); }); }); return { mnx: mnx, mxx: mxx, mny: mny, mxy: mxy }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lensCfg() { return LENSES[state.lens]; }
  function isTime() { return lensCfg().kind === 'time'; }
  function activeValue(p) { var L = lensCfg(); if (L.kind === 'time') { var rec = TRADE.byIso[p.iso], y = String(state.year); return rec && rec[y] != null ? rec[y] : null; } return p[L.key]; }
  function activeValues() { return DATA.features.map(function (f) { return activeValue(f.properties); }).filter(function (v) { return v != null && !isNaN(v); }).sort(function (a, b) { return a - b; }); }
  function thresholds() { var v = activeValues(), q = []; for (var i = 1; i < 6; i++) q.push(v[Math.floor(i / 6 * v.length)]); return q; }
  function color(val, th) { if (val == null || isNaN(val)) return NODATA; var i = 0; while (i < th.length && val >= th[i]) i++; return pal()[i]; }
  function inScope(c) { return state.regions.length === 0 || state.regions.indexOf(c) >= 0; }
  function fmtT(v) { if (v == null || isNaN(v)) return 'no data'; v = +v; if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M t'; if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k t'; return Math.round(v) + ' t'; }
  function fmtSnap(m, v) { if (v == null || isNaN(v)) return 'no data'; if (m === 'mis') return fmtT(v); if (m === 'ocean') return (+v).toFixed(2) + '%'; return (+v).toFixed(3) + ' kg'; }
  function fmtActive(v) { var L = lensCfg(); return L.kind === 'time' ? fmtT(v) : fmtSnap(L.key, v); }
  function compact(v) { v = +v; if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B'; if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M'; if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k'; return '' + Math.round(v); }
  function rankOf(iso, m) { var arr = DATA.features.filter(function (f) { return f.properties[m] != null; }).sort(function (a, b) { return b.properties[m] - a.properties[m]; }); var i = arr.findIndex(function (f) { return f.properties.iso === iso; }); return i < 0 ? null : (i + 1) + ' of ' + arr.length; }
  function rankData() { return DATA.features.map(function (f) { return { iso: f.properties.iso, name: f.properties.name, cont: f.properties.continent, v: activeValue(f.properties) }; }).filter(function (x) { return x.v != null && inScope(x.cont); }).sort(function (a, b) { return b.v - a.v; }); }

  // ---- view / zoom / pan ----
  function curVBobj() { var w = BASE.w / view.scale, h = BASE.h / view.scale; var x = clamp(view.cx - w / 2, BASE.x, BASE.x + BASE.w - w); var y = clamp(view.cy - h / 2, BASE.y, BASE.y + BASE.h - h); return { x: x, y: y, w: w, h: h }; }
  function curVB() { var v = curVBobj(); return v.x.toFixed(1) + ' ' + v.y.toFixed(1) + ' ' + v.w.toFixed(1) + ' ' + v.h.toFixed(1); }
  function clampView() { var v = curVBobj(); view.cx = v.x + v.w / 2; view.cy = v.y + v.h / 2; }
  function applyView() { var s = el('gpwsvg'); if (s) s.setAttribute('viewBox', curVB()); }
  function zoomAt(cx, cy, factor) { var s = el('gpwsvg'); if (!s) return; var r = s.getBoundingClientRect(), v = curVBobj(); if (!r.width) { view.scale = clamp(view.scale * factor, 1, 9); clampView(); applyView(); return; } var px = v.x + (cx - r.left) / r.width * v.w, py = v.y + (cy - r.top) / r.height * v.h; view.scale = clamp(view.scale * factor, 1, 9); var w = BASE.w / view.scale, hh = BASE.h / view.scale, fx = (px - v.x) / v.w, fy = (py - v.y) / v.h; view.cx = (px - fx * w) + w / 2; view.cy = (py - fy * hh) + hh / 2; clampView(); applyView(); }
  function zoomCenter(f) { var s = el('gpwsvg'); if (!s) return; var r = s.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
  function resetView() { animateView({ scale: 1, cx: BASE.x + BASE.w / 2, cy: BASE.y + BASE.h / 2 }); }
  function animateView(target) {
    if (raf) cancelAnimationFrame(raf);
    var s = { scale: view.scale, cx: view.cx, cy: view.cy }, t0 = null;
    var ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
    function step(ts) { if (t0 == null) t0 = ts; var k = Math.min((ts - t0) / 430, 1), e = ease(k); view.scale = s.scale + (target.scale - s.scale) * e; view.cx = s.cx + (target.cx - s.cx) * e; view.cy = s.cy + (target.cy - s.cy) * e; clampView(); applyView(); if (k < 1) raf = requestAnimationFrame(step); }
    raf = requestAnimationFrame(step);
  }
  function focusCountry(iso) { var f = byIso[iso]; if (!f) return; var b = f._bbox; var x1 = (b.mnx + 180) * 2, x2 = (b.mxx + 180) * 2, y1 = (90 - b.mxy) * 2, y2 = (90 - b.mny) * 2; var bw = Math.max(x2 - x1, 4), bh = Math.max(y2 - y1, 4); var sc = clamp(Math.min(BASE.w / (bw * 1.9), BASE.h / (bh * 1.9)), 1, 6); animateView({ scale: sc, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 }); }
  function focusPoint(lon, lat, scale) { var p = proj(lon, lat); animateView({ scale: scale, cx: p[0], cy: p[1] }); }

  // ---- actions ----
  function setLens(k) { stopPlay(); state.lens = k; if (LENSES[k].kind === 'time' && state.year == null) state.year = expSeries[expSeries.length - 1][0]; render(); }
  function toggleRegion(c) { var i = state.regions.indexOf(c); if (i >= 0) state.regions.splice(i, 1); else state.regions.push(c); render(); }
  function syncHash() { try { history.replaceState(null, '', state.selIso ? '#c=' + state.selIso : location.pathname + location.search); } catch (e) { } }
  function selectCountry(iso) { var next = iso === state.selIso ? null : iso; state.selIso = next; render(); syncHash(); if (next) focusCountry(next); else resetView(); }
  function closeDrawer() { state.selIso = null; render(); syncHash(); resetView(); }
  function addCompare(iso) { if (state.compare.indexOf(iso) >= 0) return; if (state.compare.length >= 6) { flash('Compare holds up to 6 countries'); return; } state.compare.push(iso); var f = byIso[iso]; flash((f ? f.properties.name : iso) + ' added to compare'); render(); }
  function removeCompare(iso) { state.compare = state.compare.filter(function (x) { return x !== iso; }); render(); }
  function flash(msg) { state.toast = msg; renderToastOnly(); if (toastT) clearTimeout(toastT); toastT = setTimeout(function () { state.toast = null; renderToastOnly(); }, 1900); }
  function togglePlay() { if (state.playing) return stopPlay(); var yrs = expSeries.map(function (p) { return p[0]; }); var idx = yrs.indexOf(state.year); if (idx >= yrs.length - 1) idx = 0; state.playing = true; var b = el('gpwplay'); if (b) b.textContent = '❚❚'; updateYear(yrs[idx]); playT = setInterval(function () { var ys = expSeries.map(function (p) { return p[0]; }); var i = ys.indexOf(state.year); if (i >= ys.length - 1) { stopPlay(); return; } updateYear(ys[i + 1]); }, 360); }
  function stopPlay() { if (playT) { clearInterval(playT); playT = null; } state.playing = false; var b = el('gpwplay'); if (b) b.textContent = '▶'; }

  // ---- export ----
  function download(name, blob) { var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1500); }
  function exportCSV(scope) {
    state.exportOpen = false;
    var feats = DATA.features.slice();
    if (scope === 'compare') { if (!state.compare.length) { flash('Add countries to compare first'); render(); return; } feats = state.compare.map(function (i) { return byIso[i]; }).filter(Boolean); }
    var L = lensCfg(), head = ['iso', 'name', 'continent', 'mismanaged_tonnes_yr', 'ocean_share_pct', 'per_capita_kg_day'];
    if (L.kind === 'time') head.push('exports_' + state.year + '_tonnes');
    var rows = [head.join(',')];
    feats.forEach(function (f) { var p = f.properties; var r = [p.iso, '"' + String(p.name).replace(/"/g, '') + '"', p.continent || '', p.mis == null ? '' : p.mis, p.ocean == null ? '' : p.ocean, p.pc == null ? '' : p.pc]; if (L.kind === 'time') { var v = activeValue(p); r.push(v == null ? '' : v); } rows.push(r.join(',')); });
    download('global-plastics-' + (scope === 'compare' ? 'compare' : 'all') + '.csv', new Blob([rows.join('\n')], { type: 'text/csv' }));
    flash('CSV downloaded'); render();
  }
  function exportPNG() {
    state.exportOpen = false; render();
    var s = el('gpwsvg'); if (!s) return;
    try {
      var clone = s.cloneNode(true); clone.setAttribute('viewBox', curVB());
      var W = 1440, H = Math.round(1440 * BASE.h / BASE.w);
      clone.setAttribute('width', W); clone.setAttribute('height', H);
      var xml = new XMLSerializer().serializeToString(clone);
      var img = new Image();
      img.onload = function () { var c = document.createElement('canvas'); c.width = W; c.height = H; var ctx = c.getContext('2d'); ctx.fillStyle = '#eef2f5'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H); c.toBlob(function (b) { if (b) { download('global-plastics-map.png', b); flash('Map image downloaded'); } }); };
      img.onerror = function () { flash('Could not render PNG'); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    } catch (e) { flash('Could not render PNG'); }
  }

  // ================= BUILDERS (return HTML strings) =================
  function tipHtml(p, v) { var L = lensCfg(); return '<b>' + esc(p.name) + '</b><br>' + L.label + (L.kind === 'time' ? ' · ' + state.year : '') + ': ' + fmtActive(v); }

  function buildHeader() {
    var opts = DATA.features.slice().sort(function (a, b) { return a.properties.name < b.properties.name ? -1 : 1; }).map(function (f) { return '<option value="' + esc(f.properties.name) + '"></option>'; }).join('');
    var menu = state.exportOpen ? (
      '<div style="position:absolute;right:0;top:42px;background:#fff;border:1px solid #dde5ec;border-radius:11px;box-shadow:0 14px 38px rgba(12,30,46,.22);padding:6px;min-width:246px;z-index:60;animation:gpwfade .12s">'
      + menuItem('Map image', 'PNG of the current view', 'export-png', false)
      + menuItem('Country data', 'CSV · all countries, current lens', 'export-csv-all', false)
      + menuItem('Compare set', 'CSV · ' + state.compare.length + ' selected', 'export-csv-compare', state.compare.length === 0)
      + '</div>') : '';
    return '<header class="gpw-top" style="display:flex;align-items:center;gap:14px;padding:13px 20px;background:linear-gradient(180deg,#11314a,#0c1e2e);color:#fff;flex-wrap:wrap">'
      + '<div style="display:flex;align-items:center;gap:11px">'
      + '<svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#0c1e2e" stroke="#3fd0e6" stroke-width="1.4" stroke-opacity=".5"></circle><path d="M4 18c3-3 6 0 9-1s5-3 8.5-1 5 0 6.5-1.5" stroke="#3fd0e6" stroke-width="2.2" stroke-linecap="round" fill="none"></path><path d="M5 23c3-2.4 6 0 9-1s5-2.4 8-1" stroke="#2a90a8" stroke-width="1.7" stroke-linecap="round" fill="none" opacity=".7"></path></svg>'
      + '<div><div style="font-weight:700;font-size:16px;letter-spacing:.2px;line-height:1.05">Global Plastics <span style="color:var(--cyan,#3fd0e6)">Watch</span></div>'
      + '<div class="gpw-top-sub" style="font-size:11px;color:#9db4c9;margin-top:1px;font-family:\'IBM Plex Mono\',monospace;letter-spacing:.2px">Where ocean plastic comes from</div></div></div>'
      + '<div style="flex:1"></div>'
      + '<div style="position:relative"><input id="gpwsearch" class="gpw-search" list="gpw-countries" placeholder="Search a country…" value="' + esc(state.search) + '" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);color:#fff;padding:8px 11px;border-radius:8px;font:500 12.5px \'IBM Plex Sans\';width:168px"><datalist id="gpw-countries">' + opts + '</datalist></div>'
      + '<a class="gpw-btn" href="fund.html" style="background:#3fd0e6;border:1px solid #3fd0e6;color:#06283d;padding:8px 13px;border-radius:8px;font:600 12.5px \'IBM Plex Sans\';cursor:pointer;text-decoration:none">♥ Fund a cleanup</a>'
      + '<button class="gpw-btn gpw-ghost" data-act="about" style="background:transparent;border:1px solid rgba(255,255,255,.22);color:#dbe7f0;padding:8px 13px;border-radius:8px;font:600 12.5px \'IBM Plex Sans\';cursor:pointer">About &amp; data</button>'
      + '<div id="gpwexport" style="position:relative"><button class="gpw-btn" data-act="export-toggle" style="display:flex;align-items:center;gap:7px;background:' + A + ';border:1px solid ' + A + ';color:#fff;padding:8px 14px;border-radius:8px;font:600 12.5px \'IBM Plex Sans\';cursor:pointer"><span style="font-size:13px">⤓</span>Export</button>' + menu + '</div>'
      + '</header>';
  }
  function menuItem(label, sub, act, dis) {
    return '<button class="gpw-menuitem" ' + (dis ? 'disabled' : 'data-act="' + act + '"') + ' style="display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;background:transparent;border:none;padding:9px 12px;cursor:' + (dis ? 'default' : 'pointer') + ';opacity:' + (dis ? .45 : 1) + ';border-radius:7px">'
      + '<span style="font:600 12.5px \'IBM Plex Sans\';color:#0c1e2e">' + label + '</span><span style="font:500 10.5px \'IBM Plex Mono\';color:#8b98a3">' + sub + '</span></button>';
  }

  function buildKpis() {
    var oceRatio = (kOceL[1] / kOceF[1]), prodRatio = Math.round(kProdL[1] / kProdF[1]);
    function card(val, unit, label, sub) {
      return '<div style="background:#fff;padding:14px 18px 15px;display:flex;flex-direction:column;gap:2px">'
        + '<div style="display:flex;align-items:baseline;gap:4px"><span style="font:500 30px \'Newsreader\';color:#0c1e2e;line-height:1;letter-spacing:-.5px">' + val + '</span><span style="font:600 12px \'IBM Plex Mono\';color:' + A + '">' + unit + '</span></div>'
        + '<div style="font:600 11.5px \'IBM Plex Sans\';color:#33485a;margin-top:5px">' + label + '</div>'
        + '<div style="font:500 10.5px \'IBM Plex Mono\';color:#8b98a3">' + sub + '</div></div>';
    }
    return '<div class="gpw-kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#dde5ec;border-bottom:1px solid #dde5ec">'
      + card(compact(kMis), 't/yr', 'Mismanaged plastic', 'littered, dumped or burned · 2019')
      + card(compact(kOceL[1]), 't', 'In the ocean now', '×' + oceRatio.toFixed(1) + ' since 2000')
      + card('' + RIVERS.length, 'rivers', 'Carry most of it', '≈' + compact(kRiver) + ' t/yr to the sea')
      + card(compact(kProdL[1]), 't/yr', 'Plastic produced', '×' + prodRatio + ' since 1950')
      + '</div>';
  }

  function buildRail() {
    var lensRows = LORDER.map(function (k) {
      var L = LENSES[k], on = state.lens === k;
      return '<button class="gpw-lens" data-act="lens" data-arg="' + k + '" style="display:block;width:100%;text-align:left;background:' + (on ? '#0c1e2e' : '#fff') + ';border:1px solid ' + (on ? '#0c1e2e' : '#dde5ec') + ';border-radius:9px;padding:9px 11px;margin-bottom:7px;cursor:pointer">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span style="font:600 13px \'IBM Plex Sans\';color:' + (on ? '#fff' : '#0c1e2e') + '">' + L.label + '</span>'
        + (L.kind === 'time' ? '<span style="font:600 8.5px \'IBM Plex Mono\';color:' + (on ? '#3fd0e6' : A) + ';border:1px solid ' + (on ? 'rgba(63,208,230,.5)' : '#cfe0e4') + ';border-radius:5px;padding:1px 5px;letter-spacing:.3px">TIME</span>' : '') + '</div>'
        + '<div style="font:500 10.5px \'IBM Plex Mono\';color:' + (on ? '#9db4c9' : '#8b98a3') + ';margin-top:2px">' + L.unit + '</div></button>';
    }).join('');
    var regionPills = CONTS.map(function (c) {
      var on = state.regions.indexOf(c) >= 0;
      return '<button class="gpw-btn" data-act="region" data-arg="' + c + '" style="background:' + (on ? A : '#fff') + ';border:1px solid ' + (on ? A : '#dde5ec') + ';color:' + (on ? '#fff' : '#48586a') + ';border-radius:20px;padding:5px 11px;font:600 11.5px \'IBM Plex Sans\';cursor:pointer">' + c + '</button>';
    }).join('');
    var regionReset = state.regions.length ? '<button data-act="region-reset" style="background:transparent;border:none;color:' + A + ';font:600 10.5px \'IBM Plex Sans\';cursor:pointer;padding:0">reset</button>' : '';
    var on = state.rivers;
    var riverToggle = '<button class="gpw-btn" data-act="rivers" style="display:flex;align-items:center;gap:9px;width:100%;background:#fff;border:1px solid #dde5ec;border-radius:9px;padding:8px 11px;cursor:pointer">'
      + '<span style="width:34px;height:18px;border-radius:10px;background:' + (on ? A : '#cdd7df') + ';position:relative;flex:none;transition:background .15s"><span style="position:absolute;top:2px;left:' + (on ? '18px' : '2px') + ';width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.25)"></span></span>'
      + '<span style="font:600 12.5px \'IBM Plex Sans\';color:#0c1e2e">' + (on ? 'Showing 150 outlets' : 'Hidden') + '</span>'
      + '<span style="margin-left:auto;width:11px;height:11px;border-radius:50%;background:#1565c0;opacity:.62;border:1.5px solid #fff"></span></button>';
    var basket = !state.compare.length
      ? '<div style="font:500 11.5px/1.5 \'IBM Plex Sans\';color:#9aa7b2;padding:4px 0">Click a country on the map, a ranking row, or search — then <b style="color:#6b7c89">Add to compare</b>.</div>'
      : '<div style="display:flex;flex-wrap:wrap;gap:6px">' + state.compare.map(function (iso) { var f = byIso[iso]; if (!f) return ''; return '<span style="display:inline-flex;align-items:center;gap:6px;background:#eaf3f4;border:1px solid #cfe3e6;border-radius:7px;padding:4px 6px 4px 9px;font:600 11.5px \'IBM Plex Sans\';color:#0c4f57">' + esc(f.properties.name) + '<span class="gpw-chipx" data-act="cmp-del" data-arg="' + iso + '" style="cursor:pointer;font-size:13px;line-height:1;color:#0c4f57">×</span></span>'; }).join('') + '</div>';
    var compareClear = state.compare.length ? '<button data-act="cmp-clear" style="background:transparent;border:none;color:' + A + ';font:600 10.5px \'IBM Plex Sans\';cursor:pointer;padding:0">clear</button>' : '';
    var lab = function (t, extra) { return '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:9px"><div style="font:600 10.5px \'IBM Plex Mono\';letter-spacing:.9px;text-transform:uppercase;color:#7c8b97">' + t + '</div>' + (extra || '') + '</div>'; };
    return '<aside class="gpw-rail gpw-scroll" style="width:258px;flex:none;overflow:auto;border-right:1px solid #dde5ec;background:#fff;display:flex;flex-direction:column">'
      + '<div class="gpw-railsec" style="padding:15px 15px 14px;border-bottom:1px solid #eef2f5"><div style="font:600 10.5px \'IBM Plex Mono\';letter-spacing:.9px;text-transform:uppercase;color:#7c8b97;margin-bottom:9px">Lens — color the map by</div>' + lensRows + '</div>'
      + '<div class="gpw-railsec" style="padding:14px 15px;border-bottom:1px solid #eef2f5">' + lab('Filter by region', regionReset) + '<div style="display:flex;flex-wrap:wrap;gap:6px">' + regionPills + '</div></div>'
      + '<div class="gpw-railsec" style="padding:14px 15px;border-bottom:1px solid #eef2f5"><div style="font:600 10.5px \'IBM Plex Mono\';letter-spacing:.9px;text-transform:uppercase;color:#7c8b97;margin-bottom:9px">River hotspots</div>' + riverToggle + '</div>'
      + '<div class="gpw-railsec" style="padding:14px 15px">' + lab('Compare basket', compareClear) + basket + '</div></aside>';
  }

  function legendInner() {
    var L = lensCfg(), th = thresholds(), P = pal();
    var rows = '<div style="font:600 11px \'IBM Plex Sans\';color:#0c1e2e;margin-bottom:6px">' + L.label + (L.kind === 'time' ? ' · ' + state.year : '') + '</div>';
    rows += P.map(function (c, i) { return '<div style="display:flex;align-items:center;gap:7px;margin:2px 0"><span style="width:16px;height:11px;border-radius:2px;background:' + c + ';flex:none"></span><span style="font:500 10.5px \'IBM Plex Mono\';color:#6b7c89">' + (i === 0 ? 'lowest' : (i === P.length - 1 ? 'highest' : '≥ ' + fmtActive(th[i - 1]))) + '</span></div>'; }).join('');
    rows += '<div style="display:flex;align-items:center;gap:7px;margin-top:2px"><span style="width:16px;height:11px;border-radius:2px;background:' + NODATA + ';flex:none"></span><span style="font:500 10.5px \'IBM Plex Mono\';color:#6b7c89">no data</span></div>';
    if (state.rivers) rows += '<div style="display:flex;align-items:center;gap:7px;margin-top:7px;padding-top:7px;border-top:1px solid #eef2f5"><span style="width:11px;height:11px;border-radius:50%;background:#1565c0;opacity:.62;flex:none"></span><span style="font:500 10.5px \'IBM Plex Mono\';color:#6b7c89">river outlet · size = input</span></div>';
    return rows;
  }
  function mapSvgInner() {
    var th = thresholds(), L = lensCfg();
    var paths = DATA.features.map(function (f) {
      var p = f.properties, v = activeValue(p), sc = inScope(p.continent), sel = p.iso === state.selIso, cmp = state.compare.indexOf(p.iso) >= 0;
      return '<path class="gpw-co" data-act="select" data-arg="' + p.iso + '" data-iso="' + p.iso + '" d="' + f._d + '" fill="' + color(v, th) + '" stroke="' + (sel ? '#0c1e2e' : (cmp ? A : '#ffffff')) + '" stroke-width="' + (sel ? 1.7 : (cmp ? 1.4 : 0.4)) + '" opacity="' + (sc ? 1 : 0.2) + '" data-tip="' + esc(tipHtml(p, v)) + '"></path>';
    }).join('');
    var rivers = '';
    if (state.rivers) { var max = RIVERS[0].mid; rivers = '<g>' + RIVERS.map(function (r) { var pt = proj(r.lon, r.lat); var loc = (r.country ? esc(r.country) + (r.near ? ' (near)' : '') + ' · ' : ''); var tip = '<b>' + (r.name ? esc(r.name) : 'River outlet') + '</b><br>' + loc + Math.round(r.mid).toLocaleString() + ' t/yr<br>' + r.lat.toFixed(2) + ', ' + r.lon.toFixed(2); return '<circle class="gpw-river" cx="' + pt[0].toFixed(1) + '" cy="' + pt[1].toFixed(1) + '" r="' + (1.2 + Math.sqrt(r.mid / max) * 7).toFixed(2) + '" fill="#1565c0" fill-opacity=".6" stroke="#fff" stroke-width=".4" data-tip="' + esc(tip) + '"></circle>'; }).join('') + '</g>'; }
    return '<rect x="0" y="0" width="720" height="360" fill="' + SEA + '"></rect><g>' + paths + '</g>' + rivers;
  }
  function buildMap() {
    var L = lensCfg();
    var header = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 16px;border-bottom:1px solid #eef2f5;flex-wrap:wrap">'
      + '<div><div style="display:flex;align-items:baseline;gap:9px"><h2 style="margin:0;font:500 19px \'Newsreader\';color:#0c1e2e">' + L.label + '</h2><span style="font:600 11px \'IBM Plex Mono\';color:' + A + '">' + L.unit + '</span></div>'
      + '<div style="font:500 11.5px \'IBM Plex Sans\';color:#8b98a3;margin-top:2px;max-width:520px">' + L.blurb + '</div></div>'
      + (state.regions.length ? '<span style="font:600 11px \'IBM Plex Mono\';color:#48586a;background:#f1f5f8;border:1px solid #dde5ec;border-radius:7px;padding:4px 9px">scoped: ' + state.regions.join(', ') + '</span>' : '') + '</div>';
    var zoom = '<div style="position:absolute;right:14px;top:14px;display:flex;flex-direction:column;gap:5px">'
      + ['zoom-in', '+', 'zoom-out', '−', 'zoom-reset', '⤢'].reduce(function (acc, _, i, arr) { if (i % 2) return acc; return acc + '<button class="gpw-btn" data-act="' + arr[i] + '" style="width:30px;height:30px;border:1px solid #dde5ec;background:rgba(255,255,255,.95);border-radius:8px;font:600 15px \'IBM Plex Sans\';color:#0c1e2e;cursor:pointer;line-height:1;box-shadow:0 1px 4px rgba(12,30,46,.1)">' + arr[i + 1] + '</button>'; }, '') + '</div>';
    var legend = '<div id="gpwlegend" style="position:absolute;left:14px;bottom:14px;background:rgba(255,255,255,.95);border:1px solid #dde5ec;border-radius:9px;padding:10px 12px;font:500 11px \'IBM Plex Sans\';max-width:200px;box-shadow:0 2px 10px rgba(12,30,46,.08)">' + legendInner() + '</div>';
    var tip = '<div id="gpwtip" style="position:absolute;pointer-events:none;background:#0c1e2e;color:#fff;padding:6px 9px;border-radius:7px;font:500 11.5px \'IBM Plex Sans\';opacity:0;transition:opacity .08s;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.28);z-index:20;left:0;top:0"></div>';
    var svg = '<svg id="gpwsvg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;cursor:grab;touch-action:none">' + mapSvgInner() + '</svg>';
    var mapArea = '<div id="gpwmapwrap" style="position:relative;height:min(52vh,440px);background:' + SEA + '">' + svg + legend + zoom + tip + '</div>';
    return '<section style="background:#fff;border:1px solid #dde5ec;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(12,30,46,.04)">' + header + mapArea + (L.kind === 'time' ? buildTimeline() : '') + '</section>';
  }
  function buildTimeline() {
    var s = expSeries, n = s.length, idx = Math.max(0, s.findIndex(function (p) { return p[0] === state.year; }));
    var max = Math.max.apply(null, s.map(function (p) { return p[1]; })) || 1, W = 600, H = 34, area = 'M0 ' + H, line = '';
    s.forEach(function (p, i) { var x = i / (n - 1) * W, y = H - (p[1] / max) * (H - 4); area += 'L' + x.toFixed(1) + ' ' + y.toFixed(1); line += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); });
    area += 'L' + W + ' ' + H + 'Z'; var markX = idx / (n - 1) * W, markY = H - (s[idx][1] / max) * (H - 4);
    return '<div style="display:flex;align-items:center;gap:13px;padding:11px 16px;border-top:1px solid #eef2f5;background:#fafbfc">'
      + '<button id="gpwplay" class="gpw-btn" data-act="play" style="width:34px;height:34px;border-radius:50%;border:none;background:' + A + ';color:#fff;cursor:pointer;font:12px \'IBM Plex Sans\';flex:none">' + (state.playing ? '❚❚' : '▶') + '</button>'
      + '<div style="text-align:center;min-width:58px;flex:none"><div id="gpwtlyear" style="font:500 22px \'Newsreader\';color:#0c1e2e;line-height:1">' + state.year + '</div><div style="font:600 8.5px \'IBM Plex Mono\';color:#9aa7b2;text-transform:uppercase;letter-spacing:.5px">year</div></div>'
      + '<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px"><span style="font:600 10px \'IBM Plex Mono\';color:#8b98a3;text-transform:uppercase;letter-spacing:.4px">World plastic-waste exports</span><span id="gpwtlval" style="font:600 13px \'IBM Plex Sans\';color:' + A + '">' + fmtT(s[idx][1]) + '</span></div>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:30px;display:block;overflow:visible"><path d="' + area + '" fill="#dce6ef"></path><path d="' + line + '" fill="none" stroke="' + A + '" stroke-width="1.6"></path><line id="gpwtlmark" x1="' + markX + '" x2="' + markX + '" y1="0" y2="' + H + '" stroke="#0c1e2e" stroke-width="1.2"></line><circle id="gpwtldot" cx="' + markX + '" cy="' + markY + '" r="3.4" fill="' + A + '" stroke="#fff" stroke-width="1.2"></circle></svg>'
      + '<input id="gpwrange" type="range" min="0" max="' + (n - 1) + '" value="' + idx + '" step="1" style="width:100%;margin-top:2px;accent-color:' + A + '"></div></div>';
  }

  function rankSubText() { var L = lensCfg(); return 'by ' + L.short.toLowerCase() + (L.kind === 'time' ? ' · ' + state.year : ''); }
  function rankInner() {
    var rows = rankData(), top = rows.slice(0, 12), max = top.length ? top[0].v : 1;
    if (!top.length) return '<div style="margin-top:14px;font:500 12px \'IBM Plex Sans\';color:#9aa7b2">No countries with data in this scope.</div>';
    return '<div style="margin-top:11px;display:flex;flex-direction:column;gap:1px">' + top.map(function (r, i) {
      var cmp = state.compare.indexOf(r.iso) >= 0;
      return '<div class="gpw-row" data-act="select" data-arg="' + r.iso + '" style="display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:7px;cursor:pointer">'
        + '<span style="font:600 10px \'IBM Plex Mono\';color:#aeb9c2;width:15px;flex:none;text-align:right">' + (i + 1) + '</span>'
        + '<span style="font:600 12px \'IBM Plex Sans\';color:#1f3140;width:92px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.name) + '</span>'
        + '<span style="flex:1;height:9px;background:#eef2f5;border-radius:5px;overflow:hidden"><span style="display:block;height:100%;width:' + Math.max(2, r.v / max * 100) + '%;background:' + A + ';border-radius:5px"></span></span>'
        + '<span style="font:600 10.5px \'IBM Plex Mono\';color:#6b7c89;width:62px;flex:none;text-align:right">' + fmtActive(r.v) + '</span>'
        + '<span class="gpw-add" data-act="cmp-toggle" data-arg="' + r.iso + '" title="' + (cmp ? 'Remove from compare' : 'Add to compare') + '" style="opacity:' + (cmp ? 1 : 0) + ';width:18px;height:18px;flex:none;border-radius:5px;display:flex;align-items:center;justify-content:center;background:' + (cmp ? A : '#eef2f5') + ';color:' + (cmp ? '#fff' : '#6b7c89') + ';font:600 13px \'IBM Plex Sans\';line-height:1">' + (cmp ? '✓' : '+') + '</span></div>';
    }).join('') + '</div>';
  }
  function trendInner() {
    var ocean = state.trendMode === 'ocean', s = ocean ? oceanSeries : PROD, n = s.length, W = 300, H = 118, pad = 2;
    var max = Math.max.apply(null, s.map(function (p) { return p[1]; })) || 1, area = 'M0 ' + (H - pad), line = '';
    s.forEach(function (p, i) { var x = i / (n - 1) * W, y = (H - pad) - (p[1] / max) * (H - pad - 8); area += 'L' + x.toFixed(1) + ' ' + y.toFixed(1); line += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); });
    area += 'L' + W + ' ' + (H - pad) + 'Z'; var first = s[0], last = s[n - 1], ratio = ocean ? (last[1] / first[1]).toFixed(1) : Math.round(last[1] / first[1]), gid = 'tg' + (ocean ? 'o' : 'p');
    return '<div style="margin-top:8px"><div style="position:relative">'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:120px;display:block"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + A + '" stop-opacity=".28"></stop><stop offset="100%" stop-color="' + A + '" stop-opacity=".02"></stop></linearGradient></defs><path d="' + area + '" fill="url(#' + gid + ')"></path><path d="' + line + '" fill="none" stroke="' + A + '" stroke-width="2" stroke-linejoin="round"></path></svg>'
      + '<div style="position:absolute;left:0;bottom:2px;font:600 9.5px \'IBM Plex Mono\';color:#9aa7b2">' + first[0] + '</div><div style="position:absolute;right:0;bottom:2px;font:600 9.5px \'IBM Plex Mono\';color:#9aa7b2">' + last[0] + '</div></div>'
      + '<div style="display:flex;align-items:baseline;gap:7px;margin-top:9px"><span style="font:500 23px \'Newsreader\';color:#0c1e2e;line-height:1">' + compact(last[1]) + '</span><span style="font:600 11px \'IBM Plex Mono\';color:' + A + '">' + (ocean ? 't accumulated' : 't / year') + '</span></div>'
      + '<div style="font:500 11.5px/1.4 \'IBM Plex Sans\';color:#8b98a3;margin-top:4px">' + (ocean ? ('Plastic in the ocean has grown ×' + ratio + ' since 2000.') : ('Annual output is up ×' + ratio + ' since ' + first[0] + ' — a material explosion.')) + '</div></div>';
  }
  function riversInner() {
    var top = RIVERS.slice(0, 10), max = top[0].mid;
    return '<div style="margin-top:11px;display:flex;flex-direction:column;gap:1px">' + top.map(function (r, i) {
      return '<div class="gpw-row" data-act="focus-river" data-arg="' + i + '" title="Zoom to this outlet" style="display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:7px;cursor:pointer">'
        + '<span style="font:600 10px \'IBM Plex Mono\';color:#aeb9c2;width:15px;flex:none;text-align:right">' + (i + 1) + '</span>'
        + '<span style="width:9px;height:9px;border-radius:50%;background:#1565c0;opacity:.66;flex:none"></span>'
        + '<span title="' + esc((r.name ? r.name + ' · ' : '') + r.lat.toFixed(2) + ', ' + r.lon.toFixed(2)) + '" style="font:600 11px \'IBM Plex Sans\';color:#48586a;width:104px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.name || r.country || (r.lat.toFixed(1) + ', ' + r.lon.toFixed(1))) + '</span>'
        + '<span style="flex:1;height:9px;background:#eef2f5;border-radius:5px;overflow:hidden"><span style="display:block;height:100%;width:' + Math.max(3, r.mid / max * 100) + '%;background:#1565c0;opacity:.72;border-radius:5px"></span></span>'
        + '<span style="font:600 10.5px \'IBM Plex Mono\';color:#6b7c89;width:56px;flex:none;text-align:right">' + fmtT(r.mid) + '</span></div>';
    }).join('') + '</div>';
  }
  function card(title, sub, body, toggle) {
    return '<section style="background:#fff;border:1px solid #dde5ec;border-radius:12px;padding:14px 15px 15px;box-shadow:0 1px 2px rgba(12,30,46,.04)">'
      + '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px"><h3 style="margin:0;font:600 14.5px \'IBM Plex Sans\';color:#0c1e2e">' + title + '</h3>'
      + (toggle || (sub ? '<span style="font:500 10.5px \'IBM Plex Mono\';color:#8b98a3">' + sub + '</span>' : '')) + '</div>' + body + '</section>';
  }
  function trendToggle() {
    function b(k, t) { var on = state.trendMode === k; return '<button data-act="trend" data-arg="' + k + '" style="background:' + (on ? '#0c1e2e' : '#fff') + ';border:1px solid ' + (on ? '#0c1e2e' : '#dde5ec') + ';color:' + (on ? '#fff' : '#6b7c89') + ';font:600 10.5px \'IBM Plex Sans\';padding:4px 9px;cursor:pointer;border-radius:6px">' + t + '</button>'; }
    return '<div style="display:flex;gap:4px">' + b('prod', 'Production') + b('ocean', 'In ocean') + '</div>';
  }

  function miniSpark(iso, big) {
    var rec = TRADE.byIso[iso]; if (!rec) return '<span style="font:500 10px \'IBM Plex Mono\';color:#bcc6cf">—</span>';
    var pts = Object.keys(rec).map(function (y) { return [+y, rec[y]]; }).sort(function (a, b) { return a[0] - b[0]; });
    if (pts.length < 2) return '<span style="font:500 10px \'IBM Plex Mono\';color:#bcc6cf">—</span>';
    var W = big ? 320 : 72, H = big ? 64 : 20, max = Math.max.apply(null, pts.map(function (p) { return p[1]; })) || 1, minY = pts[0][0], span = (pts[pts.length - 1][0] - minY) || 1;
    var line = '', area = 'M0 ' + H;
    pts.forEach(function (p, i) { var x = (p[0] - minY) / span * W, y = (big ? H - 3 : H - 2) - (p[1] / max) * (H - (big ? 8 : 4)); line += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); area += 'L' + x.toFixed(1) + ' ' + y.toFixed(1); });
    if (big) { area += 'L' + W + ' ' + H + 'Z'; return '<div><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:64px;display:block"><path d="' + area + '" fill="' + A + '" fill-opacity=".12"></path><path d="' + line + '" fill="none" stroke="' + A + '" stroke-width="1.8"></path></svg><div style="display:flex;justify-content:space-between;font:600 9.5px \'IBM Plex Mono\';color:#9aa7b2;margin-top:2px"><span>' + minY + '</span><span>' + fmtT(pts[pts.length - 1][1]) + ' · ' + pts[pts.length - 1][0] + '</span></div></div>'; }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'px;height:' + H + 'px"><path d="' + line + '" fill="none" stroke="' + A + '" stroke-width="1.4"></path></svg>';
  }
  function compareBody() {
    var isos = state.compare;
    if (!isos.length) return '<div style="margin-top:12px;padding:26px 18px;text-align:center;background:#fafbfc;border:1px dashed #d4dde4;border-radius:10px"><div style="font:500 16px \'Newsreader\';color:#48586a">Build a side-by-side comparison</div><div style="font:500 12px/1.5 \'IBM Plex Sans\';color:#9aa7b2;margin-top:5px;max-width:440px;margin-inline:auto">Add countries from the map, the Top-emitters list (hover → +), or search. Each one becomes a column here — then export the set as CSV.</div></div>';
    var feats = isos.map(function (i) { return byIso[i]; }).filter(Boolean);
    var metrics = [['Mismanaged waste', 'mis'], ['Ocean-emission share', 'ocean'], ['Waste per person', 'pc']];
    var cell = function (inner) { return '<div style="background:#fff;padding:10px 12px">' + inner + '</div>'; };
    var head = '<div style="background:#fff;padding:10px 12px;font:600 10.5px \'IBM Plex Mono\';color:#9aa7b2;text-transform:uppercase;letter-spacing:.5px">metric</div>'
      + feats.map(function (f) { return '<div style="background:#fff;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:6px"><span style="font:600 13px \'IBM Plex Sans\';color:#0c1e2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(f.properties.name) + '</span><span class="gpw-chipx" data-act="cmp-del" data-arg="' + f.properties.iso + '" style="cursor:pointer;color:#9aa7b2;font-size:14px;line-height:1">×</span></div>'; }).join('');
    var rows = '';
    metrics.forEach(function (m) { rows += '<div style="background:#fff;padding:10px 12px;font:600 12px \'IBM Plex Sans\';color:#48586a">' + m[0] + '</div>' + feats.map(function (f) { var p = f.properties; return cell('<div style="font:600 13.5px \'IBM Plex Mono\';color:#0c1e2e">' + fmtSnap(m[1], p[m[1]]) + '</div><div style="font:500 10px \'IBM Plex Mono\';color:#9aa7b2;margin-top:1px">rank ' + (rankOf(p.iso, m[1]) || '—') + '</div>'); }).join(''); });
    rows += '<div style="background:#fff;padding:10px 12px;font:600 12px \'IBM Plex Sans\';color:#48586a">Exports trend</div>' + feats.map(function (f) { return cell(miniSpark(f.properties.iso, false)); }).join('');
    return '<div style="margin-top:12px;border:1px solid #eef2f5;border-radius:10px;overflow:hidden"><div style="display:grid;grid-template-columns:170px repeat(' + feats.length + ',minmax(96px,1fr));gap:1px;background:#eef2f5">' + head + rows + '</div></div>';
  }
  function compareActions() {
    if (!state.compare.length) return '';
    return '<div style="display:flex;gap:8px"><button class="gpw-btn" data-act="export-csv-compare" style="background:#fff;border:1px solid #dde5ec;color:#0c1e2e;font:600 11.5px \'IBM Plex Sans\';padding:6px 11px;border-radius:7px;cursor:pointer">⤓ Export CSV</button><button class="gpw-btn" data-act="cmp-clear" style="background:transparent;border:1px solid #dde5ec;color:#6b7c89;font:600 11.5px \'IBM Plex Sans\';padding:6px 11px;border-radius:7px;cursor:pointer">Clear all</button></div>';
  }

  function buildDrawer() {
    if (!state.selIso) return '';
    var f = byIso[state.selIso]; if (!f) return ''; var p = f.properties, cmp = state.compare.indexOf(p.iso) >= 0;
    function stat(label, val, sub, hot) { return '<div style="padding:11px 13px;border:1px solid #e6ecf1;border-radius:10px;margin-bottom:9px;background:' + (hot ? '#fff7f1' : '#fff') + '"><div style="font:600 10px \'IBM Plex Mono\';color:#9aa7b2;text-transform:uppercase;letter-spacing:.5px">' + label + '</div><div style="font:500 23px \'Newsreader\';color:#0c1e2e;margin:2px 0;line-height:1.05">' + val + '</div><div style="font:500 11px \'IBM Plex Mono\';color:#8b98a3">' + sub + '</div></div>'; }
    var expRec = TRADE.byIso[p.iso];
    return '<div data-act="drawer-close" style="position:fixed;inset:0;background:rgba(8,20,32,.32);z-index:80;display:flex;justify-content:flex-end">'
      + '<div class="gpw-drawer gpw-scroll" style="width:380px;max-width:100%;height:100%;background:#fff;overflow:auto;box-shadow:-12px 0 40px rgba(8,20,32,.2);animation:gpwdrawer .22s ease">'
      + '<div style="position:sticky;top:0;background:linear-gradient(180deg,#11314a,#0c1e2e);color:#fff;padding:16px 18px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div><div style="font:500 24px \'Newsreader\';line-height:1.05">' + esc(p.name) + '</div><div style="font:600 11px \'IBM Plex Mono\';color:#9db4c9;margin-top:3px">' + (p.continent || '') + ' · ' + p.iso + '</div></div><button data-act="drawer-close" style="background:rgba(255,255,255,.12);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px;flex:none">×</button></div>'
      + '<div style="padding:16px 18px">'
      + stat('Mismanaged plastic waste', fmtSnap('mis', p.mis), 'rank ' + (rankOf(p.iso, 'mis') || '—'), true)
      + stat('Share of ocean plastic emissions', fmtSnap('ocean', p.ocean), 'rank ' + (rankOf(p.iso, 'ocean') || '—'))
      + stat('Plastic waste per capita', fmtSnap('pc', p.pc), 'rank ' + (rankOf(p.iso, 'pc') || '—'))
      + (expRec ? '<div style="padding:11px 13px;border:1px solid #e6ecf1;border-radius:10px;margin-bottom:9px"><div style="font:600 10px \'IBM Plex Mono\';color:#9aa7b2;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Plastic-waste exports over time</div>' + miniSpark(p.iso, true) + '</div>' : '')
      + '<div style="display:flex;gap:8px;margin-top:4px"><button class="gpw-btn" data-act="cmp-toggle" data-arg="' + p.iso + '" style="flex:1;background:' + (cmp ? '#fff' : A) + ';border:1px solid ' + (cmp ? '#dde5ec' : A) + ';color:' + (cmp ? '#48586a' : '#fff') + ';font:600 13px \'IBM Plex Sans\';padding:10px;border-radius:9px;cursor:pointer">' + (cmp ? '✓ In compare — remove' : '+ Add to compare') + '</button><button class="gpw-btn" data-act="focus-country" data-arg="' + p.iso + '" style="background:#fff;border:1px solid #dde5ec;color:#0c1e2e;font:600 13px \'IBM Plex Sans\';padding:10px 13px;border-radius:9px;cursor:pointer">⤢ Zoom</button></div>'
      + fundLinks(p.iso)
      + '<div style="font:500 11px/1.5 \'IBM Plex Mono\';color:#9aa7b2;margin-top:12px">Estimates are modeled single-year snapshots — relative, not exact.</div></div></div></div>';
  }
  function fundLinks(iso) {
    if (!PROJECTS || PROJECTS.country_iso !== iso) return '';
    var sites = PROJECTS.projects.filter(function (x) { return x.type !== 'prevention'; });
    if (!sites.length) return '';
    var rows = sites.slice(0, 4).map(function (s) {
      return '<a href="fund.html#proj-' + s.id + '" style="display:flex;align-items:center;justify-content:space-between;gap:8px;text-decoration:none;padding:7px 0;border-top:1px solid #eef2f5"><span style="font:600 12px \'IBM Plex Sans\';color:#0c1e2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + s.name + '</span><span style="flex:none;font:600 11px \'IBM Plex Mono\';color:' + A + '">Fund →</span></a>';
    }).join('');
    return '<div style="margin-top:14px;border:1px solid #cfe3e6;border-radius:10px;padding:11px 13px;background:#f3fafb">'
      + '<div style="font:600 10px \'IBM Plex Mono\';color:' + A + ';text-transform:uppercase;letter-spacing:.5px">♥ Fund a cleanup here</div>'
      + '<div style="font:500 11px \'IBM Plex Sans\';color:#8b98a3;margin:3px 0 2px">' + sites.length + ' vetted local project' + (sites.length > 1 ? 's' : '') + ' you can support</div>'
      + rows + '</div>';
  }
  function buildAbout() {
    if (!state.aboutOpen) return '';
    var m = META, sources = (m && m.sources) || [];
    var caveats = ['Modeled estimates that disagree across studies — read them as relative hotspots, not exact tonnages.', 'The map shows where plastic is emitted, not where it washes up. Manufactured-in ≠ consumed-in ≠ emitted-from.', 'Country metrics are single-year snapshots (mismanaged 2019, per-capita 2010, ocean-share 2019).'];
    var srcRows = sources.map(function (s) { return '<div style="display:flex;justify-content:space-between;gap:12px;border:1px solid #e6ecf1;border-radius:9px;padding:10px 12px;margin-bottom:7px"><div><a href="' + s.url + '" target="_blank" rel="noopener" style="font:600 13px \'IBM Plex Sans\';color:' + A + ';text-decoration:none">' + esc(s.name) + '</a><div style="font:500 11px \'IBM Plex Mono\';color:#9aa7b2">' + esc(s.role || '') + '</div></div><span style="flex:none;background:#eaf3f4;color:#0c4f57;border-radius:20px;padding:2px 10px;font:600 11px \'IBM Plex Sans\';height:fit-content">' + esc(s.license || '') + '</span></div>'; }).join('');
    var lensList = LORDER.map(function (k) { var L = LENSES[k]; return '<li style="font:400 13px/1.6 \'IBM Plex Sans\';color:#33485a"><b>' + L.label + '</b> — ' + L.unit + '. ' + L.blurb + '</li>'; }).join('');
    var cav = caveats.map(function (c) { return '<div style="background:#fff7f1;border-left:3px solid #d4521b;border-radius:4px;padding:9px 13px;font:400 12.5px/1.5 \'IBM Plex Sans\';color:#5a4636;margin-bottom:6px">' + c + '</div>'; }).join('');
    return '<div data-act="about-close" style="position:fixed;inset:0;background:rgba(8,20,32,.5);z-index:90;display:flex;align-items:center;justify-content:center;padding:24px">'
      + '<div class="gpw-scroll" style="background:#fff;border-radius:14px;max-width:660px;width:100%;max-height:86vh;overflow:auto;box-shadow:0 30px 80px rgba(8,20,32,.45)">'
      + '<div style="position:sticky;top:0;background:linear-gradient(180deg,#11314a,#0c1e2e);color:#fff;padding:17px 22px;display:flex;align-items:center;justify-content:space-between"><h2 style="margin:0;font:500 21px \'Newsreader\'">About this data</h2><button data-act="about-close" style="background:rgba(255,255,255,.12);border:none;color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:16px">×</button></div>'
      + '<div style="padding:20px 22px"><p style="font:400 14px/1.6 \'IBM Plex Sans\';color:#33485a;margin-top:0">An open map of where ocean plastic <b>originates</b> — country emission estimates, the river outlets carrying the most plastic to sea, and trade flows over time. Switch the lens, filter by region, click a country, and build a side-by-side comparison.</p>'
      + '<h3 style="font:600 11px \'IBM Plex Mono\';letter-spacing:.5px;text-transform:uppercase;color:#0c1e2e;margin:18px 0 8px">Lenses</h3><ul style="margin:0;padding-left:18px">' + lensList + '</ul>'
      + '<h3 style="font:600 11px \'IBM Plex Mono\';letter-spacing:.5px;text-transform:uppercase;color:#0c1e2e;margin:18px 0 8px">Sources &amp; licences</h3>' + srcRows
      + '<div style="display:flex;justify-content:space-between;gap:12px;border:1px solid #e6ecf1;border-radius:9px;padding:10px 12px;margin-bottom:7px"><div><span style="font:600 13px \'IBM Plex Sans\';color:#33485a">OECD Global Plastics Outlook · UN Comtrade</span><div style="font:500 11px \'IBM Plex Mono\';color:#9aa7b2">time layers</div></div><span style="flex:none;background:#eaf3f4;color:#0c4f57;border-radius:20px;padding:2px 10px;font:600 11px \'IBM Plex Sans\';height:fit-content">CC-BY</span></div>'
      + '<h3 style="font:600 11px \'IBM Plex Mono\';letter-spacing:.5px;text-transform:uppercase;color:#0c1e2e;margin:18px 0 8px">How to read it</h3>' + cav
      + '<p style="font:500 11px \'IBM Plex Mono\';color:#9aa7b2;margin-top:14px">Generated ' + ((m && m.generated) || '—') + ' · open data, CC-BY.</p></div></div></div>';
  }
  function toastInner() { return state.toast ? '<div style="position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#0c1e2e;color:#fff;padding:10px 18px;border-radius:10px;font:600 12.5px \'IBM Plex Sans\';box-shadow:0 10px 30px rgba(8,20,32,.32);z-index:100;animation:gpwfade .15s">' + esc(state.toast) + '</div>' : ''; }

  // ================= RENDER =================
  function render() {
    if (state.err) { app.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#6b7c89;font:500 14px \'IBM Plex Sans\';text-align:center;padding:30px">Couldn’t load the data files.<br><span style="font:500 12px \'IBM Plex Mono\';color:#9aa7b2">Serve this folder over HTTP (python -m http.server). data/ must sit beside index.html.</span></div>'; return; }
    if (!state.loaded) { app.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;background:' + SEA + '"><div style="width:34px;height:34px;border:3px solid #cfdcea;border-top-color:' + A + ';border-radius:50%;animation:gpwspin .8s linear infinite"></div></div>'; return; }
    app.innerHTML = buildHeader() + buildKpis()
      + '<div class="gpw-body" style="display:flex;flex:1;min-height:0">' + buildRail()
      + '<main class="gpw-main gpw-scroll" style="flex:1;min-width:0;overflow:auto;padding:16px">'
      + buildMap()
      + '<div class="gpw-cards" style="display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:14px;margin-top:14px;align-items:start">'
      + card('Top emitters', rankSubText(), '<div id="gpwrank">' + rankInner() + '</div>')
      + card('The material explosion', '', trendInner(), trendToggle())
      + card('River hotspots', 'top 10 of 150', riversInner())
      + '</div>'
      + '<section style="background:#fff;border:1px solid #dde5ec;border-radius:12px;padding:15px;margin-top:14px;box-shadow:0 1px 2px rgba(12,30,46,.04)"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px"><h3 style="margin:0;font:600 15px \'IBM Plex Sans\';color:#0c1e2e">Compare countries <span style="font:500 12px \'IBM Plex Mono\';color:#8b98a3">' + (state.compare.length ? '· ' + state.compare.length : '') + '</span></h3>' + compareActions() + '</div>' + compareBody() + '</section>'
      + '<footer style="margin:16px 2px 6px;font:500 11px \'IBM Plex Mono\';color:#8593a0;line-height:1.6">Open data · CC-BY · Sources: Our World in Data, Lebreton et al. 2017, OECD, UN Comtrade, Natural Earth. Modeled estimates — relative hotspots, not exact tonnages. Generated ' + ((META && META.generated) || '—') + '.</footer>'
      + '</main></div>'
      + buildDrawer() + buildAbout() + '<div id="gpwtoast">' + toastInner() + '</div>';
    applyView();
  }
  function renderToastOnly() { var t = el('gpwtoast'); if (t) t.innerHTML = toastInner(); }

  // partial update for time-lens year scrub/play (no full re-render)
  function updateYear(y) {
    state.year = y;
    var th = thresholds(), svg = el('gpwsvg');
    if (svg) { var paths = svg.querySelectorAll('.gpw-co'); for (var i = 0; i < paths.length; i++) { var f = byIso[paths[i].getAttribute('data-iso')]; if (!f) continue; var v = activeValue(f.properties); paths[i].setAttribute('fill', color(v, th)); paths[i].setAttribute('data-tip', esc(tipHtml(f.properties, v))); } }
    var lg = el('gpwlegend'); if (lg) lg.innerHTML = legendInner();
    var rk = el('gpwrank'); if (rk) rk.innerHTML = rankInner();
    var s = expSeries, n = s.length, idx = Math.max(0, s.findIndex(function (p) { return p[0] === y; })), max = Math.max.apply(null, s.map(function (p) { return p[1]; })) || 1;
    var yr = el('gpwtlyear'); if (yr) yr.textContent = y;
    var val = el('gpwtlval'); if (val) val.textContent = fmtT(s[idx][1]);
    var mark = el('gpwtlmark'), dot = el('gpwtldot'), rng = el('gpwrange');
    var mx = idx / (n - 1) * 600; if (mark) { mark.setAttribute('x1', mx); mark.setAttribute('x2', mx); } if (dot) { dot.setAttribute('cx', mx); dot.setAttribute('cy', (34 - (s[idx][1] / max) * 30)); }
    if (rng && document.activeElement !== rng) rng.value = idx;
  }

  // ================= EVENTS (delegated) =================
  app.addEventListener('click', function (e) {
    if (state.exportOpen && !e.target.closest('#gpwexport')) state.exportOpen = false;
    var t = e.target.closest('[data-act]');
    if (!t) { if (!el('gpwexport') || !document.querySelector('[data-act="export-toggle"]')) return; render(); return; }
    var act = t.getAttribute('data-act'), arg = t.getAttribute('data-arg');
    switch (act) {
      case 'lens': setLens(arg); break;
      case 'region': toggleRegion(arg); break;
      case 'region-reset': state.regions = []; render(); break;
      case 'rivers': state.rivers = !state.rivers; render(); break;
      case 'cmp-del': removeCompare(arg); break;
      case 'cmp-clear': state.compare = []; render(); break;
      case 'cmp-toggle': e.stopPropagation(); (state.compare.indexOf(arg) >= 0 ? removeCompare : addCompare)(arg); break;
      case 'select': if (!pan.moved) selectCountry(arg); break;
      case 'focus-river': { var r = RIVERS[+arg]; focusPoint(r.lon, r.lat, 5.5); break; }
      case 'focus-country': focusCountry(arg); break;
      case 'trend': state.trendMode = arg; render(); break;
      case 'zoom-in': zoomCenter(1.5); break;
      case 'zoom-out': zoomCenter(1 / 1.5); break;
      case 'zoom-reset': resetView(); break;
      case 'about': state.aboutOpen = true; render(); break;
      case 'about-close': if (e.target === t) { state.aboutOpen = false; render(); } break;
      case 'export-toggle': state.exportOpen = !state.exportOpen; render(); break;
      case 'export-png': exportPNG(); break;
      case 'export-csv-all': exportCSV('all'); break;
      case 'export-csv-compare': exportCSV('compare'); break;
      case 'drawer-close': if (e.target === t) closeDrawer(); break;
      case 'play': togglePlay(); break;
      default: render();
    }
  });
  app.addEventListener('input', function (e) {
    if (e.target.id === 'gpwrange') { stopPlay(); updateYear(expSeries[+e.target.value][0]); }
  });
  app.addEventListener('change', function (e) {
    if (e.target.id === 'gpwsearch') { var q = e.target.value.trim().toLowerCase(); var f = DATA.features.find(function (x) { return x.properties.name.toLowerCase() === q; }); if (f) { state.search = ''; selectCountry(f.properties.iso); } }
  });
  app.addEventListener('mousemove', function (e) {
    var t = e.target.closest('.gpw-co,.gpw-river'); var tip = el('gpwtip'), wrap = el('gpwmapwrap'); if (!tip || !wrap) return;
    if (t && t.getAttribute('data-tip')) { var r = wrap.getBoundingClientRect(); tip.style.opacity = 1; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px'; tip.innerHTML = t.getAttribute('data-tip'); }
    else tip.style.opacity = 0;
  });
  app.addEventListener('mousedown', function (e) { if (e.target.closest('#gpwsvg')) { pan.active = true; pan.moved = false; pan.x = e.clientX; pan.y = e.clientY; } });
  app.addEventListener('wheel', function (e) { if (e.target.closest('#gpwsvg')) { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18); } }, { passive: false });
  window.addEventListener('mousemove', function (e) {
    if (!pan.active) return; var dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
    var svg = el('gpwsvg'); if (!svg) return; var v = curVBobj(), r = svg.getBoundingClientRect(); view.cx -= dx / r.width * v.w; view.cy -= dy / r.height * v.h; clampView(); applyView(); pan.x = e.clientX; pan.y = e.clientY;
  });
  window.addEventListener('mouseup', function () { setTimeout(function () { pan.moved = false; }, 0); pan.active = false; });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (state.aboutOpen) { state.aboutOpen = false; render(); } else if (state.exportOpen) { state.exportOpen = false; render(); } else if (state.selIso) closeDrawer(); } });

  // ================= LOAD =================
  function process() {
    DATA.features.forEach(function (f) { f._d = geomPath(f.geometry); f._bbox = bbox(f); byIso[f.properties.iso] = f; });
    RIVERS.sort(function (a, b) { return b.mid - a.mid; });
    var by = {}, T = TRADE.byIso; Object.keys(T).forEach(function (iso) { var r = T[iso]; Object.keys(r).forEach(function (y) { by[y] = (by[y] || 0) + r[y]; }); });
    expSeries = Object.keys(by).map(function (y) { return [+y, by[y]]; }).sort(function (a, b) { return a[0] - b[0]; });
    var R = REGIONS.regions, oy = {}; Object.keys(R).forEach(function (rg) { var rec = R[rg]; Object.keys(rec).forEach(function (y) { oy[y] = (oy[y] || 0) + rec[y]; }); });
    oceanSeries = Object.keys(oy).map(function (y) { return [+y, oy[y]]; }).sort(function (a, b) { return a[0] - b[0]; });
    kMis = DATA.features.reduce(function (s, f) { return s + (f.properties.mis || 0); }, 0);
    kRiver = RIVERS.reduce(function (s, r) { return s + r.mid; }, 0);
    kProdL = PROD[PROD.length - 1]; kProdF = PROD[0]; kOceL = oceanSeries[oceanSeries.length - 1]; kOceF = oceanSeries[0];
  }
  render();
  Promise.all([
    fetch('data/countries.geojson').then(function (r) { return r.json(); }),
    fetch('data/rivers.json').then(function (r) { return r.json(); }),
    fetch('data/meta.json').then(function (r) { return r.json(); }),
    fetch('data/production.json').then(function (r) { return r.json(); }),
    fetch('data/timeline-regions.json').then(function (r) { return r.json(); }),
    fetch('data/timeline-trade.json').then(function (r) { return r.json(); }),
    fetch('data/projects.json').then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (res) {
    DATA = res[0]; RIVERS = res[1]; META = res[2]; PROD = res[3].series; REGIONS = res[4]; TRADE = res[5]; PROJECTS = res[6];
    process(); state.year = expSeries[expSeries.length - 1][0]; state.loaded = true;
    var hc = (location.hash.match(/c=([A-Za-z]{2,3})/) || [])[1];   // deep-link e.g. #c=PHL opens that country's drawer (+ fund block)
    if (hc && byIso[hc.toUpperCase()]) state.selIso = hc.toUpperCase();
    render();
    if (state.selIso) focusCountry(state.selIso);
  }).catch(function (err) { console.error(err); state.err = String(err); render(); });
})();
