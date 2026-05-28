import json

# This script scores v2 decision matrices against actual wines for 2015 and 2016 LOYO backtest

results = []

# ============================================================
# Helper: synonym matching for varieties
# ============================================================
VARIETY_SYNONYMS = {
    "syrah": "shiraz",
    "shiraz": "syrah",
    "garnacha": "grenache",
    "grenache": "garnacha",
    "spatburgunder": "pinot noir",
    "cot": "malbec",
    "malbec": "cot",
    "monastrell": "mourvedre",
    "mourvedre": "monastrell",
    "pinot grigio": "pinot gris",
    "pinot gris": "pinot grigio",
    "muscat of alexandria": "zibibbo",
    "zibibbo": "muscat of alexandria",
    "tinta roriz": "tempranillo",
    "viura": "macabeo",
    "macabeo": "viura",
}

def normalize_variety(v):
    return v.strip().lower()

def varieties_match(pred, actual):
    """Check if predicted variety matches actual variety, including synonyms."""
    p = normalize_variety(pred)
    a = normalize_variety(actual)
    if p == a:
        return True
    # Check synonyms both directions
    if VARIETY_SYNONYMS.get(p) == a or VARIETY_SYNONYMS.get(a) == p:
        return True
    # Check partial matches for common cases
    if p in a or a in p:
        return True
    return False

def country_match(pred, actual):
    p = pred.strip().lower()
    a = actual.strip().lower()
    return p == a

def subregion_match(pred, actual):
    p = pred.strip().lower()
    a = actual.strip().lower()
    if p == a:
        return True
    if p in a or a in p:
        return True
    return False


# ============================================================
# DEFINE ALL QUESTIONS
# ============================================================

all_questions = []

# ============================================================
# 2015 P1 Q1 - Same region same vintage - Burgundy Chardonnay
# ============================================================
all_questions.append({
    "year": 2015, "paper": 1, "question": 1,
    "question_structure": "same_region_same_vintage",
    "prediction_level": "variety",
    "pred_varieties": ["Chardonnay", "Riesling", "Pinot Gris"],
    "pred_regions": [("France", "Burgundy"), ("Germany", "Mosel"), ("France", "Alsace")],
    "candidate_set": [("Chardonnay", "France"), ("Riesling", "Germany"), ("Pinot Gris", "France")],
    "wines": [
        {"slot": 1, "actual_variety": ["Chardonnay"], "actual_country": "France", "actual_subregion": "Burgundy"},
        {"slot": 2, "actual_variety": ["Chardonnay"], "actual_country": "France", "actual_subregion": "Burgundy"},
        {"slot": 3, "actual_variety": ["Chardonnay"], "actual_country": "France", "actual_subregion": "Burgundy"},
        {"slot": 4, "actual_variety": ["Chardonnay"], "actual_country": "France", "actual_subregion": "Burgundy"},
    ]
})

# 2015 P1 Q2 - Same variety different countries - Chenin Blanc
all_questions.append({
    "year": 2015, "paper": 1, "question": 2,
    "question_structure": "same_variety_different_countries",
    "prediction_level": "variety",
    "pred_varieties": ["Chenin Blanc", "Chardonnay", "Sauvignon Blanc"],
    "pred_regions": [("South Africa", "Piekenierskloof"), ("France", "Loire")],
    "candidate_set": [("Chenin Blanc", "South Africa"), ("Chenin Blanc", "France"), ("Chardonnay", "USA"), ("Chardonnay", "France"), ("Sauvignon Blanc", "France"), ("Semillon", "Australia")],
    "wines": [
        {"slot": 5, "actual_variety": ["Chenin Blanc"], "actual_country": "South Africa", "actual_subregion": "Piekenierskloof"},
        {"slot": 6, "actual_variety": ["Chenin Blanc"], "actual_country": "France", "actual_subregion": "Loire"},
    ]
})

# 2015 P1 Q3 - Six different varieties
all_questions.append({
    "year": 2015, "paper": 1, "question": 3,
    "question_structure": "different_varieties_different_countries",
    "prediction_level": "variety",
    "pred_varieties": ["Riesling", "Gewurztraminer", "Viognier", "Semillon", "Gruner Veltliner", "Albarino"],
    "pred_regions": [("France", "Alsace"), ("France", "Alsace"), ("France", "Rhone"), ("Australia", "Margaret River"), ("Austria", "Wachau"), ("Spain", "Rias Baixas")],
    "candidate_set": [("Riesling", "France"), ("Gewurztraminer", "France"), ("Viognier", "France"), ("Semillon", "Australia"), ("Gruner Veltliner", "Austria"), ("Albarino", "Spain")],
    "wines": [
        {"slot": 7, "actual_variety": ["Albarino"], "actual_country": "Spain", "actual_subregion": "Rias Baixas"},
        {"slot": 8, "actual_variety": ["Semillon"], "actual_country": "Australia", "actual_subregion": "Margaret River"},
        {"slot": 9, "actual_variety": ["Gruner Veltliner"], "actual_country": "Austria", "actual_subregion": "Wachau"},
        {"slot": 10, "actual_variety": ["Gewurztraminer"], "actual_country": "France", "actual_subregion": "Alsace"},
        {"slot": 11, "actual_variety": ["Viognier"], "actual_country": "France", "actual_subregion": "Rhone"},
        {"slot": 12, "actual_variety": ["Riesling"], "actual_country": "France", "actual_subregion": "Alsace"},
    ]
})

