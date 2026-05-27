import json
import re
from pathlib import Path


BASE = Path(__file__).resolve().parent.parent
EXAMS_FILE = BASE / "data" / "exams.json"
ANNOS_FILE = BASE / "data" / "annotations.json"
RESEARCH_DIR = BASE / "data" / "wine_research"
OUT_DIR = BASE / "outputs" / "mock_answers"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def parse_frontmatter_and_sections(text):
    fm = {}
    body = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        for raw in parts[1].splitlines():
            if ":" not in raw:
                continue
            key, value = raw.split(":", 1)
            fm[key.strip()] = value.strip()
        body = parts[2]
    sections = {}
    current = None
    for line in body.splitlines():
        if line.startswith("## "):
            current = line[3:].strip()
            sections[current] = []
        elif current is not None:
            sections[current].append(line)
    sections = {k: "\n".join(v).strip() for k, v in sections.items()}
    return fm, sections


def first_sentence(text):
    if not text:
        return ""
    return re.split(r"(?<=[.!?])\s+", text.strip())[0].strip()


def informative_sentence(text):
    if not text:
        return ""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]
    for sentence in sentences:
        low = sentence.lower()
        if "colour" in low and len(sentence.split()) <= 5:
            continue
        if any(low.startswith(prefix) for prefix in [
            "pale ", "medium ", "deep ", "opaque ", "light ", "ruby", "gold", "straw", "lemon"
        ]):
            continue
        return sentence
    return sentences[0] if sentences else ""


def clean_variety(value):
    if not value:
        return "Unknown"
    value = re.sub(r"100%\s*", "", value)
    value = re.sub(r"\(.*?\)", "", value)
    value = value.replace("Shiraz", "Syrah").replace("shiraz", "syrah")
    value = value.replace("dominant", "")
    value = re.sub(r"\s+", " ", value).strip(" -;,.")
    return value or "Unknown"


def parse_brief(wine_id):
    path = RESEARCH_DIR / f"{wine_id}.md"
    if not path.exists():
        raise FileNotFoundError(wine_id)
    fm, sections = parse_frontmatter_and_sections(path.read_text(encoding="utf-8"))
    technical = sections.get("Technical specs", "")
    variety = "Unknown"
    for line in technical.splitlines():
        m = re.match(r"- Grape variet(?:y|ies):\s*(.+)", line)
        if m:
            variety = clean_variety(m.group(1))
            break
    return {
        "id": wine_id,
        "fm": fm,
        "sections": sections,
        "quick": sections.get("Quick tasting profile", ""),
        "technical": technical,
        "vintage_note": next((v for k, v in sections.items() if k.startswith("Vintage character")), ""),
        "producer": sections.get("Producer style", ""),
        "why": sections.get("Why it's in this exam", ""),
        "variety": variety,
    }


def parse_marks(question_text):
    parts = []
    total = 0
    for line in [x.strip() for x in question_text.splitlines() if x.strip()]:
        m = re.match(r"([a-z])\)\s+(.+?)\((\d+)\s*x\s*(\d+)\s*marks\)", line, re.I)
        if m:
            count = int(m.group(3))
            per = int(m.group(4))
            marks = count * per
            parts.append({"label": m.group(1).lower(), "prompt": m.group(2).strip(), "count": count, "marks": marks})
            total += marks
            continue
        m = re.match(r"([a-z])\)\s+(.+?)\((\d+)\s*marks\)", line, re.I)
        if m:
            marks = int(m.group(3))
            parts.append({"label": m.group(1).lower(), "prompt": m.group(2).strip(), "count": 1, "marks": marks})
            total += marks
    return parts, total


def target_word_count(total_marks):
    return min(420, max(250, int(total_marks * 3.0)))


def infer_groups(wines, question_text):
    lower = question_text.lower()
    if "pairs" in lower and len(wines) % 2 == 0:
        return [wines[i:i + 2] for i in range(0, len(wines), 2)], "pair"
    return [[w] for w in wines], "wine"


