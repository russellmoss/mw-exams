# IMW Stage Two Course Day 3 (2025-26) - Annotated Report and Mock Answers

## Brief Report

Day 3 is the special-category day. It tests:

- sparkling method
- regional comparison within a country
- same-region comparison and maturity
- fortified wine style and elevage

Best study tools:

- `outputs/study_diagrams/p3_special.md`
- `outputs/study_diagrams/variety_cards.md`
- for the Austrian white set in Question 2, `outputs/study_diagrams/p1_whites.md` is also useful

This is the day where the special-category diagram matters most. It is also the day where the classifier can be less faithful to the semantic intent if the question wording is broad enough to trigger the wrong branch first.

## Question Classification and Study-Tool Use

| Question | Likely classifier label | Why this fits | Best pre-tasting route | Main in-glass separators | Estimated matrix accuracy |
| --- | --- | --- | --- | --- | --- |
| Q1 | `F2 same_origin_comparative` by current code, but semantically `F5 sparkling_method` | The stem says same country, so the current classifier can stop at same-origin before the sparkling branch | Start with sparkling branch, then split traditional method vs tank method | Autolysis, mousse, fruit profile, dosage, commercial positioning | Moderate to good, about 65-75% |
| Q2 | `F2 same_origin_comparative` | Same country, three Austrian whites, compare quality and market position | Austrian white branch, then Riesling vs Gruener Veltliner vs field blend | Aromatic profile, acid line, spice, sweetness impression, category hierarchy | Good, about 70-80% |
| Q3 | `F2 same_origin_comparative` | Same region, compare quality and maturity | Northern Rhone Syrah branch | Tannin, oak, ripeness, Viognier lift, ageworthiness | Good, about 70-80% |
| Q4 | `F5 fortification_maturation` | Fortified wines, style and maturity are the core | Fortified branch, then LBV vs tawny vs colheita | Oxidation, sweetness, nutty/raisin notes, colour, age | Very good, about 80-90% |

### Q1 Pre-glass thinking

The special diagram is the right place to start. The key split is:

- traditional method sparkling with long lees ageing
- tank-fermented Prosecco with fresh fruit and lower autolytic complexity

### Q2 Pre-glass thinking

This is a white-broadness question inside one country. The route is:

- Riesling branch for the Smaragd wine
- Gruener Veltliner branch for the 1OeTW wine
- mixed field-blend logic for Wiener Gemischter Satz

### Q3 Pre-glass thinking

This is a Northern Rhone Syrah comparison. The tree gets you to Syrah quickly, then the real job is hierarchy:

- Crozes-Hermitage is the more commercial and accessible wine
- Cote Rotie is the more serious and ageworthy wine

### Q4 Pre-glass thinking

This is the clearest special-category question on the day. The matrix should take you into fortified wine immediately, then separate:

- youthful LBV Port
- mature 10-year tawny
- older single-vintage colheita

## Mock Answers

### Question 1

**Classifier summary:** semantically `F5 sparkling_method`, but current code may tag it as `F2 same_origin_comparative`

**Mock answer:**  
Wine 1 is Trentodoc from Italy, made from Chardonnay in the traditional method with long lees ageing. It is the finer, more autolytic and more premium of the two wines. Wine 2 is Prosecco from Veneto, made from Glera and local varieties by the tank method. It is fresher, fruitier and much more commercial. The key contrast is method, texture and positioning: W1 is premium sparkling wine with serious lees complexity, while W2 is the accessible, high-volume commercial wine. W1 has the greater quality and ageing potential.

**How I would have used the trees:**  
I would go straight to the sparkling branch, not the still-wine branch. The important pre-glass work is to decide whether the wine looks like traditional method or tank method before trying to call region.

### Question 2

**Classifier summary:** `F2 same_origin_comparative`

**Mock answer:**  
All three wines are Austrian whites, but they sit in different stylistic and commercial positions. Wine 3 is Wachau Riesling Smaragd, the most premium and ageworthy wine, with concentration, dry precision and strong market credibility. Wine 4 is Kamptal Gruener Veltliner, likely high quality but slightly more accessible, with spice, grip and good restaurant appeal. Wine 5 is Wiener Gemischter Satz, the most commercial and least tightly defined of the three, but still interesting because of its field-blend identity and local character. The question is really about how Austria can span benchmark single-vineyard dry white wines and more approachable regional styles.

**How I would have used the trees:**  
I would use the white tree first, then separate Riesling, Gruener Veltliner and field blend. The tree is helpful because it gets the high-acid white families right, but the final differentiation comes from spice, texture and sweetness perception.

### Question 3

**Classifier summary:** `F2 same_origin_comparative`

**Mock answer:**  
Both wines are from the Northern Rhone and are based on Syrah, but Wine 7, Cote Rotie, is the higher-quality and more ageworthy wine. It is more complete, more polished and more serious in its oak and structural ambition. Wine 6, Crozes-Hermitage, is the more approachable and commercial wine, with less density and less depth but still clear regional identity. Wine 7 is the more mature and more complex of the two, while Wine 6 is younger, simpler and better suited to earlier drinking.

**How I would have used the trees:**  
I would enter the red tree through Syrah and then use tannin, pepper, violet, and oak intensity to separate the wines. The diagram is very good at getting you into Northern Rhone territory, but the quality ranking still needs bottle-level judgment.

### Question 4

**Classifier summary:** `F5 fortification_maturation`

**Mock answer:**  
Wine 10 is a young LBV Port, full of primary fruit, concentrated and firm, with strong commercial appeal and good quality in its category. Wine 11 is a 10-year-old tawny Port, softer, nuttier and more developed, with good quality and broad commercial appeal in the specialist fortified segment. Wine 12 is a 2005 Colheita, the most mature and the most complex of the three, with the greatest development, the most complete oxidative profile and the strongest fine-specialist positioning. The question is fundamentally about how different fortification styles and élevage decisions create different levels of maturity and market identity.

**How I would have used the trees:**  
I would go to the fortified branch immediately. Then I would separate youth and maturity by colour, nutty/raisin development, sweetness integration and cask age.

## Decision Matrix Accuracy

- Q1: good in concept, but the current classifier can mislabel it because the question wording says same country before it says sparkling.
- Q2: good. Austrian white families are readable and the category split is clear.
- Q3: good. Northern Rhone Syrah is one of the easier special comparisons.
- Q4: very good. Fortified styles are exactly where the special diagram earns its keep.

Overall, Day 3 is the strongest day for the special-category diagram, with one caveat: the automated classifier can under-call sparkling method when the stem is phrased as a same-country comparison first.
