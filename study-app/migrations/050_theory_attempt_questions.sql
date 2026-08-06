-- user_attempts.question_id is a foreign key to the practical generated_questions table.
-- Theory questions deliberately live outside that table, so give them their own registry and
-- foreign-key column instead of weakening practical referential integrity or inserting fake
-- practical rows. Every statement is safe to re-run after a partial migration.

CREATE TABLE IF NOT EXISTS theory_questions (
  question_id TEXT PRIMARY KEY,
  CONSTRAINT theory_questions_id_check
    CHECK (question_id LIKE 'th\_%' ESCAPE '\')
);

INSERT INTO theory_questions (question_id) VALUES
  ('th_2016_p1_q1'), ('th_2016_p1_q2'), ('th_2016_p1_q3'), ('th_2016_p1_q4'), ('th_2016_p1_q5'), ('th_2016_p1_q6'), ('th_2016_p2_q1'), ('th_2016_p2_q2'), ('th_2016_p2_q3'),
  ('th_2016_p2_q4'), ('th_2016_p2_q5'), ('th_2016_p2_q6'), ('th_2016_p3_q1'), ('th_2016_p3_q2'), ('th_2016_p3_q3'), ('th_2016_p3_q4'), ('th_2016_p4_q1'), ('th_2016_p4_q2'),
  ('th_2016_p4_q3'), ('th_2016_p4_q4'), ('th_2016_p4_q5'), ('th_2016_p4_q6'), ('th_2016_p5_q1'), ('th_2016_p5_q2'), ('th_2016_p5_q3'), ('th_2016_p5_q4'), ('th_2016_p5_q5'),
  ('th_2017_p1_q1'), ('th_2017_p1_q2'), ('th_2017_p1_q3'), ('th_2017_p1_q4'), ('th_2017_p1_q5'), ('th_2017_p1_q6'), ('th_2017_p2_q1'), ('th_2017_p2_q2'), ('th_2017_p2_q3'),
  ('th_2017_p2_q4'), ('th_2017_p2_q5'), ('th_2017_p2_q6'), ('th_2017_p3_q1'), ('th_2017_p3_q2'), ('th_2017_p3_q3'), ('th_2017_p3_q4'), ('th_2017_p4_q1'), ('th_2017_p4_q2'),
  ('th_2017_p4_q3'), ('th_2017_p4_q4'), ('th_2017_p4_q5'), ('th_2017_p4_q6'), ('th_2017_p5_q1'), ('th_2017_p5_q2'), ('th_2017_p5_q3'), ('th_2017_p5_q4'), ('th_2017_p5_q5'),
  ('th_2018_p1_q1'), ('th_2018_p1_q2'), ('th_2018_p1_q3'), ('th_2018_p1_q4'), ('th_2018_p1_q5'), ('th_2018_p1_q6'), ('th_2018_p2_q1'), ('th_2018_p2_q2'), ('th_2018_p2_q3'),
  ('th_2018_p2_q4'), ('th_2018_p2_q5'), ('th_2018_p2_q6'), ('th_2018_p3_q1'), ('th_2018_p3_q2'), ('th_2018_p3_q3'), ('th_2018_p3_q4'), ('th_2018_p4_q1'), ('th_2018_p4_q2'),
  ('th_2018_p4_q3'), ('th_2018_p4_q4'), ('th_2018_p4_q5'), ('th_2018_p4_q6'), ('th_2018_p5_q1'), ('th_2018_p5_q2'), ('th_2018_p5_q3'), ('th_2018_p5_q4'), ('th_2018_p5_q5'),
  ('th_2019_p1_q1'), ('th_2019_p1_q2'), ('th_2019_p1_q3'), ('th_2019_p1_q4'), ('th_2019_p1_q5'), ('th_2019_p1_q6'), ('th_2019_p2_q1'), ('th_2019_p2_q2'), ('th_2019_p2_q3'),
  ('th_2019_p2_q4'), ('th_2019_p2_q5'), ('th_2019_p2_q6'), ('th_2019_p3_q1'), ('th_2019_p3_q2'), ('th_2019_p3_q3'), ('th_2019_p3_q4'), ('th_2019_p4_q1'), ('th_2019_p4_q2'),
  ('th_2019_p4_q3'), ('th_2019_p4_q4'), ('th_2019_p4_q5'), ('th_2019_p4_q6'), ('th_2019_p5_q1'), ('th_2019_p5_q2'), ('th_2019_p5_q3'), ('th_2019_p5_q4'), ('th_2019_p5_q5'),
  ('th_2021_p1_q1'), ('th_2021_p1_q2'), ('th_2021_p1_q3'), ('th_2021_p1_q4'), ('th_2021_p1_q5'), ('th_2021_p1_q6'), ('th_2021_p2_q1'), ('th_2021_p2_q2'), ('th_2021_p2_q3'),
  ('th_2021_p2_q4'), ('th_2021_p2_q5'), ('th_2021_p2_q6'), ('th_2021_p3_q1'), ('th_2021_p3_q2'), ('th_2021_p3_q3'), ('th_2021_p3_q4'), ('th_2021_p4_q1'), ('th_2021_p4_q2'),
  ('th_2021_p4_q3'), ('th_2021_p4_q4'), ('th_2021_p4_q5'), ('th_2021_p4_q6'), ('th_2021_p5_q1'), ('th_2021_p5_q2'), ('th_2021_p5_q3'), ('th_2021_p5_q4'), ('th_2021_p5_q5'),
  ('th_2022_p1_q1'), ('th_2022_p1_q2'), ('th_2022_p1_q3'), ('th_2022_p1_q4'), ('th_2022_p1_q5'), ('th_2022_p1_q6'), ('th_2022_p2_q1'), ('th_2022_p2_q2'), ('th_2022_p2_q3'),
  ('th_2022_p2_q4'), ('th_2022_p2_q5'), ('th_2022_p2_q6'), ('th_2022_p3_q1'), ('th_2022_p3_q2'), ('th_2022_p3_q3'), ('th_2022_p3_q4'), ('th_2022_p4_q1'), ('th_2022_p4_q2'),
  ('th_2022_p4_q3'), ('th_2022_p4_q4'), ('th_2022_p4_q5'), ('th_2022_p4_q6'), ('th_2022_p5_q1'), ('th_2022_p5_q2'), ('th_2022_p5_q3'), ('th_2022_p5_q4'), ('th_2022_p5_q5'),
  ('th_2023_p1_q1'), ('th_2023_p1_q2'), ('th_2023_p1_q3'), ('th_2023_p1_q4'), ('th_2023_p1_q5'), ('th_2023_p1_q6'), ('th_2023_p2_q1'), ('th_2023_p2_q2'), ('th_2023_p2_q3'),
  ('th_2023_p2_q4'), ('th_2023_p2_q5'), ('th_2023_p2_q6'), ('th_2023_p3_q1'), ('th_2023_p3_q2'), ('th_2023_p3_q3'), ('th_2023_p3_q4'), ('th_2023_p4_q1'), ('th_2023_p4_q2'),
  ('th_2023_p4_q3'), ('th_2023_p4_q4'), ('th_2023_p4_q5'), ('th_2023_p4_q6'), ('th_2023_p5_q1'), ('th_2023_p5_q2'), ('th_2023_p5_q3'), ('th_2023_p5_q4'), ('th_2023_p5_q5'),
  ('th_2024_p1_q1'), ('th_2024_p1_q2'), ('th_2024_p1_q3'), ('th_2024_p1_q4'), ('th_2024_p1_q5'), ('th_2024_p1_q6'), ('th_2024_p2_q1'), ('th_2024_p2_q2'), ('th_2024_p2_q3'),
  ('th_2024_p2_q4'), ('th_2024_p2_q5'), ('th_2024_p2_q6'), ('th_2024_p3_q1'), ('th_2024_p3_q2'), ('th_2024_p3_q3'), ('th_2024_p3_q4'), ('th_2024_p4_q1'), ('th_2024_p4_q2'),
  ('th_2024_p4_q3'), ('th_2024_p4_q4'), ('th_2024_p4_q5'), ('th_2024_p4_q6'), ('th_2024_p5_q1'), ('th_2024_p5_q2'), ('th_2024_p5_q3'), ('th_2024_p5_q4'), ('th_2024_p5_q5'),
  ('th_2025_p1_q1'), ('th_2025_p1_q2'), ('th_2025_p1_q3'), ('th_2025_p1_q4'), ('th_2025_p1_q5'), ('th_2025_p1_q6'), ('th_2025_p2_q1'), ('th_2025_p2_q2'), ('th_2025_p2_q3'),
  ('th_2025_p2_q4'), ('th_2025_p2_q5'), ('th_2025_p2_q6'), ('th_2025_p3_q1'), ('th_2025_p3_q2'), ('th_2025_p3_q3'), ('th_2025_p3_q4'), ('th_2025_p4_q1'), ('th_2025_p4_q2'),
  ('th_2025_p4_q3'), ('th_2025_p4_q4'), ('th_2025_p4_q5'), ('th_2025_p4_q6'), ('th_2025_p5_q1'), ('th_2025_p5_q2'), ('th_2025_p5_q3'), ('th_2025_p5_q4'), ('th_2025_p5_q5')
ON CONFLICT (question_id) DO NOTHING;

ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS theory_question_id TEXT;
ALTER TABLE user_attempts ALTER COLUMN question_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_attempts_theory_question_id_fkey'
      AND conrelid = 'user_attempts'::regclass
  ) THEN
    ALTER TABLE user_attempts
      ADD CONSTRAINT user_attempts_theory_question_id_fkey
      FOREIGN KEY (theory_question_id) REFERENCES theory_questions(question_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_attempts_question_family_check'
      AND conrelid = 'user_attempts'::regclass
  ) THEN
    ALTER TABLE user_attempts
      ADD CONSTRAINT user_attempts_question_family_check CHECK (
        (mode = 'theory' AND question_id IS NULL AND theory_question_id IS NOT NULL)
        OR
        (mode <> 'theory' AND question_id IS NOT NULL AND theory_question_id IS NULL)
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE user_attempts VALIDATE CONSTRAINT user_attempts_question_family_check;