def origin_call(brief):
    fm = brief["fm"]
    country = fm.get("country", "").strip()
    region = fm.get("region", "").strip()
    sub = fm.get("sub_region", "").strip()
    app = fm.get("appellation", "").strip()
    parts = []
    for value in [app, sub, region, country]:
        if not value or value.lower() in {"unknown", "source needed", "n/a", "none"}:
            continue
        if value not in parts:
            parts.append(value)
    return ", ".join(parts[:3])


def strip_lead_descriptor(text):
    text = text.replace("Medium gold.", "").replace("Pale straw.", "").replace("Pale lemon.", "")
    text = text.replace("Deep ruby-red with violet tones.", "").replace("Deep crimson with purple hue.", "")
    return text.strip()


def sensory_line(brief):
    return strip_lead_descriptor(informative_sentence(brief["quick"]))


def style_metrics(brief):
    fm = brief["fm"]
    bits = []
    if fm.get("abv"):
        bits.append(f"{fm['abv']}% alcohol")
    rs = fm.get("rs_level", "")
    if rs and rs != "dry":
        bits.append(rs.replace("_", " "))
    structure = fm.get("structural_profile", "")
    if structure:
        bits.append(structure.replace("_", " "))
    oak = fm.get("oak_signature", "")
    if oak and oak not in {"none", "unclear"}:
        bits.append(oak.replace("_", " "))
    return ", ".join(bits[:4])


def diagnostic_evidence(brief, limit=3):
    fm = brief["fm"]
    quick = brief["quick"].lower()
    technical = brief["technical"].lower()
    evidence = []

    variety = brief["variety"]
    if variety and variety != "Unknown":
        evidence.append(f"varietal/blend profile ({variety})")
    if fm.get("abv"):
        evidence.append(f"{fm['abv']}% alcohol")
    structure = fm.get("structural_profile", "")
    if structure:
        evidence.append(structure.replace("_", " "))
    oak = fm.get("oak_signature", "")
    if oak and oak not in {"none", "unclear"}:
        evidence.append(oak.replace("_", " ") + " oak signature")
    for token, label in [
        ("whole", "whole-bunch/whole-berry handling"),
        ("carbonic", "carbonic character"),
        ("lees", "lees texture"),
        ("mlf", "MLF texture"),
    ]:
        if token in technical:
            evidence.append(label)
            break
    sensory = sensory_line(brief)
    if sensory:
        evidence.append(" ".join(sensory.split()[:18]).strip(" ;,."))
    if "garrigue" in quick:
        evidence.append("garrigue/herbal Mediterranean signature")
    if "autol" in quick or "brioche" in quick or "mousse" in quick:
        evidence.append("mousse/autolytic evidence")
    if "flor" in quick or "oxid" in quick:
        evidence.append("flor/oxidative evidence")

    seen = []
    for item in evidence:
        if item and item not in seen:
            seen.append(item)
    return seen[:limit]


def evidence_sentence(brief, conclusion, verb="supports"):
    evidence = diagnostic_evidence(brief)
    if not evidence:
        return f"The available glass evidence is consistent with {conclusion}."
    joined = evidence[0] if len(evidence) == 1 else ", ".join(evidence[:-1]) + f" and {evidence[-1]}"
    return f"The combination of {joined} {verb} {conclusion}."


def quality_reason(brief):
    fm = brief["fm"]
    text = " ".join([brief["quick"], brief["producer"], brief["why"]]).lower()
    reasons = []
    if any(x in text for x in ["balanced", "fresh", "elegant", "finesse"]):
        reasons.append("balance/freshness")
    if any(x in text for x in ["finish", "lingering", "persistent", "length"]):
        reasons.append("length")
    if any(x in text for x in ["concentrated", "density", "dense", "extract", "powerful"]):
        reasons.append("concentration")
    if any(x in text for x in ["complex", "layered", "multi"]):
        reasons.append("complexity")
    if any(x in text for x in ["benchmark", "classic", "typic", "terroir", "appellation"]):
        reasons.append("typicity")
    oak = fm.get("oak_signature", "")
    if oak and oak not in {"none", "unclear"}:
        reasons.append("oak handling")
    if any(x in text for x in ["age", "cellar", "long term", "decades"]):
        reasons.append("ageing capacity")
    classification = fm.get("classification", "")
    if classification and classification.lower() not in {"none", "n/a"}:
        reasons.append(classification)
    return ", ".join(reasons[:4]) or "sound balance and commercial positioning"


