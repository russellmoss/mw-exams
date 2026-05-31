from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "outputs" / "study_diagrams"
SITE_DIR = ROOT / "outputs" / "study_diagrams_site"
APP_DIR = ROOT / "study-app" / "public" / "diagrams"

FILES = [
    ("variety_cards.md", "variety-cards.html", "Top Variety Cards"),
    ("p1_whites.md", "p1-whites.html", "P1 Whites"),
    ("p2_reds.md", "p2-reds.html", "P2 Reds"),
    ("p3_special.md", "p3-special.html", "P3 Special"),
]

DIAGRAM_COUNTER = 0


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "section"


def infer_orientation(mermaid: str) -> str:
    first_line = mermaid.splitlines()[0].strip().upper() if mermaid else ""
    if "FLOWCHART LR" in first_line or "GRAPH LR" in first_line:
        return "landscape"
    return "portrait"


def render_markdown(md_text: str) -> tuple[str, str, list[tuple[str, str, str]]]:
    global DIAGRAM_COUNTER
    lines = md_text.splitlines()
    chunks: list[str] = []
    toc: list[tuple[int, str, str]] = []
    print_diagrams: list[tuple[str, str, str]] = []
    title = "Study Diagrams"
    current_h2 = ""
    current_h3 = ""
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```mermaid"):
            block: list[str] = []
            i += 1
            while i < len(lines) and lines[i].strip() != "```":
                block.append(lines[i])
                i += 1
            mermaid = "\n".join(block).strip()
            DIAGRAM_COUNTER += 1
            diagram_id = f"diagram-{DIAGRAM_COUNTER}"
            label_parts = [part for part in [current_h2, current_h3] if part]
            diagram_label = " - ".join(label_parts) if label_parts else title
            print_diagrams.append((diagram_label, mermaid, infer_orientation(mermaid)))
            chunks.append(
                f"<section class=\"diagram-card\" data-diagram-id=\"{diagram_id}\" data-mermaid=\"{html.escape(mermaid, quote=True)}\">"
                "<div class=\"diagram-toolbar no-print\">"
                "<button type=\"button\" class=\"zoom-button\" data-action=\"zoom-out\">-</button>"
                "<button type=\"button\" class=\"zoom-button\" data-action=\"zoom-in\">+</button>"
                "<button type=\"button\" class=\"zoom-button\" data-action=\"reset\">Reset</button>"
                "<button type=\"button\" class=\"zoom-button\" data-action=\"download-svg\">SVG</button>"
                "</div>"
                "<div class=\"diagram-scroll\">"
                f"<div class=\"diagram-stage\" id=\"{diagram_id}\">"
                "<div class=\"mermaid\">"
                f"{html.escape(mermaid)}"
                "</div>"
                "</div>"
                "</div>"
                "<p class=\"diagram-note no-print\">Use +/- or pinch and drag on touch devices.</p>"
                "<div class=\"print-diagram\">"
                "<div class=\"mermaid print-mermaid\">"
                f"{html.escape(mermaid)}"
                "</div>"
                "</div>"
                "</section>"
            )
        elif stripped.startswith("#"):
            level = len(stripped) - len(stripped.lstrip("#"))
            text = stripped[level:].strip()
            if level == 1:
                title = text
            elif level == 2:
                current_h2 = text
                current_h3 = ""
            elif level == 3:
                current_h3 = text
            anchor = slugify(text)
            toc.append((level, text, anchor))
            chunks.append(f"<h{level} id=\"{anchor}\">{html.escape(text)}</h{level}>")
        elif not stripped:
            pass
        else:
            paragraph_lines = [stripped]
            i += 1
            while i < len(lines):
                nxt = lines[i].strip()
                if not nxt or nxt.startswith("#") or nxt.startswith("```mermaid"):
                    i -= 1
                    break
                paragraph_lines.append(nxt)
                i += 1
            paragraph = " ".join(paragraph_lines)
            chunks.append(f"<p>{html.escape(paragraph)}</p>")

        i += 1

    toc_html = "".join(
        f"<a class=\"toc-item toc-level-{level}\" href=\"#{anchor}\">{html.escape(text)}</a>"
        for level, text, anchor in toc
        if level in (2, 3)
    )
    body = "\n".join(chunks)
    return title, f"<nav class=\"toc\">{toc_html}</nav>{body}", print_diagrams


