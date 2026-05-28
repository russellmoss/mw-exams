# P3 Special -- Mermaid Study Diagrams

## 1. Stem Routing: Which Family?

```mermaid
flowchart TD
    START["Read P3 stem"] --> V{"Same variety?"}
    V -->|Yes| F1["F1 Cross-Style<br/>(one grape across<br/>sparkling/still/sweet)"]
    V -->|No| O{"Same country<br/>or region?"}
    O -->|Yes| F2["F2 Same Origin<br/>(regional diversity)"]
    O -->|No| METHOD{"Method/production<br/>marks dominate?<br/>'winemaking techniques'<br/>'method of production'"}
    METHOD -->|Yes| F5_OR_6{"RS/alcohol axis<br/>explicitly tested?"}
    F5_OR_6 -->|"'State RS and alcohol'<br/>ladder language"| F6["F6 Style Axis<br/>(RS x alcohol matrix)"]
    F5_OR_6 -->|"Method explanation<br/>is the mark driver"| F5["F5 Method<br/>(production dominant)"]
    METHOD -->|No| HIER3{"Classification/<br/>commercial marks<br/>dominate?"}
    HIER3 -->|Yes| F7["F7 Hierarchy<br/>(classification ladder)"]
    HIER3 -->|No| F4["F4 Breadth<br/>(anti-overlink)"]

    style F1 fill:#e8f5e9
    style F2 fill:#e3f2fd
    style F4 fill:#fce4ec
    style F5 fill:#f3e5f5
    style F6 fill:#e0f7fa
    style F7 fill:#fff9c4
```

## 2. Visual Triage (Layer A.5 -- before you smell)

```mermaid
flowchart TD
    EYES["LOOK at the flight<br/>before picking up a glass"] --> BUB{"Bubbles?"}
    BUB -->|"Persistent mousse"| SPARK_VIS["SPARKLING<br/>→ use sparkling tree"]
    BUB -->|"Slight spritz"| SEMI_VIS["Semi-sparkling?<br/>(Lambrusco / pet-nat)"]
    BUB -->|"None"| COLOR{"Color?"}

    COLOR -->|"Pale lemon<br/>to straw"| PALE["Sweet white<br/>or rare dry still"]
    COLOR -->|"Deep gold<br/>to amber"| AMBER["Oxidative / aged sweet<br/>Vin Santo, old Sauternes,<br/>Tokaji, Jura, Sherry"]
    COLOR -->|"Mahogany<br/>to brown"| DARK["Old fortified<br/>Tawny 20-40yr, Madeira,<br/>Rutherglen, PX"]
    COLOR -->|"Deep ruby<br/>to purple"| RUBY["Young fortified red<br/>Ruby/LBV Port,<br/>Banyuls Rimage, Recioto"]
    COLOR -->|"Garnet<br/>to brick"| GARNET["Aged Port/Banyuls<br/>or mature still red"]
    COLOR -->|"Salmon<br/>to pink"| PINK["ROSE<br/>→ use rose leaves"]
    COLOR -->|"Copper<br/>to orange"| ORANGE["CURVEBALL:<br/>Orange/amber wine"]

    AMBER --> TEARS{"Thick tears?"}
    DARK --> TEARS
    RUBY --> TEARS
    TEARS -->|"Very slow, viscous"| FORT_SWEET["High sugar or<br/>high alcohol<br/>→ FORTIFIED or SWEET"]
    TEARS -->|"Normal"| CHECK["Confirm on nose<br/>before committing"]

    style EYES fill:#fff3e0,stroke:#e65100
    style SPARK_VIS fill:#e8f5e9
    style FORT_SWEET fill:#fce4ec
    style ORANGE fill:#f3e5f5
```

### Visual Triage Quick-Reference

```mermaid
flowchart LR
    VT["Color → Category<br/>Quick Map"] --> C1["Pale + bubbles<br/>= Sparkling"]
    VT --> C2["Gold/amber + still<br/>= Oxidative or<br/>aged sweet"]
    VT --> C3["Dark brown + still<br/>= Old fortified"]
    VT --> C4["Ruby/purple + still<br/>= Young fortified red"]
    VT --> C5["Pink<br/>= Rose"]
    VT --> C6["Copper/orange<br/>= Amber wine"]

    style VT fill:#fff3e0,stroke:#e65100
```

## 3. F5 Method -- THE Engine of P3 (10 questions)

### Step 1: Production Family Lock

