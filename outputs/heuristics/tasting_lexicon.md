# MW Tasting Lexicon (reference for the mock-answer-writer)

> Generated from `study-app/src/lib/prompts/tasting-lexicon.json` by `scripts/sync-tasting-lexicon.mjs`.
> Do not edit by hand — edit the JSON and re-run the sync.

Use this as a **register palette**, not a checklist: pick precise, examiner-grade descriptors and vary
them across dimensions. Precision beats density — examiners penalise word-salad.

## Descriptor palette by dimension

- **COLOUR**: clarity, brilliant, bright, deep, dark, translucent, flushed, viscosity, limpid, mid-depth, opaque, light, dull, cloudy, pale
- **FRUIT**: forward, ripe, opulent, tropical, rich, generous, honeyed, supple, primary, secondary, exotic, concentrated, grassy, vinous, leafy, sinewy, thin, lean, stemmy, appley, citrus, intensity, floral, clean, steely
- **ACIDITY**: low, moderate, high, fresh, crisp, pronounced, marked, searing, racy, malic, tartaric, tart, pure, astringent, flabby, soft, zesty, steely, broad, bracing, sharp, round, mouthwatering, tangy, juicy, linear, taut
- **TANNIN**: soft, light, moderate, high, ripe, firm, rounded, silky, velvety, fine, grippy, broad, dry, dusty, aggressive, astringent, hard, coarse, harsh, green, oaky, stalky, chalky, powdery, grainy, smooth, chewy, taut, angular, austere, mouthcoating, supportive, forward
- **ALCOHOL**: low 7-10, moderate, high 13+, generous, burning, hot, spirity, watery
- **TEXTURE**: smooth, silky, opulent, velvety, rich, round, succulent, supple, persistent, viscous, voluptuous, soft, mineral, herbaceous, lean, dilute, clean, dry, sweet, flat, full bodied, flabby
- **STRUCTURE**: light, delicate, supple, restrained, generous, firm, forward, broad, depth, elegant, fine, taut, rigid, hard, unbalanced, steely, low intensity, muscular, neutral, subdued, weighty, fat, over-extracted, 1-dimensional, fractured, angular, backward, limp
- **QUALITY**: integrated, balanced, harmonious, elegant, finesse, refined, length, prolonged, aftertaste, voluptuous, silky, racy, restrained, lean, unbalanced, clumsy, dull, flat, austere, dilute, short, premium, mid-market, mid-range, bulk
- **MATURITY**: youthful, young, immature, fresh, vibrant, lively, developed, evolved, peaking, closed, mature, fading, drying out, dumb, tired, past it, aged, potential
- **OAK**: toasted, buttery, integrated, cedar, coconut, vanillin, mocha, sweet
- **NOSE**: spicy, closed, open, oxidised, reductive, earthy, gamey, overt, sappy, grapey, tropical, pungent
- **MINERALITY**: chalky, stony, flinty, slatey, saline, salty, steely, smoky, gunflint, graphite, earthy
- **FAULTS**: mousy, mouse cage, rodent urine, attenuated fruit, lack of fruit, rancid, nauseating, cracker, basmati, popcorn, brett, animal, stable, TCA, corked, oxidised, reductive, volatile acidity, ethyl acetate

## Rhetorical register

- **POSITIVES — quality, positive register**: striking, lively, vivid, prominent, defined, distinctive, appealing, attractive, rich, silky, racy, positive, intense, concentrated, persistent, pronounced, prolonged, integrated, harmonious, balanced, deep
- **NEGATIVES — quality, negative register**: lack of, hollow, devoid of, subdued, lacks, restrained, flabby, undefined, dull, neutral, low key, obtrusive, shallow
- **SUGGESTS — inference verbs (evidence is suggestive, not proven)**: indicates, indicative of, points to, suggests, illustrates, demonstrates, expresses, establishes, shows, signifies, emphasises, impression, potentially, consistent with, composition, typicity, emphasis on, incisive use of, evidence of, expansive
- **PROVES — confirmation verbs (evidence is conclusive)**: confirms, supports, shows, highlights, underlines, denotes, reveals, influenced by, defines, signifies
- **ODDS & SODS — connective nouns**: nuance, notes, block-busting, over-tones, characteristics, envelopes, weight, structure, texture, definition, provenance, integral
- **PREFERRED_ARGUMENT — funnel connectives & quality-tier phrasing examiners reward**: what it might have been, but was not, this rules out X because, I would expect to see, narrows to, consistent with X, not Y, unlike wine 2, in contrast to the flight, at the top of its appellation, name the legal tier (Grand Cru Classe / DOCG / Pradikat / VORS), drink now to {year}, will improve {n} years then hold {n}, state acidity as level THEN quality (e.g. high, and racy rather than broad), state tannin as level THEN texture (e.g. high, fine-grained and chalky), qualify minerality with a concrete modifier (flinty/chalky/saline), never bare, attribute acid character to acid type (malic = zesty/fresh; tartaric = steely/racy; lactic = broad), place a mousy taint in the aftertaste, after expectoration, not on the nose
- **DISLIKED — examiner-penalised wording (model answers avoid it; the grader scans candidate answers for it)**: stonking, icon, Goldilocks, definitely, obviously, matured for many years, aged well, sell it in a steakhouse, by-the-glass to affluent connoisseurs, pairs well with red meat, phantom oak, bullet-point arguments, good (no tier - name the official tier instead), very good (no context), PREMIUM (caps, no context), confirms (use only when evidence is conclusive), will age (give a concrete window), minerality (bare, unqualified - name flinty/chalky/saline or the structural correlate), minerality as evidence of lees work (reverses the real correlates - reduction, high acid, no oak), piercing (non-diagnostic filler - carries no varietal or regional information), bright (non-diagnostic filler - used equally across all styles), firm (non-diagnostic as an acidity term - used equally across all styles), 25-30% of tasters are anosmic to mousiness (refuted - true anosmia is near zero)

## The deductive rule (mirror the funnelling principle)
Match the verb to the strength of the evidence. Use an **inference verb** (SUGGESTS list) when the
evidence implies but does not prove a call ("high acid + low alcohol *suggests* a cool climate");
reserve a **confirmation verb** (PROVES list) for conclusive evidence ("marked petrol *confirms*
mature Riesling"). Never write "X confirms Y" for a likely-but-unproven call — that is over-claiming.