def page_template(title: str, content: str, print_filename: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./assets/site.css">
</head>
<body>
  <header class="site-header">
    <div class="header-inner">
      <a class="home-link" href="./index.html">MW Study Diagrams</a>
      <div class="header-actions no-print">
        <button type="button" class="print-button" onclick="window.location.href='./{html.escape(print_filename)}?autoprint=1'">Print / Save PDF</button>
      </div>
    </div>
  </header>
  <main class="page-shell">
    <article class="content-card">
      {content}
    </article>
  </main>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({{
      startOnLoad: true,
      securityLevel: 'loose',
      theme: 'base',
      flowchart: {{
        useMaxWidth: false,
        htmlLabels: false,
        curve: 'basis'
      }},
      themeVariables: {{
        fontFamily: 'Source Sans 3, sans-serif',
        fontSize: '19px',
        primaryTextColor: '#121212',
        secondaryTextColor: '#121212',
        tertiaryTextColor: '#121212',
        mainBkg: '#fffdf8',
        primaryColor: '#fff3c4',
        primaryBorderColor: '#2c2c2c',
        lineColor: '#2c2c2c',
        clusterBkg: '#fffaf0',
        clusterBorder: '#2c2c2c',
        nodeBorder: '#2c2c2c',
        edgeLabelBackground: '#fffdf8'
      }}
    }});

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const diagramStates = new Map();

    function applyScale(card, scale) {{
      const stage = card.querySelector('.diagram-stage');
      const next = clamp(scale, 0.5, 2.4);
      stage.style.transform = `scale(${{next}})`;
      stage.dataset.scale = String(next);
      diagramStates.set(card.dataset.diagramId, next);
    }}

    function attachControls(card) {{
      const stage = card.querySelector('.diagram-stage');
      const scroll = card.querySelector('.diagram-scroll');
      if (!stage) return;
      applyScale(card, 1);

      card.querySelectorAll('.zoom-button').forEach((button) => {{
        button.addEventListener('click', async () => {{
          const current = Number(stage.dataset.scale || '1');
          const action = button.dataset.action;
          if (action === 'zoom-in') applyScale(card, current + 0.15);
          if (action === 'zoom-out') applyScale(card, current - 0.15);
          if (action === 'reset') applyScale(card, 1);
          if (action === 'download-svg') {{
            const definition = card.dataset.mermaid;
            if (!definition) return;
            const exportDefinition = `%%{{init: {{ "flowchart": {{ "htmlLabels": false }} }} }}%%\n${{definition}}`;
            const renderId = `export-${{card.dataset.diagramId}}-${{Date.now()}}`;
            const rendered = await mermaid.render(renderId, exportDefinition, undefined, document.createElement('div'));
            const blob = new Blob([rendered.svg], {{ type: 'image/svg+xml;charset=utf-8' }});
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const heading = card.previousElementSibling?.textContent?.trim() || 'diagram';
            const safeName = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            link.href = url;
            link.download = `${{safeName || 'diagram'}}.svg`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 250);
          }}
        }});
      }});

      let pinchStart = null;
      let baseScale = 1;
      let dragState = null;

      stage.addEventListener('touchstart', (event) => {{
        if (event.touches.length === 2) {{
          const [a, b] = event.touches;
          pinchStart = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          baseScale = Number(stage.dataset.scale || '1');
        }}
      }}, {{ passive: true }});

      stage.addEventListener('touchmove', (event) => {{
        if (event.touches.length === 2 && pinchStart) {{
          const [a, b] = event.touches;
          const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const ratio = distance / pinchStart;
          applyScale(card, baseScale * ratio);
        }}
      }}, {{ passive: true }});

      stage.addEventListener('touchend', (event) => {{
        if (event.touches.length < 2) pinchStart = null;
      }});

      if (!scroll) return;

      scroll.addEventListener('mousedown', (event) => {{
        if (event.button !== 0) return;
        dragState = {{
          startX: event.clientX,
          startY: event.clientY,
          left: scroll.scrollLeft,
          top: scroll.scrollTop
        }};
        scroll.classList.add('is-dragging');
        event.preventDefault();
      }});

      window.addEventListener('mousemove', (event) => {{
        if (!dragState) return;
        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        scroll.scrollLeft = dragState.left - dx;
        scroll.scrollTop = dragState.top - dy;
      }});

      const stopDrag = () => {{
        if (!dragState) return;
        dragState = null;
        scroll.classList.remove('is-dragging');
      }};

      window.addEventListener('mouseup', stopDrag);
    }}

    function fitPrintDiagrams() {{
      document.querySelectorAll('.diagram-card').forEach((card) => {{
        const sourceSvg = card.querySelector('.diagram-stage svg');
        const printSvg = card.querySelector('.print-diagram svg');
        if (!sourceSvg || !printSvg) return;

        const printWrap = card.querySelector('.print-diagram');
        printSvg.removeAttribute('width');
        printSvg.style.width = '100%';
        printSvg.style.height = 'auto';

        const sourceBox = sourceSvg.getBoundingClientRect();
        const targetWidth = printWrap.clientWidth || 1000;
        const widthRatio = targetWidth / Math.max(sourceBox.width, 1);
        const targetHeightPx = 950;
        const heightRatio = targetHeightPx / Math.max(sourceBox.height, 1);
        const scale = Math.min(widthRatio, heightRatio, 1);

        printSvg.style.width = `${{Math.max(sourceBox.width * scale, 320)}}px`;
        printSvg.style.maxWidth = '100%';
      }});
    }}

    window.addEventListener('load', () => {{
      document.querySelectorAll('.diagram-card').forEach(attachControls);
      setTimeout(fitPrintDiagrams, 150);
    }});

    window.addEventListener('beforeprint', fitPrintDiagrams);
  </script>