# 2015 P2 Q1 - Pinot Noir (given)
all_questions.append({
    "year": 2015, "paper": 2, "question": 1,
    "question_structure": "same_variety_given",
    "prediction_level": "variety",
    "pred_varieties": ["Pinot Noir"],
    "pred_regions": [("France", "Burgundy"), ("New Zealand", "Marlborough"), ("France", "Burgundy")],
    "candidate_set": [("Pinot Noir", "France"), ("Pinot Noir", "New Zealand"), ("Pinot Noir", "USA")],
    "wines": [
        {"slot": 1, "actual_variety": ["Pinot Noir"], "actual_country": "France", "actual_subregion": "Burgundy"},
        {"slot": 2, "actual_variety": ["Pinot Noir"], "actual_country": "New Zealand", "actual_subregion": "Marlborough"},
        {"slot": 3, "actual_variety": ["Pinot Noir"], "actual_country": "France", "actual_subregion": "Burgundy"},
    ]
})

# 2015 P2 Q2 - Three different countries, different predominant varieties
all_questions.append({
    "year": 2015, "paper": 2, "question": 2,
    "question_structure": "different_countries_different_varieties",
    "prediction_level": "variety",
    "pred_varieties": ["Tempranillo", "Shiraz", "Gamay"],
    "pred_regions": [("Spain", "Rioja"), ("Australia", "Barossa Valley"), ("France", "Beaujolais")],
    "candidate_set": [("Tempranillo", "Spain"), ("Shiraz", "Australia"), ("Gamay", "France"), ("Nebbiolo", "Italy"), ("Cabernet Sauvignon", "USA"), ("Grenache", "France")],
    "wines": [
        {"slot": 4, "actual_variety": ["Tempranillo"], "actual_country": "Spain", "actual_subregion": "Rioja"},
        {"slot": 5, "actual_variety": ["Shiraz"], "actual_country": "Australia", "actual_subregion": "Barossa Valley"},
        {"slot": 6, "actual_variety": ["Gamay"], "actual_country": "France", "actual_subregion": "Beaujolais"},
    ]
})

# 2015 P2 Q3 - Same country two regions - Italy
all_questions.append({
    "year": 2015, "paper": 2, "question": 3,
    "question_structure": "same_country_two_regions",
    "prediction_level": "variety",
    "pred_varieties": ["Sangiovese", "Nebbiolo"],
    "pred_regions": [("Italy", "Tuscany"), ("Italy", "Tuscany"), ("Italy", "Piedmont"), ("Italy", "Piedmont")],
    "candidate_set": [("Sangiovese", "Italy"), ("Nebbiolo", "Italy"), ("Corvina", "Italy"), ("Aglianico", "Italy")],
    "wines": [
        {"slot": 7, "actual_variety": ["Sangiovese"], "actual_country": "Italy", "actual_subregion": "Tuscany"},
        {"slot": 8, "actual_variety": ["Sangiovese"], "actual_country": "Italy", "actual_subregion": "Tuscany"},
        {"slot": 9, "actual_variety": ["Nebbiolo"], "actual_country": "Italy", "actual_subregion": "Piedmont"},
        {"slot": 10, "actual_variety": ["Nebbiolo"], "actual_country": "Italy", "actual_subregion": "Piedmont"},
    ]
})

# 2015 P2 Q4 - Same region different varieties - Napa
all_questions.append({
    "year": 2015, "paper": 2, "question": 4,
    "question_structure": "same_region_different_varieties",
    "prediction_level": "variety",
    "pred_varieties": ["Cabernet Sauvignon", "Merlot"],
    "pred_regions": [("USA", "Napa Valley"), ("USA", "Napa Valley")],
    "candidate_set": [("Cabernet Sauvignon", "USA"), ("Merlot", "USA"), ("Cabernet Franc", "France")],
    "wines": [
        {"slot": 11, "actual_variety": ["Merlot"], "actual_country": "USA", "actual_subregion": "Napa Valley"},
        {"slot": 12, "actual_variety": ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], "actual_country": "USA", "actual_subregion": "Napa Valley"},
    ]
})

