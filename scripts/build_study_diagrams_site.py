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
                "<div class=\"diagram-viewport\">"
                "<div class=\"diagram-toolbar no-print\">"
                "<button type=\"button\" class=\"zoom-button\" data-action=\"zoom-out\" title=\"Zoom out\">-</button>"
                "<button type=\"button\" class=\"zoom-button\" data-action=\"zoom-in\" title=\"Zoom in\">+</button>"
                "<button type=\"button\" class=\"zoom-button\" data-action=\"reset\" title=\"Fit to page\">Fit</button>"
                "<button type=\"button\" class=\"zoom-button\" data-action=\"download-svg\" title=\"Download as SVG\">SVG</button>"
                "</div>"
                f"<div class=\"diagram-stage\" id=\"{diagram_id}\">"
                "<div class=\"mermaid\">"
                f"{html.escape(mermaid)}"
                "</div>"
                "</div>"
                "</div>"
                "<p class=\"diagram-note no-print\">Drag to pan &middot; pinch or Ctrl+scroll to zoom.</p>"
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

    async function downloadSvg(card) {{
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

    // Seamless viewport: the diagram floats on the page (no frame), auto-fitted to the content
    // width. transform-based pan/zoom — drag to pan, pinch or Ctrl+scroll to zoom about the
    // cursor, toolbar for the rest. Returns a refit function used on window resize.
    function setupViewport(card) {{
      const viewport = card.querySelector('.diagram-viewport');
      const stage = card.querySelector('.diagram-stage');
      const svg = stage ? stage.querySelector('svg') : null;
      if (!viewport || !stage || !svg) return null;

      // A freshly inserted mermaid svg has no viewBox yet (the browser reports the 300x150
      // default). Treat that as "still rendering" and let initDiagrams retry — measuring too
      // early would lock the finished diagram to placeholder size.
      const viewBox = svg.viewBox && svg.viewBox.baseVal;
      if (!viewBox || !viewBox.width || !viewBox.height) return null;
      const naturalW = viewBox.width;
      const naturalH = viewBox.height;
      svg.style.width = `${{naturalW}}px`;
      svg.style.height = `${{naturalH}}px`;
      svg.style.maxWidth = 'none';

      const state = {{ scale: 1, tx: 0, ty: 0, fit: 1 }};

      function apply() {{
        stage.style.transform = `translate(${{state.tx}}px, ${{state.ty}}px) scale(${{state.scale}})`;
      }}

      function fit() {{
        const vw = viewport.clientWidth || 800;
        // Fit to WIDTH only — the page scrolls, so tall trees take the full vertical room they
        // need instead of being crushed into the window height. Two guards keep every diagram
        // legible and consistent: never scale UP past 1:1 (blown-up 19px Mermaid text reads as
        // a rendering bug), and never start below MIN_READABLE — a floored diagram overflows
        // horizontally and the reader pans, which beats unreadable text.
        const MIN_READABLE = 0.6;
        const widthFit = Math.min(vw / naturalW, 1);
        const fitScale = Math.max(widthFit, MIN_READABLE);
        state.fit = fitScale;
        state.scale = fitScale;
        viewport.style.height = `${{Math.ceil(naturalH * fitScale)}}px`;
        state.tx = Math.max((vw - naturalW * fitScale) / 2, 0);
        state.ty = 0;
        apply();
      }}

      function zoomAt(vx, vy, factor) {{
        const next = clamp(state.scale * factor, state.fit * 0.5, state.fit * 6);
        const k = next / state.scale;
        state.tx = vx - k * (vx - state.tx);
        state.ty = vy - k * (vy - state.ty);
        state.scale = next;
        apply();
      }}

      card.querySelectorAll('.zoom-button').forEach((button) => {{
        button.addEventListener('click', () => {{
          const action = button.dataset.action;
          const rect = viewport.getBoundingClientRect();
          if (action === 'zoom-in') zoomAt(rect.width / 2, rect.height / 2, 1.25);
          if (action === 'zoom-out') zoomAt(rect.width / 2, rect.height / 2, 0.8);
          if (action === 'reset') fit();
          if (action === 'download-svg') downloadSvg(card);
        }});
      }});

      const pointers = new Map();
      let pinchBase = null;

      viewport.addEventListener('pointerdown', (event) => {{
        if (event.button !== 0 || event.target.closest('.diagram-toolbar')) return;
        viewport.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, {{ x: event.clientX, y: event.clientY }});
        if (pointers.size === 1) viewport.classList.add('is-dragging');
        if (pointers.size === 2) {{
          const [a, b] = [...pointers.values()];
          pinchBase = {{ dist: Math.hypot(a.x - b.x, a.y - b.y), scale: state.scale }};
        }}
      }});

      viewport.addEventListener('pointermove', (event) => {{
        const prev = pointers.get(event.pointerId);
        if (!prev) return;
        const current = {{ x: event.clientX, y: event.clientY }};
        if (pointers.size === 1) {{
          state.tx += current.x - prev.x;
          state.ty += current.y - prev.y;
          apply();
        }}
        pointers.set(event.pointerId, current);
        if (pointers.size === 2 && pinchBase) {{
          const [a, b] = [...pointers.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const rect = viewport.getBoundingClientRect();
          const cx = (a.x + b.x) / 2 - rect.left;
          const cy = (a.y + b.y) / 2 - rect.top;
          zoomAt(cx, cy, (pinchBase.scale * (dist / Math.max(pinchBase.dist, 1))) / state.scale);
        }}
      }});

      const release = (event) => {{
        pointers.delete(event.pointerId);
        if (pointers.size < 2) pinchBase = null;
        if (pointers.size === 0) viewport.classList.remove('is-dragging');
      }};
      viewport.addEventListener('pointerup', release);
      viewport.addEventListener('pointercancel', release);

      viewport.addEventListener('wheel', (event) => {{
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY < 0 ? 1.15 : 0.87);
      }}, {{ passive: false }});

      fit();
      return fit;
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

        // Natural (viewBox) size, not the bounding box — the on-screen stage is scaled now.
        const viewBox = sourceSvg.viewBox && sourceSvg.viewBox.baseVal;
        const naturalWidth = (viewBox && viewBox.width) || 1000;
        const naturalHeight = (viewBox && viewBox.height) || 800;
        const targetWidth = printWrap.clientWidth || 1000;
        const widthRatio = targetWidth / Math.max(naturalWidth, 1);
        const targetHeightPx = 950;
        const heightRatio = targetHeightPx / Math.max(naturalHeight, 1);
        const scale = Math.min(widthRatio, heightRatio, 1);

        printSvg.style.width = `${{Math.max(naturalWidth * scale, 320)}}px`;
        printSvg.style.maxWidth = '100%';
      }});
    }}

    const refits = [];

    // Mermaid renders asynchronously after load; retry until every diagram's svg exists.
    function initDiagrams(attempt) {{
      document.querySelectorAll('.diagram-card').forEach((card) => {{
        if (card.dataset.viewportReady) return;
        const refit = setupViewport(card);
        if (refit) {{
          card.dataset.viewportReady = '1';
          refits.push(refit);
        }}
      }});
      const remaining = [...document.querySelectorAll('.diagram-card')].some((card) => !card.dataset.viewportReady);
      if (remaining && (attempt || 0) < 25) {{
        setTimeout(() => initDiagrams((attempt || 0) + 1), 200);
      }} else {{
        setTimeout(fitPrintDiagrams, 150);
      }}
    }}

    window.addEventListener('load', () => initDiagrams(0));

    let resizeTimer = null;
    window.addEventListener('resize', () => {{
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => refits.forEach((fn) => fn()), 150);
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
  /* Full-bleed diagram breakout uses 100vw, which includes the scrollbar gutter. */
  overflow-x: hidden;
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

.hero-card {
  background: var(--paper);
  border: 2px solid rgba(44, 44, 44, 0.9);
  border-radius: 24px;
  box-shadow: var(--shadow);
}

/* Content flows directly on the page — no framing card (matches the app build). */
.content-card {
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: 12px 0 0;
}

.page-shell {
  padding: 18px 0 40px;
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

/* Seamless diagrams: no frame, no scroll pane (matches the app build). */
.diagram-card {
  margin: 18px 0 40px;
  padding: 0;
  border: 0;
  background: transparent;
  /* Break out of the text column: diagrams use the full window width. */
  width: calc(100vw - 40px);
  margin-left: calc(50% - 50vw + 20px);
}

.diagram-viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.diagram-viewport.is-dragging {
  cursor: grabbing;
}

.diagram-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: flex;
  gap: 6px;
  opacity: 0.3;
  transition: opacity 0.15s;
}

.diagram-viewport:hover .diagram-toolbar,
.diagram-toolbar:focus-within {
  opacity: 1;
}

.zoom-button {
  border: 2px solid var(--line);
  background: #fff6d8;
  color: var(--ink);
  border-radius: 10px;
  min-width: 40px;
  min-height: 36px;
  padding: 0 10px;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.diagram-stage {
  width: fit-content;
  transform-origin: 0 0;
}

.diagram-stage .mermaid {
  width: fit-content;
}

.diagram-note {
  margin-top: 6px;
  font-size: 0.85rem;
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

  .diagram-viewport,
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


# The diagrams app pages are embedded (via an iframe) inside the React route /library, which already
# renders the real app NavBar (logo, Theory, Practical, Library, History, the notification bell, the
# signed-in user's name, and Sign out). A second, static, partial nav here would duplicate it and show
# stale/incomplete links, so the embedded pages carry NO app nav.
APP_NAV_HTML = ""

# Theme sync for the embedded app pages. The iframe is same-origin with the app, so it reads the
# app's own localStorage theme key ('mw-theme', see study-app/src/lib/theme.ts) and follows the
# in-app toggle live via 'storage' events (which fire in every OTHER same-origin document when the
# parent writes the key). Unset/unknown falls back to light — the app's first-visit default since
# 2026-08-06. Synchronous and in <head>, so the palette lands before first paint.
APP_THEME_SCRIPT = (
    "<script>(function(){var k='mw-theme';"
    "function apply(t){document.documentElement.dataset.theme=(t==='dark')?'dark':'light';}"
    "var s=null;try{s=localStorage.getItem(k);}catch(e){}apply(s);"
    "window.addEventListener('storage',function(e){if(e.key===k)apply(e.newValue);});"
    "})();</script>"
)

# Themed stylesheet for the embedded app pages: the Cellar token set in both themes (DESIGN.md),
# selected by <html data-theme> which APP_THEME_SCRIPT keeps in step with the app. Light is the
# no-attribute default. Regenerated on every build — this file is no longer hand-edited.
APP_CSS_THEMED = """* {
  box-sizing: border-box;
}

:root,
html[data-theme="light"] {
  --bg: #fafaf9;
  --paper: #ffffff;
  --ink: #1c1917;
  --muted: #78716c;
  --line: #d6d3d1;
  --line-soft: #e7e5e4;
  --accent: #b45309;
  --accent-hover: #92400e;
  --card-raised: #f5f5f4;
  --card-deep: #fafaf9;
  --card-hover-bg: #e7e5e4;
  --shadow: 0 18px 40px rgba(50, 31, 16, 0.08);
}

html[data-theme="dark"] {
  --bg: #0c0a09;
  --paper: #1c1917;
  --ink: #e7e5e4;
  --muted: #78716c;
  --line: #44403c;
  --line-soft: #3a3632;
  --accent: #d97706;
  --accent-hover: #f59e0b;
  --card-raised: #292524;
  --card-deep: #171412;
  --card-hover-bg: #44403c;
  --shadow: 0 18px 40px rgba(0, 0, 0, 0.3);
}

html {
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

body {
  margin: 0;
  color: var(--ink);
  background: var(--bg);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  /* Full-bleed diagram breakout uses 100vw, which includes the scrollbar gutter. */
  overflow-x: hidden;
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
  font-size: 1.15rem;
  font-weight: 700;
}

.print-button {
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--accent);
  border-radius: 999px;
  padding: 10px 16px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.print-button:hover {
  background: var(--card-raised);
  border-color: var(--accent);
}

.hero-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: var(--shadow);
}

/* Content flows directly on the page — no framing card. Diagrams read as part of the
   document, not as boxed widgets. */
.content-card {
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: 12px 0 0;
}

.page-shell {
  padding: 18px 0 40px;
}

.toc {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
}

.toc-item {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  background: var(--card-raised);
  font-weight: 600;
  font-size: 0.85rem;
  transition: border-color 0.15s, color 0.15s;
}

.toc-item:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.toc-item.toc-level-3 {
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--muted);
  border-color: var(--line-soft);
  background: var(--paper);
}

h1, h2, h3 {
  line-height: 1.15;
  margin: 0;
}

h1 {
  font-size: clamp(2rem, 4vw, 3rem);
  margin-bottom: 12px;
  color: var(--ink);
}

h2 {
  font-size: clamp(1.45rem, 2.5vw, 2rem);
  margin: 28px 0 14px;
  color: var(--ink);
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

/* Seamless diagrams: no frame, no scroll pane. The viewport is an invisible window sized to
   the fitted diagram; pan/zoom happen via transform (see setupViewport in the page script). */
.diagram-card {
  margin: 18px 0 40px;
  padding: 0;
  border: 0;
  background: transparent;
  /* Break out of the text column: diagrams use the full window width. */
  width: calc(100vw - 40px);
  margin-left: calc(50% - 50vw + 20px);
}

.diagram-viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.diagram-viewport.is-dragging {
  cursor: grabbing;
}

.diagram-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: flex;
  gap: 6px;
  opacity: 0.3;
  transition: opacity 0.15s;
}

.diagram-viewport:hover .diagram-toolbar,
.diagram-toolbar:focus-within {
  opacity: 1;
}

.zoom-button {
  border: 1px solid var(--line);
  background: var(--card-raised);
  color: var(--ink);
  border-radius: 10px;
  min-width: 40px;
  min-height: 36px;
  padding: 0 10px;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.zoom-button:hover {
  border-color: var(--accent);
  background: var(--card-hover-bg);
}

.diagram-stage {
  width: fit-content;
  transform-origin: 0 0;
}

.diagram-stage .mermaid {
  width: fit-content;
}

.diagram-note {
  margin-top: 6px;
  font-size: 0.85rem;
  color: var(--muted);
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
  font-size: 0.8rem;
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
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--card-raised);
  color: var(--ink);
  transition: border-color 0.2s, background 0.2s;
}

.index-card:hover {
  border-color: var(--accent);
  background: var(--card-hover-bg);
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
    color: #000;
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
    background: #fff;
    color: #000;
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
    background: #fff;
  }

  h1, h2, h3 {
    color: #000;
  }

  h2, h3 {
    break-after: avoid;
  }

  .diagram-viewport,
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


def app_page_template(title: str, content: str, print_filename: str) -> str:
    """App-themed version of page_template for the Vercel app (follows the in-app light/dark toggle)."""
    base = page_template(title, content, print_filename)
    # Remove Google Fonts, use absolute CSS path, and sync the theme with the parent app
    base = base.replace(
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        "  <link href=\"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Sans+3:wght@400;600;700&display=swap\" rel=\"stylesheet\">\n"
        '  <link rel="stylesheet" href="./assets/site.css">',
        f'{APP_THEME_SCRIPT}\n'
        '  <link rel="stylesheet" href="/diagrams/assets/site.css">\n'
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
  {APP_THEME_SCRIPT}
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

    # --- Also build the app copy for Vercel (theme-aware: follows the in-app light/dark toggle) ---
    app_assets = APP_DIR / "assets"
    app_assets.mkdir(parents=True, exist_ok=True)
    (app_assets / "site.css").write_text(APP_CSS_THEMED, encoding="utf-8")

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
