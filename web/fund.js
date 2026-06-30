/* Fund a Cleanup — Option 1c "Tangible Ask" donation cards. Vanilla JS, no deps.
   Reading order per card: Identity → Problem → Impact calculator (hero) → Ask.
   Links donors to each org's OWN official donation page; the tool never holds money.
   The picked amount is an impact PREVIEW only — the real gift is entered on the org's page. */
(function () {
  "use strict";
  var INK = '#1f2a28', SEC = '#5b635f', MUTED = '#6f766f', MUTED2 = '#8a918c', LABEL = '#7a827c',
    TEAL = '#0f6b73', TEALH = '#0a565d', TEALINK = '#0f3b41', VET = '#2f6b4a',
    SEV = '#b4623c', ECO = '#c08a3e', SURFACE = '#fffdfa', PANEL = '#f4f6f3', PAGE = '#eef0ec',
    HAIR = 'rgba(31,42,40,.10)';
  var UI = "'Hanken Grotesk',system-ui,sans-serif", SERIF = "'Newsreader',Georgia,serif", MONO = "'Spline Sans Mono',ui-monospace,monospace";
  var SEVW = { 5: 'very high', 4: 'high', 3: 'moderate', 2: 'low', 1: 'very low' };
  var FX = { php: 61.21, eur: 0.876, asof: '' };   // overridden from meta.fx on load
  var DEFAULT_AMT = 50;
  var root = document.getElementById('fund');
  function php(usd) { return '₱' + Math.round(usd * FX.php).toLocaleString(); }
  // GlobalGiving direct-link checkout with a prefilled USD amount (only place clean prefill works).
  function ggUrl(projid, amt) {
    return 'https://www.globalgiving.org/dy/cart/view/gg.html?cmd=addItem&projid=' + projid + '&rf=ggWidget_custom_donation_link&frequency=ONCE&amount=' + amt;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- impact calculator (spec §07): kg = amount/50 × per50; bar maxes at ceiling ----
  function impact(amt, lo50, hi50, ceil) {
    var lo = Math.round(amt / 50 * lo50), hi = Math.round(amt / 50 * hi50);
    return { lo: lo, hi: hi, label: lo + '–' + hi, barPct: Math.min(100, Math.round(hi / ceil * 100)) };
  }

  function vettedChip() {
    return '<span style="background:rgba(47,107,74,.10);color:' + VET + ';border-radius:20px;padding:2px 8px;font:600 10px ' + UI + ';letter-spacing:.04em;white-space:nowrap">✓ Vetted</span>';
  }
  function orgRow(org, primary, divider) {
    if (!org) return '';
    var verified = org.status === 'verified' && org.donate_url;
    var href = org.gg_projid ? ggUrl(org.gg_projid, DEFAULT_AMT) : org.donate_url;
    var ggData = org.gg_projid ? ' data-gg="' + esc(org.gg_projid) + '"' : '';
    var style = primary
      ? 'flex:none;background:' + TEAL + ';color:#fff;border:1px solid ' + TEAL + ';padding:11px 15px;border-radius:11px;font:600 13px ' + UI + ';text-decoration:none;white-space:nowrap'
      : 'flex:none;background:transparent;color:' + TEAL + ';border:1.5px solid ' + TEAL + ';padding:9.5px 18px;border-radius:11px;font:600 13px ' + UI + ';text-decoration:none;white-space:nowrap';
    var cta = verified
      ? '<a class="' + (primary ? 'fund-cta-1' : 'fund-cta-2') + (org.gg_projid ? ' gg-cta' : '') + '" href="' + esc(href) + '"' + ggData + ' target="_blank" rel="noopener" style="' + style + '">' + esc(org.donate_label || 'Donate') + ' ↗</a>'
      : '<span style="flex:none;color:' + MUTED2 + ';border:1px dashed ' + HAIR + ';padding:10px 13px;border-radius:11px;font:600 12px ' + UI + '">Verification pending</span>';
    var earmark = org.earmark ? '<div style="font:500 11px/1.45 ' + UI + ';color:#9a5a2a;background:#fbf1e9;border-radius:7px;padding:6px 9px;margin-top:7px">⚠ ' + esc(org.earmark) + '</div>' : '';
    return '<div style="padding:13px 0;' + (divider ? 'border-top:1px solid ' + HAIR + ';' : '') + '">'
      + '<div style="display:flex;align-items:center;gap:12px;justify-content:space-between">'
      + '<div style="min-width:0"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font:600 14.5px ' + UI + ';color:' + INK + '">' + esc(org.name) + '</span>' + (verified ? vettedChip() : '') + '</div>'
      + '<div style="font:400 12.5px ' + UI + ';color:' + MUTED + ';margin-top:3px">' + esc(org.blurb || org.focus) + '</div></div>'
      + cta + '</div>' + earmark + '</div>';
  }

  function calcPanel(p) {
    var per = p.impact_per50 || [20, 100], ceil = p.impact_ceiling_kg || 500, def = 50;
    var d = impact(def, per[0], per[1], ceil), ref = impact(50, per[0], per[1], ceil);
    var chips = (window.__chips || [25, 50, 100, 250]).map(function (a) {
      var on = a === def;
      return '<button class="amtchip" data-act="amt" data-amt="' + a + '" style="flex:1;border:1px solid ' + HAIR + ';border-radius:12px;padding:12px 0;background:#fff;font:600 15px ' + UI + ';color:' + INK + ';cursor:pointer;text-align:center;' + (on ? 'box-shadow:inset 0 0 0 2px ' + TEAL + ';color:' + TEALINK : '') + '">$' + a + '</button>';
    }).join('');
    return '<div class="calc" data-lo50="' + per[0] + '" data-hi50="' + per[1] + '" data-ceil="' + ceil + '" style="background:' + PANEL + ';border:1px solid ' + HAIR + ';border-radius:16px;padding:20px;margin-top:20px">'
      + '<div style="font:600 11px ' + UI + ';letter-spacing:.09em;text-transform:uppercase;color:' + LABEL + ';margin-bottom:11px">See what your gift removes</div>'
      + '<div style="display:flex;gap:9px;margin-bottom:10px">' + chips + '</div>'
      + '<div class="amt-php" style="font:500 11.5px ' + UI + ';color:' + MUTED + ';margin-bottom:13px">$' + DEFAULT_AMT + ' ≈ ' + php(DEFAULT_AMT) + ' <span style="color:' + MUTED2 + '">· charged in the org\'s currency ($, ₱ or €)</span></div>'
      + '<div style="display:flex;align-items:baseline;gap:6px"><span class="kg-num" style="font:600 36px ' + SERIF + ';line-height:.95;color:' + TEALINK + '">' + d.label + '</span><span style="font:600 17px ' + UI + ';color:' + TEALINK + '">kg</span></div>'
      + '<div style="font:400 13.5px ' + UI + ';color:' + SEC + ';margin:6px 0 12px">' + esc(p.readout_sub || 'of plastic removed') + '</div>'
      + '<div style="height:7px;border-radius:4px;background:rgba(15,107,115,.13);overflow:hidden"><div class="bar-fill" style="height:100%;border-radius:4px;background:' + TEAL + ';width:' + d.barPct + '%;transition:width .35s ease"></div></div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:6px;font:500 10px ' + MONO + ';color:' + LABEL + '"><span>0 kg</span><span>modeled · $50 = ' + ref.label + ' kg</span><span>' + ceil + ' kg</span></div>'
      + '</div>';
  }

  function card(p, orgs) {
    var prevention = p.type === 'prevention';
    var badge = prevention
      ? '<span style="flex:none;background:rgba(15,107,115,.08);color:' + TEAL + ';border:1px solid rgba(15,107,115,.22);border-radius:20px;padding:5px 12px;font:600 11px ' + UI + ';letter-spacing:.05em;text-transform:uppercase">Prevention</span>'
      : '<div style="flex:none;text-align:center;border:1.5px solid rgba(15,107,115,.22);border-radius:13px;padding:7px 13px"><div style="font:600 22px ' + SERIF + ';color:' + TEAL + ';line-height:1">' + p.priority + '</div><div style="font:600 9px ' + UI + ';letter-spacing:.08em;text-transform:uppercase;color:' + LABEL + '">priority</div></div>';
    var sevLine = prevention ? p.region : (p.region + ' · <span style="color:' + SEV + ';font-weight:600">Severity ' + SEVW[p.severity] + '</span>');
    var identity = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px">'
      + '<div><div style="font:600 11px ' + UI + ';letter-spacing:.14em;text-transform:uppercase;color:' + LABEL + '">' + (prevention ? 'Upstream prevention' : 'Priority cleanup site') + '</div>'
      + '<h2 style="margin:5px 0 4px;font:600 23px ' + SERIF + ';letter-spacing:-.012em;line-height:1.1;color:' + INK + '">' + esc(p.name) + '</h2>'
      + '<div style="font:500 12.5px ' + UI + ';color:' + MUTED2 + '">' + sevLine + '</div></div>' + badge + '</div>';
    var problem = '<p style="margin:16px 0 0;font:500 15.5px/1.45 ' + SERIF + ';color:' + INK + '">' + esc(p.problem) + '</p>';
    var calc = prevention ? '' : calcPanel(p);
    var askLabel = '<div style="font:600 11px ' + UI + ';letter-spacing:.10em;text-transform:uppercase;color:' + LABEL + ';margin:' + (prevention ? '18px' : '22px') + ' 0 2px">Donate through a vetted local organization</div>';
    var rows = p.org_ids.map(function (id, i) { return orgRow(orgs[id], i === 0, i > 0); }).join('');
    return '<section id="proj-' + p.id + '" style="background:' + SURFACE + ';border:1px solid ' + HAIR + ';border-radius:20px;padding:24px;margin-bottom:18px;box-shadow:0 1px 2px rgba(31,42,40,.04),0 14px 40px -16px rgba(31,42,40,.16);scroll-margin-top:16px">'
      + identity + problem + calc + askLabel + rows + '</section>';
  }

  Promise.all([
    fetch('data/projects.json').then(function (r) { return r.json(); }),
    fetch('data/orgs.json').then(function (r) { return r.json(); }),
    fetch('data/meta.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    var P = res[0], O = res[1], meta = res[2];
    if (meta.fx) FX = meta.fx;
    window.__chips = P.amount_chips || [25, 50, 100, 250];
    DEFAULT_AMT = P.default_amount || 50;
    var orgs = {}; O.orgs.forEach(function (o) { orgs[o.id] = o; });
    var sites = P.projects.filter(function (p) { return p.type !== 'prevention'; }).sort(function (a, b) { return b.priority - a.priority; });
    var prevention = P.projects.filter(function (p) { return p.type === 'prevention'; });

    var header = '<header style="display:flex;align-items:center;gap:14px;padding:13px 20px;background:linear-gradient(180deg,#11314a,#0c1e2e);color:#fff;flex-wrap:wrap;flex:none">'
      + '<div style="display:flex;align-items:center;gap:11px"><svg width="30" height="30" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="15" fill="#0c1e2e" stroke="#3fd0e6" stroke-width="1.4" stroke-opacity=".5"></circle><path d="M4 18c3-3 6 0 9-1s5-3 8.5-1 5 0 6.5-1.5" stroke="#3fd0e6" stroke-width="2.2" stroke-linecap="round" fill="none"></path></svg>'
      + '<div><div style="font:700 16px ' + UI + ';line-height:1.05">Global Plastics <span style="color:#3fd0e6">Watch</span></div><div style="font:500 11px ' + MONO + ';color:#9db4c9;margin-top:1px">Fund a Cleanup · Philippines pilot</div></div></div>'
      + '<div style="flex:1"></div>'
      + '<a href="index.html" style="background:transparent;border:1px solid rgba(255,255,255,.22);color:#dbe7f0;padding:8px 13px;border-radius:8px;font:600 12.5px ' + UI + ';text-decoration:none">← Explore the map</a></header>';

    var intro = '<div style="max-width:620px;margin:0 auto;padding:26px 18px 6px">'
      + '<h1 style="margin:0 0 8px;font:600 31px ' + SERIF + ';color:' + INK + ';letter-spacing:-.01em">Fund a cleanup where it matters most</h1>'
      + '<p style="font:400 14.5px/1.6 ' + UI + ';color:' + SEC + ';margin:0 0 14px">Coastal sites ranked by a combined <b>Severity × Exposure × Ecology</b> score. Pick an amount to preview the plastic it could remove, then give through a vetted local organization.</p>'
      + '<div style="background:#fbf1e9;border-left:3px solid ' + SEV + ';border-radius:5px;padding:12px 15px;font:400 12.5px/1.55 ' + UI + ';color:#5a4636">'
      + '<b>How this works.</b> The amount you pick is an <b>impact preview, not a charge</b> — you enter the real gift on the organization\'s <b>own official donation page</b> (this tool holds no money). Kilogram figures are <b>modeled estimates, not guarantees</b>. <b>“Vetted”</b> = confirmed real, active and donation-ready — not a financial audit.</div></div>';

    var body = '<div style="max-width:620px;margin:0 auto;padding:18px 18px 0">'
      + '<div style="font:600 11px ' + UI + ';letter-spacing:.1em;text-transform:uppercase;color:' + LABEL + ';margin-bottom:12px">Priority cleanup sites</div>'
      + sites.map(function (p) { return card(p, orgs); }).join('')
      + prevention.map(function (p) { return card(p, orgs); }).join('')
      + '</div>';

    var footer = '<footer style="max-width:620px;margin:6px auto 40px;padding:16px 18px;font:500 11px/1.7 ' + MONO + ';color:#97a09a">'
      + 'What our vetting confirmed: each ✓ Vetted org is real, Philippines-local, on-theme, active within ~2 years, with a working official donation path. What it did NOT: we did not audit financials — open the donation page and confirm the recipient before relying on it. Impact figures are modeled (≈$50 = 20–100 kg). Org vetting ' + esc(O.vetted) + ' · data CC-BY · generated ' + esc(meta.generated || '') + '.</footer>';

    root.style.background = PAGE;
    root.innerHTML = header + '<main class="gpw-scroll" style="flex:1;overflow:auto;font-family:' + UI + '">' + intro + body + footer + '</main>';
    if (location.hash.indexOf('proj-') > -1) {
      var hid = location.hash.slice(1);
      setTimeout(function () {   // let fonts/layout settle, then scroll the inner container
        var main = document.querySelector('#fund main'), t = document.getElementById(hid);
        if (main && t) {
          main.scrollTop += t.getBoundingClientRect().top - main.getBoundingClientRect().top - 12;
          t.style.outline = '2px solid ' + TEAL; t.style.outlineOffset = '3px';
          setTimeout(function () { t.style.outline = ''; }, 2400);
        }
      }, 160);
    }
  }).catch(function (err) {
    root.innerHTML = '<div style="padding:40px;text-align:center;color:' + SEC + ';font:500 14px ' + UI + '">Couldn\'t load the pilot data. Serve this folder over HTTP (python -m http.server).</div>';
    console.error(err);
  });

  // ---- impact calculator interactivity (delegated) ----
  root.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-act="amt"]'); if (!chip) return;
    var calc = chip.closest('.calc'); if (!calc) return;
    var amt = +chip.getAttribute('data-amt');
    var r = impact(amt, +calc.getAttribute('data-lo50'), +calc.getAttribute('data-hi50'), +calc.getAttribute('data-ceil'));
    calc.querySelector('.kg-num').textContent = r.label;
    calc.querySelector('.bar-fill').style.width = r.barPct + '%';
    Array.prototype.forEach.call(calc.querySelectorAll('[data-act="amt"]'), function (c) { c.style.boxShadow = 'none'; c.style.color = INK; });
    chip.style.boxShadow = 'inset 0 0 0 2px ' + TEAL; chip.style.color = TEALINK;
    var ap = calc.querySelector('.amt-php'); if (ap) ap.innerHTML = '$' + amt + ' ≈ ' + php(amt) + ' <span style="color:' + MUTED2 + '">· charged in the org\'s currency ($, ₱ or €)</span>';
    // pass the picked amount through to any GlobalGiving CTA in this card (prefill the donation)
    var sec = chip.closest('section'); if (sec) Array.prototype.forEach.call(sec.querySelectorAll('.gg-cta'), function (a) { a.href = ggUrl(a.getAttribute('data-gg'), amt); });
    // (Analytics hook: capture {siteId, previewAmount} here — distinct from amount actually donated.)
  });
})();
