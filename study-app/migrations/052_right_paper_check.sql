-- Migration 052: "Right Paper Check" — the in-the-moment candidate flag for a wine of the wrong
-- colour/style for the paper, plus a persisted per-wine colour key.
--
-- Additive / idempotent — safe to run repeatedly. MUST be applied to Neon.

-- (a) FLAG WINE POSITION. The candidate flag modal, when the reason is 'wrong_colour_for_paper',
--     shows a per-wine selector so the candidate marks WHICH wine in the flight is wrong. That slot
--     (1-based wine position within the served flight) is recorded here. Nullable: every other flag
--     reason, and any historical row, leaves it NULL.
ALTER TABLE question_flags ADD COLUMN IF NOT EXISTS wine_position INT;

-- (b) PERSISTED COLOUR KEY (R-COLOUR). classifyWineColour() derives a wine's colour/style from its
--     existing style/style_category/label/variety fields; where a record lacks a reliable colour key
--     it is resolved once (LLM classification, strict enum white|red|rose|orange|sparkling|sweet|
--     fortified) and persisted here so it is only computed once. Guarded so the migration does not
--     fail if wine_bank has not yet been created on this database.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wine_bank') THEN
    ALTER TABLE wine_bank ADD COLUMN IF NOT EXISTS colour TEXT;
    BEGIN
      ALTER TABLE wine_bank ADD CONSTRAINT wine_bank_colour_check
        CHECK (colour IS NULL OR colour IN ('white','red','rose','orange','sparkling','sweet','fortified'));
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
