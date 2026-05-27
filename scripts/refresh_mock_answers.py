import argparse
from pathlib import Path

import scripts.generate_mock_answers as g


def load_context():
    exams = g.load_json(g.EXAMS_FILE)
    annos = g.load_json(g.ANNOS_FILE)
    lookup = {(a["year"], a["paper"], a["question"]): a.get("annotation", "").strip() for a in annos}
    return exams, lookup


def refresh_years(years):
    exams, lookup = load_context()
    for year in years:
        exam = next(x for x in exams if x["year"] == year)
        for paper_obj in exam["papers"]:
            paper = paper_obj["paper"]
            for q in paper_obj["questions"]:
                briefs = {w: g.parse_brief(f"{year}_p{paper}_w{w}") for w in q["wines"]}
                text = g.render_answer(year, paper, q["n"], q["text"], q["wines"], lookup.get((year, paper, q["n"]), ""), briefs)
                Path(f"outputs/mock_answers/{year}_p{paper}_q{q['n']}.md").write_text(text, encoding="utf-8")
        print(f"{year}: refreshed")


def check_coverage():
    exams, _ = load_context()
    expected = {
        f"{exam['year']}_p{paper['paper']}_q{question['n']}.md"
        for exam in exams
        for paper in exam["papers"]
        for question in paper["questions"]
    }
    actual = {p.name for p in Path("outputs/mock_answers").glob("*.md")}
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    print("missing=", missing)
    print("extra=", extra)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--years", nargs="*", type=int)
    args = parser.parse_args()

    if args.check:
        check_coverage()
    if args.years:
        refresh_years(args.years)


if __name__ == "__main__":
    main()