</body>
</html>
"""


def print_pack_template(title: str, diagrams: list[tuple[str, str, str]]) -> str:
    sheets = "\n".join(
        (
            f"<section class=\"print-sheet {orientation}\" data-initial-orientation=\"{orientation}\">"
            f"<header class=\"sheet-header\">"
            f"<p class=\"sheet-kicker\">{html.escape(title)}</p>"
            f"<h1>{html.escape(label)}</h1>"
            f"</header>"
            f"<div class=\"sheet-diagram\" data-mermaid=\"{html.escape(mermaid, quote=True)}\">"
            f"<div class=\"sheet-render\"></div>"
            "</div>"
            "</section>"
        )
        for label, mermaid, orientation in diagrams
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} Print Pack</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * {{
      box-sizing: border-box;
    }}

    :root {{
      --ink: #161616;
      --muted: #5a554f;
      --line: #2c2c2c;
      --paper: #fffdf8;
    }}

    body {{
      margin: 0;
      color: var(--ink);
      background: #efe7d8;
      font-family: 'Source Sans 3', sans-serif;
    }}

    .print-shell {{
      width: min(1100px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 20px 0 40px;
    }}

    .print-intro {{
      margin: 0 0 18px;
      padding: 18px 20px;
      border: 2px solid var(--line);
      border-radius: 18px;
      background: var(--paper);
    }}

    .print-actions {{
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 14px;
    }}

    .print-link,
    .print-trigger {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 16px;
      border: 2px solid var(--line);
      border-radius: 999px;
      background: #fff6d8;
      color: var(--ink);
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }}

    .print-intro h1 {{
      margin: 0 0 8px;
      font-family: 'Fraunces', serif;
      font-size: 2rem;
    }}

    .print-intro p {{
      margin: 0;
      color: var(--muted);
      font-size: 1rem;
    }}

    .print-sheet {{
      margin: 0 0 18px;
      padding: 18px;
      border: 2px solid var(--line);
      border-radius: 18px;
      background: var(--paper);
    }}

    .sheet-header {{
      margin-bottom: 12px;
    }}

    .sheet-kicker {{
      margin: 0 0 6px;
      color: #8c3b2f;
      font-size: 0.95rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }}

    .sheet-header h1 {{
      margin: 0;
      font-family: 'Fraunces', serif;
      font-size: 1.6rem;
      line-height: 1.15;
    }}

    .sheet-diagram {{
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      overflow: hidden;
    }}

    .sheet-diagram svg {{
      display: block;
      margin: 0 auto;
    }}

    @page portrait-sheet {{
      size: portrait;
      margin: 10mm;
    }}

    @page landscape-sheet {{
      size: landscape;
      margin: 10mm;
    }}

    @media print {{
      body {{
        background: #fff;
      }}

      .print-shell {{
        width: 100%;
        margin: 0;
        padding: 0;
      }}

      .print-intro {{
        display: none;
      }}

      .print-sheet {{
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        break-after: page;
      }}

      .print-sheet.portrait {{
        page: portrait-sheet;
      }}

      .print-sheet.landscape {{
        page: landscape-sheet;
      }}

      .sheet-header {{
        margin: 0 0 6mm;
      }}

      .sheet-kicker {{
        font-size: 9pt;
      }}

      .sheet-header h1 {{
        font-size: 18pt;
      }}

      .print-sheet.landscape .sheet-diagram {{
        width: 277mm;
        height: 165mm;
      }}

      .print-sheet.portrait .sheet-diagram {{
        width: 190mm;
        height: 240mm;
      }}
    }}
  </style>
</head>
<body>
  <main class="print-shell">
    <section class="print-intro">
      <h1>{html.escape(title)} Print Pack</h1>
      <p>One diagram per page. Wide diagrams are set to landscape; tall diagrams are set to portrait.</p>
      <div class="print-actions">
        <button type="button" class="print-trigger" onclick="window.print()">Print / Save PDF</button>
        <a class="print-link" href="./index.html">Back to Index</a>
      </div>
    </section>
    {sheets}
  </main>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({{
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      flowchart: {{
        useMaxWidth: false,
        htmlLabels: false,
        curve: 'basis'
      }},
      themeVariables: {{
        fontFamily: 'Source Sans 3, sans-serif',
        fontSize: '18px',
        primaryTextColor: '#121212',
        secondaryTextColor: '#121212',
        tertiaryTextColor: '#121212',
        mainBkg: '#fffdf8',
        primaryColor: '#fff3c4',
        primaryBorderColor: '#2c2c2c',
        lineColor: '#2c2c2c',
        clusterBkg: '#fffaf0',
        clusterBorder: '#2c2c2c',
        nodeBorder: '#2c2c2c',
        edgeLabelBackground: '#fffdf8'
      }}
    }});

    async function renderSheets() {{
      const sheets = document.querySelectorAll('.sheet-diagram');
      for (const [index, sheet] of [...sheets].entries()) {{
        const definition = sheet.dataset.mermaid;
        if (!definition) continue;
        const renderId = `print-sheet-${{index}}-${{Date.now()}}`;
        const rendered = await mermaid.render(renderId, definition, undefined, document.createElement('div'));
        const target = sheet.querySelector('.sheet-render');
        if (target) target.innerHTML = rendered.svg;
      }}
    }}

    function fitSheets() {{
      document.querySelectorAll('.print-sheet').forEach((sheet) => {{
        const svg = sheet.querySelector('svg');
        const wrap = sheet.querySelector('.sheet-diagram');
        if (!svg || !wrap) return;

        svg.removeAttribute('width');
        svg.removeAttribute('height');
        const viewBox = svg.viewBox?.baseVal;
        const naturalWidth = viewBox?.width || 1000;
        const naturalHeight = viewBox?.height || 800;
        const aspectRatio = naturalWidth / Math.max(naturalHeight, 1);
        const shouldUseLandscape = aspectRatio > 0.78;
        sheet.classList.toggle('landscape', shouldUseLandscape);
        sheet.classList.toggle('portrait', !shouldUseLandscape);
        const isLandscape = shouldUseLandscape;
        const availableWidth = wrap.clientWidth || (isLandscape ? 1047 : 718);
        const availableHeight = wrap.clientHeight || (isLandscape ? 624 : 907);
        const widthRatio = availableWidth / Math.max(naturalWidth, 1);
        const heightRatio = availableHeight / Math.max(naturalHeight, 1);
        const scale = Math.min(widthRatio, heightRatio, 1);
        const fittedWidth = Math.max(Math.floor(naturalWidth * scale), 280);
        const fittedHeight = Math.max(Math.floor(naturalHeight * scale), 220);

        svg.style.width = `${{fittedWidth}}px`;
        svg.style.height = `${{fittedHeight}}px`;
        svg.style.maxWidth = 'none';
        svg.style.maxHeight = 'none';
      }});
    }}

    window.addEventListener('load', async () => {{
      await renderSheets();
      setTimeout(fitSheets, 180);
      const params = new URLSearchParams(window.location.search);
      if (params.get('autoprint') === '1') {{
        setTimeout(() => window.print(), 350);
      }}
    }});
    window.addEventListener('beforeprint', fitSheets);
  </script>
</body>
</html>
"""