```mermaid
flowchart TD
    FIRST["DO NOT start with variety.<br/>Start with production family."] --> EFF{"Effervescence?"}
    EFF -->|"Full mousse"| SPARK["SPARKLING"]
    EFF -->|"Petillant"| SEMI["Semi-sparkling<br/>(Lambrusco/pet-nat)"]
    EFF -->|"Still"| SPIRIT{"Spirit warmth?<br/>Above 16%?"}
    SPIRIT -->|Yes| FORT["FORTIFIED"]
    SPIRIT -->|No| SWEET{"Sweet?"}
    SWEET -->|Yes| SWEET_FAM["SWEET<br/>(non-fortified)"]
    SWEET -->|No| OX{"Oxidative markers?<br/>Walnut/almond/aldehyde?"}
    OX -->|Yes| OX_FAM["OXIDATIVE /<br/>FLOR / UNUSUAL"]
    OX -->|No| STILL["DRY STILL<br/>(rare in F5)"]

    style FIRST fill:#f3e5f5,stroke:#7b1fa2
```

### Step 2: Within Each Family

```mermaid
flowchart LR
    SPARK2["SPARKLING"] --> S_METH{"Mousse + autolysis?"}
    S_METH -->|"Fine persistent<br/>+ biscuit/brioche"| TRAD["Traditional method"]
    S_METH -->|"Soft frothy<br/>+ pear/apple"| TANK["Tank/Charmat"]

    TRAD --> TRAD_O{"Acid + finish?"}
    TRAD_O -->|"Tight, longest finish"| CHAMP["Champagne"]
    TRAD_O -->|"Green apple, very high acid"| ENG["English sparkling"]
    TRAD_O -->|"Softer mid, almond"| CAVA["Cava"]
    TRAD_O -->|"Elegant, moderate"| CREM["Cremant"]

    TANK --> TANK_O{"Fruit + alc?"}
    TANK_O -->|"Pear, 11%"| PROS["Prosecco"]
    TANK_O -->|"Red fruit, low alc"| LAMB["Lambrusco"]
```

```mermaid
flowchart LR
    FORT2["FORTIFIED"] --> F_OX{"Oxidation profile?"}
    F_OX -->|"Saline/almond<br/>bruised apple<br/>BONE DRY"| FLOR["Fino/Manzanilla<br/>(flor-aged)"]
    F_OX -->|"Walnut/orange peel<br/>DRY"| OLOR["Oloroso<br/>(oxidative aged)"]
    F_OX -->|"Volatile lift<br/>curry/nuts<br/>ELECTRIC ACID"| MAD["Madeira"]
    F_OX -->|"Sweet red fruit<br/>grippy tannin<br/>spirit heat"| PORT["Port"]
    F_OX -->|"Brown nut<br/>raisin/caramel<br/>very sweet"| PX_TW["PX or old Tawny"]

    FLOR --> FLOR_D{"More saline?"}
    FLOR_D -->|"Yes, lighter"| MANZ["Manzanilla"]
    FLOR_D -->|"Broader, yeastier"| FINO2["Fino"]

    PORT --> PORT_T{"Fruit vs nut?"}
    PORT_T -->|"Bright red/black fruit"| RUBY["Ruby/LBV/Vintage"]
    PORT_T -->|"Cooked fruit+rancio"| TAWNY["Tawny 10/20/40yr"]
```

```mermaid
flowchart LR
    SW["SWEET<br/>(non-fortified)"] --> MECH{"Mechanism?"}
    MECH -->|"Honey/saffron<br/>low alc, high acid<br/>botrytis funk"| BOT["BOTRYTIS"]
    MECH -->|"Pure frozen fruit<br/>electric acid<br/>~10% ABV"| ICE["ICEWINE"]
    MECH -->|"Raisin/fig/nut<br/>14-16% no spirit heat"| PASS["PASSITO"]
    MECH -->|"Light floral<br/>off-dry, moderate"| LH["LATE HARVEST"]

    BOT --> BOT_O{"Signature?"}
    BOT_O -->|"Orange peel+ginger"| TOK["Tokaji Aszu"]
    BOT_O -->|"Beeswax+pineapple"| SAUT["Sauternes"]
    BOT_O -->|"Lime+petrol structure"| BA_TBA["BA / TBA"]

    ICE --> ICE_O{"Grape?"}
    ICE_O -->|"Tropical"| VID["Vidal (Canada)"]
    ICE_O -->|"Lime+petrol"| REIS_ICE["Riesling Eiswein"]

    PASS --> PASS_O{"Profile?"}
    PASS_O -->|"Nutty, amber"| VSAN["Vin Santo"]
    PASS_O -->|"Dried red fruit"| REC["Recioto"]
```

