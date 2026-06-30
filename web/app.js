/* Global Plastics Watch — vanilla JS, no dependencies.
   Snapshot choropleth + river hotspots + animated time layers + continent rollup,
   zoom/pan, search, shareable URLs, production timeline. */
(function () {
  "use strict";

  var PAL = ['#ffffcc', '#ffeda0', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];
  var NODATA = '#e6eaee';
  var BASE = { x: 0, y: 14, w: 720, h: 292 };

  // state.timeKey null => snapshot metric (state.metric). Otherwise an animated time layer + state.year.
  var state = { metric: 'mis', timeKey: null, year: null, rivers: true, selIso: null, rollup: false };
  var view = { scale: 1, cx: BASE.x + BASE.w / 2, cy: BASE.y + BASE.h / 2 };
  var DATA = null, META = null, RIVERS = null, PROD = null, TIME = {};

  var svg = document.getElementById('map');
  var tip = document.getElementById('tip');
  function svgEl(n) { return document.createElementNS('http://www.w3.org/2000/svg', n); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function proj(lon, lat) { return [(lon + 180) * 2, (90 - lat) * 2]; }

  /* ---------- zoom / pan ---------- */
  function curVB() {
    var w = BASE.w / view.scale, h = BASE.h / view.scale;
    var x = clamp(view.cx - w / 2, BASE.x, BASE.x + BASE.w - w);
    var y = clamp(view.cy - h / 2, BASE.y, BASE.y + BASE.h - h);
    return { x: x, y: y, w: w, h: h };
  }
  function applyView() { var v = curVB(); svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h); }
  function svgPoint(cx, cy) {
    var r = svg.getBoundingClientRect(), v = curVB();
    if (!r.width || !r.height) return { x: view.cx, y: view.cy };
    return { x: v.x + (cx - r.left) / r.width * v.w, y: v.y + (cy - r.top) / r.height * v.h };
  }
  function zoomAt(cx, cy, factor) {
    var v0 = curVB(), p = svgPoint(cx, cy);
    view.scale = clamp(view.scale * factor, 1, 9);
    var w = BASE.w / view.scale, h = BASE.h / view.scale;
    var fx = (p.x - v0.x) / v0.w, fy = (p.y - v0.y) / v0.h;
    view.cx = (p.x - fx * w) + w / 2; view.cy = (p.y - fy * h) + h / 2; applyView();
  }
  function zoomCenter(f) { var r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
  var pan = { active: false, x: 0, y: 0, moved: false };
  svg.addEventListener('mousedown', function (e) { pan.active = true; pan.moved = false; pan.x = e.clientX; pan.y = e.clientY; svg.classList.add('grabbing'); });
  window.addEventListener('mousemove', function (e) {
    if (!pan.active) return;
    var dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
    var v = curVB(), r = svg.getBoundingClientRect();
    view.cx -= dx * (v.w / r.width); view.cy -= dy * (v.h / r.height);
    pan.x = e.clientX; pan.y = e.clientY; applyView();
  });
  window.addEventListener('mouseup', function () { pan.active = false; svg.classList.remove('grabbing'); });
  svg.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
  document.getElementById('zin').addEventListener('click', function () { zoomCenter(1.5); });
  document.getElementById('zout').addEventListener('click', function () { zoomCenter(1 / 1.5); });
  document.getElementById('zrst').addEventListener('click', function () { view = { scale: 1, cx: BASE.x + BASE.w / 2, cy: BASE.y + BASE.h / 2 }; applyView(); });

  /* ---------- active value model (snapshot metric OR time layer) ---------- */
  function isTime() { return !!state.timeKey; }
  function activeValue(props) {
    if (!isTime()) return props[state.metric];
    var L = TIME[state.timeKey], y = String(state.year);
    if (L.kind === 'region') { var reg = L.data.isoRegion[props.iso]; return reg && L.data.regions[reg] ? (L.data.regions[reg][y] != null ? L.data.regions[reg][y] : null) : null; }
    var rec = L.data.byIso[props.iso]; return rec && rec[y] != null ? rec[y] : null;
  }
  function activeUnit() { return isTime() ? 'tonnes' : META.metrics[state.metric].unit; }
  function activeLabel() { return isTime() ? TIME[state.timeKey].label : META.metrics[state.metric].label; }
  function fmtT(v) { if (v == null || isNaN(v)) return 'no data'; v = +v; if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M t'; if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k t'; return Math.round(v) + ' t'; }
  function fmtSnap(m, v) { if (v == null || isNaN(v)) return 'no data'; if (m === 'mis') return fmtT(v); if (m === 'ocean') return v.toFixed(2) + '%'; return v.toFixed(3) + ' kg/p/d'; }
  function fmtActive(v) { return isTime() ? fmtT(v) : fmtSnap(state.metric, v); }

  function activeValues() {
    if (isTime() && TIME[state.timeKey].kind === 'region') {
      var L = TIME[state.timeKey], y = String(state.year);
      return Object.keys(L.data.regions).map(function (r) { return L.data.regions[r][y]; }).filter(function (v) { return v != null && !isNaN(v); }).sort(function (a, b) { return a - b; });
    }
    return DATA.features.map(function (f) { return activeValue(f.properties); }).filter(function (v) { return v != null && !isNaN(v); }).sort(function (a, b) { return a - b; });
  }
  function thresholds() {
    var v = activeValues(), q = [];
    for (var i = 1; i < 6; i++) q.push(v[Math.floor(i / 6 * v.length)]);
    return q;
  }
  function color(val, th) { if (val == null || isNaN(val)) return NODATA; var i = 0; while (i < th.length && val >= th[i]) i++; return PAL[i]; }

  /* ---------- geometry ---------- */
  function ringPath(ring) { var d = ''; for (var i = 0; i < ring.length; i++) { var p = proj(ring[i][0], ring[i][1]); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } return d + 'Z'; }
  function geomPath(g) { var d = '', polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (var a = 0; a < polys.length; a++) for (var b = 0; b < polys[a].length; b++) d += ringPath(polys[a][b]); return d; }

  function showTip(e, html) { tip.style.opacity = 1; var r = svg.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 10) + 'px'; tip.innerHTML = html; }
  function hideTip() { tip.style.opacity = 0; }

  function draw() {
    var th = thresholds();
    svg.innerHTML = '';
    var ocean = svgEl('rect'); ocean.setAttribute('x', 0); ocean.setAttribute('y', 0); ocean.setAttribute('width', 720); ocean.setAttribute('height', 360); ocean.setAttribute('fill', '#dbe9f4'); svg.appendChild(ocean);
    DATA.features.forEach(function (f) {
      var val = activeValue(f.properties);
      var p = svgEl('path');
      p.setAttribute('d', geomPath(f.geometry));
      p.setAttribute('fill', color(val, th));
      p.setAttribute('class', 'country' + (f.properties.iso === state.selIso ? ' sel' : ''));
      p.addEventListener('mousemove', function (e) { showTip(e, '<b>' + f.properties.name + '</b><br>' + activeLabel() + (isTime() ? ' (' + state.year + ')' : '') + ': ' + fmtActive(val)); });
      p.addEventListener('mouseleave', hideTip);
      p.addEventListener('click', function () { if (!pan.moved) select(f.properties.iso); });
      svg.appendChild(p);
    });
    if (state.rivers) drawRivers();
    applyView();
    legend();
  }
  function drawRivers() {
    var max = RIVERS[0].mid;
    RIVERS.forEach(function (r) {
      var pt = proj(r.lon, r.lat), c = svgEl('circle');
      c.setAttribute('cx', pt[0].toFixed(1)); c.setAttribute('cy', pt[1].toFixed(1));
      c.setAttribute('r', (1.2 + Math.sqrt(r.mid / max) * 7).toFixed(2)); c.setAttribute('class', 'river');
      c.addEventListener('mousemove', function (e) { showTip(e, '<b>River outlet</b><br>Plastic input: ' + Math.round(r.mid).toLocaleString() + ' t/yr<br>' + r.lat + ', ' + r.lon); });
      c.addEventListener('mouseleave', hideTip);
      svg.appendChild(c);
    });
  }
  function legend() {
    var el = document.getElementById('legend'), th = thresholds();
    var title = activeLabel() + (isTime() ? ' · ' + state.year : '') + ' (' + activeUnit() + ')';
    var h = '<div class="t">' + title + '</div>';
    for (var i = 0; i < PAL.length; i++) { var lab = i === 0 ? 'lowest' : (i === PAL.length - 1 ? 'highest' : '≥ ' + fmtActive(th[i - 1])); h += '<div class="row"><span class="sw" style="background:' + PAL[i] + '"></span>' + lab + '</div>'; }
    h += '<div class="row"><span class="sw" style="background:' + NODATA + '"></span>no data</div>';
    if (isTime() && TIME[state.timeKey].kind === 'region') h += '<div class="riv" style="border-top:1px solid var(--line);margin-top:8px;padding-top:7px">Regional resolution (OECD)</div>';
    if (state.rivers) h += '<div class="riv"><span class="dot"></span>river outlet (size = plastic input)</div>';
    el.innerHTML = h;
  }

  /* ---------- dashboard ---------- */
  function rankOfSnap(iso, m) {
    var arr = DATA.features.filter(function (f) { return f.properties[m] != null; }).sort(function (a, b) { return b.properties[m] - a.properties[m]; });
    var i = arr.findIndex(function (f) { return f.properties.iso === iso; });
    return i < 0 ? null : (i + 1) + ' of ' + arr.length;
  }
  function continentAggFn(valueFn) {
    var agg = {};
    DATA.features.forEach(function (f) { var c = f.properties.continent; if (!c || c === 'Seven seas (open ocean)') return; var v = valueFn(f); if (v == null) return; agg[c] = (agg[c] || 0) + v; });
    return Object.keys(agg).map(function (c) { return { name: c, v: agg[c] }; }).sort(function (a, b) { return b.v - a.v; });
  }
  function rankRows(items, max, fmtv, isoAttr) {
    return items.map(function (it) {
      var w = max ? (it.v / max * 100).toFixed(0) : 0;
      return '<div class="bar"' + (isoAttr && it.iso ? ' data-iso="' + it.iso + '"' : '') + '><span class="nm">' + it.name + '</span><span class="track"><span class="fill" style="width:' + w + '%"></span></span><span class="vl">' + fmtv(it.v) + '</span></div>';
    }).join('');
  }
  function panel() {
    var el = document.getElementById('panel');
    if (state.selIso) { return countryPanel(el); }
    var h = '<h2>Global overview</h2>';

    // Regional time layer (OECD) — inherently 9 regions, no rollup toggle.
    if (isTime() && TIME[state.timeKey].kind === 'region') {
      var L = TIME[state.timeKey], y = String(state.year);
      var rows = Object.keys(L.data.regions).map(function (r) { return { name: r, v: L.data.regions[r][y] }; }).filter(function (x) { return x.v != null; }).sort(function (a, b) { return b.v - a.v; });
      var total = rows.reduce(function (s, x) { return s + x.v; }, 0), max = rows.length ? rows[0].v : 1;
      h += '<div class="sub">' + L.label + ' · ' + state.year + ' · regional (OECD)</div>';
      h += '<div class="stat"><div class="k">World total · ' + state.year + '</div><div class="v">' + fmtT(total) + '</div><div class="x">' + L.label.toLowerCase() + '</div></div>';
      h += '<div class="toplist"><div class="t">By region — ' + state.year + '</div>' + rankRows(rows.slice(0, 9), max, fmtT, false) + '</div>';
      el.innerHTML = h; return;
    }

    // Per-country views: snapshot (mis/ocean/pc) OR the trade time layer (exports). Both support rollup.
    var valueFn, fmtv, label, additive;
    if (isTime()) {
      valueFn = function (f) { return activeValue(f.properties); }; fmtv = fmtT; label = activeLabel() + ' · ' + state.year; additive = true;
      var wtot = DATA.features.reduce(function (s, f) { var v = valueFn(f); return s + (v || 0); }, 0);
      h += '<div class="sub">' + activeLabel() + ' · ' + state.year + ' · by country (trade)</div>';
      h += '<div class="stat"><div class="k">World exports · ' + state.year + '</div><div class="v">' + fmtT(wtot) + '</div><div class="x">plastic waste traded</div></div>';
    } else {
      var m = state.metric; valueFn = function (f) { return f.properties[m]; }; fmtv = function (v) { return fmtSnap(m, v); }; label = META.metrics[m].label; additive = (m === 'mis' || m === 'ocean');
      var tot = DATA.features.reduce(function (s, f) { return s + (f.properties.mis || 0); }, 0);
      h += '<div class="sub">Click any country for its profile.</div>';
      h += '<div class="stat"><div class="k">Global mismanaged plastic</div><div class="v">' + (tot / 1e6).toFixed(1) + 'M t/yr</div><div class="x">across ' + META.counts.countries_with_data + ' countries (' + META.metrics.mis.year + ')</div></div>';
    }
    if (additive) h += '<div class="seg"><button class="' + (state.rollup ? '' : 'on') + '" data-roll="0">By country</button><button class="' + (state.rollup ? 'on' : '') + '" data-roll="1">By region</button></div>';
    if (additive && state.rollup) {
      var ca = continentAggFn(valueFn);
      h += '<div class="toplist"><div class="t">Continents — ' + label + '</div>' + rankRows(ca, ca.length ? ca[0].v : 1, fmtv, false) + '</div>';
    } else {
      var arr = DATA.features.map(function (f) { return { name: f.properties.name, iso: f.properties.iso, v: valueFn(f) }; }).filter(function (x) { return x.v != null; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 10);
      h += '<div class="toplist"><div class="t">' + (isTime() ? 'Top 10 exporters' : 'Top 10') + ' — ' + label + '</div>' + rankRows(arr, arr.length ? arr[0].v : 1, fmtv, true) + '</div>';
    }
    el.innerHTML = h;
    Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (b) { b.addEventListener('click', function () { state.rollup = b.getAttribute('data-roll') === '1'; panel(); }); });
    bindBars();
  }
  function countryPanel(el) {
    var f = DATA.features.find(function (x) { return x.properties.iso === state.selIso; }); if (!f) { state.selIso = null; return panel(); }
    var pr = f.properties;
    var h = '<span class="back" id="back">← Global overview</span><h2>' + pr.name + '</h2><div class="sub">' + (pr.continent || '') + ' · ' + pr.iso + '</div>';
    h += stat('Mismanaged plastic waste', fmtSnap('mis', pr.mis), 'rank ' + (rankOfSnap(pr.iso, 'mis') || '—'));
    h += stat('Share of ocean plastic emissions', fmtSnap('ocean', pr.ocean), 'rank ' + (rankOfSnap(pr.iso, 'ocean') || '—'));
    h += stat('Plastic waste per capita', fmtSnap('pc', pr.pc), 'rank ' + (rankOfSnap(pr.iso, 'pc') || '—'));
    if (isTime()) { var val = activeValue(pr); h += stat(activeLabel() + ' · ' + state.year, fmtActive(val), TIME[state.timeKey].kind === 'region' ? 'regional value (OECD)' : 'this country'); }
    h += '<div class="sub" style="margin-top:10px">Tip: click ' + pr.name + ' again on the map to deselect.</div>';
    el.innerHTML = h;
    document.getElementById('back').addEventListener('click', function () { select(null); });
  }
  function stat(k, v, x) { return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="x">' + x + '</div></div>'; }
  function bindBars() { Array.prototype.forEach.call(document.querySelectorAll('.bar[data-iso]'), function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-iso')); }); }); }

  /* ---------- focus / select ---------- */
  function featureBBox(f) {
    if (f._bbox) return f._bbox;
    var mnx = 180, mxx = -180, mny = 90, mxy = -90, polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    polys.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (pt) { if (pt[0] < mnx) mnx = pt[0]; if (pt[0] > mxx) mxx = pt[0]; if (pt[1] < mny) mny = pt[1]; if (pt[1] > mxy) mxy = pt[1]; }); }); });
    f._bbox = { minLon: mnx, maxLon: mxx, minLat: mny, maxLat: mxy }; return f._bbox;
  }
  var animTimer = null;
  function animateView(target) {
    var s = { scale: view.scale, cx: view.cx, cy: view.cy }, t0 = null, dur = 430;
    function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function step(ts) { if (t0 == null) t0 = ts; var k = Math.min((ts - t0) / dur, 1), e = ease(k); view.scale = s.scale + (target.scale - s.scale) * e; view.cx = s.cx + (target.cx - s.cx) * e; view.cy = s.cy + (target.cy - s.cy) * e; applyView(); if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
    clearTimeout(animTimer); animTimer = setTimeout(function () { view.scale = target.scale; view.cx = target.cx; view.cy = target.cy; applyView(); }, dur + 50);
  }
  function focusCountry(iso) {
    var f = DATA.features.find(function (x) { return x.properties.iso === iso; }); if (!f) return;
    var b = featureBBox(f), x1 = (b.minLon + 180) * 2, x2 = (b.maxLon + 180) * 2, y1 = (90 - b.maxLat) * 2, y2 = (90 - b.minLat) * 2;
    var bw = Math.max(x2 - x1, 4), bh = Math.max(y2 - y1, 4), sc = clamp(Math.min(BASE.w / (bw * 1.8), BASE.h / (bh * 1.8)), 1, 6);
    animateView({ scale: sc, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 });
  }
  function resetView() { animateView({ scale: 1, cx: BASE.x + BASE.w / 2, cy: BASE.y + BASE.h / 2 }); }
  function select(iso) {
    var next = (iso && iso === state.selIso) ? null : iso;
    state.selIso = next; draw(); panel(); syncHash();
    if (next) focusCountry(next); else resetView();
  }

  /* ---------- narrated story ---------- */
  function viewForBox(mnLon, mnLat, mxLon, mxLat) {
    var x1 = (mnLon + 180) * 2, x2 = (mxLon + 180) * 2, y1 = (90 - mxLat) * 2, y2 = (90 - mnLat) * 2;
    var bw = Math.max(x2 - x1, 4), bh = Math.max(y2 - y1, 4);
    return { scale: clamp(Math.min(BASE.w / (bw * 1.25), BASE.h / (bh * 1.25)), 1, 9), cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  }
  var STORY = [
    { t: 'A material explosion', x: 'In 1950 the world made about 2 million tonnes of plastic a year — a genuinely new material. Watch the timeline below.', o: { metric: 'mis', rivers: false, tlYear: 1950 } },
    { t: '230× in seventy years', x: 'By 2019 it was about 460 million tonnes a year — a roughly 230-fold rise, outpacing almost every other material humans make.', o: { metric: 'mis', rivers: false, tlYear: 2019 } },
    { t: 'Where it leaks', x: 'Not all of it is managed. About 61.7 million tonnes a year is "mismanaged" — uncollected, dumped or burned — and it concentrates in fast-growing economies.', o: { metric: 'mis', rivers: false } },
    { t: 'A thousand rivers', x: 'Most ocean-bound plastic arrives through rivers. These 150 outlets carry the heaviest loads, clustered across South & Southeast Asia.', o: { metric: 'mis', rivers: true, box: [60, -11, 145, 42] } },
    { t: 'Piling up in the sea', x: 'Plastic accumulating in the ocean roughly tripled between 2000 and 2019 — from about 10 to 30 million tonnes. Press play on the timeline.', o: { timeKey: 'ocean_acc', year: 2000, rivers: false, play: true } },
    { t: 'Exporting the problem', x: 'For decades wealthy countries shipped their plastic waste abroad — until China’s 2018 import ban upended the global trade.', o: { timeKey: 'exports', year: 2018, rivers: false } },
    { t: 'Now it’s yours to explore', x: 'Switch metrics, search any country, scrub the timelines, toggle "By region", and download all the data — it’s open.', o: { metric: 'mis', rivers: true } },
  ];
  var storyIdx = 0;
  function applyStory(o) {
    if (playTimer) togglePlay();
    if (o.rivers !== undefined) { state.rivers = o.rivers; document.getElementById('rivertoggle').checked = o.rivers; }
    state.selIso = null; state.rollup = false;
    if (o.timeKey) { state.timeKey = o.timeKey; state.year = o.year != null ? o.year : TIME[o.timeKey].years[1]; }
    else { state.timeKey = null; if (o.metric) state.metric = o.metric; }
    buildControls(); configureTimeline();
    if (!isTime() && o.tlYear != null) { var s = TLS.series; for (var i = 0; i < s.length; i++) { if (s[i][0] === o.tlYear) { setIdx(i); break; } } }
    draw(); panel(); syncHash();
    animateView(o.box ? viewForBox(o.box[0], o.box[1], o.box[2], o.box[3]) : { scale: 1, cx: BASE.x + BASE.w / 2, cy: BASE.y + BASE.h / 2 });
    if (o.play && isTime() && !playTimer) togglePlay();
  }
  function gotoStep(i) {
    storyIdx = clamp(i, 0, STORY.length - 1);
    var s = STORY[storyIdx], card = document.getElementById('story');
    applyStory(s.o);
    card.querySelector('.st-prog').textContent = (storyIdx + 1) + ' / ' + STORY.length;
    card.querySelector('.st-title').textContent = s.t;
    card.querySelector('.st-text').textContent = s.x;
    document.getElementById('stprev').disabled = storyIdx === 0;
    document.getElementById('stnext').textContent = storyIdx === STORY.length - 1 ? 'Finish' : 'Next ›';
  }
  function startStory() { if (!DATA) return; document.getElementById('story').classList.add('open'); gotoStep(0); }
  function exitStory() { if (playTimer) togglePlay(); document.getElementById('story').classList.remove('open'); }
  function on(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
  on('storybtn', 'click', startStory);
  on('stprev', 'click', function () { gotoStep(storyIdx - 1); });
  on('stnext', 'click', function () { if (storyIdx === STORY.length - 1) exitStory(); else gotoStep(storyIdx + 1); });
  on('stexit', 'click', exitStory);

  /* ---------- URL state ---------- */
  function syncHash() {
    var h = '#' + (isTime() ? 't=' + state.timeKey + '&y=' + state.year : 'm=' + state.metric) + (state.selIso ? '&c=' + state.selIso : '');
    if (h !== location.hash) history.replaceState(null, '', h);
  }
  function readHash() {
    var p = {}; location.hash.replace(/^#/, '').split('&').forEach(function (kv) { var a = kv.split('='); if (a[0]) p[a[0]] = a[1]; });
    if (p.t && TIME[p.t]) { state.timeKey = p.t; state.year = +p.y || TIME[p.t].years[1]; }
    else if (p.m && META.metrics[p.m]) { state.timeKey = null; state.metric = p.m; }
    if (p.c) state.selIso = p.c;
  }

  /* ---------- search ---------- */
  function buildSearch() {
    document.getElementById('countrylist').innerHTML = DATA.features.slice().sort(function (a, b) { return a.properties.name < b.properties.name ? -1 : 1; }).map(function (f) { return '<option value="' + f.properties.name + '"></option>'; }).join('');
    var inp = document.getElementById('search');
    inp.addEventListener('change', function () { var q = inp.value.trim().toLowerCase(), f = DATA.features.find(function (x) { return x.properties.name.toLowerCase() === q; }); if (f) { state.selIso = null; select(f.properties.iso); inp.value = ''; inp.blur(); } });
  }

  /* ---------- timeline (production OR active time layer) ---------- */
  var playTimer = null, TLS = null;   // current timeline series state
  function worldSeries(key) {
    var L = TIME[key], by = {};
    if (L.kind === 'region') { Object.keys(L.data.regions).forEach(function (r) { var rec = L.data.regions[r]; Object.keys(rec).forEach(function (y) { by[y] = (by[y] || 0) + rec[y]; }); }); }
    else { Object.keys(L.data.byIso).forEach(function (iso) { var rec = L.data.byIso[iso]; Object.keys(rec).forEach(function (y) { by[y] = (by[y] || 0) + rec[y]; }); }); }
    return Object.keys(by).map(function (y) { return [+y, by[y]]; }).sort(function (a, b) { return a[0] - b[0]; });
  }
  function configureTimeline() {
    if (isTime()) {
      TLS = { series: worldSeries(state.timeKey), label: TIME[state.timeKey].label + ' (world)', drives: true };
      var yrs = TLS.series.map(function (p) { return p[0]; });
      if (state.year == null || yrs.indexOf(state.year) < 0) state.year = yrs[yrs.length - 1];
    } else {
      TLS = { series: PROD, label: META.timeline ? META.timeline.label : 'Global plastic production', drives: false };
    }
    renderTimeline();
  }
  function areaPath(series, toIdx) {
    var n = series.length, max = Math.max.apply(null, series.map(function (p) { return p[1]; })) || 1, d = 'M0 30';
    for (var i = 0; i <= toIdx; i++) { var x = i / (n - 1) * 600, y = 30 - (series[i][1] / max) * 27; d += 'L' + x.toFixed(1) + ' ' + y.toFixed(1); }
    return d + 'L' + (toIdx / (n - 1) * 600).toFixed(1) + ' 30Z';
  }
  function currentIdx() {
    var s = TLS.series;
    if (TLS.drives) { for (var i = 0; i < s.length; i++) if (s[i][0] === state.year) return i; return s.length - 1; }
    return s.length - 1;
  }
  function renderTimeline() {
    var c = document.getElementById('tlchart'); c.innerHTML = '';
    var s = TLS.series, n = s.length;
    var full = svgEl('path'); full.setAttribute('d', areaPath(s, n - 1)); full.setAttribute('fill', '#dce6ef'); c.appendChild(full);
    var bright = svgEl('path'); bright.setAttribute('id', 'tlbright'); bright.setAttribute('fill', '#0e7490'); bright.setAttribute('fill-opacity', '.85'); c.appendChild(bright);
    var mk = svgEl('line'); mk.setAttribute('id', 'tlmark'); mk.setAttribute('y1', 0); mk.setAttribute('y2', 30); mk.setAttribute('stroke', '#06283d'); mk.setAttribute('stroke-width', '1.2'); c.appendChild(mk);
    var rng = document.getElementById('tlrange'); rng.min = 0; rng.max = n - 1; rng.value = currentIdx();
    document.getElementById('tllbl').textContent = TLS.label;
    setIdx(currentIdx());
  }
  function setIdx(idx) {
    var s = TLS.series, n = s.length;
    document.getElementById('tlbright').setAttribute('d', areaPath(s, idx));
    var x = idx / (n - 1) * 600; var mk = document.getElementById('tlmark'); mk.setAttribute('x1', x); mk.setAttribute('x2', x);
    document.getElementById('tlyear').textContent = s[idx][0];
    document.getElementById('tlval').textContent = fmtT(s[idx][1]);
    document.getElementById('tlrange').value = idx;
    if (TLS.drives) { state.year = s[idx][0]; draw(); panel(); syncHash(); }
  }
  function togglePlay() {
    var btn = document.getElementById('tlplay');
    if (playTimer) { clearInterval(playTimer); playTimer = null; btn.textContent = '▶'; return; }
    btn.textContent = '❚❚';
    var idx = +document.getElementById('tlrange').value; if (idx >= TLS.series.length - 1) idx = 0;
    playTimer = setInterval(function () { if (idx >= TLS.series.length - 1) { clearInterval(playTimer); playTimer = null; btn.textContent = '▶'; return; } idx++; setIdx(idx); }, TLS.drives ? 280 : 95);
  }

  /* ---------- about modal ---------- */
  function buildAbout() {
    var m = META, h = '';
    h += '<p>An open map of where plastic pollution <b>originates</b> — country emission estimates, the river outlets that carry the most plastic to the sea, and animated views over time. Click a country, switch metrics, scrub the timeline.</p>';
    h += '<h3>Snapshot metrics (per country, single year)</h3><ul>';
    Object.keys(m.metrics).forEach(function (k) { var x = m.metrics[k]; h += '<li><b>' + x.label + '</b> (' + x.unit + ', ' + x.year + ') — ' + x.source + '</li>'; });
    h += '</ul>';
    h += '<h3>Animated time layers</h3><ul>';
    (m.timeLayers || []).forEach(function (t) { h += '<li><b>' + t.label + '</b> — ' + t.years.join('–') + ', ' + (t.resolution === 'region' ? '9 OECD macro-regions' : 'per country') + ' (' + t.theme + ')</li>'; });
    h += '</ul>';
    h += '<div class="caveat">No per-country <b>pollution</b> time series exists — every per-country pollution metric is a single-year snapshot. So the animated pollution view ("Plastic in oceans over time") is at <b>regional</b> resolution (OECD), and the only true per-country time series is plastic-waste <b>trade</b> (a different, trade dimension, not pollution).</div>';
    h += '<h3>River hotspots</h3><p>The ' + m.counts.rivers + ' river outlets emitting the most plastic to the ocean (Lebreton et al. 2017).</p>';
    h += '<h3>Sources &amp; licences</h3>';
    m.sources.forEach(function (s) { h += '<div class="src"><div><a href="' + s.url + '" target="_blank" rel="noopener">' + s.name + '</a><div class="role">' + s.role + '</div></div><span class="lic">' + s.license + '</span></div>'; });
    h += '<div class="src"><div>OECD Global Plastics Outlook · UN Comtrade (both via OWID)<div class="role">time layers</div></div><span class="lic">CC-BY</span></div>';
    h += '<h3>How to read it — important caveats</h3>';
    h += '<div class="caveat">Modeled estimates that disagree across studies — relative hotspots, not exact tonnages.</div>';
    h += '<div class="caveat">The map shows where plastic is <b>emitted</b>, not where it washes up. Manufactured-in ≠ consumed-in ≠ emitted-from.</div>';
    h += '<div class="caveat">In the regional time view, every country is shaded by its OECD region\'s value (approximate country→region assignment).</div>';
    h += '<h3>Open data</h3><p>Downloadable (CC-BY) from the header menu: ' + m.downloads.join(', ') + '. Generated ' + m.generated + '.</p>';
    document.getElementById('modalbody').innerHTML = h;
  }
  function openModal() { document.getElementById('modal').classList.add('open'); }
  function closeModal() { document.getElementById('modal').classList.remove('open'); }
  document.getElementById('aboutbtn').addEventListener('click', openModal);
  document.getElementById('aboutlink').addEventListener('click', function (e) { e.preventDefault(); openModal(); });
  document.getElementById('modalclose').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* ---------- controls ---------- */
  function buildControls() {
    var ms = document.getElementById('metricsel'), h = '';
    Object.keys(META.metrics).forEach(function (k) { h += '<button data-k="' + k + '"' + (!isTime() && k === state.metric ? ' class="active"' : '') + '>' + META.metrics[k].label + '</button>'; });
    h += '<span class="sep"></span>';
    (META.timeLayers || []).forEach(function (t) { h += '<button class="time' + (isTime() && state.timeKey === t.key ? ' active' : '') + '" data-t="' + t.key + '">⏱ ' + t.label + '</button>'; });
    ms.innerHTML = h;
    Array.prototype.forEach.call(ms.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-t')) { state.timeKey = b.getAttribute('data-t'); state.year = TIME[state.timeKey].years[1]; }
        else { state.timeKey = null; state.metric = b.getAttribute('data-k'); }
        buildControls(); configureTimeline(); draw(); panel(); syncHash();
      });
    });
    document.getElementById('rivertoggle').checked = state.rivers;
  }
  function buildFooter() {
    document.getElementById('sources').innerHTML = 'Sources: ' + META.sources.map(function (s) { return '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.name.split(' — ')[0] + '</a>'; }).join(' · ') + ' · OECD · UN Comtrade · CC-BY · ' + META.generated;
  }

  document.getElementById('rivertoggle').addEventListener('change', function (e) { state.rivers = e.target.checked; draw(); });
  document.getElementById('tlplay').addEventListener('click', togglePlay);
  document.getElementById('tlrange').addEventListener('input', function () { if (playTimer) togglePlay(); setIdx(+this.value); });
  var dlbtn = document.getElementById('dlbtn'), dlmenu = document.getElementById('dlmenu');
  dlbtn.addEventListener('click', function (e) { e.stopPropagation(); dlmenu.classList.toggle('open'); });
  document.addEventListener('click', function () { dlmenu.classList.remove('open'); });

  Promise.all([
    fetch('data/countries.geojson').then(function (r) { return r.json(); }),
    fetch('data/rivers.json').then(function (r) { return r.json(); }),
    fetch('data/meta.json').then(function (r) { return r.json(); }),
    fetch('data/production.json').then(function (r) { return r.json(); }),
    fetch('data/timeline-regions.json').then(function (r) { return r.json(); }),
    fetch('data/timeline-trade.json').then(function (r) { return r.json(); }),
  ]).then(function (res) {
    DATA = res[0]; RIVERS = res[1]; META = res[2]; PROD = res[3].series;
    TIME = { ocean_acc: { label: 'Plastic in oceans (over time)', years: res[4].years, kind: 'region', data: res[4] },
             exports: { label: 'Plastic waste exports', years: res[5].years, kind: 'country', data: res[5] } };
    var L = document.getElementById('loading'); if (L) L.style.display = 'none';
    readHash();
    buildControls(); buildFooter(); buildAbout(); buildSearch(); configureTimeline(); draw(); panel();
    if (state.selIso) focusCountry(state.selIso);
    if (/story/.test(location.search + location.hash)) startStory();
    window.addEventListener('hashchange', function () { var prev = JSON.stringify([state.metric, state.timeKey, state.year, state.selIso]); readHash(); if (JSON.stringify([state.metric, state.timeKey, state.year, state.selIso]) !== prev) { buildControls(); configureTimeline(); draw(); panel(); if (state.selIso) focusCountry(state.selIso); else resetView(); } });
  }).catch(function (err) {
    var L = document.getElementById('loading'); if (L) L.innerHTML = '<div style="max-width:280px;text-align:center">Couldn\'t load the data. Serve this folder over HTTP (e.g. <code>python -m http.server</code>).</div>';
    console.error(err);
  });
})();
