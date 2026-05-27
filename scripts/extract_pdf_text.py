import argparse
from pathlib import Path

from pypdf import PdfReader


def safe_name(path: Path) -> str:
    return path.stem.strip().replace(" ", "_") + ".txt"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="C:/tmp/mw_pdf_extracts")
    parser.add_argument("pdfs", nargs="+")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    for raw_path in args.pdfs:
        path = Path(raw_path)
        reader = PdfReader(str(path))
        text = "\n\n".join((page.extract_text() or "") for page in reader.pages)
        dest = out_dir / safe_name(path)
        dest.write_text(text, encoding="utf-8")
        print(f"{path.name}\tpages={len(reader.pages)}\twords={len(text.split())}\t{dest}")


if __name__ == "__main__":
    main()
