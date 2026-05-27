# P2 Reds -- Mermaid Study Diagrams

## 1. Stem Routing: Which Family?

```mermaid
flowchart TD
    START["Read P2 stem"] --> V{"Same variety<br/>stated or implied?"}
    V -->|Yes| F1["F1 Same Variety<br/>(Pinot/Syrah/Cab)"]
    V -->|No| BL{"Blend language?<br/>'Bordeaux varieties'<br/>'blends'"}
    BL -->|Yes| F3["F3 Blend Logic<br/>(Bordeaux/GSM/Iberian)"]
    BL -->|No| O{"Same country<br/>or region?"}
    O -->|Yes| HIER{"Heavy quality/<br/>classification marks?"}
    HIER -->|Yes| F7["F7 Hierarchy"]
    HIER -->|No| F2["F2 Same Origin"]
    O -->|No| F4["F4 Breadth<br/>(anti-overlink)"]

    style F1 fill:#e8f5e9
    style F2 fill:#e3f2fd
    style F3 fill:#fff3e0
    style F4 fill:#fce4ec
    style F7 fill:#fff9c4
```

## 2. F1 Same Variety -- Tasting Tree (10 questions)

```mermaid
flowchart TD
    LOCK["Confirm grape on<br/>the most typical wine.<br/>Do NOT flip later."] --> GRAPE{"Grape family?"}

    GRAPE -->|"Translucent ruby<br/>red fruit, earth<br/>high acid, fine tannin"| PN["Pinot Noir"]
    GRAPE -->|"Purple, pepper<br/>violets, smoked meat<br/>savoury frame"| SY["Syrah/Shiraz"]
    GRAPE -->|"Cassis, cedar<br/>graphite, firm tannin"| CS["Cabernet Sauvignon"]
    GRAPE -->|"Pale garnet<br/>rose, tar, savage tannin"| NEB["Nebbiolo"]
    GRAPE -->|"Sour cherry<br/>dried herb, high acid"| SANG["Sangiovese"]

    PN --> PN_O{"Earth/restraint<br/>vs cherry/ripeness?"}
    PN_O -->|"Earth + mushroom"| BURG_PN["Burgundy"]
    PN_O -->|"Cherry + purity"| NZ_PN["NZ/Oregon"]
    PN_O -->|"Riper, broader"| SONO["Sonoma/Yarra"]
    PN_O -->|"Smoke + spice"| GER_PN["Germany"]

    SY --> SY_O{"Pepper vs jam?"}
    SY_O -->|"Pepper + savoury"| NRH["N. Rhone/Hawke's Bay"]
    SY_O -->|"Jam + sweet oak + alc"| BAR["Barossa/McLaren Vale"]
    SY_O -->|"Medium, olive"| SA_SY["Stellenbosch/Swartland"]

    CS --> CS_O{"Restraint vs plush?"}
    CS_O -->|"Lean + cedar + gravel"| BDX_CS["Bordeaux"]
    CS_O -->|"Plush + density + oak"| NAPA["Napa/Stellenbosch"]
    CS_O -->|"Eucalyptus + mint"| COONA["Coonawarra/Margaret R"]
```

## 3. F2 Same Origin -- Tasting Tree (8 questions)

```mermaid
flowchart TD
    ORIGIN["Lock the country"] --> WHICH{"Which country?"}
    WHICH -->|France| FR2["Pinot Noir Burgundy<br/>+ Cab/Merlot Bordeaux<br/>+ Syrah Rhone<br/>+ Grenache S. Rhone"]
    WHICH -->|Italy| IT2["Nebbiolo Piedmont<br/>+ Sangiovese Tuscany<br/>+ Aglianico Campania<br/>+ Nerello Etna<br/>+ Corvina Veneto"]
    WHICH -->|Spain| ES2["Tempranillo Rioja<br/>+ Garnacha Priorat<br/>+ Monastrell Jumilla<br/>+ Mencia Bierzo"]
    WHICH -->|"Same region"| REG{"Which region?"}
    REG -->|Bordeaux| BDX_R["Left bank Cab<br/>vs Right bank Merlot"]
    REG -->|Burgundy| BURG_R["Village vs<br/>Premier vs Grand Cru"]
    REG -->|Rhone| RH_R["N. Rhone Syrah<br/>vs S. Rhone GSM"]
    REG -->|Tuscany| TUS_R["Chianti Classico<br/>vs Brunello"]
```

