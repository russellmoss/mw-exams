"""
Parse v2 decision matrices to extract structured predictions.
Outputs a JSON file with per-question predictions suitable for the scorer.

Handles structural variation across the 5 agent batches:
- "Candidate varieties" vs "Candidate wine types" vs "Candidate styles"
- Individual variety lines vs multi-variety groups
- "Candidate origins per slot" vs "Candidate origins per wine" vs "Candidate origins per pair"
"""

import json
import re
import unicodedata
from pathlib import Path
from collections import OrderedDict

V2_DIR = Path("outputs/decision_matrices_v2")
EXAMS_FILE = Path("data/exams.json")
OUTPUT_FILE = Path("data/loyo_predictions.json")

CONFIDENCE_TIERS = ["STRONG SIGNAL", "PLAUSIBLE", "CURVEBALL"]


def strip_accents(s):
    nfkd = unicodedata.normalize('NFKD', s)
    out = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return out.replace('’', "'").replace('‘', "'")


def extract_section(text, heading_pattern):
    """Extract the content between a heading and the next heading of same or higher level."""
    # Try ## level first, then ### level
    for prefix in [r'##', r'###']:
        pattern = rf'{prefix}\s+{heading_pattern}\s*\n(.*?)(?=\n##\s|\Z)'
        m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ""


KNOWN_VARIETY_NAMES = {
    'chardonnay', 'riesling', 'sauvignon blanc', 'pinot noir', 'cabernet sauvignon',
    'merlot', 'syrah', 'shiraz', 'grenache', 'tempranillo', 'nebbiolo', 'sangiovese',
    'chenin blanc', 'chenin', 'semillon', 'viognier', 'pinot gris', 'pinot grigio',
    'gewurztraminer', 'muscat', 'moscato', 'malbec', 'zinfandel', 'cabernet franc',
    'mourvedre', 'monastrell', 'gamay', 'furmint', 'palomino', 'pedro ximenez',
    'melon de bourgogne', 'melon', 'corvina', 'garganega', 'nerello mascalese',
    'aglianico', 'pinotage', 'petite sirah', 'tannat', 'carmenere', 'glera',
    'savagnin', 'trebbiano', 'malvasia', 'grillo', 'albarino', 'torrontes',
    'gruner veltliner', 'arneis', 'verdejo', 'godello', 'moschofilero',
    'montepulciano', 'blaufrankisch', 'touriga nacional', 'tinta roriz',
    'brachetto', 'lambrusco', 'cinsault', 'carignan', 'garnacha',
    'welschriesling', 'vidal', 'xinomavro', 'zweigelt', 'barbera',
    'xarel-lo', 'macabeo', 'parellada', 'pinot blanc', 'auxerrois',
    'pinot meunier', 'bobal', 'sercial', 'verdelho', 'boal', 'malmsey',
    'petit manseng', 'gros manseng', 'marsanne', 'roussanne',
}

KNOWN_WINE_STYLES = {
    'champagne', 'cava', 'prosecco', 'cremant', 'sekt', 'english sparkling',
    'sherry', 'port', 'madeira', 'manzanilla', 'fino', 'amontillado',
    'oloroso', 'palo cortado', 'vintage port', 'tawny port', 'ruby port',
    'sauternes', 'tokaji', 'tokaji aszu', 'icewine', 'vin santo',
    'recioto', 'amarone', 'passito', 'beerenauslese',
    'maury', 'banyuls', 'rutherglen muscat', 'vin jaune',
    'rose', 'orange wine', 'amber wine', 'provence rose',
    'szamorodni', 'edes szamorodni', 'tokaji edes szamorodni',
    'fine ruby port', 'cru classe rose', 'provence cru classe rose',
    'vecchio samperi', 'brachetto d\'acqui',
}


REGION_TO_COUNTRY = {
    'burgundy': 'France', 'bordeaux': 'France', 'loire': 'France',
    'champagne': 'France', 'alsace': 'France', 'rhone': 'France',
    'provence': 'France', 'jura': 'France', 'languedoc': 'France',
    'roussillon': 'France', 'beaujolais': 'France', 'sauternes': 'France',
    'cote de nuits': 'France', 'côte de nuits': 'France',
    'nuits-saint-georges': 'France',
    'barsac': 'France', 'pessac': 'France', 'st julien': 'France',
    'saint julien': 'France', 'st emilion': 'France', 'saint emilion': 'France',
    'st estephe': 'France', 'pauillac': 'France', 'margaux': 'France',
    'tuscany': 'Italy', 'piedmont': 'Italy', 'piemonte': 'Italy',
    'veneto': 'Italy', 'sicily': 'Italy', 'alto adige': 'Italy',
    'campania': 'Italy', 'abruzzo': 'Italy', 'montalcino': 'Italy',
    'jerez': 'Spain', 'rioja': 'Spain', 'penedes': 'Spain',
    'rias baixas': 'Spain', 'sierra de gredos': 'Spain', 'valle del tietar': 'Spain',
    'mosel': 'Germany', 'rheingau': 'Germany', 'franken': 'Germany',
    'baden': 'Germany', 'ahr': 'Germany',
    'barossa': 'Australia', 'hunter valley': 'Australia', 'margaret river': 'Australia',
    'clare valley': 'Australia', 'eden valley': 'Australia', 'mclaren vale': 'Australia',
    'marlborough': 'New Zealand', 'central otago': 'New Zealand', 'hawkes bay': 'New Zealand',
    'napa': 'USA', 'sonoma': 'USA', 'willamette': 'USA', 'anderson valley': 'USA',
    'california': 'USA', 'north coast': 'USA', 'monterey': 'USA',
    'stellenbosch': 'South Africa', 'swartland': 'South Africa',
    'mendoza': 'Argentina', 'salta': 'Argentina',
    'colchagua': 'Chile', 'maipo': 'Chile', 'aconcagua': 'Chile',
    'douro': 'Portugal', 'madeira': 'Portugal',
    'wachau': 'Austria', 'kamptal': 'Austria', 'burgenland': 'Austria',
    'niederosterreich': 'Austria', 'niederösterreich': 'Austria',
    'tokaj': 'Hungary', 'tokaji': 'Hungary',
    'niagara': 'Canada',
    'peloponnese': 'Greece', 'amyndeon': 'Greece', 'naoussa': 'Greece',
    'west sussex': 'England', 'hampshire': 'England',
}