# 2015 P3 Q1 - European wines, yeast focus
all_questions.append({
    "year": 2015, "paper": 3, "question": 1,
    "question_structure": "european_yeast_production",
    "prediction_level": "style",
    "pred_varieties": ["Chardonnay", "Pinot Noir", "Palomino", "Savagnin"],
    "pred_regions": [("France", "Champagne"), ("England", "Cornwall"), ("Spain", "Jerez"), ("France", "Jura")],
    "candidate_set": [("Chardonnay", "France"), ("Pinot Noir", "France"), ("Pinot Meunier", "France"), ("Pinot Noir", "England"), ("Palomino", "Spain"), ("Savagnin", "France")],
    "wines": [
        {"slot": 1, "actual_variety": ["Chardonnay", "Pinot Noir", "Pinot Meunier"], "actual_country": "France", "actual_subregion": "Champagne"},
        {"slot": 2, "actual_variety": ["Pinot Noir"], "actual_country": "England", "actual_subregion": "Cornwall"},
        {"slot": 3, "actual_variety": ["Palomino"], "actual_country": "Spain", "actual_subregion": "Jerez"},
        {"slot": 4, "actual_variety": ["Savagnin"], "actual_country": "France", "actual_subregion": "Jura"},
    ]
})

# 2015 P3 Q2 - Fortified, 3 countries
all_questions.append({
    "year": 2015, "paper": 3, "question": 2,
    "question_structure": "fortified_three_countries",
    "prediction_level": "style",
    "pred_varieties": ["Touriga Nacional", "Shiraz", "Palomino", "Tinta Negra"],
    "pred_regions": [("Portugal", "Douro"), ("Australia", "South Australia"), ("Spain", "Jerez"), ("Portugal", "Madeira")],
    "candidate_set": [("Touriga Nacional", "Portugal"), ("Touriga Franca", "Portugal"), ("Shiraz", "Australia"), ("Palomino", "Spain"), ("Tinta Negra", "Portugal"), ("Sercial", "Portugal")],
    "wines": [
        {"slot": 5, "actual_variety": ["Touriga Nacional", "Touriga Franca", "Tinta Roriz", "Tinta Barroca", "Tinto Cao"], "actual_country": "Portugal", "actual_subregion": "Douro"},
        {"slot": 6, "actual_variety": ["Shiraz"], "actual_country": "Australia", "actual_subregion": "South Australia"},
        {"slot": 7, "actual_variety": ["Palomino"], "actual_country": "Spain", "actual_subregion": "Jerez"},
        {"slot": 8, "actual_variety": ["Tinta Negra"], "actual_country": "Portugal", "actual_subregion": "Madeira"},
    ]
})

# 2015 P3 Q3 - Sweet wine survey, 4 countries
all_questions.append({
    "year": 2015, "paper": 3, "question": 3,
    "question_structure": "sweet_wine_survey",
    "prediction_level": "variety",
    "pred_varieties": ["Riesling", "Furmint", "Trebbiano"],
    "pred_regions": [("Germany", "Mosel"), ("Canada", "Ontario"), ("Hungary", "Tokaj"), ("Italy", "Tuscany")],
    "candidate_set": [("Riesling", "Germany"), ("Riesling", "Canada"), ("Furmint", "Hungary"), ("Harslevelu", "Hungary"), ("Trebbiano", "Italy"), ("Malvasia", "Italy")],
    "wines": [
        {"slot": 9, "actual_variety": ["Riesling"], "actual_country": "Germany", "actual_subregion": "Mosel"},
        {"slot": 10, "actual_variety": ["Riesling"], "actual_country": "Canada", "actual_subregion": "Ontario"},
        {"slot": 11, "actual_variety": ["Furmint", "Harslevelu"], "actual_country": "Hungary", "actual_subregion": "Tokaj"},
        {"slot": 12, "actual_variety": ["Trebbiano", "Malvasia"], "actual_country": "Italy", "actual_subregion": "Tuscany"},
    ]
})

# ============================================================
# 2016 questions
# ============================================================

# 2016 P1 Q1 - Same country blends
all_questions.append({
    "year": 2016, "paper": 1, "question": 1,
    "question_structure": "same_country_blends",
    "prediction_level": "variety",
    "pred_varieties": ["Sauvignon Blanc", "Marsanne"],
    "pred_regions": [("France", "Bordeaux"), ("France", "Rhone")],
    "candidate_set": [("Sauvignon Blanc", "France"), ("Semillon", "France"), ("Marsanne", "France"), ("Roussanne", "France"), ("Grenache Blanc", "France")],
    "wines": [
        {"slot": 1, "actual_variety": ["Sauvignon Blanc", "Semillon"], "actual_country": "France", "actual_subregion": "Bordeaux"},
        {"slot": 2, "actual_variety": ["Grenache Blanc", "Clairette", "Roussanne", "Bourboulenc"], "actual_country": "France", "actual_subregion": "Rhone"},
    ]
})

