# **Institute of Masters of Wine — Stage 2 Theory Papers**

*Five-paper era (2015–2026). Question compilation.*

*Source: Institute of Masters of Wine examination papers, published at
https://www.mastersofwine.org/mw-exam*

## **How to use this document**

This file is the **Stage 2 THEORY** corpus. It is deliberately kept SEPARATE from:

- `MW_Practical_Papers_Compilation.md` — the Stage 2 **practical** (blind tasting) papers.
- `MW_S1A_Papers_Compilation.md` — the **Stage 1 Assessment**.

The theory exam is a different assessment from the practical and must never be folded into the
practical corpus statistics. Concretely:

- The practical is three papers of **12 wines each**, scored with published per-question **marks**,
  and every statistical artifact in this repo (master decision trees, taxonomy families,
  wine-distribution-by-paper, exam-structure predictor) keys off Paper 1 = whites, Paper 2 = reds,
  Paper 3 = special.
- The theory exam is **five papers of essay questions with no wines and no published mark
  allocations**. Its "papers" are subject domains (viticulture, vinification, handling, business,
  contemporary issues), NOT wine-colour buckets. A theory Paper 1 has nothing to do with a
  practical Paper 1.

So theory lives here, parses to `data/theory/` via `scripts/parse_theory_source.py`, and carries the
question-ID prefix `th_` (e.g. `th_2024_p1_q3`) so a theory row can never silently join against a
practical or S1A row of the same year/paper/question.

### Scope: why the five-paper era only

The theory exam changed structure in 2015. Before then (2000–2014) it was **four** papers
("The Production of Wine" Parts 1–3 were split differently, plus Business, plus Contemporary
Issues). From 2015 onward it is **five** papers with stable subject domains. Mixing the two eras
would corrupt any per-paper analysis, so this compilation covers **2015–2026 only**. The 4-paper era
PDFs are downloaded in `source/imw_pdfs/` (`exam_2000.pdf` … `exam_2014.pdf`) and can be added later
as a separate era-tagged block if wanted.

**There was no exam in 2020** (COVID-19). Eleven exam years are therefore covered:
2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025, 2026.

### Provenance of each year

| Years | Extracted from |
|-------|----------------|
| 2015–2019, 2024, 2025, 2026 | Text layer of the official IMW PDF (`source/imw_pdfs/exam_YYYY.pdf`) |
| 2021, 2022, 2023 | Official IMW PDF is an **image scan**; questions transcribed from page renders of the same PDF, cross-checked against the JancisRobinson.com republication for 2021 |

### Marks, sections, and question numbering

- The IMW publishes **no per-question mark allocations for theory** (unlike the practical). Do not
  invent them. What *is* published is the **answer-count rubric** per paper — e.g. "Three questions
  to be answered, one from Section A and two from Section B" — captured verbatim below as
  `*Rubric:*`.
- Papers 1, 2, 4 and 5 are split into **Section A** and **Section B**; Paper 3 (handling) is a flat
  list of four questions of which two are answered.
- **Question numbers here run continuously within a paper** (Section A = 1–2, Section B = 3 onward).
  Most source PDFs already do this. The 2021 PDF restarts numbering at 1 in Section B; it has been
  normalised to continuous numbering here, matching how JancisRobinson.com republished it, so that
  every `th_YYYY_pN_qM` ID is unique within its paper. The `section` field preserves which section a
  question came from.
- Paper titles are normalised to the five canonical domain names. Where the source heading differs
  (the older "THE PRODUCTION OF WINE – PART n" phrasing, or the 2026 Paper 3 heading anomaly), the
  original heading is preserved verbatim on a `*Source heading:*` line.

Question text is authoritative and is never paraphrased. Sub-parts (a/b/c, bulleted lists) are
reproduced as they appear.

### Copyright

These are IMW examination papers, © Institute of Masters of Wine. This compilation exists for the
candidate's **private study**. Do not republish the papers or this file in any public-facing surface.

---

# **Master of Wine Theory Exam 2015**

## **Theory Paper 1 — Viticulture**

*Source heading: THEORY PAPER 1 – THE PRODUCTION OF WINE – PART 1 (VITICULTURE)*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

What are the causes of grapevine trunk diseases, such as Esca, and what are the best strategies to combat them?

*Notes / Examiner intent:*

#### **Question 2**

What nutrients are important to the grapevine for the production of quality grapes, and why?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

When and how does frost pose a risk to grape production? Evaluate the different methods of frost protection available to the grape grower.

*Notes / Examiner intent:*

#### **Question 4**

Which are the most suitable grape varieties for the production of high quality traditional method sparkling wines, and why?

*Notes / Examiner intent:*

#### **Question 5**

Why does density of vine plantation vary from vineyard to vineyard? Assess the advantages of low and high density plantings.

*Notes / Examiner intent:*

#### **Question 6**

How might the costs of growing grapes and managing a vineyard affect the price of a bottle of wine?

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: THEORY PAPER 2 – THE PRODUCTION OF WINE – PART 2 (VINIFICATION AND PRE-BOTTLING PROCEDURES)*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Why is it important to consider pH during the winemaking process?

*Notes / Examiner intent:*

#### **Question 2**

What opportunities exist, as part of the winemaking process, for the winemaker to bring complexity to his or her wine?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

How can sweetness be achieved in non-fortified wines through viticulture and vinification?

*Notes / Examiner intent:*

#### **Question 4**

What contributions do yeasts make to wine, and how far can a winemaker control these?

*Notes / Examiner intent:*

#### **Question 5**

Write short notes on how each of the following are managed in a winery:

- Juice clarity and turbidity
- Wine clarification
- Wine stabilisation

*Notes / Examiner intent:*

#### **Question 6**

Discuss acid adjustment, chaptalisation and dealcoholisation with particular regard to balance in wine.

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Source heading: THEORY PAPER 3 - THE PRODUCTION OF WINE – PART 3 (HANDLING OF WINES)*

*Rubric: Answer TWO questions from the FOUR listed below.*

#### **Question 1**

Outline the key technical considerations involved in the choice of final packaging for wine.

*Notes / Examiner intent:*

#### **Question 2**