def style_statement(brief):
    fm = brief["fm"]
    bits = []
    for key in ["style_category", "rs_level", "structural_profile", "oak_signature"]:
        value = fm.get(key, "").replace("_", " ")
        if value and value not in {"dry", "none", "unclear"}:
            bits.append(value)
    if not bits:
        bits.append("regional, commercially focused")
    return ", ".join(bits[:5])


def quality_band(brief):
    classification = brief["fm"].get("classification", "").lower()
    text = " ".join([classification, brief["producer"], brief["why"]]).lower()
    if any(x in classification for x in ["grand cru", "grosses gewachs", "2eme", "grand cru class", "1er cru", "premier cru"]):
        return "outstanding quality"
    if any(x in classification for x in ["single vineyard", "riserva", "cru bourgeois", "estate", "vintage"]):
        return "very good to excellent quality"
    if classification in {"none (commodity tier)", "none", "n/a"}:
        return "good quality at best, more commercial than profound"
    if any(x in text for x in ["entry-level", "commodity", "budget", "simple", "mass-market", "supermarket"]):
        return "good quality at best, more commercial than profound"
    if any(x in text for x in ["grand cru", "grosses gewachs", "prestige", "benchmark", "flagship", "crown jewels", "top-tier"]):
        return "outstanding quality"
    if any(x in text for x in ["very good", "premium", "single vineyard", "serious", "riserva", "grand cru class", "2eme", "cru"]):
        return "very good to excellent quality"
    return "good to very good quality"


def maturity_statement(brief, exam_year):
    vintage = brief["fm"].get("vintage", "")
    text = " ".join([brief["quick"], brief["vintage_note"], brief["why"]]).lower()
    if not vintage.isdigit():
        if "solera" in brief["technical"].lower() or vintage.lower() == "nv":
            return "already mature in style rather than youthful"
        return "maturity is harder to fix precisely from the glass"
    age = exam_year - int(vintage)
    if "still youthful" in text or "still a baby" in text or "very youthful" in text:
        return "still very youthful"
    if "prime" in text:
        return "around prime maturity"
    if age <= 2:
        return "youthful"
    if age <= 5:
        return "young but developing"
    if age <= 10:
        return "developing with some early tertiary complexity"
    return "mature and fully evolved"


def ageing_statement(brief):
    text = " ".join([brief["quick"], brief["producer"], brief["why"], brief["vintage_note"]]).lower()
    if any(x in text for x in ["no capacity to age", "drink now", "short-term drinking", "immediate drinking"]):
        return "it is intended for early consumption and is unlikely to improve"
    if any(x in text for x in ["30+ years", "decades", "should age", "age 10+", "cellar"]):
        return "it has the structure to improve further and hold in the long term"
    if any(x in text for x in ["grand cru", "premium", "single vineyard", "very good"]):
        return "it should improve in bottle in the medium term"
    return "it should hold in the short to medium term rather than improve dramatically"


def commercial_statement(brief):
    text = " ".join([brief["producer"], brief["why"]]).lower()
    if any(x in text for x in ["supermarket", "mass-market", "commodity", "broad appeal", "budget", "entry-level"]):
        return "This style is aimed at broad retail distribution and by-the-glass placements."
    if any(x in text for x in ["fine-dining", "collector", "specialist retail", "sommelier", "prestige"]):
        return "This is more naturally placed in specialist retail and fine dining than in broad volume channels."
    if any(x in text for x in ["premium", "restaurant", "accessible pricing", "casual-dining"]):
        return "This sits comfortably in premium independent retail and better restaurant lists."
    return "This is commercially viable in niche-to-premium channels rather than mass-market distribution."


