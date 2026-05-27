# P1 Whites -- Mermaid Study Diagrams

## 1. Stem Routing: Which Family?

```mermaid
flowchart TD
    START["Read P1 stem"] --> V{"Same variety<br/>stated or implied?"}
    V -->|Yes| F1["F1 Same Variety"]
    V -->|No| O{"Same country<br/>or region?"}
    O -->|Yes| BLEND{"Blend language?<br/>'same two varieties'<br/>'blends'"}
    BLEND -->|Yes| F3["F3 Blend Logic"]
    BLEND -->|No| HIER{"Heavy quality/<br/>classification marks?<br/>Cru/tier language?"}
    HIER -->|Yes| F7["F7 Hierarchy"]
    HIER -->|No| F2["F2 Same Origin"]
    O -->|No| METHOD{"Method/style marks<br/>dominate? Origin<br/>de-emphasised?"}
    METHOD -->|Yes| F5["F5 Method"]
    METHOD -->|No| F4["F4 Breadth<br/>(anti-overlink)"]

    style F1 fill:#e8f5e9
    style F2 fill:#e3f2fd
    style F3 fill:#fff3e0
    style F4 fill:#fce4ec
    style F5 fill:#f3e5f5
    style F7 fill:#fff9c4
```

## 2. F1 Same Variety -- Tasting Tree (11 questions)

```mermaid
flowchart LR
    LOCK["Lock the grape<br/>on the cleanest wine"] --> AROMA{"Aroma family?"}
    AROMA -->|"Citrus/apple<br/>chalk/restraint"| CHARD["Chardonnay"]
    AROMA -->|"Lime/petrol<br/>electric acid"| RIES["Riesling"]
    AROMA -->|"Pyrazine<br/>tropical/herb"| SB["Sauvignon Blanc"]
    AROMA -->|"Wax/lanolin<br/>quince/phenolic"| CHENIN["Chenin Blanc"]
    AROMA -->|"Lychee/rose<br/>spice/broad"| GEWURZ["Gewurztraminer"]

    CHARD --> CHARD_O{"Oak/lees/MLF?"}
    CHARD_O -->|"Steel, chalk"| CHAB["Chablis"]
    CHARD_O -->|"Butter, vanilla"| BURG["Burgundy CdB"]
    CHARD_O -->|"Tropical, plush oak"| NW_CH["Napa/Margaret River/SA"]

    RIES --> RIES_O{"Alcohol + acid?"}
    RIES_O -->|"7-9% electric"| MOSEL["Mosel"]
    RIES_O -->|"12-13% dry power"| ALS_R["Alsace/GG"]
    RIES_O -->|"11-12% lime cordial"| CLARE["Clare/Eden Valley"]

    SB --> SB_O{"Pyrazine intensity?"}
    SB_O -->|"Flint/smoke/restraint"| LOIRE_SB["Loire"]
    SB_O -->|"Passionfruit/intense"| MARL["Marlborough"]
    SB_O -->|"Moderate, green fig"| SA_SB["South Africa"]
```

## 3. F2 Same Origin -- Tasting Tree (8 questions)

```mermaid
flowchart TD
    ORIGIN["Lock the country first"] --> WHICH{"Which country?"}
    WHICH -->|France| FR["Chenin Loire<br/>+ Riesling Alsace<br/>+ Melon Muscadet<br/>+ Chardonnay Burgundy<br/>+ Savagnin Jura"]
    WHICH -->|Italy| IT["Pinot Grigio Alto Adige<br/>+ Gewurz Alto Adige<br/>+ Carricante Etna<br/>+ Garganega Soave<br/>+ Fiano Campania"]
    WHICH -->|Spain| ES["Albarino Rias Baixas<br/>+ Viura Rioja<br/>+ Verdejo Rueda<br/>+ Godello Bierzo"]
    WHICH -->|Australia| AU["Riesling Clare<br/>+ Chardonnay Margaret R<br/>+ Marsanne Victoria<br/>+ Semillon Hunter"]
    WHICH -->|South Africa| ZA["Chenin Swartland<br/>+ Chardonnay Hemel<br/>+ Sauvignon Blanc<br/>+ Semillon"]
    WHICH -->|USA| US["Chardonnay<br/>+ Pinot Gris Oregon<br/>+ Moscato"]
```

## 4. F3 Blend Logic -- Tasting Tree (4 questions)