In the world of highly automated and computer controlled bottling lines, to what extent are quality control checks becoming obsolete?

*Notes / Examiner intent:*

#### **Question 3**

How might protein and tartrate stability in wine be achieved, and managed?

*Notes / Examiner intent:*

#### **Question 4**

Assess the various methods of transporting wine in bulk; what precautions should be taken from a QA perspective?

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Is consolidation among wine producers good or bad for consumers?

*Notes / Examiner intent:*

#### **Question 2**

As the brand manager of a 500,000 case wine brand, what five key statistics would you most closely monitor to gauge the performance of your brand, and why?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

How can a sommelier or restaurant buying manager ensure he/she is delivering good value both to his/her customers and owner? How may sustainable profit in the on-trade be maximised?

*Notes / Examiner intent:*

#### **Question 4**

Have supermarkets been a positive or negative force for mainstream wine consumers around the globe?

*Notes / Examiner intent:*

#### **Question 5**

You are a wine producer in Pommard. What are your main marketing strengths? How can you grow your business?

*Notes / Examiner intent:*

#### **Question 6**

Assess successful approaches to social media by the wine industry.

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: TWO questions to be answered, ONE from Section A and ONE from Section B.*

### **Section A**

#### **Question 1**

What are the most significant current trends in the fine wine market?

*Notes / Examiner intent:*

#### **Question 2**

What are the key factors behind the current worldwide success of sparkling wines?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Is the "natural wine" movement losing momentum? What is its future?

*Notes / Examiner intent:*

#### **Question 4**

Are wine competitions and the resulting awards they bestow important to establishing a successful brand?

*Notes / Examiner intent:*

#### **Question 5**

Fortified wines are diverse in style; why are they not more popular?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2016**

## **Theory Paper 1 — Viticulture**

*Source heading: THEORY PAPER 1 – THE PRODUCTION OF WINE – PART 1 (VITICULTURE)*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Assess the effectiveness of the options available to organic and biodynamic grape growers to control pests and diseases.

*Notes / Examiner intent:*

#### **Question 2**

What practical options does a viticulturist have at his or her disposal to address long term changes in climate in an established vineyard?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Can Cabernet Sauvignon and Riesling be successful in the same location?

*Notes / Examiner intent:*

#### **Question 4**

Compare the main vine training systems used in the following wine regions:

a. Mosel
b. Alsace
c. Marlborough
d. Châteauneuf-du-Pape

*Notes / Examiner intent:*

#### **Question 5**

What steps can a viticulturist take to provide and maintain proper vine nutrition?

*Notes / Examiner intent:*

#### **Question 6**

When and how can hail cause damage at various stages of vine growth? What methods are most effective for preventing or responding to such damage?

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: THEORY PAPER 2 – THE PRODUCTION OF WINE – PART 2 (VINIFICATION AND PRE-BOTTLING PROCEDURES)*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

It is often noted that some wines are not perfectly clean, and have low levels of potentially faulty aromas, sometimes referred to as "funky". How can a winemaker best manage a desirable element of "funkiness" in his or her wine?

*Notes / Examiner intent:*

#### **Question 2**

Shape, size and material of a vessel used for fermentation and maturation are important factors in determining style and quality. Discuss with particular reference to Cabernet Sauvignon and Chardonnay.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

How can a wine's tannin profile be managed during vinification?

*Notes / Examiner intent:*

#### **Question 4**

Discuss the impact of malolactic fermentation, or its absence, on wine style.

*Notes / Examiner intent:*

#### **Question 5**

What are the winemaker's options and challenges in colour management for different wine styles?

*Notes / Examiner intent:*

#### **Question 6**

Examine the pros and cons of skin contact during the winemaking process.

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Source heading: THEORY PAPER 3 - THE PRODUCTION OF WINE – PART 3 (HANDLING OF WINES)*

*Rubric: Answer TWO questions from the FOUR listed below.*

#### **Question 1**

What are the most common causes of bacterial spoilage in wine? What effect do they each have, and what measures can be employed to guard against them? Your answer may consider the whole grape growing and winemaking process.

*Notes / Examiner intent:*

#### **Question 2**

What should a winemaker's main considerations be when preparing a finished wine for bottling?

*Notes / Examiner intent:*

#### **Question 3**

Consider the key issues for storage of wine after packing is complete.

*Notes / Examiner intent:*

#### **Question 4**

Evaluate the prevention and correction of the following problems:

a. Pinking in a white wine made for drinking early
b. Phenolic bitterness in a red wine
c. High levels of volatile acidity in a full bodied red wine

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Who is making money in the wine industry and why? Discuss in detail three specific examples of profitable wine businesses from different parts of the wine industry supply chain.

*Notes / Examiner intent:*

#### **Question 2**

There is much talk of consolidation in the wine industry, but where is the industry fragmenting and why? Give examples of businesses that are succeeding as a result.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

What is a "virtual winery"? Discuss the strengths and weaknesses of this business model.

*Notes / Examiner intent:*

#### **Question 4**

What are the most quantifiable signs that a wine brand is strong?

*Notes / Examiner intent:*

#### **Question 5**

Do today's wine labels do a good job of communicating the most important information to consumers?

*Notes / Examiner intent:*

#### **Question 6**

What are the commercial advantages and disadvantages of packing/bottling wine in the local market of consumption? Is this trend a good thing for the wine industry?

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: TWO questions to be answered, ONE from Section A and ONE from Section B.*

### **Section A**

#### **Question 1**

"The consumer's limited knowledge is a blessing for the wine industry." Discuss.

*Notes / Examiner intent:*

#### **Question 2**

How much should a consumer trust the words of a wine commentator?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Which is more important in wine: tradition or innovation?

*Notes / Examiner intent:*

#### **Question 4**

To what extent is wine just another commodity?

*Notes / Examiner intent:*

#### **Question 5**

Do government drinking guidelines make sense?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2017**

## **Theory Paper 1 — Viticulture**

*Source heading: THEORY PAPER 1 - THE PRODUCTION OF WINE - PART 1 (Viticulture)*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Temperature is one of the most impactful environmental variables on wine grape growing. How does temperature affect viticulture?