## 4. F3 Blend Logic -- Tasting Tree (2 questions, high leverage)

```mermaid
flowchart TD
    FAM{"Blend family from<br/>lead aroma + tannin?"} -->|"Cassis+cedar<br/>graphite+firm"| BDX_BL["Bordeaux Family"]
    FAM -->|"Strawberry+pepper<br/>herbs+warm+alc"| GSM_BL["GSM / Rhone Family"]
    FAM -->|"Sour cherry+herb<br/>leather+high acid"| TUS_BL["Tuscan Family"]
    FAM -->|"Black fruit+vanilla<br/>Am.oak+sweet tannin"| RIO_BL["Rioja / Iberian"]
    FAM -->|"Bramble+dense+spice<br/>grippy young tannin"| DOU_BL["Douro Blend"]

    BDX_BL --> COMP{"Dominant grape?"}
    COMP -->|"Cassis structure"| CS_BL["Cab Sauv-led<br/>Left Bank/Napa/Stell"]
    COMP -->|"Plum flesh softer"| ME_BL["Merlot-led<br/>Right Bank/Chile"]
    COMP -->|"Violet+pyrazine<br/>raspberry"| CF_BL["Cab Franc-led<br/>Loire/Stellenbosch"]

    GSM_BL --> GSM_COMP{"Dominant?"}
    GSM_COMP -->|"Warm strawberry"| GR_BL["Grenache-led<br/>Chateauneuf/Priorat"]
    GSM_COMP -->|"Black olive+meat"| MV_BL["Mourvedre-led<br/>Bandol"]

    style BDX_BL fill:#fff3e0,stroke:#e65100
    style GSM_BL fill:#e8f5e9,stroke:#2e7d32
```

## 5. F4 Breadth -- Tasting Tree (15 questions, largest bucket)

```mermaid
flowchart TD
    RULE["HARD RULE:<br/>Do NOT infer wine N<br/>from wine N-1"] --> PER["Per wine independently:"]
    PER --> COL{"Colour + intensity?"}
    COL -->|"Translucent ruby"| LIGHT{"Red fruit profile?"}
    COL -->|"Mid ruby-purple"| MED{"Fruit + structure?"}
    COL -->|"Deep purple-black"| DARK{"Tannin + oak?"}

    LIGHT -->|"Cherry+earth+fine"| PN4["Pinot Noir"]
    LIGHT -->|"Cherry+banana+light"| GAM4["Gamay"]
    LIGHT -->|"Tomato leaf+pyrazine"| CF4["Cab Franc"]
    LIGHT -->|"Alpine spice+fresh"| BF4["Blaufrankisch"]

    MED -->|"Sour cherry+herb+acid"| SANG4["Sangiovese"]
    MED -->|"Cherry+dust+Am.oak"| TEMP4["Tempranillo"]
    MED -->|"Pepper+violet+savoury"| SY4["Cool Syrah"]
    MED -->|"Dried herb+smoky"| XINO["Xinomavro"]

    DARK -->|"Cassis+cedar+graphite"| CS4["Cab Sauv"]
    DARK -->|"Jam+pepper+sweet oak"| SHIR4["Warm Shiraz"]
    DARK -->|"Smoky+tar+cocoa"| PINO4["Pinotage"]
    DARK -->|"Rose+tar+savage"| NEB4["Nebbiolo"]
    DARK -->|"Plum+chocolate+soft"| MERL4["Merlot"]

    style RULE fill:#fce4ec,stroke:#c62828
```

## 6. F7 Hierarchy -- Key Signals (2 questions)

```mermaid
flowchart LR
    REG7["Confirm region<br/>(usually Bordeaux<br/>or Burgundy)"] --> PLACE{"Place on ladder<br/>by concentration,<br/>length, complexity,<br/>integration"}
    PLACE -->|"Short, simple"| E7["Village / Cru Bourgeois"]
    PLACE -->|"Moderate complexity"| M7["Premier Cru /<br/>Reserva"]
    PLACE -->|"Concentrated,<br/>very long finish"| T7["Grand Cru /<br/>Classified Growth /<br/>Gran Reserva"]

    T7 --> VIN{"Vintage ID?<br/>Tertiary markers<br/>cohort knowledge"}

    style E7 fill:#e3f2fd
    style M7 fill:#fff3e0
    style T7 fill:#fce4ec
```
