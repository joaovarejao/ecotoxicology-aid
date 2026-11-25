/**
 * Ecotoxicology Aid — Matplotlib-Style Preview & Python Script Generator
 * Builds Matplotlib-formatted publication figures (classic boxed spines, ticks inside,
 * custom color/line/width/point styling, DPI sizing) and exports PNG, SVG, and .py scripts.
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});

  const DASH_TO_MPL = {
    solid: "-",
    dash: "--",
    dot: ":",
    dashdot: "-.",
    none: "None",
  };

  const SYMBOL_TO_MPL = {
    auto: "o",
    circle: "o",
    square: "s",
    diamond: "D",
    "triangle-up": "^",
    "triangle-down": "v",
    cross: "P",
    x: "X",
    star: "*",
    "circle-open": "o",
    none: "",
  };

  const DEFAULT_MPL_OPTIONS = {
    theme: "classic", // classic | seaborn | minimal
    figsize: "8x5",   // "6.5x4.2" | "8x5" | "10x5.5"
    dpi: 300,
    showGrid: true,
    legendLoc: "best", // best | below | upper_right | upper_left
    title: "",
    xLabel: "",
    yLabel: "",
  };

  function parseFigsize(figsizeStr = "8x5") {
    const parts = String(figsizeStr || "8x5").split("x").map(Number);
    const w = Number.isFinite(parts[0]) && parts[0] > 2 ? parts[0] : 8;
    const h = Number.isFinite(parts[1]) && parts[1] > 2 ? parts[1] : 5;
    return [w, h];
  }

  function normalizeMplOptions(opts = {}) {
    const o = opts || {};
    const dpi = Number(o.dpi);
    return {
      theme: ["classic", "seaborn", "minimal"].includes(o.theme) ? o.theme : "classic",
      figsize: typeof o.figsize === "string" && o.figsize.includes("x") ? o.figsize : "8x5",
      dpi: [150, 300, 600].includes(dpi) ? dpi : 300,
      showGrid: o.showGrid !== false,
      legendLoc: ["best", "below", "upper_right", "upper_left"].includes(o.legendLoc) ? o.legendLoc : "best",
      title: typeof o.title === "string" ? o.title : "",
      xLabel: typeof o.xLabel === "string" ? o.xLabel : "",
      yLabel: typeof o.yLabel === "string" ? o.yLabel : "",
    };
  }

  function buildMatplotlibPreviewSpec(spec, styleOpts = {}, mplOptsRaw = {}) {
    if (!spec) return null;
    const C = Ecotox.Charts;
    const styled = C && C.applyStyleToSpec ? C.applyStyleToSpec(spec, styleOpts) : JSON.parse(JSON.stringify(spec));
    const mpl = normalizeMplOptions(mplOptsRaw);

    const isClassic = mpl.theme === "classic";
    const isSeaborn = mpl.theme === "seaborn";
    const plotBg = isSeaborn ? "#eaeaf2" : "#ffffff";
    const gridColor = isSeaborn ? "#ffffff" : "#d1d5db";
    const spineColor = isClassic ? "#111827" : "#475569";
    const fontFamily = "DejaVu Sans, Arial, Helvetica, sans-serif";

    const origLayout = styled.layout || {};
    const origTitle = typeof origLayout.title === "string" ? origLayout.title : origLayout.title?.text || styled.title || "";
    const origXTitle = typeof origLayout.xaxis?.title === "string" ? origLayout.xaxis.title : origLayout.xaxis?.title?.text || "";
    const origYTitle = typeof origLayout.yaxis?.title === "string" ? origLayout.yaxis.title : origLayout.yaxis?.title?.text || "";

    let legendCfg = {
      font: { size: 10.5, color: "#111827", family: fontFamily },
      bgcolor: "rgba(255,255,255,0.9)",
      bordercolor: isClassic ? "#94a3b8" : "#cbd5e1",
      borderwidth: isClassic ? 1 : 0,
    };
    let bottomMargin = 58;

    if (mpl.legendLoc === "below") {
      legendCfg = { ...legendCfg, orientation: "h", x: 0, xanchor: "left", y: -0.24, yanchor: "top" };
      bottomMargin = 82;
    } else if (mpl.legendLoc === "upper_left") {
      legendCfg = { ...legendCfg, orientation: "v", x: 0.02, xanchor: "left", y: 0.98, yanchor: "top" };
    } else if (mpl.legendLoc === "upper_right") {
      legendCfg = { ...legendCfg, orientation: "v", x: 0.98, xanchor: "right", y: 0.98, yanchor: "top" };
    } else {
      legendCfg = { ...legendCfg, orientation: "h", x: 0, xanchor: "left", y: -0.22, yanchor: "top" };
      bottomMargin = 78;
    }

    const axisBase = {
      showgrid: mpl.showGrid,
      gridcolor: gridColor,
      gridwidth: 0.8,
      griddash: isSeaborn ? "solid" : "dash",
      showline: true,
      linecolor: spineColor,
      linewidth: isClassic ? 1.3 : 1.0,
      mirror: isClassic || isSeaborn,
      ticks: isClassic ? "inside" : "outside",
      ticklen: 5,
      tickwidth: 1,
      tickcolor: spineColor,
      tickfont: { color: "#111827", size: 11, family: fontFamily },
      zeroline: false,
    };

    const layout = {
      ...origLayout,
      paper_bgcolor: "#ffffff",
      plot_bgcolor: plotBg,
      font: { color: "#111827", size: 11.5, family: fontFamily },
      margin: { l: 68, r: 26, t: 50, b: bottomMargin },
      title: {
        text: mpl.title || origTitle,
        font: { size: 14, color: "#0f172a", family: fontFamily },
        x: 0.5,
        xanchor: "center",
      },
      xaxis: {
        ...(origLayout.xaxis || {}),
        ...axisBase,
        title: { text: mpl.xLabel || origXTitle, font: { size: 12, color: "#111827", family: fontFamily }, standoff: 10 },
      },
      yaxis: {
        ...(origLayout.yaxis || {}),
        ...axisBase,
        title: { text: mpl.yLabel || origYTitle, font: { size: 12, color: "#111827", family: fontFamily }, standoff: 10 },
      },
      showlegend: origLayout.showlegend !== false && styled.traces.length > 1,
      legend: legendCfg,
    };

    return {
      key: styled.key,
      title: mpl.title || origTitle,
      traces: styled.traces,
      layout,
    };
  }

  function pyStr(str) {
    return JSON.stringify(String(str ?? ""));
  }

  function pyArr(arr) {
    return (
      "[" +
      (arr || [])
        .map((v) => {
          if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "np.nan";
          if (typeof v === "number") return String(Number(v.toFixed(6)));
          return pyStr(v);
        })
        .join(", ") +
      "]"
    );
  }

  function mapDash(dash) {
    return DASH_TO_MPL[dash] || "-";
  }

  function mapMarker(sym) {
    if (Array.isArray(sym)) return SYMBOL_TO_MPL[sym[0]] ?? "o";
    return SYMBOL_TO_MPL[sym] ?? "o";
  }

  function generatePythonScript(spec, styleOpts = {}, mplOptsRaw = {}, filenameBase = "ecotox_graph") {
    const previewSpec = buildMatplotlibPreviewSpec(spec, styleOpts, mplOptsRaw);
    if (!previewSpec) return "# No chart data available";
    const mpl = normalizeMplOptions(mplOptsRaw);
    const [figW, figH] = parseFigsize(mpl.figsize);
    const layout = previewSpec.layout || {};
    const title = typeof layout.title === "string" ? layout.title : layout.title?.text || previewSpec.title || "";
    const xLabel = typeof layout.xaxis?.title === "string" ? layout.xaxis.title : layout.xaxis?.title?.text || "";
    const yLabel = typeof layout.yaxis?.title === "string" ? layout.yaxis.title : layout.yaxis?.title?.text || "";
    const isLogX = layout.xaxis?.type === "log";
    const isSeaborn = mpl.theme === "seaborn";
    const isMinimal = mpl.theme === "minimal";

    const lines = [
      '"""',
      `Ecotoxicology Aid — Matplotlib Publication Script`,
      `Graph: ${title}`,
      '"""',
      "import numpy as np",
      "import matplotlib.pyplot as plt",
      "",
      "# ---------- Figure & Style Settings ----------",
      `plt.rcParams.update({`,
      `    "font.family": "sans-serif",`,
      `    "font.sans-serif": ["DejaVu Sans", "Arial", "Helvetica"],`,
      `    "font.size": 10.5,`,
      `    "axes.titlesize": 12.5,`,
      `    "axes.titleweight": "bold",`,
      `    "axes.labelsize": 11,`,
      `    "axes.edgecolor": "${isMinimal ? "#475569" : "#111827"}",`,
      `    "axes.linewidth": ${mpl.theme === "classic" ? "1.15" : "0.9"},`,
      `    "xtick.direction": "${mpl.theme === "classic" ? "in" : "out"}",`,
      `    "ytick.direction": "${mpl.theme === "classic" ? "in" : "out"}",`,
      `    "xtick.top": ${mpl.theme === "classic" ? "True" : "False"},`,
      `    "ytick.right": ${mpl.theme === "classic" ? "True" : "False"},`,
      `    "figure.dpi": ${mpl.dpi},`,
      `})`,
      "",
      `fig, ax = plt.subplots(figsize=(${figW}, ${figH}), dpi=${mpl.dpi})`,
    ];

    if (isSeaborn) {
      lines.push(`ax.set_facecolor("#eaeaf2")`);
    }
    if (isMinimal) {
      lines.push(`ax.spines["top"].set_visible(False)`);
      lines.push(`ax.spines["right"].set_visible(False)`);
    }
    lines.push("");

    const barTraces = previewSpec.traces.filter((t) => t.type === "bar");
    const isBarStacked = layout.barmode === "stack";
    const isBarGrouped = layout.barmode === "group" || (!isBarStacked && barTraces.length > 1);
    let barIdx = 0;

    if (barTraces.length > 0 && isBarStacked) {
      lines.push(`_stack_bottom = np.zeros(${(barTraces[0].x || []).length}, dtype=float)`);
    }

    previewSpec.traces.forEach((tr, idx) => {
      if (tr.hoverinfo === "skip" && tr.name === "Highlighted") {
        lines.push(`# Highlighted points overlay (${(tr.x || []).length} pts)`);
        lines.push(`ax.scatter(${pyArr(tr.x)}, ${pyArr(tr.y)}, s=180, facecolors="none", edgecolors=${pyArr(tr.marker?.color)}, linewidths=2.0, zorder=5)`);
        lines.push("");
        return;
      }

      if (tr.type === "bar") {
        const xs = tr.x || [];
        const ys = tr.y || [];
        const err = tr.error_y?.visible ? tr.error_y.array : null;
        const barColor = Array.isArray(tr.marker?.color) ? pyArr(tr.marker.color) : pyStr(tr.marker?.color || "#0d9488");
        const varSuffix = `b${barIdx}`;
        lines.push(`# Bar series: ${tr.name || `Series ${barIdx + 1}`}`);
        lines.push(`labels_${varSuffix} = ${pyArr(xs)}`);
        lines.push(`y_${varSuffix} = np.array(${pyArr(ys)}, dtype=float)`);
        if (barIdx === 0) {
          lines.push(`x_pos = np.arange(len(labels_${varSuffix}))`);
        }
        const width = isBarGrouped ? (0.78 / Math.max(1, barTraces.length)).toFixed(3) : "0.62";
        const offsetExpr = isBarGrouped
          ? `x_pos + ${(barIdx - (barTraces.length - 1) / 2).toFixed(3)} * ${width}`
          : "x_pos";
        const errKw = err ? `, yerr=${pyArr(err)}, capsize=3, error_kw={"elinewidth": 1.1}` : "";
        const bottomKw = isBarStacked ? `, bottom=_stack_bottom` : "";
        const labelKw = tr.showlegend !== false && tr.name ? `, label=${pyStr(tr.name)}` : "";
        lines.push(
          `ax.bar(${offsetExpr}, y_${varSuffix}, width=${width}, color=${barColor}, alpha=0.88, edgecolor="#1e293b", linewidth=0.7${bottomKw}${errKw}${labelKw})`
        );
        if (isBarStacked) {
          lines.push(`_stack_bottom = _stack_bottom + np.nan_to_num(y_${varSuffix})`);
        }
        if (barIdx === barTraces.length - 1) {
          lines.push(`ax.set_xticks(x_pos)`);
          lines.push(`ax.set_xticklabels(labels_${varSuffix}, rotation=15, ha="right")`);
        }
        lines.push("");
        barIdx++;
        return;
      }

      if (tr.type === "scatter") {
        const xs = tr.x || [];
        const ys = tr.y || [];
        const mode = String(tr.mode || "lines+markers");
        const hasLine = mode.includes("lines");
        const hasMarker = mode.includes("markers");
        const ls = hasLine ? mapDash(tr.line?.dash) : "None";
        const lw = Number(tr.line?.width || 2.0).toFixed(2);
        const lColor = tr.line?.color || (Array.isArray(tr.marker?.color) ? tr.marker.color[0] : tr.marker?.color) || "#0d9488";
        const markerSym = hasMarker ? mapMarker(tr.marker?.symbol) : "";
        const mSize = Array.isArray(tr.marker?.size) ? Number(tr.marker.size[0] || 7) : Number(tr.marker?.size || 7);
        const alpha = tr.opacity !== undefined ? Number(tr.opacity).toFixed(2) : "1.0";
        const labelKw = tr.showlegend !== false && tr.name ? `, label=${pyStr(tr.name)}` : "";
        const hasErr = tr.error_y && tr.error_y.visible && Array.isArray(tr.error_y.array);

        lines.push(`# Trace ${idx + 1}: ${tr.name || "Series"}`);
        lines.push(`x_${idx} = np.array(${pyArr(xs)}, dtype=float)`);
        lines.push(`y_${idx} = np.array(${pyArr(ys)}, dtype=float)`);

        if (hasErr) {
          lines.push(`err_${idx} = np.array(${pyArr(tr.error_y.array)}, dtype=float)`);
          lines.push(
            `ax.errorbar(x_${idx}, y_${idx}, yerr=err_${idx}, color=${pyStr(lColor)}, linestyle=${pyStr(ls)}, linewidth=${lw}, marker=${pyStr(markerSym)}, markersize=${mSize.toFixed(1)}, capsize=3, elinewidth=1.1, alpha=${alpha}${labelKw})`
          );
        } else {
          lines.push(
            `ax.plot(x_${idx}, y_${idx}, color=${pyStr(lColor)}, linestyle=${pyStr(ls)}, linewidth=${lw}, marker=${pyStr(markerSym)}, markersize=${mSize.toFixed(1)}, alpha=${alpha}${labelKw})`
          );
        }

        // If individual markers have distinct colors/symbols (e.g., Dose-Response Control ★ / Highlighted), overlay scatter points cleanly
        if (hasMarker && (Array.isArray(tr.marker?.color) || Array.isArray(tr.marker?.symbol))) {
          const pColors = Array.isArray(tr.marker?.color) ? pyArr(tr.marker.color) : pyStr(lColor);
          lines.push(
            `ax.scatter(x_${idx}, y_${idx}, c=${pColors}, s=${Math.round(mSize * mSize * 1.1)}, marker=${pyStr(markerSym || "o")}, zorder=4, edgecolors="#ffffff", linewidths=0.9)`
          );
        }
        lines.push("");
      }
    });

    // Shapes (thresholds & fit window)
    (layout.shapes || []).forEach((sh) => {
      const col = sh.line?.color || "#64748b";
      const ls = mapDash(sh.line?.dash || "dash");
      const lw = Number(sh.line?.width || 1.2).toFixed(2);
      if (sh.type === "line" && sh.xref === "paper") {
        lines.push(`ax.axhline(y=${sh.y0}, color=${pyStr(col)}, linestyle=${pyStr(ls)}, linewidth=${lw})`);
      } else if (sh.type === "line" && sh.yref === "paper") {
        lines.push(`ax.axvline(x=${sh.x0}, color=${pyStr(col)}, linestyle=${pyStr(ls)}, linewidth=${lw})`);
      } else if (sh.type === "rect" && sh.yref === "paper") {
        lines.push(`ax.axvspan(${sh.x0}, ${sh.x1}, color="#0d9488", alpha=0.10, label="Fit window")`);
      }
    });

    // Annotations
    (layout.annotations || []).forEach((ann) => {
      if (!ann.text) return;
      if (ann.xref === "paper" && ann.yref === "paper") {
        lines.push(
          `ax.text(${ann.x}, ${ann.y}, ${pyStr(ann.text)}, transform=ax.transAxes, fontsize=9, va="top", ha="left", bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="#cbd5e1"))`
        );
      } else if (ann.xref === "paper") {
        lines.push(
          `ax.text(0.98, ${ann.y}, ${pyStr(" " + ann.text)}, transform=ax.get_yaxis_transform(), ha="right", va="bottom", fontsize=9, color="#475569")`
        );
      }
    });

    lines.push("");
    if (isLogX) lines.push(`ax.set_xscale("log")`);
    if (Array.isArray(layout.yaxis?.range) && layout.yaxis.range.length === 2) {
      lines.push(`ax.set_ylim(${layout.yaxis.range[0]}, ${layout.yaxis.range[1]})`);
    }
    lines.push(`ax.set_title(${pyStr(title)}, pad=10)`);
    if (xLabel) lines.push(`ax.set_xlabel(${pyStr(xLabel)})`);
    if (yLabel) lines.push(`ax.set_ylabel(${pyStr(yLabel)})`);

    if (mpl.showGrid) {
      lines.push(`ax.grid(True, which="both", linestyle="${isSeaborn ? "-" : "--"}", linewidth=0.6, color="${isSeaborn ? "#ffffff" : "#cbd5e1"}", alpha=0.85)`);
    } else {
      lines.push(`ax.grid(False)`);
    }

    if (layout.showlegend !== false) {
      if (mpl.legendLoc === "below") {
        lines.push(`ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.18), ncol=3, frameon=True, framealpha=0.92)`);
      } else if (mpl.legendLoc === "upper_right") {
        lines.push(`ax.legend(loc="upper right", frameon=True, framealpha=0.92)`);
      } else if (mpl.legendLoc === "upper_left") {
        lines.push(`ax.legend(loc="upper left", frameon=True, framealpha=0.92)`);
      } else {
        lines.push(`ax.legend(loc="best", frameon=True, framealpha=0.92)`);
      }
    }

    const cleanName = String(filenameBase || "ecotox_graph").replace(/[^a-zA-Z0-9_-]+/g, "_");
    lines.push(`plt.tight_layout()`);
    lines.push(`fig.savefig("${cleanName}_matplotlib.png", dpi=${mpl.dpi}, bbox_inches="tight")`);
    lines.push(`plt.show()`);
    lines.push("");

    return lines.join("\n");
  }

  async function exportMatplotlibImage(spec, styleOpts = {}, mplOptsRaw = {}, format = "png", filenameBase = "ecotox_graph") {
    if (!spec || !global.Plotly) throw new Error("Plotly is required to render export image.");
    const mpl = normalizeMplOptions(mplOptsRaw);
    const previewSpec = buildMatplotlibPreviewSpec(spec, styleOpts, mpl);
    const [figW, figH] = parseFigsize(mpl.figsize);
    const baseW = Math.round(figW * 110);
    const baseH = Math.round(figH * 110);
    const scale = format === "png" ? Math.max(1, mpl.dpi / 110) : 1;

    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    host.style.width = `${baseW}px`;
    host.style.height = `${baseH}px`;
    host.style.pointerEvents = "none";
    document.body.appendChild(host);

    try {
      const exportLayout = {
        ...previewSpec.layout,
        width: baseW,
        height: baseH,
        autosize: false,
      };
      await global.Plotly.newPlot(host, previewSpec.traces, exportLayout, { staticPlot: true, displayModeBar: false });
      const dataUri = await global.Plotly.toImage(host, {
        format: format === "svg" ? "svg" : "png",
        width: baseW,
        height: baseH,
        scale,
      });
      const ext = format === "svg" ? "svg" : "png";
      const cleanName = String(filenameBase || "ecotox_graph").replace(/[^a-zA-Z0-9_-]+/g, "_");
      const filename = `${cleanName}_matplotlib.${ext}`;
      const a = document.createElement("a");
      a.href = dataUri;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return filename;
    } finally {
      try {
        global.Plotly.purge(host);
      } catch {
        // ignore purge error
      }
      host.remove();
    }
  }

  Ecotox.Matplotlib = {
    DEFAULT_MPL_OPTIONS,
    normalizeMplOptions,
    parseFigsize,
    buildMatplotlibPreviewSpec,
    generatePythonScript,
    exportMatplotlibImage,
  };
})(typeof window !== "undefined" ? window : globalThis);