*Notes / Examiner intent:*

#### **Question 2**

Water availability is increasingly an issue in some wine producing regions. How can a viticulturist best ensure water sustainability when establishing and managing vineyards in drought-prone regions?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Labour supply for vineyard work is decreasing in many parts of the world. If this trend continues, how will this affect viticulture, and how can vineyard managers around the world best prepare for, and handle, a shortage of workers?

*Notes / Examiner intent:*

#### **Question 4**

Discuss which vine varieties would be most suitable for the production of dessert wines. Explain your choice with specific reference to any climatic requirements.

*Notes / Examiner intent:*

#### **Question 5**

Does soil preparation affect the potential yield and quality in a vineyard?

*Notes / Examiner intent:*

#### **Question 6**

What are the principal pests and diseases facing vine growers today, and how can they best be managed?

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: THEORY PAPER 2 - THE PRODUCTION OF WINE - PART 2 (Vinification and Pre-bottling Procedures)*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

"This wine has been bottled un-fined and unfiltered." Assess the implications for the winemaker.

*Notes / Examiner intent:*

#### **Question 2**

Sauvignon Blanc appears in many styles throughout the world. Compare and contrast Sauvignon Blanc winemaking practices around the world.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Discuss the roles of enzymes in winemaking.

*Notes / Examiner intent:*

#### **Question 4**

Compare and contrast winemaking techniques best employed for Syrah grown in Cornas, McLaren Vale and Hawke's Bay.

*Notes / Examiner intent:*

#### **Question 5**

Temperature management is the key to modern winemaking. Discuss.

*Notes / Examiner intent:*

#### **Question 6**

How, and to what extent, can yeast influence the final style and quality of wines?

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Source heading: THEORY PAPER 3 - THE PRODUCTION OF WINE – PART 3 (Handling of Wines)*

*Rubric: Answer TWO questions from the FOUR listed below.*

#### **Question 1**

Outline the most important quality control checks during bottling and why each is necessary.

*Notes / Examiner intent:*

#### **Question 2**

What analyses should be carried out at the winery pre- and post-bottling to ensure that a wine is in good condition and conforms to legal requirements for sale?

*Notes / Examiner intent:*

#### **Question 3**

Many winemakers are reducing the levels of free and total sulphites in wine. Consider the role of sulphites at bottling and until the wine reaches the end consumer. What are the implications of reduced levels of free sulphites?

*Notes / Examiner intent:*

#### **Question 4**

Briefly discuss three of the following showing their importance to the handling of wine:

a) Preservatives in wine
b) Preventing deposits in bottled wine
c) Inert storage
d) Pre-bottling filtration

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

How can the role of the intermediaries between producer and consumer be justified? How is it changing? Use examples from several different wine markets.

*Notes / Examiner intent:*

#### **Question 2**

Can small independent wine retailers compete with large chains on price? How else can they compete effectively?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

You inherit the equivalent of US$ 10 million and want to invest in the wine industry. How would you spend your money to attract the greatest return on investment? Explain your logic.

*Notes / Examiner intent:*

#### **Question 4**

In what ways have social media changed the marketing of wine brands over the past 10 years?

*Notes / Examiner intent:*

#### **Question 5**

You are Export Director of an established large wine company producing in excess of one million nine litre cases. How would you seek to capitalise on the potential of the growing Chinese market for imported wine? What are the risks and how can they be managed?

*Notes / Examiner intent:*

#### **Question 6**

As the owner of a Bordeaux Classified Growth from the Left Bank, what options are available to you today to present your wine to the market? Evaluate these options from commercial and brand-building standpoints.

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: TWO questions to be answered, ONE from Section A and ONE from Section B.*

### **Section A**

#### **Question 1**

What is the importance of alcohol in wine?

*Notes / Examiner intent:*

#### **Question 2**

Has science taken away the romance of wine?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

How relevant is blind tasting in assessing wine?

*Notes / Examiner intent:*

#### **Question 4**

What are the causes for optimism in the wine world today?

*Notes / Examiner intent:*

#### **Question 5**

Does great wine need a great story?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2018**

## **Theory Paper 1 — Viticulture**

*Source heading: THEORY PAPER 1 - Viticulture*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Many wine regions can produce wines at a wide range of price points. Referencing at least two of such regions, compare and contrast methods of managing vineyards for high priced wines and low priced wines.

*Notes / Examiner intent:*

#### **Question 2**

Referencing at least three wine regions, discuss how climate change is influencing grape growers' viticultural practices.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Identify the most important trunk diseases in vineyards around the world. How can they be best controlled and managed?

*Notes / Examiner intent:*

#### **Question 4**

Is the use of cover crops worthwhile in viticulture?

*Notes / Examiner intent:*

#### **Question 5**

What is the role of pruning when managing an established vineyard?

*Notes / Examiner intent:*

#### **Question 6**

Old vines have a mystique to them. What are the practical challenges and solutions to maintaining vineyards of old vines?

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: THEORY PAPER 2 - Vinification and Pre-bottling Procedures*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Examine the advantages and disadvantages of deliberate stem inclusion, or additions, during the winemaking process.

*Notes / Examiner intent:*

#### **Question 2**

Compare and contrast winemaking techniques for "high end" and "entry level" Chardonnay in at least two regions.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Write concise notes on four of the following:

- Lysozyme
- Mannoprotein
- CMC - Carboxymethyl cellulose
- Copper sulphate
- Ascorbic acid
- YAN – Yeast assimilable nitrogen

*Notes / Examiner intent:*

#### **Question 4**

What are the critical winemaking considerations for a producer of inexpensive off-dry still white wines?

*Notes / Examiner intent:*

#### **Question 5**

Which winemaking decisions affect the ageing potential of a finished wine?

*Notes / Examiner intent:*

#### **Question 6**

How and to what extent can a winemaker influence the textural profile of a wine?

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Source heading: THEORY PAPER 3 - Handling of Wines*

*Rubric: Answer TWO questions from the FOUR listed below.*

#### **Question 1**

How does a laboratory analysis of a wine help the quality control manager make decisions at bottling?

*Notes / Examiner intent:*

#### **Question 2**

