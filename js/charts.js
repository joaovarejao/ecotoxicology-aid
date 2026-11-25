/**
 * Ecotoxicology Aid — Interactive Plotly Chart Renderer
 * Generates publication-ready interactive graphs for OD, Cell Count, Lemna minor, and Dilutions,
 * supporting concentration highlight/isolate, control indicators, fit-window shading,
 * semi-log regression overlays, error bar toggles, log-X dose-response, and SVG export.
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});

  const PALETTES = {
    default: {
      label: "Lab Default",
      colors: ["#0d9488", "#2563eb", "#d97706", "#9333ea", "#e11d48", "#059669", "#0891b2", "#ea580c", "#4f46e5", "#be123c"],
    },
    tab10: {
      label: "Matplotlib (tab10)",
      colors: ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"],
    },
    okabe: {
      label: "Okabe-Ito (Safe)",
      colors: ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#111827"],
    },
    viridis: {
      label: "Viridis",
      colors: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"],
    },
    plasma: {
      label: "Plasma",
      colors: ["#0d0887", "#6a00a8", "#b12a90", "#e16462", "#fca636", "#f0f921"],
    },
    ocean: {
      label: "Ocean Teal-Blue",
      colors: ["#0f766e", "#0284c7", "#1d4ed8", "#0369a1", "#059669", "#0d9488", "#38bdf8"],
    },
    mono: {
      label: "Monochrome (Print)",
      colors: ["#0f172a", "#334155", "#475569", "#64748b", "#94a3b8", "#cbd5e1"],
    },
  };

  const SERIES_COLORS = PALETTES.default.colors;

  const DEFAULT_CHART_STYLE = {
    palette: "default",
    primaryColor: "",
    seriesColors: {},
    lineStyle: "solid",
    lineWidth: 2.2,
    pointStyle: "auto",
    pointSize: 7,
  };

  const renderedSpecs = new Map();

  function normalizeStyleOptions(raw = {}) {
    const s = raw || {};
    const lw = Number(s.lineWidth);
    const ps = Number(s.pointSize);
    return {
      palette: PALETTES[s.palette] ? s.palette : "default",
      primaryColor: typeof s.primaryColor === "string" ? s.primaryColor.trim() : "",
      seriesColors: s.seriesColors && typeof s.seriesColors === "object" ? { ...s.seriesColors } : {},
      lineStyle: ["solid", "dash", "dot", "dashdot", "none"].includes(s.lineStyle) ? s.lineStyle : "solid",
      lineWidth: Number.isFinite(lw) && lw >= 0.5 && lw <= 8 ? lw : 2.2,
      pointStyle: typeof s.pointStyle === "string" && s.pointStyle ? s.pointStyle : "auto",
      pointSize: Number.isFinite(ps) && ps >= 2 && ps <= 18 ? ps : 7,
    };
  }

  function mergeStyleOptions(baseStyle = {}, overrideStyle = {}) {
    const b = normalizeStyleOptions(baseStyle);
    const o = overrideStyle || {};
    return normalizeStyleOptions({
      ...b,
      ...o,
      seriesColors: { ...(b.seriesColors || {}), ...(o.seriesColors || {}) },
    });
  }

  function getPaletteColors(paletteKey = "default") {
    return (PALETTES[paletteKey] || PALETTES.default).colors;
  }

  function getConcColor(conc, sortedAllConcs, paletteKey = "default", seriesColors = null) {
    if (seriesColors && seriesColors[String(conc)]) {
      return seriesColors[String(conc)];
    }
    const palette = getPaletteColors(paletteKey);
    const idx = sortedAllConcs ? sortedAllConcs.indexOf(Number(conc)) : 0;
    return palette[(idx >= 0 ? idx : 0) % palette.length];
  }

  function cloneSpec(spec) {
    if (!spec) return null;
    return JSON.parse(JSON.stringify(spec));
  }

  function applyStyleToSpec(spec, rawStyle = {}) {
    if (!spec || !Array.isArray(spec.traces)) return spec;
    const style = normalizeStyleOptions(rawStyle);
    const paletteColors = getPaletteColors(style.palette);
    const widthRatio = style.lineWidth / 2.2;
    const sizeRatio = style.pointSize / 7;
    const out = cloneSpec(spec);

    const dataScatterCount = out.traces.filter(
      (tr) => tr.type === "scatter" && tr.hoverinfo !== "skip" && !String(tr.name || "").startsWith("Est. ") && !String(tr.name || "").includes(" fit (")
    ).length;
    const isSingleCurve = dataScatterCount === 1 || out.key === "dose" || out.key === "vibrio_inhibition";
    const barTraces = out.traces.filter((tr) => tr.type === "bar");
    let barIdx = 0;
    let scatterIdx = 0;

    out.traces = out.traces.map((tr) => {
      const name = String(tr.name || "");
      if (tr.hoverinfo === "skip" && name === "Highlighted") return tr;

      const isFit = name.includes(" fit (") || name.startsWith("OLS Fit:");
      const isEst = name.startsWith("Est. ") || name.startsWith("Probit EC50");
      const concKey = tr.meta && tr.meta.conc !== undefined ? String(tr.meta.conc) : null;
      const customSeriesColor =
        (name && style.seriesColors[name]) ||
        (concKey && style.seriesColors[concKey]) ||
        null;

      if (tr.type === "bar") {
        const bColor =
          customSeriesColor ||
          (barTraces.length === 1 && style.primaryColor ? style.primaryColor : null) ||
          (style.palette !== "default" ? paletteColors[barIdx % paletteColors.length] : null);
        if (bColor) {
          tr.marker = { ...(tr.marker || {}), color: bColor };
        }
        barIdx++;
        return tr;
      }

      if (tr.type !== "scatter") return tr;

      let resolvedColor = customSeriesColor;
      if (!resolvedColor && !isEst && !isFit) {
        if (isSingleCurve && style.primaryColor) {
          resolvedColor = style.primaryColor;
        } else if (style.palette !== "default") {
          resolvedColor = paletteColors[scatterIdx % paletteColors.length];
        }
      }
      if (!isEst && !isFit) scatterIdx++;

      if (resolvedColor) {
        tr.line = { ...(tr.line || {}), color: resolvedColor };
        if (tr.marker && !Array.isArray(tr.marker.color)) {
          tr.marker = { ...tr.marker, color: resolvedColor };
        } else if (tr.marker && Array.isArray(tr.marker.color) && (isSingleCurve || customSeriesColor || style.palette !== "default")) {
          tr.marker = { ...tr.marker, color: tr.marker.color.map(() => resolvedColor) };
        }
      }

      if (!isEst) {
        const hasLines = String(tr.mode || "").includes("lines");
        if (hasLines) {
          if (style.lineStyle === "none" && !isFit) {
            tr.mode = "markers";
          } else {
            const baseW = Number(tr.line?.width) || 2.2;
            const dashVal = isFit && style.lineStyle === "solid" ? tr.line?.dash || "dot" : style.lineStyle === "none" ? "dot" : style.lineStyle;
            tr.line = {
              ...(tr.line || {}),
              dash: dashVal,
              width: Math.max(0.5, Number((baseW * widthRatio).toFixed(2))),
            };
          }
        }
      }

      if (!isFit && !isEst && tr.marker) {
        if (style.pointStyle === "none") {
          if (String(tr.mode || "").includes("lines")) {
            tr.mode = "lines";
          }
        } else {
          if (String(tr.mode || "") === "lines" && style.lineStyle !== "none" && style.pointStyle !== "auto") {
            tr.mode = "lines+markers";
          }
          if (style.pointStyle !== "auto") {
            tr.marker = {
              ...tr.marker,
              symbol: Array.isArray(tr.marker.symbol) ? tr.marker.symbol.map(() => style.pointStyle) : style.pointStyle,
            };
          }
          if (Math.abs(sizeRatio - 1) > 0.01) {
            if (Array.isArray(tr.marker.size)) {
              tr.marker = { ...tr.marker, size: tr.marker.size.map((sz) => Math.max(2, Number((sz * sizeRatio).toFixed(1)))) };
            } else {
              const baseSz = Number(tr.marker.size) || 7;
              tr.marker = { ...tr.marker, size: Math.max(2, Number((baseSz * sizeRatio).toFixed(1))) };
            }
          }
        }
      }

      return tr;
    });

    return out;
  }

  function renderChartInto(containerId, spec, filePrefix, style = {}) {
    const el = preparePlotEl(containerId);
    if (!el || !spec) return null;
    const rawSpec = cloneSpec(spec);
    const styledSpec = applyStyleToSpec(rawSpec, style);
    renderedSpecs.set(containerId, {
      containerId,
      rawSpec,
      spec: styledSpec,
      filePrefix,
      style: normalizeStyleOptions(style),
    });
    if (global.Plotly) {
      global.Plotly.react(el, styledSpec.traces, styledSpec.layout, plotConfig(filePrefix));
    }
    return styledSpec;
  }

  function getRenderedSpec(containerId) {
    return renderedSpecs.get(containerId) || null;
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
      style: normalizeStyleOptions(opts.style),
      perChartStyles: opts.perChartStyles && typeof opts.perChartStyles === "object" ? opts.perChartStyles : {},
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
    const stOpts = view.style || DEFAULT_CHART_STYLE;
    const color = getConcColor(conc, allConcs, stOpts.palette, stOpts.seriesColors);
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
      const colors = rows.map((r) => getConcColor(r.concentration, allConcs, view.style.palette, view.style.seriesColors));
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
          meta: { conc: Number(conc) },
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
        meta: { conc: Number(conc) },
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
          meta: { conc: Number(conc) },
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
        if (view.highlighted.has(Number(r.concentration))) return getConcColor(r.concentration, allConcs, view.style.palette, view.style.seriesColors);
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
            color: hlPoints.map((r) => getConcColor(r.concentration, allConcs, view.style.palette, view.style.seriesColors)),
            line: { width: 2.6, color: hlPoints.map((r) => getConcColor(r.concentration, allConcs, view.style.palette, view.style.seriesColors)) },
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
    const view = normalizeViewOptions(config.viewOptions);
    const styleFor = (cid) => mergeStyleOptions(view.style, view.perChartStyles[cid]);

    if (specs.growth) {
      const suffix = timepointsCount === 1 ? "snapshot" : "growth";
      renderChartInto(ids.growth, specs.growth, `${filePrefix}_${suffix}`, styleFor(ids.growth));
    }

    if (timepointsCount < 2) {
      renderedSpecs.delete(ids.semilog);
      renderedSpecs.delete(ids.mu);
      renderedSpecs.delete(ids.dose);
      showEmpty(ids.semilog, "Waiting for 2nd timepoint", "Add another timestamp to inspect exponential phase linearity ln(Y) vs. time.");
      showEmpty(ids.mu, "Waiting for 2nd timepoint", "At least 2 timepoints are needed to compute interval μ (h⁻¹).");
      showEmpty(ids.dose, "Waiting for 2nd timepoint", "Dose-response inhibition (%) requires growth rate μ across ≥ 2 timepoints.");
      return;
    }

    if (specs.semilog) {
      renderChartInto(ids.semilog, specs.semilog, `${filePrefix}_semilog`, styleFor(ids.semilog));
    }

    if (specs.mu) {
      renderChartInto(ids.mu, specs.mu, `${filePrefix}_interval_mu`, styleFor(ids.mu));
    }

    if (!specs.dose) {
      renderedSpecs.delete(ids.dose);
      showEmpty(ids.dose, "Control μ unavailable", "Ensure the selected Control concentration has ≥ 2 timepoints and μ ≠ 0.");
    } else {
      renderChartInto(ids.dose, specs.dose, `${filePrefix}_dose_response`, styleFor(ids.dose));
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
            color: visibleRows.map((r) => getConcColor(r.dilution, allConcs, view.style.palette, view.style.seriesColors)),
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
        if (view.highlighted.has(Number(r.dilution))) return getConcColor(r.dilution, allConcs, view.style.palette, view.style.seriesColors);
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
            color: hlPoints.map((r) => getConcColor(r.dilution, allConcs, view.style.palette, view.style.seriesColors)),
            line: { width: 2.6, color: hlPoints.map((r) => getConcColor(r.dilution, allConcs, view.style.palette, view.style.seriesColors)) },
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
    const view = normalizeViewOptions(viewOptions);
    const styleFor = (cid) => mergeStyleOptions(view.style, view.perChartStyles[cid]);

    if (specs.fronds) {
      renderChartInto("lemna-chart-fronds", specs.fronds, "lemna_fronds", styleFor("lemna-chart-fronds"));
    }
    if (specs.mu) {
      renderChartInto("lemna-chart-mu", specs.mu, "lemna_mu", styleFor("lemna-chart-mu"));
    }
    if (!specs.dose) {
      renderedSpecs.delete("lemna-chart-dose");
      showEmpty("lemna-chart-dose", "Control sample missing", "Add a control sample (matching Control Concentration) to compute Hemmung (%).");
    } else {
      renderChartInto("lemna-chart-dose", specs.dose, "lemna_dose_response", styleFor("lemna-chart-dose"));
    }
  }

  /**
   * Builds Plotly spec for the Dilution Series stacked bar chart.
   */
  function buildDilutionSpec(dilutions, concUnit, forceLight = false, viewOptions = {}) {
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
  function renderDilutionChart(dilutions, concUnit, viewOptions = {}) {
    if (!dilutions || dilutions.length === 0) {
      renderedSpecs.delete("dilution-chart-bars");
      showEmpty("dilution-chart-bars", "No dilution steps yet", "Add rows or generate a dilution series on the left.");
      return;
    }

    const spec = buildDilutionSpec(dilutions, concUnit, false, viewOptions);
    const view = normalizeViewOptions(viewOptions);
    const style = mergeStyleOptions(view.style, view.perChartStyles["dilution-chart-bars"]);
    if (spec) {
      renderChartInto("dilution-chart-bars", spec, "dilution_series", style);
    }
  }

  /**
   * Builds Plotly specs for Daphnia magna Acute Immobilization & Probit Analysis.
   */
  function buildDaphniaSpecs(analysis, concUnit, forceLight = false, viewOptions = {}) {
    const t = getThemeTokens(forceLight);
    const { rows, timepoint, targetPct, probit, primaryEC } = analysis;
    if (!rows || rows.length === 0) return {};

    const styleNorm = normalizeStyleOptions(viewOptions.style);
    const view = {
      highlightConcs: Array.isArray(viewOptions.highlightConcs) ? viewOptions.highlightConcs.map(Number) : [],
      isolate: Boolean(viewOptions.isolate),
      logX: Boolean(viewOptions.logX),
      style: styleNorm,
    };
    const hasHighlight = view.highlightConcs.length > 0;
    const isSelected = (c) => view.highlightConcs.includes(Number(c));
    const sortedConcs = rows.map((r) => r.concentration);

    const visibleRows = view.isolate && hasHighlight ? rows.filter((r) => isSelected(r.concentration)) : rows;
    const specs = {};

    // 1. Dose-Response: Immobilization (%) vs. Concentration (24h & 48h)
    const doseRows = view.logX ? visibleRows.filter((r) => r.concentration > 0) : visibleRows;
    const pts24 = doseRows.filter((r) => r.corr24 !== null);
    const pts48 = doseRows.filter((r) => r.corr48 !== null);
    const doseTraces = [];

    if (pts24.length > 0) {
      const isActive = timepoint === "24h";
      doseTraces.push({
        type: "scatter",
        mode: "lines+markers",
        name: isActive ? "24 h Immobilization (active)" : "24 h Immobilization",
        x: pts24.map((r) => r.concentration),
        y: pts24.map((r) => r.corr24),
        line: { color: t.blue, width: isActive ? 3 : 1.8, dash: isActive ? "solid" : "dot" },
        marker: {
          size: pts24.map((r) => (hasHighlight && isSelected(r.concentration) ? 12 : isActive ? 8 : 6)),
          color: pts24.map((r) => (hasHighlight && !isSelected(r.concentration) ? t.muted : t.blue)),
        },
        opacity: isActive ? 1 : 0.65,
        hovertemplate: `<b>%{x} ${concUnit} (24 h)</b><br>Immobilized: %{y:.1f}%<extra></extra>`,
      });
    }

    if (pts48.length > 0) {
      const isActive = timepoint === "48h";
      doseTraces.push({
        type: "scatter",
        mode: "lines+markers",
        name: isActive ? "48 h Immobilization (active)" : "48 h Immobilization",
        x: pts48.map((r) => r.concentration),
        y: pts48.map((r) => r.corr48),
        line: { color: t.crimson, width: isActive ? 3 : 1.8, dash: isActive ? "solid" : "dot" },
        marker: {
          size: pts48.map((r) => (hasHighlight && isSelected(r.concentration) ? 12 : isActive ? 8.5 : 6)),
          color: pts48.map((r) => (hasHighlight && !isSelected(r.concentration) ? t.muted : t.crimson)),
        },
        opacity: isActive ? 1 : 0.65,
        hovertemplate: `<b>%{x} ${concUnit} (48 h)</b><br>Immobilized: %{y:.1f}%<extra></extra>`,
      });
    }

    const doseShapes = [
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        y0: targetPct,
        y1: targetPct,
        line: { color: t.threshold, width: 1.5, dash: "dash" },
      },
      {
        type: "line",
        xref: "paper",
        x0: 0,
        x1: 1,
        y0: 10,
        y1: 10,
        line: { color: t.teal, width: 1, dash: "dot" },
      },
    ];
    const doseAnnotations = [
      {
        xref: "paper",
        x: 0.99,
        y: targetPct,
        text: `EC${targetPct} (${targetPct}%)`,
        showarrow: false,
        xanchor: "right",
        yanchor: "bottom",
        font: { size: 10.5, color: t.muted },
      },
      {
        xref: "paper",
        x: 0.99,
        y: 10,
        text: "10% GD / Control Limit",
        showarrow: false,
        xanchor: "right",
        yanchor: "bottom",
        font: { size: 9.5, color: t.teal },
      },
    ];

    if (primaryEC && Number.isFinite(primaryEC.value) && (!view.logX || primaryEC.value > 0)) {
      doseTraces.push({
        type: "scatter",
        mode: "markers",
        name: `Est. EC${targetPct} (${primaryEC.method})`,
        x: [primaryEC.value],
        y: [targetPct],
        marker: { size: 11, symbol: "x", color: t.amber, line: { width: 2.5, color: t.amber } },
        hovertemplate: `<b>Est. EC${targetPct} (${primaryEC.method})</b><br>${primaryEC.value.toFixed(4)} ${concUnit}<extra></extra>`,
      });
    }

    specs.dose = {
      key: "daphnia_dose",
      title: `Daphnia Dose-Response: Immobilization % (${timepoint} active)`,
      traces: doseTraces,
      layout: baseLayout(
        `Daphnia Dose-Response: Immobilization % (${timepoint} active)`,
        view.logX ? `Concentration (${concUnit}, log₁₀ scale, c > 0)` : `Concentration (${concUnit})`,
        "Immobilization (%)",
        {
          shapes: doseShapes,
          annotations: doseAnnotations,
          xaxis: view.logX ? { type: "log" } : {},
          yaxis: { range: [-4, 108] },
        },
        forceLight
      ),
    };

    // 2. Probit Linear Regression: Y = a + b * ln(C)
    const probitPts = visibleRows.filter((r) => !r.isControl && r.lnConc !== null && r.probit !== null);
    if (probitPts.length > 0) {
      const pTraces = [
        {
          type: "scatter",
          mode: "markers",
          name: `Observed Probit (${timepoint})`,
          x: probitPts.map((r) => r.lnConc),
          y: probitPts.map((r) => r.probit),
          customdata: probitPts.map((r) => [r.concentration, r.activePct]),
          marker: {
            size: probitPts.map((r) => (hasHighlight && isSelected(r.concentration) ? 13 : 9)),
            color: probitPts.map((r) => (hasHighlight && !isSelected(r.concentration) ? t.muted : getConcColor(r.concentration, sortedConcs, styleNorm.palette, styleNorm.seriesColors))),
            line: { width: 1.5, color: t.plotBg },
          },
          hovertemplate: `<b>%{customdata[0]} ${concUnit}</b><br>ln(C) = %{x:.3f}<br>Probit Y = %{y:.3f} (%{customdata[1]:.1f}%)<extra></extra>`,
        },
      ];

      const pShapes = [
        {
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          y0: 5,
          y1: 5,
          line: { color: t.threshold, width: 1.5, dash: "dash" },
        },
      ];
      const pAnn = [
        {
          xref: "paper",
          x: 0.99,
          y: 5,
          text: "Probit = 5.0 (LC₅₀ / EC₅₀)",
          showarrow: false,
          xanchor: "right",
          yanchor: "bottom",
          font: { size: 10, color: t.muted },
        },
      ];

      if (probit) {
        pTraces.push({
          type: "scatter",
          mode: "lines",
          name: `OLS Fit: Y = ${probit.intercept.toFixed(2)} + ${probit.slope.toFixed(2)}·ln(C)`,
          x: probit.lineX,
          y: probit.lineY,
          line: { color: t.crimson, width: 2.5 },
          hoverinfo: "skip",
        });

        if (probit.ec50 && probit.ec50 > 0) {
          const lnEc50 = Math.log(probit.ec50);
          pTraces.push({
            type: "scatter",
            mode: "markers",
            name: `Probit EC50 = ${probit.ec50.toFixed(4)} ${concUnit}`,
            x: [lnEc50],
            y: [5],
            marker: { size: 11, symbol: "x", color: t.amber, line: { width: 2.5, color: t.amber } },
            hovertemplate: `<b>Probit EC50</b><br>${probit.ec50.toFixed(4)} ${concUnit}<br>ln(EC50) = ${lnEc50.toFixed(3)}<extra></extra>`,
          });
          pShapes.push({
            type: "line",
            x0: lnEc50,
            x1: lnEc50,
            yref: "paper",
            y0: 0,
            y1: 1,
            line: { color: t.amber, width: 1.3, dash: "dot" },
          });
        }

        pAnn.push({
          xref: "paper",
          yref: "paper",
          x: 0.02,
          y: 0.96,
          text: `Y = ${probit.intercept.toFixed(3)} + ${probit.slope.toFixed(3)}·ln(C) | R² = ${probit.r2 !== null ? probit.r2.toFixed(4) : "—"}`,
          showarrow: false,
          xanchor: "left",
          yanchor: "top",
          font: { size: 10.5, color: t.text },
          bgcolor: t.plotBg,
          bordercolor: t.grid,
          borderwidth: 1,
          borderpad: 4,
        });
      }

      specs.probit = {
        key: "daphnia_probit",
        title: `Probit Regression (Finney Transformation — ${timepoint})`,
        traces: pTraces,
        layout: baseLayout(
          `Probit Regression (Finney Transformation — ${timepoint})`,
          `ln(Concentration [${concUnit}])`,
          "Probit Value (Y)",
          { shapes: pShapes, annotations: pAnn },
          forceLight
        ),
      };
    }

    // 3. Stacked Mobile vs Immobilized Counts
    const labels = visibleRows.map((r) => `${r.concentration} ${concUnit}${r.isControl ? " ★" : ""}`);
    const mobileCounts = visibleRows.map((r) => (timepoint === "24h" ? r.mobile24 : r.mobile48) ?? 0);
    const immobCounts = visibleRows.map((r) => (timepoint === "24h" ? r.immob24 : r.immob48) ?? 0);
    const barOpacities = visibleRows.map((r) => (!hasHighlight || isSelected(r.concentration) ? 0.88 : 0.25));
    const mobLayout = baseLayout(`Animal Counts: Mobile vs. Immobilized (${timepoint})`, `Concentration (${concUnit})`, "Daphnia Count (n)", {}, forceLight);
    mobLayout.barmode = "stack";

    specs.mobility = {
      key: "daphnia_mobility",
      title: mobLayout.title.text,
      traces: [
        {
          type: "bar",
          name: "Mobile (Swimming)",
          x: labels,
          y: mobileCounts,
          marker: { color: t.teal, opacity: barOpacities },
          hovertemplate: "<b>%{x}</b><br>Mobile: %{y}<extra></extra>",
        },
        {
          type: "bar",
          name: "Immobilized",
          x: labels,
          y: immobCounts,
          marker: { color: t.crimson, opacity: barOpacities },
          hovertemplate: "<b>%{x}</b><br>Immobilized: %{y}<extra></extra>",
        },
      ],
      layout: mobLayout,
    };

    return specs;
  }

  function renderDaphniaCharts(analysis, concUnit, viewOptions = {}) {
    const { rows } = analysis;
    if (!rows || rows.length === 0) {
      showEmpty("daphnia-chart-dose", "No Daphnia observations yet", "Enter animal counts (24 h / 48 h) on the left to plot immobilization dose-response.");
      showEmpty("daphnia-chart-probit", "Probit regression needs partial responses", "Add at least two test concentrations with 0% < immobilization < 100% (or check Geometric Mean EC50).");
      showEmpty("daphnia-chart-mobility", "No Daphnia counts yet", "Stacked mobile vs. immobilized bar chart will appear here.");
      return;
    }

    const specs = buildDaphniaSpecs(analysis, concUnit, false, viewOptions);
    const view = normalizeViewOptions(viewOptions);
    const styleFor = (cid) => mergeStyleOptions(view.style, view.perChartStyles[cid]);

    if (specs.dose) {
      renderChartInto("daphnia-chart-dose", specs.dose, "daphnia_dose_response", styleFor("daphnia-chart-dose"));
    }

    if (!specs.probit) {
      renderedSpecs.delete("daphnia-chart-probit");
      showEmpty("daphnia-chart-probit", "No intermediate mortality (0% < p < 100%)", "Probit transformation requires partial responses between 0% and 100%. Use Geometric Mean √(a·b) when responses jump from 0% to 100%.");
    } else {
      renderChartInto("daphnia-chart-probit", specs.probit, "daphnia_probit", styleFor("daphnia-chart-probit"));
    }

    if (specs.mobility) {
      renderChartInto("daphnia-chart-mobility", specs.mobility, "daphnia_mobility", styleFor("daphnia-chart-mobility"));
    }
  }

  /**
   * Builds Plotly specs for Vibrio fischeri Bioluminescence Inhibition Assay (ISO 11348-2).
   */
  function buildVibrioSpecs(analysis, concUnit, forceLight = false, viewOptions = {}) {
    const t = getThemeTokens(forceLight);
    const { rows, ec20, ec50, targetPct, ecTarget } = analysis;
    if (!rows || rows.length === 0) return {};

    const view = {
      highlightConcs: Array.isArray(viewOptions.highlightConcs) ? viewOptions.highlightConcs.map(Number) : [],
      isolate: Boolean(viewOptions.isolate),
      logX: Boolean(viewOptions.logX),
      showErrorBars: viewOptions.showErrorBars !== false,
    };
    const hasHighlight = view.highlightConcs.length > 0;
    const isSelected = (c) => view.highlightConcs.includes(Number(c));
    const visibleRows = view.isolate && hasHighlight ? rows.filter((r) => isSelected(r.concentration)) : rows;
    const specs = {};

    // 1. Bioluminescence Inhibition (%) vs. Concentration
    const inhRows = (view.logX ? visibleRows.filter((r) => r.concentration > 0) : visibleRows).filter((r) => r.inhibition !== null);
    if (inhRows.length > 0) {
      const traces = [
        {
          type: "scatter",
          mode: "lines+markers",
          name: "Luminescence Inhibition (%)",
          x: inhRows.map((r) => r.concentration),
          y: inhRows.map((r) => r.inhibition),
          error_y: view.showErrorBars
            ? {
                type: "data",
                array: inhRows.map((r) => r.sdInhibition || 0),
                visible: true,
                thickness: 1.5,
                width: 4,
              }
            : { visible: false },
          line: { color: t.crimson, width: 2.8 },
          marker: {
            size: inhRows.map((r) => (hasHighlight && isSelected(r.concentration) ? 13 : 8.5)),
            color: inhRows.map((r) => {
              if (hasHighlight && !isSelected(r.concentration)) return t.muted;
              return r.toxic ? t.crimson : t.teal;
            }),
            line: { width: 1.5, color: t.plotBg },
          },
          hovertemplate: `<b>%{x} ${concUnit}</b><br>Inhibition: %{y:.2f}%<extra></extra>`,
        },
      ];

      const shapes = [
        {
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          y0: 20,
          y1: 20,
          line: { color: t.amber, width: 1.5, dash: "dash" },
        },
        {
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          y0: 50,
          y1: 50,
          line: { color: t.crimson, width: 1.5, dash: "dash" },
        },
      ];
      const annotations = [
        {
          xref: "paper",
          x: 0.99,
          y: 20,
          text: "20% Toxicity Threshold (EC20 / LID)",
          showarrow: false,
          xanchor: "right",
          yanchor: "bottom",
          font: { size: 10, color: t.amber },
        },
        {
          xref: "paper",
          x: 0.99,
          y: 50,
          text: "50% (EC50)",
          showarrow: false,
          xanchor: "right",
          yanchor: "bottom",
          font: { size: 10, color: t.crimson },
        },
      ];

      if (ecTarget && ecTarget.status === "interpolated" && (!view.logX || ecTarget.value > 0)) {
        traces.push({
          type: "scatter",
          mode: "markers",
          name: `Est. EC${targetPct}`,
          x: [ecTarget.value],
          y: [targetPct],
          marker: { size: 11, symbol: "x", color: t.amber, line: { width: 2.5, color: t.amber } },
          hovertemplate: `<b>Est. EC${targetPct}</b><br>${ecTarget.value.toFixed(4)} ${concUnit}<extra></extra>`,
        });
      }

      specs.inhibition = {
        key: "vibrio_inhibition",
        title: "Bioluminescence Inhibition (%) vs. Concentration",
        traces,
        layout: baseLayout(
          "Bioluminescence Inhibition (%) vs. Concentration",
          view.logX ? `Concentration (${concUnit}, log₁₀ scale, c > 0)` : `Concentration (${concUnit})`,
          "Luminescence Inhibition (%)",
          { shapes, annotations, xaxis: view.logX ? { type: "log" } : {} },
          forceLight
        ),
      };
    }

    // 2. Luminescence Intensity Comparison: I0, Corrected Expected Ict, Measured It
    const labels = visibleRows.map((r) => `${r.concentration} ${concUnit}${r.isControl ? " ★" : ""}`);
    const op = visibleRows.map((r) => (!hasHighlight || isSelected(r.concentration) ? 0.88 : 0.25));
    const lumLayout = baseLayout("Luminescence Intensity: I₀ vs. Expected Ict vs. Measured It", `Concentration (${concUnit})`, "Luminescence (RLU)", {}, forceLight);
    lumLayout.barmode = "group";

    specs.luminescence = {
      key: "vibrio_luminescence",
      title: lumLayout.title.text,
      traces: [
        {
          type: "bar",
          name: "Initial (I₀)",
          x: labels,
          y: visibleRows.map((r) => r.meanI0),
          marker: { color: t.blue, opacity: op },
          hovertemplate: "<b>%{x}</b><br>I₀: %{y:,.1f} RLU<extra></extra>",
        },
        {
          type: "bar",
          name: "Expected (Ict = I₀·fkt)",
          x: labels,
          y: visibleRows.map((r) => r.meanIct),
          marker: { color: t.amber, opacity: op },
          hovertemplate: "<b>%{x}</b><br>Ict: %{y:,.1f} RLU<extra></extra>",
        },
        {
          type: "bar",
          name: "Measured (It)",
          x: labels,
          y: visibleRows.map((r) => r.meanIt),
          marker: { color: t.teal, opacity: op },
          hovertemplate: "<b>%{x}</b><br>It: %{y:,.1f} RLU<extra></extra>",
        },
      ],
      layout: lumLayout,
    };

    return specs;
  }

  function renderVibrioCharts(analysis, concUnit, viewOptions = {}) {
    const { rows } = analysis;
    if (!rows || rows.length === 0) {
      showEmpty("vibrio-chart-inhibition", "No Vibrio luminescence data yet", "Enter I₀ and It readings (include 2% NaCl control) on the left to compute fkt and inhibition %.");
      showEmpty("vibrio-chart-luminescence", "No luminescence readings yet", "I₀ vs. corrected Ict vs. measured It bar comparison will appear here.");
      return;
    }

    const specs = buildVibrioSpecs(analysis, concUnit, false, viewOptions);
    const view = normalizeViewOptions(viewOptions);
    const styleFor = (cid) => mergeStyleOptions(view.style, view.perChartStyles[cid]);

    if (!specs.inhibition) {
      renderedSpecs.delete("vibrio-chart-inhibition");
      showEmpty("vibrio-chart-inhibition", "2% NaCl Control missing", "Add at least one Control row (2% NaCl) with I₀ and It so correction factor fkt can be computed.");
    } else {
      renderChartInto("vibrio-chart-inhibition", specs.inhibition, "vibrio_inhibition", styleFor("vibrio-chart-inhibition"));
    }

    if (specs.luminescence) {
      renderChartInto("vibrio-chart-luminescence", specs.luminescence, "vibrio_luminescence", styleFor("vibrio-chart-luminescence"));
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
    PALETTES,
    SERIES_COLORS,
    DEFAULT_CHART_STYLE,
    normalizeStyleOptions,
    mergeStyleOptions,
    getPaletteColors,
    getConcColor,
    applyStyleToSpec,
    getRenderedSpec,
    buildTimeSeriesSpecs,
    buildLemnaSpecs,
    buildDilutionSpec,
    buildDaphniaSpecs,
    buildVibrioSpecs,
    renderTimeSeriesSuite,
    renderLemnaCharts,
    renderDaphniaCharts,
    renderVibrioCharts,
    renderDilutionChart,
    renderSpecToImage,
  };
})(typeof window !== "undefined" ? window : globalThis);
