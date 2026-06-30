"""Assemble the report context and render the submission document."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from jinja2 import Environment, FileSystemLoader

from ..ingest import baselines
from ..ingest.bffp import BrandAttribution
from ..ingest.openlittermap import ObservationDensity
from ..schema import AttributionResult, Band
from ..sources import SourceRegistry
from ..value.valuation import Valuation

TEMPLATE_DIR = Path(__file__).parent / "templates"

# The candid enforceability ceiling, stated up front in every report.
ENFORCEABILITY_CEILING = (
    "As of mid-2026 there is **no operative international mechanism that compels a polluting "
    "state or company to pay a coastal country for beached plastic**. This document is therefore "
    "an **evidence-and-leverage instrument** — for domestic Extended Producer Responsibility "
    "(EPR) cost-recovery, treaty/regional-seas advocacy, and reputational pressure — **not a "
    "binding invoice**. Its credibility is its candor about what it cannot prove."
)

# Legal forums, EPR-first. (See docs/LEGAL_FRAMING.md for the full table + the three walls.)
LEGAL_FORUMS = [
    ("Domestic EPR regulator", "Extended Producer Responsibility",
     "HARD / enforceable — the only genuinely binding cost-recovery lever, but reaches only "
     "producers within your own jurisdiction.", "Lead ask"),
    ("UNEA / INC Global Plastics Treaty", "Polluter-pays + loss-and-damage framing",
     "Soft / advocacy — negotiations deadlocked (INC-5.1/5.2/5.3); draft finance is implementation "
     "funding, not liability/compensation.", "Advocacy"),
    ("Regional Seas (Cartagena Convention, Wider Caribbean)", "Cooperation + regional litter plans",
     "Mixed — concrete forum, some binding plans, but no victim-compensation machinery.", "Diplomacy"),
    ("Basel Convention", "Prior Informed Consent on waste exports",
     "Binding but wrong remedy — lets you refuse/control imports, gives no right to be paid.", "Leverage"),
    ("IMO MARPOL Annex V", "Ban on ship-source plastic discharge",
     "Binding but flag/port-state enforced — no coastal-state compensation right.", "Leverage"),
    ("UNCLOS Part XV / ITLOS", "No-transboundary-harm duty + state responsibility",
     "Hard in theory, UNTESTED for plastics; consent-based jurisdiction. 2024 ITLOS / 2025 ICJ "
     "advisory opinions are tailwinds but advisory and about GHGs.", "Appendix only"),
]

# The 8 credibility risks (closing appendix), each with how it is caveated.
LIMITATIONS = [
    ("Manufactured-in != emitted-from",
     "Producer responsibility and emission pathway are reported as SEPARATE axes; no emitting "
     "country is named from item-level evidence (the Inaccessible Island trap)."),
    ("Brand audits blind to ~half the items, count-not-mass",
     "The unbranded share is stated; counts and (where possible) mass kept separate; rankings noted "
     "to shift with audit location and ranking rule."),
    ("River/country emission models weakly validated, disagree by ~2 orders of magnitude",
     "Figures are ranges, used as ordinal/relative; the Strokal-2023 top-down ~0.7 Mt/yr anchor is "
     "cited against the bottom-up centrals."),
    ("Drift attribution is probabilistic, dominated by unknown floating time",
     "Region/pathway are an illustrative Tier-B prior (a STUB), never a country/river for a single "
     "item; the full build outputs a probability map with ensemble spread."),
    ("Plastic-credit valuation invites greenwashing attack",
     "Credits are a cross-check only, never the core ask; GAIA/BFFP critiques disclosed."),
    ("No enforceable forum exists",
     "Framed as EPR cost-recovery + a contribution case (the L&D no-liability template), not a verdict."),
    ("Data-license / provenance traps",
     "License tracked per record; CC-BY-NC sources quarantined; commercial-safe sources preferred."),
    ("Single-vendor / single-source figures",
     "Such figures are labelled; multiply-corroborated numbers (Jambeck headline, Cowger brand shares, "
     "World Bank credit range) are led with."),
]


def _fmt_usd(b: Optional[Band]) -> str:
    if b is None:
        return "n/a"
    return f"${b.low:,.0f} – ${b.high:,.0f} (central ${b.central:,.0f})"


def _fmt_band(b: Optional[Band], unit: str = "") -> str:
    if b is None:
        return "n/a"
    u = f" {unit or b.unit}".rstrip()
    return f"{b.low:,.1f} – {b.high:,.1f}{u} (central {b.central:,.1f}{u})"


def _pct(x: float) -> str:
    return f"{x:.1%}"


def build_context(
    pilot: dict,
    legal: dict,
    density: ObservationDensity,
    attribution: AttributionResult,
    valuation: Valuation,
    registry: SourceRegistry,
    generated_date: str,
    commercial: bool,
    producer_disclosures: list,
) -> dict:
    from ..attribute.drift import STUB_DISCLAIMER

    return {
        "pilot": pilot,
        "legal": legal,
        "generated_date": generated_date,
        "commercial": commercial,
        "ceiling": ENFORCEABILITY_CEILING,
        "density": density,
        "attr": attribution,
        "val": valuation,
        "producer_disclosures": producer_disclosures,
        "drift_disclaimer": STUB_DISCLAIMER,
        "legal_forums": LEGAL_FORUMS,
        "limitations": LIMITATIONS,
        "baselines": {
            "top_emitters": baselines.top_emitter_shares(8),
            "lebreton": baselines.LEBRETON_RIVER_MT_YR,
            "strokal": baselines.STROKAL_TOPDOWN_MT_YR,
        },
        "sources": registry.all(),
        "quarantined": registry.quarantined(),
    }


def _env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        # Autoescape only for the HTML template; the markdown template stays raw.
        autoescape=lambda name: bool(name) and name.endswith((".html.j2", ".html")),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["usd"] = _fmt_usd
    env.filters["band"] = _fmt_band
    env.filters["pct"] = _pct
    return env


def render(context: dict, template: str = "report.md.j2") -> str:
    return _env().get_template(template).render(**context)


def render_html(context: dict) -> str:
    return render(context, "report.html.j2")


def write_report(context: dict, out_path: str | Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(context), encoding="utf-8")
    return out_path


def write_html(context: dict, out_path: str | Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render_html(context), encoding="utf-8")
    return out_path