## 4. F4 Breadth -- Anti-Overlink (9 questions)

```mermaid
flowchart TD
    RULE3["HARD RULE:<br/>Each wine is a<br/>SEPARATE problem.<br/>Reset between wines."] --> CAT{"Category first:"}
    CAT -->|"Sparkling"| USE_SPARK["Use F5 sparkling tree"]
    CAT -->|"Fortified"| USE_FORT["Use F5 fortified tree"]
    CAT -->|"Sweet"| USE_SWEET["Use F5 sweet tree"]
    CAT -->|"Rose"| ROSE{"Pale pink?<br/>light body?"}
    CAT -->|"Dry still"| STILL3["Treat as P1/P2<br/>variety ID problem"]

    ROSE -->|"Provence style"| PROV["Grenache/Cinsault<br/>Provence"]
    ROSE -->|"Darker, structured"| OTHER_R["Tavel / Rioja rosado<br/>/ NW Pinot rose"]

    style RULE3 fill:#fce4ec,stroke:#c62828
```

## 5. F1 Cross-Style Single Variety (4 questions)

```mermaid
flowchart LR
    ANCHOR["Find the cleanest<br/>DRIEST wine.<br/>Confirm grape there."] --> LOCK3["Lock grape.<br/>Do NOT flip on<br/>sweet/sparkling wines."]
    LOCK3 --> GRAPES{"Which grape<br/>spans P3 categories?"}
    GRAPES -->|"Lime+petrol across<br/>dry/sweet/Sekt"| RIES3["Riesling"]
    GRAPES -->|"Quince+wax across<br/>dry/sweet/Cremant"| CHEN3["Chenin Blanc"]
    GRAPES -->|"Apple+lees across<br/>still/Champagne"| CHAR3["Chardonnay"]
    GRAPES -->|"Strawberry+pepper<br/>still/VDN/rose"| GREN3["Grenache"]
    GRAPES -->|"Floral+grapey<br/>dry/sweet/Asti"| MUSC3["Muscat"]
    GRAPES -->|"Smoke+honey across<br/>dry/Aszu"| FUR3["Furmint"]
```

## 6. F6 Style Axis -- RS x Alcohol Matrix (4 questions)

```mermaid
flowchart TD
    EST["1. Estimate ALCOHOL<br/>from warmth/weight"] --> RS["2. Estimate RS<br/>from sweetness x acid"]
    RS --> PLOT["3. Plot on matrix:"]

    PLOT --> GRID["RS x Alcohol Grid"]

    GRID --> LL["LOW RS + LOW ALC<br/>Mosel Kabinett<br/>Vouvray demi-sec"]
    GRID --> LH["LOW RS + HIGH ALC<br/>Dry table outlier"]
    GRID --> HL["HIGH RS + LOW ALC<br/>Icewine ~250g/L ~10%<br/>BA/TBA ~150g/L ~11%"]
    GRID --> HH["HIGH RS + HIGH ALC<br/>Sauternes ~120g/L ~14%<br/>Tokaji Aszu ~13%"]
    GRID --> VH["VERY HIGH RS + FORT<br/>PX, old Tawny<br/>Rutherglen Muscat"]

    style GRID fill:#e0f7fa,stroke:#006064
```

## 7. F7 Hierarchy -- Classification Cards (3 questions)

```mermaid
flowchart TD
    CAT7["Category lock"] --> SYS{"Which classification<br/>system?"}
    SYS -->|Port| PORT7["Ruby -> LBV -> Vintage<br/>10yr Tawny -> 20yr -> 40yr"]
    SYS -->|Sherry| SHER7["Fino -> Amontillado -> Oloroso<br/>VOS (20yr) -> VORS (30yr)"]
    SYS -->|Madeira| MAD7["3yr blend -> 5yr -> 10yr<br/>15yr -> 20yr -> Frasqueira"]
    SYS -->|Champagne| CHAMP7["NV -> Vintage -> Prestige<br/>Blanc de Blancs GC"]
    SYS -->|Tokaji| TOK7["Dry Furmint -> Szamorodni<br/>Aszu 5p -> Aszu 6p -> Eszencia"]
    SYS -->|"German Riesling"| GER7["Kabinett -> Spatlese -> Auslese<br/>BA -> TBA / GG"]

    PORT7 --> RULE7["Conservative rule:<br/>When between two tiers,<br/>choose the LOWER one"]
    SHER7 --> RULE7
    MAD7 --> RULE7

    style RULE7 fill:#fff9c4,stroke:#f57f17
```
