# Legal Framing

Where a report actually goes, the principle it leans on, and — candidly — whether anything
compels payment. This is the part most likely to get a report dismissed, so the model is
explicit about the ceiling.

## The candid enforceability statement

> **As of mid-2026 there is no operative international mechanism that compels a polluting
> state or company to pay a coastal country for beached plastic.**

This is overwhelmingly **soft law + advocacy leverage**, with exactly one hard *domestic* tool
(EPR) and one theoretical-but-unproven hard *international* tool (UNCLOS dispute settlement).
The report leads with this statement so it is read as an evidence-and-leverage instrument, not
a binding claim.

## Where the report goes, and the lever it pulls

| Forum | Principle | Enforceability | Role |
|---|---|---|---|
| **Domestic EPR regulator** (own jurisdiction) | Extended Producer Responsibility | **HARD / enforceable** — the only genuinely binding cost-recovery lever, but reaches **only producers within your jurisdiction**; cannot bill a foreign producer/state for imported beach plastic. | **Lead ask** |
| **UNEA / INC Global Plastics Treaty** ([UNEP INC](https://www.unep.org/inc-plastic-pollution)) | Polluter-pays + loss-and-damage framing | **Soft / advocacy.** Negotiations deadlocked (INC-5.1 Busan 2024, INC-5.2 Geneva 2025; INC-5.3 Feb 2026 administrative). Even draft Article 11 finance is *implementation funding for developing countries, not liability/compensation*. | Advocacy |
| **Regional Seas Conventions** (Cartagena/Caribbean, Barcelona/Med, Nairobi/E. Africa) | Cooperation + binding regional marine-litter plans, LBS protocols | **Mixed** — concrete fora, some binding plans, but **no victim-compensation machinery** for general plastic. | Diplomacy |
| **Basel Convention** ([plastic amendments](https://www.basel.int/implementation/plasticwaste/plasticwasteamendments/faqs/tabid/8427/default.aspx)) | Prior Informed Consent on waste exports | **Binding but wrong remedy** — lets you *refuse/control imports*, gives **no right to be paid**. | Leverage |
| **IMO MARPOL Annex V** ([IMO](https://www.imo.org/en/ourwork/environment/pages/garbage-default.aspx)) | Total ban on ship-source plastic discharge | **Binding but flag/port-state enforced** — **no coastal-state compensation right**. | Leverage |
| **UNCLOS Part XV / ITLOS / ICJ** ([UNCLOS Pt XV](https://www.un.org/depts/los/convention_agreements/texts/unclos/part15.htm), Arts. 192–235) | No-transboundary-harm duty + state responsibility | **Hard in theory, UNTESTED for plastics.** Strengthened by [ITLOS 2024](https://www.itlos.org/fileadmin/itlos/documents/cases/31/Advisory_Opinion/C31_Adv_Op_21.05.2024_orig.pdf) and [ICJ 2025](https://elaw.org/resource/icj_climateao_2025) — but **both advisory/non-binding and about GHGs**, and both require the respondent's **consent to jurisdiction**. **No coastal state has ever recovered money for beached plastic.** | Appendix only, labelled |

## The three walls a binding claim hits

1. **Attribution / causation** — beached plastic is diffuse and mixed-origin (the
   manufactured-in ≠ emitted-from confound; see [`METHODOLOGY.md`](METHODOLOGY.md)).
2. **Standing / injury** — "no state is likely to be individually injured" in the cognizable
   sense ([Maljean-Dubois & Mayer 2020, AJIL](https://www.cambridge.org/core/journals/american-journal-of-international-law/article/liability-and-compensation-for-marine-plastic-pollution-conceptual-issues-and-possible-ways-forward/A84CB7AEBAC4E98E2DE98C3E1144A3F3));
   non-injury doesn't *bar* state responsibility but complicates *reparation*.
3. **Consent-based jurisdiction** — no court hears a damages claim without the respondent's
   consent.

## The precedent that shapes the ask

The **UNFCCC Loss & Damage Fund** was built on *voluntary* contributions with explicit
*no-liability / no-compensation* framing (Paris Decision 1/CP.21 §51). Any future plastics fund
will likely copy this. So the model frames the monetary section as a **contribution case** and
**EPR cost-recovery**, not a liability verdict.

## Recommended report framing (encoded in `report/generate.py`)

1. **Lead** with the enforceable **domestic EPR cost-recovery** ask.
2. **Present** the regional-seas + UNEA asks as **advocacy leverage**.
3. **Reserve** the UNCLOS pathway as a *"credible litigation pathway, untested"* appendix —
   explicitly labelled, citing the ITLOS/ICJ tailwinds honestly as advisory and about GHGs.

The generated report renders exactly this order, with the enforceability ceiling at the top
and the limitations appendix at the bottom.
