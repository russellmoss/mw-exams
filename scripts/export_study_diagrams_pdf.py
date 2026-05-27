from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "outputs" / "study_diagrams_site"
PDF_DIR = ROOT / "outputs" / "study_diagrams_pdf"

PRINT_PAGES = [
    "variety-cards-print.html",
    "p1-whites-print.html",
    "p2-reds-print.html",
    "p3-special-print.html",
]

CHROME_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
]


def find_browser() -> Path:
    for candidate in CHROME_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Chrome/Edge executable not found")


def export_pdf(browser: Path, html_name: str) -> Path:
    source = (SITE_DIR / html_name).resolve()
    output = PDF_DIR / html_name.replace(".html", ".pdf")
    output.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(browser),
        "--headless=new",
        "--disable-gpu",
        "--allow-file-access-from-files",
        f"--print-to-pdf={output}",
        str(source.as_uri()),
    ]
    subprocess.run(cmd, check=True)
    return output


def main() -> int:
    browser = find_browser()
    generated: list[Path] = []
    for html_name in PRINT_PAGES:
        generated.append(export_pdf(browser, html_name))

    for pdf in generated:
        print(pdf)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