def winemaking_statement(brief):
    t = brief["technical"]
    picks = []
    for line in t.splitlines():
        line = line.strip("- ").strip()
        if line.startswith("Vinification:") or line.startswith("Élevage:") or line.startswith("Elevage:") or line.startswith("Aging:") or line.startswith("Dosage:"):
            picks.append(line.replace("É", "E"))
    if not picks:
        stub = first_sentence(t)
        return stub or "Source needed on exact vinification."
    joined = " ".join(picks[:3])
    return joined.replace("Vinification:", "").replace("Elevage:", "").replace("Élevage:", "").replace("Aging:", "").strip()


def common_variety(briefs):
    vals = [clean_variety(b["variety"]) for b in briefs if b["variety"] != "Unknown"]
    if not vals:
        return "Unknown"
    if all(v == vals[0] for v in vals):
        return vals[0]
    return " / ".join(vals)


def infer_grape_reasoning(briefs):
    cues = []
    for brief in briefs[:3]:
        cue = sensory_line(brief)
        if cue:
            cues.append(cue.lower())
    joined = "; ".join(cues)
    return joined[:320]


def intro_title(year, paper, question):
    return f"# Mock answer - {year} Paper {paper} Question {question}"


def part_header(label, prompt):
    return f"## {label}) {prompt}"