Describe the options available for bulk transport of wine. What are the risks and benefits for each option?

*Notes / Examiner intent:*

#### **Question 3**

What technical factors influence the choice of a closure for wine bottles?

*Notes / Examiner intent:*

#### **Question 4**

Detail the advantages and disadvantages of the following methods of clarifying a wine:

a. Earth filtration
b. Pad filtration
c. Membrane filtration
d. Crossflow filtration

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Source heading: THEORY PAPER 4 - THE BUSINESS OF WINE*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

What have been the most important changes in global wine supply and demand in the past three years and what are their implications?

*Notes / Examiner intent:*

#### **Question 2**

What are the advantages and disadvantages of private-label wines for wineries, distributors and retailers?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

How important are environmental credentials in marketing wine?

*Notes / Examiner intent:*

#### **Question 4**

Where are direct to consumer wine sales increasing and why?

*Notes / Examiner intent:*

#### **Question 5**

There has been a great deal of innovation in packaging design and formats in other alcoholic beverage categories. Why has the wine industry been slow to follow suit? Should it follow?

*Notes / Examiner intent:*

#### **Question 6**

Evaluate the extent to which scarcity/rarity is a positive attribute in wine marketing.

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Source heading: THEORY PAPER 5 - CONTEMPORARY ISSUES*

*Rubric: TWO questions to be answered, ONE from Section A and ONE from Section B.*

### **Section A**

#### **Question 1**

Can wine be considered a social good?

*Notes / Examiner intent:*

#### **Question 2**

How can the wine industry attract new consumers?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

If a global disease were destroying all known grape varieties and you had the chance to preserve only two varieties - one white and one black - for humanity, which would you choose to save, and why?

*Notes / Examiner intent:*

#### **Question 4**

Is elitism an inherent problem in the world of wine?

*Notes / Examiner intent:*

#### **Question 5**

Do wine consumers need wine experts?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2019**

## **Theory Paper 1 — Viticulture**

*Source heading: Theory Paper 1 - Viticulture*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Are yield restrictions necessary to produce high-quality wine?

*Notes / Examiner intent:*

#### **Question 2**

Your company has acquired a vineyard suitable for high-quality wine production that is currently producing grapes for bulk wine. Indicate what steps you would take to convert it.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Assess how drought tolerance can be achieved through viticulture.

*Notes / Examiner intent:*

#### **Question 4**

Mildews continue to afflict vineyards. What strategies might a vineyard manager employ to reduce the risk?

*Notes / Examiner intent:*

#### **Question 5**

What are the critical considerations for selecting rootstock when establishing a new vineyard?

*Notes / Examiner intent:*

#### **Question 6**

Discuss the role of the following factors in the production of high-quality grapes:

- Aspect
- Vine density
- Row orientation

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: Theory Paper 2 - Vinification and Pre-bottling Procedures*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

How can a winemaker manage the impact of oxygen during the winemaking process?

*Notes / Examiner intent:*

#### **Question 2**

Evaluate the options available to the winemaker wishing to make wine with a lower level of alcohol.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Explain the procedures that might be followed in the winery when dealing with rot-degraded fruit.

*Notes / Examiner intent:*

#### **Question 4**

With new French oak barrels becoming increasingly expensive, what alternative options and techniques are available to the winemaker wishing to make high-end wines?

*Notes / Examiner intent:*

#### **Question 5**

Consider the impact of rosé winemaking techniques on wine quality. Are paler-coloured rosé wines better quality?

*Notes / Examiner intent:*

#### **Question 6**

To what extent is it possible for producers of tank method sparkling wines to match the style and quality of wines produced by the traditional method?

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Source heading: Theory Paper 3 - Handling of Wines*

*Rubric: Answer TWO questions from the FOUR listed below.*

#### **Question 1**

Explain which pre-bottling treatments and QC analyses you would consider most important for an inexpensive, organic, vegan wine.

*Notes / Examiner intent:*

#### **Question 2**

What steps should a winemaker take, in preparation for bottling and at bottling, to prevent microbial spoilage? Consider both red and white wines.

*Notes / Examiner intent:*

#### **Question 3**

Describe a comprehensive QA and QC system a large winery should implement for the management of dry goods.

*Notes / Examiner intent:*

#### **Question 4**

What are the key factors to consider in drawing up a technical specification for:

a. a white dessert wine bottled at source with 150g/l of residual sugar; and
b. an entry-level red wine imported in bulk with 4g/l of residual sugar

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Source heading: Theory Paper 4 - The Business of Wine*

*Rubric: THREE questions to be answered, ONE from Section A and TWO from Section B.*

### **Section A**

#### **Question 1**

Why does a growing number of large retailers prefer to focus on own and exclusive labels over third-party brands? Is this good for the wine category?

*Notes / Examiner intent:*

#### **Question 2**

How do wine consumers in mainland China decide what wine to buy and what are the implications of their choices for producers and distributors?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Consider the growth in demand for vegan, organic and sustainable wines. What can and should the wine industry be doing in response?

*Notes / Examiner intent:*

#### **Question 4**

Can social media drive brand loyalty in the wine category?

*Notes / Examiner intent:*

#### **Question 5**

How can the fortified wine category evolve to address current consumer trends?

*Notes / Examiner intent:*

#### **Question 6**

Outline the key changes in the fine wine investment market over the past decade. How do you see this developing over the next ten years?

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Source heading: Theory Paper 5 - Contemporary Issues*

*Rubric: TWO questions to be answered, ONE from Section A and ONE from Section B.*

### **Section A**

#### **Question 1**

What is the greatest threat currently facing the wine industry and how should this be addressed?

*Notes / Examiner intent:*

#### **Question 2**

Does a changing climate place greater emphasis on terroir or on choice of grape variety?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Does wine have a significant role to play in a healthy lifestyle?

*Notes / Examiner intent:*

#### **Question 4**

How responsible is the wine industry?

*Notes / Examiner intent:*

#### **Question 5**

What makes wine authentic?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2021**

*Note: the official 2021 PDF is an image scan. Questions transcribed from page renders and
cross-checked against the JancisRobinson.com republication. The source PDF restarts question
numbering at 1 within Section B of Papers 1, 2, 4 and 5; numbering is normalised to continuous here.*