def index_template(cards: list[tuple[str, str]]) -> str:
    links = "\n".join(
        (
            f"<a class=\"index-card\" href=\"./{filename}\">"
            f"<h2>{html.escape(title)}</h2>"
            f"<p>Open online, print cleanly, or save as PDF.</p>"
            "</a>"
        )
        for filename, title in cards
    )
    print_links = "\n".join(
        (
            f"<a class=\"index-card\" href=\"./{filename}\">"
            f"<h2>{html.escape(title)}</h2>"
            f"<p>One diagram per page with portrait/landscape auto-fit.</p>"
            "</a>"
        )
        for filename, title in [
            ("variety-cards-print.html", "Top Variety Cards Print Pack"),
            ("p1-whites-print.html", "P1 Whites Print Pack"),
            ("p2-reds-print.html", "P2 Reds Print Pack"),
            ("p3-special-print.html", "P3 Special Print Pack"),
        ]
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MW Study Diagrams</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./assets/site.css">
</head>
<body>
  <main class="index-shell">
    <section class="hero-card">
      <p class="eyebrow">Netlify-ready</p>
      <h1>MW Study Diagrams</h1>
      <p class="hero-copy">These pages use a high-contrast Mermaid theme tuned for browser reading, sharing, and printing.</p>
      <div class="index-grid">
        {links}
      </div>
      <h2>Print Packs</h2>
      <div class="index-grid">
        {print_links}
      </div>
    </section>
  </main>
</body>
</html>
"""


SITE_CSS = """* {
  box-sizing: border-box;
}

:root {
  --bg: #f4efe5;
  --paper: #fffdf8;
  --ink: #161616;
  --muted: #5a554f;
  --line: #2c2c2c;
  --accent: #8c3b2f;
  --shadow: 0 18px 40px rgba(50, 31, 16, 0.12);
}

html {
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

body {
  margin: 0;
  color: var(--ink);
  background:
    radial-gradient(circle at top left, rgba(201, 120, 62, 0.14), transparent 28%),
    radial-gradient(circle at top right, rgba(132, 67, 54, 0.12), transparent 22%),
    linear-gradient(180deg, #efe4d3 0%, var(--bg) 100%);
  font-family: 'Source Sans 3', sans-serif;
}

.site-header,
.page-shell,
.index-shell {
  width: min(1200px, calc(100vw - 32px));
  margin: 0 auto;
}

.site-header {
  padding: 20px 0 0;
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.home-link,
.toc-item,
.index-card {
  text-decoration: none;
}

.home-link {
  color: var(--ink);
  font-family: 'Fraunces', serif;
  font-size: 1.15rem;
  font-weight: 700;
}

.print-button {
  border: 2px solid var(--line);
  background: #fff6d8;
  color: var(--ink);
  border-radius: 999px;
  padding: 10px 16px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.content-card,
.hero-card {
  background: var(--paper);
  border: 2px solid rgba(44, 44, 44, 0.9);
  border-radius: 24px;
  box-shadow: var(--shadow);
}

.page-shell {
  padding: 18px 0 40px;
}

.content-card {
  padding: 28px;
}

.toc {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 24px;
  padding-bottom: 20px;
  border-bottom: 2px solid #ded2be;
}

.toc-item {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 8px 14px;
  border: 1px solid #bba98f;
  border-radius: 999px;
  color: var(--ink);
  background: #faf3e7;
  font-weight: 600;
}

h1, h2, h3 {
  font-family: 'Fraunces', serif;
  line-height: 1.15;
  margin: 0;
}

h1 {
  font-size: clamp(2rem, 4vw, 3rem);
  margin-bottom: 12px;
}

h2 {
  font-size: clamp(1.45rem, 2.5vw, 2rem);
  margin: 28px 0 14px;
}

h3 {
  font-size: 1.2rem;
  margin: 22px 0 10px;
  color: var(--accent);
}

p {
  font-size: 1.08rem;
  line-height: 1.6;
  color: var(--muted);
  margin: 0 0 14px;
}

.diagram-card {
  margin: 18px 0 28px;
  padding: 16px;
  border: 2px solid #ddd0bb;
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(255, 250, 240, 0.95), rgba(255, 255, 255, 0.98));
}

.diagram-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.zoom-button {
  border: 2px solid var(--line);
  background: #fff6d8;
  color: var(--ink);
  border-radius: 12px;
  min-width: 48px;
  min-height: 44px;
  padding: 0 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.diagram-scroll {
  overflow: auto;
  touch-action: pan-x pan-y;
  border-radius: 14px;
  cursor: grab;
  user-select: none;
}

.diagram-stage {
  width: fit-content;
  min-width: 900px;
  transform-origin: top left;
  transition: transform 120ms ease-out;
}

.diagram-scroll.is-dragging {
  cursor: grabbing;
}

.diagram-scroll.is-dragging .diagram-stage {
  pointer-events: none;
}

.diagram-stage .mermaid {
  width: fit-content;
}

.diagram-note {
  margin-top: 10px;
  font-size: 0.98rem;
}

.print-diagram {
  display: none;
}

.index-shell {
  padding: 36px 0 48px;
}

.hero-card {
  padding: 32px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-copy {
  max-width: 54rem;
}

.index-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.index-card {
  display: block;
  padding: 18px;
  border: 2px solid #d9c6a9;
  border-radius: 18px;
  background: linear-gradient(180deg, #fff8eb, #fff);
  color: var(--ink);
}

.index-card h2 {
  font-size: 1.35rem;
  margin: 0 0 8px;
}

.index-card p {
  margin: 0;
}

@media (max-width: 768px) {
  .content-card,
  .hero-card {
    padding: 18px;
    border-radius: 18px;
  }

  .diagram-card {
    padding: 10px;
  }

  .diagram-stage {
    min-width: 760px;
  }

  .header-inner {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media print {
  @page {
    size: landscape;
    margin: 10mm;
  }

  body {
    background: #fff;
  }

  .site-header,
  .toc,
  .no-print {
    display: none !important;
  }

  .page-shell,
  .index-shell {
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .content-card,
  .hero-card,
  .diagram-card,
  .index-card {
    box-shadow: none;
    border-color: #888;
    break-inside: avoid;
  }

  .content-card {
    border: 0;
    padding: 0;
  }

  .diagram-card {
    margin: 0 0 12px;
    padding: 8px;
    break-before: page;
    break-inside: avoid;
  }

  h2, h3 {
    break-after: avoid;
  }

  .diagram-scroll,
  .diagram-stage,
  .diagram-note {
    display: none !important;
  }

  .print-diagram {
    display: block;
    overflow: hidden;
  }

  .print-diagram svg {
    display: block;
    height: auto !important;
    max-width: 100% !important;
    margin: 0 auto;
  }
}
"""


# The diagrams app pages are embedded (via an iframe) inside the React route /diagrams, which already
# renders the real app NavBar (logo, Study, Stem Sniper, Diagrams, History, Methodology, Settings,
# Admin, the notification bell, the signed-in user's name, and Sign out). A second, static, partial nav
# here would duplicate it and show stale/incomplete links, so the embedded pages carry NO app nav.
APP_NAV_HTML = ""


def app_page_template(title: str, content: str, print_filename: str) -> str:
    """Dark-themed version of page_template for the Vercel app."""
    base = page_template(title, content, print_filename)
    # Remove Google Fonts, use absolute CSS path
    base = base.replace(
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        "  <link href=\"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;600;700&display=swap\" rel=\"stylesheet\">\n"
        '  <link rel="stylesheet" href="./assets/site.css">',
        '<link rel="stylesheet" href="/diagrams/assets/site.css">\n'
        '  <link rel="icon" href="/favicon.ico">',
    )
    # Replace the old header with the app nav + diagram sub-header
    base = base.replace(
        '  <header class="site-header">\n'
        '    <div class="header-inner">\n'
        '      <a class="home-link" href="./index.html">MW Study Diagrams</a>\n'
        '      <div class="header-actions no-print">\n'
        f"        <button type=\"button\" class=\"print-button\" onclick=\"window.location.href='./{html.escape(print_filename)}?autoprint=1'\">Print / Save PDF</button>\n"
        '      </div>\n'
        '    </div>\n'
        '  </header>',
        f'{APP_NAV_HTML}\n'
        '  <header class="site-header">\n'
        '    <div class="header-inner">\n'
        '      <a class="home-link" href="/diagrams/index.html">Study Diagrams</a>\n'
        '      <div class="header-actions no-print">\n'
        f"        <button type=\"button\" class=\"print-button\" onclick=\"window.location.href='/diagrams/{html.escape(print_filename)}?autoprint=1'\">Print / Save PDF</button>\n"
        '      </div>\n'
        '    </div>\n'
        '  </header>',
    )
    return base


def app_index_template(cards: list[tuple[str, str]]) -> str:
    links = "\n".join(
        f'        <a class="index-card" href="/diagrams/{filename}">'
        f"<h2>{html.escape(title)}</h2>"
        f"<p>Interactive decision tree with zoom, pan, and print.</p></a>"
        for filename, title in cards
    )
    print_links = "\n".join(
        f'        <a class="index-card" href="/diagrams/{fn}">'
        f"<h2>{html.escape(title)}</h2>"
        f"<p>Print-optimized layout.</p></a>"
        for fn, title in [
            ("variety-cards-print.html", "Variety Cards"),
            ("p1-whites-print.html", "P1 Whites"),
            ("p2-reds-print.html", "P2 Reds"),
            ("p3-special-print.html", "P3 Special"),
        ]
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Study Diagrams — MW Study App</title>
  <link rel="stylesheet" href="/diagrams/assets/site.css">
  <link rel="icon" href="/favicon.ico">
</head>
<body>
{APP_NAV_HTML}
  <main class="index-shell">
    <section class="hero-card">
      <p class="eyebrow">Decision Trees</p>
      <h1>Study Diagrams</h1>
      <p class="hero-copy">Interactive decision trees for stem analysis. Zoom, pan, and print.</p>
      <div class="index-grid">
{links}
      </div>
      <h2>Print Packs</h2>
      <p>One diagram per page, auto-rotated for best fit. Use your browser's Print / Save as PDF.</p>
      <div class="index-grid">
{print_links}
      </div>
    </section>
  </main>
</body>
</html>
"""


APP_CSS = (Path(__file__).resolve().parent.parent / "study-app" / "public" / "diagrams" / "assets" / "site.css")


def main() -> None:
    assets_dir = SITE_DIR / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    (assets_dir / "site.css").write_text(SITE_CSS, encoding="utf-8")
    (SITE_DIR / "README.md").write_text(
        """# MW Study Diagrams Site

This folder is ready to share as a static website.

## Open locally

Open `index.html` in a web browser.

## Publish on Netlify

Drag the whole `study_diagrams_site` folder into Netlify Drop.

## Interactive use

Use the regular HTML pages for zoom, drag, and touch navigation.

## Print

Use the `*-print.html` pages for PDF or paper.

- These print packs use one diagram per page.
- Wide diagrams are assigned landscape pages.
- Tall diagrams are assigned portrait pages.
""",
        encoding="utf-8",
    )

    cards: list[tuple[str, str]] = []
    for source_name, output_name, label in FILES:
        md_path = SOURCE_DIR / source_name
        title, content, print_diagrams = render_markdown(md_path.read_text(encoding="utf-8"))
        print_name = output_name.replace(".html", "-print.html")
        (SITE_DIR / output_name).write_text(page_template(title, content, print_name), encoding="utf-8")
        (SITE_DIR / print_name).write_text(
            print_pack_template(title, print_diagrams),
            encoding="utf-8",
        )
        cards.append((output_name, label))

    (SITE_DIR / "index.html").write_text(index_template(cards), encoding="utf-8")

    # --- Also build dark-themed copy for the Vercel app ---
    app_assets = APP_DIR / "assets"
    app_assets.mkdir(parents=True, exist_ok=True)
    # Preserve the hand-edited dark CSS if it exists; otherwise skip
    if not (app_assets / "site.css").exists():
        (app_assets / "site.css").write_text(SITE_CSS, encoding="utf-8")

    # Reset counter so diagram IDs are consistent
    global DIAGRAM_COUNTER
    saved_counter = DIAGRAM_COUNTER
    DIAGRAM_COUNTER = 0

    app_cards: list[tuple[str, str]] = []
    for source_name, output_name, label in FILES:
        md_path = SOURCE_DIR / source_name
        title, content, print_diagrams = render_markdown(md_path.read_text(encoding="utf-8"))
        print_name = output_name.replace(".html", "-print.html")
        (APP_DIR / output_name).write_text(app_page_template(title, content, print_name), encoding="utf-8")
        app_print = print_pack_template(title, print_diagrams)
        app_print = app_print.replace('href="./index.html"', 'href="/diagrams/index.html"')
        (APP_DIR / print_name).write_text(app_print, encoding="utf-8")
        app_cards.append((output_name, label))

    (APP_DIR / "index.html").write_text(app_index_template(app_cards), encoding="utf-8")
    DIAGRAM_COUNTER = saved_counter


if __name__ == "__main__":
    main()