```mermaid
flowchart LR
    FAMILY{"Blend family<br/>from lead aroma?"} -->|"Grass/citrus<br/>wax/oak"| BDX["Bordeaux Blanc<br/>SB + Semillon"]
    FAMILY -->|"Stone fruit/fennel<br/>wax/high alc"| RHONE["Rhone Blanc<br/>Marsanne/Roussanne"]
    FAMILY -->|"Oxidative/nut<br/>dried apple"| IBERIAN["White Rioja<br/>or Jura"]
    FAMILY -->|"Quince/wax<br/>reductive"| LOIRE_BL["Loire Chenin<br/>blend (rare)"]

    BDX --> BDX_O{"Oak + region?"}
    BDX_O -->|"New oak, rich"| PESSAC["Pessac-Leognan"]
    BDX_O -->|"Tropical, balanced"| MR_BL["Margaret River"]
    BDX_O -->|"Lean, citrus"| GRAVES["Graves/dry Bordeaux"]

    RHONE --> RH_O{"Weight + herb?"}
    RH_O -->|"Heavy, fennel, full"| CDP["Chateauneuf Blanc"]
    RH_O -->|"Elegant, apricot"| HERM["Hermitage Blanc"]
```

## 5. F4 Breadth -- Tasting Tree (9 questions)

```mermaid
flowchart TD
    RULE["HARD RULE:<br/>Do NOT infer wine N<br/>from wine N-1"] --> PER["Per wine independently:"]
    PER --> COL{"Colour?"}
    COL -->|"Pale lemon"| AROM{"Aroma?"}
    COL -->|"Mid-deep gold"| OAK_OX{"Oak or oxidative?"}
    COL -->|"Amber"| ORANGE["Orange/qvevri<br/>skin-contact"]

    AROM -->|"Pyrazine"| SB4["Sauvignon Blanc"]
    AROM -->|"Petrol/lime"| RIES4["Riesling"]
    AROM -->|"Lychee/rose"| GW4["Gewurztraminer"]
    AROM -->|"Peach/perfume"| VIOG["Viognier"]
    AROM -->|"Floral/pithy"| SPAIN4["Albarino/Verdejo"]
    AROM -->|"White pepper<br/>lentil"| GV["Gruner Veltliner"]
    AROM -->|"Saline/chalky"| ASS["Assyrtiko/Garganega"]

    OAK_OX -->|"Apple/lees/MLF"| CHARD4["Chardonnay"]
    OAK_OX -->|"Wax/lanolin"| SEM_CH["Semillon or<br/>oaked Chenin"]
    OAK_OX -->|"Smoke/nuts/dry"| RIOJA_J["White Rioja<br/>or Jura oxidative"]

    style RULE fill:#fce4ec,stroke:#c62828
```

## 6. F5 Method -- Key Signals (2 questions)

```mermaid
flowchart LR
    LEAD["Lead with<br/>PRODUCTION<br/>not variety"] --> INT{"Intervention level?"}
    INT -->|"Nature-dominant:<br/>pure mineral, low alc,<br/>no oak"| NAT["Mosel Riesling"]
    INT -->|"Intermediate:<br/>lemon+chalk+oak+lees"| MID["Burgundy Chardonnay"]
    INT -->|"Human-dominant:<br/>smoke+nuts+oxidative"| HUM{"Which method?"}
    HUM -->|"Extended oak ageing"| WR["White Rioja GR"]
    HUM -->|"Appassimento+barrel"| VS["Vin Santo"]
    HUM -->|"Sous voile ageing"| VJ["Vin Jaune/Jura"]
    HUM -->|"Clay vessel+skin"| QV["Qvevri/orange"]
```

## 7. F7 Hierarchy -- Key Signals (3 questions)

```mermaid
flowchart TD
    REGION["Confirm region"] --> LADDER{"Place on ladder<br/>by concentration,<br/>length, complexity"}
    LADDER -->|"Lean, short"| ENTRY["Village / entry"]
    LADDER -->|"Moderate depth"| MID7["Premier Cru /<br/>Federspiel / GG"]
    LADDER -->|"Concentrated,<br/>long, integrated"| TOP["Grand Cru /<br/>Smaragd / Auslese"]

    ENTRY --> CAL["Conservative rule:<br/>when between two tiers,<br/>choose LOWER"]
    MID7 --> CAL
    TOP --> CAL

    style CAL fill:#fff9c4,stroke:#f57f17
```