REGION_TO_VARIETIES = {
    'bordeaux': ['Cabernet Sauvignon', 'Merlot'],
    'saint-julien': ['Cabernet Sauvignon', 'Merlot'],
    'saint julien': ['Cabernet Sauvignon', 'Merlot'],
    'pauillac': ['Cabernet Sauvignon'],
    'margaux': ['Cabernet Sauvignon', 'Merlot'],
    'pomerol': ['Merlot'],
    'burgundy': ['Pinot Noir'],
    'cote de nuits': ['Pinot Noir'],
    'côte de nuits': ['Pinot Noir'],
    'nuits-saint-georges': ['Pinot Noir'],
    'barolo': ['Nebbiolo'],
    'barbaresco': ['Nebbiolo'],
    'rioja': ['Tempranillo'],
    'champagne': ['Chardonnay', 'Pinot Noir', 'Pinot Meunier'],
    'sauternes': ['Semillon'],
    'jerez': ['Palomino'],
    'douro': ['Touriga Nacional'],
    'madeira': ['Sercial'],
    'valpolicella': ['Corvina'],
    'rutherglen': ['Muscat'],
    'provence': ['Grenache', 'Cinsault'],
}


STYLE_TO_VARIETIES = {
    'champagne': ['Chardonnay', 'Pinot Noir', 'Pinot Meunier'],
    'sauternes': ['Semillon'],
    'vintage port': ['Touriga Nacional', 'Touriga Franca'],
    'sherry': ['Palomino'],
    'oloroso': ['Palomino'],
    'amontillado': ['Palomino'],
    'palo cortado': ['Palomino'],
    'madeira': ['Sercial'],
    'amber wine': ['Rkatsiteli'],
    'orange wine': ['Rkatsiteli'],
    'vecchio samperi': ['Grillo'],
    'vin jaune': ['Savagnin'],
    'amarone': ['Corvina'],
    'brachetto d\'acqui': ['Brachetto'],
    'rutherglen muscat': ['Muscat'],
    'provence cru classe rose': ['Grenache', 'Cinsault'],
    'cru classe rose': ['Grenache', 'Cinsault'],
    'provence rose': ['Grenache', 'Cinsault'],
    'tokaji edes szamorodni': ['Furmint'],
    'edes szamorodni': ['Furmint'],
    'szamorodni': ['Furmint'],
    'tokaji aszu': ['Furmint'],
    'madeira sercial': ['Sercial'],
    'sercial 10 years old': ['Sercial'],
    'fine ruby port': ['Touriga Nacional', 'Touriga Franca'],
    'ruby port': ['Touriga Nacional', 'Touriga Franca'],
    'tawny port': ['Touriga Nacional', 'Touriga Franca'],
    '40 year tawny port': ['Touriga Nacional', 'Touriga Franca'],
}


def find_style_candidates(text):
    """Return style names mentioned in text, longest-first, de-duplicated."""
    text_lower = strip_accents(text).lower()
    found = []
    seen = set()
    for ks in sorted(KNOWN_WINE_STYLES, key=len, reverse=True):
        if ks in text_lower and ks not in seen:
            found.append(ks.title())
            seen.add(ks)
    return found


