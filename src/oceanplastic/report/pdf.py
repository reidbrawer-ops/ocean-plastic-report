"""Render the HTML report to a polished PDF.

Pipeline: styled HTML -> headless Chrome (`--print-to-pdf`) for the body -> a reportlab/pypdf
overlay stamps a running footer + "Page X of N" on every page after the cover. Chrome is used
because it has the best CSS support available on this machine (no WeasyPrint/pango); the
overlay supplies the page numbers Chrome's CLI cannot.
"""
from __future__ import annotations

import os
import shutil
import signal
import subprocess
import tempfile
import time
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas

_CHROME_CANDIDATES = [
    os.environ.get("CHROME_PATH", ""),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def find_chrome() -> str:
    for cand in _CHROME_CANDIDATES:
        if cand and Path(cand).exists():
            return cand
    for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
        found = shutil.which(name)
        if found:
            return found
    raise FileNotFoundError(
        "No Chrome/Chromium found for PDF rendering. Set CHROME_PATH, or install Chrome, "
        "or generate --format md/html instead."
    )


def _render_chrome(html_path: Path, base_pdf: Path, timeout: int = 60) -> None:
    chrome = find_chrome()
    with tempfile.TemporaryDirectory(prefix="op-chrome-") as profile:
        cmd = [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-pdf-header-footer",
            f"--user-data-dir={profile}",
            f"--print-to-pdf={base_pdf}",
            html_path.as_uri(),
        ]
        # Headless Chrome writes the PDF in a few seconds but often does NOT exit afterwards,
        # so we poll for the output file to appear and stabilize, then kill the process group.
        # (Don't block on .communicate(): Chrome may never exit, and unread PIPEs can deadlock.)
        proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True
        )
        try:
            last = -1
            waited = 0.0
            while waited < timeout:
                if proc.poll() is not None:
                    break  # Chrome exited on its own
                if base_pdf.exists():
                    size = base_pdf.stat().st_size
                    if size > 0 and size == last:
                        break  # file written and size stable across a tick
                    last = size
                time.sleep(0.5)
                waited += 0.5
        finally:
            if proc.poll() is None:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    proc.kill()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
    if not base_pdf.exists() or base_pdf.stat().st_size == 0:
        raise RuntimeError(f"Chrome failed to produce a PDF within {timeout}s.")


def _footer_overlay(width: float, height: float, left: str, center: str, right: str):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))
    y = 20.0
    c.setStrokeColor(Color(0.85, 0.88, 0.92))
    c.setLineWidth(0.5)
    c.line(50, y + 9, width - 50, y + 9)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(Color(0.42, 0.46, 0.52))
    c.drawString(50, y, left)
    c.drawCentredString(width / 2.0, y, center)
    c.drawRightString(width - 50, y, right)
    c.showPage()
    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def _stamp_footers(base_pdf: Path, out_pdf: Path, left: str, right: str, skip_cover: bool = True) -> None:
    reader = PdfReader(str(base_pdf))
    writer = PdfWriter()
    n = len(reader.pages)
    for i, page in enumerate(reader.pages):
        if not (skip_cover and i == 0):
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            page.merge_page(_footer_overlay(w, h, left, f"Page {i + 1} of {n}", right))
        writer.add_page(page)
    writer.add_metadata({"/Title": left, "/Creator": "oceanplastic", "/Producer": "oceanplastic + Chrome"})
    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    with open(out_pdf, "wb") as fh:
        writer.write(fh)


def html_to_pdf(html: str, out_path: str | Path, footer_left: str, footer_right: str = "Draft · illustrative") -> Path:
    out_path = Path(out_path)
    with tempfile.TemporaryDirectory(prefix="op-pdf-") as tmp:
        html_path = Path(tmp) / "report.html"
        base_pdf = Path(tmp) / "base.pdf"
        html_path.write_text(html, encoding="utf-8")
        _render_chrome(html_path, base_pdf)
        _stamp_footers(base_pdf, out_path, footer_left, footer_right)
    return out_path
