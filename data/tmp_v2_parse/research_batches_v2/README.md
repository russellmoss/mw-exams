# V2 Research Batches

These batches cover the newly added `2011-2014` wines from `MW_Practical_Papers_Compilation V2.md`.

Recommended parallelization:
- one batch per paper
- `12` batches total
- `12` wines per batch

Tracker helper:
- `python scripts/manage_v2_research_batches.py init`
- `python scripts/manage_v2_research_batches.py status`
- `python scripts/manage_v2_research_batches.py claim-next --worker worker-a --show-commands`
- `python scripts/manage_v2_research_batches.py complete 2014_p1 --worker worker-a`
- `python scripts/manage_v2_research_batches.py fail 2014_p1 --worker worker-a --notes "why it failed"`

Each batch JSON includes the wine IDs, full text, and ready-to-run `/research-wine` commands.

After all research files exist, run:
- `python scripts/post_research_rebuild_v2.py`

That command will:
- verify all `2011-2014` wine research files exist
- merge the V2 temp parse into canonical `data/exams.json`, `data/wines.json`, and `data/annotations.json`
- rebuild historical wine classification and the mock-exam sourcing guide in parallel
- rerun the predictive analyzer

## 2011_p1

- file: `data/tmp_v2_parse/research_batches_v2/2011_p1.json`
- wines: `12`
- first command: `/research-wine 2011 p1 w1`

## 2011_p2

- file: `data/tmp_v2_parse/research_batches_v2/2011_p2.json`
- wines: `12`
- first command: `/research-wine 2011 p2 w1`

## 2011_p3

- file: `data/tmp_v2_parse/research_batches_v2/2011_p3.json`
- wines: `12`
- first command: `/research-wine 2011 p3 w1`

## 2012_p1

- file: `data/tmp_v2_parse/research_batches_v2/2012_p1.json`
- wines: `12`
- first command: `/research-wine 2012 p1 w1`

## 2012_p2

- file: `data/tmp_v2_parse/research_batches_v2/2012_p2.json`
- wines: `12`
- first command: `/research-wine 2012 p2 w1`

## 2012_p3

- file: `data/tmp_v2_parse/research_batches_v2/2012_p3.json`
- wines: `12`
- first command: `/research-wine 2012 p3 w1`

## 2013_p1

- file: `data/tmp_v2_parse/research_batches_v2/2013_p1.json`
- wines: `12`
- first command: `/research-wine 2013 p1 w1`

## 2013_p2

- file: `data/tmp_v2_parse/research_batches_v2/2013_p2.json`
- wines: `12`
- first command: `/research-wine 2013 p2 w1`

## 2013_p3

- file: `data/tmp_v2_parse/research_batches_v2/2013_p3.json`
- wines: `12`
- first command: `/research-wine 2013 p3 w1`

## 2014_p1

- file: `data/tmp_v2_parse/research_batches_v2/2014_p1.json`
- wines: `12`
- first command: `/research-wine 2014 p1 w1`

## 2014_p2

- file: `data/tmp_v2_parse/research_batches_v2/2014_p2.json`
- wines: `12`
- first command: `/research-wine 2014 p2 w1`

## 2014_p3

- file: `data/tmp_v2_parse/research_batches_v2/2014_p3.json`
- wines: `12`
- first command: `/research-wine 2014 p3 w1`