def extract_explicit_variety(text):
    """Extract explicit 'variety is given' style statements from arbitrary text."""
    patterns = [
        r'variety is given\s+[—-]\s*([A-Za-z\'\-\s]+)',
        r'made from\s+([A-Za-z\'\-\s]+?)(?:[.;,\n]|$)',
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if not m:
            continue
        candidate = re.sub(r'\s+', ' ', m.group(1)).strip(" .;,:-")
        candidate_lower = strip_accents(candidate).lower()
        if candidate_lower in KNOWN_VARIETY_NAMES:
            return candidate
    return ""


def parse_varieties_section(text):
    """Parse the candidate varieties section into a ranked list with tiers."""
    varieties = []

    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        tier = None
        for t in CONFIDENCE_TIERS:
            if f'**{t}**' in line or f'*{t}*' in line or t in line:
                tier = t
                break

        if not tier:
            continue

        clean = re.sub(r'\*\*?', '', line)

        # Extract everything before the tier keyword
        for t in CONFIDENCE_TIERS:
            idx = clean.find(t)
            if idx > 0:
                candidate_part = clean[:idx]
                break
        else:
            candidate_part = clean

        candidate_part = re.sub(r'^-\s*', '', candidate_part).strip().rstrip(':- —–')

        # Handle "Loire Valley trio (Melon / Chenin / Sauvignon Blanc)" pattern,
        # but only mine the parentheses when they actually contain grape names.
        paren_match = re.search(r'\(([^)]+)\)', candidate_part)
        if paren_match:
            inner = paren_match.group(1)
            inner_lower = strip_accents(inner).lower()
            sub_vars = [v.strip() for v in re.split(r'[/,]', inner)]
            inner_has_variety = any(
                strip_accents(sv).lower() in KNOWN_VARIETY_NAMES
                or any(kv in strip_accents(sv).lower() for kv in KNOWN_VARIETY_NAMES)
                for sv in sub_vars
            )
            if inner_has_variety:
                for sv in sub_vars:
                    sv_clean = sv.strip()
                    if sv_clean and len(sv_clean) > 2:
                        varieties.append({"variety": sv_clean, "tier": tier})
            # Also check the text before the parentheses for a variety name
            before_paren = candidate_part[:paren_match.start()].strip()
            before_paren_lower = strip_accents(before_paren).lower()
            if before_paren_lower in KNOWN_VARIETY_NAMES:
                varieties.append({"variety": before_paren, "tier": tier})
            else:
                style_hits = find_style_candidates(candidate_part)
                if style_hits:
                    for style_hit in style_hits:
                        varieties.append({"variety": style_hit, "tier": tier})
                elif before_paren:
                    for kv in sorted(KNOWN_VARIETY_NAMES, key=len, reverse=True):
                        if kv in before_paren_lower:
                            idx = before_paren_lower.index(kv)
                            original = before_paren[idx:idx+len(kv)]
                            varieties.append({"variety": original.strip(), "tier": tier})
                            break
        else:
            # Try to extract variety names from the candidate text
            # First check if the whole thing is a known variety or style
            cp_lower = candidate_part.lower().strip()

            # Check for known varieties in the text
            found_any = False
            for kv in sorted(KNOWN_VARIETY_NAMES, key=len, reverse=True):
                if kv in cp_lower:
                    # Capitalize properly
                    idx = cp_lower.index(kv)
                    original = candidate_part[idx:idx+len(kv)]
                    varieties.append({"variety": original.strip(), "tier": tier})
                    found_any = True

            # Check for known wine styles
            if not found_any:
                for style_hit in find_style_candidates(candidate_part):
                    varieties.append({"variety": style_hit, "tier": tier})
                    found_any = True

            # Fallback: use the whole candidate part if it looks like a variety
            if not found_any and candidate_part and len(candidate_part) < 80:
                # Strip region qualifiers
                cleaned = re.sub(r'\s*[\(/].*$', '', candidate_part).strip()
                if cleaned and len(cleaned) > 2:
                    varieties.append({"variety": cleaned, "tier": tier})

    return varieties


def parse_origins_section(text, wine_slots):
    """Parse the candidate origins section into per-slot predictions."""
    origins = {}
    next_generic_idx = 0

    lines = text.split('\n')
    for line in lines:
        line = line.strip()
        if not line.startswith('-'):
            continue

        # Try to match "Wine N:" or "Pair N:" or "Wines N-M:"
        slot_match = re.search(r'Wine\s+(\d+)', line, re.IGNORECASE)
        pair_match = re.search(r'Pair\s+(\d+)', line, re.IGNORECASE)

        if slot_match:
            slot = int(slot_match.group(1))
            # Extract region/country from the rest of the line
            rest = line[slot_match.end():]
            rest = rest.lstrip(':- ')
            # Look for country patterns
            countries = extract_countries(rest)
            variety = extract_inline_variety(rest)
            origins[slot] = {
                "countries": countries,
                "variety": variety,
                "raw": rest[:200]
            }
        elif pair_match:
            pair_num = int(pair_match.group(1))
            rest = line[pair_match.end():]
            rest = rest.lstrip(':- ')
            countries = extract_countries(rest)
            variety = extract_inline_variety(rest)
            # Map pair to slots
            if pair_num <= len(wine_slots):
                # Pairs are typically 2 wines each
                pair_size = max(1, len(wine_slots) // 3) if len(wine_slots) >= 6 else 2
                start_idx = (pair_num - 1) * pair_size
                for i in range(pair_size):
                    if start_idx + i < len(wine_slots):
                        s = wine_slots[start_idx + i]
                        origins[s] = {
                            "countries": countries,
                            "variety": variety,
                            "raw": rest[:200]
                        }
        elif next_generic_idx < len(wine_slots):
            rest = line.lstrip('- ').strip()
            countries = extract_countries(rest)
            variety = extract_inline_variety(rest)
            if countries != ["Unknown"] or variety:
                slot = wine_slots[next_generic_idx]
                origins[slot] = {
                    "countries": countries,
                    "variety": variety,
                    "raw": rest[:200]
                }
                next_generic_idx += 1

    return origins


COUNTRY_PATTERNS = [
    'France', 'Italy', 'Spain', 'Germany', 'Australia', 'New Zealand',
    'USA', 'South Africa', 'Portugal', 'Argentina', 'Chile', 'Austria',
    'Hungary', 'Greece', 'England', 'Georgia', 'Uruguay', 'Canada',
]

REGION_PATTERNS = [
    'Burgundy', 'Bordeaux', 'Loire', 'Champagne', 'Alsace', 'Rhone',
    'Provence', 'Jura', 'Languedoc', 'Roussillon',
    'Tuscany', 'Piedmont', 'Veneto', 'Sicily', 'Alto Adige',
    'Rioja', 'Jerez', 'Penedes', 'Rias Baixas',
    'Mosel', 'Rheingau', 'Franken', 'Baden',
    'Barossa', 'Hunter Valley', 'Margaret River', 'Clare Valley',
    'Marlborough', 'Central Otago', 'Hawkes Bay',
    'Napa', 'Sonoma', 'Willamette', 'Anderson Valley',
    'Stellenbosch', 'Swartland',
    'Mendoza', 'Salta', 'Colchagua', 'Maipo',
    'Douro', 'Madeira', 'Wachau', 'Kamptal', 'Burgenland',
    'Tokaj', 'Tokaji',
]


def extract_countries(text):
    """Extract country names from a text string."""
    found = []
    text_stripped = strip_accents(text)
    for c in COUNTRY_PATTERNS:
        if strip_accents(c).lower() in text_stripped.lower():
            found.append(c)
    if not found:
        for region, country in REGION_TO_COUNTRY.items():
            if region in text_stripped.lower():
                found.append(country)
                break
    return found if found else ["Unknown"]


def extract_inline_variety(text):
    """Extract a variety name mentioned inline in an origins line."""
    variety_names = [
        'Chardonnay', 'Riesling', 'Sauvignon Blanc', 'Pinot Noir',
        'Cabernet Sauvignon', 'Merlot', 'Syrah', 'Grenache', 'Tempranillo',
        'Nebbiolo', 'Sangiovese', 'Chenin Blanc', 'Semillon', 'Viognier',
        'Pinot Gris', 'Gewurztraminer', 'Muscat', 'Malbec', 'Zinfandel',
        'Cabernet Franc', 'Mourvedre', 'Gamay', 'Furmint', 'Palomino',
        'Melon de Bourgogne', 'Melon', 'Corvina', 'Garganega',
        'Nerello Mascalese', 'Aglianico', 'Pinotage',
        'Petite Sirah', 'Tannat', 'Carmenere',
        'Touriga Nacional', 'Glera', 'Savagnin',
    ]
    for v in variety_names:
        if v.lower() in text.lower():
            return v
    for style_hit in find_style_candidates(text):
        return style_hit
    explicit = extract_explicit_variety(text)
    if explicit:
        return explicit
    return ""


def infer_varieties_from_regions(*texts):
    """Infer likely varieties from benchmark regions mentioned in text."""
    inferred = []
    seen = set()
    combined = " ".join(t for t in texts if t)
    combined_lower = strip_accents(combined).lower()
    for region, varieties in REGION_TO_VARIETIES.items():
        if region in combined_lower:
            for variety in varieties:
                key = variety.lower()
                if key not in seen:
                    inferred.append(variety)
                    seen.add(key)
    return inferred


def _extract_wine_blocks(text, wine_slots):
    """Extract ### W{n} in-taste blocks from re-mapped matrices."""
    blocks = {}
    for slot in wine_slots:
        pattern = rf'###\s+W{slot}\b[^\n]*\n(.*?)(?=\n###\s+W\d|\n###\s+Pair\s|\n##\s|\Z)'
        m = re.search(pattern, text, re.DOTALL)
        if m:
            blocks[slot] = m.group(1).strip()
    return blocks


def _build_origins_from_wine_blocks(text, wine_slots):
    """Build a synthetic origins section from ### W{n} blocks for the standard parser."""
    blocks = _extract_wine_blocks(text, wine_slots)
    lines = []
    for slot in wine_slots:
        block = blocks.get(slot, "")
        if not block:
            continue
        # Look for origin lines in various formats (bold, plain text, table rows)
        origin_line = ""
        for pattern in [
            r'\*\*Origin[^:]*:\*\*\s*(.+)',
            r'\*\*Best-guess origin:\*\*\s*(.+)',
            r'\*\*Origin narrowed[^:]*:\*\*\s*(.+)',
            r'(?:^|\n)\s*Origin narrowed:\s*(.+)',
            r'(?:^|\n)\s*Best-guess origin:\s*(.+)',
            r'(?:^|\n)\s*Origin[^:]*:\s+([A-Z].+)',
            r'\|\s*Best-guess origin\s*\|\s*(.+?)\s*\|',
            r'\|\s*Origin narrowed\s*\|\s*(.+?)\s*\|',
            r'\|\s*Origin\s*\|\s*(.+?)\s*\|',
        ]:
            m = re.search(pattern, block)
            if m:
                origin_line = m.group(1).strip().rstrip('.')
                break
        # Also get variety from the block
        variety_line = ""
        for pattern in [
            r'\*\*(?:Best-guess )?[Vv]ariety:\*\*\s*(.+)',
            r'\*\*Composition reading:\*\*\s*(.+)',
        ]:
            m = re.search(pattern, block)
            if m:
                variety_line = m.group(1).strip().rstrip('.')
                break
        combined = f"{origin_line} {variety_line}".strip()
        if combined:
            lines.append(f"- Wine {slot}: {combined}")
    return "\n".join(lines)


def _parse_varieties_from_wine_blocks(text, wine_slots):
    """Extract varieties from ### W{n} in-taste blocks in re-mapped matrices."""
    blocks = _extract_wine_blocks(text, wine_slots)
    varieties = []
    seen = set()
    for slot in wine_slots:
        block = blocks.get(slot, "")
        if not block:
            continue
        for pattern in [
            r'\*\*(?:Best-guess )?[Vv]ariety:\*\*\s*(.+)',
            r'\*\*Composition reading:\*\*\s*(.+)',
            r'(?:^|\n)\s*Confirm the bound grape:\s*(.+)',
            r'(?:^|\n)\s*Best-guess (?:grape|variety):\s*(.+)',
            r'(?:^|\n)\s*Variety:\s*(.+)',
            r'\|\s*Best-guess (?:grape|variety)\s*\|\s*(.+?)\s*\|',
            r'\|\s*Confirm the bound grape\s*\|\s*(.+?)\s*\|',
            r'\|\s*Variety\s*\|\s*(.+?)\s*\|',
        ]:
            m = re.search(pattern, block)
            if m:
                raw = m.group(1).strip().rstrip('.')
                # Split on / and extract known varieties
                parts = [p.strip() for p in re.split(r'[/,]', raw)]
                for part in parts:
                    part_lower = strip_accents(part).lower().strip()
                    # Check known variety names
                    for kv in sorted(KNOWN_VARIETY_NAMES, key=len, reverse=True):
                        if kv in part_lower and kv not in seen:
                            varieties.append({"variety": part.strip(), "tier": "STRONG SIGNAL"})
                            seen.add(kv)
                            break
                    else:
                        # Check known wine styles
                        for ks in sorted(KNOWN_WINE_STYLES, key=len, reverse=True):
                            if ks in part_lower and ks not in seen:
                                varieties.append({"variety": part.strip(), "tier": "STRONG SIGNAL"})
                                seen.add(ks)
                                break
                break
    return varieties


def _parse_origins_from_wine_blocks(text, wine_slots):
    """Extract per-slot origins from ### W{n} in-taste blocks in re-mapped matrices."""
    blocks = _extract_wine_blocks(text, wine_slots)
    origins = {}
    for slot in wine_slots:
        block = blocks.get(slot, "")
        if not block:
            continue
        origin_raw = ""
        for pattern in [
            r'\*\*Origin[^:]*:\*\*\s*(.+)',
            r'\*\*Best-guess origin:\*\*\s*(.+)',
            r'\*\*Origin narrowed[^:]*:\*\*\s*(.+)',
            r'(?:^|\n)\s*Origin narrowed:\s*(.+)',
            r'(?:^|\n)\s*Best-guess origin:\s*(.+)',
            r'(?:^|\n)\s*Origin[^:]*:\s+([A-Z].+)',
            r'\|\s*Best-guess origin\s*\|\s*(.+?)\s*\|',
            r'\|\s*Origin narrowed\s*\|\s*(.+?)\s*\|',
            r'\|\s*Origin\s*\|\s*(.+?)\s*\|',
        ]:
            m = re.search(pattern, block)
            if m:
                origin_raw = m.group(1).strip().rstrip('.')
                break
        variety = ""
        for pattern in [
            r'\*\*(?:Best-guess )?[Vv]ariety:\*\*\s*(.+)',
            r'(?:^|\n)\s*Confirm the bound grape:\s*(.+)',
            r'(?:^|\n)\s*Best-guess (?:grape|variety):\s*(.+)',
            r'\|\s*Best-guess (?:grape|variety)\s*\|\s*(.+?)\s*\|',
            r'\|\s*Confirm the bound grape\s*\|\s*(.+?)\s*\|',
        ]:
            m = re.search(pattern, block)
            if m:
                variety = extract_inline_variety(m.group(1).strip())
                break
        if origin_raw:
            countries = extract_countries(origin_raw)
            origins[slot] = {
                "countries": countries,
                "variety": variety,
                "raw": origin_raw[:200],
            }
    return origins


def parse_matrix(filepath):
    """Parse a single v2 decision matrix file."""
    text = filepath.read_text(encoding='utf-8')

    # Split at Reality check to isolate predictions
    parts = re.split(r'---\s*\n\s*##\s*Reality check', text, flags=re.IGNORECASE)
    if len(parts) < 2:
        parts = re.split(r'##\s*Reality check', text, flags=re.IGNORECASE)
    prediction_text = parts[0]

    # Parse frontmatter
    fm_match = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    fm = {}
    if fm_match:
        for line in fm_match.group(1).split('\n'):
            kv = line.split(':', 1)
            if len(kv) == 2:
                fm[kv[0].strip()] = kv[1].strip().strip('"')

    year = int(fm.get('year', 0))
    paper = int(fm.get('paper', 0))
    question = int(fm.get('question', 0))

    # Parse wine slots from frontmatter
    wines_str = fm.get('wines', '[]')
    try:
        wine_slots = json.loads(wines_str)
    except json.JSONDecodeError:
        wine_slots = [int(x) for x in re.findall(r'\d+', wines_str)]

    # Extract key sections
    candidate_headings = [
        r'Candidate varieties\s*\(confidence tiers\)',
        r'Candidate varieties',
        r'Candidate origins\s*\(confidence tiers\)',
        r'Candidate origins',
        r'Candidate varieties/styles\s*\(confidence tiers\)',
        r'Candidate varieties/styles',
        r'Candidate varieties/blend types\s*\(confidence tiers\)',
        r'Candidate varieties/blend types',
        r'Candidate varieties/regions\s*\(confidence tiers\)',
        r'Candidate varieties/regions',
        r'Candidate varieties/origins\s*\(confidence tiers\)',
        r'Candidate varieties/origins',
        r'Candidate style families\s*\(confidence tiers\)',
        r'Candidate style families',
        r'Candidate styles per pair\s*\(confidence tiers\)',
        r'Candidate styles per pair',
        r'Candidate styles per slot',
        r'Candidate categories and classifications\s*\(confidence tiers\)',
        r'Candidate categories and classifications',
        r'Candidate categories\s*\(confidence tiers\)',
        r'Candidate categories',
        r'Candidate wine types\s*\(confidence tiers\)',
        r'Candidate wine types',
        r'Candidate wines by method\s*\(confidence tiers\)',
        r'Candidate wines by method',
        r'Candidate wine styles\s*\(confidence tiers\)',
        r'Candidate wine styles',
        r'Candidate styles\s*\(confidence tiers\)',
        r'Candidate styles',
        r'Candidate sparkling wines\s*\(confidence tiers\)',
        r'Candidate sparkling wines',
        r'Candidate sweet wine types\s*\(confidence tiers\)',
        r'Candidate sweet wine types',
        r'Candidate regions per pair\s*\(confidence tiers\)',
        r'Candidate regions per pair',
        r'Candidate regions\s*\(confidence tiers\)',
        r'Candidate regions',
        r'Candidate producers',
    ]
    varieties_text = ""
    for h in candidate_headings:
        varieties_text = extract_section(prediction_text, h)
        if varieties_text:
            break

    origin_headings = [
        r'Candidate origins per slot',
        r'Candidate origins per wine[^\n]*',
        r'Candidate origins per pair',
        r'Candidate origins and varieties per wine',
        r'Candidate origins',
        r'Origins[^\n]*',
        r'Candidate wines per slot',
        r'Candidate styles per slot',
        r'Candidate quality tiers per slot',
        r'Candidate producers per region',
        r'Candidate structure',
    ]
    origins_text = ""
    for h in origin_headings:
        origins_text = extract_section(prediction_text, h)
        if origins_text:
            break

    tree_path_text = extract_section(prediction_text, r'Master tree path')

    # Family-aware re-map fallback: if standard sections not found, try re-mapped format
    is_family_remap = 'family-aware' in fm.get('phase', '')
    if is_family_remap:
        if not tree_path_text:
            tree_path_text = fm.get('family_tree_pack_section', '')

        if not varieties_text:
            # Try F{n} pre-taste matrix section
            for fn in ['F5', 'F4', 'F3', 'F2', 'F1', 'F6', 'F7']:
                varieties_text = extract_section(prediction_text, rf'{fn} pre-taste matrix')
                if varieties_text:
                    break

        if not varieties_text:
            # Broader fallback: entire Pre-taste matrix section
            varieties_text = extract_section(prediction_text, r'Pre-taste matrix')

        if not origins_text:
            # Build synthetic origins from ### W{n} in-taste blocks
            origins_text = _build_origins_from_wine_blocks(prediction_text, wine_slots)

        if not origins_text:
            # Broader: try building origins from Candidate map table rows
            candidate_map = extract_section(prediction_text, r'Candidate map[^\n]*')
            if candidate_map:
                origins_text = candidate_map

    # Parse varieties
    varieties = parse_varieties_section(varieties_text)

    # Family-aware re-map: also harvest varieties from ### W{n} blocks
    if is_family_remap and not varieties:
        varieties = _parse_varieties_from_wine_blocks(prediction_text, wine_slots)

    # Parse origins
    origins = parse_origins_section(origins_text, wine_slots)

    # Family-aware re-map: parse per-wine origins from ### W{n} blocks if standard parsing missed them
    if is_family_remap and len(origins) < len(wine_slots):
        wine_block_origins = _parse_origins_from_wine_blocks(prediction_text, wine_slots)
        for slot, data in wine_block_origins.items():
            if slot not in origins:
                origins[slot] = data

    # Fallback: if no varieties extracted from dedicated section, harvest from origins
    if not varieties and origins:
        for slot_data in origins.values():
            v = slot_data.get("variety", "")
            if v and (v.lower() in KNOWN_VARIETY_NAMES or v.lower() in KNOWN_WINE_STYLES):
                varieties.append({"variety": v, "tier": "PLAUSIBLE"})

    # Third fallback: explicit "variety is given" / "made from" text in the prediction block.
    if not varieties:
        explicit = extract_explicit_variety(prediction_text)
        if explicit:
            varieties.append({"variety": explicit, "tier": "STRONG SIGNAL"})

    # Fourth fallback: infer grapes from named benchmark regions.
    if not varieties:
        for inferred in infer_varieties_from_regions(varieties_text, origins_text, prediction_text):
            varieties.append({"variety": inferred, "tier": "PLAUSIBLE"})

    # Fifth fallback: scan the Universe section for known varieties
    if not varieties:
        universe_text = extract_section(prediction_text, r'Universe')
        if universe_text:
            for kv in sorted(KNOWN_VARIETY_NAMES, key=len, reverse=True):
                if kv in universe_text.lower():
                    cap = kv.title()
                    varieties.append({"variety": cap, "tier": "PLAUSIBLE"})
            if not varieties:
                for style_hit in find_style_candidates(universe_text):
                    varieties.append({"variety": style_hit, "tier": "PLAUSIBLE"})

    if not varieties and origins:
        for slot_data in origins.values():
            raw = slot_data.get("raw", "")
            for inferred in infer_varieties_from_regions(raw):
                varieties.append({"variety": inferred, "tier": "PLAUSIBLE"})

    # Build ranked variety list (STRONG SIGNAL first, then PLAUSIBLE, then CURVEBALL)
    tier_order = {"STRONG SIGNAL": 0, "PLAUSIBLE": 1, "CURVEBALL": 2}
    sorted_vars = sorted(varieties, key=lambda v: tier_order.get(v["tier"], 3))
    variety_ranking = []
    seen = set()
    for v in sorted_vars:
        vn = v["variety"]
        if vn.lower() not in seen:
            variety_ranking.append(vn)
            seen.add(vn.lower())

    # Build region ranking from origins
    region_ranking = []
    seen_regions = set()
    for slot in wine_slots:
        if slot in origins:
            for c in origins[slot]["countries"]:
                if c.lower() not in seen_regions:
                    region_ranking.append(c)
                    seen_regions.add(c.lower())

    # Build full candidate set
    full_cs = []
    for v in varieties:
        cs_entry = {"variety": v["variety"], "confidence": v["tier"]}
        # Try to find regions for this variety from origins
        regions = []
        for slot_data in origins.values():
            if slot_data.get("variety", "").lower() == v["variety"].lower():
                regions.extend(slot_data["countries"])
        if regions:
            cs_entry["regions"] = list(set(regions))
        full_cs.append(cs_entry)

    # Post-process: resolve region-as-variety entries via appellation lookup
    # and filter out non-variety strings
    import json as _json
    app_path = Path("data/appellation_varieties.json")
    app_lookup_local = {}
    if app_path.exists():
        app_lookup_local = _json.loads(app_path.read_text(encoding="utf-8"))

    REGION_NOISE = {
        'france', 'italy', 'spain', 'germany', 'australia', 'new zealand',
        'usa', 'california', 'south africa', 'portugal', 'argentina', 'chile',
        'austria', 'hungary', 'greece', 'england', 'georgia', 'uruguay',
        'canada', 'bordeaux', 'burgundy', 'tuscany', 'piedmont', 'veneto',
        'sicily', 'rioja', 'champagne', 'beaujolais', 'barossa', 'marlborough',
        'napa', 'mosel', 'alsace', 'rhone', 'loire', 'douro', 'madeira',
        'jerez', 'mendoza', 'stellenbosch', 'tokaj', 'sauternes', 'provence',
        'jura', 'unknown', 'northern rhone', 'southern rhone', 'cote rotie',
        'st julien', 'saint-julien', 'saint julien', 'st emilion', 'st estephe',
        'pessac', 'pauillac', 'margaux', 'haut medoc', 'barsac',
        'hawkes bay', 'central otago', 'willamette', 'anderson valley',
        'dry creek', 'russian river', 'sonoma', 'eden valley', 'clare valley',
        'mclaren vale', 'hunter valley', 'margaret river', 'swartland',
        'colchagua', 'maipo', 'salta', 'wachau', 'kamptal', 'burgenland',
        'franken', 'rheingau', 'baden', 'ahr', 'alto adige',
        'campania', 'abruzzo', 'penedes', 'rias baixas', 'montsant',
    }

    def clean_variety_ranking(ranking):
        """Remove region names and resolve appellation->variety."""
        cleaned = []
        seen = set()
        for v in ranking:
            v_stripped = strip_accents(v).lower().strip()

            for style_key, mapped_vars in STYLE_TO_VARIETIES.items():
                if style_key in v_stripped:
                    for mv in mapped_vars:
                        mv_low = mv.lower()
                        if mv_low not in seen:
                            cleaned.append(mv)
                            seen.add(mv_low)
                    v_stripped = ""
                    break
            if not v_stripped:
                continue

            # Skip obvious non-variety strings
            if v_stripped in REGION_NOISE:
                # Try to resolve via appellation lookup
                key_match = None
                for key in sorted(app_lookup_local.keys(), key=len, reverse=True):
                    if strip_accents(key).lower() in v_stripped or v_stripped in strip_accents(key).lower():
                        key_match = key
                        break
                if key_match:
                    for av in app_lookup_local[key_match].get("varieties", []):
                        av_low = av.lower()
                        if av_low not in seen:
                            cleaned.append(av)
                            seen.add(av_low)
                continue

            # Skip strings that look like prose fragments
            if any(noise in v_stripped for noise in [
                'wines ', 'wine ', 'pair ', 'two ', 'three ', 'four ', 'five ',
                'same ', 'quality', 'commercial', 'producer', 'vintage',
                'country', 'region', 'as country', 'as region',
            ]):
                continue

            # Check if it matches a known variety
            is_variety = v_stripped in KNOWN_VARIETY_NAMES
            if not is_variety:
                # Check if any known variety is a substring
                for kv in KNOWN_VARIETY_NAMES:
                    if kv in v_stripped:
                        if kv not in seen:
                            cleaned.append(kv.title())
                            seen.add(kv)
                        is_variety = True
                        break

            if not is_variety:
                # Check if it's a known wine style that maps to varieties
                for kv in KNOWN_WINE_STYLES:
                    if kv in v_stripped:
                        mapped = STYLE_TO_VARIETIES.get(kv, [])
                        for mv in mapped:
                            mv_low = mv.lower()
                            if mv_low not in seen:
                                cleaned.append(mv)
                                seen.add(mv_low)
                        if mapped:
                            is_variety = True
                            break
                        # Resolve style to variety via appellation lookup
                        for key in sorted(app_lookup_local.keys(), key=len, reverse=True):
                            if strip_accents(key).lower() in v_stripped:
                                for av in app_lookup_local[key].get("varieties", []):
                                    av_low = av.lower()
                                    if av_low not in seen:
                                        cleaned.append(av)
                                        seen.add(av_low)
                                is_variety = True
                                break
                        break

            if is_variety:
                if v_stripped not in seen and v not in cleaned:
                    cleaned.append(v)
                    seen.add(v_stripped)
            else:
                # Last resort: try appellation lookup on the raw string
                for key in sorted(app_lookup_local.keys(), key=len, reverse=True):
                    if strip_accents(key).lower() in v_stripped:
                        for av in app_lookup_local[key].get("varieties", []):
                            av_low = av.lower()
                            if av_low not in seen:
                                cleaned.append(av)
                                seen.add(av_low)
                        break

        return cleaned

    variety_ranking = clean_variety_ranking(variety_ranking)

    if not variety_ranking and origins:
        recovered = []
        for slot_data in origins.values():
            v = strip_accents(slot_data.get("variety", "")).lower().strip()
            if not v:
                continue
            if v in STYLE_TO_VARIETIES:
                recovered.extend(STYLE_TO_VARIETIES[v])
            elif v in KNOWN_VARIETY_NAMES:
                recovered.append(slot_data["variety"])
            elif v in KNOWN_WINE_STYLES:
                recovered.append(slot_data["variety"])
        if not recovered:
            recovered.extend(infer_varieties_from_regions(origins_text, prediction_text))
        variety_ranking = clean_variety_ranking(recovered)

    # Also clean the full candidate set — resolve style names and prose to varieties
    cleaned_cs = []
    cs_seen = set()
    for cs_entry in full_cs:
        csv = cs_entry.get("variety", "")
        csv_stripped = strip_accents(csv).lower().strip()
        resolved_varieties = []

        # 1. Direct style-to-variety resolution
        for style_key, mapped_vars in STYLE_TO_VARIETIES.items():
            if style_key in csv_stripped:
                resolved_varieties.extend(mapped_vars)

        # 2. Check if it's already a known variety
        if not resolved_varieties:
            for kv in sorted(KNOWN_VARIETY_NAMES, key=len, reverse=True):
                if kv in csv_stripped:
                    idx = csv_stripped.index(kv)
                    original = csv[idx:idx+len(kv)]
                    resolved_varieties.append(original.strip())

        # 3. Appellation lookup
        if not resolved_varieties:
            for key in sorted(app_lookup_local.keys(), key=len, reverse=True):
                if strip_accents(key).lower() in csv_stripped:
                    resolved_varieties.extend(app_lookup_local[key].get("varieties", []))
                    break

        # 4. Region-to-variety inference
        if not resolved_varieties:
            for region, varieties in REGION_TO_VARIETIES.items():
                if region in csv_stripped:
                    resolved_varieties.extend(varieties)

        # 5. If still nothing and it's a region noise word, skip
        if not resolved_varieties and csv_stripped in REGION_NOISE:
            continue

        # Add resolved or original entries to cleaned CS
        if resolved_varieties:
            for rv in resolved_varieties:
                rv_key = rv.lower()
                if rv_key not in cs_seen:
                    new_entry = dict(cs_entry)
                    new_entry["variety"] = rv
                    cleaned_cs.append(new_entry)
                    cs_seen.add(rv_key)
        else:
            csv_key = csv_stripped
            if csv_key not in cs_seen and len(csv) < 60:
                cleaned_cs.append(cs_entry)
                cs_seen.add(csv_key)

    full_cs = cleaned_cs

    result = {
        "year": year,
        "paper": paper,
        "question": question,
        "wine_slots": wine_slots,
        "tree_path": tree_path_text[:300] if tree_path_text else "",
        "variety_ranking": variety_ranking,
        "region_ranking": region_ranking,
        "full_candidate_set": full_cs,
        "origins_per_slot": {str(k): v for k, v in origins.items()},
        "parse_quality": {
            "has_varieties": bool(varieties_text),
            "has_origins": bool(origins_text),
            "has_tree_path": bool(tree_path_text),
            "variety_count": len(variety_ranking),
            "origin_slots_parsed": len(origins),
            "expected_slots": len(wine_slots),
        }
    }
    return result


def main():
    exams = json.loads(EXAMS_FILE.read_text(encoding='utf-8'))

    all_results = []
    full_parse = 0
    partial_parse = 0
    failed_parse = 0
    partial_details = []

    for f in sorted(V2_DIR.glob("*.md")):
        try:
            result = parse_matrix(f)
            pq = result["parse_quality"]

            if pq["has_varieties"] and pq["has_origins"] and pq["has_tree_path"]:
                if pq["variety_count"] >= 1:
                    full_parse += 1
                else:
                    partial_parse += 1
                    partial_details.append(f"{f.name}: varieties section found but 0 varieties extracted")
            else:
                missing = []
                if not pq["has_varieties"]:
                    missing.append("varieties")
                if not pq["has_origins"]:
                    missing.append("origins")
                if not pq["has_tree_path"]:
                    missing.append("tree_path")
                partial_parse += 1
                partial_details.append(f"{f.name}: missing {', '.join(missing)}")

            all_results.append(result)
        except Exception as e:
            failed_parse += 1
            partial_details.append(f"{f.name}: FAILED — {e}")

    print(f"=== PARSER VALIDATION ===")
    print(f"Total files: {len(list(V2_DIR.glob('*.md')))}")
    print(f"Full parse: {full_parse}")
    print(f"Partial parse: {partial_parse}")
    print(f"Failed: {failed_parse}")

    if partial_details:
        print(f"\nPartial/failed details:")
        for d in partial_details:
            print(f"  {d}")

    # Write results
    OUTPUT_FILE.write_text(
        json.dumps(all_results, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )
    print(f"\nParsed predictions written to {OUTPUT_FILE}")

    # Show 3 random samples
    import random
    samples = random.sample(all_results, min(3, len(all_results)))
    for s in samples:
        print(f"\n=== SAMPLE: {s['year']}_p{s['paper']}_q{s['question']} ===")
        print(f"  Wine slots: {s['wine_slots']}")
        print(f"  Variety ranking: {s['variety_ranking'][:5]}")
        print(f"  Region ranking: {s['region_ranking'][:5]}")
        print(f"  Full CS entries: {len(s['full_candidate_set'])}")
        print(f"  Origins parsed: {s['parse_quality']['origin_slots_parsed']}/{s['parse_quality']['expected_slots']} slots")


if __name__ == "__main__":
    main()
