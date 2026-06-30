"""Command-line entrypoint.

    oceanplastic report --pilot config/pilot.saint-lucia.yaml

Orchestrates INGEST -> NORMALIZE -> ATTRIBUTE -> VALUE -> REPORT and writes a markdown
submission document.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import re
import sys
from pathlib import Path

import yaml

from .attribute import fuse
from .attribute.brand import producer_disclosures
from .ingest import bffp
from .ingest.openlittermap import ObservationDensity, fetch_observation_density
from .report import generate
from .sources import SourceRegistry
from .value import valuation


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _load_pilot(path: str) -> tuple[dict, dict]:
    with open(path, "r", encoding="utf-8") as fh:
        doc = yaml.safe_load(fh)
    return doc.get("pilot", {}), doc.get("legal", {})


def cmd_report(args: argparse.Namespace) -> int:
    pilot, legal = _load_pilot(args.pilot)
    registry = SourceRegistry.load(args.sources)

    # 1. INGEST — local observation density (live, unless --offline)
    if args.offline:
        density = ObservationDensity(0, 0, ok=False, note="Ran with --offline; live OpenLitterMap skipped.")
    else:
        print("· Querying OpenLitterMap for observation density …", file=sys.stderr)
        density = fetch_observation_density(
            pilot["bbox"], zoom=int(pilot.get("olm_zoom", 12))
        )
    print(f"  OpenLitterMap: {density.n_observations} observations "
          f"({'ok' if density.ok else 'unavailable'})", file=sys.stderr)

    # 2. INGEST — brand-audit producer attribution (cached BFFP dataset)
    print("· Loading BFFP brand-audit dataset (downloads on first run) …", file=sys.stderr)
    csv_path = bffp.ensure_dataset(args.cache)
    attr = bffp.load_brand_attribution(
        csv_path,
        region_countries=pilot.get("bffp_region_countries"),
        min_regional_items=float(pilot.get("bffp_min_regional_items", 5000)),
    )
    print(f"  BFFP: {attr.total_items:,.0f} items, {attr.unbranded_share:.1%} unbranded, "
          f"level='{attr.level}'", file=sys.stderr)

    # 3-4. ATTRIBUTE + VALUE
    attribution = fuse.fuse(density, attr, pilot)
    val = valuation.estimate(pilot, density, attr)

    # 5. REPORT
    context = generate.build_context(
        pilot=pilot,
        legal=legal,
        density=density,
        attribution=attribution,
        valuation=val,
        registry=registry,
        generated_date=args.date or _dt.date.today().isoformat(),
        commercial=args.commercial,
        producer_disclosures=producer_disclosures(attr),
    )

    name = pilot.get("name", "report")
    stem = args.out or f"output/sample_{_slug(name)}_report"
    # If --out carries a known extension, treat it as a literal path for a single format.
    explicit = args.out and Path(args.out).suffix in (".md", ".html", ".pdf")
    fmts = ["md", "html", "pdf"] if args.format == "all" else [args.format]

    for fmt in fmts:
        if fmt == "md":
            target = args.out if (explicit and args.format == "md") else f"{stem}.md"
            print(f"✓ Wrote {generate.write_report(context, target)}", file=sys.stderr)
        elif fmt == "html":
            target = args.out if (explicit and args.format == "html") else f"{stem}.html"
            print(f"✓ Wrote {generate.write_html(context, target)}", file=sys.stderr)
        elif fmt == "pdf":
            from .report import pdf  # local import: only needs Chrome/reportlab when used
            target = args.out if (explicit and args.format == "pdf") else f"{stem}.pdf"
            html = generate.render_html(context)
            footer_left = f"{name} · Ocean Plastic Source-Attribution Report"
            print("· Rendering PDF via headless Chrome …", file=sys.stderr)
            path = pdf.html_to_pdf(html, target, footer_left=footer_left)
            print(f"✓ Wrote {path}", file=sys.stderr)

    if val.headline:
        print(f"  Headline ask (banded): ${val.headline.low:,.0f} – ${val.headline.high:,.0f}",
              file=sys.stderr)
    return 0


def cmd_build_data(args: argparse.Namespace) -> int:
    from .watch.build import build_dataset

    print("· Building Global Plastics Watch open dataset …", file=sys.stderr)
    res = build_dataset(
        out_dir=args.out, cache=args.cache, top_rivers=args.top_rivers,
        offline=args.offline, generated_date=args.date,
    )
    print(f"✓ Wrote {res.out_dir}/ — {res.n_countries} countries "
          f"({res.n_matched} with data), {res.n_rivers} river hotspots", file=sys.stderr)
    # Keep the self-contained bundle in sync with the freshly-built data.
    if not args.no_bundle:
        from .watch.bundle import build_standalone
        web_dir = Path(args.out).parent
        try:
            out = build_standalone(web_dir=web_dir)
            print(f"✓ Bundled {out} ({out.stat().st_size // 1024} KB, self-contained)", file=sys.stderr)
        except FileNotFoundError as exc:
            print(f"  (skipped bundle: {exc})", file=sys.stderr)
    return 0


def cmd_bundle(args: argparse.Namespace) -> int:
    from .watch.bundle import build_standalone

    out = build_standalone(web_dir=args.web, out=args.out)
    print(f"✓ Wrote {out} ({out.stat().st_size // 1024} KB) — open it directly, no server needed.",
          file=sys.stderr)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="oceanplastic", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    bd = sub.add_parser("build-data", help="Compile the open Global Plastics Watch dataset.")
    bd.add_argument("--out", default="web/data", help="Output directory for the open data files")
    bd.add_argument("--cache", default=".cache", help="Dataset cache directory")
    bd.add_argument("--top-rivers", type=int, default=150, help="How many top river hotspots to include")
    bd.add_argument("--offline", action="store_true", help="Use cached sources only")
    bd.add_argument("--date", default=None, help="Override the generated date (YYYY-MM-DD)")
    bd.add_argument("--no-bundle", action="store_true", help="Skip refreshing the self-contained HTML bundle")
    bd.set_defaults(func=cmd_build_data)

    bn = sub.add_parser("bundle", help="Bundle the web app into one self-contained gpw-standalone.html.")
    bn.add_argument("--web", default="web", help="The web/ directory to bundle")
    bn.add_argument("--out", default=None, help="Output HTML path (default web/gpw-standalone.html)")
    bn.set_defaults(func=cmd_bundle)

    rep = sub.add_parser("report", help="Generate a source-attribution & cost-recovery report.")
    rep.add_argument("--pilot", required=True, help="Path to a pilot YAML (e.g. config/pilot.saint-lucia.yaml)")
    rep.add_argument("--sources", default="config/sources.yaml", help="Path to the source registry YAML")
    rep.add_argument("--out", default=None, help="Output path (extension picks the format for a single format)")
    rep.add_argument("--format", choices=["md", "html", "pdf", "all"], default="md", help="Output format(s)")
    rep.add_argument("--cache", default=".cache", help="Dataset cache directory")
    rep.add_argument("--commercial", action="store_true", help="Commercial-safe mode (exclude CC-BY-NC sources)")
    rep.add_argument("--offline", action="store_true", help="Skip the live OpenLitterMap query")
    rep.add_argument("--date", default=None, help="Override the report date (YYYY-MM-DD)")
    rep.set_defaults(func=cmd_report)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