## **Theory Paper 1 — Viticulture**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Evaluate the principal factors to consider when establishing a vineyard in a marginal climate.

*Notes / Examiner intent:*

#### **Question 2**

Discuss the major factors that impact the timing of harvest in a vineyard.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

What is the importance of soil pH in viticulture? How can vine growers influence soil pH to obtain quality grapes for winemaking?

*Notes / Examiner intent:*

#### **Question 4**

Discuss the current role and potential future use of hybrids in viticulture.

*Notes / Examiner intent:*

#### **Question 5**

To what extent can wineries control the quality of the grapes they purchase?

*Notes / Examiner intent:*

#### **Question 6**

Is there an ideal terroir for the production of sparkling wines?

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

What options are available to control final sugar levels in wine?

*Notes / Examiner intent:*

#### **Question 2**

Compare and contrast winemaking techniques for an early-drinking and an age-worthy Pinot Noir still red wine in a premium region.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Write concise notes on each of the following:

a) Smoke taint in grapes and wine
b) Volatile acidity
c) Metatartaric acid
d) Spinning cone technology

*Notes / Examiner intent:*

#### **Question 4**

When, how and why should sulphur dioxide be used in winemaking? Are winemakers playing it too safe with sulphur dioxide additions?

*Notes / Examiner intent:*

#### **Question 5**

To what extent are winemaking interventions desirable in a small-scale winery producing high-quality, dry red wine?

*Notes / Examiner intent:*

#### **Question 6**

What handling procedures could a winemaker implement to make mid-priced still wine from each of the following:

a) English Chardonnay: potential alcohol 8%; pH 2.8; total acidity 14.5; and
b) Barossa Valley Grenache Noir: potential alcohol 16.5%; pH 4.2; total acidity 3.9.

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Rubric: Answer two of the following four questions.*

#### **Question 1**

Compare and contrast the options available as preservatives for addition to still wine.

*Notes / Examiner intent:*

#### **Question 2**

Outline the key considerations in deciding which pre-bottling treatments to use for each of the following:

a) A vegan wine;
b) An orange wine;
c) An organic wine; and
d) A mass-market, inexpensive wine.

*Notes / Examiner intent:*

#### **Question 3**

You are responsible for quality assurance (QA) and quality control (QC) for an importer of bulk wine. Explain the QA and QC procedures that you will need:

a) between the completion of winemaking and the start of the bulk transport process; and
b) following receipt of the bulk wine at its destination.

*Notes / Examiner intent:*

#### **Question 4**

A winery has received a customer complaint for a piece of glass found in a bottle. Describe the QA and QC procedures best employed by the winery to investigate the issue.

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

How has the market transparency facilitated by the internet and social media influenced the supply, demand and pricing of wine? Who benefits?

*Notes / Examiner intent:*

#### **Question 2**

With reference to Bordeaux and other regions, discuss the commercial viability of the en primeur model. Outline the pros and cons for all parties, from producer through to consumer.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

As export director of a 100,000-case winery in the New World, you have been asked to increase exports from 10% to 25% of total production volume. What are the factors that would be most relevant to your strategy?

*Notes / Examiner intent:*

#### **Question 4**

Outline key changes in consumer taste preferences over the past decade. Which wine-producing regions have evolved their offer successfully to match these changes?

*Notes / Examiner intent:*

#### **Question 5**

Identify and assess the financial considerations when planning an investment in planting a vineyard and building a winery.

*Notes / Examiner intent:*

#### **Question 6**

How important is it for wine producers to develop new products?

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: Two questions to be answered, one from Section A and one from Section B.*

### **Section A**

#### **Question 1**

Who do you consider to be the real pioneers in today's wine industry, and why?

*Notes / Examiner intent:*

#### **Question 2**

Wine is celebrated for its diversity of styles. Is this diversity under threat?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

To what extent is France's wine classification system a model for the rest of the world?

*Notes / Examiner intent:*

#### **Question 4**

Can one wine ever be objectively better than another?

*Notes / Examiner intent:*

#### **Question 5**

How relevant is tradition to 21st century wine consumers?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2022**

*Note: the official 2022 PDF is an image scan. Questions transcribed from page renders.*

## **Theory Paper 1 — Viticulture**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Which diseases of the vine are the greatest threat to vineyards around the world today, and why?

*Notes / Examiner intent:*

#### **Question 2**

What effects do vineyard pests have on grape quality, and how do grape growers control them?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

To what extent does the geology of a vineyard affect the way it is managed?

*Notes / Examiner intent:*

#### **Question 4**

Glyphosate use is coming under increasing scrutiny. Should it be banned in modern viticulture? What are the alternatives?

*Notes / Examiner intent:*

#### **Question 5**

As a viticulturist, what factors would influence your approach to growing cover crops in a vineyard?

*Notes / Examiner intent:*

#### **Question 6**

What factors affect the timing of pruning in vineyards around the world?

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: Paper 2 (Vinification)*

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Explain the process of malolactic fermentation in winemaking. How, why and when is it employed?

*Notes / Examiner intent:*

#### **Question 2**

Examine the role of yeast lees during wine maturation.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

What are the options available for pre- and post-fermentation maceration in winemaking? What factors determine their use?

*Notes / Examiner intent:*

#### **Question 4**

How can a winemaker ensure consistency in a wine's style over a number of years?

*Notes / Examiner intent:*

#### **Question 5**

Describe what a winemaker can do when faced with each of the following situations:

a) Stuck fermentation
b) Undesirable oxidative characters, including mouse taint
c) Early-stage Brettanomyces infection

*Notes / Examiner intent:*

#### **Question 6**

Analyse the options available to producers of high-quality Chardonnay for reducing the risk of premature oxidation in bottle.

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Rubric: Answer two of the following four questions.*

#### **Question 1**

What are the main technical issues a wine producer should consider when evaluating a change from bottling still wines at source to shipping them in bulk for bottling in the destination market?

*Notes / Examiner intent:*

#### **Question 2**

Outline the winemaker's key considerations when deciding whether or not to filter each of the following in preparation for bottling:

