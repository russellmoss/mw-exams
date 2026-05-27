# Top Variety Confirmation Cards

The 12 most-tested varieties in the MW corpus with their diagnostic markers.

## White Varieties

```mermaid
flowchart LR
    subgraph CHARDONNAY ["Chardonnay (35 wines)"]
        CH_SIG["Apple, citrus, stone fruit"]
        CH_OAK["± butter, vanilla, hazelnut"]
        CH_TELL["MLF cream + lees weight"]
        CH_SPLIT["Steel/chalk = Chablis<br/>Rich/oak = CdB/Napa<br/>Tropical/plush = NW"]
    end

    subgraph RIESLING ["Riesling (21 wines)"]
        R_SIG["Lime, green apple, floral"]
        R_TELL["PETROL + electric acid"]
        R_ALC["Alcohol is the key:<br/>7-9% = Mosel<br/>11-12% = Clare/Eden<br/>12-13% = Alsace/GG"]
    end

    subgraph SAUVIGNON_BLANC ["Sauvignon Blanc (14 wines)"]
        SB_SIG["Pyrazine: grass, bell pepper"]
        SB_TELL["Passionfruit = Marlborough<br/>Flint/smoke = Loire<br/>Green fig = SA/Chile"]
        SB_TRAP["Trap: can look like<br/>young Chenin if no pyrazine"]
    end

    subgraph CHENIN_BLANC ["Chenin Blanc (13 wines)"]
        CB_SIG["Wax, lanolin, quince"]
        CB_TELL["Phenolic grip on finish<br/>+ high acid even when ripe"]
        CB_SPLIT["Reductive/lean = Loire<br/>Rich/barrel = Swartland<br/>Honeyed = Vouvray moelleux"]
    end
```

## Red Varieties

```mermaid
flowchart LR
    subgraph PINOT_NOIR ["Pinot Noir (27 wines)"]
        PN_SIG["Translucent ruby colour"]
        PN_TELL["Red fruit + earth + HIGH ACID<br/>+ fine silky tannin"]
        PN_SPLIT["Earth/mushroom = Burgundy<br/>Cherry/purity = NZ<br/>Riper/spice = Sonoma/Yarra<br/>Smoke+structure = Germany"]
    end

    subgraph SYRAH ["Syrah/Shiraz (10 wines)"]
        SY_SIG["Pepper, violets, dark fruit"]
        SY_TELL["Cool: pepper+meat+savoury<br/>Warm: jam+sweet oak+high alc"]
        SY_SPLIT["Pepper = N.Rhone/Hawkes Bay<br/>Jam+oak = Barossa<br/>Olive = Stellenbosch"]
    end

    subgraph CAB_SAUV ["Cabernet Sauvignon (in blends, ~15 wines)"]
        CS_SIG["Cassis, cedar, graphite"]
        CS_TELL["Firm fine-grained tannin<br/>+ structural backbone"]
        CS_SPLIT["Cedar/gravel = Bordeaux<br/>Plush/dense = Napa<br/>Eucalyptus = Coonawarra<br/>Cocoa/polish = Super Tuscan"]
    end

    subgraph SANGIOVESE ["Sangiovese (7 wines)"]
        SG_SIG["Sour cherry, dried herbs"]
        SG_TELL["HIGH ACID + savoury<br/>+ dusty/leather tannin"]
        SG_SPLIT["Lean/herbs = Chianti CL<br/>Concentrated = Brunello<br/>Oak polish = Super Tuscan"]
    end
```

## P3 Fortified/Sweet Varieties

```mermaid
flowchart LR
    subgraph PALOMINO ["Palomino / Sherry (8 wines)"]
        PA_SIG["Saline, almond, chamomile"]
        PA_TELL["Bone dry + aldehydic<br/>= flor-aged (Fino/Manz)<br/>Walnut + dry = Oloroso<br/>Delicate + dry = Palo Cortado"]
        PA_KEY["Key: 15% = flor limit<br/>Above 17% = oxidative only"]
    end

    subgraph TOURIGA ["Touriga Nacional / Port (9 wines)"]
        TN_SIG["Violets, cassis, dark chocolate"]
        TN_TELL["Spirit warmth + RS<br/>+ grippy young tannin = Port"]
        TN_SPLIT["Bright fruit = Ruby/LBV<br/>Cooked fruit+rancio = Tawny<br/>Dense+structured = Vintage"]
    end

    subgraph FURMINT ["Furmint / Tokaji (5 wines)"]
        FU_SIG["Smoke, honey, orange peel"]
        FU_TELL["Ginger + saffron + electric acid<br/>= botrytis Tokaji Aszu"]
        FU_SPLIT["Dry+flinty = dry Furmint<br/>Off-dry = Szamorodni<br/>Sweet+complex = 5-6 putt Aszu"]
    end

    subgraph MUSCAT ["Muscat (7 wines)"]
        MU_SIG["Grapey, floral, orange blossom"]
        MU_TELL["Primary grapey aroma<br/>persists across all styles"]
        MU_SPLIT["Light+fizzy = Asti/Moscato<br/>Rich+sweet = Rutherglen<br/>Amber+dried = VDN Beaumes"]
    end
```

## Quick-Reference: The 5 Killer Tells

```mermaid
flowchart TD
    subgraph TELLS ["If you see THIS, commit IMMEDIATELY"]
        T1["Petrol + lime + electric acid<br/>= RIESLING (100% reliable)"]
        T2["Lychee + rose + low acid<br/>= GEWURZTRAMINER"]
        T3["Pyrazine (grass/pepper)<br/>= SAUVIGNON BLANC"]
        T4["Translucent ruby + earth<br/>+ fine tannin = PINOT NOIR"]
        T5["Saline + almond + bone dry<br/>+ 15% ABV = FINO SHERRY"]
    end

    style TELLS fill:#e8f5e9,stroke:#2e7d32
```