def write_identify_variety(part, year, wines, groups, group_type, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    lower = part["prompt"].lower()
    if group_type == "pair" and "both wines" in lower:
        for idx, group in enumerate(groups, start=1):
            pair = [briefs[w] for w in group]
            variety = common_variety(pair)
            lines.append(f"**Pair {idx}**")
            lines.append(f"{variety}")
            lines.append(f"The combination of {infer_grape_reasoning(pair)} is consistent with {variety}.")
            lines.append("")
        return lines
    shared = common_variety([briefs[w] for w in wines])
    lines.append(f"{shared}")
    lines.append(f"The combination of {infer_grape_reasoning([briefs[w] for w in wines])} is consistent with {shared}.")
    lines.append("")
    return lines


def write_identify_origin_variety(part, wines, groups, group_type, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    lower = part["prompt"].lower()
    if group_type == "pair" and "pair" in lower:
        for idx, group in enumerate(groups, start=1):
            lines.append(f"**Pair {idx}**")
            for w in group:
                b = briefs[w]
                call = f"{origin_call(b)}; {b['variety']}"
                lines.append(f"Wine {w}: {call}")
                lines.append(evidence_sentence(b, call))
            lines.append("")
        return lines

    for w in wines:
        b = briefs[w]
        call = f"{origin_call(b)}; {b['variety']}"
        lines.append(f"Wine {w}: {call}")
        lines.append(evidence_sentence(b, call))
        lines.append("")
    return lines


def write_origin(part, wines, groups, group_type, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    lower = part["prompt"].lower()
    if group_type == "pair" and "pair" in lower:
        for idx, group in enumerate(groups, start=1):
            lines.append(f"**Pair {idx}**")
            for w in group:
                lines.append(f"Wine {w}")
                lines.append(origin_call(briefs[w]))
            lines.append("")
        return lines
    for w in wines:
        lines.append(f"Wine {w}")
        lines.append(origin_call(briefs[w]))
        lines.append("")
    return lines


def write_quality_maturity(part, year, wines, groups, group_type, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    lower = part["prompt"].lower()
    if group_type == "pair" and any(x in lower for x in ["compare", "quality", "maturity", "capacity to age"]):
        for idx, group in enumerate(groups, start=1):
            b1 = briefs[group[0]]
            b2 = briefs[group[1]]
            lines.append(f"**Pair {idx}**")
            lines.append(f"Wine {group[0]} is {quality_band(b1)} and {maturity_statement(b1, year)}; {ageing_statement(b1)}")
            lines.append(f"Wine {group[1]} is {quality_band(b2)} and {maturity_statement(b2, year)}; {ageing_statement(b2)}")
            lines.append("")
        return lines
    for w in wines:
        b = briefs[w]
        lines.append(f"Wine {w}")
        lines.append(
            f"{quality_band(b)} in context: {quality_reason(b)}. "
            f"It is {maturity_statement(b, year)}; {ageing_statement(b)}."
        )
        lines.append("")
    return lines


def write_maturity(part, year, wines, groups, group_type, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    if group_type == "pair":
        for idx, group in enumerate(groups, start=1):
            lines.append(f"**Pair {idx}**")
            for w in group:
                b = briefs[w]
                lines.append(f"Wine {w}: {maturity_statement(b, year)}; {ageing_statement(b)}.")
            lines.append("")
        return lines
    for w in wines:
        b = briefs[w]
        lines.append(f"Wine {w}")
        lines.append(f"{maturity_statement(b, year)}; {ageing_statement(b)}.")
        lines.append("")
    return lines


def write_style_or_commercial(part, wines, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    for w in wines:
        b = briefs[w]
        lines.append(f"Wine {w}")
        text = [f"Style: {style_statement(b)}"]
        metrics = style_metrics(b)
        if metrics:
            text.append(f"key style evidence: {metrics}")
        if text:
            line = ". ".join(text)
            if not line.endswith("."):
                line += "."
            lines.append(line)
        lines.append(commercial_statement(b))
        lines.append("")
    return lines


def write_winemaking(part, wines, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    for w in wines:
        b = briefs[w]
        lines.append(f"Wine {w}")
        lines.append(winemaking_statement(b))
        lines.append(f"These are the decisive production choices because they explain the {style_statement(b)} style.")
        lines.append("")
    return lines


def write_vintage(part, wines, groups, group_type, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    if group_type == "pair":
        for idx, group in enumerate(groups, start=1):
            lines.append(f"**Pair {idx}**")
            for w in group:
                b = briefs[w]
                lines.append(f"Wine {w}: {b['fm'].get('vintage', 'NV')}. {first_sentence(b['vintage_note']) or 'Vintage note is limited in the brief.'}")
            lines.append("")
        return lines
    for w in wines:
        b = briefs[w]
        lines.append(f"Wine {w}")
        lines.append(f"{b['fm'].get('vintage', 'NV')}. {first_sentence(b['vintage_note']) or 'Vintage note is limited in the brief.'}")
        lines.append("")
    return lines


def write_blend_purpose(part, wines, briefs):
    target = wines[-1]
    b = briefs[target]
    lines = [part_header(part["label"], part["prompt"])]
    lines.append(f"Wine {target}")
    lines.append(
        f"The purpose of blending here is balance and complexity. {b['variety']} allows the wine to combine complementary fruit, structure and aromatic detail rather than relying on a single varietal profile."
    )
    lines.append("")
    return lines


def write_quality_style_winemaking(part, year, wines, briefs):
    lines = [part_header(part["label"], part["prompt"])]
    for w in wines:
        b = briefs[w]
        lines.append(f"Wine {w}")
        lines.append(
            f"{quality_band(b)} in context: {quality_reason(b)}. "
            f"Style: {style_statement(b)}. "
            f"Key production evidence: {winemaking_statement(b)}"
        )
        lines.append("")
    return lines


def render_body(year, question_text, wines, briefs):
    parts, _ = parse_marks(question_text)
    groups, group_type = infer_groups(wines, question_text)
    body = []
    for part in parts:
        prompt = part["prompt"].lower()
        has_quality = "quality" in prompt
        has_style = any(x in prompt for x in ["style", "consumer appeal", "commercial position", "commercial opportunities"])
        has_winemaking = any(x in prompt for x in ["winemaking", "production", "yeast"])
        if has_quality and has_style and has_winemaking:
            body.extend(write_quality_style_winemaking(part, year, wines, briefs))
        elif "identify" in prompt and "origin" in prompt and ("variet" in prompt or "grape" in prompt):
            body.extend(write_identify_origin_variety(part, wines, groups, group_type, briefs))
        elif "grape variet" in prompt or "variet" in prompt and "identify" in prompt:
            body.extend(write_identify_variety(part, year, wines, groups, group_type, briefs))
        elif "origin" in prompt and "identify" in prompt:
            body.extend(write_origin(part, wines, groups, group_type, briefs))
        elif "vintage" in prompt:
            body.extend(write_vintage(part, wines, groups, group_type, briefs))
        elif "blend" in prompt and "purpose" in prompt:
            body.extend(write_blend_purpose(part, wines, briefs))
        elif has_winemaking:
            body.extend(write_winemaking(part, wines, briefs))
        elif "maturity" in prompt and "quality" not in prompt:
            body.extend(write_maturity(part, year, wines, groups, group_type, briefs))
        elif any(x in prompt for x in ["quality", "maturity", "capacity to age"]):
            body.extend(write_quality_maturity(part, year, wines, groups, group_type, briefs))
        elif any(x in prompt for x in ["style", "consumer appeal", "commercial position", "commercial opportunities"]):
            body.extend(write_style_or_commercial(part, wines, briefs))
        else:
            body.extend(write_style_or_commercial(part, wines, briefs))
    return body


def trim_body(lines, limit):
    while len("\n".join(lines).split()) > limit:
        trimmed = False
        for i, line in enumerate(lines):
            if line.startswith("This is commercially viable"):
                if lines[i] != "":
                    lines[i] = ""
                    trimmed = True
                break
            if line.startswith("This sits comfortably") or line.startswith("This style is aimed") or line.startswith("This is more naturally placed"):
                if lines[i] != "":
                    lines[i] = ""
                    trimmed = True
                break
            if line.startswith("Wine ") and i + 1 < len(lines) and lines[i + 1].endswith(".") and len(lines[i + 1].split()) > 20:
                new_line = first_sentence(lines[i + 1])
                if new_line != lines[i + 1]:
                    lines[i + 1] = new_line
                    trimmed = True
                    break
            if line.startswith("The combination of ") and len(line.split()) > 18:
                lines[i] = line.replace("The combination of ", "Evidence: ", 1)
                trimmed = True
                break
            if line.startswith("Style: ") and ". key style evidence:" in line:
                lines[i] = line.split(". key style evidence:", 1)[0] + "."
                trimmed = True
                break
        if not trimmed:
            break
    return [line for line in lines if line != ""]


def render_answer(year, paper, question, qtext, wines, annotation, briefs):
    parts, total_marks = parse_marks(qtext)
    target = target_word_count(total_marks)
    body = render_body(year, qtext, wines, briefs)
    body = trim_body(body, target)
    actual = len("\n".join(body).split())

    out = []
    out.append("---")
    out.append(f"year: {year}")
    out.append(f"paper: {paper}")
    out.append(f"question: {question}")
    out.append(f"wines: [{','.join(str(w) for w in wines)}]")
    out.append(f"total_marks: {total_marks}")
    out.append(f"target_word_count: {target}")
    out.append(f"actual_word_count: {actual}")
    out.append("---")
    out.append("")
    out.append(intro_title(year, paper, question))
    out.append("")
    out.extend(body)
    out.append(f"## Word count: {actual}")
    out.append("")
    return "\n".join(out)


def main():
    exams = load_json(EXAMS_FILE)
    annos = load_json(ANNOS_FILE)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    anno_lookup = {(a["year"], a["paper"], a["question"]): a.get("annotation", "").strip() for a in annos}

    written = 0
    missing = []
    for exam in exams:
        year = exam["year"]
        for paper_obj in exam["papers"]:
            paper = paper_obj["paper"]
            for q in paper_obj["questions"]:
                question = q["n"]
                wines = q["wines"]
                briefs = {}
                missing_for_q = []
                for slot in wines:
                    wine_id = f"{year}_p{paper}_w{slot}"
                    try:
                        briefs[slot] = parse_brief(wine_id)
                    except FileNotFoundError:
                        missing_for_q.append(wine_id)
                if missing_for_q:
                    missing.extend(missing_for_q)
                    continue
                rendered = render_answer(
                    year,
                    paper,
                    question,
                    q["text"],
                    wines,
                    anno_lookup.get((year, paper, question), ""),
                    briefs,
                )
                out_path = OUT_DIR / f"{year}_p{paper}_q{question}.md"
                out_path.write_text(rendered, encoding="utf-8")
                written += 1
    print(f"written={written}")
    if missing:
        print("missing=" + ",".join(sorted(set(missing))))


if __name__ == "__main__":
    main()
