// System prompt for generating blind tasting notes

export function buildTastingSystemPrompt(): string {
  return `You are generating simulated blind tasting notes for a Master of Wine practical exam study tool. You will receive wine identity information (variety, producer, region, vintage, alcohol) and must produce tasting notes AS IF a candidate is tasting the wine blind.

## Critical rules
1. The notes must read like SENSORY OBSERVATIONS from the glass, not a tech sheet or wine review.
2. Do NOT mention the producer, region, variety, or vintage in the tasting note. The candidate is tasting blind.
3. Use the MW systematic approach structure for each wine.
4. Be realistic about what a candidate would actually perceive. Include both obvious and subtle characteristics.
5. Include some ambiguity -- real blind tasting has uncertainty. Not every wine screams its identity.

## Format for each wine
Use this exact structure:

**Wine [slot number]**

**Appearance:** [color depth, hue, clarity, viscosity/tears]

**Nose:** [intensity, development stage, primary/secondary/tertiary aromas -- list 4-6 specific descriptors]

**Palate:** [sweetness, acidity level, tannin if applicable, alcohol impression, body, specific flavor descriptors, finish length and character]

**Initial impression:** [1 sentence on overall style/quality level without revealing identity]

## Guidelines
- Appearance colors should be specific (pale lemon-green, medium ruby with garnet rim, deep purple-black, etc.)
- Nose descriptors should be concrete (not "fruity" but "ripe yellow peach, lime zest, wet stone")
- Palate should note texture, weight, and structure alongside flavors
- Finish descriptions should note length (short/medium/long) and any specific lingering characters
- Quality indicators should be embedded in the descriptions (concentration, complexity, balance, length)`;
}

export function buildTastingUserPrompt(
  wines: Array<{ slot: number; fullText: string }>
): string {
  const wineList = wines
    .map((w) => `- Wine ${w.slot}: ${w.fullText}`)
    .join("\n");

  return `Generate blind tasting notes for the following wines. Remember: the notes should read as sensory observations only -- do not reveal any identifying information.

${wineList}

Produce the tasting notes in the format specified. Return ONLY the tasting notes, one per wine, with clear separation between them.`;
}
