/**
 * Ecotoxicology Aid — Standalone HTML Experiment Report Exporter
 * Generates a self-contained, offline, print-ready .html report with:
 * - Embedded high-resolution vector SVG charts (rendered via Plotly offscreen)
 * - KPI cards & all calculated tables (OD, Cell Count, Lemna minor, Dilutions)
 * - Lab notes & collapsible raw data tables
 * - Embedded ecotox-aid-save JSON payload so the exported HTML can also be re-imported directly!
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeJsonForScript(jsonStr) {
    // Prevent premature </script> closing tags inside embedded JSON script blocks
    return jsonStr.replace(/<\/script/gi, "<\\/script");
  }

  function slugify(str) {
    return (
      String(str || "experiment")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "experiment"
    );
  }

  function inhClass(val) {
    if (val === null || val === undefined || !Number.isFinite(val)) return "";
    if (val >= 50) return "num-danger";
    if (val < 0) return "num-blue";
    return "";
  }

  function formatIc50(ic50, unit) {
    if (!ic50) return { val: "—", sub: "50% threshold" };
    if (ic50.status === "interpolated" && Number.isFinite(ic50.value)) {
      return { val: `${ic50.value.toFixed(3)} ${unit}`, sub: `Bracket ${ic50.bracket[0]}–${ic50.bracket[1]} ${unit}` };
    }
    if (ic50.status === "below_50") {
      return { val: "> max", sub: `Max inh. ${ic50.maxInhibition.toFixed(1)}%` };
    }
    return { val: "N/A", sub: "Non-monotonic" };
  }

  function renderChartsGridHtml(images) {
    const valid = images.filter(Boolean);
    if (valid.length === 0) return "";
    return `
      <div class="charts-grid ${valid.length === 1 ? "single" : ""}">
        ${valid
          .map(
            (img, idx) => `
          <figure class="chart-card ${valid.length === 3 && idx === 2 ? "span-2" : ""}">
            <img src="${img.dataUri}" alt="${escapeHtml(img.title)}" />
          </figure>`
          )
          .join("")}
      </div>
    `;
  }

  function renderTimeSeriesTablesHtml(analysis, unit, isSci) {
    const M = Ecotox.Math;
    const fmtVal = (v) => (isSci ? M.formatSci(v, 3) : M.formatNum(v, 4));
    const fmtSd = (v) => (isSci ? M.formatSci(v, 2) : M.formatNum(v, 5));
    const valCol = isSci ? "Mean (cells/mL)" : "Mean OD";

    const summaryRows = analysis.summary
      .map(
        (r) => `
        <tr>
          <td>${r.concentration} ${escapeHtml(unit)}${r.isControl ? " (Ctrl)" : ""}</td>
          <td>${M.formatNum(r.mu, 5)}</td>
          <td>${r.r2 !== null ? M.formatNum(r.r2, 4) : "—"}</td>
          <td>${r.doublingTime !== null ? `${M.formatNum(r.doublingTime, 1)} h` : "—"}</td>
          <td class="${inhClass(r.inhibition)}">${r.inhibition !== null ? `${M.formatNum(r.inhibition, 2)}%` : "—"}</td>
          <td>${r.pointsCount}</td>
        </tr>`
      )
      .join("");

    const kineticsRows = analysis.kinetics
      .map(
        (r) => `
        <tr>
          <td>${escapeHtml(r.date)} ${escapeHtml(r.time)}</td>
          <td>${M.formatNum(r.elapsedHours, 2)}</td>
          <td>${r.concentration} ${escapeHtml(unit)}</td>
          <td>${fmtVal(r.meanVal)}</td>
          <td>${fmtSd(r.stdVal)}</td>
          <td>${r.n}</td>
          <td>${r.intervalMu !== null ? M.formatNum(r.intervalMu, 5) : "—"}</td>
          <td class="${inhClass(r.intervalInhibition)}">${r.intervalInhibition !== null ? `${M.formatNum(r.intervalInhibition, 2)}%` : "—"}</td>
        </tr>`
      )
      .join("");

    return `
      <h3>Overall Specific Growth Rate (&mu;) &amp; Inhibition</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Concentration</th>
              <th>&mu; (h<sup>&minus;1</sup>)</th>
              <th>R&sup2; (log fit)</th>
              <th>Doubling Time</th>
              <th>Inhibition (%)</th>
              <th>Timepoints</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>

      <h3>Averaged Measurements &amp; Stepwise Kinetics</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Elapsed (h)</th>
              <th>Concentration</th>
              <th>${valCol}</th>
              <th>SD (n&minus;1)</th>
              <th>n</th>
              <th>Interval &mu; (h<sup>&minus;1</sup>)</th>
              <th>Interval Inh. (%)</th>
            </tr>
          </thead>
          <tbody>${kineticsRows}</tbody>
        </table>
      </div>
    `;
  }

  /**
   * Builds a complete standalone HTML string for the given experiment.
   * Renders charts offscreen via Plotly if running in a browser with Plotly loaded.
   */
  async function buildExperimentHtml(exp, options = {}) {
    const M = Ecotox.Math;
    const S = Ecotox.Storage;
    const C = Ecotox.Charts;

    const unit = exp.meta?.concUnit || "mg/L";
    const defaultCtrl = Number(exp.meta?.controlConc ?? 0);
    const odCtrl = options.odControlConc !== undefined && options.odControlConc !== null ? Number(options.odControlConc) : defaultCtrl;
    const ccCtrl = options.ccControlConc !== undefined && options.ccControlConc !== null ? Number(options.ccControlConc) : defaultCtrl;
    const lemnaCtrl = options.lemnaControlConc !== undefined && options.lemnaControlConc !== null ? Number(options.lemnaControlConc) : defaultCtrl;
    const renderImages = options.renderCharts !== false && typeof document !== "undefined" && Boolean(global.Plotly);

    const sections = [];

    // ---------------- 1. OD ASSAY SECTION(S) ----------------
    if (exp.odEntries && exp.odEntries.length > 0) {
      const wavelengths = Array.from(new Set(exp.odEntries.map((e) => Number(e.wavelength)))).sort((a, b) => a - b);

      for (const wl of wavelengths) {
        const wlRecords = exp.odEntries.filter((e) => Number(e.wavelength) === wl);
        const analysis = M.analyzeTimeSeries(wlRecords, {
          controlConc: odCtrl,
          tStartHours: options.odTStart ?? null,
          tEndHours: options.odTEnd ?? null,
        });

        let chartImages = [];
        if (renderImages) {
          const specs = C.buildTimeSeriesSpecs(
            {
              analysis,
              concUnit: unit,
              yAxisLabel: `OD (${wl} nm)`,
              growthTitle: `Growth Curves (OD${wl} ± SD)`,
              semiLogYLabel: "ln(OD)",
              singleTimepointBarTitle: `OD${wl} Snapshot (Mean ± SD)`,
            },
            true
          );
          const list = [specs.growth, specs.semilog, specs.mu, specs.dose].filter(Boolean);
          for (const spec of list) {
            chartImages.push(await C.renderSpecToImage(spec, 760, 430));
          }
        }

        const ctrlRow = analysis.summary.find((r) => r.isControl);
        const inhRows = analysis.summary.filter((r) => r.inhibition !== null && !r.isControl);
        const maxRow = inhRows.length > 0 ? inhRows.reduce((b, c) => (c.inhibition > b.inhibition ? c : b), inhRows[0]) : null;
        const ic50 = formatIc50(analysis.ic50, unit);

        const rawRows = [...wlRecords]
          .sort((a, b) => M.parseTimestampMs(a.date, a.time) - M.parseTimestampMs(b.date, b.time) || Number(a.concentration) - Number(b.concentration))
          .map(
            (e) => `
            <tr>
              <td>${escapeHtml(e.date)}</td>
              <td>${escapeHtml(e.time)}</td>
              <td>${e.concentration} ${escapeHtml(unit)}</td>
              <td>${M.formatNum(Number(e.value), 4)}</td>
              <td>${escapeHtml(e.label || "—")}</td>
            </tr>`
          )
          .join("");

        sections.push(`
          <section class="report-section">
            <h2>Optical Density Assay &mdash; ${wl} nm</h2>
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-label">Control &mu; (h<sup>&minus;1</sup>)</div><div class="kpi-val accent">${ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 4) : "—"}</div><div class="kpi-sub">${ctrlRow && ctrlRow.r2 !== null ? `R&sup2; = ${ctrlRow.r2.toFixed(4)}` : "—"}</div></div>
              <div class="kpi"><div class="kpi-label">Max Inhibition</div><div class="kpi-val danger">${maxRow ? `${maxRow.inhibition.toFixed(1)}%` : "—"}</div><div class="kpi-sub">${maxRow ? `At ${maxRow.concentration} ${escapeHtml(unit)}` : "—"}</div></div>
              <div class="kpi"><div class="kpi-label">Est. IC50 (Linear)</div><div class="kpi-val">${escapeHtml(ic50.val)}</div><div class="kpi-sub">${escapeHtml(ic50.sub)}</div></div>
              <div class="kpi"><div class="kpi-label">Measurements</div><div class="kpi-val">${wlRecords.length}</div><div class="kpi-sub">${analysis.timepointsCount} timepoints &middot; ${analysis.concentrations.length} conc.</div></div>
            </div>
            ${renderChartsGridHtml(chartImages)}
            ${renderTimeSeriesTablesHtml(analysis, unit, false)}
            <details class="raw-details">
              <summary>Raw OD Readings (${wlRecords.length} entries)</summary>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Time</th><th>Concentration</th><th>OD (${wl} nm)</th><th>Well / Label</th></tr></thead>
                  <tbody>${rawRows}</tbody>
                </table>
              </div>
            </details>
          </section>
        `);
      }
    }

    // ---------------- 2. CELL COUNT SECTION ----------------
    if (exp.cellCountEntries && exp.cellCountEntries.length > 0) {
      const tsRecords = exp.cellCountEntries.map((e) => ({
        date: e.date,
        time: e.time,
        concentration: e.concentration,
        value: e.cellsPerMl,
      }));
      const analysis = M.analyzeTimeSeries(tsRecords, {
        controlConc: ccCtrl,
        tStartHours: options.ccTStart ?? null,
        tEndHours: options.ccTEnd ?? null,
      });

      let chartImages = [];
      if (renderImages) {
        const specs = C.buildTimeSeriesSpecs(
          {
            analysis,
            concUnit: unit,
            yAxisLabel: "Cells / mL",
            growthTitle: "Cell Density Growth Curves (Mean ± SD)",
            semiLogYLabel: "ln(Cells/mL)",
            singleTimepointBarTitle: "Measured Cell Density (cells/mL ± SD)",
          },
          true
        );
        const list = [specs.growth, specs.semilog, specs.mu, specs.dose].filter(Boolean);
        for (const spec of list) {
          chartImages.push(await C.renderSpecToImage(spec, 760, 430));
        }
      }

      const ctrlAvg = analysis.averaged.filter((r) => r.concentration === ccCtrl);
      const latestCtrl = ctrlAvg.length > 0 ? ctrlAvg[ctrlAvg.length - 1] : null;
      const ctrlRow = analysis.summary.find((r) => r.isControl);
      const ic50 = formatIc50(analysis.ic50, unit);

      const rawRows = [...exp.cellCountEntries]
        .sort((a, b) => M.parseTimestampMs(a.date, a.time) - M.parseTimestampMs(b.date, b.time))
        .map(
          (e) => `
          <tr>
            <td>${escapeHtml(e.date)} ${escapeHtml(e.time)}</td>
            <td>${e.concentration} ${escapeHtml(unit)}</td>
            <td>${escapeHtml(e.sampleId || "—")}</td>
            <td>${e.inputMode === "chamber" ? `${escapeHtml(e.cellsCountedExpr || e.cellsCounted)} / ${e.smallSquares} sq (DF ${e.dilutionFactor})` : "Direct"}</td>
            <td>${M.formatSci(Number(e.cellsPerMl), 3)}</td>
            <td>${M.formatSci(Number(e.totalCells), 3)}</td>
          </tr>`
        )
        .join("");

      sections.push(`
        <section class="report-section">
          <h2>Cell Count Assay (Thoma / Neubauer)</h2>
          <div class="kpi-grid">
            <div class="kpi"><div class="kpi-label">Latest Control Density</div><div class="kpi-val accent">${latestCtrl ? M.formatSci(latestCtrl.meanVal, 3) : "—"}</div><div class="kpi-sub">cells/mL (mean)</div></div>
            <div class="kpi"><div class="kpi-label">Control &mu; (h<sup>&minus;1</sup>)</div><div class="kpi-val">${ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 4) : "—"}</div><div class="kpi-sub">${ctrlRow && ctrlRow.r2 !== null ? `R&sup2; = ${ctrlRow.r2.toFixed(4)}` : "Need &ge; 2 timepoints"}</div></div>
            <div class="kpi"><div class="kpi-label">Est. IC50 (Linear)</div><div class="kpi-val danger">${escapeHtml(ic50.val)}</div><div class="kpi-sub">${escapeHtml(ic50.sub)}</div></div>
            <div class="kpi"><div class="kpi-label">Counts Recorded</div><div class="kpi-val">${exp.cellCountEntries.length}</div><div class="kpi-sub">${analysis.timepointsCount} timepoints &middot; ${analysis.concentrations.length} conc.</div></div>
          </div>
          ${renderChartsGridHtml(chartImages)}
          ${analysis.timepointsCount >= 2 ? renderTimeSeriesTablesHtml(analysis, unit, true) : ""}
          <h3>Cell Count Entries</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Timestamp</th><th>Concentration</th><th>Sample / Rep</th><th>Counting Details</th><th>Density (cells/mL)</th><th>Total Cells</th></tr></thead>
              <tbody>${rawRows}</tbody>
            </table>
          </div>
        </section>
      `);
    }

    // ---------------- 3. LEMNA MINOR SECTION ----------------
    if (exp.lemnaEntries && exp.lemnaEntries.length > 0) {
      const analysis = M.analyzeLemna(exp.lemnaEntries, lemnaCtrl);
      let chartImages = [];
      if (renderImages) {
        const specs = C.buildLemnaSpecs(analysis, unit, true);
        const list = [specs.fronds, specs.mu, specs.dose].filter(Boolean);
        for (const spec of list) {
          chartImages.push(await C.renderSpecToImage(spec, 760, 420));
        }
      }

      const ctrlRow = analysis.rows.find((r) => r.isControl);
      const inhRows = analysis.rows.filter((r) => r.inhibition !== null && !r.isControl);
      const maxRow = inhRows.length > 0 ? inhRows.reduce((b, c) => (c.inhibition > b.inhibition ? c : b), inhRows[0]) : null;
      const ic50 = formatIc50(analysis.ic50, unit);

      const rowsHtml = analysis.rows
        .map(
          (r) => `
          <tr>
            <td>${r.dilution} ${escapeHtml(unit)}${r.isControl ? " (Ctrl)" : ""}</td>
            <td>${r.tHours}</td>
            <td>${r.n0A} / ${r.ntA}</td>
            <td>${r.n0B !== null ? `${r.n0B} / ${r.ntB}` : "—"}</td>
            <td>${M.formatNum(r.avgN0, 1)}</td>
            <td>${M.formatNum(r.avgNt, 1)}</td>
            <td>${M.formatNum(r.mu, 5)}</td>
            <td class="${inhClass(r.inhibition)}">${r.inhibition !== null ? `${M.formatNum(r.inhibition, 2)}%` : "—"}</td>
          </tr>`
        )
        .join("");

      sections.push(`
        <section class="report-section">
          <h2>Lemna minor Frond Assay</h2>
          <div class="kpi-grid">
            <div class="kpi"><div class="kpi-label">Control &mu; (h<sup>&minus;1</sup>)</div><div class="kpi-val accent">${ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 5) : "—"}</div><div class="kpi-sub">${ctrlRow && ctrlRow.doublingTime !== null ? `Td = ${(ctrlRow.doublingTime / 24).toFixed(2)} days` : "—"}</div></div>
            <div class="kpi"><div class="kpi-label">Max Hemmung</div><div class="kpi-val danger">${maxRow ? `${maxRow.inhibition.toFixed(1)}%` : "—"}</div><div class="kpi-sub">${maxRow ? `At ${maxRow.dilution} ${escapeHtml(unit)}` : "—"}</div></div>
            <div class="kpi"><div class="kpi-label">Est. IC50 (Linear)</div><div class="kpi-val">${escapeHtml(ic50.val)}</div><div class="kpi-sub">${escapeHtml(ic50.sub)}</div></div>
            <div class="kpi"><div class="kpi-label">Dilutions</div><div class="kpi-val">${analysis.rows.length}</div><div class="kpi-sub">Sample groups</div></div>
          </div>
          ${renderChartsGridHtml(chartImages)}
          <h3>Lemna minor Summary Table</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Dilution</th><th>t (h)</th><th>Rep A (N&sub0;/N<sub>t</sub>)</th><th>Rep B (N&sub0;/N<sub>t</sub>)</th><th>AVG N&sub0;</th><th>AVG N<sub>t</sub></th><th>&mu; (h<sup>&minus;1</sup>)</th><th>Hemmung (%)</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </section>
      `);
    }

    // ---------------- 4. DILUTION SERIES SECTION ----------------
    if (exp.dilutions && exp.dilutions.length > 0) {
      const sorted = [...exp.dilutions].sort((a, b) => Number(a.concentration) - Number(b.concentration));
      let chartImages = [];
      if (renderImages) {
        const spec = C.buildDilutionSpec(sorted, unit, true);
        if (spec) chartImages.push(await C.renderSpecToImage(spec, 820, 380));
      }
      const medName = sorted[0]?.mediumName || "Medium";
      const toxName = sorted[0]?.toxicantName || "Toxicant";
      const rowsHtml = sorted
        .map((d) => {
          const tot = Number(d.mediumMl) + Number(d.toxicantMl);
          return `
            <tr>
              <td>${d.concentration} ${escapeHtml(unit)}</td>
              <td>${Number(d.mediumMl).toFixed(4).replace(/\.?0+$/, "")}</td>
              <td>${Number(d.toxicantMl).toFixed(4).replace(/\.?0+$/, "")}</td>
              <td>${(Number(d.toxicantMl) * 1000).toFixed(1)}</td>
              <td>${tot.toFixed(3).replace(/\.?0+$/, "")}</td>
            </tr>`;
        })
        .join("");

      sections.push(`
        <section class="report-section">
          <h2>Dilution Series (Verd&uuml;nnungsreihe)</h2>
          ${renderChartsGridHtml(chartImages)}
          <div class="table-wrap">
            <table>
              <thead><tr><th>Concentration</th><th>${escapeHtml(medName)} (mL)</th><th>${escapeHtml(toxName)} (mL)</th><th>${escapeHtml(toxName)} (&mu;L)</th><th>Total (mL)</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </section>
      `);
    }

    // ---------------- 5. LAB NOTES SECTION ----------------
    if (exp.notes && exp.notes.trim()) {
      sections.push(`
        <section class="report-section">
          <h2>Lab Notes &amp; Observations</h2>
          <pre class="notes-block">${escapeHtml(exp.notes)}</pre>
        </section>
      `);
    }

    if (sections.length === 0) {
      sections.push(`<section class="report-section"><p class="muted">This experiment currently has no recorded measurements or notes.</p></section>`);
    }

    const exportedAt = new Date().toLocaleString();
    const saveJson = safeJsonForScript(S.serializeExperimentSave(exp));
    const jsonFilename = `${slugify(exp.name)}.json`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(exp.name)} — Ecotoxicology Report</title>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --subtle: #f1f5f9;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #0d9488;
      --danger: #e11d48;
      --blue: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 18px 48px;
      background: var(--bg);
      color: var(--text);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }
    .page {
      max-width: 1040px;
      margin: 0 auto;
    }
    .report-header {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 18px;
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }
    .report-title {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .report-sub {
      color: var(--muted);
      font-size: 12.5px;
      margin-bottom: 12px;
    }
    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .meta-chip {
      font-size: 12px;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--subtle);
      border: 1px solid var(--border);
      color: var(--text);
    }
    .header-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    .btn {
      height: 34px;
      padding: 0 13px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: var(--surface);
      color: var(--text);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .report-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 18px;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 17px;
      font-weight: 700;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }
    h3 {
      margin: 18px 0 8px;
      font-size: 13.5px;
      font-weight: 700;
      color: #334155;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .kpi {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    .kpi-val {
      margin-top: 3px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 18px;
      font-weight: 700;
    }
    .kpi-val.accent { color: var(--accent); }
    .kpi-val.danger { color: var(--danger); }
    .kpi-sub { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 12px;
    }
    .charts-grid.single { grid-template-columns: 1fr; }
    .chart-card {
      margin: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #ffffff;
      padding: 6px;
      break-inside: avoid;
    }
    .chart-card.span-2 { grid-column: 1 / -1; }
    .chart-card img {
      display: block;
      width: 100%;
      height: auto;
      cursor: zoom-in;
    }
    .img-lightbox {
      position: fixed;
      inset: 0;
      z-index: 999;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(3px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .img-lightbox.open { display: flex; }
    .img-lightbox-inner {
      background: #ffffff;
      border-radius: 10px;
      padding: 12px;
      max-width: 96vw;
      max-height: 94vh;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    }
    .img-lightbox-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 13px;
      font-weight: 600;
    }
    .img-lightbox img {
      max-width: 92vw;
      max-height: 84vh;
      width: auto;
      height: auto;
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
      font-variant-numeric: tabular-nums;
    }
    th {
      background: var(--subtle);
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 8px 11px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 7px 11px;
      border-bottom: 1px solid var(--border);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: nowrap;
    }
    tbody tr:last-child td { border-bottom: none; }
    .num-danger { color: var(--danger); font-weight: 700; }
    .num-blue { color: var(--blue); }
    .raw-details {
      margin-top: 14px;
    }
    .raw-details summary {
      cursor: pointer;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .notes-block {
      margin: 0;
      padding: 12px 14px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12.5px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .muted { color: var(--muted); }
    .report-footer {
      text-align: center;
      color: var(--muted);
      font-size: 11.5px;
      margin-top: 16px;
    }
    @media (max-width: 760px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .charts-grid { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .header-actions { display: none; }
      .report-header, .report-section { border: 1px solid #cbd5e1; box-shadow: none; break-inside: avoid-page; }
      .chart-card, .table-wrap { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="report-header">
      <div>
        <h1 class="report-title">${escapeHtml(exp.name)}</h1>
        <div class="report-sub">Ecotoxicology Aid Report &middot; Exported ${escapeHtml(exportedAt)}</div>
        <div class="meta-row">
          ${exp.meta?.pollutant ? `<span class="meta-chip"><strong>Substance:</strong> ${escapeHtml(exp.meta.pollutant)}</span>` : ""}
          ${exp.meta?.organism ? `<span class="meta-chip"><strong>Organism:</strong> ${escapeHtml(exp.meta.organism)}</span>` : ""}
          <span class="meta-chip"><strong>Unit:</strong> ${escapeHtml(unit)}</span>
          <span class="meta-chip"><strong>Control:</strong> ${defaultCtrl} ${escapeHtml(unit)}</span>
          <span class="meta-chip"><strong>Default &lambda;:</strong> ${exp.meta?.defaultWavelength || 680} nm</span>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-primary" onclick="window.print()">Print / PDF</button>
        <button type="button" class="btn" id="btn-dl-embedded-json">Download .json Save</button>
      </div>
    </header>

    ${sections.join("\n")}

    <footer class="report-footer">
      Generated by Ecotoxicology Aid &middot; Tip: This HTML file embeds the experiment save data and can be dragged straight back into Ecotoxicology Aid.
    </footer>
  </div>

  <div class="img-lightbox" id="img-lightbox" aria-hidden="true">
    <div class="img-lightbox-inner">
      <div class="img-lightbox-head">
        <span id="img-lightbox-title"></span>
        <button type="button" class="btn" id="img-lightbox-close">✕ Close</button>
      </div>
      <img id="img-lightbox-img" alt="" />
    </div>
  </div>

  <script id="ecotox-save-data" type="application/json">${saveJson}</script>
  <script>
    document.getElementById("btn-dl-embedded-json").addEventListener("click", function () {
      var raw = document.getElementById("ecotox-save-data").textContent;
      var blob = new Blob([raw], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = ${JSON.stringify(jsonFilename)};
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    (function () {
      var lb = document.getElementById("img-lightbox");
      var lbImg = document.getElementById("img-lightbox-img");
      var lbTitle = document.getElementById("img-lightbox-title");
      function closeLb() { lb.classList.remove("open"); }
      document.querySelectorAll(".chart-card img").forEach(function (img) {
        img.title = "Click to view fullsize";
        img.addEventListener("click", function () {
          lbImg.src = img.src;
          lbImg.alt = img.alt;
          lbTitle.textContent = img.alt || "Graph";
          lb.classList.add("open");
        });
      });
      document.getElementById("img-lightbox-close").addEventListener("click", closeLb);
      lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
      window.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
    })();
  </script>
</body>
</html>`;
  }

  async function exportExperimentHTML(exp, options = {}) {
    const html = await buildExperimentHtml(exp, options);
    const filename = `${slugify(exp.name)}_report.html`;
    Ecotox.Storage.downloadFile(filename, html, "text/html;charset=utf-8");
    return filename;
  }

  Ecotox.Exporter = {
    buildExperimentHtml,
    exportExperimentHTML,
  };
})(typeof window !== "undefined" ? window : globalThis);