a) white wine with 180g/L residual sugar
b) ruby port
c) Bourgogne Pinot Noir

*Notes / Examiner intent:*

#### **Question 3**

'Post-maturation wine stabilisation practices should be used only on low-end wines.' Discuss.

*Notes / Examiner intent:*

#### **Question 4**

You are a producer planning to sell your wine to countries in the European Union (EU). What requirements for analysis and labelling must be met to ensure compliance with EU law?

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

How has the global coronavirus pandemic impacted consumer wine purchasing behaviours? Use examples from at least three significant markets to illustrate your answer.

*Notes / Examiner intent:*

#### **Question 2**

What measures determine the strength of a wine brand? How can brand managers most effectively influence their brand's long-term performance?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Who or what are the most important influencers of consumer behaviour in today's world of wine?

*Notes / Examiner intent:*

#### **Question 4**

Which emerging wine-producing countries or regions have the best chance of establishing themselves as a significant force on the international wine market, and why?

*Notes / Examiner intent:*

#### **Question 5**

Which are the most attractive markets for premium Italian wines, and why?

*Notes / Examiner intent:*

#### **Question 6**

You are the production director of a one million-case winery which aspires to become carbon neutral by the end of the decade. What steps would you take to achieve this objective?

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: Two questions to be answered, one from Section A and one from Section B.*

### **Section A**

#### **Question 1**

'Natural wine does not need a legal definition.' Discuss.

*Notes / Examiner intent:*

#### **Question 2**

Assess the main challenges and opportunities for the wine education industry around the globe in the next ten years.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

How is artificial intelligence being used within the wine industry and what might its impact be in the coming decades?

*Notes / Examiner intent:*

#### **Question 4**

Are biodynamic practices the key to more sustainable wine production?

*Notes / Examiner intent:*

#### **Question 5**

Does anyone still need wine writers?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2023**

*Note: the official 2023 PDF is an image scan. Questions transcribed from page renders.*

## **Theory Paper 1 — Viticulture**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Extreme heat and drought threaten many wine regions. What steps can a vineyard manager take to mitigate their effects?

*Notes / Examiner intent:*

#### **Question 2**

To what extent is excessive precipitation during the growing season a threat in the vineyard? How can it be managed?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

A viticulturist has observed a decline in vineyard yield over the last five years. Discuss the possible causes and how the issue might be addressed.

*Notes / Examiner intent:*

#### **Question 4**

What are the causes and effects of nitrogen deficiency in a vineyard? How can it be remedied?

*Notes / Examiner intent:*

#### **Question 5**

Evaluate the potential risks and rewards of choosing to plant ungrafted vines.

*Notes / Examiner intent:*

#### **Question 6**

Assess the role of sunlight in determining grape quality.

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: Paper 2 (Vinification)*

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Outline the techniques a winemaker can use to influence the colour of red wine, considering at least three different styles of wine.

*Notes / Examiner intent:*

#### **Question 2**

Explain the methods winemakers use to influence the colour of rosé wines.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

When and why might inert gas be used in still winemaking?

*Notes / Examiner intent:*

#### **Question 4**

Which laboratory analyses should a winemaker carry out prior to alcoholic fermentation, and why?

*Notes / Examiner intent:*

#### **Question 5**

Write concise notes on four of the following additives:

a. Yeast nutrients
b. Oenological tannins
c. Bentonite
d. Carbon
e. Dimethyl dicarbonate

*Notes / Examiner intent:*

#### **Question 6**

Are wild ferments worth the risk? Assess the advantages and disadvantages of choosing not to use cultured yeasts for fermentation.

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Rubric: Answer two of the following four questions.*

#### **Question 1**

As a quality control (QC) manager for a large EU-based supermarket chain, you are auditing the QC and bottling procedures for one of your own-label suppliers for red and white wines. What would be your key areas of focus, and why?

*Notes / Examiner intent:*

#### **Question 2**

Compare and contrast the technical implications of three non-glass packaging options available to a wine producer.

*Notes / Examiner intent:*

#### **Question 3**

Compare and contrast how stability is achieved in the following white wines:

a. entry-level New Zealand Sauvignon Blanc;
b. domaine-bottled Meursault; and
c. Alsace *Sélection de Grains Nobles* Riesling.

*Notes / Examiner intent:*

#### **Question 4**

You are the head quality control (QC) manager for a major multiple retailer. Write a report detailing the implications of reducing post-fermentation sulphur dioxide additions in wine.

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Which sectors of the wine industry are currently delivering the best return on investment?

*Notes / Examiner intent:*

#### **Question 2**

Which sectors of the wine industry are doing the most to advance the sustainability agenda?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

You are the global brand director for an internationally established, prestige Champagne house. You have an annual marketing budget of five million euros (approximately five million U.S. dollars), not including price promotions, and have been asked to present a three-year brand plan. What are your key areas of focus and expenditure?

*Notes / Examiner intent:*

#### **Question 4**

What are the biggest challenges facing wine brand managers looking to create and maintain a loyal customer base in today's competitive market?

*Notes / Examiner intent:*

#### **Question 5**

What are the key elements of a successful relationship between a wine producer and their distributor?

*Notes / Examiner intent:*

#### **Question 6**

Outline the challenges and opportunities facing wine producers in California. What is the long-term outlook for this region?

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: Two questions to be answered, one from Section A and one from Section B.*

### **Section A**

#### **Question 1**

What is the future of traditional wine packaging?

*Notes / Examiner intent:*

#### **Question 2**

Is alcohol an essential component of high-quality wine?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

In your opinion, what should be on a wine label, and why?

*Notes / Examiner intent:*

#### **Question 4**

"Minerality is one of the most overused yet misunderstood words in the wine industry." Discuss.

*Notes / Examiner intent:*

#### **Question 5**

Is a wine's ability to age important?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2024**

## **Theory Paper 1 — Viticulture**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

How can vineyard practices minimise the need for must adjustments in the winery?

[Note: answers may cover the syllabuses of papers 1 and 2]

*Notes / Examiner intent:*

#### **Question 2**

Does manual work in the vineyard deliver better quality wine than mechanised alternatives?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