# 2016 P1 Q2 - Same country same variety - Chardonnay USA
all_questions.append({
    "year": 2016, "paper": 1, "question": 2,
    "question_structure": "same_country_same_variety",
    "prediction_level": "variety",
    "pred_varieties": ["Chardonnay", "Chenin Blanc", "Semillon"],
    "pred_regions": [("USA", "California"), ("USA", "California")],
    "candidate_set": [("Chardonnay", "USA"), ("Chenin Blanc", "South Africa"), ("Chenin Blanc", "France"), ("Semillon", "Australia")],
    "wines": [
        {"slot": 3, "actual_variety": ["Chardonnay"], "actual_country": "USA", "actual_subregion": "California"},
        {"slot": 4, "actual_variety": ["Chardonnay"], "actual_country": "USA", "actual_subregion": "California"},
    ]
})

# 2016 P1 Q3 - Same variety, Pinot Gris
all_questions.append({
    "year": 2016, "paper": 1, "question": 3,
    "question_structure": "same_variety_different_countries",
    "prediction_level": "variety",
    "pred_varieties": ["Pinot Gris", "Riesling", "Chenin Blanc"],
    "pred_regions": [("France", "Alsace"), ("USA", "Oregon")],
    "candidate_set": [("Pinot Gris", "France"), ("Pinot Gris", "USA"), ("Pinot Gris", "Italy"), ("Riesling", "Germany"), ("Chenin Blanc", "France")],
    "wines": [
        {"slot": 5, "actual_variety": ["Pinot Gris"], "actual_country": "France", "actual_subregion": "Alsace"},
        {"slot": 6, "actual_variety": ["Pinot Gris"], "actual_country": "USA", "actual_subregion": "Oregon"},
    ]
})

# 2016 P1 Q4 - Same country Spain
all_questions.append({
    "year": 2016, "paper": 1, "question": 4,
    "question_structure": "same_country_different_varieties",
    "prediction_level": "variety",
    "pred_varieties": ["Viura", "Albarino"],
    "pred_regions": [("Spain", "Rioja"), ("Spain", "Rias Baixas")],
    "candidate_set": [("Viura", "Spain"), ("Albarino", "Spain"), ("Garganega", "Italy"), ("Riesling", "Germany")],
    "wines": [
        {"slot": 7, "actual_variety": ["Viura", "Malvasia"], "actual_country": "Spain", "actual_subregion": "Rioja"},
        {"slot": 8, "actual_variety": ["Albarino"], "actual_country": "Spain", "actual_subregion": "Rias Baixas"},
    ]
})

# 2016 P1 Q5 - Four countries four varieties
all_questions.append({
    "year": 2016, "paper": 1, "question": 5,
    "question_structure": "different_countries_different_varieties",
    "prediction_level": "variety",
    "pred_varieties": ["Torrontes", "Gewurztraminer", "Chenin Blanc", "Riesling"],
    "pred_regions": [("Argentina", "Argentina"), ("New Zealand", "Nelson"), ("France", "Loire"), ("Austria", "Wachau")],
    "candidate_set": [("Torrontes", "Argentina"), ("Gewurztraminer", "New Zealand"), ("Chenin Blanc", "France"), ("Riesling", "Austria"), ("Viognier", "France"), ("Gruner Veltliner", "Austria")],
    "wines": [
        {"slot": 9, "actual_variety": ["Torrontes"], "actual_country": "Argentina", "actual_subregion": "Argentina"},
        {"slot": 10, "actual_variety": ["Gewurztraminer"], "actual_country": "New Zealand", "actual_subregion": "Nelson"},
        {"slot": 11, "actual_variety": ["Chenin Blanc"], "actual_country": "France", "actual_subregion": "Loire"},
        {"slot": 12, "actual_variety": ["Riesling"], "actual_country": "Austria", "actual_subregion": "Wachau"},
    ]
})

