/**
 * Ecotoxicology Aid — Interactive Plotly Chart Renderer
 * Generates publication-ready interactive graphs for OD, Cell Count, Lemna minor, and Dilutions.
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});

  const SERIES_COLORS = [
    "#0d9488", // teal (often control)
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

  function getThemeTokens() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
      isDark,
      paperBg: "rgba(0,0,0,0)",
      plotBg: isDark ? "#0f172a" : "#ffffff",
      text: isDark ? "#e2e8f0" : "#1e293b",
      muted: isDark ? "#94a3b8" : "#64748b",
      grid: isDark ? "rgba(148, 163, 184, 0.14)" : "rgba(15, 23, 42, 0.08)",
      zeroLine: isDark ? "rgba(148, 163, 184, 0.3)" : "rgba(15, 23, 42, 0.22)",
      threshold: isDark ? "#94a3b8" : "#64748b",
      crimson: isDark ? "#fb7185" : "#e11d48",
      teal: isDark ? "#2dd4bf" : "#0d9488",
      blue: isDark ? "#60a5fa" : "#2563eb",
      amber: isDark ? "#fbbf24" : "#d97706",
    };
  }

  function baseLayout(title, xTitle, yTitle, extra = {}) {
    const t = getThemeTokens();
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
      margin: { l: 58, r: 22, t: 44, b: 48 },
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

  /**
   * Renders the 4-plot time-series kinetics suite (shared by OD and Cell Count tabs).
   */
  function renderTimeSeriesSuite(config) {
    const {
      ids, // { growth, semilog, mu, dose }
      analysis,
      concUnit,
      yAxisLabel,
      growthTitle,
      semiLogYLabel,
      filePrefix,
      singleTimepointBarTitle,
    } = config;

    const t = getThemeTokens();
    const { kinetics, summary, timepointsCount, ic50 } = analysis;

    if (!kinetics || kinetics.length === 0) {
      showEmpty(ids.growth, "No measurements yet", "Add measurements on the left to generate growth curves.");
      showEmpty(ids.semilog, "No measurements yet", "Semi-log exponential check will appear here.");
      showEmpty(ids.mu, "No measurements yet", "Stepwise specific growth rate (μ) will appear here.");
      showEmpty(ids.dose, "No measurements yet", "Dose-response inhibition curve will appear here.");
      return;
    }

    const grouped = groupByConcentration(kinetics);

    // 1. Growth Curves (or Bar Chart if only 1 timepoint)
    const growthEl = preparePlotEl(ids.growth);
    if (growthEl) {
      if (timepointsCount === 1) {
        const xs = kinetics.map((r) => `${r.concentration} ${concUnit}`);
        const ys = kinetics.map((r) => r.meanVal);
        const errs = kinetics.map((r) => r.stdVal);
        const trace = {
          type: "bar",
          x: xs,
          y: ys,
          error_y: { type: "data", array: errs, visible: true, color: t.muted, thickness: 1.5 },
          marker: { color: SERIES_COLORS.slice(0, xs.length), opacity: 0.9 },
          hovertemplate: `<b>%{x}</b><br>${yAxisLabel}: %{y:.4g} ± %{error_y.array:.3g}<extra></extra>`,
        };
        const layout = baseLayout(
          singleTimepointBarTitle || `${growthTitle} (Single Timepoint)`,
          `Concentration (${concUnit})`,
          yAxisLabel,
          { showlegend: false }
        );
        layout.showlegend = false;
        global.Plotly.react(growthEl, [trace], layout, plotConfig(`${filePrefix}_snapshot`));
      } else {
        const traces = grouped.map(([conc, grp], idx) => ({
          type: "scatter",
          mode: "lines+markers",
          name: `${conc} ${concUnit}`,
          x: grp.map((r) => r.elapsedHours),
          y: grp.map((r) => r.meanVal),
          error_y: {
            type: "data",
            array: grp.map((r) => r.stdVal),
            visible: true,
            thickness: 1.4,
            width: 4,
          },
          line: { color: SERIES_COLORS[idx % SERIES_COLORS.length], width: 2.2 },
          marker: { size: 7, symbol: "circle" },
          hovertemplate: `<b>${conc} ${concUnit}</b><br>t = %{x:.2f} h<br>Mean: %{y:.4g} ± %{error_y.array:.3g}<extra></extra>`,
        }));
        const layout = baseLayout(growthTitle, "Elapsed Time (h)", yAxisLabel);
        global.Plotly.react(growthEl, traces, layout, plotConfig(`${filePrefix}_growth`));
      }
    }

    if (timepointsCount < 2) {
      showEmpty(ids.semilog, "Waiting for 2nd timepoint", "Add another timestamp to inspect exponential phase linearity ln(Y) vs. time.");
      showEmpty(ids.mu, "Waiting for 2nd timepoint", "At least 2 timepoints are needed to compute interval μ (h⁻¹).");
      showEmpty(ids.dose, "Waiting for 2nd timepoint", "Dose-response inhibition (%) requires growth rate μ across ≥ 2 timepoints.");
      return;
    }

    // 2. Semi-Log Growth Curve: ln(Mean) vs Time
    const semiEl = preparePlotEl(ids.semilog);
    if (semiEl) {
      const traces = grouped.map(([conc, grp], idx) => {
        const valid = grp.filter((r) => r.lnMeanVal !== null);
        return {
          type: "scatter",
          mode: "lines+markers",
          name: `${conc} ${concUnit}`,
          x: valid.map((r) => r.elapsedHours),
          y: valid.map((r) => r.lnMeanVal),
          line: { color: SERIES_COLORS[idx % SERIES_COLORS.length], width: 2.2 },
          marker: { size: 7, symbol: "square" },
          hovertemplate: `<b>${conc} ${concUnit}</b><br>t = %{x:.2f} h<br>${semiLogYLabel}: %{y:.4f}<extra></extra>`,
        };
      });
      const layout = baseLayout("Semi-Log Growth Curve (Exponential Phase Check)", "Elapsed Time (h)", semiLogYLabel);
      global.Plotly.react(semiEl, traces, layout, plotConfig(`${filePrefix}_semilog`));
    }

    // 3. Stepwise Specific Growth Rate (mu) Over Time
    const muEl = preparePlotEl(ids.mu);
    if (muEl) {
      const traces = grouped.map(([conc, grp], idx) => {
        const valid = grp.filter((r) => r.intervalMu !== null);
        return {
          type: "scatter",
          mode: "lines+markers",
          name: `${conc} ${concUnit}`,
          x: valid.map((r) => r.elapsedHours),
          y: valid.map((r) => r.intervalMu),
          line: { color: SERIES_COLORS[idx % SERIES_COLORS.length], width: 2.2 },
          marker: { size: 8, symbol: "triangle-up" },
          hovertemplate: `<b>${conc} ${concUnit}</b><br>t = %{x:.2f} h<br>μ = %{y:.5f} h⁻¹<extra></extra>`,
        };
      });
      const layout = baseLayout("Stepwise Specific Growth Rate (μ) Over Time", "Elapsed Time (h)", "μ (h⁻¹)");
      global.Plotly.react(muEl, traces, layout, plotConfig(`${filePrefix}_interval_mu`));
    }

    // 4. Dose-Response Curve: Overall Inhibition (%) vs Concentration
    const doseValid = summary.filter((r) => r.inhibition !== null);
    if (doseValid.length === 0) {
      showEmpty(ids.dose, "Control μ unavailable", "Ensure the selected Control concentration has ≥ 2 timepoints and μ ≠ 0.");
    } else {
      const doseEl = preparePlotEl(ids.dose);
      if (doseEl) {
        const traces = [
          {
            type: "scatter",
            mode: "lines+markers",
            name: "Inhibition (%)",
            x: doseValid.map((r) => r.concentration),
            y: doseValid.map((r) => r.inhibition),
            line: { color: t.crimson, width: 2.5 },
            marker: { size: 9, symbol: "diamond", color: t.crimson },
            hovertemplate: `<b>%{x} ${concUnit}</b><br>Inhibition: %{y:.2f}%<extra></extra>`,
          },
        ];

        const shapes = [
          {
            type: "line",
            xref: "paper",
            x0: 0,
            x1: 1,
            y0: 50,
            y1: 50,
            line: { color: t.threshold, width: 1.5, dash: "dash" },
          },
        ];

        const annotations = [
          {
            xref: "paper",
            x: 0.99,
            y: 50,
            xanchor: "right",
            yanchor: "bottom",
            text: "IC50 (50%)",
            showarrow: false,
            font: { size: 10.5, color: t.muted },
          },
        ];

        if (ic50 && ic50.status === "interpolated" && Number.isFinite(ic50.value)) {
          traces.push({
            type: "scatter",
            mode: "markers",
            name: `Est. IC50 ≈ ${ic50.value.toFixed(3)} ${concUnit}`,
            x: [ic50.value],
            y: [50],
            marker: { size: 11, symbol: "x", color: t.amber, line: { width: 2.5, color: t.amber } },
            hovertemplate: `<b>Est. IC50 (linear)</b><br>${ic50.value.toFixed(4)} ${concUnit}<extra></extra>`,
          });
        }

        const layout = baseLayout(
          "Dose-Response: Growth Inhibition vs. Concentration",
          `Concentration (${concUnit})`,
          "Inhibition (%)",
          { shapes, annotations }
        );
        global.Plotly.react(doseEl, traces, layout, plotConfig(`${filePrefix}_dose_response`));
      }
    }
  }

  /**
   * Renders the 3-plot suite for Lemna minor frond assay.
   */
  function renderLemnaCharts(analysis, concUnit) {
    const t = getThemeTokens();
    const { rows, ic50 } = analysis;

    if (!rows || rows.length === 0) {
      showEmpty("lemna-chart-fronds", "No Lemna samples yet", "Add frond counts on the left to visualize Day 0 vs. Final Day growth.");
      showEmpty("lemna-chart-mu", "No Lemna samples yet", "Specific growth rate (μ) comparison will appear here.");
      showEmpty("lemna-chart-dose", "No Lemna samples yet", "Dose-response inhibition (%) curve will appear here.");
      return;
    }

    const labels = rows.map((r) => `${r.dilution} ${concUnit}`);

    // 1. Frond counts Day 0 vs Final Day
    const frondsEl = preparePlotEl("lemna-chart-fronds");
    if (frondsEl) {
      const trace0 = {
        type: "bar",
        name: "Initial (N₀)",
        x: labels,
        y: rows.map((r) => r.avgN0),
        error_y: { type: "data", array: rows.map((r) => r.sdN0), visible: true, thickness: 1.4 },
        marker: { color: t.blue, opacity: 0.78 },
        hovertemplate: "<b>%{x}</b><br>Avg N₀: %{y:.2f} ± %{error_y.array:.2f}<extra></extra>",
      };
      const traceT = {
        type: "bar",
        name: "Final (Nₜ)",
        x: labels,
        y: rows.map((r) => r.avgNt),
        error_y: { type: "data", array: rows.map((r) => r.sdNt), visible: true, thickness: 1.4 },
        marker: { color: t.teal, opacity: 0.92 },
        hovertemplate: "<b>%{x}</b><br>Avg Nₜ: %{y:.2f} ± %{error_y.array:.2f}<extra></extra>",
      };
      const layout = baseLayout("Lemna Frond Count (Mean ± SD)", `Concentration (${concUnit})`, "Fronds (count)");
      layout.barmode = "group";
      global.Plotly.react(frondsEl, [trace0, traceT], layout, plotConfig("lemna_fronds"));
    }

    // 2. Growth rate mu by concentration
    const muEl = preparePlotEl("lemna-chart-mu");
    if (muEl) {
      const trace = {
        type: "bar",
        name: "μ (h⁻¹)",
        x: labels,
        y: rows.map((r) => r.mu),
        marker: {
          color: rows.map((r) => (r.isControl ? t.teal : t.blue)),
          opacity: 0.88,
        },
        hovertemplate: "<b>%{x}</b><br>μ = %{y:.5f} h⁻¹<extra></extra>",
      };
      const layout = baseLayout("Specific Growth Rate (μ) by Concentration", `Concentration (${concUnit})`, "μ (h⁻¹)");
      layout.showlegend = false;
      global.Plotly.react(muEl, [trace], layout, plotConfig("lemna_mu"));
    }

    // 3. Dose-Response Inhibition
    const validInh = rows.filter((r) => r.inhibition !== null);
    if (validInh.length === 0) {
      showEmpty("lemna-chart-dose", "Control sample missing", "Add a control sample (matching Control Concentration) to compute Hemmung (%).");
    } else {
      const doseEl = preparePlotEl("lemna-chart-dose");
      if (doseEl) {
        const traces = [
          {
            type: "scatter",
            mode: "lines+markers",
            name: "Hemmung (%)",
            x: validInh.map((r) => r.dilution),
            y: validInh.map((r) => r.inhibition),
            line: { color: t.crimson, width: 2.5 },
            marker: { size: 9, symbol: "diamond", color: t.crimson },
            hovertemplate: `<b>%{x} ${concUnit}</b><br>Hemmung: %{y:.2f}%<extra></extra>`,
          },
        ];

        const shapes = [
          {
            type: "line",
            xref: "paper",
            x0: 0,
            x1: 1,
            y0: 50,
            y1: 50,
            line: { color: t.threshold, width: 1.5, dash: "dash" },
          },
        ];

        const annotations = [
          {
            xref: "paper",
            x: 0.99,
            y: 50,
            xanchor: "right",
            yanchor: "bottom",
            text: "IC50 (50%)",
            showarrow: false,
            font: { size: 10.5, color: t.muted },
          },
        ];

        if (ic50 && ic50.status === "interpolated" && Number.isFinite(ic50.value)) {
          traces.push({
            type: "scatter",
            mode: "markers",
            name: `Est. IC50 ≈ ${ic50.value.toFixed(3)} ${concUnit}`,
            x: [ic50.value],
            y: [50],
            marker: { size: 11, symbol: "x", color: t.amber, line: { width: 2.5, color: t.amber } },
            hovertemplate: `<b>Est. IC50 (linear)</b><br>${ic50.value.toFixed(4)} ${concUnit}<extra></extra>`,
          });
        }

        const layout = baseLayout(
          "Dose-Response: Hemmung (%) vs. Concentration",
          `Concentration (${concUnit})`,
          "Hemmung (%)",
          { shapes, annotations }
        );
        global.Plotly.react(doseEl, traces, layout, plotConfig("lemna_dose_response"));
      }
    }
  }

  /**
   * Renders stacked volume bar chart for the Dilution Series helper tab.
   */
  function renderDilutionChart(dilutions, concUnit) {
    const t = getThemeTokens();
    if (!dilutions || dilutions.length === 0) {
      showEmpty("dilution-chart-bars", "No dilution steps yet", "Add rows or generate a dilution series on the left.");
      return;
    }

    const sorted = [...dilutions].sort((a, b) => Number(a.concentration) - Number(b.concentration));
    const el = preparePlotEl("dilution-chart-bars");
    if (!el) return;

    const labels = sorted.map((d) => `${d.concentration} ${concUnit}`);
    const mediumLabel = sorted[0]?.mediumName || "Medium";
    const toxicantLabel = sorted[0]?.toxicantName || "Toxicant";

    const traceMedium = {
      type: "bar",
      name: `${mediumLabel} (mL)`,
      x: labels,
      y: sorted.map((d) => Number(d.mediumMl) || 0),
      marker: { color: t.blue, opacity: 0.85 },
      hovertemplate: `<b>%{x}</b><br>${mediumLabel}: %{y:.4g} mL<extra></extra>`,
    };

    const traceTox = {
      type: "bar",
      name: `${toxicantLabel} (mL)`,
      x: labels,
      y: sorted.map((d) => Number(d.toxicantMl) || 0),
      marker: { color: t.crimson, opacity: 0.9 },
      hovertemplate: `<b>%{x}</b><br>${toxicantLabel}: %{y:.4g} mL<extra></extra>`,
    };

    const layout = baseLayout("Verdünnungsreihe: Pipetting Volumes", `Target Concentration (${concUnit})`, "Volume (mL)");
    layout.barmode = "stack";
    global.Plotly.react(el, [traceMedium, traceTox], layout, plotConfig("dilution_series"));
  }

  Ecotox.Charts = {
    renderTimeSeriesSuite,
    renderLemnaCharts,
    renderDilutionChart,
  };
})(typeof window !== "undefined" ? window : globalThis);