'Controlling yields to maintain quality is no longer necessary.' Discuss.

*Notes / Examiner intent:*

#### **Question 4**

How can slopes in vineyards influence grape quality?

*Notes / Examiner intent:*

#### **Question 5**

Assess the relative merits of high- and low-density planting in vineyards.

*Notes / Examiner intent:*

#### **Question 6**

'It is better to have too few nutrients in vineyard soils than too many.' Discuss.

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: Paper 2 (Vinification)*

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Why would a winemaker choose to filter wine, and what are the advantages and disadvantages of doing so?

*Notes / Examiner intent:*

#### **Question 2**

Discuss how and why acidity is adjusted in musts and wine.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

What are the key factors for a winemaker to consider when choosing an appropriate fermentation vessel for wine production?

*Notes / Examiner intent:*

#### **Question 4**

Compare and contrast the key production methods for the following fortified wines: aged Tawny Port; Bual Madeira; Marsala Superiore; Rutherglen Muscat.

*Notes / Examiner intent:*

#### **Question 5**

What is Brettanomyces and how can the factors that influence it be controlled?

*Notes / Examiner intent:*

#### **Question 6**

Blending is a useful tool in winemaking. Discuss how, and in what circumstances, a winemaker would choose to employ it.

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Rubric: Answer two of the following four questions.*

#### **Question 1**

What are the risks of storing wine in wooden barrels and how can they be mitigated?

*Notes / Examiner intent:*

#### **Question 2**

What quality control measures should be considered when filling bag-in-box compared to traditional glass bottles?

*Notes / Examiner intent:*

#### **Question 3**

What is the difference between processing aids and ingredients in wine? Discuss with reference to recent changes to European Union labelling law for wine and assess the implications of these changes for consumers.

*Notes / Examiner intent:*

#### **Question 4**

Describe the steps a wine technician would take to confirm raised volatile acidity in a bottled red wine sample and to identify the source of the problem.

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Evaluate the commercial success of three different styles of rosé wine.

*Notes / Examiner intent:*

#### **Question 2**

Do emerging wine regions need international investment to succeed on the global stage?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

As sales manager for a small, premium winery, outline your strategy to sell to the on-trade.

*Notes / Examiner intent:*

#### **Question 4**

Examine the profitability of various wine packaging formats from both a production and a retail point of view.

*Notes / Examiner intent:*

#### **Question 5**

Evaluate the strengths and weaknesses of own-label projects for a medium-sized winery.

*Notes / Examiner intent:*

#### **Question 6**

What are the financial barriers to success for a new wine producer and how can these be overcome?

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: Two questions to be answered, one from Section A and one from Section B.*

### **Section A**

#### **Question 1**

'Great wine is made in the vineyard.' Do you agree?

*Notes / Examiner intent:*

#### **Question 2**

Could it be argued that recent climate change has been a good thing for wine lovers?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Propose and justify a contemporary definition of fine wine and discuss how perspectives on this may have changed over time.

*Notes / Examiner intent:*

#### **Question 4**

How and why should governments influence wine consumption?

*Notes / Examiner intent:*

#### **Question 5**

How important is the concept of a defined wine region?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2025**

## **Theory Paper 1 — Viticulture**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

How effectively can vineyard pests and diseases be controlled without using agrochemicals?

*Notes / Examiner intent:*

#### **Question 2**

"Bacterial and phytoplasma diseases are the greatest threats to vine health today." Discuss.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

How can artificial intelligence ('AI') be used in viticulture to improve the quality of wine grapes?

*Notes / Examiner intent:*

#### **Question 4**

To what extent does soil management affect the quality of wine grapes?

*Notes / Examiner intent:*

#### **Question 5**

How do changing rainfall and wind patterns affect viticulture?

*Notes / Examiner intent:*

#### **Question 6**

To what extent can rootstocks be used to mitigate the effects of climate change?

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: Paper 2 (Vinification)*

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

Critically assess the key techniques a winemaker can use to enhance complexity and texture in bottle-fermented sparkling wines.

*Notes / Examiner intent:*

#### **Question 2**

Evaluate the different winemaking techniques that can enhance a wine's potential for extended bottle ageing.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Examine the roles of bacteria in winemaking. How can bacteria be managed to achieve desired outcomes?

*Notes / Examiner intent:*

#### **Question 4**

Evaluate prevention and correction strategies for each of the following issues:

a. 0.9g/L volatile acidity in a Chablis wine (pH3.2, 12.5% ABV) intended for lees ageing;
b. Strong reductive aromas post-malolactic fermentation in a premium Barossa Shiraz (pH 3.8, 15% ABV) destined for 24-month oak ageing;
c. 180mg/L total sulphur dioxide in a Bordeaux blend (pH 3.6, 13.5% ABV) pre-bottling.

*Notes / Examiner intent:*

#### **Question 5**

Considering a diversity of wine styles, critically evaluate the importance of blending to achieve consistency.

*Notes / Examiner intent:*

#### **Question 6**

Assess how pH influences winemaking decisions at key stages from grape to finished wine.

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Rubric: Answer two of the following four questions.*

#### **Question 1**

As a producer of a dry white wine that may age in bottle for up to five years, you are considering changing from natural cork stoppers to an alternative closure. What technical factors should you consider?

*Notes / Examiner intent:*

#### **Question 2**

Write concise notes on three of the following:

a. Mousiness.
b. Light strike in bottled wine.
c. Elevated volatile acidity in bottled wine.
d. Management of a tank of rosé with free sulphur dioxide well above its ideal level.

*Notes / Examiner intent:*

#### **Question 3**

What are the key factors to consider when deciding whether to cold stabilise white and red wines? What quality control measures are required to test that wine is stable?

*Notes / Examiner intent:*

#### **Question 4**

Why are fining agents used in winemaking? For each of the following wines, explain which factors might influence the choice of fining agent used:

a. Entry-level South African Chenin Blanc;
b. DOCG Barolo; and
c. Vegan AOC Côtes de Provence rosé.

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: Three questions to be answered, one from Section A and two from Section B.*

### **Section A**

#### **Question 1**

How has Champagne maintained its primacy in the world of sparkling wine?

