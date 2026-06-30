/* Fund a Cleanup — Philippines pilot. Vanilla JS, no dependencies.
   Links donors to each org's OWN official donation page; the tool never holds money. */
(function () {
  "use strict";
  var A = '#0e7490';
  var LV = { 5: 'Very high', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Very low' };
  var root = document.getElementById('fund');
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function money(n) { return '$' + Math.round(n).toLocaleString(); }

  function badge(status) {
    return status === 'verified'
      ? '<span style="background:#e7f4ed;color:#1b7f4b;border-radius:20px;padding:2px 9px;font:600 10px \'IBM Plex Mono\';text-transform:uppercase;letter-spacing:.4px">✓ Vetted</span>'
      : '<span style="background:#fdf3e7;color:#b45309;border-radius:20px;padding:2px 9px;font:600 10px \'IBM Plex Mono\';text-transform:uppercase;letter-spacing:.4px">Diligence pending</span>';
  }
  function chip(label, lvl) {
    return '<span style="display:inline-flex;gap:5px;align-items:baseline;background:#f1f5f8;border-radius:6px;padding:3px 8px;font:600 10.5px \'IBM Plex Mono\';color:#48586a">' + label + ' <b style="color:#0c1e2e">' + LV[lvl] + '</b></span>';
  }
  function scopeTag(scope) {
    return scope === 'project'
      ? '<span style="background:#e7f4ed;color:#1b7f4b;border-radius:6px;padding:2px 8px;font:600 9.5px \'IBM Plex Mono\';text-transform:uppercase;letter-spacing:.3px">Funds this project</span>'
      : '<span style="background:#f1f5f8;color:#56657a;border-radius:6px;padding:2px 8px;font:600 9.5px \'IBM Plex Mono\';text-transform:uppercase;letter-spacing:.3px">General org fund</span>';
  }
  function orgCard(org) {
    if (!org) return '';
    var verified = org.status === 'verified' && org.donate_url;
    var action = verified
      ? '<a class="gpw-btn" href="' + esc(org.donate_url) + '" target="_blank" rel="noopener" style="flex:none;background:' + A + ';color:#fff;border:1px solid ' + A + ';padding:9px 14px;border-radius:8px;font:600 12.5px \'IBM Plex Sans\';text-decoration:none;white-space:nowrap">' + esc(org.donate_label || 'Donate') + ' ↗</a>'
      : '<span style="flex:none;background:#fafbfc;color:#9aa7b2;border:1px dashed #d4dde4;padding:9px 12px;border-radius:8px;font:600 12px \'IBM Plex Sans\'">Verification pending</span>';
    var funds = (verified && org.funds) ? '<div style="font:500 11.5px/1.45 \'IBM Plex Sans\';color:#33485a;margin-top:6px"><b style="font:600 11.5px \'IBM Plex Sans\'">Your donation funds:</b> ' + esc(org.funds) + '</div>' : '';
    var earmark = org.earmark ? '<div style="font:500 11px/1.45 \'IBM Plex Sans\';color:#9a5a2a;background:#fff7f1;border-radius:6px;padding:6px 9px;margin-top:6px">⚠ ' + esc(org.earmark) + '</div>' : '';
    return '<div style="border:1px solid #e6ecf1;border-radius:10px;padding:12px 13px;margin-top:9px">'
      + '<div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between">'
      + '<div style="min-width:0"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><a href="' + esc(org.official_url) + '" target="_blank" rel="noopener" style="font:600 13.5px \'IBM Plex Sans\';color:#0c1e2e;text-decoration:none">' + esc(org.name) + '</a> ' + badge(org.status) + (verified ? ' ' + scopeTag(org.scope) : '') + '</div>'
      + '<div style="font:500 11.5px \'IBM Plex Sans\';color:#6b7c89;margin-top:3px">' + esc(org.focus) + ' · ' + esc(org.location) + '</div></div>'
      + action + '</div>'
      + funds + earmark
      + '<div style="font:500 10px \'IBM Plex Mono\';color:#aeb9c2;margin-top:6px">' + esc(org.evidence) + '</div></div>';
  }
  function projectCard(p, orgs) {
    var prevention = p.type === 'prevention';
    var head = '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap">'
      + '<div><h3 style="margin:0;font:500 20px \'Newsreader\';color:#0c1e2e">' + esc(p.name) + '</h3>'
      + '<div style="font:600 10.5px \'IBM Plex Mono\';color:#8b98a3;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">' + esc(p.region) + '</div></div>'
      + (prevention
        ? '<span style="background:#eaf3f4;color:#0c4f57;border-radius:20px;padding:4px 11px;font:600 11px \'IBM Plex Mono\'">Prevention</span>'
        : '<div style="text-align:right"><div style="font:500 26px \'Newsreader\';color:' + A + ';line-height:1">' + p.priority + '</div><div style="font:600 9px \'IBM Plex Mono\';color:#9aa7b2;text-transform:uppercase;letter-spacing:.5px">priority</div></div>')
      + '</div>';
    var scores = prevention ? '' : '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">' + chip('Severity', p.severity) + chip('Exposure', p.exposure) + chip('Ecology', p.ecology) + '</div>';
    var cost = prevention ? '' : ('<div style="background:#fafbfc;border:1px solid #eef2f5;border-radius:10px;padding:11px 13px;margin-top:11px">'
      + '<div style="font:500 13px \'IBM Plex Sans\';color:#0c1e2e"><b style="font:600 14px \'IBM Plex Sans\'">Goal:</b> remove ~' + p.goal_tonnes + ' tonnes · est. <b>' + money(p.cost_low) + '–' + money(p.cost_high) + '</b></div>'
      + '<div style="font:500 11.5px \'IBM Plex Mono\';color:#6b7c89;margin-top:3px">≈ $50 funds 20–100 kg cleaned · modeled estimate, not a guarantee</div>'
      + (p.plastic_note ? '<div style="font:500 11px \'IBM Plex Sans\';color:#9aa7b2;margin-top:5px">' + esc(p.plastic_note) + '</div>' : '') + '</div>');
    var why = '<div style="font:500 12.5px/1.5 \'IBM Plex Sans\';color:#56657a;margin-top:11px">' + esc(p.why) + '</div>';
    var orgsHtml = '<div style="margin-top:12px"><div style="font:600 10.5px \'IBM Plex Mono\';color:#7c8b97;text-transform:uppercase;letter-spacing:.6px">Donate to a vetted local organization</div>'
      + p.org_ids.map(function (id) { return orgCard(orgs[id]); }).join('') + '</div>';
    return '<section style="background:#fff;border:1px solid #dde5ec;border-radius:12px;padding:16px 18px 17px;margin-bottom:14px;box-shadow:0 1px 2px rgba(12,30,46,.04)">'
      + head + scores + cost + why + orgsHtml + '</section>';
  }

  Promise.all([
    fetch('data/projects.json').then(function (r) { return r.json(); }),
    fetch('data/orgs.json').then(function (r) { return r.json(); }),
    fetch('data/meta.json').then(function (r) { return r.json(); })
  ]).then(function (res) {
    var P = res[0], O = res[1], meta = res[2];
    var orgs = {}; O.orgs.forEach(function (o) { orgs[o.id] = o; });
    var sites = P.projects.filter(function (p) { return p.type !== 'prevention'; }).sort(function (a, b) { return b.priority - a.priority; });
    var prevention = P.projects.filter(function (p) { return p.type === 'prevention'; });

    var header = '<header style="display:flex;align-items:center;gap:14px;padding:13px 20px;background:linear-gradient(180deg,#11314a,#0c1e2e);color:#fff;flex-wrap:wrap">'
      + '<div style="display:flex;align-items:center;gap:11px"><svg width="30" height="30" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="15" fill="#0c1e2e" stroke="#3fd0e6" stroke-width="1.4" stroke-opacity=".5"></circle><path d="M4 18c3-3 6 0 9-1s5-3 8.5-1 5 0 6.5-1.5" stroke="#3fd0e6" stroke-width="2.2" stroke-linecap="round" fill="none"></path></svg>'
      + '<div><div style="font-weight:700;font-size:16px;line-height:1.05">Global Plastics <span style="color:#3fd0e6">Watch</span></div><div style="font:500 11px \'IBM Plex Mono\';color:#9db4c9;margin-top:1px">Fund a Cleanup · Philippines pilot</div></div></div>'
      + '<div style="flex:1"></div>'
      + '<a class="gpw-btn gpw-ghost" href="index.html" style="background:transparent;border:1px solid rgba(255,255,255,.22);color:#dbe7f0;padding:8px 13px;border-radius:8px;font:600 12.5px \'IBM Plex Sans\';text-decoration:none">← Explore the map</a></header>';

    var intro = '<div style="max-width:760px;margin:0 auto;padding:22px 18px 4px">'
      + '<h1 style="margin:0 0 8px;font:500 30px \'Newsreader\';color:#0c1e2e;letter-spacing:-.3px">Fund a cleanup where it matters most</h1>'
      + '<p style="font:400 14.5px/1.6 \'IBM Plex Sans\';color:#33485a;margin:0 0 14px">Coastal sites ranked by a combined <b>Severity × Exposure × Ecology</b> score, with a modeled cost to address them — each matched to a vetted local organization you can support directly.</p>'
      + '<div style="background:#fff7f1;border-left:3px solid #d4521b;border-radius:5px;padding:12px 15px;font:400 12.5px/1.55 \'IBM Plex Sans\';color:#5a4636">'
      + '<b>How this works (and what it isn\'t).</b> This tool <b>does not collect or hold any money</b>. Every <b>Donate</b> button opens the organization\'s <b>own official donation page</b>. Cost figures are <b>modeled estimates, not guarantees</b>. <b>“Vetted”</b> means we confirmed the org is real, active, locally-focused and donation-ready — <b>not</b> a financial audit. Most orgs pool gifts into one <b>general fund</b> (tagged on each card); only a <b>“Funds this project”</b> tag means the link is project-scoped. Orgs still in diligence are shown without a donate link.</div>'
      + '</div>';

    var siteHtml = '<div style="max-width:760px;margin:0 auto;padding:18px 18px 0">'
      + '<div style="font:600 11px \'IBM Plex Mono\';color:#7c8b97;text-transform:uppercase;letter-spacing:.7px;margin-bottom:12px">Priority cleanup sites</div>'
      + sites.map(function (p) { return projectCard(p, orgs); }).join('')
      + '<div style="font:600 11px \'IBM Plex Mono\';color:#7c8b97;text-transform:uppercase;letter-spacing:.7px;margin:18px 0 12px">Prevent it upstream</div>'
      + prevention.map(function (p) { return projectCard(p, orgs); }).join('')
      + '</div>';

    var footer = '<footer style="max-width:760px;margin:8px auto 40px;padding:16px 18px;font:500 11px/1.7 \'IBM Plex Mono\';color:#8593a0">'
      + '<b style="color:#56657a">What our vetting confirmed:</b> each ✓ Vetted org exists, is Philippines-local, on-theme, active within ~2 years, and has a working official/platform donation path. '
      + '<b style="color:#56657a">What it did NOT:</b> we did not audit any org\'s financials or overhead. Before relying on a listing, open the donation page yourself and confirm the recipient. '
      + 'Cleanup is one lever — prevention upstream is often more cost-effective. Org vetting ' + esc(O.vetted) + '. Sources: org websites, GlobalGiving, HelloAsso, SEC/PCNC registries. Data CC-BY · generated ' + esc(meta.generated || '') + '.</footer>';

    root.innerHTML = header + '<main class="gpw-scroll" style="flex:1;overflow:auto">' + intro + siteHtml + footer + '</main>';
  }).catch(function (err) {
    root.innerHTML = '<div style="padding:40px;text-align:center;color:#6b7c89;font:500 14px \'IBM Plex Sans\'">Couldn\'t load the pilot data. Serve this folder over HTTP (python -m http.server).</div>';
    console.error(err);
  });
})();
