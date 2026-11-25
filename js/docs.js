/**
 * Ecotoxicology Aid — English Protocol & Substance Documentation Module
 * Complete English reference guide synthesized from all 7 course laboratory PDFs:
 * 1. Algae Growth Inhibition Test (Desmodesmus subspicatus, ISO 8692 / OECD 201)
 * 2. Lemna minor Growth Inhibition Test (OECD 221 / ISO 20079)
 * 3. Daphnia magna Acute Immobilization Test (DIN 38412 L30 / ISO 6341 / OECD 202)
 * 4. Vibrio fischeri Bioluminescence Test (DIN EN ISO 11348-2 L52)
 * 5. Probit Analysis & Finney Transformation Table (Bliss 1934 / Finney)
 * 6. Bi 58 Insektenvernichter N Safety Data Sheet (SDS Rev. 10.3, 30.04.2024)
 * 7. Lambda-Cyhalothrin Environmental Chemistry, Ecotoxicity & Fate (He et al. 2008)
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});

  function buildFinneyTableHtml() {
    const M = Ecotox.Math;
    const tens = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const ones = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const header = `<tr><th>%</th>${ones.map((o) => `<th>+${o}</th>`).join("")}</tr>`;
    const body = tens
      .map((t) => {
        const cells = ones
          .map((o) => {
            const pct = t + o;
            if (pct === 0) return `<td class="muted">—</td>`;
            const val = M && M.probToProbit ? M.probToProbit(pct) : null;
            const cls = pct === 50 ? ' class="probit-50-cell"' : "";
            return `<td${cls}>${val !== null ? val.toFixed(2) : "—"}</td>`;
          })
          .join("");
        return `<tr><th>${t}</th>${cells}</tr>`;
      })
      .join("");
    return `
      <div class="doc-table-wrap">
        <table class="doc-table finney-table">
          <thead>${header}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  const DOC_SECTIONS = [
    {
      id: "algae",
      category: "Bioassay",
      badge: "ISO 8692 · OECD 201",
      title: "Algae Growth Inhibition Test (Desmodesmus subspicatus)",
      sourceFile: "Arbeitsvorschrift Algentest.pdf",
      targetTab: "od",
      targetTabLabel: "Open OD / Algae Tab",
      presetKey: "algae_geom",
      presetLabel: "Load Algae Geometric Preset",
      checklistText:
        "[Algae Test — ISO 8692 / OECD 201]\n" +
        "- Organism: Desmodesmus subspicatus (pre-culture 2–4 d at 5e3 cells/mL -> 1e4–1e5 cells/mL)\n" +
        "- Medium: Bold's Basal Medium (BBM), autoclaved with cotton plug + foil\n" +
        "- Setup: 6-well plates, >=3 replicates/conc + 3 controls, equal volume/nutrients/cell density\n" +
        "- Incubation: 23 ± 2 °C, continuous white light 60–120 µmol/(m²·s) (6,000–10,000 lx), 72 ± 2 h\n" +
        "- Measurements: Every 24 h (mix thoroughly before OD / Thoma count); check μ (1.2–1.5 d⁻¹ in control)",
      keywords: "algae algentest desmodesmus subspicatus bbm bold basal medium thoma 72h erc50 oecd 201 iso 8692 vorkultur inoculum",
      renderBody: () => `
        <div class="doc-grid-meta">
          <div class="doc-stat"><span>Organism</span><strong><em>Desmodesmus subspicatus</em></strong></div>
          <div class="doc-stat"><span>Duration</span><strong>72 ± 2 h (every 24 h)</strong></div>
          <div class="doc-stat"><span>Temperature</span><strong>23 ± 2 °C</strong></div>
          <div class="doc-stat"><span>Light</span><strong>60–120 µmol·m⁻²·s⁻¹ (6–10 klx)</strong></div>
          <div class="doc-stat"><span>Replicates</span><strong>≥ 3 / conc + 3 controls</strong></div>
          <div class="doc-stat"><span>Optimal Control μ</span><strong>1.2 – 1.5 d⁻¹</strong></div>
        </div>

        <h4>1. Principle &amp; Ecological Role</h4>
        <p>Planktonic microalgae are primary producers forming the base of aquatic food webs and contributing to biogenic oxygenation. Exponentially growing mono-species batch cultures of <em>Desmodesmus subspicatus</em> (unicellular, non-motile, oval, 7–15 µm, vegetative division; may form colonies under stress) are exposed to graded test substance concentrations over <strong>72 ± 2 hours</strong>, spanning multiple generations. Toxicity is quantified as the reduction in specific growth rate (μ) relative to untreated controls (<strong>ErC<sub>x</sub></strong>, NOEC/LOEC, or G<sub>A</sub> wastewater dilution steps).</p>

        <h4>2. Bold's Basal Medium (BBM) Recipe</h4>
        <div class="doc-two-col">
          <div>
            <strong>Macronutrient Stocks (each in 400 mL dH₂O) — add 10.0 mL/L each:</strong>
            <ol class="doc-list">
              <li>NaNO₃ — 10.0 g</li>
              <li>MgSO₄·7H₂O — 3.0 g</li>
              <li>NaCl — 1.0 g</li>
              <li>K₂HPO₄ — 3.0 g</li>
              <li>KH₂PO₄ — 7.0 g</li>
              <li>CaCl₂·2H₂O — 1.0 g</li>
            </ol>
          </div>
          <div>
            <strong>Trace Element Stocks (per 1 L, autoclave to dissolve) — add 1.0 mL/L (stocks 7–10):</strong>
            <ol start="7" class="doc-list">
              <li>ZnSO₄·7H₂O — 8.82 g</li>
              <li>MnCl₂·4H₂O — 1.44 g</li>
              <li>MoO₃ — 0.71 g</li>
              <li>CuSO₄·5H₂O — 1.57 g</li>
              <li>Co(NO₃)₂·6H₂O — 0.49 g</li>
            </ol>
            <strong>Additional Components (per 1 L):</strong>
            <p class="doc-small">12. H₃BO₃ (11.42 g) · 13. EDTA (50.0 g) · 14. KOH (31.0 g) · 15. FeSO₄·7H₂O (4.98 g) · 16. conc. H₂SO₄ (1.0 mL). Commercial concentrate: 10 mL medium + 490 mL H₂O (500 mL). Aliquot into 3×100 mL (250 mL flasks) + 4×50 mL (100 mL flasks) and autoclave with cotton plugs + aluminum foil.</p>
          </div>
        </div>

        <h4>3. Pre-Culture (Vorkultur) &amp; Inoculum</h4>
        <ul class="doc-list">
          <li>Start pre-culture <strong>2–4 days</strong> before test in Erlenmeyer flasks with cotton plugs (allows CO₂ exchange, prevents contamination).</li>
          <li>Inoculate at <strong>5 × 10³ cells/mL</strong> (2–3 d pre-culture) to maintain exponential growth up to <strong>~1 × 10⁴ to 1 × 10⁵ cells/mL</strong>.</li>
          <li>Measure pre-culture cell density immediately prior to test setup using a <strong>Thoma counting chamber</strong> (use the <em>Cell Count</em> tab + Inoculation Calculator!).</li>
          <li>Culture conditions: 23 °C, continuous universal-white light (4,300 K, 400–700 nm PAR, 70 µE·m⁻²·s⁻¹ / 60–120 µmol·m⁻²·s⁻¹ / 6,000–10,000 lx).</li>
        </ul>

        <h4>4. Concentration Series &amp; Test Setup</h4>
        <ul class="doc-list">
          <li><strong>Main test</strong>: Geometric series with spacing factor <strong>≤ 3.2</strong> (e.g., 1.0, 1.8, 3.2, 5.6, 10 mg/L). Prepare in <strong>6-well plates</strong> with equal total volume, nutrients, and initial cell density across all wells (≥3 replicates/conc + 3 controls).</li>
          <li><strong>Range-finding test</strong>: Wide spread across orders of magnitude (e.g., 0.01, 0.1, 1, 10, 100 mg/L), no replicates required, measured at 24, 48, 72 h.</li>
          <li><strong>Limit test</strong>: Single concentration with ≥6 replicates to confirm absence of toxicity.</li>
          <li><strong>Wastewater NOEC dilution series</strong>: <code>1:1.25, 1:2, 1:3, 1:4, 1:6, 1:8, 1:12</code>.</li>
          <li><strong>pH handling</strong>: Usually tested without pH adjustment; to isolate non-pH toxicity, adjust stock/sample to medium pH using 1 mol/L HCl or NaOH before diluting.</li>
          <li><strong>Incubation &amp; Measurements</strong>: Cover vessels (not airtight — allow CO₂ entry via cotton plugs). Thoroughly mix every well before measuring OD / cell count at least every 24 h for 72 ± 2 h.</li>
        </ul>

        <h4>5. Equations &amp; Endpoints</h4>
        <div class="doc-formula-box">
          <div><strong>Specific Growth Rate:</strong> <code>μ = (ln N_t − ln N_0) / t</code> (t in days or hours; 1 d⁻¹ = 24 × h⁻¹)</div>
          <div><strong>Growth Rate Inhibition:</strong> <code>Inhibition (%) = (1 − μ_sample / μ_control) × 100</code></div>
          <div><strong>ErC<sub>x</sub>:</strong> Effective concentration causing <em>x</em>% reduction in growth <em>rate</em> (e.g., ErC10, ErC20, ErC50).</div>
        </div>
      `,
    },
    {
      id: "lemna",
      category: "Bioassay",
      badge: "OECD 221 · ISO 20079",
      title: "Lemna minor Growth Inhibition Test (Common Duckweed)",
      sourceFile: "Arbeitsvorschrift_Lemna_minor_Test.pdf",
      targetTab: "lemna",
      targetTabLabel: "Open Lemna Tab",
      checklistText:
        "[Lemna minor Test — OECD 221 / ISO 20079]\n" +
        "- Organism: Healthy Lemna minor colonies (2–5 fronds/colony), 9–12 fronds/beaker, 2 replicates/conc\n" +
        "- Medium: Modified Steinberg medium or BBM, pH 5.5 ± 0.2 (max pH drift ±1.5)\n" +
        "- Vessels: Beakers >=100 mL volume, >=20 mm depth, covered against evaporation\n" +
        "- Incubation: 24 ± 2 °C, continuous light 85–135 µE·m⁻²·s⁻¹ (6,500–10,000 lx), 7 days (168 h)\n" +
        "- Counts: Day 0, Day 3, Day 7; record chlorosis, necrosis, root changes\n" +
        "- Validity: Control Td < 2.5 days AND control μ >= 0.275 d⁻¹",
      keywords: "lemna minor duckweed wasserlinse frond steinberg oecd 221 iso 20079 chlorosis necrosis doubling time 2.5 days 0.275",
      renderBody: () => `
        <div class="doc-grid-meta">
          <div class="doc-stat"><span>Organism</span><strong><em>Lemna minor</em> (2–5 fronds/col.)</strong></div>
          <div class="doc-stat"><span>Duration</span><strong>7 days (168 h)</strong></div>
          <div class="doc-stat"><span>Temperature</span><strong>24 ± 2 °C</strong></div>
          <div class="doc-stat"><span>Light</span><strong>85–135 µE·m⁻²·s⁻¹ (6.5–10 klx)</strong></div>
          <div class="doc-stat"><span>Medium pH</span><strong>5.5 ± 0.2 (drift ≤ ±1.5)</strong></div>
          <div class="doc-stat"><span>Validity</span><strong>T<sub>d</sub> &lt; 2.5 d · μ ≥ 0.275 d⁻¹</strong></div>
        </div>

        <h4>1. Principle &amp; Endpoints</h4>
        <p>Evaluates vegetative growth inhibition of the freshwater macrophyte <em>Lemna minor</em> exposed to aqueous test substances or mixtures over <strong>7 days</strong> compared against untreated negative controls (and solvent controls if applicable).</p>
        <ul class="doc-list">
          <li><strong>Primary endpoint</strong>: Visible <strong>frond number</strong> (each small leaf-like floating structure; easy to count, correlates directly with vegetative growth, doubles regularly in healthy plants).</li>
          <li><strong>Secondary endpoints</strong>: Total frond surface area (image analysis), dry mass (dried at 60 °C to constant weight), fresh mass (centrifugation), chlorophyll-<em>a</em> content.</li>
          <li><strong>Phytotoxicity observations</strong>: Document visible symptoms — <strong>chlorosis</strong> (yellowing), <strong>necrosis</strong> (white or brown dead tissue), and root alterations.</li>
        </ul>

        <h4>2. Medium, Vessels &amp; Experimental Design</h4>
        <ul class="doc-list">
          <li><strong>Test medium</strong>: Modified Steinberg medium (ISO 20079) or Bold's Basal Medium (BBM), adjusted to <strong>pH 5.5 ± 0.2</strong>.</li>
          <li><strong>Vessels</strong>: Glass beakers with minimum depth <strong>20 mm</strong> and minimum volume <strong>100 mL</strong>, covered to reduce evaporation and contamination.</li>
          <li><strong>Stocking &amp; replicates</strong>: <strong>9–12 fronds</strong> per vessel (healthy colonies of 2–5 fronds), <strong>2 replicates</strong> per concentration + negative control (+ solvent control if needed).</li>
          <li><strong>Measurement days</strong>: Count fronds on <strong>Day 0, Day 3, and Day 7</strong>.</li>
        </ul>

        <h4>3. Calculations &amp; OECD 221 Validity Criteria</h4>
        <div class="doc-formula-box">
          <div><strong>Average Frond Growth Rate:</strong> <code>μ = (ln N_t − ln N_0) / t</code></div>
          <div><strong>Inhibition:</strong> <code>Hemmung (%) = (1 − μ_sample / μ_control) × 100</code></div>
          <div><strong>Validity Checks (checked automatically in Lemna tab):</strong> Control doubling time <code>T_d = ln(2)/μ &lt; 2.5 days</code> · Control growth rate <code>μ ≥ 0.275 d⁻¹</code> · pH drift <code>≤ ±1.5 units</code>.</div>
        </div>
      `,
    },
    {
      id: "daphnia",
      category: "Bioassay",
      badge: "OECD 202 · ISO 6341 · DIN 38412 L30",
      title: "Daphnia magna Acute Immobilization Test",
      sourceFile: "Daphnientest.pdf",
      targetTab: "daphnia",
      targetTabLabel: "Open Daphnia & Probit Tab",
      presetKey: "daphnia",
      presetLabel: "Load Daphnia 20 mL Preset",
      checklistText:
        "[Daphnia magna Acute Test — OECD 202 / DIN 38412 L30]\n" +
        "- Organism: Daphnia magna neonates <24 h old from healthy stock (no ephippia/males/stress)\n" +
        "- Medium: ASTM medium (CaSO4·2H2O 60 mg, MgSO4 60 mg, NaHCO3 96 mg, KCl 4 mg / L; pH 7.6–8.0, aerated)\n" +
        "- Setup: >=20 neonates/conc (4 replicates × 5 animals), >=2 mL/animal (10 mL/vessel), >=5 conc (factor <=2.2)\n" +
        "- Incubation: 18–22 °C (±1 °C), 16:8 h light:dark (or dark for photolabile), NO aeration, NO pH adjustment, NO feeding\n" +
        "- Observations: Immobilization at 24 h and 48 h; note abnormal behavior\n" +
        "- Evaluation: Probit analysis (EC50 48h) or Geometric Mean sqrt(a*b); GD (>90% mobile); control immob. <=10%",
      keywords: "daphnia magna immobilization neonates astm medium oecd 202 din 38412 l30 iso 6341 24h 48h gd hazard dose geometric mean probit",
      renderBody: () => `
        <div class="doc-grid-meta">
          <div class="doc-stat"><span>Organism</span><strong><em>Daphnia magna</em> (&lt;24 h neonates)</strong></div>
          <div class="doc-stat"><span>Duration</span><strong>48 h (read at 24 h &amp; 48 h)</strong></div>
          <div class="doc-stat"><span>Temperature</span><strong>18–22 °C (±1 °C)</strong></div>
          <div class="doc-stat"><span>Light Cycle</span><strong>16 h L : 8 h D (or dark)</strong></div>
          <div class="doc-stat"><span>Animals / Conc</span><strong>≥ 20 (4 × 5) · ≥ 2 mL/animal</strong></div>
          <div class="doc-stat"><span>During Test</span><strong>No feeding · No aeration</strong></div>
        </div>

        <h4>1. Standards &amp; Principle</h4>
        <p><em>Daphnia magna</em> (water flea, microcrustacean primary consumer) neonates less than <strong>24 hours old</strong> are exposed to graded test concentrations for <strong>48 hours</strong>. The endpoint is <strong>immobilization</strong> (loss of swimming ability within 15 s after gentle agitation).</p>
        <ul class="doc-list">
          <li><strong>DIN 38412 L30 (24 h wastewater test)</strong>: Determines the <strong>G<sub>D</sub> value</strong> (<em>Gefährdungsdosis</em> / Hazard Dose) — lowest dilution step where <strong>&gt; 90% of daphnids remain mobile</strong>.</li>
          <li><strong>DIN EN ISO 6341-L40 / OECD 202 (48 h chemical test)</strong>: Geometric series (≥5 concentrations, factor <strong>≤ 2.2</strong>), 20 neonates/conc (4×5), reporting <strong>48 h EC<sub>50</sub></strong> (24 h optional) and <strong>NOEC / LOEC</strong>.</li>
        </ul>

        <h4>2. Identifying Developmental Stages (Use Neonates &lt; 24 h Only!)</h4>
        <div class="doc-table-wrap">
          <table class="doc-table">
            <thead><tr><th>Stage</th><th>Key Visual Characteristics</th></tr></thead>
            <tbody>
              <tr><td><strong>Neonates (&lt; 24 h)</strong></td><td>Very small (~0.5 mm), transparent, no visible eggs, no pronounced heart activity. <em>Required for testing.</em></td></tr>
              <tr><td>Juveniles (1–3 d)</td><td>Larger, more active, early development of internal organs visible.</td></tr>
              <tr><td>Adults (&gt; 4–5 d)</td><td>5–6 mm, visible brood pouch (egg chamber), reproduction begins, heart &amp; gut clearly visible.</td></tr>
              <tr><td>Gravid females</td><td>Eggs or embryos visible inside brood chamber, often darker coloration.</td></tr>
              <tr><td>Old animals (&gt; 2 wks)</td><td>Larger, slower, darker, frequently carrying ephippia (resting eggs) or discoloration.</td></tr>
            </tbody>
          </table>
        </div>

        <h4>3. ASTM Daphnia Medium (1 Liter) &amp; Culture Feeding</h4>
        <div class="doc-two-col">
          <div>
            <ul class="doc-list">
              <li><strong>CaSO₄·2H₂O</strong>: 60 mg</li>
              <li><strong>MgSO₄</strong>: 60 mg</li>
              <li><strong>NaHCO₃</strong>: 96 mg</li>
              <li><strong>KCl</strong>: 4 mg</li>
            </ul>
          </div>
          <div>
            <ul class="doc-list">
              <li>Autoclave at <strong>121 °C, 2 bar, 15 min</strong>; final pH <strong>7.6–8.0</strong>.</li>
              <li>Aerate medium to O₂ saturation before use. Store at 4 °C max <strong>1 week</strong>.</li>
              <li><strong>Stock culture feeding only</strong>: Green algae (<em>Raphidocelis subcapitata</em> / <em>Chlorella vulgaris</em>) + yeast extract daily (avoid excess). <strong>Do NOT feed during the 48 h test!</strong></li>
            </ul>
          </div>
        </div>

        <h4>4. Test Setup, Conditions &amp; Evaluation</h4>
        <ul class="doc-list">
          <li><strong>Range-finding pre-test</strong>: Wide concentration span, 5 neonates/conc, no replicates needed, up to 24–48 h.</li>
          <li><strong>Main test</strong>: ≥5 concentrations in geometric series (factor ≤2.2) spanning 0% to 100% immobilization. Identical air-to-water ratio across all vessels; ≥2 mL solution/animal (10 mL per vessel of 5 animals). Include negative dilution-water control (+ solvent control if used).</li>
          <li><strong>Conditions</strong>: 18–22 °C (±1 °C), 16:8 h light:dark (total darkness permitted for light-sensitive substances), <strong>no aeration</strong>, <strong>no pH adjustment</strong>, <strong>no feeding</strong>.</li>
          <li><strong>Acclimation</strong>: If test medium differs from stock culture medium, acclimate gravid females in dilution water ≥48 h prior to neonate collection.</li>
        </ul>
        <div class="doc-formula-box">
          <div><strong>Primary Evaluation:</strong> Probit regression (<code>Y = a + b·ln(C)</code>, solve <code>EC50</code> at <code>Y = 5</code>) — computed automatically in the <em>Daphnia &amp; Probit</em> tab!</div>
          <div><strong>Geometric Mean Fallback (when Probit is not applicable):</strong> <code>EC50 ≈ √(a × b)</code>, where <code>a</code> = highest conc. with 0% immobilization and <code>b</code> = lowest conc. with 100% immobilization.</div>
        </div>
      `,
    },
    {
      id: "vibrio",
      category: "Bioassay",
      badge: "DIN EN ISO 11348-2 L52",
      title: "Vibrio fischeri Bioluminescence Inhibition Test (Leuchtbakterientest)",
      sourceFile: "Arbeitsvorschrift Leuchtbakterientest.pdf",
      targetTab: "vibrio",
      targetTabLabel: "Open Vibrio Tab",
      presetKey: "vibrio_serial",
      presetLabel: "Load Vibrio 1:2 Serial Preset",
      checklistText:
        "[Vibrio fischeri Test — DIN EN ISO 11348-2 L52]\n" +
        "- Strain: Vibrio fischeri NRRL B-11177 (pre-culture 21±1h, main culture 20±1h at 20±1°C, >=180 rpm, 10 FAU -> 700–1800 FAU)\n" +
        "- Sample prep: O2 >3 mg/L, pH 6.0–8.5 (adjust w/ HCl/NaOH <=5% vol), add 20 g/L NaCl (~29 mS/cm; max 35 g/L), remove turbidity\n" +
        "- Pre-temper plates/media/samples >=30 min at 15 °C; Reference: ZnSO4·7H2O 219.8 mg/L; Control: 2% NaCl\n" +
        "- 96-well white plate: 50 µL bacteria -> 15 min (15–23 °C) -> 30 min (15 °C) -> read I0 -> add 250 µL sample (300 µL total) -> read I30\n" +
        "- Reader: Luminescence endpoint, Top optic, Settling 0.3 s, Interval 0.2 s, Gain 3600, Lens, Well-mode 150 intervals\n" +
        "- Formulas: fkt = Ikt/I0; Ict = I0*fkt; Hemmung % = ((Ict - It)/Ict)*100 (>20% = toxic)",
      keywords: "vibrio fischeri leuchtbakterien bioluminescence iso 11348 fkt ict lid gl nacl znso4 marine broth plate reader gain 3600 15c 30 min",
      renderBody: () => `
        <div class="doc-grid-meta">
          <div class="doc-stat"><span>Organism</span><strong><em>Vibrio fischeri</em> NRRL B-11177</strong></div>
          <div class="doc-stat"><span>Contact Time</span><strong>15 or 30 min (opt. 5 min)</strong></div>
          <div class="doc-stat"><span>Test Temp</span><strong>15 ± 1 °C</strong></div>
          <div class="doc-stat"><span>Salinity</span><strong>20 g/L NaCl (2%, ~29 mS/cm)</strong></div>
          <div class="doc-stat"><span>Toxic Threshold</span><strong>Inhibition &gt; 20%</strong></div>
          <div class="doc-stat"><span>Reference</span><strong>ZnSO₄·7H₂O (219.8 mg/L)</strong></div>
        </div>

        <h4>1. Principle &amp; Endpoints</h4>
        <p>Marine halophilic bacteria (<em>Vibrio fischeri</em>) emit cold bioluminescence directly coupled to intact cellular metabolism. Toxicants inhibit light output in a concentration-dependent manner. Inhibition <strong>&gt; 20%</strong> relative to the control-corrected baseline is considered toxic.</p>
        <ul class="doc-list">
          <li><strong>f<sub>kt</sub> (Correction factor)</strong>: Accounts for natural luminescence drift in 2% NaCl controls over contact time <em>t</em> (ISO 11348 validity: 0.6 ≤ f<sub>kt</sub> ≤ 1.8).</li>
          <li><strong>EC<sub>20</sub> / EC<sub>50</sub></strong>: Concentrations causing 20% or 50% luminescence inhibition.</li>
          <li><strong>LID / G<sub>L</sub> value</strong>: Lowest Ineffective Dilution — dilution step at which no toxic effect (&le; 20% inhibition) is observed.</li>
        </ul>

        <h4>2. Interfering Factors &amp; Sample Pretreatment</h4>
        <ul class="doc-list">
          <li><strong>Storage (ISO 5667-16)</strong>: Chemically inert, completely filled, airtight containers; test immediately or store dark at 2–5 °C (max 48 h) or −18 °C (up to 2 months). No chemical preservatives.</li>
          <li><strong>Dissolved Oxygen</strong>: Must be <strong>&gt; 3 mg/L</strong> (bioluminescence requires O₂; aerate/stir if lower).</li>
          <li><strong>pH</strong>: Acceptable range <strong>6.0–8.5</strong> without adjustment. If outside, adjust with 1 mol/L HCl or NaOH (added volume ≤ 5% of total) to 7.0 ± 0.2 (or 6.0 / 8.5 ± 0.2).</li>
          <li><strong>Salinity</strong>: Add <strong>20 g/L NaCl</strong> (~29 mS/cm). For saline samples (&gt;30 g/L NaCl), adjust only to reach 20 g/L osmolarity; never exceed <strong>35 g/L NaCl</strong> (avoids hyperosmotic stress).</li>
          <li><strong>Turbidity / Color</strong>: Strong turbidity absorbs/scatters light — settle 1 h, centrifuge 10 min at 5,000 rpm, or filter; test supernatant/filtrate.</li>
        </ul>

        <h4>3. Culture Media &amp; Bacterial Growth</h4>
        <div class="doc-two-col">
          <div>
            <strong>ISO 11348 Liquid Medium (1 L, pH 7.0 ± 0.2):</strong>
            <ul class="doc-list">
              <li>NaCl: 30.0 g · NaH₂PO₄·H₂O: 6.10 g</li>
              <li>K₂HPO₄·3H₂O: 2.75 g · MgSO₄·7H₂O: 0.204 g</li>
              <li>(NH₄)₂HPO₄: 0.500 g · Glycerol: 3 mL</li>
              <li>Caso-peptone: 5.00 g · Yeast extract: 0.50 g</li>
              <li>Aliquot 50 mL in 250 mL flasks, autoclave 121 °C / 20 min. (Stock agar: +12 g/L agar.)</li>
            </ul>
          </div>
          <div>
            <strong>Bacto Marine Broth (Difco 2216, 37.4 g/L, pH 7.6 ± 0.2):</strong>
            <p class="doc-small">Peptone 5 g, yeast extract 1 g, Fe(III) citrate 0.1 g, NaCl 19.45 g, MgCl₂ 5.9 g, Na₂SO₄ 3.24 g, CaCl₂ 1.8 g, KCl 0.55 g, NaHCO₃ 0.16 g, KBr 0.08 g, SrCl₂ 34 mg, H₃BO₃ 22 mg, Na-silicate 4 mg, NaF 2.4 mg, NH₄NO₃ 1.6 mg, Na₂HPO₄ 8 mg.</p>
            <strong>Cultivation Workflow:</strong>
            <p class="doc-small">Stock plates (2–3 d, 20 ± 1 °C; mark glowing colonies in dark; passage every 1–2 wks; fresh ampoule every 6 mo) → Pre-culture (50 mL, 21 ± 1 h, 20 °C, ≥180 rpm; measure 1:10 turbidity) → Main culture (inoculate to <strong>10 FAU</strong>, 20 ± 1 h, 20 °C, ≥180 rpm → typical final <strong>700–1,800 FAU</strong>).</p>
          </div>
        </div>

        <h4>4. Plate Reader Settings &amp; 96-Well Procedure</h4>
        <div class="doc-two-col">
          <div>
            <table class="doc-table">
              <thead><tr><th>Plate Reader Parameter</th><th>Setting</th></tr></thead>
              <tbody>
                <tr><td>Mode / Optics</td><td>Luminescence, endpoint · Top optic</td></tr>
                <tr><td>Settling / Interval time</td><td>0.3 s / 0.2 s</td></tr>
                <tr><td>Gain / Filter</td><td>Gain 3600 · Lens (no color filter)</td></tr>
                <tr><td>Kinetic mode</td><td>Well-mode · 150 intervals / well</td></tr>
              </tbody>
            </table>
          </div>
          <div>
            <ol class="doc-list">
              <li>Pre-temper plates, media, samples &amp; references <strong>≥30 min at 15 °C</strong>.</li>
              <li>Prepare dilution series, ZnSO₄·7H₂O reference (219.8 mg/L), and 2% NaCl controls in a transparent 96-well plate (2 parallel replicates/step).</li>
              <li>Pipette <strong>50 µL</strong> bacterial suspension into a <strong>white 96-well plate</strong> → incubate 15 min (15–23 °C) → cover &amp; stabilize <strong>30 min at 15 °C</strong>.</li>
              <li>Read initial luminescence <strong>I₀</strong>.</li>
              <li>Immediately transfer <strong>250 µL</strong> sample/reference/control (total <strong>300 µL/well</strong>) into white plate at 15 ± 1 °C.</li>
              <li>Read final luminescence after <strong>30 min (I₃₀)</strong>.</li>
            </ol>
          </div>
        </div>

        <h4>5. Equations</h4>
        <div class="doc-formula-box">
          <div><strong>Control Correction Factor:</strong> <code>f_kt = I_kt / I_k0</code></div>
          <div><strong>Expected Sample Luminescence:</strong> <code>I_ct = I_0 × f_kt</code></div>
          <div><strong>Luminescence Inhibition:</strong> <code>Hemmung (%) = ((I_ct − I_t) / I_ct) × 100</code></div>
        </div>
      `,
    },
    {
      id: "probit",
      category: "Statistics",
      badge: "Bliss (1934) · Finney",
      title: "Probit Analysis & Finney Transformation Table",
      sourceFile: "Probit-Analyse.pdf",
      targetTab: "daphnia",
      targetTabLabel: "Run Probit in Daphnia Tab",
      checklistText:
        "[Probit Analysis Reminder]\n" +
        "- Transform mortality % (0 < p < 100) to Probit Y = Phi^-1(p) + 5 (50% = 5.00)\n" +
        "- Plot Y vs. X = ln(Concentration) -> linear regression Y = a + b*X\n" +
        "- Solve LC50 / EC50 at Y = 5: LC50 = exp((5 - a) / b)",
      keywords: "probit bliss finney lc50 ec50 sigmoid linear regression normal distribution table mortality",
      renderBody: () => `
        <h4>1. Purpose &amp; Theoretical Basis</h4>
        <p>Many aquatic toxicants only trigger mortality once an organism-specific resistance threshold is exceeded, after which mortality rises steeply along a <strong>sigmoidal dose-response curve</strong> toward 100%. Developed by Chester Ittner Bliss (1934) and refined by David Finney, <strong>Probit analysis</strong> transforms this binary (alive/dead) sigmoidal response into a straight line suitable for linear regression to estimate <strong>LC₅₀ / EC₅₀</strong>.</p>

        <h4>2. Probit Definition &amp; Linearization</h4>
        <div class="doc-formula-box">
          <div><strong>Probit Value:</strong> Position along a normal distribution with <code>mean = 5</code> and <code>variance = 1</code>: <code>Y = Φ⁻¹(p) + 5</code> (adding 5 avoids negative numbers below 50%).</div>
          <div><strong>Linear Regression:</strong> <code>Y = a + b · X</code>, where <code>Y</code> = Probit of mortality % and <code>X = ln(Concentration)</code>.</div>
          <div><strong>LC₅₀ / EC₅₀ Solution:</strong> Set <code>Y = 5.0</code> → <code>X₅₀ = (5 − a) / b</code> → <code>LC₅₀ = exp((5 − a) / b)</code>.</div>
        </div>

        <h4>3. Quick % ↔ Probit Converter</h4>
        <div class="probit-mini-calc">
          <label>Mortality / Effect (%)
            <input type="number" id="doc-probit-pct" min="0.1" max="99.9" step="0.5" value="50" />
          </label>
          <span class="probit-arrow">⇄</span>
          <label>Probit (Y)
            <input type="number" id="doc-probit-val" min="1" max="9" step="0.01" value="5.0000" />
          </label>
          <span class="muted" id="doc-probit-note">50% = Probit 5.0000 (LC₅₀ / EC₅₀)</span>
        </div>

        <h4>4. Finney's Percentage-to-Probit Lookup Table (1% – 99%)</h4>
        ${buildFinneyTableHtml()}
      `,
    },
    {
      id: "bi58",
      category: "Substance SDS",
      badge: "SDS Rev. 10.3 · 30.04.2024",
      title: "Bi 58® Insektenvernichter N — Safety Data Sheet Summary",
      sourceFile: "Bi 58 N Sicherheitsdatenblatt.pdf",
      checklistText:
        "[Bi 58 Insektenvernichter N — Lab Safety Notes]\n" +
        "- Active ingredient: Lambda-Cyhalothrin <0.1% w/w (CAS 91465-08-6, M-factor 10,000)\n" +
        "- Preservative: 1,2-Benzisothiazol-3(2H)-on <0.05% w/w (skin sensitizer EUH208)\n" +
        "- Hazard: Warning, H410 Very toxic to aquatic life with long-lasting effects\n" +
        "- PPE: Nitrile or butyl rubber gloves (EN 374, >=0.2 mm), long-sleeved lab coat; NO drain disposal\n" +
        "- Ref Ecotox: Rainbow trout 96h LC50 = 2.0 mg/L; Daphnia magna 48h EC50 = 0.18 mg/L",
      keywords: "bi 58 bi58 sds safety data sheet sicherheitsdatenblatt compo lambda-cyhalothrin benzisothiazol h410 ppe gloves ec50 0.18 2.0",
      renderBody: () => `
        <div class="doc-grid-meta">
          <div class="doc-stat"><span>Product</span><strong>Bi 58® Insektenvernichter N</strong></div>
          <div class="doc-stat"><span>Supplier</span><strong>COMPO (SDS C5334)</strong></div>
          <div class="doc-stat"><span>Signal Word</span><strong>Warning (Achtung)</strong></div>
          <div class="doc-stat"><span>Hazard</span><strong>H410 (Aquatic Chronic 1)</strong></div>
          <div class="doc-stat"><span>Form / pH</span><strong>Liquid · pH 3–7 (10 g/L)</strong></div>
          <div class="doc-stat"><span>Density</span><strong>0.98–1.02 g/cm³ (20 °C)</strong></div>
        </div>

        <h4>1. Hazards &amp; Composition (Sections 2 &amp; 3)</h4>
        <ul class="doc-list">
          <li><strong>H410</strong>: Very toxic to aquatic life with long-lasting effects.</li>
          <li><strong>EUH208</strong>: Contains 1,2-Benzisothiazol-3(2H)-on — may produce an allergic reaction. <strong>EUH401</strong>: Follow instructions for use.</li>
          <li><strong>Precautions</strong>: P270 (do not eat/drink/smoke), P391 (collect spillage), P501 (dispose via approved hazardous waste facility — never pour into drains/watercourses).</li>
        </ul>
        <div class="doc-table-wrap">
          <table class="doc-table">
            <thead><tr><th>Ingredient</th><th>CAS No.</th><th>Conc. (% w/w)</th><th>CLP Classification &amp; M-Factor</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Lambda-Cyhalothrin (ISO)</strong></td>
                <td>91465-08-6</td>
                <td>&lt; 0.1%</td>
                <td>Acute Tox. 2 (H330), Acute Tox. 3 (H301, H311), Aquatic Acute/Chronic 1 (H400/H410) · <strong>M-Factor = 10,000</strong></td>
              </tr>
              <tr>
                <td>1,2-Benzisothiazol-3(2H)-on</td>
                <td>2634-33-5</td>
                <td>&lt; 0.05%</td>
                <td>Acute Tox. 4 (H302), Acute Tox. 2 (H330), Skin Irrit. 2, Eye Dam. 1, Skin Sens. 1A (≥0.036%), Aquatic Acute/Chronic 1 · M-Factor = 1</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4>2. Lab Handling, PPE &amp; First Aid (Sections 4, 8, 9)</h4>
        <ul class="doc-list">
          <li><strong>Gloves</strong>: Chemical-resistant butyl or nitrile rubber gloves (Cat. III, EN 374, thickness ≥ 0.2 mm, breakthrough &gt; 10 min). Long-sleeved lab clothing; avoid eye contact and vapor/spray mist inhalation.</li>
          <li><strong>First aid</strong>: Eyes — remove lenses, rinse ≥15 min with water; Skin — soap &amp; plenty of water; Ingestion — do <strong>NOT</strong> induce vomiting, rinse mouth, seek medical advice.</li>
          <li><strong>Physical properties</strong>: Colorless to brown liquid, sweetish odor, non-flammable, viscosity 0.91 mPa·s (20 °C), auto-ignition &gt;650 °C.</li>
        </ul>

        <h4>3. Toxicological &amp; Ecotoxicological Reference Values (Sections 11 &amp; 12)</h4>
        <div class="doc-table-wrap">
          <table class="doc-table">
            <thead><tr><th>Endpoint / Species</th><th>Product Value (Bi 58® N)</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td><strong>Daphnia magna (48 h EC₅₀)</strong></td><td><strong>0.18 mg/L</strong></td><td>Very toxic to aquatic invertebrates</td></tr>
              <tr><td><strong>Rainbow trout — <em>Oncorhynchus mykiss</em> (96 h LC₅₀)</strong></td><td><strong>2.0 mg/L</strong></td><td>Very toxic to fish</td></tr>
              <tr><td>Mammalian Acute Oral / Dermal / Inhal. (Rat)</td><td>LD₅₀ &gt; 2,000 mg/kg · &gt; 5,000 mg/kg · LC₅₀ &gt; 6.60 mg/L (4 h)</td><td>Non-irritating to skin/eyes; no genotoxicity or carcinogenicity</td></tr>
              <tr><td>PBT / vPvB &amp; Endocrine Disruption</td><td>None ≥ 0.1%</td><td>Not classified as PBT/vPvB or REACH Art. 57(f) endocrine disruptor</td></tr>
            </tbody>
          </table>
        </div>
      `,
    },
    {
      id: "lambda",
      category: "Literature Review",
      badge: "He et al. (2008) · Rev. Environ. Contam. Toxicol.",
      title: "Lambda-Cyhalothrin — Environmental Chemistry, Ecotoxicity & Fate",
      sourceFile: "lambda_cyhalothrin.pdf",
      checklistText:
        "[Lambda-Cyhalothrin Reference Benchmarks — He et al. 2008]\n" +
        "- Type II pyrethroid (alpha-cyano): targets voltage-gated Na+ (plus Cl-/Ca2+) channels\n" +
        "- Extremely hydrophobic: solubility 0.005 mg/L, log Kow = 7.00, Koc = 247,000–330,000 cm³/g\n" +
        "- Hydrolysis: stable at pH 5–7, t1/2 = 8.66 d at pH 9; UV photolysis <10 min vs natural >3 wks\n" +
        "- Aquatic LC50 (pure a.i.): D. magna 360 ng/L, Rainbow trout 240 ng/L, Bluegill 210 ng/L, Mysid shrimp 4.9 ng/L\n" +
        "- Sediment LC50 (Hyalella azteca, 10 d): 0.45 µg/g OC (~1.4 ng/L pore water)",
      keywords: "lambda-cyhalothrin pyrethroid sodium channel log kow koc hydrolysis photolysis bcf rainbow trout daphnia hyalella sediment toxic units",
      renderBody: () => `
        <h4>1. Chemistry &amp; Neurotoxic Mode of Action</h4>
        <p>Lambda-cyhalothrin (1:1 mixture of two cis-stereoisomers; molecular formula <code>C₂₃H₁₉ClF₃NO₃</code>, MW 449.9 g/mol) is a synthetic <strong>Type II pyrethroid</strong> insecticide containing an <strong>α-cyano group</strong>. It binds voltage-gated <strong>sodium channels</strong> in nerve axons, preventing normal closure and causing repetitive firing, tremors, paralysis, and death. Unlike Type I pyrethroids (e.g., permethrin), Type II pyrethroids also interfere with chloride and calcium channels.</p>

        <h4>2. Key Physicochemical &amp; Fate Properties (Table 1)</h4>
        <div class="doc-table-wrap">
          <table class="doc-table">
            <thead><tr><th>Property</th><th>Value</th><th>Environmental Implication</th></tr></thead>
            <tbody>
              <tr><td>Water Solubility (20 °C)</td><td><strong>0.005 mg/L</strong> (5 µg/L)</td><td>Extremely low aqueous solubility (acetone &gt; 500,000 mg/L)</td></tr>
              <tr><td>Octanol–Water Partition (log K<sub>ow</sub>)</td><td><strong>7.00</strong></td><td>Strongly lipophilic; rapid uptake across membranes</td></tr>
              <tr><td>Soil Adsorption (K<sub>oc</sub>)</td><td><strong>247,000 – 330,000 cm³/g</strong></td><td>Binds tightly to suspended solids, organic matter &amp; plants</td></tr>
              <tr><td>Hydrolysis Half-Life</td><td>pH 5 &amp; 7: <strong>Stable</strong> · pH 9: <strong>8.66 d</strong></td><td>Alkaline hydrolysis yields HCN and aldehyde</td></tr>
              <tr><td>Photolysis Half-Life</td><td>Water (pH 5): 24.5 d · Soil: 53.7 d</td><td>Slow under natural light (&gt;3 wks), fast under UV (&lt;10 min)</td></tr>
              <tr><td>Degradation Half-Life</td><td>Aerobic aquatic: 21.9 d · Soil: 42.6 d</td><td>Adsorption to sediment slows microbial/photolytic breakdown</td></tr>
              <tr><td>Bioconcentration Factor (BCF, fish)</td><td><strong>2,240</strong></td><td>Confined largely to non-edible tissues; rapid depuration</td></tr>
            </tbody>
          </table>
        </div>

        <h4>3. Aquatic &amp; Sediment Ecotoxicity Benchmarks (Pure Active Ingredient)</h4>
        <div class="doc-table-wrap">
          <table class="doc-table">
            <thead><tr><th>Organism / System</th><th>Endpoint</th><th>Reported Toxicity</th></tr></thead>
            <tbody>
              <tr><td><em>Daphnia magna</em></td><td>96 h LC₅₀</td><td><strong>360 ng/L</strong> (0.36 µg/L)</td></tr>
              <tr><td>Rainbow trout / Bluegill sunfish</td><td>96 h LC₅₀</td><td><strong>240 ng/L</strong> / <strong>210 ng/L</strong></td></tr>
              <tr><td>Mysid shrimp / Sheepshead minnow / Eastern oyster</td><td>LC₅₀ / EC₅₀</td><td>4.9 ng/L · 0.8 ng/L · 0.59 ng/L</td></tr>
              <tr><td>Zebrafish / Freshwater shrimp (<em>M. nippoensis</em>)</td><td>96 h LC₅₀</td><td>0.98–7.55 µg/L · 20–70 ng/L</td></tr>
              <tr><td><em>Hyalella azteca</em> (sediment amphipod)</td><td>10 d LC₅₀ / Growth LOEC</td><td><strong>0.45 µg/g OC</strong> (~1.4 ng/L pore water) · LOEC 0.19 µg/g OC</td></tr>
              <tr><td>Honeybee (oral / contact) · Mallard duck (oral)</td><td>48 h LD₅₀</td><td>0.038 / 0.909 µg/bee (high) · &gt;3,950 mg/kg (low)</td></tr>
            </tbody>
          </table>
        </div>

        <h4>4. Ecosystem Effects, Toxic Units &amp; Mitigation</h4>
        <ul class="doc-list">
          <li><strong>Macrophytes &amp; Mesocosms</strong>: Direct toxicity to macrophytes (e.g., <em>Lemna</em>, <em>Elodea</em>) is low, but indirect food-web shifts occur via invertebrate loss (e.g., <em>Gammarus pulex</em> decline, rotifer blooms at ≥25 ng/L).</li>
          <li><strong>Toxic Units (TU = C<sub>actual</sub> / EC₅₀)</strong>: Ecological effects typically emerge at <strong>TU<sub>Invertebrates</sub> &gt; 0.01–0.1</strong> and <strong>TU<sub>Algae</sub> &gt; 0.1</strong>.</li>
          <li><strong>Bioavailability &amp; Mitigation</strong>: Rapidly partitions from water onto suspended solids/plants within ~2 days, reducing short-term water-column toxicity while accumulating in bottom sediments (30 d equilibration recommended for sediment tests). Vegetated ditches, wetlands, and detention ponds effectively intercept runoff residues.</li>
        </ul>
      `,
    },
  ];

  function renderDocsList(containerEl, filterTopic = "all", searchQuery = "") {
    if (!containerEl) return;
    const q = String(searchQuery || "").trim().toLowerCase();

    const matched = DOC_SECTIONS.filter((sec) => {
      if (filterTopic !== "all" && sec.id !== filterTopic) return false;
      if (!q) return true;
      const hay = `${sec.title} ${sec.badge} ${sec.category} ${sec.sourceFile} ${sec.keywords}`.toLowerCase();
      return hay.includes(q);
    });

    if (matched.length === 0) {
      containerEl.innerHTML = `<div class="card doc-empty">No protocol documentation matched "<strong>${q.replace(/</g, "&lt;")}</strong>". Try another keyword or select "All Protocols".</div>`;
      return;
    }

    containerEl.innerHTML = matched
      .map((sec) => {
        const actions = [];
        if (sec.targetTab) {
          actions.push(
            `<button type="button" class="btn btn-xs btn-primary" data-doc-goto="${sec.targetTab}">${sec.targetTabLabel} →</button>`
          );
        }
        if (sec.presetKey) {
          actions.push(
            `<button type="button" class="btn btn-xs btn-secondary" data-doc-preset="${sec.presetKey}">${sec.presetLabel}</button>`
          );
        }
        if (sec.checklistText) {
          actions.push(
            `<button type="button" class="btn btn-xs btn-ghost" data-doc-note="${sec.id}" title="Append protocol checklist to Experiment Lab Notes">+ Add Checklist to Notes</button>`
          );
        }

        return `
          <details class="card doc-card" data-doc-id="${sec.id}" ${filterTopic !== "all" || q || sec.id === "algae" ? "open" : ""}>
            <summary class="doc-card-summary">
              <div class="doc-card-title-wrap">
                <div class="doc-card-badges">
                  <span class="doc-cat-pill">${sec.category}</span>
                  <span class="doc-std-pill">${sec.badge}</span>
                  <span class="doc-src-pill">${sec.sourceFile}</span>
                </div>
                <h3>${sec.title}</h3>
              </div>
              <span class="doc-chevron" aria-hidden="true">▾</span>
            </summary>
            <div class="doc-card-actions">${actions.join("")}</div>
            <div class="doc-card-body">
              ${sec.renderBody()}
            </div>
          </details>
        `;
      })
      .join("");

    // Bind interactive Probit mini-converter if rendered
    const pctInput = containerEl.querySelector("#doc-probit-pct");
    const valInput = containerEl.querySelector("#doc-probit-val");
    const noteEl = containerEl.querySelector("#doc-probit-note");
    if (pctInput && valInput && Ecotox.Math) {
      pctInput.addEventListener("input", () => {
        const p = Number(pctInput.value);
        const y = Ecotox.Math.probToProbit(p);
        if (y !== null) {
          valInput.value = y.toFixed(4);
          if (noteEl) noteEl.textContent = `${p}% → Probit ${y.toFixed(4)}`;
        } else if (noteEl) {
          noteEl.textContent = "Enter 0 < % < 100";
        }
      });
      valInput.addEventListener("input", () => {
        const y = Number(valInput.value);
        const p = Ecotox.Math.probitToProb(y);
        if (p !== null) {
          pctInput.value = p.toFixed(2);
          if (noteEl) noteEl.textContent = `Probit ${y.toFixed(2)} → ${p.toFixed(2)}%`;
        }
      });
    }
  }

  function getChecklistForId(id) {
    const sec = DOC_SECTIONS.find((s) => s.id === id);
    return sec ? sec.checklistText || "" : "";
  }

  Ecotox.Docs = {
    DOC_SECTIONS,
    renderDocsList,
    getChecklistForId,
  };
})(typeof window !== "undefined" ? window : globalThis);
