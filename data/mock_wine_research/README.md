# Mock Wine Research

Every named mock exam wine needs a source-backed entry before the answer writer uses it.

Expected file name:

`data/mock_wine_research/{mock_exam_id}.json`

Minimum shape:

```json
{
  "mock_exam_id": "mock_full_2026_05_26_v6",
  "wines": {
    "p1_w3": {
      "producer": "Grosset",
      "wine_name": "Polish Hill Riesling",
      "vintage": "2024",
      "country": "Australia",
      "region": "Clare Valley",
      "sub_region": "Polish Hill",
      "appellation": "Clare Valley",
      "grape_variety": "Riesling",
      "sources": [
        "https://www.grosset.com.au/polish-hill-vineyard/"
      ],
      "verified_notes": [
        "Polish Hill is an estate vineyard in Clare Valley, South Australia.",
        "Grosset describes shallow shales, clay and gravel over blue slate."
      ]
    }
  }
}
```

Run:

`python scripts/validate_mock_wine_facts.py --exam outputs/mock_exams/mock_full_2026_05_26_v6.md --answers outputs/mock_exams/mock_full_2026_05_26_v6_answers.md --strict-research`

The strict check should fail if any named mock wine lacks source-backed research.