# 2016 P2 Q1 - Same region same variety - Gamay Beaujolais
all_questions.append({
    "year": 2016, "paper": 2, "question": 1,
    "question_structure": "same_region_same_variety",
    "prediction_level": "variety",
    "pred_varieties": ["Gamay", "Nebbiolo", "Pinot Noir"],
    "pred_regions": [("France", "Beaujolais"), ("Italy", "Piedmont"), ("France", "Burgundy")],
    "candidate_set": [("Gamay", "France"), ("Nebbiolo", "Italy"), ("Pinot Noir", "France"), ("Tempranillo", "Spain")],
    "wines": [
        {"slot": 1, "actual_variety": ["Gamay"], "actual_country": "France", "actual_subregion": "Beaujolais"},
        {"slot": 2, "actual_variety": ["Gamay"], "actual_country": "France", "actual_subregion": "Beaujolais"},
    ]
})

# 2016 P2 Q2 - Not France, same variety - Pinot Noir
all_questions.append({
    "year": 2016, "paper": 2, "question": 2,
    "question_structure": "same_variety_not_france",
    "prediction_level": "variety",
    "pred_varieties": ["Pinot Noir", "Syrah", "Cabernet Sauvignon"],
    "pred_regions": [("New Zealand", "Marlborough"), ("Germany", "Ahr"), ("Australia", "Yarra Valley")],
    "candidate_set": [("Pinot Noir", "New Zealand"), ("Pinot Noir", "Germany"), ("Pinot Noir", "Australia"), ("Syrah", "Australia"), ("Cabernet Sauvignon", "Chile")],
    "wines": [
        {"slot": 3, "actual_variety": ["Pinot Noir"], "actual_country": "New Zealand", "actual_subregion": "Marlborough"},
        {"slot": 4, "actual_variety": ["Pinot Noir"], "actual_country": "Germany", "actual_subregion": "Ahr"},
        {"slot": 5, "actual_variety": ["Pinot Noir"], "actual_country": "Australia", "actual_subregion": "Australia"},
    ]
})

