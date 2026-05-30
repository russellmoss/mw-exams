# MW Tasting Lexicon (reference for the mock-answer-writer)

> Generated from `study-app/src/lib/prompts/tasting-lexicon.json` by `scripts/sync-tasting-lexicon.mjs`.
> Do not edit by hand — edit the JSON and re-run the sync.

Use this as a **register palette**, not a checklist: pick precise, examiner-grade descriptors and vary
them across dimensions. Precision beats density — examiners penalise word-salad.

## Descriptor palette by dimension

- **COLOUR**: clarity, brilliant, bright, deep, dark, translucent, flushed, viscosity, limpid, mid-depth, opaque, light, dull, cloudy, pale
- **FRUIT**: forward, ripe, opulent, tropical, rich, generous, honeyed, supple, primary, secondary, exotic, concentrated, grassy, vinous, leafy, sinewy, thin, lean, stemmy, appley, citrus, intensity, floral, clean, steely
- **ACIDITY**: low, moderate, high, fresh, crisp, pronounced, marked, searing, racy, malic, tartaric, tart, pure, astringent, flabby, soft
- **TANNIN**: soft, light, moderate, high, ripe, firm, rounded, silky, velvety, fine, grippy, broad, dry, dusty, aggressive, astringent, hard, coarse, harsh, green, oaky, stalky
- **ALCOHOL**: low 7-10, moderate, high 13+, generous, burning, hot, spirity, watery
- **TEXTURE**: smooth, silky, opulent, velvety, rich, round, succulent, supple, persistent, viscous, voluptuous, soft, mineral, herbaceous, lean, dilute, clean, dry, sweet, flat, full bodied, flabby
- **STRUCTURE**: light, delicate, supple, restrained, generous, firm, forward, broad, depth, elegant, fine, taut, rigid, hard, unbalanced, steely, low intensity, muscular, neutral, subdued, weighty, fat, over-extracted, 1-dimensional, fractured, angular, backward, limp
- **QUALITY**: integrated, balanced, harmonious, elegant, finesse, refined, length, prolonged, aftertaste, voluptuous, silky, racy, restrained, lean, unbalanced, clumsy, dull, flat, austere, dilute, short, premium, mid-market, mid-range, bulk
- **MATURITY**: youthful, young, immature, fresh, vibrant, lively, developed, evolved, peaking, closed, mature, fading, drying out, dumb, tired, past it, aged, potential
- **OAK**: toasted, buttery, integrated, cedar, coconut, vanillin, mocha, sweet
- **NOSE**: spicy, closed, open, oxidised, reductive, earthy, gamey, overt, sappy, grapey, tropical, pungent

## Rhetorical register

- **POSITIVES — quality, positive register**: striking, lively, vivid, prominent, defined, distinctive, appealing, attractive, rich, silky, racy, positive, intense, concentrated, persistent, pronounced, prolonged, integrated, harmonious, balanced, deep
- **NEGATIVES — quality, negative register**: lack of, hollow, devoid of, subdued, lacks, restrained, flabby, undefined, dull, neutral, low key, obtrusive, shallow
- **SUGGESTS — inference verbs (evidence is suggestive, not proven)**: indicates, indicative of, points to, suggests, illustrates, demonstrates, expresses, establishes, shows, signifies, emphasises, impression, potentially, consistent with, composition, typicity, emphasis on, incisive use of, evidence of, expansive
- **PROVES — confirmation verbs (evidence is conclusive)**: confirms, supports, shows, highlights, underlines, denotes, reveals, influenced by, defines, signifies
- **ODDS & SODS — connective nouns**: nuance, notes, block-busting, over-tones, characteristics, envelopes, weight, structure, texture, definition, provenance, integral

## The deductive rule (mirror the funnelling principle)
Match the verb to the strength of the evidence. Use an **inference verb** (SUGGESTS list) when the
evidence implies but does not prove a call ("high acid + low alcohol *suggests* a cool climate");
reserve a **confirmation verb** (PROVES list) for conclusive evidence ("marked petrol *confirms*
mature Riesling"). Never write "X confirms Y" for a likely-but-unproven call — that is over-claiming.
