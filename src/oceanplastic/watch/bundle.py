"""Bundle the split web app into one self-contained, editable HTML file.

Inlines styles.css, app.js, and the data the app fetch()es into a single
`gpw-standalone.html` that renders anywhere — double-clicked from disk (file://),
emailed, or handed to a design tool — with no server. A tiny fetch-shim serves the
embedded data so app.js needs no changes.

Edit the SPLIT sources (web/index.html, web/styles.css, web/app.js) — they are the
editable design — then regenerate this bundle (it also runs at the end of `build-data`).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

DATA_FILES = [
    "countries.geojson", "rivers.json", "meta.json",
    "production.json", "timeline-regions.json", "timeline-trade.json",
]


def build_standalone(web_dir: str | Path = "web", out: Optional[str | Path] = None) -> Path:
    web = Path(web_dir)
    html = (web / "index.html").read_text(encoding="utf-8")
    css = (web / "styles.css").read_text(encoding="utf-8")
    js = (web / "app.js").read_text(encoding="utf-8")

    data = {f"data/{f}": json.loads((web / "data" / f).read_text(encoding="utf-8")) for f in DATA_FILES}
    blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")  # safe to inline in <script>

    shim = (
        "<script>window.__GPW=" + blob + ";"
        "(function(){var _f=window.fetch;window.fetch=function(u){"
        "if(window.__GPW[u])return Promise.resolve({json:function(){return Promise.resolve(window.__GPW[u]);}});"
        "return _f?_f.apply(this,arguments):Promise.reject('no fetch');};})();</script>"
    )

    # lambda replacements avoid backslash-escape interpretation of the inlined content
    html = re.sub(r'<link rel="stylesheet" href="styles\.css[^"]*">',
                  lambda m: "<style>\n" + css + "\n</style>", html, count=1)
    html = re.sub(r'<script src="app\.js[^"]*"></script>',
                  lambda m: shim + "\n<script>\n" + js + "\n</script>", html, count=1)

    out_path = Path(out) if out else web / "gpw-standalone.html"
    out_path.write_text(html, encoding="utf-8")
    return out_path