# 2016 P2 Q3 - Same region same vintage - Bordeaux 2005
all_questions.append({
    "year": 2016, "paper": 2, "question": 3,
    "question_structure": "same_region_same_vintage",
    "prediction_level": "variety",
    "pred_varieties": ["Cabernet Sauvignon", "Merlot"],
    "pred_regions": [("France", "Bordeaux"), ("France", "Bordeaux")],
    "candidate_set": [("Cabernet Sauvignon", "France"), ("Merlot", "France"), ("Cabernet Franc", "France"), ("Nebbiolo", "Italy"), ("Sangiovese", "Italy")],
    "wines": [
        {"slot": 6, "actual_variety": ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot"], "actual_country": "France", "actual_subregion": "Bordeaux"},
        {"slot": 7, "actual_variety": ["Merlot", "Cabernet Franc", "Cabernet Sauvignon"], "actual_country": "France", "actual_subregion": "Bordeaux"},
    ]
})

# 2016 P2 Q4 - Same region (Rhone)
all_questions.append({
    "year": 2016, "paper": 2, "question": 4,
    "question_structure": "same_region_different_subregions",
    "prediction_level": "variety",
    "pred_varieties": ["Syrah", "Grenache"],
    "pred_regions": [("France", "Northern Rhone"), ("France", "Southern Rhone")],
    "candidate_set": [("Syrah", "France"), ("Grenache", "France"), ("Mourvedre", "France"), ("Sangiovese", "Italy"), ("Nebbiolo", "Italy"), ("Tempranillo", "Spain")],
    "wines": [
        {"slot": 8, "actual_variety": ["Syrah"], "actual_country": "France", "actual_subregion": "Northern Rhone"},
        {"slot": 9, "actual_variety": ["Grenache", "Syrah", "Mourvedre"], "actual_country": "France", "actual_subregion": "Southern Rhone"},
    ]
})

# 2016 P2 Q5 - Indigenous varieties
all_questions.append({
    "year": 2016, "paper": 2, "question": 5,
    "question_structure": "indigenous_varieties",
    "prediction_level": "variety",
    "pred_varieties": ["Malbec", "Blaufrankisch", "Carmenere"],
    "pred_regions": [("Argentina", "Mendoza"), ("Austria", "Burgenland"), ("Chile", "Colchagua")],
    "candidate_set": [("Malbec", "Argentina"), ("Blaufrankisch", "Austria"), ("Carmenere", "Chile"), ("Pinotage", "South Africa"), ("Touriga Nacional", "Portugal"), ("Xinomavro", "Greece")],
    "wines": [
        {"slot": 10, "actual_variety": ["Malbec"], "actual_country": "Argentina", "actual_subregion": "Salta"},
        {"slot": 11, "actual_variety": ["Blaufrankisch"], "actual_country": "Austria", "actual_subregion": "Burgenland"},
        {"slot": 12, "actual_variety": ["Carmenere"], "actual_country": "Chile", "actual_subregion": "Colchagua"},
    ]
})

# 2016 P3 Q1 - Same variety Chardonnay across styles
all_questions.append({
    "year": 2016, "paper": 3, "question": 1,
    "question_structure": "same_variety_cross_style",
    "prediction_level": "variety",
    "pred_varieties": ["Chardonnay", "Chenin Blanc", "Viognier"],
    "pred_regions": [("France", "Champagne"), ("France", "Champagne"), ("France", "Burgundy"), ("New Zealand", "Hawkes Bay"), ("France", "Burgundy")],
    "candidate_set": [("Chardonnay", "France"), ("Chardonnay", "New Zealand"), ("Pinot Noir", "France"), ("Chenin Blanc", "France"), ("Viognier", "France")],
    "wines": [
        {"slot": 1, "actual_variety": ["Chardonnay"], "actual_country": "France", "actual_subregion": "Champagne"},
        {"slot": 2, "actual_variety": ["Chardonnay"], "actual_country": "France", "actual_subregion": "Champagne"},
        {"slot": 3, "actual_variety": ["Chardonnay"], "actual_country": "France", "actual_subregion": "Burgundy"},
        {"slot": 4, "actual_variety": ["Chardonnay"], "actual_country": "New Zealand", "actual_subregion": "Hawkes Bay"},
        {"slot": 5, "actual_variety": ["Chardonnay"], "actual_country": "France", "actual_subregion": "Burgundy"},
    ]
})

# 2016 P3 Q2 - Fortified trio
all_questions.append({
    "year": 2016, "paper": 3, "question": 2,
    "question_structure": "fortified_trio",
    "prediction_level": "style",
    "pred_varieties": ["Palomino", "Touriga Nacional", "Sercial"],
    "pred_regions": [("Spain", "Jerez"), ("Portugal", "Douro"), ("Portugal", "Madeira")],
    "candidate_set": [("Palomino", "Spain"), ("Touriga Nacional", "Portugal"), ("Touriga Franca", "Portugal"), ("Sercial", "Portugal"), ("Grenache Noir", "France")],
    "wines": [
        {"slot": 6, "actual_variety": ["Palomino"], "actual_country": "Spain", "actual_subregion": "Jerez"},
        {"slot": 7, "actual_variety": ["Touriga Nacional", "Touriga Franca", "Tinta Roriz", "Tinta Barroca", "Tinto Cao"], "actual_country": "Portugal", "actual_subregion": "Douro"},
        {"slot": 8, "actual_variety": ["Sercial"], "actual_country": "Portugal", "actual_subregion": "Madeira"},
    ]
})

# 2016 P3 Q3 - Sweet wine pair (Tokaji + Sauternes)
all_questions.append({
    "year": 2016, "paper": 3, "question": 3,
    "question_structure": "sweet_wine_pair",
    "prediction_level": "variety",
    "pred_varieties": ["Furmint", "Semillon"],
    "pred_regions": [("Hungary", "Tokaj"), ("France", "Bordeaux")],
    "candidate_set": [("Furmint", "Hungary"), ("Harslevelu", "Hungary"), ("Semillon", "France"), ("Sauvignon Blanc", "France"), ("Riesling", "Germany"), ("Chenin Blanc", "France")],
    "wines": [
        {"slot": 9, "actual_variety": ["Furmint", "Harslevelu", "Muscat Lunel"], "actual_country": "Hungary", "actual_subregion": "Tokaj"},
        {"slot": 10, "actual_variety": ["Semillon", "Sauvignon Blanc", "Muscadelle"], "actual_country": "France", "actual_subregion": "Bordeaux"},
    ]
})

# 2016 P3 Q4 - Same region and producer - Valpolicella
all_questions.append({
    "year": 2016, "paper": 3, "question": 4,
    "question_structure": "same_producer_different_styles",
    "prediction_level": "style",
    "pred_varieties": ["Corvina", "Corvina"],
    "pred_regions": [("Italy", "Veneto"), ("Italy", "Veneto")],
    "candidate_set": [("Corvina", "Italy"), ("Corvinone", "Italy"), ("Rondinella", "Italy")],
    "wines": [
        {"slot": 11, "actual_variety": ["Corvina", "Corvinone", "Rondinella"], "actual_country": "Italy", "actual_subregion": "Veneto"},
        {"slot": 12, "actual_variety": ["Corvina", "Corvinone", "Rondinella"], "actual_country": "Italy", "actual_subregion": "Veneto"},
    ]
})


# ============================================================
# SCORING LOGIC
# ============================================================

def score_question(q):
    n_wines = len(q["wines"])
    top1_var_hits = 0
    top3_var_hits = 0
    top1_reg_country_hits = 0
    top1_reg_subregion_hits = 0
    top3_reg_hits = 0
    cs_hits = 0
    mrr_variety_sum = 0.0
    mrr_region_sum = 0.0
    per_wine = []

    pred_vars = q["pred_varieties"]
    pred_regs = q["pred_regions"]
    cs = q["candidate_set"]

    for i, w in enumerate(q["wines"]):
        actual_vars = w["actual_variety"]
        actual_country = w["actual_country"]
        actual_sub = w["actual_subregion"]
        slot = w["slot"]

        # --- Variety scoring ---
        # Find best (lowest) rank where a predicted variety matches any actual variety
        var_rank = 0
        for rank_idx, pv in enumerate(pred_vars):
            pred_components = [x.strip() for x in pv.split("/")]
            match_found = False
            for pc in pred_components:
                for av in actual_vars:
                    if varieties_match(pc, av):
                        match_found = True
                        break
                if match_found:
                    break
            if match_found:
                var_rank = rank_idx + 1
                break

        top1_var = var_rank == 1
        top3_var = 1 <= var_rank <= 3
        mrr_var = 1.0 / var_rank if var_rank > 0 else 0.0

        if top1_var:
            top1_var_hits += 1
        if top3_var:
            top3_var_hits += 1
        mrr_variety_sum += mrr_var

        # --- Region scoring ---
        # Find best rank for country match
        reg_rank = 0
        for rank_idx, (pc, ps) in enumerate(pred_regs):
            if country_match(pc, actual_country):
                reg_rank = rank_idx + 1
                break

        top1_reg_country = reg_rank == 1
        top3_reg = 1 <= reg_rank <= 3
        mrr_reg = 1.0 / reg_rank if reg_rank > 0 else 0.0

        # Subregion match for top-1 predicted region
        top1_sub = False
        if top1_reg_country and len(pred_regs) > 0:
            # For per-slot predictions: use the wine's slot index if available
            if i < len(pred_regs):
                _, ps = pred_regs[i]
            else:
                _, ps = pred_regs[0]
            top1_sub = subregion_match(ps, actual_sub)

        if top1_reg_country:
            top1_reg_country_hits += 1
        if top1_sub:
            top1_reg_subregion_hits += 1
        if top3_reg:
            top3_reg_hits += 1
        mrr_region_sum += mrr_reg

        # --- Candidate set hit ---
        cs_hit = False
        for (csv, csc) in cs:
            csv_components = [x.strip() for x in csv.split("/")]
            for csvc in csv_components:
                for av in actual_vars:
                    if varieties_match(csvc, av) and country_match(csc, actual_country):
                        cs_hit = True
                        break
                if cs_hit:
                    break
            if cs_hit:
                break

        if cs_hit:
            cs_hits += 1

        actual_var_str = actual_vars[0] if actual_vars else "Unknown"

        per_wine.append({
            "slot": slot,
            "actual_variety": actual_var_str,
            "actual_country": actual_country,
            "actual_subregion": actual_sub,
            "variety_hit": top1_var,
            "variety_rank": var_rank,
            "region_hit": top1_reg_country,
            "region_rank": reg_rank,
            "subregion_hit": top1_sub,
            "cs_hit": cs_hit
        })

    avg_mrr_var = mrr_variety_sum / n_wines if n_wines > 0 else 0
    avg_mrr_reg = mrr_region_sum / n_wines if n_wines > 0 else 0

    return {
        "year": q["year"],
        "paper": q["paper"],
        "question": q["question"],
        "question_structure": q["question_structure"],
        "n_wines": n_wines,
        "prediction_level": q["prediction_level"],
        "scores": {
            "top1_variety_hits": top1_var_hits,
            "top3_variety_hits": top3_var_hits,
            "top1_region_country_hits": top1_reg_country_hits,
            "top1_region_subregion_hits": top1_reg_subregion_hits,
            "top3_region_hits": top3_reg_hits,
            "candidate_set_hits": cs_hits,
            "wine_count": n_wines,
            "mrr_variety": round(avg_mrr_var, 4),
            "mrr_region": round(avg_mrr_reg, 4)
        },
        "per_wine": per_wine,
        "notes": ""
    }

# Score all questions
for q in all_questions:
    result = score_question(q)
    results.append(result)

# Add notes
for r in results:
    key = (r["year"], r["paper"], r["question"])
    if key == (2015, 2, 1):
        r["notes"] = "Variety given in stem (Pinot Noir). All variety metrics are trivially 1.0."
    elif key == (2015, 3, 1):
        r["notes"] = "Style-level predictions (Champagne, English sparkling, Fino, Jura). Varieties resolved via appellation_varieties.json."
    elif key == (2015, 3, 2):
        r["notes"] = "Style-level predictions (Port, fortified Shiraz, Oloroso Sherry, Madeira). Varieties resolved via appellation_varieties.json."
    elif key == (2015, 1, 3):
        r["notes"] = "Six different varieties in grab-bag format. Matrix predicted all six varieties across STRONG SIGNAL and PLAUSIBLE tiers. Per-wine variety matching checks if actual variety appears anywhere in the predicted list."
    elif key == (2016, 3, 1):
        r["notes"] = "W1 Selosse BdB and W2 Pol Roger BdB are both Chardonnay-dominant (Blanc de Blancs). Scored as Chardonnay hits."
    elif key == (2016, 3, 2):
        r["notes"] = "Style-level predictions (Sherry, Tawny Port, Madeira). Varieties resolved via appellation_varieties.json."
    elif key == (2016, 3, 4):
        r["notes"] = "Style-level predictions (Ripasso + Recioto). Varieties resolved via appellation_varieties.json. Both Corvina/Corvinone blends."
    elif key == (2016, 2, 5):
        r["notes"] = "Matrix predicted Mendoza for Malbec; actual was Salta. Country hit, subregion miss."
    elif key == (2016, 1, 1):
        r["notes"] = "Blend question. W1 predicted SB/Sem for Bordeaux (hit on SB component). W2 predicted Marsanne/Roussanne/Grenache Blanc for Rhone (partial hit on Roussanne and Grenache Blanc components via candidate set)."
    elif key == (2016, 2, 4):
        r["notes"] = "Rhone pairing. Subregion scored as hit since 'Northern Rhone' and 'Southern Rhone' match actual subregions."

# Output
output = {
    "folds": [2015, 2016],
    "results": results
}

with open("C:/Users/russe/Documents/MW_exam/data/loyo_scores_2015_2016.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print("Done. Wrote", len(results), "results.")

# Print summary
total_wines = sum(r["scores"]["wine_count"] for r in results)
total_t1v = sum(r["scores"]["top1_variety_hits"] for r in results)
total_t3v = sum(r["scores"]["top3_variety_hits"] for r in results)
total_t1rc = sum(r["scores"]["top1_region_country_hits"] for r in results)
total_t1rs = sum(r["scores"]["top1_region_subregion_hits"] for r in results)
total_t3r = sum(r["scores"]["top3_region_hits"] for r in results)
total_cs = sum(r["scores"]["candidate_set_hits"] for r in results)

print(f"\nSummary over {total_wines} wines:")
print(f"Top-1 variety:    {total_t1v}/{total_wines} = {total_t1v/total_wines:.1%}")
print(f"Top-3 variety:    {total_t3v}/{total_wines} = {total_t3v/total_wines:.1%}")
print(f"Top-1 country:    {total_t1rc}/{total_wines} = {total_t1rc/total_wines:.1%}")
print(f"Top-1 subregion:  {total_t1rs}/{total_wines} = {total_t1rs/total_wines:.1%}")
print(f"Top-3 region:     {total_t3r}/{total_wines} = {total_t3r/total_wines:.1%}")
print(f"Candidate set:    {total_cs}/{total_wines} = {total_cs/total_wines:.1%}")

# Per-year breakdown
for year in [2015, 2016]:
    yr_results = [r for r in results if r["year"] == year]
    yr_wines = sum(r["scores"]["wine_count"] for r in yr_results)
    yr_t1v = sum(r["scores"]["top1_variety_hits"] for r in yr_results)
    yr_t3v = sum(r["scores"]["top3_variety_hits"] for r in yr_results)
    yr_t1rc = sum(r["scores"]["top1_region_country_hits"] for r in yr_results)
    yr_t1rs = sum(r["scores"]["top1_region_subregion_hits"] for r in yr_results)
    yr_t3r = sum(r["scores"]["top3_region_hits"] for r in yr_results)
    yr_cs = sum(r["scores"]["candidate_set_hits"] for r in yr_results)
    print(f"\n{year} ({yr_wines} wines):")
    print(f"  Top-1 variety:    {yr_t1v}/{yr_wines} = {yr_t1v/yr_wines:.1%}")
    print(f"  Top-3 variety:    {yr_t3v}/{yr_wines} = {yr_t3v/yr_wines:.1%}")
    print(f"  Top-1 country:    {yr_t1rc}/{yr_wines} = {yr_t1rc/yr_wines:.1%}")
    print(f"  Top-1 subregion:  {yr_t1rs}/{yr_wines} = {yr_t1rs/yr_wines:.1%}")
    print(f"  Top-3 region:     {yr_t3r}/{yr_wines} = {yr_t3r/yr_wines:.1%}")
    print(f"  Candidate set:    {yr_cs}/{yr_wines} = {yr_cs/yr_wines:.1%}")
