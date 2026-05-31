"""
Generate batched SQL to mirror data/structured/*.json into a dedicated Neon
`corpus` schema (corpus.wines / corpus.questions / corpus.subquestions).

Each table = a few indexed scalar columns + a full `data jsonb` blob.
JSON is dollar-quoted ($j$...$j$) so apostrophes/accents need no escaping.

Writes data/structured/_neon_statements.json = a flat list of SQL statements
(DDL first, then chunked multi-row INSERTs) ready to feed to the Neon MCP.
"""
import io, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SD = ROOT / "data" / "structured"


def load(name):
    return json.load(io.open(SD / name, encoding="utf-8"))


def jq(obj):
    # dollar-quoted JSON literal; JSON never contains the token $j$
    return "$j$" + json.dumps(obj, ensure_ascii=False) + "$j$"


def s(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    return "$j$" + str(v) + "$j$"


def chunked(rows, n):
    for i in range(0, len(rows), n):
        yield rows[i:i + n]


stmts = []
stmts.append("CREATE SCHEMA IF NOT EXISTS corpus;")

# --- wines ---
stmts.append("DROP TABLE IF EXISTS corpus.wines;")
stmts.append("""CREATE TABLE corpus.wines (
  wine_id text PRIMARY KEY, year int, paper int, slot int, is_last10 boolean,
  variety text, country text, world text, region text, vintage int,
  age_at_exam int, style_category text, curveball_level text,
  price_band text, benchmark_status text, commercial_tier text,
  data jsonb
);""")
W = load("corpus_wines.json")
cols = "(wine_id,year,paper,slot,is_last10,variety,country,world,region,vintage,age_at_exam,style_category,curveball_level,price_band,benchmark_status,commercial_tier,data)"
for batch in chunked(W, 120):
    vals = []
    for w in batch:
        vals.append("(" + ",".join([
            s(w["wine_id"]), s(w["year"]), s(w["paper"]), s(w["slot"]), s(w["is_last10"]),
            s(w["variety"]), s(w["country"]), s(w["world"]), s(w["region"]), s(w["vintage"]),
            s(w["age_at_exam"]), s(w["style_category"]), s(w["curveball_level"]),
            s(w["price_band"]), s(w["benchmark_status"]), s(w["commercial_tier"]), jq(w),
        ]) + ")")
    stmts.append(f"INSERT INTO corpus.wines {cols} VALUES " + ",".join(vals) + ";")

# --- questions ---
stmts.append("DROP TABLE IF EXISTS corpus.questions;")
stmts.append("""CREATE TABLE corpus.questions (
  qid text PRIMARY KEY, year int, paper int, n int, is_last10 boolean,
  flight_size int, total_marks int, expected_marks int, marks_ok boolean,
  n_subquestions int, family text, subcategory text, data jsonb
);""")
Q = load("corpus_questions.json")
cols = "(qid,year,paper,n,is_last10,flight_size,total_marks,expected_marks,marks_ok,n_subquestions,family,subcategory,data)"
for batch in chunked(Q, 120):
    vals = []
    for q in batch:
        vals.append("(" + ",".join([
            s(q["qid"]), s(q["year"]), s(q["paper"]), s(q["n"]), s(q["is_last10"]),
            s(q["flight_size"]), s(q["total_marks"]), s(q["expected_marks"]), s(q["marks_ok"]),
            s(q["n_subquestions"]), s(q["family"]), s(q["subcategory"]), jq(q),
        ]) + ")")
    stmts.append(f"INSERT INTO corpus.questions {cols} VALUES " + ",".join(vals) + ";")

# --- subquestions ---
stmts.append("DROP TABLE IF EXISTS corpus.subquestions;")
stmts.append("""CREATE TABLE corpus.subquestions (
  subq_id text PRIMARY KEY, qid text, year int, paper int, n int, is_last10 boolean,
  flight_size int, label text, type text, marks_each int, marks_count int,
  marks_sum int, marks_pct_of_question real, data jsonb
);""")
S = load("corpus_subquestions.json")
cols = "(subq_id,qid,year,paper,n,is_last10,flight_size,label,type,marks_each,marks_count,marks_sum,marks_pct_of_question,data)"
for batch in chunked(S, 120):
    vals = []
    for x in batch:
        vals.append("(" + ",".join([
            s(x["subq_id"]), s(x["qid"]), s(x["year"]), s(x["paper"]), s(x["n"]), s(x["is_last10"]),
            s(x["flight_size"]), s(x["label"]), s(x["type"]), s(x["marks_each"]), s(x["marks_count"]),
            s(x["marks_sum"]), s(x["marks_pct_of_question"]), jq(x),
        ]) + ")")
    stmts.append(f"INSERT INTO corpus.subquestions {cols} VALUES " + ",".join(vals) + ";")

(SD / "_neon_statements.json").write_text(json.dumps(stmts, ensure_ascii=False), encoding="utf-8")
print(f"statements: {len(stmts)}")
print(f"max stmt chars: {max(len(x) for x in stmts)}")
print(f"total chars: {sum(len(x) for x in stmts)}")
