/**
 * What each paper is allowed to contain, in the words we hand to a model.
 *
 * This prose lived as a local const inside buildQuestionGenerationPrompt, so the ONLY generator that
 * knew what a paper may contain was the question generator. The Live Tasting shopping-brief generator
 * — which tells a candidate which bottles to go and BUY — was never told, and produced a Paper 1
 * flight of botrytis / passerillage / late-harvest wines (Coach bug, attempt 413). A candidate
 * following that brief spends real money on three Paper 3 wines.
 *
 * So the scope is stated once, here, and imported by every prompt that names a paper. The strings are
 * byte-identical to the ones the generation prompt used before the extraction — this is a move, not a
 * rewrite, and generation behaviour is unchanged.
 *
 * The wine-level enforcement of the same policy lives in validatePaperColour (R-COLOUR, per wine) and
 * validatePaperScope (per flight); those judge resolved wines, this describes the target in advance.
 */
export function paperScopeProse(paper: number): string {
  return paper === 1
    ? "WHITE STILL WINES ONLY. Every wine in this question MUST be a white still wine. No reds, no rosés, no sparkling, no fortified, no sweet wines (unless a white wine with residual sugar like Riesling Spätlese or Vouvray demi-sec)."
    : paper === 2
      ? "RED STILL WINES ONLY. Every wine in this question MUST be a red still wine. No whites, no rosés, no sparkling, no fortified. All wines must be made from red grape varieties."
      // Measured over the 51 real P3 questions in the corpus: 0 are entirely still dry, 42 (82%)
      // contain at least one still dry wine, 9 contain none. 32 of 180 real P3 wines (17.8%) are
      // still dry, and not as exotica — Nuits St Georges 1er Cru, Bandol, Saint-Romain and Riesling
      // Trocken all appear at curveball_level=low.
      //
      // The old text said "No standard still dry whites or reds", which contradicted both the real
      // exam and this prompt's own P3 style block (which lists still_dry at 20% and can make it the
      // required category). When it did, the model was told to produce still dry wines and that
      // still dry wines were an automatic failure.
      : "A MIXED PAPER: sparkling, fortified, sweet, rosé, oxidative, orange AND still dry wines all belong here. Still dry wines are NOT excluded — 82% of real Paper 3 questions contain at least one, including mainstream examples like Nuits St Georges 1er Cru and Alsace Pinot Gris Grand Cru. The ONE thing Paper 3 never is: a flight made ENTIRELY of standard still dry wines, because that is simply a Paper 1 or Paper 2 question. Every flight must carry at least one wine that is sparkling, fortified, sweet, rosé, oxidative or orange.";
}

/**
 * The one-line colour/style summary used where the full paragraph is too long — a shopping brief's
 * user turn, for instance, which previously said only "Paper 1 (white still wines)" and let the
 * question family override it.
 */
export function paperScopeShort(paper: number): string {
  return paper === 1
    ? "white STILL wines only — dry or off-dry, never sparkling, fortified or dessert-sweet"
    : paper === 2
      ? "red STILL wines only — never sparkling, fortified or dessert-sweet"
      : "sparkling, fortified, sweet, rosé, oxidative, orange and still dry wines all belong here";
}