*Notes / Examiner intent:*

#### **Question 2**

Do sustainability initiatives inevitably compromise profitability?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

How can the wine industry best address the issues of overproduction and falling consumption?

*Notes / Examiner intent:*

#### **Question 4**

To what extent can government wine monopolies benefit producers, retailers and consumers?

*Notes / Examiner intent:*

#### **Question 5**

Wineries are increasingly selling direct to consumers. Evaluate the strengths and weaknesses of this approach compared to other routes to market.

*Notes / Examiner intent:*

#### **Question 6**

Discuss the evolution of the négociant business format in Burgundy over the last 15 years, explaining the contributing factors. Are current conditions financially sustainable?

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: Two questions to be answered, one from Section A and one from Section B.*

### **Section A**

#### **Question 1**

What will be the likely impact on the global wine industry if health warnings about cancer risks become increasingly mandatory on wine labels? Discuss the implications of such changes for producers, marketers and consumers.

*Notes / Examiner intent:*

#### **Question 2**

How is the global wine industry adapting to changing societal attitudes towards alcohol consumption, and how should it respond to the challenges and opportunities these changes present?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

You are tasked with creating a wine blend that represents the essence of humanity's wine culture. Which grapes or regions would you include, and which winemaking style and packaging would you use, and why?

*Notes / Examiner intent:*

#### **Question 4**

Analyse the major ethical concerns in the production of wine.

*Notes / Examiner intent:*

#### **Question 5**

To what extent does wine's cultural heritage remain relevant to younger consumers around the globe?

*Notes / Examiner intent:*

---

# **Master of Wine Theory Exam 2026**

## **Theory Paper 1 — Viticulture**

*Rubric: Answer three questions, one from section A and two from section B.*

### **Section A**

#### **Question 1**

What is regenerative viticulture and how does it compare with other approaches to growing grapes?

*Notes / Examiner intent:*

#### **Question 2**

How can viticulturists manage vineyards to produce fresher wines with lower levels of alcohol?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Assess the beneficial and detrimental effects of fungi and bacteria in viticulture.

*Notes / Examiner intent:*

#### **Question 4**

Compare the impact of different vine training methods on wine quality.

*Notes / Examiner intent:*

#### **Question 5**

How do grape growers decide when to harvest?

*Notes / Examiner intent:*

#### **Question 6**

Which do you consider to be more important: the physical or the chemical properties of vineyard soils?

*Notes / Examiner intent:*

## **Theory Paper 2 — Vinification and pre-bottling procedures**

*Source heading: Theory paper 2 (vinification)*

*Rubric: Answer three questions, one from section A and two from section B.*

### **Section A**

#### **Question 1**

Assess the key considerations for a winemaker when selecting an appropriate fining agent.

*Notes / Examiner intent:*

#### **Question 2**

How can temperature control be used in the winery to influence wine style during winemaking and maturation?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Discuss the key causes of stuck fermentations. How can they be minimised or avoided?

*Notes / Examiner intent:*

#### **Question 4**

Discuss how a winemaker can manage the risks of reducing or eliminating sulphur dioxide use in the winery.

*Notes / Examiner intent:*

#### **Question 5**

Consider how winemakers in warmer winegrowing regions can achieve freshness and balance in their wines.

*Notes / Examiner intent:*

#### **Question 6**

Outline the different types of stability problems that may present in a finished wine prior to bottling. How can these be mitigated?

*Notes / Examiner intent:*

## **Theory Paper 3 — Handling of wine**

*Source heading: Theory paper 3 (the production of wine) — the 2026 paper is titled "the production
of wine" rather than the "handling of wine" used in 2015–2025, but its content (HACCP, bulk shipping,
bottling-line contamination, oxygen at bottling) is the handling-of-wine syllabus.*

*Rubric: Answer two questions.*

#### **Question 1**

What is the purpose of the HACCP (Hazard Analysis and Critical Control Points) system? How can it be useful for a winery handling and shipping bulk wine?

*Notes / Examiner intent:*

#### **Question 2**

Evaluate the benefits and drawbacks of shipping wine in bottle compared to shipping it in bulk.

*Notes / Examiner intent:*

#### **Question 3**

As the quality assurance manager of a large winery, what actions would you take if microbial contamination were found in routine samples taken from the bottling line?

*Notes / Examiner intent:*

#### **Question 4**

Consider how oxygen may be controlled during the preparation of finished wine for bottling.

*Notes / Examiner intent:*

## **Theory Paper 4 — The business of wine**

*Rubric: Answer three questions, one from section A and two from section B.*

### **Section A**

#### **Question 1**

Discuss the factors that explain Prosecco's continued global success.

*Notes / Examiner intent:*

#### **Question 2**

How are enduring luxury wine brands built?

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

What are the main barriers to trade for producers wishing to export their wines to the USA? What strategies can they adopt to address them?

*Notes / Examiner intent:*

#### **Question 4**

Is the current decline in global wine consumption merely cyclical, or a long-term trend?

*Notes / Examiner intent:*

#### **Question 5**

What are the commercial advantages and disadvantages of owning vineyards compared to buying in grapes?

*Notes / Examiner intent:*

#### **Question 6**

How important is public relations in the marketing mix for a medium-sized, premium wine producer?

*Notes / Examiner intent:*

## **Theory Paper 5 — Contemporary issues**

*Rubric: Answer two questions, one from section A and one from section B.*

### **Section A**

#### **Question 1**

Does the language of wine connect or divide us?

*Notes / Examiner intent:*

#### **Question 2**

"A little learning is a dangerous thing." (Alexander Pope). Discuss in relation to wine appreciation.

*Notes / Examiner intent:*

### **Section B**

#### **Question 3**

Artificial Intelligence is impacting all aspects of wine from production to consumption. Who will be the winners and losers by 2035?

*Notes / Examiner intent:*

#### **Question 4**

Which environmental certifications, if any, do you consider most helpful to those who make, sell and consume wine?

*Notes / Examiner intent:*

#### **Question 5**

How would you define a wine influencer in the contemporary media landscape? Consider the extent to which wine influencers help or hinder consumers and the wine trade today.

*Notes / Examiner intent:*
