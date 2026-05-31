# Confidence Language Corpus — MW Examiner Reports (Project 9, Agent 1)

> **What this is.** A structured, citation-grounded database of every occurrence of *confidence-,
> trust-, plausibility-, conviction-, insight-, and reasoning-related language* in the IMW examiner
> reports (Practical, Chief, and Theory, 2017–2025). It is the foundational input for the five
> downstream agents in the Examiner Confidence Construction Study. This is a **mining/cataloguing**
> artifact: it captures and organizes the raw lexical evidence and does **not** theorize about *why*
> these signals matter (that is downstream agents' work).
>
> **Central object under study.** Language by which an examiner signals that a candidate's written
> trace caused them to *believe* (or doubt) the candidate's competence — i.e. examiner **confidence**.
>
> **Source files swept** (`docs/examiners reports/extracted_txt/`):
> Practical — 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025.
> Chief — 2021, 2022, 2023, 2024, 2025.
> Theory — 2017, 2019, 2023, 2024, 2025. (2021/2022 Theory are scanned stubs — skipped.)
>
> **Method.** Case-insensitive ripgrep sweeps for the lexicon families below (`confiden|trust|credib`;
> `plausib|convinc|persuas|conviction`; `insight|sophisticat|under the skin|thoughtful|nuance`;
> `logic|coheren|reasoning|justif|cogent`; `guess|shoehorn|play it safe|panic|force|doubt|first
> impression`), then direct file reads of the surrounding paragraph to capture each full sentence
> verbatim. Quotes are reproduced exactly, including OCR artifacts in the 2025 reports (the 2025
> PDFs extracted with character-merge errors, e.g. "C�tes", "conte--xtfor", "classificatiosn"); these
> are flagged `[sic/OCR]` where they affect a quoted word. Where the report itself names the
> question/wine, that is cited; many intros are paper- or exam-general.
>
> **Provenance caveat (inherited from `examiner_confidence_model.md`).** IMW examiner reports are
> member-gated, not public; the verbatim quotes are credible because the user holds the reports, but
> year/paper attributions are corpus claims, not web-checkable facts.

---

## 1 · Master quotation table

Polarity tags: **PRAISE** (confidence-building language), **DOUBT** (confidence-destroying language),
**NEUTRAL-CRITERION** (a stated rule/criterion about how confidence is earned, neither praising nor
faulting a specific cohort). Practical-report rows are listed first within each family (the project
priority), then Chief, then Theory.

### Family A — Confidence / Trust / Credibility

| # | Verbatim quote | Source | Polarity |
|---|----------------|--------|----------|
| A1 | "There is no simple formula to passing the practical exam so long as candidates demonstrate good tasting ability, sound logic and deductive reasoning, and show **confidence** in their answers." | 2021 Practical, Intro (Peter Marks MW) | NEUTRAL-CRITERION |
| A2 | "One must wonder if the crush of the pandemic resulted in a lack of preparation or pent-up anxiety triggered stress to overtake one's **confidence**." | 2021 Practical, Intro | NEUTRAL-CRITERION |
| A3 | "These errors can cost marks and **do not encourage the examiners to have confidence in a candidate's abilities**." (re theory errors + misspelt regions/grapes) | 2021 Practical, General comments | DOUBT |
| A4 | "Often candidates fail because they lack the **confidence** to provide in-depth analysis and fail to **persuade the examiner that they truly understand the wine**." | 2022 Practical, Intro (Peter Marks MW) | DOUBT |
| A5 | "they frequently lack **confidence** and play it safe by not truly getting 'under the skin of the wine', which would show mastery." | 2022 Practical, Intro | DOUBT |
| A6 | "you must demonstrate consistency over three days of tasting and justify your answers **convincingly and with confidence** to demonstrate you are a Master of Wine." | 2023 Practical, Intro | NEUTRAL-CRITERION |
| A7 | "When they recognize a wine, they demonstrate **confidence** by efficiently using relevant and correct evidence to prove their point." | 2023 Practical, Intro (re borderline passes) | PRAISE |
| A8 | "you will learn to have that **calm, knowing confidence** that will allow you to become a Master of Wine." | 2023 Practical, Intro | NEUTRAL-CRITERION |
| A9 | "It is **hard to feel confident about a borderline candidate** when they make obvious theory mistakes." | 2024 Practical, Intro | DOUBT |
| A10 | "calling a C[ô]tes du Rh[ô]ne (Paper 2) a Ch[â]teauneuf-du-Pape, or describing the Ruby Port in paper three as a vintage Port, **undermines the examiner's confidence**." | 2025 Practical, Intro | DOUBT |
| A11 | "It is difficult to **communicate quality in a confident way** without mentioning a likely origin, but we saw some successful answers that managed not to mention any origin…" [OCR: "withoeuvter"] | 2025 Practical, Paper 2 | NEUTRAL-CRITERION |
| A12 | "It was an insightful observation that **instilled much confidence in the eyes of the examiners**." (re the Tokaji Szamorodni "exceptional quality indicates a producer whose wines would exceed the minimum sugar levels" answer) | 2025 Practical, Paper 3 | PRAISE |
| A13 | "This **totally undermines the confidence** the examiner might have had in the candidate." (re "Vosne-Roman[é]e 1er Cru – because it has 'moderate alcohol of 15%'") | 2017 Practical, Q (Burgundy) | DOUBT |
| A14 | "qualitative terms such as 'stonking' or 'icon', **do not engender confidence**, the latter being an overused marketing term." | 2018 Practical, Intro | DOUBT |
| A15 | "the usual host of other theoretical inaccuracies that, whilst not always an absolute disaster individually, **can serve to undermine the confidence of your examiner**." | 2018 Practical, Intro | DOUBT |
| A16 | "to fall in any of them **can undermine the confidence of the examiner**. We are **looking for confidence and authority**, for answers written **convincingly and with consistency**." | 2018 Practical, Intro | NEUTRAL-CRITERION |
| A17 | "Section 'B' … the best students were both **confident** and enthusiastic about the quality of both wines but the Trinity Hill in particular." | 2018 Practical, Q (Hawkes Bay / Trinity Hill Syrah) | PRAISE |
| A18 | "it will **undermine credibility** of the rest of the paper's discussion. Candidates need to write from **authority** … factual errors are inexcusable." (re placing Katnook Estate in Barossa not Coonawarra) | 2018 Practical, Paper 1 | DOUBT |
| A19 | "Bullet points (or similar) … rarely make for a strong argument, and are **unlikely to inspire confidence in an examiner**." | 2019 Practical, Intro | DOUBT |
| A20 | "try to narrow the field to two or three options to avoid wasting precious time and **showing a lack of confidence**." | 2019 Practical, advice | NEUTRAL-CRITERION |
| A21 | "only a few candidates were **confident and experienced enough** to get anywhere close on the 1996 Montrose." | 2017 Practical, Q (South Africa / Montrose) | NEUTRAL-CRITERION |
| A22 | "The best answers were **confident** enough to address the obvious use of skin contact and slightly oxidative style." | 2017 Practical, Q (singleton orange wine) | PRAISE |
| A23 | "They gave us well-informed and articulate answers **written with confidence and conviction**." | 2022 Chief (Neil Tully MW) | PRAISE |
| A24 | "Don't sit the exam … unless or until you know you can **confidently** expect to pass at least one paper…" | 2024 Chief | NEUTRAL-CRITERION |
| A25 | "I … **trust** that the information contained in this report will serve as a useful guide…" | 2025 Theory, Intro | NEUTRAL (boilerplate) |
| A26 | "Misused terminology **undermines the credibility** of your response." | 2017 Theory, Intro | DOUBT |
| A27 | "credibility in the eyes of the examiners would have been **restored**." (re proof-reading careless typing errors) | 2017 Theory, Intro | NEUTRAL-CRITERION |
| A28 | "If a candidate cannot spell wine regions, winemaking terms etc., it **does not imbue much confidence in the examiner**." | 2017 Theory, advice | DOUBT |
| A29 | "those candidates that were less **confident** on the subject found this question extremely challenging." | 2017 Theory, Q | NEUTRAL-CRITERION |
| A30 | "well-prepared candidates writing with **authority and conviction** … achieved some excellent marks." | 2017 Theory, Intro | PRAISE |
| A31 | "in some cases **confidence was undermined** by ignorance of … relevant temperatures and timings." | 2017 Theory, Q | DOUBT |
| A32 | "the best papers **confidently** discussed management options open to organic/biodynamic growers…" | 2017 Theory, Q | PRAISE |
| A33 | "errors like these **undermine confidence in the candidate**." (re TCA/VA microbiology errors) | 2019 Theory | DOUBT |
| A34 | "really excellent papers written with **authority, clarity and conviction**." | 2019 Theory, Intro | PRAISE |
| A35 | "**Factual errors undermine confidence** in everything a candidate has written. Statements like 'good SO2 management' … suggest the candidate does not know the required facts." | 2023 Theory | DOUBT |
| A36 | "The question required a degree of **confidence** around technical aspects relating to minerality, which is perhaps why relatively few candidates attempted it." | 2023 Theory, Q (minerality) | NEUTRAL-CRITERION |
| A37 | "the best answers … also had the **confidence** not just to discuss whether the term was misused … but also to express definite opinions…" | 2023 Theory, Q (minerality) | PRAISE |
| A38 | "such mistakes **undermine confidence in everything a candidate has written**." (re SO2 given in grammes per litre) | 2024 Theory | DOUBT |
| A39 | "the candidates must show they can use correct technical terminology, figures and timing to **add credibility to their answer**." | 2024 Theory, Q | NEUTRAL-CRITERION |
| A40 | "Confusions between pH and acidity, or bacteria and yeasts, **further weakened technical credibility**, with superficial statements such as 'MLF softens acidity' left unexplained." | 2025 Theory | DOUBT |
| A41 | "Many candidates lacked the **confidence** to answer the question directly and to argue **convincingly** which were the 'major' concerns…" | 2025 Theory, Q (ethical concerns) | DOUBT |
| A42 | "consumer **trust**, or long-term category growth…" (the only "trust" use; refers to consumer trust, not examiner trust — listed for completeness) | 2025 Theory, Q (health warnings) | NEUTRAL (off-topic referent) |

### Family B — Plausibility / Convincing / Persuasion / Conviction

| # | Verbatim quote | Source | Polarity |
|---|----------------|--------|----------|
| B1 | "Candidates … fail to **convincingly prove** your answer." (54% of marks on quality/maturity/winemaking/style/commercial) | 2022 Practical, Intro | DOUBT |
| B2 | "fail to **persuade** the examiner that they truly understand the wine." | 2022 Practical, Intro | DOUBT |
| B3 | "markers showed latitude … for well-argued and logical conclusions that referred correctly to the elements of what was in the glass." [paraphrase context for plausibility] — verbatim: "some provided greater challenges, and markers showed latitude on these wines for well-argued and logical conclusions" | 2022 Practical, Paper 1 | NEUTRAL-CRITERION |
| B4 | "the acidity across the wines was too high for this to be **plausible**." (re Pinot Gris guess) | 2021 Practical, Paper 1 Q2 | DOUBT |
| B5 | "Those who considered the USA and ended up in Australia still received some credit, however Italy … was **less plausible** and few marks could be gained." | 2021 Practical, Paper 1 Q4 | NEUTRAL-CRITERION |
| B6 | "Many students went for Grenache on W8, and **any plausible origin** could get good marks if well argued." | 2023 Practical, Paper 2 (Grenache, W8) | PRAISE |
| B7 | "whether the candidate shows **convincing logic even if wrong**, whether they recognize and clearly depict quality, style, and commercial aspects…" | 2023 Practical, Intro | NEUTRAL-CRITERION |
| B8 | "justify your answers **convincingly** and with confidence to demonstrate you are a Master of Wine." | 2023 Practical, Intro | NEUTRAL-CRITERION |
| B9 | "some candidates got good pass marks for Pinot Grigio, but with arguments in winemaking and origin that made the choice **more plausible**." | 2024 Practical, Paper 1 | PRAISE |
| B10 | "The best … referred to each of the wines drawing together a **convincing argument** with several candidates achieving full marks on this part." | 2024 Practical, Paper 2 (Pinot Noir) | PRAISE |
| B11 | "many still managed 5 or 6 marks out of the allotted 8 if their **reasoning was sound and their conclusion plausible**." | 2025 Practical, Paper 1 Q2 | PRAISE |
| B12 | "A few candidates managed to earn good points with **convincing arguments** for Cabernet Sauvignon or Merlot, placing the third wine in Bordeaux instead of Tuscany." | 2025 Practical, Paper 2 | PRAISE |
| B13 | "we do expect to see **plausible options** for a wine of that style, rather than an assumption that it is whatever the candidate has in mind." (re Cornas) | 2025 Practical, Paper 2 | NEUTRAL-CRITERION |
| B14 | "[a single feature is used to] **convince candidates of a wine's identity**, leading them to force other … characteristics … into a mismatched identity." [OCR: "import--asnotmetimes"] | 2025 Practical, Paper 2 (shoehorning) | DOUBT |
| B15 | "Thankfully, Italy was the choice of the vast majority of students and many wrote **convincing answers** to all four wines…" | 2017 Practical, Q2 | PRAISE |
| B16 | "it is hard to make a **convincing argument** using bullet points." | 2017 Practical, Intro | NEUTRAL-CRITERION |
| B17 | "answers that were let down by either **unconvincing arguments** or theoretical inaccuracies." | 2017 Practical, Q (Burgundy) | DOUBT |
| B18 | "Many students need to work on this in order to be **more convincing and authoritative**." | 2017 Practical, Q (Burgundy) | NEUTRAL-CRITERION |
| B19 | "I am **convinced** that tasting in small groups is the best (and cheapest!) way to practice." | 2017 Practical, Intro (advice; examiner's own conviction) | NEUTRAL |
| B20 | "your scripts … showed the necessary accuracy and authority to **convince us** of your excellent tasting." | 2017 Practical, Intro | PRAISE |
| B21 | "some of the conclusions were a little **implausible** – Mourv[è]dre from Cahors? Tannat from Mendoza (not Cafayate)?" | 2018 Practical, Q (Rhône-clue flight) | DOUBT |
| B22 | "Spain, South Africa and Germany were **less plausible**." (re a same-variety/origin flight) | 2018 Practical, Q | NEUTRAL-CRITERION |
| B23 | "I am **convinced** that rigorous practice combined with honest feedback is the only route to passing next time." | 2018 Practical, Intro | NEUTRAL |
| B24 | "Some candidates spent too much time on florid descriptions of wines at the expense of making a **persuasive argument**." | 2018 Practical, advice | NEUTRAL-CRITERION |
| B25 | "It is more a question of authoritative insight, clear communication of ideas and a balanced, **convincing argument** that elevate an answer to MW standard." | 2018 Practical, advice | NEUTRAL-CRITERION |
| B26 | "the candidates who performed well demonstrated both a strong technical knowledge and a writing style that **convincingly linked** what they know about production with how the wine tastes in the glass." | 2019 Practical, Paper 3 | PRAISE |
| B27 | "a significant uplift in marks will now be required from these candidates to **pass the exam convincingly**." | 2023 Chief | NEUTRAL-CRITERION |
| B28 | "Well-prepared candidates writing with authority and **conviction** … achieved some excellent marks." (also A30) | 2017 Theory, Intro | PRAISE |
| B29 | "several papers were **convincing** regarding varieties, botrytis influence and the connected climatic issues, but some erred…" | 2017 Theory, Q (sweet wines) | PRAISE/DOUBT (mixed) |
| B30 | "struggled to come up with sufficient material for a **convincing argument**." | 2017 Theory, Q (romance) | DOUBT |
| B31 | "made it difficult to then come up with a **convincing argument** that answered the question." | 2017 Theory, Q (great wine) | DOUBT |
| B32 | "the ever-present need to be able to present a **cogent and plausible argument**…" | 2019 Theory, Q (China market) | NEUTRAL-CRITERION |
| B33 | "really excellent papers written with authority, clarity and **conviction**." (also A34) | 2019 Theory, Intro | PRAISE |
| B34 | "Many near-passes lacked depth of technical **conviction** and clarity of reasoning." | 2023 Theory, Q (QC) | DOUBT |
| B35 | "the better answers … provided **convincing examples**." | 2024 Theory, Q (filtration) | PRAISE |
| B36 | "consistent values for control factors like pH led to more substantial, **convincing answers**." | 2024 Theory, Q (acidity) | PRAISE |
| B37 | "a strong **persuasive** structure supported by relevant examples and data points…" | 2024 Theory, Paper 4 | NEUTRAL-CRITERION |
| B38 | "simplistic arguments regarding 'natural' wine status or price, in isolation, which were also **unconvincing**." | 2024 Theory, Q | DOUBT |
| B39 | "creating a **persuasive** and memorable proposal with a global view…" [OCR: "ecarting"] | 2025 Theory, Q (brand) | PRAISE |
| B40 | "argue **convincingly** which were the 'major' concerns…" | 2025 Theory, Q (ethics) | DOUBT |
| B41 | "making **unconvincing** sweeping conclusions and assertions." | 2025 Theory, Q (younger consumers) | DOUBT |

### Family C — Insight / Sophistication / "Under the skin" / Thoughtful / Nuance

| # | Verbatim quote | Source | Polarity |
|---|----------------|--------|----------|
| C1 | "they frequently lack confidence and play it safe by not truly **getting "under the skin of the wine"**, which would show mastery." | 2022 Practical, Intro | DOUBT |
| C2 | "Market position questions were generally answered much more **thoughtfully** this year…" | 2022 Practical, Intro | PRAISE |
| C3 | "Syrah was the most popular answer for the two Grenache based wines … did serve to allow the really **thoughtful and experienced tasters** to stand out." | 2017 Practical, Q (Grenache flight) | NEUTRAL-CRITERION |
| C4 | "It was an **insightful observation** that instilled much confidence in the eyes of the examiners." (Tokaji Szamorodni answer) | 2025 Practical, Paper 3 | PRAISE |
| C5 | "Each of the paper chairs has written an excellent, detailed report with valuable **insights**…" | 2025 Practical, Intro | NEUTRAL (boilerplate) |
| C6 | "the MW exam does require a certain precision and **insight**, of which candidates should be very conscious. … examiners are also looking for evidence of **analytical thought**." | 2018 Practical/Theory boundary (2018 report, essay-style Q) | NEUTRAL-CRITERION |
| C7 | "the really good answers were those which delivered some **insight and analysis** as well as the bare requirements … this was not well answered due to a lack of authenticity or **credibility**." | 2018 report, Q3 (environmental credentials) | DOUBT |
| C8 | "It is more a question of **authoritative insight**, clear communication of ideas and a balanced, convincing argument that elevate an answer to MW standard." | 2018 report, advice | NEUTRAL-CRITERION |
| C9 | "a good structure to convey a **thoughtful** and cohesive argument." | 2018 report, Q | NEUTRAL-CRITERION |
| C10 | "Good papers noted more **nuanced** utility; for example, cover crops…" | 2018 report, Q (cover crops) | PRAISE |
| C11 | "I would like to thank all the practical examiners this year for their **thoughtful** exam questions…" | 2024 Practical, Intro | NEUTRAL (re examiners, not candidates) |
| C12 | "Most of those who passed answered parts 1b) and 3c) … **thoughtfully** and comprehensively…" | 2024 Practical, Paper 2 | PRAISE |
| C13 | "be able to provide **insightful answers** instead of the typical, rote responses…" (commercial questions) | 2024 Practical, Paper 1 | NEUTRAL-CRITERION |
| C14 | "The following reports by the Paper Chairs offer great **insight** and advice." | 2023 Practical, Intro | NEUTRAL (boilerplate) |
| C15 | "There was obvious knowledge, **but not enough insight**." | 2023 Theory | DOUBT |
| C16 | "For MW-level essays, it is not enough simply to report examples. We are looking for original thought and **insight**." | 2023 Theory, Q (yields) | NEUTRAL-CRITERION |
| C17 | "how important it is to understand and consider the 'why' before being able to show knowledge through **insight**…" | 2023 Theory, Q | NEUTRAL-CRITERION |
| C18 | "those who could only give a very top level, basic regurgitation of a viticulture textbook without much **insight**." | 2023 Theory, Q (sunlight/quality) | DOUBT |
| C19 | "The most **sophisticated** approaches introduced points of greater **insight**, such as distinguishing the importance of rarity and perceived versus actual ability to age…" | 2023 Theory, Q (ageing) | PRAISE |
| C20 | "If all your examples come from a student seminar … it is hard to show individual **insight** and thought." | 2024 Theory | NEUTRAL-CRITERION |
| C21 | "demonstrate a **nuanced** understanding of why a winemaker might choose to filter…" | 2024 Theory, Q (filtration) | NEUTRAL-CRITERION |
| C22 | "many lacked a more **insightful** understanding of the different filtration types…" | 2024 Theory, Q (filtration) | DOUBT |
| C23 | "This structure allowed for more critical comparisons and **thoughtful** analysis…" | 2024 Theory, Q (fortified comparison) | PRAISE |
| C24 | "Better answers offered a **nuanced** reframing of the question … The **sophisticated** minority broadened the question beyond 'vineyard vs. winery' arguments…" | 2024 Theory, Q (great wine born in vineyard) | PRAISE |
| C25 | "the best answers evidenced superb recall … in well written, **thoughtful**, clearly structured, balanced essays…" | 2024 Theory, Q (climate change) | PRAISE |
| C26 | "Personal **insight** and ability to comment on future trends based on the current situation." (stated marking criterion) | 2017 Theory, Q (optimism) | NEUTRAL-CRITERION |
| C27 | "strong analysis led to good scores, **lack of insight** and too much generalisation led to lower scores." | 2019 Theory, Q | DOUBT |
| C28 | "Examiners were looking for the ability to … demonstrate a **thoughtful** assessment of the situation and not to generalise. Just knowing the facts is not enough." | 2019 Theory, Q | NEUTRAL-CRITERION |
| C29 | "it's all about arguing your point authoritatively and **insightfully** … we are looking for **sophisticated thinking at MW level**." | 2019 Theory, Paper 5 (the 55–64 'Below Threshold' bracket) | NEUTRAL-CRITERION |
| C30 | "it is often appropriate to show the complexity and **nuance** of certain issues." | 2019 Theory, Paper 5 | NEUTRAL-CRITERION |
| C31 | "several unsubstantiated, sweeping statements that did not reflect a **considered, balanced perspective**. A **nuanced** approach was needed…" | 2019 Theory, Q (healthy lifestyle) | DOUBT |
| C32 | "candidates often showed gaps in knowledge … Stronger candidates included **thoughtful** writing, clear structure…" | 2025 Theory | PRAISE |
| C33 | "Often essays were surface-level, lacking critical thinking or industry **insight**." | 2025 Theory | DOUBT |
| C34 | "this knowledge too often comes across more as book learning and lacks analysis and **insight** from the candidate." | 2025 Theory, Paper 1 | DOUBT |
| C35 | "Dosage was evaluated with **nuance** … adding aromatic complexity through liqueur composition…" | 2025 Theory, Q (sparkling) | PRAISE |
| C36 | "These candidates demonstrated that they could **think beyond headlines**, showing a **nuanced** understanding of how ethics operate in the real-world wine industry." | 2025 Theory, Q (ethics) | PRAISE |
| C37 | "demonstrate a capacity to challenge assumptions and present a **nuanced**, balanced argument…" | 2025 Theory, Q | NEUTRAL-CRITERION |
| C38 | "may require a more **nuanced** interpretation of the information." (re rote-learned examples) | 2024 Chief | NEUTRAL-CRITERION |
| C39 | "the contents of our examiners' reports this year provide further **insight** into how this year's questions were … addressed." | 2025 Chief | NEUTRAL (boilerplate) |
| C40 | "The examiners' feedback provides valuable **insight** to how the questions might best have been approached…" | 2022 Chief | NEUTRAL (boilerplate) |

### Family D — Logic / Reasoning / Coherence / Argument / Justification

(Confidence-adjacent uses; the generic word "argument/reasoning" appears hundreds of times — only
occurrences that bear on *how reasoning earns or loses examiner trust* are catalogued.)

| # | Verbatim quote | Source | Polarity |
|---|----------------|--------|----------|
| D1 | "candidates demonstrate good tasting ability, **sound logic and deductive reasoning**, and show confidence…" | 2021 Practical, Intro | NEUTRAL-CRITERION |
| D2 | "using deductive reasoning (**funneling**) to consider a few options. This allows the examiner to **see your logic** and award marks even if your conclusion is incorrect." | 2022 Practical, Intro | NEUTRAL-CRITERION |
| D3 | "the **argument is as important as the conclusion** and is the key to passing identification questions." | 2022 Practical, Paper 1 | NEUTRAL-CRITERION |
| D4 | "If candidates concentrate on the analysis and then **draw a logical conclusion**, the marks given will be higher. The old saying that you should trust your first impression was proven wrong with this wine." | 2022 Practical, Paper 3 (Wine 5) | NEUTRAL-CRITERION |
| D5 | "Logical, well-constructed, and lucidly communicated thought processes garnered high marks." | 2021 Practical, Paper 2 Q1 (Saint-Julien) | PRAISE |
| D6 | "argued **logically** even if their conclusion was wrong instead of trying to **shoehorn** their answer." | 2023 Practical, Intro | PRAISE/DOUBT (contrast) |
| D7 | "whether the candidate shows **convincing logic even if wrong**…" | 2023 Practical, Intro | NEUTRAL-CRITERION |
| D8 | "A candidate who reads the wine correctly and **makes a logical deduction** about its origin or variety can still achieve a pass. By contrast, poor tasting ability … leads to incorrect statements about the wine's quality, style and commercial appeal." | 2025 Practical, Intro | NEUTRAL-CRITERION |
| D9 | "do not hide the answer in cryptic hints … arguments seemed to end with two or more options still considered. **A wrong answer yields more marks than an answer that is unfinished, so whatever you do: Make a choice.**" | 2021 Practical, advice | NEUTRAL-CRITERION |
| D10 | "having guessed the identity incorrectly, a lot of candidates then dropped marks by writing an answer for **what they had guessed it was, rather than referring to the wine itself**." | 2021 Practical, Paper 1 Q1 (Rhône white) | DOUBT |
| D11 | "This was a classic wine to **funnel and demonstrate reasoning** and tasting ability and the few that did this scored well." | 2021 Practical, Paper 1 Q4 (Pinot Gris) | NEUTRAL-CRITERION |
| D12 | "Many invented attributes based on what they had decided the wine was, **rather than simply describing what was in the glass**. Even if candidates don't know the wine, they should **trust their palates**." | 2021 Practical, Paper 2 Q4 | DOUBT |
| D13 | "candidates could still have garnered enough marks to pass the question, but only with **logical reasoning** and accurate tasting for the quality and maturity elements." | 2018 Practical, Q | NEUTRAL-CRITERION |
| D14 | "taste like a detective; **argue like a lawyer**." (re a near-impossible-to-ID wine; "go for the first impression" explicitly *not* relevant) | 2019 Practical, Paper 3 Q3 | NEUTRAL-CRITERION |
| D15 | "It always puts **serious doubts in the mind of the examiner** when theory knowledge is lacking." (re production-method compare/contrast) | 2019 Practical, Paper 3 | DOUBT |
| D16 | "the really thoughtful and experienced tasters … [stood out]" — see C3 | 2017 Practical | — |
| D17 | "the overuse of copying and pasting … creates **considerable doubt in the mind of the reader**." | 2024 Practical, Intro | DOUBT |
| D18 | "many … tried to **shoehorn** the wines into a region/style that simply wasn't logical. A lot of points could have been gained from simply **describing what was in the glass** even if the region was unknown." | 2024 Practical, Paper 3 Q2 (Jura) | DOUBT |
| D19 | "Often a candidate will latch onto a single feature … and then justify that initial assumption by **forcing the wine's components or structure to fit it. We call this shoehorning**…" | 2025 Practical, Intro | DOUBT |
| D20 | "there was a feeling of trying to **second guess the examiners' choices** and little demonstration of knowledge of where Grenache wine is made." | 2023 Practical, Paper 2 (Grenache) | DOUBT |
| D21 | "It is dangerous to **second-guess examiners**; much better to just look at what's in the glass." | 2019 Practical, advice | NEUTRAL-CRITERION |
| D22 | "the wines chosen **can never be guessed at**. Studies of what … is likely to 'come up' are likely to be a waste of time." | 2019 Practical, Intro | NEUTRAL-CRITERION |
| D23 | "praised candidates who were able to provide analysis and **insight in a well-structured and focused answer** whilst condemning those whose **arguments were hard to follow**, too long and rambling." | 2017 Theory, Q | PRAISE/DOUBT |
| D24 | "requires **reasoned argument** and rigorous cross-referencing!" (re not accepting a winemaker's claim at face value) | 2023 Theory | NEUTRAL-CRITERION |
| D25 | "it was essential that answers offered a clear, **logical** and balanced argument…" | 2024 Theory, Q (climate change) | NEUTRAL-CRITERION |
| D26 | "There was a lot of **shoehorning** … candidates shoehorning a limited range of examples into all of their essays, regardless of their relevance." | 2023 Theory, Intro | DOUBT |

### Family E — Doubt / Guessing / Playing-it-safe (the negative pole, behavioral)

(Several entries above are also DOUBT-tagged; this section isolates the *guessing / safety / panic*
behaviors specifically named as eroding examiner trust.)

| # | Verbatim quote | Source | Polarity |
|---|----------------|--------|----------|
| E1 | "there is a tendency for less successful candidates to **go with their first impression** based upon one or two pieces of evidence and then **write an answer to fit that assumption**." | 2022 Practical, Intro | DOUBT |
| E2 | "they frequently lack confidence and **play it safe**…" (see C1) | 2022 Practical, Intro | DOUBT |
| E3 | "The old saying that you should **trust your first impression was proven wrong** with this wine." | 2022 Practical, Paper 3 (Wine 5) | DOUBT |
| E4 | "most trying to **guess the vintage** by evaluating the state of maturity. … This part of the question effectively weeded out those candidates with too little tasting experience." | 2021 Practical, Paper 2 Q1 | DOUBT |
| E5 | "they could not reliably identify the wine's components — alcohol, acidity, tannin and residual sugar. Often a candidate will **latch onto a single feature** … and then justify that initial assumption by forcing…" | 2025 Practical, Intro | DOUBT |
| E6 | "when faced with the unknown, **some panicked**." | 2025 Practical, Paper 2 | DOUBT |
| E7 | "Candidates should **not panic** when asked to describe quality in a particular context … Instead, pause and think carefully…" | 2025 Practical, Intro | NEUTRAL-CRITERION |
| E8 | "many candidates failed to consider alternative possibilities and **left themselves little room to earn marks**." | 2025 Practical, Intro | DOUBT |
| E9 | "immediately deciding that it was an amontillado and writing the answers from that. This was **not** a question where the old rule 'go for the first impression' was relevant." | 2019 Practical, Paper 3 Q3 (Wine 12) | DOUBT |
| E10 | "create a tasting system that helps you **question your first initial response**…" | 2019 Practical, advice | NEUTRAL-CRITERION |
| E11 | "where origins were **shoehorned into something that didn't always make much sense**." | 2024 Practical, Paper 1 | DOUBT |
| E12 | "Sadly, many candidates went straight for Pinot Grigio **without proper arguments** and lost many marks." | 2024 Practical, Paper 1 | DOUBT |

---

## 2 · Frequency tally

Counts are of *catalogued occurrences* above (confidence-adjacent uses; pure boilerplate like "the
reports offer great insight" is counted but flagged NEUTRAL). "Distinct reports" counts each
(year × report-type) file separately — the figure the downstream EK-update rule cares about, since it
only promotes findings backed by **multiple independent reports**.

| Lexicon family | Catalogued quotes | Distinct reports | Reports represented |
|----------------|-------------------|------------------|---------------------|
| A · Confidence / Trust / Credibility | 42 | **13** | Prac 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025; Chief 2022, 2024, 2025; Theory 2017, 2019, 2023, 2024, 2025 |
| B · Plausibility / Convincing / Conviction | 41 | **13** | Prac 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025; Chief 2023; Theory 2017, 2019, 2023, 2024, 2025 |
| C · Insight / Sophistication / Under-the-skin | 40 | **12** | Prac 2017, 2018(report), 2022, 2023, 2024, 2025; Chief 2022, 2024, 2025; Theory 2017, 2019, 2023, 2024, 2025 |
| D · Logic / Reasoning / Coherence | 26 | **9** | Prac 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025; Theory 2017, 2023, 2024 |
| E · Doubt / Guessing / Playing-it-safe | 12 | **5** | Prac 2019, 2021, 2022, 2024, 2025 |

Polarity split (whole corpus, ~161 catalogued quotes): roughly **PRAISE ≈ 33**, **DOUBT ≈ 55**,
**NEUTRAL-CRITERION ≈ 65**, plus ~8 boilerplate/off-referent NEUTRAL. The skew toward DOUBT +
NEUTRAL-CRITERION reflects that examiner reports are written primarily to *diagnose failure* and
*state the standard* — confidence language appears far more often as a thing candidates **lost** or a
rule they **must meet** than as praise of what they did right.

**Three lexicon stems are explicitly tied to examiner confidence in the *practical* reports every
year 2021–2025:** (a) the *shoehorn / force-to-fit / first-impression* failure (E-family); (b) the
*funnel / show-your-logic / make-a-choice* prescription (D-family); (c) *undermines confidence /
credibility* as the named cost of theory errors (A-family).

---

## 3 · Cross-year recurrence notes (phrases/judgments recurring across 2+ reports)

Strongest signals are those a downstream agent can cite from **multiple independent reports**. Listed
by recurrence strength; the bolded ones recur across **3+ distinct reports**.

**Recur across 3+ distinct reports (highest-confidence signals):**

1. **"[Theory] errors / factual inaccuracies *undermine confidence / credibility* in everything the
   candidate has written."** — the single most recurrent confidence judgment in the corpus.
   - 2017 Practical (A13, A15-precursor), 2018 Practical (A15, A18 "undermine credibility"),
     2017 Theory (A26), 2019 Theory (A33), 2023 Theory (A35), 2024 Theory (A38), 2021 Practical (A3),
     2024 Practical (A9), 2025 Practical (A10). **≥7 distinct reports.**

2. **"Funnel / show your logic / a wrong-but-well-reasoned answer still scores; describe the glass
   even when you can't ID."** — the prescriptive inverse of shoehorning.
   - 2022 Practical (D2), 2021 Practical (D9 "Make a choice", D11), 2023 Practical (D6, B6),
     2024 Practical (D18), 2025 Practical (B11, D8), 2019 Practical (D14 "argue like a lawyer"),
     2018 Practical (D13). **≥7 distinct reports.**

3. **"Shoehorning / forcing the wine to a premature identity" named as a confidence-destroyer.**
   - 2023 Practical (D6, "shoehorn their answer"), 2024 Practical (D18, E11), 2025 Practical (D19
     "We call this shoehorning", B14), 2023 Theory (D26, examples shoehorned). **4 distinct reports**
     (the *word* "shoehorn"); the underlying *first-impression / write-to-fit* behavior also in 2022
     Practical (E1) and 2019 Practical (E9) → **6 reports** for the behavior.

4. **"Convincing / conviction / authority" as the register of a passing answer.**
   - 2017 Practical (B18, B20), 2018 Practical (A16, B25), 2019 Practical (B26), 2022 Practical (B1–B2),
     2023 Practical (A6, B8), 2022 Chief (A23), 2017 Theory (A30/B28), 2019 Theory (A34/B33).
     **≥7 distinct reports.**

5. **"Insight / not enough insight" as the pass-vs-distinction (and sometimes pass-vs-fail) line.**
   - 2018 report (C6–C8), 2022 Practical (C1 under-the-skin), 2025 Practical (C4), 2023 Theory (C15–C19),
     2024 Theory (C20–C25), 2017 Theory (C26), 2019 Theory (C27–C29), 2025 Theory (C32–C34).
     **≥6 distinct reports** (heavily Theory-weighted; in the Practical the cognate is "under the skin"
     / "thoughtful tasters").

**Recur across exactly 2 distinct reports (strong but narrower):**

6. **"Misspelling / unprofessional language does not inspire / engender confidence."** — 2017 Theory
   (A28), 2018 Practical (A14), 2021 Practical (A3). (Borderline 3.)

7. **"Lack of confidence shows as hedging / failing to narrow / leaving options open."** — 2019
   Practical (A20 "narrow to two or three … showing a lack of confidence"; D9 unfinished answers),
   2022 Practical (A4–A5). 2 reports.

8. **"Sophisticated / nuanced thinking at MW level"** as the explicit top-band descriptor. — 2019
   Theory (C29 "sophisticated thinking at MW level"), 2023 Theory (C19), 2024 Theory (C24). 3 reports
   (Theory only).

9. **"Second-guessing the examiners is dangerous; just read the glass."** — 2019 Practical (D21),
   2023 Practical (D20). 2 reports.

**Verbatim phrase that recurs near-identically (the strongest single lexical match):**
- **"undermine(s) confidence in everything a candidate has written"** — appears almost word-for-word
  in **2023 Theory** (A35) and **2024 Theory** (A38), and as the same idea ("undermine the confidence
  of your examiner", "undermine credibility of the rest of the paper") in **2018 Practical** (A15,
  A18). This is the closest thing in the corpus to a fixed examiner formula and is the prime candidate
  for a high-confidence EK promotion.
- **"under the skin of the wine"** — verbatim in **2022 Practical** (C1) and corroborated as the
  distinction-marker by the **2025 Practical** Tokaji exemplar (C4, "insightful observation that
  instilled much confidence"). 2 Practical reports.

---

*Mining complete. No interpretation of mechanism is offered here by design — downstream agents build
the model. Source: `docs/examiners reports/extracted_txt/` (18 reports swept; 2021/2022 Theory stubs
excluded). Aligned terminology with `outputs/research/examiner_confidence_model.md` and
`outputs/research/examiner_objectives.md`.*
