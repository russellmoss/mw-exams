"""Render a Mermaid tree from a markdown file into a standalone HTML page.

Usage:
    python scripts/render_tree.py outputs/master_trees/p1_whites.md
    python scripts/render_tree.py outputs/master_trees/p1_whites.md outputs/master_trees/p1_whites.html
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


MERMAID_BLOCK_RE = re.compile(r"```mermaid\s*(.*?)```", re.DOTALL | re.IGNORECASE)


HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    body {{
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: #f7f3ea;
      color: #1e1b18;
    }}
    main {{
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }}
    h1 {{
      font-size: 1.8rem;
      margin: 0 0 16px;
    }}
    .diagram {{
      background: #fffdf8;
      border: 1px solid #d7cbb6;
      border-radius: 16px;
      padding: 20px;
      overflow: auto;
      box-shadow: 0 8px 24px rgba(56, 42, 20, 0.08);
    }}
  </style>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({{
      startOnLoad: true,
      theme: "base",
      themeVariables: {{
        primaryColor: "#fbf5e6",
        primaryTextColor: "#1e1b18",
        primaryBorderColor: "#5f4b32",
        lineColor: "#5f4b32",
        tertiaryColor: "#efe4cc",
        fontFamily: "Georgia, Times New Roman, serif"
      }}
    }});
  </script>
</head>
<body>
  <main>
    <h1>{title}</h1>
    <div class="diagram">
      <pre class="mermaid">{diagram}</pre>
    </div>
  </main>
</body>
</html>
"""


def extract_mermaid(markdown: str) -> str:
    match = MERMAID_BLOCK_RE.search(markdown)
    if not match:
        raise SystemExit("FAIL: no ```mermaid``` block found in input file")
    return match.group(1).strip()


def main() -> None:
    if len(sys.argv) not in {2, 3}:
        raise SystemExit("Usage: python scripts/render_tree.py <input.md> [output.html]")

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        raise SystemExit(f"FAIL: {input_path} not found")

    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) == 3
        else input_path.with_suffix(".html")
    )

    markdown = input_path.read_text(encoding="utf-8")
    diagram = extract_mermaid(markdown)
    html = HTML_TEMPLATE.format(title=input_path.stem, diagram=diagram)
    output_path.write_text(html, encoding="utf-8")
    print(f"OK: wrote {output_path}")


if __name__ == "__main__":
    main()
