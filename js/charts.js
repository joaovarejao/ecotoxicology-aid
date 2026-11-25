/**
 * Ecotoxicology Aid — Interactive Plotly Chart Renderer
 * Generates publication-ready interactive graphs for OD, Cell Count, Lemna minor, and Dilutions,
 * supporting concentration highlight/isolate, control indicators, fit-window shading,
 * semi-log regression overlays, error bar toggles, log-X dose-response, and SVG export.
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});

  const SERIES_COLORS = [
    "#0d9488", // teal
    "#2563eb", // blue
    "#d97706", // amber
    "#9333ea", // purple
    "#e11d48", // rose/crimson
    "#059669", // emerald
    "#0891b2", // cyan
    "#ea580c", // orange
    "#4f46e5", // indigo
    "#be123c", // deep rose
  ];

  function getConcColor(conc, sortedAllConcs) {
    const idx = sortedAllConcs ? sortedAllConcs.indexOf(Number(conc)) : 0;
    return SERIES_COLORS[(idx >= 0 ? idx : 0) % SERIES_COLORS.length];
  }

  function getThemeTokens(forceLight = false) {
    const isDark = !forceLight && document.documentElement.getAttribute("data-theme") === "dark";
    return {
      isDark,
      paperBg: forceLight ? "#ffffff" : "rgba(0,0,0,0)",
      plotBg: isDark ? "#0f172a" : "#ffffff",
      text: isDark ? "#e2e8f0" : "#1e293b",
      muted: isDark ? "#94a3b8" : "#64748b",
      grid: isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)",
      zeroLine: isDark ? "rgba(148, 163, 184, 0.3)" : "rgba(15, 23, 42, 0.22)",
      threshold: isDark ? "#94a3b8" : "#64748b",
      windowFill: isDark ? "rgba(20, 184, 166, 0.12)" : "rgba(13, 148, 136, 0.09)",
      windowLine: isDark ? "rgba(45, 212, 191, 0.65)" : "rgba(13, 148, 136, 0.55)",
      crimson: isDark ? "#fb7185" : "#e11d48",
      teal: isDark ? "#2dd4bf" : "#0d9488",
      blue: isDark ? "#60a5fa" : "#2563eb",
      amber: isDark ? "#fbbf24" : "#d97706",
    };
  }

  function baseLayout(title, xTitle, yTitle, extra = {}, forceLight = false) {
    const t = getThemeTokens(forceLight);
    return {
      title: {
        text: title,
        font: { size: 13.5, color: t.text, family: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" },
        x: 0.02,
        xanchor: "left",
      },
      paper_bgcolor: t.paperBg,
      plot_bgcolor: t.plotBg,
      font: { color: t.text, size: 11.5, family: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" },
      margin: { l: 58, r: 22, t: 44, b: 52 },
      hovermode: "closest",
      showlegend: true,
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: -0.28,
        xanchor: "left",
        x: 0,
        font: { size: 10.5, color: t.muted },
        bgcolor: "rgba(0,0,0,0)",
      },
      xaxis: {
        title: { text: xTitle, font: { size: 11.5, color: t.muted }, standoff: 8 },
        gridcolor: t.grid,
        zerolinecolor: t.zeroLine,
        tickfont: { color: t.muted },
        ...(extra.xaxis || {}),
      },
      yaxis: {
        title: { text: yTitle, font: { size: 11.5, color: t.muted }, standoff: 8 },
        gridcolor: t.grid,
        zerolinecolor: t.zeroLine,
        tickfont: { color: t.muted },
        ...(extra.yaxis || {}),
      },
      shapes: extra.shapes || [],
      annotations: extra.annotations || [],
    };
  }

  function plotConfig(filenamePrefix) {
    return {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
      toImageButtonOptions: {
        format: "png",
        filename: filenamePrefix || "ecotox_plot",
        height: 600,
        width: 900,
        scale: 2,
      },
    };
  }

  function showEmpty(containerId, title, subtitle) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (global.Plotly && el.data) {
      global.Plotly.purge(el);
    }
    el.innerHTML = `
      <div class="chart-empty">
        <div class="chart-empty-title">${title}</div>
        <div class="chart-empty-sub">${subtitle}</div>
      </div>
    `;
  }

  function preparePlotEl(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return null;
    if (el.querySelector(".chart-empty")) {
      el.innerHTML = "";
    }
    return el;
  }

  function groupByConcentration(rows) {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.concentration)) map.set(r.concentration, []);
      map.get(r.concentration).push(r);
    }
    const sortedEntries = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    for (const [, grp] of sortedEntries) {
      grp.sort((a, b) => a.elapsedHours - b.elapsedHours);
    }
    return sortedEntries;
  }

  function normalizeViewOptions(opts = {}) {
    const rawSet = opts.highlightedConcs;
    const highlighted = new Set();
    if (rawSet instanceof Set) {
      rawSet.forEach((v) => highlighted.add(Number(v)));
    } else if (Array.isArray(rawSet)) {
      rawSet.forEach((v) => highlighted.add(Number(v)));
    }
    return {
      highlighted,
      filterMode: opts.filterMode === "isolate" ? "isolate" : "highlight",
      controlConc: Number.isFinite(Number(opts.controlConc)) ? Number(opts.controlConc) : null,
      showErrorBars: opts.showErrorBars !== false,
      showFitLines: Boolean(opts.showFitLines),
      logX: Boolean(opts.logX),
      icTarget: Number.isFinite(Number(opts.icTarget)) ? Number(opts.icTarget) : 50,
      tStartHours: opts.tStartHours !== null && opts.tStartHours !== undefined && opts.tStartHours !== "" ? Number(opts.tStartHours) : null,
      tEndHours: opts.tEndHours !== null && opts.tEndHours !== undefined && opts.tEndHours !== "" ? Number(opts.tEndHours) : null,
    };
  }

  function buildFitWindowDecorations(kinetics, view, t) {
    if ((view.tStartHours === null || !Number.isFinite(view.tStartHours)) && (view.tEndHours === null || !Number.isFinite(view.tEndHours))) {
      return { shapes: [], annotations: [] };
    }
    const times = kinetics.map((r) => r.elapsedHours).filter(Number.isFinite);
    if (times.length === 0) return { shapes: [], annotations: [] };
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const x0 = view.tStartHours !== null && Number.isFinite(view.tStartHours) ? view.tStartHours : minT;
    const x1 = view.tEndHours !== null && Number.isFinite(view.tEndHours) ? view.tEndHours : maxT;

    const shapes = [
      {
        type: "rect",
        xref: "x",
        yref: "paper",
        x0,
        x1,
        y0: 0,
        y1: 1,
        fillcolor: t.windowFill,
        line: { color: t.windowLine, width: 1.2, dash: "dot" },
        layer: "below",
      },
    ];
    const annotations = [
      {
        xref: "x",
        yref: "paper",
        x: (x0 + x1) / 2,
        y: 1.0,
        yanchor: "top",
        text: `Fit window (${x0.toFixed(1)}–${x1.toFixed(1)} h)`,
        showarrow: false,
        font: { size: 10, color: t.teal },
        bgcolor: t.isDark ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.82)",
        borderpad: 2,
      },
    ];
    return { shapes, annotations };
  }

  function seriesVisualStyle(conc, allConcs, view, defaultSymbol = "circle") {
    const color = getConcColor(conc, allConcs);
    const isCtrl = view.controlConc !== null && Number(conc) === view.controlConc;
    const hasHighlight = view.highlighted.size > 0;
    const isHighlighted = hasHighlight && view.highlighted.has(Number(conc));

    let opacity = 1.0;
    let width = isCtrl ? 2.8 : 2.2;
    let markerSize = isCtrl ? 8 : 7;
    let markerOutline = isCtrl ? 1.5 : 0;

    if (hasHighlight && view.filterMode === "highlight") {
      if (isHighlighted) {
        opacity = 1.0;
        width = 3.8;
        markerSize = 10;
        markerOutline = 1.8;
      } else {
        opacity = 0.2;
        width = 1.3;
        markerSize = 5;
        markerOutline = 0;
      }
    }

    return {
      color,
      isCtrl,
      isHighlighted,
      opacity,
      width,
      markerSize,
      markerOutline,
      symbol: isCtrl ? "star" : defaultSymbol,
    };
  }

  /**
   * Builds Plotly trace/layout specs for a time-series kinetics suite (OD or Cell Count).
   */
  function buildTimeSeriesSpecs(config, forceLight = false) {
    const {
      analysis,
      concUnit,
      yAxisLabel,
      growthTitle,
      semiLogYLabel,
      singleTimepointBarTitle,
      viewOptions,
    } = config;

    const view = normalizeViewOptions(viewOptions);
    const t = getThemeTokens(forceLight);
    const { kinetics, summary, timepointsCount, ic50, concentrations } = analysis;
    const specs = { growth: null, semilog: null, mu: null, dose: null };

    if (!kinetics || kinetics.length === 0) return specs;

    const allConcs = concentrations || Array.from(new Set(kinetics.map((r) => r.concentration))).sort((a, b) => a - b);
    let grouped = groupByConcentration(kinetics);
    if (view.highlighted.size > 0 && view.filterMode === "isolate") {
      const isolated = grouped.filter(([conc]) => view.highlighted.has(Number(conc)));
      if (isolated.length > 0) grouped = isolated;
    }

    const fitDeco = buildFitWindowDecorations(kinetics, view, t);

    // 1. Growth Curves or Single-Timepoint Bar Chart
    if (timepointsCount === 1) {
      let rows = [...kinetics];
      if (view.highlighted.size > 0 && view.filterMode === "isolate") {
        const filtered = rows.filter((r) => view.highlighted.has(Number(r.concentration)));
        if (filtered.length > 0) rows = filtered;
      }
      const xs = rows.map((r) => `${r.concentration} ${concUnit}${Number(r.concentration) === view.controlConc ? " ★" : ""}`);
      const ys = rows.map((r) => r.meanVal);
      const errs = rows.map((r) => r.stdVal);
      const colors = rows.map((r) => getConcColor(r.concentration, allConcs));
      const opacities = rows.map((r) => {
        if (view.highlighted.size === 0 || view.filterMode === "isolate") return 0.92;
        return view.highlighted.has(Number(r.concentration)) ? 1.0 : 0.22;
      });
      const lineWidths = rows.map((r) =>
        view.highlighted.has(Number(r.concentration)) || Number(r.concentration) === view.controlConc ? 2 : 0
      );

      const layout = baseLayout(
        singleTimepointBarTitle || `${growthTitle} (Single Timepoint)`,
        `Concentration (${concUnit})`,
        yAxisLabel,
        {},
        forceLight
      );
      layout.showlegend = false;
      specs.growth = {
        key: "growth",
        title: layout.title.text,
        traces: [
          {
            type: "bar",
            x: xs,
            y: ys,
            error_y: { type: "data", array: errs, visible: view.showErrorBars, color: t.muted, thickness: 1.5 },
            marker: {
              color: colors,
              opacity: opacities,
              line: { color: t.text, width: lineWidths },
            },
            hovertemplate: `<b>%{x}</b><br>${yAxisLabel}: %{y:.4g} ± %{error_y.array:.3g}<extra></extra>`,
          },
        ],
        layout,
      };
      return specs;
    }

    specs.growth = {
      key: "growth",
      title: growthTitle,
      traces: grouped.map(([conc, grp]) => {
        const st = seriesVisualStyle(conc, allConcs, view, "circle");
        return {
          type: "scatter",
          mode: "lines+markers",
          name: `${conc} ${concUnit}${st.isCtrl ? " ★ Ctrl" : ""}`,
          x: grp.map((r) => r.elapsedHours),
          y: grp.map((r) => r.meanVal),
          opacity: st.opacity,
          error_y: {
            type: "data",
            array: grp.map((r) => r.stdVal),
            visible: view.showErrorBars,
            thickness: 1.4,
            width: 4,
          },
          line: { color: st.color, width: st.width },
          marker: {
            size: st.markerSize,
            symbol: st.symbol,
            color: st.color,
            line: { color: t.plotBg, width: st.markerOutline },
          },
          hovertemplate: `<b>${conc} ${concUnit}${st.isCtrl ? " (Control)" : ""}</b><br>t = %{x:.2f} h<br>Mean: %{y:.4g} ± %{error_y.array:.3g}<extra></extra>`,
        };
      }),
      layout: baseLayout(growthTitle, "Elapsed Time (h)", yAxisLabel, fitDeco, forceLight),
    };

    // 2. Semi-Log Growth Curve (+ optional OLS Fit Lines)
    const semiTraces = grouped.map(([conc, grp]) => {
      const st = seriesVisualStyle(conc, allConcs, view, "square");
      const valid = grp.filter((r) => r.lnMeanVal !== null);
      return {
        type: "scatter",
        mode: "lines+markers",
        name: `${conc} ${concUnit}${st.isCtrl ? " ★ Ctrl" : ""}`,
        x: valid.map((r) => r.elapsedHours),
        y: valid.map((r) => r.lnMeanVal),
        opacity: st.opacity,
        line: { color: st.color, width: st.width },
        marker: {
          size: st.markerSize,
          symbol: st.symbol,
          color: st.color,
          line: { color: t.plotBg, width: st.markerOutline },
        },
        hovertemplate: `<b>${conc} ${concUnit}${st.isCtrl ? " (Control)" : ""}</b><br>t = %{x:.2f} h<br>${semiLogYLabel}: %{y:.4f}<extra></extra>`,
      };
    });

    if (view.showFitLines && summary) {
      const summaryByConc = new Map(summary.map((s) => [s.concentration, s]));
      for (const [conc] of grouped) {
        const sRow = summaryByConc.get(conc);
        if (!sRow || !sRow.fitLine) continue;
        const st = seriesVisualStyle(conc, allConcs, view, "square");
        semiTraces.push({
          type: "scatter",
          mode: "lines",
          name: `${conc} fit (R²=${sRow.r2?.toFixed(3) ?? "—"})`,
          showlegend: false,
          x: [sRow.fitLine.x0, sRow.fitLine.x1],
          y: [sRow.fitLine.y0, sRow.fitLine.y1],
          opacity: Math.min(1, st.opacity * 0.9),
          line: { color: st.color, width: Math.max(1.5, st.width - 0.5), dash: "dot" },
          hovertemplate: `<b>${conc} ${concUnit} OLS Fit</b><br>μ = ${sRow.mu?.toFixed(5)} h⁻¹<br>R² = ${sRow.r2?.toFixed(4)}<extra></extra>`,
        });
      }
    }

    specs.semilog = {
      key: "semilog",
      title: view.showFitLines
        ? "Semi-Log Growth Curve + OLS Fit Lines"
        : "Semi-Log Growth Curve (Exponential Phase Check)",
      traces: semiTraces,
      layout: baseLayout(
        view.showFitLines ? "Semi-Log Growth Curve + OLS Fit Lines" : "Semi-Log Growth Curve (Exponential Phase Check)",
        "Elapsed Time (h)",
        semiLogYLabel,
        fitDeco,
        forceLight
      ),
    };

    // 3. Stepwise Specific Growth Rate (mu) Over Time
    specs.mu = {
      key: "mu",
      title: "Stepwise Specific Growth Rate (μ) Over Time",
      traces: grouped.map(([conc, grp]) => {
        const st = seriesVisualStyle(conc, allConcs, view, "triangle-up");
        const valid = grp.filter((r) => r.intervalMu !== null);
        return {
          type: "scatter",
          mode: "lines+markers",
          name: `${conc} ${concUnit}${st.isCtrl ? " ★ Ctrl" : ""}`,
          x: valid.map((r) => r.elapsedHours),
          y: valid.map((r) => r.intervalMu),
          opacity: st.opacity,
          line: { color: st.color, width: st.width },
          marker: {
            size: st.markerSize + 1,
            symbol: st.symbol,
            color: st.color,
            line: { color: t.plotBg, width: st.markerOutline },
          },
          hovertemplate: `<b>${conc} ${concUnit}${st.isCtrl ? " (Control)" : ""}</b><br>t = %{x:.2f} h<br>μ = %{y:.5f} h⁻¹<extra></extra>`,
        };
      }),
      layout: baseLayout("Stepwise Specific Growth Rate (μ) Over Time", "Elapsed Time (h)", "μ (h⁻¹)", fitDeco, forceLight),
    };

    // 4. Dose-Response Curve (with Control indicator, Highlighted rings, Log X, & dynamic ICx line)
    let doseValid = summary.filter((r) => r.inhibition !== null);
    if (view.logX) {
      doseValid = doseValid.filter((r) => r.concentration > 0);
    }

    if (doseValid.length > 0) {
      const targetPct = view.icTarget;
      const pointColors = doseValid.map((r) => {
        if (view.highlighted.has(Number(r.concentration))) return getConcColor(r.concentration, allConcs);
        if (r.isControl) return t.teal;
        return t.crimson;
      });
      const pointSizes = doseValid.map((r) => {
        if (view.highlighted.has(Number(r.concentration))) return 13;
        if (r.isControl) return 11;
        return 8;
      });
      const pointSymbols = doseValid.map((r) => {
        if (r.isControl) return "star";
        if (view.highlighted.has(Number(r.concentration))) return "circle";
        return "diamond";
      });

      const traces = [
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Inhibition (%)",
          x: doseValid.map((r) => r.concentration),
          y: doseValid.map((r) => r.inhibition),
          line: { color: t.crimson, width: 2.3 },
          marker: {
            size: pointSizes,
            symbol: pointSymbols,
            color: pointColors,
            line: { color: t.plotBg, width: 1.5 },
          },
          hovertemplate: `<b>%{x} ${concUnit}</b><br>Inhibition: %{y:.2f}%<extra></extra>`,
        },
      ];

      // Add explicit halo trace for highlighted concentrations on Dose-Response
      const hlPoints = doseValid.filter((r) => view.highlighted.has(Number(r.concentration)));
      if (hlPoints.length > 0) {
        traces.push({
          type: "scatter",
          mode: "markers",
          name: "Highlighted",
          x: hlPoints.map((r) => r.concentration),
          y: hlPoints.map((r) => r.inhibition),
          marker: {
            size: 19,
            symbol: "circle-open",
            color: hlPoints.map((r) => getConcColor(r.concentration, allConcs)),
            line: { width: 2.6, color: hlPoints.map((r) => getConcColor(r.concentration, allConcs)) },
          },
          hoverinfo: "skip",
        });
      }

      const shapes = [
        {
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          y0: targetPct,
          y1: targetPct,
          line: { color: t.threshold, width: 1.5, dash: "dash" },
        },
      ];

      const annotations = [
        {
          xref: "paper",
          x: 0.99,
          y: targetPct,
          xanchor: "right",
          yanchor: "bottom",
          text: `IC${targetPct} (${targetPct}%)`,
          showarrow: false,
          font: { size: 10.5, color: t.muted },
        },
      ];

      if (ic50 && ic50.status === "interpolated" && Number.isFinite(ic50.value) && (!view.logX || ic50.value > 0)) {
        traces.push({
          type: "scatter",
          mode: "markers",
          name: `Est. IC${targetPct} ≈ ${ic50.value.toFixed(3)} ${concUnit}`,
          x: [ic50.value],
          y: [targetPct],
          marker: { size: 11, symbol: "x", color: t.amber, line: { width: 2.5, color: t.amber } },
          hovertemplate: `<b>Est. IC${targetPct} (linear)</b><br>${ic50.value.toFixed(4)} ${concUnit}<extra></extra>`,
        });
      }

      const xAxisExtra = view.logX ? { type: "log" } : {};
      const xTitle = view.logX ? `Concentration (${concUnit}, log₁₀ scale, c > 0)` : `Concentration (${concUnit})`;

      specs.dose = {
        key: "dose",
        title: "Dose-Response: Growth Inhibition vs. Concentration",
        traces,
        layout: baseLayout(
          "Dose-Response: Growth Inhibition vs. Concentration",
          xTitle,
          "Inhibition (%)",
          { shapes, annotations, xaxis: xAxisExtra },
          forceLight
        ),
      };
    }

    return specs;
  }

  /**
   * Renders the 4-plot time-series kinetics suite (shared by OD and Cell Count tabs).
   */
  function renderTimeSeriesSuite(config) {
    const { ids, analysis, filePrefix } = config;
    const { kinetics, timepointsCount } = analysis;

    if (!kinetics || kinetics.length === 0) {
      showEmpty(ids.growth, "No measurements yet", "Add measurements on the left to generate growth curves.");
      showEmpty(ids.semilog, "No measurements yet", "Semi-log exponential check will appear here.");
      showEmpty(ids.mu, "No measurements yet", "Stepwise specific growth rate (μ) will appear here.");
      showEmpty(ids.dose, "No measurements yet", "Dose-response inhibition curve will appear here.");
      return;
    }

    const specs = buildTimeSeriesSpecs(config, false);

    const growthEl = preparePlotEl(ids.growth);
    if (growthEl && specs.growth) {
      const suffix = timepointsCount === 1 ? "snapshot" : "growth";
      global.Plotly.react(growthEl, specs.growth.traces, specs.growth.layout, plotConfig(`${filePrefix}_${suffix}`));
    }

    if (timepointsCount < 2) {
      showEmpty(ids.semilog, "Waiting for 2nd timepoint", "Add another timestamp to inspect exponential phase linearity ln(Y) vs. time.");
      showEmpty(ids.mu, "Waiting for 2nd timepoint", "At least 2 timepoints are needed to compute interval μ (h⁻¹).");
      showEmpty(ids.dose, "Waiting for 2nd timepoint", "Dose-response inhibition (%) requires growth rate μ across ≥ 2 timepoints.");
      return;
    }

    const semiEl = preparePlotEl(ids.semilog);
    if (semiEl && specs.semilog) {
      global.Plotly.react(semiEl, specs.semilog.traces, specs.semilog.layout, plotConfig(`${filePrefix}_semilog`));
    }

    const muEl = preparePlotEl(ids.mu);
    if (muEl && specs.mu) {
      global.Plotly.react(muEl, specs.mu.traces, specs.mu.layout, plotConfig(`${filePrefix}_interval_mu`));
    }

    if (!specs.dose) {
      showEmpty(ids.dose, "Control μ unavailable", "Ensure the selected Control concentration has ≥ 2 timepoints and μ ≠ 0.");
    } else {
      const doseEl = preparePlotEl(ids.dose);
      if (doseEl) {
        global.Plotly.react(doseEl, specs.dose.traces, specs.dose.layout, plotConfig(`${filePrefix}_dose_response`));
      }
    }
  }

  /**
   * Builds Plotly specs for the Lemna minor frond assay with highlight/isolate, Log X, ±SD, and ICx.
   */
  function buildLemnaSpecs(analysis, concUnit, forceLight = false, viewOptions = {}) {
    const view = normalizeViewOptions(viewOptions);
    const t = getThemeTokens(forceLight);
    const { rows, ic50 } = analysis;
    const specs = { fronds: null, mu: null, dose: null };

    if (!rows || rows.length === 0) return specs;

    const allConcs = rows.map((r) => r.dilution);
    let visibleRows = [...rows];
    if (view.highlighted.size > 0 && view.filterMode === "isolate") {
      const isolated = visibleRows.filter((r) => view.highlighted.has(Number(r.dilution)));
      if (isolated.length > 0) visibleRows = isolated;
    }

    const labels = visibleRows.map((r) => `${r.dilution} ${concUnit}${r.isControl ? " ★" : ""}`);
    const barOpacity = visibleRows.map((r) => {
      if (view.highlighted.size === 0 || view.filterMode === "isolate") return 0.9;
      return view.highlighted.has(Number(r.dilution)) ? 1.0 : 0.22;
    });
    const barLineWidth = visibleRows.map((r) => (view.highlighted.has(Number(r.dilution)) ? 2.2 : 0));

    // 1. Frond Count Day 0 vs Final Day
    const frondsLayout = baseLayout("Lemna Frond Count (Mean ± SD)", `Concentration (${concUnit})`, "Fronds (count)", {}, forceLight);
    frondsLayout.barmode = "group";
    specs.fronds = {
      key: "fronds",
      title: frondsLayout.title.text,
      traces: [
        {
          type: "bar",
          name: "Initial (N₀)",
          x: labels,
          y: visibleRows.map((r) => r.avgN0),
          error_y: { type: "data", array: visibleRows.map((r) => r.sdN0), visible: view.showErrorBars, thickness: 1.4 },
          marker: { color: t.blue, opacity: barOpacity.map((o) => o * 0.85), line: { color: t.text, width: barLineWidth } },
          hovertemplate: "<b>%{x}</b><br>Avg N₀: %{y:.2f} ± %{error_y.array:.2f}<extra></extra>",
        },
        {
          type: "bar",
          name: "Final (Nₜ)",
          x: labels,
          y: visibleRows.map((r) => r.avgNt),
          error_y: { type: "data", array: visibleRows.map((r) => r.sdNt), visible: view.showErrorBars, thickness: 1.4 },
          marker: { color: t.teal, opacity: barOpacity, line: { color: t.text, width: barLineWidth } },
          hovertemplate: "<b>%{x}</b><br>Avg Nₜ: %{y:.2f} ± %{error_y.array:.2f}<extra></extra>",
        },
      ],
      layout: frondsLayout,
    };

    // 2. Growth rate mu by concentration
    const muLayout = baseLayout("Specific Growth Rate (μ) by Concentration", `Concentration (${concUnit})`, "μ (h⁻¹)", {}, forceLight);
    muLayout.showlegend = false;
    specs.mu = {
      key: "mu",
      title: muLayout.title.text,
      traces: [
        {
          type: "bar",
          name: "μ (h⁻¹)",
          x: labels,
          y: visibleRows.map((r) => r.mu),
          marker: {
            color: visibleRows.map((r) => getConcColor(r.dilution, allConcs)),
            opacity: barOpacity,
            line: { color: t.text, width: barLineWidth },
          },
          hovertemplate: "<b>%{x}</b><br>μ = %{y:.5f} h⁻¹<extra></extra>",
        },
      ],
      layout: muLayout,
    };

    // 3. Dose-Response Inhibition
    let validInh = rows.filter((r) => r.inhibition !== null);
    if (view.logX) validInh = validInh.filter((r) => r.dilution > 0);

    if (validInh.length > 0) {
      const targetPct = view.icTarget;
      const pointColors = validInh.map((r) => {
        if (view.highlighted.has(Number(r.dilution))) return getConcColor(r.dilution, allConcs);
        if (r.isControl) return t.teal;
        return t.crimson;
      });
      const pointSizes = validInh.map((r) => (view.highlighted.has(Number(r.dilution)) ? 13 : r.isControl ? 11 : 8));
      const pointSymbols = validInh.map((r) => (r.isControl ? "star" : view.highlighted.has(Number(r.dilution)) ? "circle" : "diamond"));

      const traces = [
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Hemmung (%)",
          x: validInh.map((r) => r.dilution),
          y: validInh.map((r) => r.inhibition),
          line: { color: t.crimson, width: 2.3 },
          marker: { size: pointSizes, symbol: pointSymbols, color: pointColors, line: { color: t.plotBg, width: 1.5 } },
          hovertemplate: `<b>%{x} ${concUnit}</b><br>Hemmung: %{y:.2f}%<extra></extra>`,
        },
      ];

      const hlPoints = validInh.filter((r) => view.highlighted.has(Number(r.dilution)));
      if (hlPoints.length > 0) {
        traces.push({
          type: "scatter",
          mode: "markers",
          name: "Highlighted",
          x: hlPoints.map((r) => r.dilution),
          y: hlPoints.map((r) => r.inhibition),
          marker: {
            size: 19,
            symbol: "circle-open",
            color: hlPoints.map((r) => getConcColor(r.dilution, allConcs)),
            line: { width: 2.6, color: hlPoints.map((r) => getConcColor(r.dilution, allConcs)) },
          },
          hoverinfo: "skip",
        });
      }

      const shapes = [
        {
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          y0: targetPct,
          y1: targetPct,
          line: { color: t.threshold, width: 1.5, dash: "dash" },
        },
      ];

      const annotations = [
        {
          xref: "paper",
          x: 0.99,
          y: targetPct,
          xanchor: "right",
          yanchor: "bottom",
          text: `IC${targetPct} (${targetPct}%)`,
          showarrow: false,
          font: { size: 10.5, color: t.muted },
        },
      ];

      if (ic50 && ic50.status === "interpolated" && Number.isFinite(ic50.value) && (!view.logX || ic50.value > 0)) {
        traces.push({
          type: "scatter",
          mode: "markers",
          name: `Est. IC${targetPct} ≈ ${ic50.value.toFixed(3)} ${concUnit}`,
          x: [ic50.value],
          y: [targetPct],
          marker: { size: 11, symbol: "x", color: t.amber, line: { width: 2.5, color: t.amber } },
          hovertemplate: `<b>Est. IC${targetPct} (linear)</b><br>${ic50.value.toFixed(4)} ${concUnit}<extra></extra>`,
        });
      }

      specs.dose = {
        key: "dose",
        title: "Dose-Response: Hemmung (%) vs. Concentration",
        traces,
        layout: baseLayout(
          "Dose-Response: Hemmung (%) vs. Concentration",
          view.logX ? `Concentration (${concUnit}, log₁₀ scale, c > 0)` : `Concentration (${concUnit})`,
          "Hemmung (%)",
          { shapes, annotations, xaxis: view.logX ? { type: "log" } : {} },
          forceLight
        ),
      };
    }

    return specs;
  }

  /**
   * Renders the 3-plot suite for Lemna minor frond assay.
   */
  function renderLemnaCharts(analysis, concUnit, viewOptions = {}) {
    const { rows } = analysis;

    if (!rows || rows.length === 0) {
      showEmpty("lemna-chart-fronds", "No Lemna samples yet", "Add frond counts on the left to visualize Day 0 vs. Final Day growth.");
      showEmpty("lemna-chart-mu", "No Lemna samples yet", "Specific growth rate (μ) comparison will appear here.");
      showEmpty("lemna-chart-dose", "No Lemna samples yet", "Dose-response inhibition (%) curve will appear here.");
      return;
    }

    const specs = buildLemnaSpecs(analysis, concUnit, false, viewOptions);

    const frondsEl = preparePlotEl("lemna-chart-fronds");
    if (frondsEl && specs.fronds) {
      global.Plotly.react(frondsEl, specs.fronds.traces, specs.fronds.layout, plotConfig("lemna_fronds"));
    }

    const muEl = preparePlotEl("lemna-chart-mu");
    if (muEl && specs.mu) {
      global.Plotly.react(muEl, specs.mu.traces, specs.mu.layout, plotConfig("lemna_mu"));
    }

    if (!specs.dose) {
      showEmpty("lemna-chart-dose", "Control sample missing", "Add a control sample (matching Control Concentration) to compute Hemmung (%).");
    } else {
      const doseEl = preparePlotEl("lemna-chart-dose");
      if (doseEl) {
        global.Plotly.react(doseEl, specs.dose.traces, specs.dose.layout, plotConfig("lemna_dose_response"));
      }
    }
  }

  /**
   * Builds Plotly spec for the Dilution Series stacked bar chart.
   */
  function buildDilutionSpec(dilutions, concUnit, forceLight = false) {
    if (!dilutions || dilutions.length === 0) return null;
    const t = getThemeTokens(forceLight);
    const sorted = [...dilutions].sort((a, b) => Number(a.concentration) - Number(b.concentration));
    const labels = sorted.map((d) => `${d.concentration} ${concUnit}`);
    const mediumLabel = sorted[0]?.mediumName || "Medium";
    const toxicantLabel = sorted[0]?.toxicantName || "Toxicant";

    const layout = baseLayout("Verdünnungsreihe: Pipetting Volumes", `Target Concentration (${concUnit})`, "Volume (mL)", {}, forceLight);
    layout.barmode = "stack";

    return {
      key: "dilutions",
      title: layout.title.text,
      traces: [
        {
          type: "bar",
          name: `${mediumLabel} (mL)`,
          x: labels,
          y: sorted.map((d) => Number(d.mediumMl) || 0),
          marker: { color: t.blue, opacity: 0.85 },
          hovertemplate: `<b>%{x}</b><br>${mediumLabel}: %{y:.4g} mL<extra></extra>`,
        },
        {
          type: "bar",
          name: `${toxicantLabel} (mL)`,
          x: labels,
          y: sorted.map((d) => Number(d.toxicantMl) || 0),
          marker: { color: t.crimson, opacity: 0.9 },
          hovertemplate: `<b>%{x}</b><br>${toxicantLabel}: %{y:.4g} mL<extra></extra>`,
        },
      ],
      layout,
    };
  }

  /**
   * Renders stacked volume bar chart for the Dilution Series helper tab.
   */
  function renderDilutionChart(dilutions, concUnit) {
    if (!dilutions || dilutions.length === 0) {
      showEmpty("dilution-chart-bars", "No dilution steps yet", "Add rows or generate a dilution series on the left.");
      return;
    }

    const spec = buildDilutionSpec(dilutions, concUnit, false);
    const el = preparePlotEl("dilution-chart-bars");
    if (el && spec) {
      global.Plotly.react(el, spec.traces, spec.layout, plotConfig("dilution_series"));
    }
  }

  /**
   * Renders a Plotly spec offscreen and returns an embedded vector SVG (or PNG fallback) data URI.
   */
  async function renderSpecToImage(spec, width = 760, height = 430) {
    if (!spec || !global.Plotly) return null;
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    host.style.pointerEvents = "none";
    document.body.appendChild(host);

    try {
      const exportLayout = {
        ...spec.layout,
        width,
        height,
        autosize: false,
      };
      await global.Plotly.newPlot(host, spec.traces, exportLayout, { staticPlot: true, displayModeBar: false });
      try {
        const dataUri = await global.Plotly.toImage(host, { format: "svg", width, height });
        return { key: spec.key, title: spec.title, dataUri };
      } catch {
        const dataUri = await global.Plotly.toImage(host, { format: "png", width, height, scale: 2 });
        return { key: spec.key, title: spec.title, dataUri };
      }
    } finally {
      try {
        global.Plotly.purge(host);
      } catch {
        // ignore purge error
      }
      host.remove();
    }
  }

  Ecotox.Charts = {
    SERIES_COLORS,
    getConcColor,
    buildTimeSeriesSpecs,
    buildLemnaSpecs,
    buildDilutionSpec,
    renderTimeSeriesSuite,
    renderLemnaCharts,
    renderDilutionChart,
    renderSpecToImage,
  };
})(typeof window !== "undefined" ? window : globalThis);
