"""
Download the public IMW exam-paper and examiner-report PDFs into source/imw_pdfs/.

The PDFs themselves are NOT committed: they are ~14 MB of copyrighted IMW material
(© Institute of Masters of Wine), and the repo keeps the derived, human-readable
compilations instead (source/MW_*_Compilation.md). This script makes the raw source
reproducible on any machine.

Two gotchas this script exists to encode:

  1. **Hotlink protection.** The wp-content PDFs 403/404 unless the request carries a
     browser User-Agent *and* `Referer: https://www.mastersofwine.org/mw-exam`.
     This is the real cause of the "Access Forbidden" problem the IMW's own download
     help attributes to Adobe browser extensions.

  2. **Unlisted files.** The examiner reports for 2014, 2016 and 2018 exist on the
     server but are not linked from the MW-exam page. They were found by probing
     filename patterns and are listed explicitly below.

Usage:
    python scripts/fetch_imw_pdfs.py          # download anything missing
    python scripts/fetch_imw_pdfs.py --force  # re-download everything
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "source" / "imw_pdfs"
BASE = "https://www.mastersofwine.org/wp-content/uploads"
REFERER = "https://www.mastersofwine.org/mw-exam"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# local filename -> path under /wp-content/uploads/
FILES: dict[str, str] = {
    # --- Stage 2 exam papers (theory + practical questions in one PDF) ---
    # 2000-2014 are the FOUR-paper theory era; 2015+ are the FIVE-paper era.
    "exam_2000.pdf": "2019/09/mini_exam_00.pdf",
    "exam_2001.pdf": "2019/09/mini_exam_01.pdf",
    "exam_2002.pdf": "2019/09/mini_exam_02.pdf",
    "exam_2003.pdf": "2019/09/mini_exam_03.pdf",
    "exam_2004.pdf": "2019/09/mini_exam_04.pdf",
    "exam_2005.pdf": "2019/09/mini_exam_05.pdf",
    "exam_2006.pdf": "2019/09/mini_exam_06.pdf",
    "exam_2007.pdf": "2019/09/mini_exam_07.pdf",
    "exam_2008.pdf": "2019/09/mini_exam_08.pdf",
    "exam_2009.pdf": "2019/09/mini_exam_2009.pdf",
    "exam_2010.pdf": "2019/09/mini_exam_2010.pdf",          # image scan, no text layer
    "exam_2011.pdf": "2019/09/mini_exam_2011_2570.pdf",
    "exam_2012.pdf": "2019/09/mini_exam_2012.pdf",
    "exam_2013.pdf": "2019/09/2013_exam_questions_and_wines.pdf",
    "exam_2014.pdf": "2019/09/mini_exam_2014.pdf",
    "exam_2015.pdf": "2019/09/imw_2015_theory_and_practical_mw_examination_questions_and_wines.pdf",
    "exam_2016.pdf": "2019/09/imw_2016_theory_and_practical_mw_examination_questions_and_wines.pdf",
    "exam_2017.pdf": "2019/09/imw_examination_questions_and_wines_2017.pdf",
    "exam_2018.pdf": "2019/09/imw_2018_examination_questions_and_wines.pdf",
    "exam_2019.pdf": "2019/09/imw_mw_examination_2019.pdf",
    # 2020: no exam held (COVID-19).
    "exam_2021.pdf": "2021/09/IMW-MW-Exam-2021.pdf",        # image scan, no text layer
    "exam_2022.pdf": "2022/08/imw_s2_exam_2022.pdf",        # image scan, no text layer
    "exam_2023.pdf": "2023/06/imw_s2_exam_2023.pdf",        # image scan, no text layer
    "exam_2024.pdf": "2024/06/imw_s2_exam_2024.pdf",
    "exam_2025.pdf": "2025/06/imw_s2_exam_2025-v2.pdf",
    "exam_2026.pdf": "2026/06/MW-exam-questions-and-wines-2026.pdf",

    # --- Stage 2 examiner reports (per-question commentary; the rubric source) ---
    "examiners_report_2010.pdf": "2019/09/2010_examiners_report.pdf",
    "examiners_report_2011.pdf": "2019/09/2011_examiners_report.pdf",
    "examiners_report_2012.pdf": "2019/09/examiners_report_2012.pdf",
    "examiners_report_2013.pdf": "2019/09/examiners_report_2013.pdf",
    "examiners_report_2014.pdf": "2019/09/2014_examiners_report.pdf",        # UNLISTED on the page
    "examiners_report_2016.pdf": "2019/09/imw_2016_examiners_report.pdf",    # UNLISTED on the page
    "examiners_report_2018.pdf": "2019/09/imw_2018_examiners_report.pdf",    # UNLISTED on the page
    # 2015, 2017, 2019, 2021-2026 reports are NOT public — IMW student area only.

    # --- Stage 1 Assessment papers + marker reports ---
    "s1a_2015.pdf": "2019/09/first_year_assessment_wines_and_questions_2015.pdf",
    "s1a_2016.pdf": "2019/09/2016_theory_and_practical_stage_1_assessment_questions_and_wines.pdf",
    "s1a_2017.pdf": "2019/09/stage_1_assessment_2017_questions_and_wines.pdf",
    "s1a_2018.pdf": "2019/09/stage_1_assessment_2018_questions_and_wines.pdf",
    "s1a_2019.pdf": "2019/09/stage_1_assessment_2019_questions_and_wines_edit.pdf",
    "s1a_2021.pdf": "2021/09/IMW-S1A-2021.pdf",
    "s1a_2022.pdf": "2022/08/imw_s1a_2022.pdf",
    "s1a_2023.pdf": "2023/06/imw_s1a_2023.pdf",
    "s1a_2024.pdf": "2024/06/imw_s1a_2024.pdf",
    "s1a_2025.pdf": "2025/06/imw_s1a_2025.pdf",
    "s1a_2026.pdf": "2026/06/S1A-questions-and-wines-2026.pdf",
    "s1a_report_2015.pdf": "2019/09/markers_report_fya_2015.pdf",
    "s1a_report_2016.pdf": "2019/09/stage_1_assessment_report_2016.pdf",
    "s1a_report_2017.pdf": "2019/09/stage_1_assessment_2017_examiners_report.pdf",
    "s1a_report_2018.pdf": "2019/09/s1a_examiner_report_2018.pdf",
    "s1a_report_2019.pdf": "2019/10/s1a_examiner_report_2019.pdf",
}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": REFERER})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def main() -> None:
    force = "--force" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = skipped = 0
    failures: list[str] = []

    for name, path in sorted(FILES.items()):
        dest = OUT_DIR / name
        if dest.exists() and not force:
            skipped += 1
            continue
        try:
            data = fetch(f"{BASE}/{path}")
        except Exception as exc:  # noqa: BLE001 — report and continue
            failures.append(f"{name}: {exc}")
            continue
        if not data.startswith(b"%PDF"):
            failures.append(f"{name}: response is not a PDF ({len(data)} bytes) — hotlink block?")
            continue
        dest.write_bytes(data)
        downloaded += 1
        print(f"  got {name} ({len(data):,} bytes)")

    print(f"\nOK: {downloaded} downloaded, {skipped} already present, {len(failures)} failed")
    if failures:
        print("FAILURES:")
        for f in failures:
            print("  -", f)
        raise SystemExit(1)
    print(f"OK: {len(FILES)} files in {OUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
