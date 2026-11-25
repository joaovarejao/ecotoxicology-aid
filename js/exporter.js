/**
 * Ecotoxicology Aid — Standalone HTML Experiment Report Exporter
 * Generates a self-contained, interactive, print-ready .html report with:
 * - Live interactive Plotly graphs (hover, zoom, pan, download, fullsize modal) matching user style settings
 * - Collapsible open/close clozes (<details>) on every assay section, data table, raw dataset, and notes block
 * - Expand All / Collapse All Data controls
 * - Embedded ecotox-aid-save JSON payload so the exported HTML can also be re-imported directly!
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});
  let cachedPlotlySource = null;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeJsonForScript(jsonStr) {
    return String(jsonStr || "").replace(/<\/script/gi, "<\\/script");
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

  function formatIc50(ic50, unit, targetPct = 50) {
    const t = ic50?.targetPct ?? targetPct ?? 50;
    if (!ic50) return { val: "—", sub: `${t}% threshold` };
    if (ic50.status === "interpolated" && Number.isFinite(ic50.value)) {
      return { val: `${ic50.value.toFixed(3)} ${unit}`, sub: `Bracket ${ic50.bracket[0]}–${ic50.bracket[1]} ${unit}` };
    }
    if (ic50.status === "below_50") {
      return { val: "> max", sub: `Max inh. ${ic50.maxInhibition.toFixed(1)}%` };
    }
    return { val: "N/A", sub: "Non-monotonic" };
  }

  async function resolvePlotlyScriptTag(options = {}) {
    if (options.plotlyInline) {
      return `<script>${safeJsonForScript(options.plotlyInline)}</script>`;
    }
    if (
      options.embedPlotly !== false &&
      typeof fetch === "function" &&
      typeof window !== "undefined" &&
      window.location &&
      window.location.protocol !== "file:"
    ) {
      try {
        if (!cachedPlotlySource) {
          const resp = await fetch("lib/plotly-basic-2.35.2.min.js");
          if (resp.ok) {
            cachedPlotlySource = await resp.text();
          }
        }
        if (cachedPlotlySource) {
          return `<script>${safeJsonForScript(cachedPlotlySource)}</script>`;
        }
      } catch {
        // Fallback to CDN below
      }
    }
    return `<script src="https://cdn.plot.ly/plotly-basic-2.35.2.min.js"></script>`;
  }

  function renderInteractiveChartsGrid(specsWithIds) {
    const valid = (specsWithIds || []).filter((item) => item && item.spec);
    if (valid.length === 0) return "";
    return `
      <div class="charts-grid ${valid.length === 1 ? "single" : ""}">
        ${valid
          .map(
            (item, idx) => `
          <div class="chart-card ${valid.length === 3 && idx === 2 ? "span-2" : ""}">
            <div class="chart-card-head">
              <span class="chart-card-title">${escapeHtml(item.spec.title || "Graph")}</span>
              <button type="button" class="btn btn-xs btn-expand" data-expand-chart="${escapeHtml(item.domId)}" title="Open interactive fullsize graph">⤢ Fullsize</button>
            </div>
            <div id="${escapeHtml(item.domId)}" class="report-chart-box"></div>
          </div>`
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
      <details class="data-cloze" open>
        <summary>Overall Specific Growth Rate (&mu;) &amp; Inhibition (${analysis.summary.length} concentrations)</summary>
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
      </details>

      <details class="data-cloze">
        <summary>Averaged Measurements &amp; Stepwise Kinetics (${analysis.kinetics.length} rows)</summary>
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
      </details>
    `;
  }

  /**
   * Builds a complete standalone HTML string with interactive Plotly charts and collapsible clozes.
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
    const daphniaCtrl = options.daphniaControlConc !== undefined && options.daphniaControlConc !== null ? Number(options.daphniaControlConc) : defaultCtrl;
    const daphniaTimepoint = options.daphniaTimepoint === "24h" ? "24h" : "48h";
    const vibrioCtrl = options.vibrioControlConc !== undefined && options.vibrioControlConc !== null ? Number(options.vibrioControlConc) : defaultCtrl;
    const vibrioContactMin = options.vibrioContactMin ? Number(options.vibrioContactMin) : null;

    const views = options.views || {};
    const perChartStyles = options.perChartStyles || {};
    const styleForTab = (tabKey, containerId) => {
      const base = views[tabKey]?.style || {};
      const ov = containerId ? perChartStyles[containerId] : null;
      return C && C.mergeStyleOptions ? C.mergeStyleOptions(base, ov || {}) : base;
    };

    const chartSpecs = [];
    let chartSeq = 0;
    function registerChart(spec, filePrefix, tabKey, liveContainerId) {
      if (!spec) return null;
      const styled = C && C.applyStyleToSpec ? C.applyStyleToSpec(spec, styleForTab(tabKey, liveContainerId)) : spec;
      const domId = `report-chart-${chartSeq++}`;
      const record = {
        domId,
        title: styled.title || "Graph",
        filename: filePrefix || styled.key || "ecotox_graph",
        traces: styled.traces,
        layout: styled.layout,
      };
      chartSpecs.push(record);
      return { domId, spec: record };
    }

    const sections = [];

    // ---------------- 1. OD ASSAY SECTION(S) ----------------
    const activeOd = (exp.odEntries || []).filter((e) => !e.ignored);
    if (activeOd.length > 0) {
      const wavelengths = Array.from(new Set(activeOd.map((e) => Number(e.wavelength)))).sort((a, b) => a - b);
      const odView = views.od || {};

      for (const wl of wavelengths) {
        const wlRecords = activeOd.filter((e) => Number(e.wavelength) === wl);
        const analysis = M.analyzeTimeSeries(wlRecords, {
          controlConc: odCtrl,
          tStartHours: options.odTStart ?? null,
          tEndHours: options.odTEnd ?? null,
          icTarget: odView.icTarget ?? 50,
        });

        const chartCards = [];
        if (C && C.buildTimeSeriesSpecs) {
          const specs = C.buildTimeSeriesSpecs(
            {
              analysis,
              concUnit: unit,
              yAxisLabel: `OD (${wl} nm)`,
              growthTitle: `Growth Curves (OD${wl} ± SD)`,
              semiLogYLabel: "ln(OD)",
              singleTimepointBarTitle: `OD${wl} Snapshot (Mean ± SD)`,
              viewOptions: {
                highlightedConcs: odView.selectedConcs,
                filterMode: odView.filterMode,
                controlConc: odCtrl,
                showErrorBars: odView.showErrorBars !== false,
                showFitLines: Boolean(odView.showFitLines),
                logX: Boolean(odView.logX),
                icTarget: odView.icTarget ?? 50,
                tStartHours: options.odTStart ?? null,
                tEndHours: options.odTEnd ?? null,
                style: odView.style,
              },
            },
            true
          );
          const prefix = `${slugify(exp.name)}_od${wl}`;
          chartCards.push(
            registerChart(specs.growth, `${prefix}_growth`, "od", "od-chart-growth"),
            registerChart(specs.semilog, `${prefix}_semilog`, "od", "od-chart-semilog"),
            registerChart(specs.mu, `${prefix}_mu`, "od", "od-chart-mu"),
            registerChart(specs.dose, `${prefix}_dose`, "od", "od-chart-dose")
          );
        }

        const ctrlRow = analysis.summary.find((r) => r.isControl);
        const inhRows = analysis.summary.filter((r) => r.inhibition !== null && !r.isControl);
        const maxRow = inhRows.length > 0 ? inhRows.reduce((b, c) => (c.inhibition > b.inhibition ? c : b), inhRows[0]) : null;
        const ic50 = formatIc50(analysis.ic50, unit, odView.icTarget ?? 50);

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
          <details class="section-cloze" open>
            <summary>
              <span class="section-title-text">Optical Density Assay &mdash; ${wl} nm</span>
              <span class="cloze-meta">${wlRecords.length} pts &middot; ${analysis.timepointsCount} timepoints</span>
            </summary>
            <div class="section-body">
              <div class="kpi-grid">
                <div class="kpi"><div class="kpi-label">Control &mu; (h<sup>&minus;1</sup>)</div><div class="kpi-val accent">${ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 4) : "—"}</div><div class="kpi-sub">${ctrlRow && ctrlRow.r2 !== null ? `R&sup2; = ${ctrlRow.r2.toFixed(4)}` : "—"}</div></div>
                <div class="kpi"><div class="kpi-label">Max Inhibition</div><div class="kpi-val danger">${maxRow ? `${maxRow.inhibition.toFixed(1)}%` : "—"}</div><div class="kpi-sub">${maxRow ? `At ${maxRow.concentration} ${escapeHtml(unit)}` : "—"}</div></div>
                <div class="kpi"><div class="kpi-label">Est. IC${odView.icTarget ?? 50} (Linear)</div><div class="kpi-val">${escapeHtml(ic50.val)}</div><div class="kpi-sub">${escapeHtml(ic50.sub)}</div></div>
                <div class="kpi"><div class="kpi-label">Measurements</div><div class="kpi-val">${wlRecords.length}</div><div class="kpi-sub">${analysis.timepointsCount} timepoints &middot; ${analysis.concentrations.length} conc.</div></div>
              </div>
              ${renderInteractiveChartsGrid(chartCards)}
              ${renderTimeSeriesTablesHtml(analysis, unit, false)}
              <details class="data-cloze">
                <summary>Raw OD Readings (${wlRecords.length} entries)</summary>
                <div class="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Time</th><th>Concentration</th><th>OD (${wl} nm)</th><th>Well / Label</th></tr></thead>
                    <tbody>${rawRows}</tbody>
                  </table>
                </div>
              </details>
            </div>
          </details>
        `);
      }
    }

    // ---------------- 2. CELL COUNT SECTION ----------------
    const activeCc = (exp.cellCountEntries || []).filter((e) => !e.ignored);
    if (activeCc.length > 0) {
      const ccView = views.cc || {};
      const tsRecords = activeCc.map((e) => ({
        date: e.date,
        time: e.time,
        concentration: e.concentration,
        value: e.cellsPerMl,
      }));
      const analysis = M.analyzeTimeSeries(tsRecords, {
        controlConc: ccCtrl,
        tStartHours: options.ccTStart ?? null,
        tEndHours: options.ccTEnd ?? null,
        icTarget: ccView.icTarget ?? 50,
      });

      const chartCards = [];
      if (C && C.buildTimeSeriesSpecs) {
        const specs = C.buildTimeSeriesSpecs(
          {
            analysis,
            concUnit: unit,
            yAxisLabel: "Cells / mL",
            growthTitle: "Cell Density Growth Curves (Mean ± SD)",
            semiLogYLabel: "ln(Cells/mL)",
            singleTimepointBarTitle: "Measured Cell Density (cells/mL ± SD)",
            viewOptions: {
              highlightedConcs: ccView.selectedConcs,
              filterMode: ccView.filterMode,
              controlConc: ccCtrl,
              showErrorBars: ccView.showErrorBars !== false,
              showFitLines: Boolean(ccView.showFitLines),
              logX: Boolean(ccView.logX),
              icTarget: ccView.icTarget ?? 50,
              tStartHours: options.ccTStart ?? null,
              tEndHours: options.ccTEnd ?? null,
              style: ccView.style,
            },
          },
          true
        );
        const prefix = `${slugify(exp.name)}_cellcount`;
        chartCards.push(
          registerChart(specs.growth, `${prefix}_growth`, "cc", "cc-chart-growth"),
          registerChart(specs.semilog, `${prefix}_semilog`, "cc", "cc-chart-semilog"),
          registerChart(specs.mu, `${prefix}_mu`, "cc", "cc-chart-mu"),
          registerChart(specs.dose, `${prefix}_dose`, "cc", "cc-chart-dose")
        );
      }

      const ctrlAvg = analysis.averaged.filter((r) => r.concentration === ccCtrl);
      const latestCtrl = ctrlAvg.length > 0 ? ctrlAvg[ctrlAvg.length - 1] : null;
      const ctrlRow = analysis.summary.find((r) => r.isControl);
      const ic50 = formatIc50(analysis.ic50, unit, ccView.icTarget ?? 50);

      const rawRows = [...activeCc]
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
        <details class="section-cloze" open>
          <summary>
            <span class="section-title-text">Cell Count Assay (Thoma / Neubauer)</span>
            <span class="cloze-meta">${activeCc.length} counts &middot; ${analysis.timepointsCount} timepoints</span>
          </summary>
          <div class="section-body">
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-label">Latest Control Density</div><div class="kpi-val accent">${latestCtrl ? M.formatSci(latestCtrl.meanVal, 3) : "—"}</div><div class="kpi-sub">cells/mL (mean)</div></div>
              <div class="kpi"><div class="kpi-label">Control &mu; (h<sup>&minus;1</sup>)</div><div class="kpi-val">${ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 4) : "—"}</div><div class="kpi-sub">${ctrlRow && ctrlRow.r2 !== null ? `R&sup2; = ${ctrlRow.r2.toFixed(4)}` : "Need &ge; 2 timepoints"}</div></div>
              <div class="kpi"><div class="kpi-label">Est. IC${ccView.icTarget ?? 50} (Linear)</div><div class="kpi-val danger">${escapeHtml(ic50.val)}</div><div class="kpi-sub">${escapeHtml(ic50.sub)}</div></div>
              <div class="kpi"><div class="kpi-label">Counts Recorded</div><div class="kpi-val">${activeCc.length}</div><div class="kpi-sub">${analysis.timepointsCount} timepoints &middot; ${analysis.concentrations.length} conc.</div></div>
            </div>
            ${renderInteractiveChartsGrid(chartCards)}
            ${analysis.timepointsCount >= 2 ? renderTimeSeriesTablesHtml(analysis, unit, true) : ""}
            <details class="data-cloze">
              <summary>Cell Count Entries (${activeCc.length} rows)</summary>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Timestamp</th><th>Concentration</th><th>Sample / Rep</th><th>Counting Details</th><th>Density (cells/mL)</th><th>Total Cells</th></tr></thead>
                  <tbody>${rawRows}</tbody>
                </table>
              </div>
            </details>
          </div>
        </details>
      `);
    }

    // ---------------- 3. LEMNA MINOR SECTION ----------------
    const activeLemna = (exp.lemnaEntries || []).filter((e) => !e.ignored);
    if (activeLemna.length > 0) {
      const lemnaView = views.lemna || {};
      const analysis = M.analyzeLemna(activeLemna, lemnaCtrl, lemnaView.icTarget ?? 50);
      const chartCards = [];
      if (C && C.buildLemnaSpecs) {
        const specs = C.buildLemnaSpecs(analysis, unit, true, {
          highlightedConcs: lemnaView.selectedConcs,
          filterMode: lemnaView.filterMode,
          controlConc: lemnaCtrl,
          showErrorBars: lemnaView.showErrorBars !== false,
          logX: Boolean(lemnaView.logX),
          icTarget: lemnaView.icTarget ?? 50,
          style: lemnaView.style,
        });
        const prefix = `${slugify(exp.name)}_lemna`;
        chartCards.push(
          registerChart(specs.fronds, `${prefix}_fronds`, "lemna", "lemna-chart-fronds"),
          registerChart(specs.mu, `${prefix}_mu`, "lemna", "lemna-chart-mu"),
          registerChart(specs.dose, `${prefix}_dose`, "lemna", "lemna-chart-dose")
        );
      }

      const ctrlRow = analysis.rows.find((r) => r.isControl);
      const inhRows = analysis.rows.filter((r) => r.inhibition !== null && !r.isControl);
      const maxRow = inhRows.length > 0 ? inhRows.reduce((b, c) => (c.inhibition > b.inhibition ? c : b), inhRows[0]) : null;
      const ic50 = formatIc50(analysis.ic50, unit, lemnaView.icTarget ?? 50);

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
            <td>${r.muPerDay !== null ? M.formatNum(r.muPerDay, 3) : "—"}</td>
            <td class="${inhClass(r.inhibition)}">${r.inhibition !== null ? `${M.formatNum(r.inhibition, 2)}%` : "—"}</td>
            <td>${r.notes ? escapeHtml(r.notes) : "—"}</td>
          </tr>`
        )
        .join("");

      sections.push(`
        <details class="section-cloze" open>
          <summary>
            <span class="section-title-text">Lemna minor Frond Assay (OECD 221)</span>
            <span class="cloze-meta">${analysis.rows.length} groups</span>
          </summary>
          <div class="section-body">
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-label">Control &mu; (h<sup>&minus;1</sup>)</div><div class="kpi-val accent">${ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 5) : "—"}</div><div class="kpi-sub">${ctrlRow && ctrlRow.doublingTimeDays !== null ? `Td = ${ctrlRow.doublingTimeDays.toFixed(2)} d (${ctrlRow.muPerDay.toFixed(3)} d&minus;1)` : "—"}</div></div>
              <div class="kpi"><div class="kpi-label">Max Hemmung</div><div class="kpi-val danger">${maxRow ? `${maxRow.inhibition.toFixed(1)}%` : "—"}</div><div class="kpi-sub">${maxRow ? `At ${maxRow.dilution} ${escapeHtml(unit)}` : "—"}</div></div>
              <div class="kpi"><div class="kpi-label">Est. IC${lemnaView.icTarget ?? 50} (Linear)</div><div class="kpi-val">${escapeHtml(ic50.val)}</div><div class="kpi-sub">${escapeHtml(ic50.sub)}</div></div>
              <div class="kpi"><div class="kpi-label">Dilutions</div><div class="kpi-val">${analysis.rows.length}</div><div class="kpi-sub">Sample groups</div></div>
            </div>
            ${renderInteractiveChartsGrid(chartCards)}
            <details class="data-cloze" open>
              <summary>Lemna minor Summary Data Table (${analysis.rows.length} rows)</summary>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Dilution</th><th>t (h)</th><th>Rep A (N&sub0;/N<sub>t</sub>)</th><th>Rep B (N&sub0;/N<sub>t</sub>)</th><th>AVG N&sub0;</th><th>AVG N<sub>t</sub></th><th>&mu; (h<sup>&minus;1</sup>)</th><th>&mu; (d<sup>&minus;1</sup>)</th><th>Hemmung (%)</th><th>Phytotoxicity Notes</th></tr></thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
            </details>
          </div>
        </details>
      `);
    }

    // ---------------- 3B. DAPHNIA MAGNA & PROBIT SECTION ----------------
    const activeDaphnia = (exp.daphniaEntries || []).filter((e) => !e.ignored);
    if (activeDaphnia.length > 0) {
      const daphView = views.daphnia || {};
      const analysis = M.analyzeDaphnia(activeDaphnia, {
        controlConc: daphniaCtrl,
        timepoint: daphniaTimepoint,
        targetPct: daphView.targetPct ?? 50,
        useAbbott: daphView.useAbbott !== false,
      });
      const chartCards = [];
      if (C && C.buildDaphniaSpecs) {
        const specs = C.buildDaphniaSpecs(analysis, unit, true, {
          highlightConcs: daphView.selectedConcs ? Array.from(daphView.selectedConcs) : [],
          isolate: daphView.filterMode === "isolate",
          logX: Boolean(daphView.logX),
          style: daphView.style,
        });
        const prefix = `${slugify(exp.name)}_daphnia`;
        chartCards.push(
          registerChart(specs.dose, `${prefix}_dose`, "daphnia", "daphnia-chart-dose"),
          registerChart(specs.probit, `${prefix}_probit`, "daphnia", "daphnia-chart-probit"),
          registerChart(specs.mobility, `${prefix}_mobility`, "daphnia", "daphnia-chart-mobility")
        );
      }

      const rowsHtml = analysis.rows
        .map(
          (r) => `
          <tr>
            <td>${r.concentration} ${escapeHtml(unit)}${r.isControl ? " (Ctrl)" : ""}</td>
            <td>${r.totalAnimals} (${r.replicates} rep)</td>
            <td>${r.immob24 !== null ? `${r.immob24} (${r.pct24.toFixed(1)}%)` : "—"}</td>
            <td>${r.immob48 !== null ? `${r.immob48} (${r.pct48.toFixed(1)}%)` : "—"}</td>
            <td class="${inhClass(r.activePct)}">${r.activePct !== null ? `${r.activePct.toFixed(1)}%` : "—"}</td>
            <td>${r.lnConc !== null ? r.lnConc.toFixed(3) : "—"}</td>
            <td>${r.probit !== null ? r.probit.toFixed(4) : "—"}</td>
          </tr>`
        )
        .join("");

      const rawDaphRows = [...activeDaphnia]
        .sort((a, b) => Number(a.concentration) - Number(b.concentration))
        .map(
          (e) => `
          <tr>
            <td>${e.concentration} ${escapeHtml(unit)}</td>
            <td>${e.totalAnimals}</td>
            <td>${e.immob24 ?? "—"}</td>
            <td>${e.immob48 ?? "—"}</td>
            <td>${escapeHtml(e.notes || "—")}</td>
          </tr>`
        )
        .join("");

      const ecVal = analysis.primaryEC ? `${analysis.primaryEC.value.toFixed(4)} ${escapeHtml(unit)}` : "—";
      const ecSub = analysis.primaryEC ? `${analysis.primaryEC.method} · ${analysis.primaryEC.detail}` : "Insufficient data";
      const validStr = analysis.validity.okActive === null ? "No control" : analysis.validity.okActive ? "PASS (≤10%)" : "FAIL (>10%)";
      sections.push(`
        <details class="section-cloze" open>
          <summary>
            <span class="section-title-text">Daphnia magna Acute Immobilization &amp; Probit Analysis (OECD 202 / DIN 38412 L30)</span>
            <span class="cloze-meta">${analysis.rows.length} concentrations &middot; ${daphniaTimepoint}</span>
          </summary>
          <div class="section-body">
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-label">Est. EC${daphView.targetPct ?? 50} (${daphniaTimepoint})</div><div class="kpi-val danger">${ecVal}</div><div class="kpi-sub">${escapeHtml(ecSub)}</div></div>
              <div class="kpi"><div class="kpi-label">Probit R&sup2; / Geom. Mean</div><div class="kpi-val accent">${analysis.probit && analysis.probit.r2 !== null ? analysis.probit.r2.toFixed(4) : "—"}</div><div class="kpi-sub">${analysis.geomMeanEC50 ? `√(${analysis.geomMeanEC50.a}·${analysis.geomMeanEC50.b}) = ${analysis.geomMeanEC50.value.toFixed(4)} ${escapeHtml(unit)}` : "—"}</div></div>
              <div class="kpi"><div class="kpi-label">OECD 202 Control Validity</div><div class="kpi-val">${validStr}</div><div class="kpi-sub">${daphniaTimepoint} ctrl: ${analysis.validity.activeCtrlPct !== null && analysis.validity.activeCtrlPct !== undefined ? analysis.validity.activeCtrlPct.toFixed(1) + "%" : "—"}</div></div>
              <div class="kpi"><div class="kpi-label">GD / NOEC / LOEC</div><div class="kpi-val">${analysis.noec !== null ? `${analysis.noec} ${escapeHtml(unit)}` : "—"}</div><div class="kpi-sub">GD: ${analysis.gdValue !== null ? analysis.gdValue : "—"} · LOEC: ${analysis.loec !== null ? analysis.loec : "—"}</div></div>
            </div>
            ${renderInteractiveChartsGrid(chartCards)}
            <details class="data-cloze" open>
              <summary>Daphnia Immobilization &amp; Probit Summary Table (${analysis.rows.length} concentrations)</summary>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Concentration</th><th>Total (N)</th><th>24 h Immob.</th><th>48 h Immob.</th><th>Active ${daphniaTimepoint} (%)</th><th>ln(C)</th><th>Probit (Y)</th></tr></thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
            </details>
            <details class="data-cloze">
              <summary>Raw Daphnia Observations (${activeDaphnia.length} entries)</summary>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Concentration</th><th>Total Neonates</th><th>24 h Immob.</th><th>48 h Immob.</th><th>Notes</th></tr></thead>
                  <tbody>${rawDaphRows}</tbody>
                </table>
              </div>
            </details>
          </div>
        </details>
      `);
    }

    // ---------------- 3C. VIBRIO FISCHERI SECTION ----------------
    const activeVibrio = (exp.vibrioEntries || []).filter((e) => !e.ignored);
    if (activeVibrio.length > 0) {
      const vibView = views.vibrio || {};
      const contactMin = vibrioContactMin || Number(activeVibrio[0]?.contactMin) || 30;
      const analysis = M.analyzeVibrio(activeVibrio, {
        controlConc: vibrioCtrl,
        contactMin,
        targetPct: vibView.targetPct ?? 50,
      });
      const chartCards = [];
      if (C && C.buildVibrioSpecs) {
        const specs = C.buildVibrioSpecs(analysis, unit, true, {
          highlightConcs: vibView.selectedConcs ? Array.from(vibView.selectedConcs) : [],
          isolate: vibView.filterMode === "isolate",
          logX: Boolean(vibView.logX),
          showErrorBars: vibView.showErrorBars !== false,
          style: vibView.style,
        });
        const prefix = `${slugify(exp.name)}_vibrio`;
        chartCards.push(
          registerChart(specs.inhibition, `${prefix}_inhibition`, "vibrio", "vibrio-chart-inhibition"),
          registerChart(specs.luminescence, `${prefix}_luminescence`, "vibrio", "vibrio-chart-luminescence")
        );
      }

      const rowsHtml = analysis.rows
        .map(
          (r) => `
          <tr>
            <td>${r.concentration} ${escapeHtml(unit)}${r.isControl ? " (2% NaCl Ctrl)" : ""}</td>
            <td>${r.n}</td>
            <td>${M.formatNum(r.meanI0, 1)}</td>
            <td>${r.meanIct !== null ? M.formatNum(r.meanIct, 1) : "—"}</td>
            <td>${M.formatNum(r.meanIt, 1)}</td>
            <td class="${inhClass(r.inhibition)}">${r.inhibition !== null ? `${r.inhibition.toFixed(2)}%` : "—"}</td>
            <td>${r.isControl ? "Control" : r.toxic ? "Toxic (>20%)" : "Non-toxic (≤20%)"}</td>
          </tr>`
        )
        .join("");

      const rawVibRows = [...activeVibrio]
        .sort((a, b) => Number(a.contactMin || 30) - Number(b.contactMin || 30) || Number(a.concentration) - Number(b.concentration))
        .map(
          (e) => `
          <tr>
            <td>${escapeHtml(e.sampleType || "sample")}</td>
            <td>${Number(e.contactMin || 30)} min</td>
            <td>${e.concentration} ${escapeHtml(unit)}</td>
            <td>${M.formatNum(Number(e.i0), 1)}</td>
            <td>${M.formatNum(Number(e.it), 1)}</td>
            <td>${escapeHtml(e.well || "—")}</td>
          </tr>`
        )
        .join("");

      const ec50 = formatIc50(analysis.ec50, unit, 50);
      const ec20 = formatIc50(analysis.ec20, unit, 20);
      sections.push(`
        <details class="section-cloze" open>
          <summary>
            <span class="section-title-text">Vibrio fischeri Bioluminescence Inhibition (DIN EN ISO 11348-2)</span>
            <span class="cloze-meta">${activeVibrio.length} readings &middot; ${contactMin} min</span>
          </summary>
          <div class="section-body">
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-label">Correction Factor f_kt</div><div class="kpi-val accent">${analysis.fkt !== null ? analysis.fkt.toFixed(4) : "—"}</div><div class="kpi-sub">${analysis.fktValid === null ? "Control missing" : analysis.fktValid ? "Valid (0.6–1.8)" : "Out of range (0.6–1.8)"}</div></div>
              <div class="kpi"><div class="kpi-label">Est. EC20 (Toxic)</div><div class="kpi-val">${escapeHtml(ec20.val)}</div><div class="kpi-sub">${escapeHtml(ec20.sub)}</div></div>
              <div class="kpi"><div class="kpi-label">Est. EC50</div><div class="kpi-val danger">${escapeHtml(ec50.val)}</div><div class="kpi-sub">${escapeHtml(ec50.sub)}</div></div>
              <div class="kpi"><div class="kpi-label">LID / G_L</div><div class="kpi-val">${analysis.lid !== null ? `${analysis.lid} ${escapeHtml(unit)}` : "—"}</div><div class="kpi-sub">Highest conc. ≤20% inh.</div></div>
            </div>
            ${renderInteractiveChartsGrid(chartCards)}
            <details class="data-cloze" open>
              <summary>Bioluminescence Summary Table (${analysis.rows.length} groups)</summary>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Concentration</th><th>n</th><th>Mean I&sub0;</th><th>Expected I<sub>ct</sub></th><th>Measured I<sub>t</sub></th><th>Inhibition (%)</th><th>Status</th></tr></thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
            </details>
            <details class="data-cloze">
              <summary>Raw Luminescence Readings (${activeVibrio.length} entries)</summary>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Type</th><th>Contact</th><th>Concentration</th><th>I&sub0;</th><th>I<sub>t</sub></th><th>Well / Rep</th></tr></thead>
                  <tbody>${rawVibRows}</tbody>
                </table>
              </div>
            </details>
          </div>
        </details>
      `);
    }

    // ---------------- 4. DILUTION SERIES SECTION ----------------
    const activeDilutions = (exp.dilutions || []).filter((d) => !d.ignored);
    if (activeDilutions.length > 0) {
      const sorted = [...activeDilutions].sort((a, b) => Number(a.concentration) - Number(b.concentration));
      const chartCards = [];
      if (C && C.buildDilutionSpec) {
        const spec = C.buildDilutionSpec(sorted, unit, true, { style: styleForTab("dilutions", "dilution-chart-bars") });
        chartCards.push(registerChart(spec, `${slugify(exp.name)}_dilutions`, "dilutions", "dilution-chart-bars"));
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
        <details class="section-cloze" open>
          <summary>
            <span class="section-title-text">Dilution Series (Verd&uuml;nnungsreihe)</span>
            <span class="cloze-meta">${sorted.length} steps</span>
          </summary>
          <div class="section-body">
            ${renderInteractiveChartsGrid(chartCards)}
            <details class="data-cloze" open>
              <summary>Pipetting Plan Table (${sorted.length} steps)</summary>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Concentration</th><th>${escapeHtml(medName)} (mL)</th><th>${escapeHtml(toxName)} (mL)</th><th>${escapeHtml(toxName)} (&mu;L)</th><th>Total (mL)</th></tr></thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
            </details>
          </div>
        </details>
      `);
    }

    // ---------------- 5. LAB NOTES SECTION ----------------
    if (exp.notes && exp.notes.trim()) {
      sections.push(`
        <details class="section-cloze" open>
          <summary>
            <span class="section-title-text">Lab Notes &amp; Observations</span>
            <span class="cloze-meta">${exp.notes.trim().split(/\r?\n/).length} lines</span>
          </summary>
          <div class="section-body">
            <pre class="notes-block">${escapeHtml(exp.notes)}</pre>
          </div>
        </details>
      `);
    }

    if (sections.length === 0) {
      sections.push(`<section class="report-section"><p class="muted">This experiment currently has no active measurements or notes.</p></section>`);
    }

    const exportedAt = new Date().toLocaleString();
    const saveJson = safeJsonForScript(S.serializeExperimentSave(exp));
    const chartsJson = safeJsonForScript(JSON.stringify(chartSpecs));
    const jsonFilename = `${slugify(exp.name)}.json`;
    const plotlyTag = await resolvePlotlyScriptTag(options);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(exp.name)} — Ecotoxicology Report</title>
  ${plotlyTag}
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
      max-width: 1080px;
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
      flex-wrap: wrap;
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
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn:hover { background: var(--subtle); }
    .btn-xs {
      height: 26px;
      padding: 0 9px;
      font-size: 11.5px;
    }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .btn-primary:hover { filter: brightness(0.95); background: var(--accent); }
    .report-section, .section-cloze {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 18px;
      overflow: hidden;
    }
    .report-section { padding: 20px 24px; }
    .section-cloze > summary {
      list-style: none;
      cursor: pointer;
      padding: 15px 22px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: var(--surface);
      border-bottom: 1px solid transparent;
      user-select: none;
      font-size: 16.5px;
      font-weight: 700;
    }
    .section-cloze[open] > summary {
      border-bottom-color: var(--border);
      background: #fafbfc;
    }
    .section-cloze > summary::before {
      content: "▸";
      display: inline-block;
      margin-right: 8px;
      color: var(--accent);
      transition: transform 0.16s ease;
    }
    .section-cloze[open] > summary::before {
      transform: rotate(90deg);
    }
    .section-title-text { flex: 1; }
    .cloze-meta {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .section-body { padding: 18px 22px 20px; }
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
      margin-bottom: 14px;
    }
    .charts-grid.single { grid-template-columns: 1fr; }
    .chart-card {
      margin: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #ffffff;
      padding: 8px 10px 6px;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
    }
    .chart-card.span-2 { grid-column: 1 / -1; }
    .chart-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .chart-card-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .report-chart-box {
      width: 100%;
      height: 360px;
    }
    .chart-lightbox {
      position: fixed;
      inset: 0;
      z-index: 999;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(3px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }
    .chart-lightbox.open { display: flex; }
    .chart-lightbox-inner {
      background: #ffffff;
      border-radius: 12px;
      padding: 14px 16px;
      width: 94vw;
      height: 88vh;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    }
    .chart-lightbox-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 14px;
      font-weight: 700;
    }
    #chart-lightbox-plot {
      flex: 1;
      width: 100%;
      min-height: 320px;
    }
    .data-cloze {
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      overflow: hidden;
    }
    .data-cloze > summary {
      cursor: pointer;
      padding: 9px 13px;
      font-size: 12.5px;
      font-weight: 700;
      color: #334155;
      background: var(--subtle);
      user-select: none;
    }
    .data-cloze[open] > summary {
      border-bottom: 1px solid var(--border);
    }
    .table-wrap {
      overflow-x: auto;
      background: var(--surface);
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
    .chart-offline-msg {
      display: flex;
      height: 100%;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 16px;
      color: var(--muted);
      font-size: 12.5px;
      border: 1px dashed var(--border);
      border-radius: 6px;
    }
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
      .header-actions, .btn-expand { display: none; }
      .report-header, .report-section, .section-cloze { border: 1px solid #cbd5e1; box-shadow: none; break-inside: avoid-page; }
      .chart-card, .table-wrap { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="report-header">
      <div>
        <h1 class="report-title">${escapeHtml(exp.name)}</h1>
        <div class="report-sub">Ecotoxicology Aid Interactive Report &middot; Exported ${escapeHtml(exportedAt)}</div>
        <div class="meta-row">
          ${exp.meta?.pollutant ? `<span class="meta-chip"><strong>Substance:</strong> ${escapeHtml(exp.meta.pollutant)}</span>` : ""}
          ${exp.meta?.organism ? `<span class="meta-chip"><strong>Organism:</strong> ${escapeHtml(exp.meta.organism)}</span>` : ""}
          <span class="meta-chip"><strong>Unit:</strong> ${escapeHtml(unit)}</span>
          <span class="meta-chip"><strong>Control:</strong> ${defaultCtrl} ${escapeHtml(unit)}</span>
          <span class="meta-chip"><strong>Default &lambda;:</strong> ${exp.meta?.defaultWavelength || 680} nm</span>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="btn" id="btn-expand-all">Expand All Data</button>
        <button type="button" class="btn" id="btn-collapse-all">Collapse All Data</button>
        <button type="button" class="btn btn-primary" onclick="window.print()">Print / PDF</button>
        <button type="button" class="btn" id="btn-dl-embedded-json">Download .json Save</button>
      </div>
    </header>

    ${sections.join("\n")}

    <footer class="report-footer">
      Generated by Ecotoxicology Aid &middot; Interactive Plotly charts &amp; collapsible data tables &middot; Drag this HTML file back into Ecotoxicology Aid to reload the experiment.
    </footer>
  </div>

  <div class="chart-lightbox" id="chart-lightbox" aria-hidden="true">
    <div class="chart-lightbox-inner">
      <div class="chart-lightbox-head">
        <span id="chart-lightbox-title">Graph</span>
        <button type="button" class="btn" id="chart-lightbox-close">✕ Close</button>
      </div>
      <div id="chart-lightbox-plot"></div>
    </div>
  </div>

  <script id="ecotox-save-data" type="application/json">${saveJson}</script>
  <script id="ecotox-charts-data" type="application/json">${chartsJson}</script>
  <script>
    (function () {
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

      var specsRaw = document.getElementById("ecotox-charts-data").textContent;
      var chartSpecs = [];
      try { chartSpecs = JSON.parse(specsRaw || "[]"); } catch (e) { chartSpecs = []; }
      var specByDomId = {};
      chartSpecs.forEach(function (s) { specByDomId[s.domId] = s; });

      function plotCfg(filename) {
        return {
          responsive: true,
          displaylogo: false,
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
          toImageButtonOptions: { format: "png", filename: filename || "ecotox_chart", width: 1000, height: 620, scale: 2 }
        };
      }

      function renderAllPlots() {
        if (typeof window.Plotly === "undefined") {
          chartSpecs.forEach(function (s) {
            var el = document.getElementById(s.domId);
            if (el) el.innerHTML = '<div class="chart-offline-msg">Plotly could not be loaded offline. Re-export from a served instance or connect to the internet to interact with graphs.</div>';
          });
          return;
        }
        chartSpecs.forEach(function (s) {
          var el = document.getElementById(s.domId);
          if (el) {
            window.Plotly.newPlot(el, s.traces, s.layout, plotCfg(s.filename));
          }
        });
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", renderAllPlots);
      } else {
        renderAllPlots();
      }

      document.querySelectorAll("details.section-cloze").forEach(function (det) {
        det.addEventListener("toggle", function () {
          if (det.open && typeof window.Plotly !== "undefined") {
            det.querySelectorAll(".report-chart-box").forEach(function (box) {
              if (box.data) window.Plotly.Plots.resize(box);
            });
          }
        });
      });

      document.getElementById("btn-expand-all").addEventListener("click", function () {
        document.querySelectorAll("details.section-cloze, details.data-cloze").forEach(function (d) { d.open = true; });
        if (typeof window.Plotly !== "undefined") {
          setTimeout(function () {
            document.querySelectorAll(".report-chart-box").forEach(function (box) {
              if (box.data) window.Plotly.Plots.resize(box);
            });
          }, 40);
        }
      });

      document.getElementById("btn-collapse-all").addEventListener("click", function () {
        document.querySelectorAll("details.data-cloze, details.section-cloze").forEach(function (d) { d.open = false; });
      });

      var lb = document.getElementById("chart-lightbox");
      var lbPlot = document.getElementById("chart-lightbox-plot");
      var lbTitle = document.getElementById("chart-lightbox-title");
      function closeLb() {
        lb.classList.remove("open");
        if (typeof window.Plotly !== "undefined" && lbPlot.data) {
          window.Plotly.purge(lbPlot);
        }
      }
      document.querySelectorAll("[data-expand-chart]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var s = specByDomId[btn.dataset.expandChart];
          if (!s || typeof window.Plotly === "undefined") return;
          lbTitle.textContent = s.title || "Graph";
          lb.classList.add("open");
          var fullLayout = Object.assign({}, s.layout, { autosize: true });
          delete fullLayout.width;
          delete fullLayout.height;
          setTimeout(function () {
            window.Plotly.newPlot(lbPlot, s.traces, fullLayout, plotCfg(s.filename));
          }, 20);
        });
      });
      document.getElementById("chart-lightbox-close").addEventListener("click", closeLb);
      lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
      window.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
      window.addEventListener("resize", function () {
        if (lb.classList.contains("open") && typeof window.Plotly !== "undefined" && lbPlot.data) {
          window.Plotly.Plots.resize(lbPlot);
        }
      });
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
