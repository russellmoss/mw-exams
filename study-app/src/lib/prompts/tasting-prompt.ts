// System prompt for generating blind tasting notes

export function buildTastingSystemPrompt(): string {
  return `You are generating simulated blind tasting notes for a Master of Wine practical exam study tool. You will receive wine identity information (variety, producer, region, vintage, alcohol) and must produce tasting notes AS IF a candidate is tasting the wine blind.

## Critical rules
1. The notes must read like SENSORY OBSERVATIONS from the glass, not a tech sheet or wine review.
2. Do NOT mention the producer, region, country, appellation, variety, vintage, or any origin adjective such as Italian, French, Spanish, Californian, Old World, New World, northern, southern, coastal, mountain, valley, or island. The candidate is tasting blind.
3. Use the MW systematic approach structure for each wine.
4. Be realistic about what a candidate would actually perceive. Include both obvious and subtle characteristics.
5. Include some ambiguity -- real blind tasting has uncertainty. Not every wine screams its identity.
6. Do NOT mention legs, tears, or visual viscosity. Appearance may cover colour depth, hue, and clarity only.
7. Every note MUST include an explicit **Structure** block covering perceived alcohol, acidity, tannin, and residual sugar. Examiners rate this hard structural evidence above the flavour profile ("hard evidence like alcohol and sugar are often more reliable than the flavour profile"), and a candidate cannot lead with structure if it is missing from the glass.
8. Express alcohol as it is PERCEIVED in the room -- warmth, weight, and body with an estimated band (e.g. "warm, moderate-high, ~14%") -- NEVER as a bare label figure or a spec-sheet number. The candidate has no access to the label. Give a range/impression, not a precise stated ABV.

## Format for each wine
Use this exact structure:

**Wine [slot number]**

**Appearance:** [color depth, hue, clarity]

**Structure:** [perceived alcohol as warmth/weight with an estimated band e.g. "warm, medium-plus body, ~14%"; acidity level; tannin level and quality if applicable, otherwise "n/a"; residual sugar / sweetness impression]

**Nose:** [intensity, development stage, primary/secondary/tertiary aromas -- list 4-6 specific descriptors]

**Palate:** [sweetness, acidity level, tannin if applicable, alcohol impression, body, specific flavor descriptors, finish length and character]

**Initial impression:** [1 sentence on structure, quality level, maturity, and readiness without revealing identity or origin]

## Guidelines
- Appearance colors should be specific (pale lemon-green, medium ruby with garnet rim, deep purple-black, etc.)
- The Structure block is mandatory and must always carry a perceived-alcohol/warmth reading with an estimated band, because alcohol read alongside acidity is a primary marker for deducing climate and origin. Do not omit it, and do not reduce it to a label ABV.
- The Structure block must also always carry an explicit acidity level. With alcohol fixed, acidity is the axis that separates a cool-climate origin from a warm one, so a note giving one but not the other leaves the candidate without the discriminator. "Fresh" or "crisp" is a flavour impression, not an acidity reading.
- If a wine is sparkling and you describe its bead, GRADE the mousse rather than merely noting it: "a fine, persistent bead" reads traditional-method, "a coarse, frothy mousse" reads tank-method, and that contrast is how the candidate infers method of production. Never describe the ABSENCE of bubbles on a still wine — simply omit the mousse.
- Nose descriptors should be concrete (not "fruity" but "ripe yellow peach, lime zest, wet stone")
- Palate should note texture, weight, and structure alongside flavors
- Finish descriptions should note length (short/medium/long) and any specific lingering characters
- Quality indicators should be embedded in the descriptions (concentration, complexity, balance, length)
- Never write that a wine smells, tastes, looks, or feels like it comes from a place or country. Use sensory evidence only.`;
}

export function buildTastingUserPrompt(
  wines: Array<{ slot: number; fullText: string }>,
  wineProfiles?: Record<string, {
    tasting_profile?: {
      appearance?: string;
      nose_summary?: string;
      palate_summary?: string;
      structural_summary?: string;
      // No `sources` here by design — see the note at the render site below.
    } | null;
    structural_tags?: string[];
    style_category?: string;
    oak_signature?: string;
    rs_level?: string;
    grape_varieties?: string[];
    quality_tier?: string;
    confidence?: string;
  }>,
  corrections?: string[]
): string {
  const wineList = wines
    .map((w) => {
      let line = `- Wine ${w.slot}: ${w.fullText}`;
      const profile = wineProfiles?.[String(w.slot)];
      if (profile) {
        const tp = profile.tasting_profile;
        if (tp?.appearance || tp?.nose_summary || tp?.palate_summary) {
          line += `\n  [REFERENCE PROFILE from authoritative sources — use this to ensure accuracy for THIS specific wine:`;
          if (tp.appearance) line += `\n   Appearance: ${tp.appearance}`;
          if (tp.nose_summary) line += `\n   Nose: ${tp.nose_summary}`;
          if (tp.palate_summary) line += `\n   Palate: ${tp.palate_summary}`;
          // Source URLs are deliberately NOT passed. They name the château, so putting them in the
          // prompt that writes the CANDIDATE-FACING blind note is a leak risk for zero benefit — the
          // note is sensory-only and cites nothing. Provenance lives on the profile for the reveal.
          line += `]`;
        } else if (profile.structural_tags?.length || profile.style_category) {
          const parts: string[] = [];
          if (profile.style_category) parts.push(`style=${profile.style_category}`);
          if (profile.structural_tags?.length) parts.push(`structure=${profile.structural_tags.join("/")}`);
          if (profile.oak_signature) parts.push(`oak=${profile.oak_signature}`);
          if (profile.rs_level) parts.push(`rs=${profile.rs_level}`);
          if (profile.grape_varieties?.length) parts.push(`grape=${profile.grape_varieties.join("+")}`);
          if (profile.quality_tier) parts.push(`quality=${profile.quality_tier}`);
          line += `\n  [STRUCTURAL PROFILE: ${parts.join(", ")}]`;
        }
      }
      return line;
    })
    .join("\n");

  const correctionBlock =
    corrections && corrections.length
      ? `CRITICAL CORRECTION — your previous attempt FAILED validation. Fix these EXACTLY; the appearance colour and structure MUST match each wine's real type:\n${corrections
          .map((c) => `- ${c}`)
          .join("\n")}\n\n`
      : "";

  return `Generate blind tasting notes for the following wines. Remember: the notes should read as sensory observations only -- do not reveal any identifying information, country, region, origin adjective, or legs/tears language.

${correctionBlock}${wineProfiles && Object.keys(wineProfiles).length > 0 ? `IMPORTANT: Some wines have reference profiles from authoritative sources. Use these to ensure your sensory descriptions are accurate for the SPECIFIC wine (not generic for the variety). A deep, opaque old-vine Syrah should not be described as "pale ruby." An oxidatively-aged Vin Santo should not be described as "pale gold." Match your descriptions to the real wine.\n\n` : ""}${wineList}

Produce the tasting notes in the format specified. Return ONLY the tasting notes, one per wine, with clear separation between them.`;
}
