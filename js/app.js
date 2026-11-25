/**
 * Ecotoxicology Aid — Main Application Controller
 * Coordinates localStorage experiments, portable .json save files,
 * split-pane forms & lists, live Plotly charts, and tables.
 */
(function (global) {
  "use strict";

  const Ecotox = global.Ecotox;
  const M = Ecotox.Math;
  const S = Ecotox.Storage;
  const C = Ecotox.Charts;

  // ---------- Application State ----------
  const state = {
    workspace: null,
    activeTab: "od",
    odTableTab: "summary",
    ccTableTab: "summary",
    ccInputMode: "chamber",
    odSelectedWavelength: null,
    odControlConc: null,
    ccControlConc: null,
    lemnaControlConc: null,
    lastOdAnalysis: null,
    lastCcAnalysis: null,
    lastLemnaAnalysis: null,
    views: {
      od: { selectedConcs: new Set(), filterMode: "highlight", showErrorBars: true, showFitLines: false, logX: false, icTarget: 50 },
      cc: { selectedConcs: new Set(), filterMode: "highlight", showErrorBars: true, showFitLines: false, logX: false, icTarget: 50 },
      lemna: { selectedConcs: new Set(), filterMode: "highlight", showErrorBars: true, showFitLines: false, logX: false, icTarget: 50 },
    },
  };

  function resetViewSelections() {
    state.views.od.selectedConcs.clear();
    state.views.cc.selectedConcs.clear();
    state.views.lemna.selectedConcs.clear();
  }

  function renderConcChips(containerId, concs, controlConc, unit, view) {
    const el = $(containerId);
    if (!el) return;
    if (!concs || concs.length === 0) {
      el.innerHTML = `<span class="form-hint">No concentrations yet</span>`;
      return;
    }
    // Prune any selected concentrations no longer present
    for (const c of Array.from(view.selectedConcs)) {
      if (!concs.includes(c)) view.selectedConcs.delete(c);
    }
    const hasSel = view.selectedConcs.size > 0;
    const chipsHtml = concs
      .map((c) => {
        const color = C.getConcColor(c, concs);
        const isSel = view.selectedConcs.has(c);
        const isCtrl = Number(c) === Number(controlConc);
        const cls = [
          "conc-chip",
          isSel ? "active" : hasSel ? "dimmed" : "",
          isCtrl ? "is-ctrl" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<button type="button" class="${cls}" style="--chip-color:${color}" data-chip-conc="${c}" title="Click to ${view.filterMode === "isolate" ? "isolate" : "highlight"} ${c} ${escapeHtml(unit)} across all graphs">
          <span class="conc-chip-dot" style="background:${color}"></span>
          <span>${c}${isCtrl ? ' <span class="ctrl-star" title="Control">★</span>' : ""}</span>
        </button>`;
      })
      .join("");
    const resetBtn = hasSel
      ? `<button type="button" class="conc-chip conc-chip-reset" data-chip-reset="1" title="Show all concentrations normally">Reset</button>`
      : "";
    el.innerHTML = chipsHtml + resetBtn;
  }

  function toggleConcSelection(tabKey, concVal, renderFn) {
    const view = state.views[tabKey];
    const num = Number(concVal);
    if (!Number.isFinite(num)) return;
    if (view.selectedConcs.has(num)) view.selectedConcs.delete(num);
    else view.selectedConcs.add(num);
    renderFn();
  }

  // ---------- Helpers ----------
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function nowTimeHm() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function getActiveExp() {
    if (!state.workspace || !Array.isArray(state.workspace.experiments) || state.workspace.experiments.length === 0) {
      return null;
    }
    const { experiments, activeExperimentId } = state.workspace;
    return experiments.find((e) => e.id === activeExperimentId) || experiments[0];
  }

  function persist() {
    const exp = getActiveExp();
    if (exp) {
      exp.updatedAt = new Date().toISOString();
      state.workspace.activeExperimentId = exp.id;
    } else {
      state.workspace.activeExperimentId = null;
    }
    state.workspace.activeTab = state.activeTab;
    S.saveWorkspace(state.workspace);
  }

  function toast(message) {
    const stack = $("toast-stack");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity 0.2s";
      setTimeout(() => el.remove(), 220);
    }, 2600);
  }

  function formatInhClass(val) {
    if (val === null || val === undefined || !Number.isFinite(val)) return "";
    if (val >= 50) return "num-high-inh";
    if (val < 0) return "num-neg-inh";
    return "";
  }

  function formatIc50Card(ic50, unit, targetPct = 50) {
    const t = ic50?.targetPct ?? targetPct ?? 50;
    if (!ic50) return { main: "—", sub: `${t}% inhibition threshold` };
    if (ic50.status === "interpolated" && Number.isFinite(ic50.value)) {
      return {
        main: `${ic50.value.toFixed(3)} ${unit}`,
        sub: `Bracket: ${ic50.bracket[0]} – ${ic50.bracket[1]} ${unit}`,
      };
    }
    if (ic50.status === "below_50") {
      return {
        main: "> max",
        sub: `Max inh. ${ic50.maxInhibition.toFixed(1)}% (< ${t}%)`,
      };
    }
    return { main: "N/A", sub: "Non-monotonic curve" };
  }

  function slugify(str) {
    return (
      String(str || "export")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "export"
    );
  }

  // ---------- Theme Handling ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("btn-theme-toggle").textContent = theme === "dark" ? "☾" : "☀";
    S.saveTheme(theme);
  }

  // ---------- Workspace Visibility & Header ----------
  function renderExperimentHeader() {
    const exp = getActiveExp();
    const sel = $("experiment-select");
    const hasExp = Boolean(exp);

    $("btn-edit-exp").disabled = !hasExp;
    $("btn-save-exp").disabled = !hasExp;
    $("btn-export-html").disabled = !hasExp;
    $("btn-export-json").disabled = state.workspace.experiments.length === 0;
    sel.disabled = !hasExp;

    $("empty-workspace-screen").hidden = hasExp;
    $("main-tabbar").hidden = !hasExp;

    if (!hasExp) {
      sel.innerHTML = `<option value="">— No experiment open —</option>`;
      $("exp-meta-pills").innerHTML = "";
      $("badge-od").textContent = "0";
      $("badge-cellcount").textContent = "0";
      $("badge-lemna").textContent = "0";
      $("badge-dilutions").textContent = "0";
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      return;
    }

    sel.innerHTML = state.workspace.experiments
      .map((e) => `<option value="${escapeHtml(e.id)}" ${e.id === exp.id ? "selected" : ""}>${escapeHtml(e.name)}</option>`)
      .join("");

    // Ensure active tab panel is visible
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      const isAct = btn.dataset.tab === state.activeTab;
      btn.classList.toggle("active", isAct);
      btn.setAttribute("aria-selected", String(isAct));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${state.activeTab}`);
    });

    // Update unit labels across forms
    const unit = exp.meta.concUnit || "mg/L";
    document.querySelectorAll(".unit-label").forEach((el) => {
      el.textContent = unit;
    });

    // Update metadata pills
    const pills = [];
    if (exp.meta.pollutant) pills.push(`<span class="meta-pill">Substance: <strong>${escapeHtml(exp.meta.pollutant)}</strong></span>`);
    if (exp.meta.organism) pills.push(`<span class="meta-pill">Organism: <strong>${escapeHtml(exp.meta.organism)}</strong></span>`);
    pills.push(`<span class="meta-pill">Unit: <strong>${escapeHtml(unit)}</strong></span>`);
    $("exp-meta-pills").innerHTML = pills.join("");

    // Update tab count badges
    $("badge-od").textContent = exp.odEntries.length;
    $("badge-cellcount").textContent = exp.cellCountEntries.length;
    $("badge-lemna").textContent = exp.lemnaEntries.length;
    $("badge-dilutions").textContent = exp.dilutions.length;
  }

  // ==========================================================================
  // TAB 1: OD MEASUREMENTS
  // ==========================================================================

  function populateOdFiltersAndControls(exp) {
    const wavelengths = Array.from(new Set(exp.odEntries.map((e) => Number(e.wavelength)))).sort((a, b) => a - b);
    const wlSel = $("od-ctrl-wavelength");
    if (wavelengths.length === 0) {
      const defWl = exp.meta.defaultWavelength || 680;
      wlSel.innerHTML = `<option value="${defWl}">${defWl} nm</option>`;
      state.odSelectedWavelength = defWl;
    } else {
      if (!wavelengths.includes(Number(state.odSelectedWavelength))) {
        state.odSelectedWavelength = wavelengths.includes(exp.meta.defaultWavelength)
          ? exp.meta.defaultWavelength
          : wavelengths[0];
      }
      wlSel.innerHTML = wavelengths
        .map((w) => `<option value="${w}" ${w === Number(state.odSelectedWavelength) ? "selected" : ""}>${w} nm</option>`)
        .join("");
    }

    const activeWl = Number(state.odSelectedWavelength);
    const wlEntries = exp.odEntries.filter((e) => Number(e.wavelength) === activeWl);
    const concs = Array.from(new Set(wlEntries.map((e) => Number(e.concentration)))).sort((a, b) => a - b);

    const ctrlSel = $("od-ctrl-conc");
    const defaultCtrl = Number(exp.meta.controlConc);
    if (concs.length === 0) {
      ctrlSel.innerHTML = `<option value="${defaultCtrl}">${defaultCtrl}</option>`;
      state.odControlConc = defaultCtrl;
    } else {
      if (state.odControlConc === null || !concs.includes(Number(state.odControlConc))) {
        state.odControlConc = concs.includes(defaultCtrl) ? defaultCtrl : concs[0];
      }
      ctrlSel.innerHTML = concs
        .map((c) => `<option value="${c}" ${c === Number(state.odControlConc) ? "selected" : ""}>${c}</option>`)
        .join("");
    }

    const allConcs = Array.from(new Set(exp.odEntries.map((e) => Number(e.concentration)))).sort((a, b) => a - b);
    const filterSel = $("od-filter-conc");
    const prevFilter = filterSel.value || "all";
    filterSel.innerHTML =
      `<option value="all">All conc.</option>` +
      allConcs.map((c) => `<option value="${c}">${c} ${escapeHtml(exp.meta.concUnit)}</option>`).join("");
    if ([...filterSel.options].some((o) => o.value === prevFilter)) {
      filterSel.value = prevFilter;
    }
  }

  function renderOdEntriesList(exp) {
    if (!exp) return;
    const search = ($("od-filter-search").value || "").trim().toLowerCase();
    const concFilter = $("od-filter-conc").value;
    const editId = $("od-edit-id").value;
    const ctrlConc = Number(state.odControlConc ?? exp.meta.controlConc ?? 0);
    const unit = exp.meta.concUnit || "";

    const filtered = exp.odEntries
      .filter((e) => {
        if (concFilter !== "all" && Number(e.concentration) !== Number(concFilter)) return false;
        if (search) {
          const hay = `${e.date} ${e.time} ${e.concentration} ${e.value} ${e.wavelength} ${e.label || ""}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ta = M.parseTimestampMs(a.date, a.time);
        const tb = M.parseTimestampMs(b.date, b.time);
        return tb - ta || Number(a.concentration) - Number(b.concentration);
      });

    $("od-list-count").textContent = filtered.length;
    const container = $("od-entries-list");
    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-list">No OD measurements match.<br/>Enter a reading above or use <strong>+ Batch Entry</strong>.</div>`;
      return;
    }

    container.innerHTML = filtered
      .map((e) => {
        const isCtrl = Number(e.concentration) === ctrlConc;
        const isEditing = e.id === editId;
        return `
          <div class="entry-item ${isEditing ? "editing" : ""}">
            <div class="entry-main">
              <div class="entry-top">
                <span class="entry-val">${M.formatNum(Number(e.value), 3)}</span>
                <span class="entry-conc-tag ${isCtrl ? "control" : ""}">${e.concentration} ${escapeHtml(unit)}${isCtrl ? " · Ctrl" : ""}</span>
                ${e.label ? `<span class="form-hint">${escapeHtml(e.label)}</span>` : ""}
              </div>
              <div class="entry-sub">${escapeHtml(e.date)} ${escapeHtml(e.time)} · ${e.wavelength} nm</div>
            </div>
            <div class="entry-actions">
              <button type="button" class="btn btn-xs btn-ghost" data-od-edit="${escapeHtml(e.id)}" title="Edit">Edit</button>
              <button type="button" class="btn btn-xs btn-ghost" data-od-del="${escapeHtml(e.id)}" title="Delete">✕</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderOdTable(analysis, unit) {
    const container = $("od-table-container");
    const tab = state.odTableTab;

    if (!analysis || analysis.averaged.length === 0) {
      container.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted);">No OD data to tabulate yet.</div>`;
      return;
    }

    if (tab === "summary") {
      const rowsHtml = analysis.summary
        .map(
          (r) => `
          <tr data-conc-row="${r.concentration}" class="${state.views.od.selectedConcs.has(r.concentration) ? "row-highlighted" : ""}" title="Click to highlight in graphs">
            <td>${r.concentration} ${escapeHtml(unit)}${r.isControl ? " ★ Ctrl" : ""}</td>
            <td>${M.formatNum(r.mu, 5)}</td>
            <td>${r.r2 !== null ? M.formatNum(r.r2, 4) : "—"}</td>
            <td>${r.doublingTime !== null ? `${M.formatNum(r.doublingTime, 1)} h` : "—"}</td>
            <td class="${formatInhClass(r.inhibition)}">${r.inhibition !== null ? `${M.formatNum(r.inhibition, 2)}%` : "—"}</td>
            <td>${r.pointsCount}</td>
          </tr>`
        )
        .join("");

      container.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Concentration</th>
              <th>μ (h⁻¹)</th>
              <th>R² (log fit)</th>
              <th>Doubling Time</th>
              <th>Inhibition (%)</th>
              <th>Timepoints</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    } else if (tab === "averaged") {
      const rowsHtml = analysis.averaged
        .map(
          (r) => `
          <tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.time)}</td>
            <td>${M.formatNum(r.elapsedHours, 2)}</td>
            <td>${r.concentration} ${escapeHtml(unit)}</td>
            <td>${M.formatNum(r.meanVal, 4)}</td>
            <td>${M.formatNum(r.stdVal, 5)}</td>
            <td>${r.n}</td>
          </tr>`
        )
        .join("");

      container.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Elapsed (h)</th>
              <th>Concentration</th>
              <th>Mean OD</th>
              <th>SD (n-1)</th>
              <th>n</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    } else {
      const rowsHtml = analysis.kinetics
        .map(
          (r) => `
          <tr>
            <td>${escapeHtml(r.date)} ${escapeHtml(r.time)}</td>
            <td>${M.formatNum(r.elapsedHours, 2)}</td>
            <td>${r.concentration} ${escapeHtml(unit)}</td>
            <td>${M.formatNum(r.meanVal, 4)}</td>
            <td>${M.formatNum(r.stdVal, 5)}</td>
            <td>${r.intervalMu !== null ? M.formatNum(r.intervalMu, 5) : "—"}</td>
            <td class="${formatInhClass(r.intervalInhibition)}">${r.intervalInhibition !== null ? `${M.formatNum(r.intervalInhibition, 2)}%` : "—"}</td>
          </tr>`
        )
        .join("");

      container.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Elapsed (h)</th>
              <th>Concentration</th>
              <th>Mean OD</th>
              <th>SD</th>
              <th>Interval μ (h⁻¹)</th>
              <th>Interval Inh. (%)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    }
  }

  function renderOdTab() {
    const exp = getActiveExp();
    if (!exp) return;

    populateOdFiltersAndControls(exp);
    renderOdEntriesList(exp);

    const activeWl = Number(state.odSelectedWavelength);
    const controlConc = Number(state.odControlConc ?? exp.meta.controlConc ?? 0);
    const tStart = $("od-t-start").value;
    const tEnd = $("od-t-end").value;
    const unit = exp.meta.concUnit || "";

    const view = state.views.od;
    const wlRecords = exp.odEntries.filter((e) => Number(e.wavelength) === activeWl);
    const analysis = M.analyzeTimeSeries(wlRecords, {
      controlConc,
      tStartHours: tStart,
      tEndHours: tEnd,
      icTarget: view.icTarget,
    });
    state.lastOdAnalysis = analysis;

    renderConcChips("od-conc-chips", analysis.concentrations, controlConc, unit, view);

    const ctrlRow = analysis.summary.find((r) => r.isControl);
    $("od-kpi-ctrl-mu").textContent = ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 4) : "—";
    $("od-kpi-ctrl-r2").textContent =
      ctrlRow && ctrlRow.r2 !== null ? `R² = ${ctrlRow.r2.toFixed(4)} (${ctrlRow.pointsCount} pts)` : "Need ≥ 2 timepoints";

    const inhRows = analysis.summary.filter((r) => r.inhibition !== null && !r.isControl);
    if (inhRows.length > 0) {
      const maxRow = inhRows.reduce((best, cur) => (cur.inhibition > best.inhibition ? cur : best), inhRows[0]);
      $("od-kpi-max-inh").textContent = `${maxRow.inhibition.toFixed(1)}%`;
      $("od-kpi-max-inh-conc").textContent = `At ${maxRow.concentration} ${unit}`;
    } else {
      $("od-kpi-max-inh").textContent = "—";
      $("od-kpi-max-inh-conc").textContent = "Highest observed";
    }

    $("od-kpi-ic50-label").textContent = `Est. IC${view.icTarget} (Linear)`;
    const ic50Disp = formatIc50Card(analysis.ic50, unit, view.icTarget);
    $("od-kpi-ic50").textContent = ic50Disp.main;
    $("od-kpi-ic50-sub").textContent = ic50Disp.sub;

    $("od-kpi-coverage").textContent = `${wlRecords.length} pts`;
    $("od-kpi-coverage-sub").textContent = `${analysis.timepointsCount} timepoints · ${analysis.concentrations.length} conc.`;

    if (state.activeTab === "od") {
      C.renderTimeSeriesSuite({
        ids: {
          growth: "od-chart-growth",
          semilog: "od-chart-semilog",
          mu: "od-chart-mu",
          dose: "od-chart-dose",
        },
        analysis,
        concUnit: unit,
        yAxisLabel: `OD (${activeWl} nm)`,
        growthTitle: `Growth Curves (OD${activeWl} ± SD)`,
        semiLogYLabel: "ln(OD)",
        filePrefix: `${slugify(exp.name)}_od${activeWl}`,
        singleTimepointBarTitle: `OD${activeWl} Snapshot (Mean ± SD)`,
        viewOptions: {
          highlightedConcs: view.selectedConcs,
          filterMode: view.filterMode,
          controlConc,
          showErrorBars: view.showErrorBars,
          showFitLines: view.showFitLines,
          logX: view.logX,
          icTarget: view.icTarget,
          tStartHours: tStart,
          tEndHours: tEnd,
        },
      });
    }

    renderOdTable(analysis, unit);
  }

  function resetOdForm(keepSticky = true) {
    const exp = getActiveExp();
    $("od-edit-id").value = "";
    $("od-form-title").textContent = "New OD Measurement";
    $("od-submit-btn").textContent = "Add Measurement";
    $("od-cancel-edit").hidden = true;
    $("od-value").value = "";
    $("od-label").value = "";
    if (!keepSticky) {
      $("od-date").value = todayIso();
      $("od-time").value = nowTimeHm();
      $("od-conc").value = "";
      $("od-wavelength").value = exp ? exp.meta.defaultWavelength || 680 : 680;
    }
  }

  // ==========================================================================
  // TAB 2: CELL COUNT
  // ==========================================================================

  function updateCellCountModeUI() {
    const isChamber = state.ccInputMode === "chamber";
    document.querySelectorAll("#cc-mode-toggle button").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === state.ccInputMode);
    });
    document.querySelectorAll(".cc-chamber-field").forEach((el) => {
      el.hidden = !isChamber;
    });
    document.querySelectorAll(".cc-direct-field").forEach((el) => {
      el.hidden = isChamber;
    });
    updateCellCountPreview();
  }

  function updateCellCountPreview() {
    const previewEl = $("cc-preview-val");
    if (state.ccInputMode === "chamber") {
      const cells = M.parseSumExpression($("cc-cells-expr").value);
      const squares = Number($("cc-squares").value);
      const dil = Number($("cc-dilution").value);
      const cf = Number($("cc-chamber-factor").value);
      const vol = Number($("cc-volume-ul").value);
      const { cellsPerMl } = M.calculateCellCount({
        cellsCounted: cells,
        smallSquares: squares,
        dilutionFactor: dil,
        volumeUl: vol,
        chamberFactor: cf,
      });
      if (Number.isFinite(cellsPerMl)) {
        previewEl.textContent = `${M.formatSci(cellsPerMl, 3)} cells/mL (n=${cells})`;
      } else {
        previewEl.textContent = "— cells/mL";
      }
    } else {
      const direct = Number($("cc-direct-val").value);
      previewEl.textContent = Number.isFinite(direct) && direct >= 0 ? `${M.formatSci(direct, 3)} cells/mL` : "— cells/mL";
    }
  }

  function populateCcControls(exp) {
    const concs = Array.from(new Set(exp.cellCountEntries.map((e) => Number(e.concentration)))).sort((a, b) => a - b);
    const ctrlSel = $("cc-ctrl-conc");
    const defaultCtrl = Number(exp.meta.controlConc);
    if (concs.length === 0) {
      ctrlSel.innerHTML = `<option value="${defaultCtrl}">${defaultCtrl}</option>`;
      state.ccControlConc = defaultCtrl;
    } else {
      if (state.ccControlConc === null || !concs.includes(Number(state.ccControlConc))) {
        state.ccControlConc = concs.includes(defaultCtrl) ? defaultCtrl : concs[0];
      }
      ctrlSel.innerHTML = concs
        .map((c) => `<option value="${c}" ${c === Number(state.ccControlConc) ? "selected" : ""}>${c}</option>`)
        .join("");
    }

    const filterSel = $("cc-filter-conc");
    const prevFilter = filterSel.value || "all";
    filterSel.innerHTML =
      `<option value="all">All conc.</option>` +
      concs.map((c) => `<option value="${c}">${c} ${escapeHtml(exp.meta.concUnit)}</option>`).join("");
    if ([...filterSel.options].some((o) => o.value === prevFilter)) {
      filterSel.value = prevFilter;
    }

    const inocSel = $("inoc-source");
    const prevSource = inocSel.value || "custom";
    const opts = [`<option value="custom">Custom value</option>`];
    if (exp.cellCountEntries.length > 0) {
      const avgAll = M.mean(exp.cellCountEntries.map((e) => Number(e.cellsPerMl)).filter(Number.isFinite));
      opts.push(`<option value="avg_all">Avg of all entries (${M.formatSci(avgAll, 3)})</option>`);
      exp.cellCountEntries.forEach((e) => {
        const label = e.sampleId || `${e.concentration} ${exp.meta.concUnit}`;
        opts.push(`<option value="${escapeHtml(e.id)}">${escapeHtml(label)} · ${escapeHtml(e.date)} (${M.formatSci(e.cellsPerMl, 2)})</option>`);
      });
    }
    inocSel.innerHTML = opts.join("");
    if ([...inocSel.options].some((o) => o.value === prevSource)) {
      inocSel.value = prevSource;
    }
  }

  function renderInoculationResult() {
    const res = M.calculateInoculation($("inoc-c1").value, $("inoc-c2").value, $("inoc-v2").value);
    const out = $("inoc-result");
    if (!res) {
      out.innerHTML = `<span class="form-hint">Enter valid positive stock concentration, target concentration, and final volume.</span>`;
      return;
    }
    if (!res.feasible) {
      out.innerHTML = `<span class="warn">Stock density (C₁) is lower than target (C₂) — cannot dilute up to target!</span>`;
      return;
    }
    out.innerHTML = `
      <span>Stock needed (V₁): <strong>${res.stockVolumeMl.toFixed(3)} mL</strong> (${res.stockVolumeUl.toFixed(1)} µL)</span>
      <span>+ Medium to add: <strong>${res.mediumVolumeMl.toFixed(3)} mL</strong></span>
      <span class="form-hint">Dilution 1 : ${res.dilutionRatio.toFixed(2)}</span>
    `;
  }

  function renderCcEntriesList(exp) {
    if (!exp) return;
    const search = ($("cc-filter-search").value || "").trim().toLowerCase();
    const concFilter = $("cc-filter-conc").value;
    const editId = $("cc-edit-id").value;
    const ctrlConc = Number(state.ccControlConc ?? exp.meta.controlConc ?? 0);
    const unit = exp.meta.concUnit || "";

    const filtered = exp.cellCountEntries
      .filter((e) => {
        if (concFilter !== "all" && Number(e.concentration) !== Number(concFilter)) return false;
        if (search) {
          const hay = `${e.date} ${e.time} ${e.concentration} ${e.sampleId || ""} ${e.cellsCountedExpr || ""}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ta = M.parseTimestampMs(a.date, a.time);
        const tb = M.parseTimestampMs(b.date, b.time);
        return tb - ta || Number(a.concentration) - Number(b.concentration);
      });

    $("cc-list-count").textContent = filtered.length;
    const container = $("cc-entries-list");
    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-list">No cell count entries yet.<br/>Use Chamber or Direct mode above to log counts.</div>`;
      return;
    }

    container.innerHTML = filtered
      .map((e) => {
        const isCtrl = Number(e.concentration) === ctrlConc;
        const isEditing = e.id === editId;
        const detail =
          e.inputMode === "chamber"
            ? `${e.cellsCounted} cells / ${e.smallSquares} sq · DF ${e.dilutionFactor}`
            : `Direct input`;
        return `
          <div class="entry-item ${isEditing ? "editing" : ""}">
            <div class="entry-main">
              <div class="entry-top">
                <span class="entry-val">${M.formatSci(Number(e.cellsPerMl), 3)} /mL</span>
                <span class="entry-conc-tag ${isCtrl ? "control" : ""}">${e.concentration} ${escapeHtml(unit)}${isCtrl ? " · Ctrl" : ""}</span>
                ${e.sampleId ? `<span class="form-hint">${escapeHtml(e.sampleId)}</span>` : ""}
              </div>
              <div class="entry-sub">${escapeHtml(e.date)} ${escapeHtml(e.time)} · ${escapeHtml(detail)}</div>
            </div>
            <div class="entry-actions">
              <button type="button" class="btn btn-xs btn-ghost" data-cc-edit="${escapeHtml(e.id)}">Edit</button>
              <button type="button" class="btn btn-xs btn-ghost" data-cc-del="${escapeHtml(e.id)}">✕</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderCcTable(analysis, unit) {
    const container = $("cc-table-container");
    const tab = state.ccTableTab;

    if (!analysis || analysis.averaged.length === 0) {
      container.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted);">No cell count data to tabulate yet.</div>`;
      return;
    }

    if (tab === "summary") {
      const rowsHtml = analysis.summary
        .map(
          (r) => `
          <tr data-conc-row="${r.concentration}" class="${state.views.cc.selectedConcs.has(r.concentration) ? "row-highlighted" : ""}" title="Click to highlight in graphs">
            <td>${r.concentration} ${escapeHtml(unit)}${r.isControl ? " ★ Ctrl" : ""}</td>
            <td>${M.formatNum(r.mu, 5)}</td>
            <td>${r.r2 !== null ? M.formatNum(r.r2, 4) : "—"}</td>
            <td>${r.doublingTime !== null ? `${M.formatNum(r.doublingTime, 1)} h` : "—"}</td>
            <td class="${formatInhClass(r.inhibition)}">${r.inhibition !== null ? `${M.formatNum(r.inhibition, 2)}%` : "—"}</td>
            <td>${r.pointsCount}</td>
          </tr>`
        )
        .join("");

      container.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Concentration</th>
              <th>μ (h⁻¹)</th>
              <th>R² (log fit)</th>
              <th>Doubling Time</th>
              <th>Inhibition (%)</th>
              <th>Timepoints</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    } else if (tab === "averaged") {
      const rowsHtml = analysis.averaged
        .map(
          (r) => `
          <tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.time)}</td>
            <td>${M.formatNum(r.elapsedHours, 2)}</td>
            <td>${r.concentration} ${escapeHtml(unit)}</td>
            <td>${M.formatSci(r.meanVal, 3)}</td>
            <td>${M.formatSci(r.stdVal, 2)}</td>
            <td>${r.n}</td>
          </tr>`
        )
        .join("");

      container.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Elapsed (h)</th>
              <th>Concentration</th>
              <th>Mean (cells/mL)</th>
              <th>SD</th>
              <th>n</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    } else {
      const rowsHtml = analysis.kinetics
        .map(
          (r) => `
          <tr>
            <td>${escapeHtml(r.date)} ${escapeHtml(r.time)}</td>
            <td>${M.formatNum(r.elapsedHours, 2)}</td>
            <td>${r.concentration} ${escapeHtml(unit)}</td>
            <td>${M.formatSci(r.meanVal, 3)}</td>
            <td>${r.intervalMu !== null ? M.formatNum(r.intervalMu, 5) : "—"}</td>
            <td class="${formatInhClass(r.intervalInhibition)}">${r.intervalInhibition !== null ? `${M.formatNum(r.intervalInhibition, 2)}%` : "—"}</td>
          </tr>`
        )
        .join("");

      container.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Elapsed (h)</th>
              <th>Concentration</th>
              <th>Mean (cells/mL)</th>
              <th>Interval μ (h⁻¹)</th>
              <th>Interval Inh. (%)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    }
  }

  function renderCellCountTab() {
    const exp = getActiveExp();
    if (!exp) return;

    populateCcControls(exp);
    renderCcEntriesList(exp);
    renderInoculationResult();

    const controlConc = Number(state.ccControlConc ?? exp.meta.controlConc ?? 0);
    const tStart = $("cc-t-start").value;
    const tEnd = $("cc-t-end").value;
    const unit = exp.meta.concUnit || "";

    const tsRecords = exp.cellCountEntries.map((e) => ({
      date: e.date,
      time: e.time,
      concentration: e.concentration,
      value: e.cellsPerMl,
    }));

    const view = state.views.cc;
    const analysis = M.analyzeTimeSeries(tsRecords, {
      controlConc,
      tStartHours: tStart,
      tEndHours: tEnd,
      icTarget: view.icTarget,
    });
    state.lastCcAnalysis = analysis;

    renderConcChips("cc-conc-chips", analysis.concentrations, controlConc, unit, view);

    const ctrlAvgRows = analysis.averaged.filter((r) => r.concentration === controlConc);
    const latestCtrl = ctrlAvgRows.length > 0 ? ctrlAvgRows[ctrlAvgRows.length - 1] : null;
    $("cc-kpi-latest").textContent = latestCtrl ? M.formatSci(latestCtrl.meanVal, 3) : "—";

    const ctrlSummary = analysis.summary.find((r) => r.isControl);
    $("cc-kpi-ctrl-mu").textContent = ctrlSummary && ctrlSummary.mu !== null ? M.formatNum(ctrlSummary.mu, 4) : "—";
    $("cc-kpi-ctrl-r2").textContent =
      ctrlSummary && ctrlSummary.r2 !== null ? `R² = ${ctrlSummary.r2.toFixed(4)}` : "Requires ≥ 2 timepoints";

    $("cc-kpi-ic50-label").textContent = `Est. IC${view.icTarget} (Linear)`;
    const ic50Disp = formatIc50Card(analysis.ic50, unit, view.icTarget);
    $("cc-kpi-ic50").textContent = ic50Disp.main;
    $("cc-kpi-ic50-sub").textContent = ic50Disp.sub;

    $("cc-kpi-coverage").textContent = `${exp.cellCountEntries.length} counts`;
    $("cc-kpi-coverage-sub").textContent = `${analysis.timepointsCount} timepoints · ${analysis.concentrations.length} conc.`;

    if (state.activeTab === "cellcount") {
      C.renderTimeSeriesSuite({
        ids: {
          growth: "cc-chart-growth",
          semilog: "cc-chart-semilog",
          mu: "cc-chart-mu",
          dose: "cc-chart-dose",
        },
        analysis,
        concUnit: unit,
        yAxisLabel: "Cells / mL",
        growthTitle: "Cell Density Growth Curves (Mean ± SD)",
        semiLogYLabel: "ln(Cells/mL)",
        filePrefix: `${slugify(exp.name)}_cellcount`,
        singleTimepointBarTitle: "Measured Cell Density (cells/mL ± SD)",
        viewOptions: {
          highlightedConcs: view.selectedConcs,
          filterMode: view.filterMode,
          controlConc,
          showErrorBars: view.showErrorBars,
          showFitLines: view.showFitLines,
          logX: view.logX,
          icTarget: view.icTarget,
          tStartHours: tStart,
          tEndHours: tEnd,
        },
      });
    }

    renderCcTable(analysis, unit);
  }

  function resetCcForm(keepSticky = true) {
    $("cc-edit-id").value = "";
    $("cc-form-title").textContent = "New Cell Count";
    $("cc-submit-btn").textContent = "Add Cell Count";
    $("cc-cancel-edit").hidden = true;
    $("cc-cells-expr").value = "";
    $("cc-direct-val").value = "";
    $("cc-sample-id").value = "";
    if (!keepSticky) {
      $("cc-date").value = todayIso();
      $("cc-time").value = nowTimeHm();
      $("cc-conc").value = "0";
      $("cc-squares").value = "64";
      $("cc-dilution").value = "1";
      $("cc-volume-ul").value = "1000";
    }
    updateCellCountPreview();
  }

  // ==========================================================================
  // TAB 3: LEMNA MINOR
  // ==========================================================================

  function renderLemnaTab() {
    const exp = getActiveExp();
    if (!exp) return;

    const unit = exp.meta.concUnit || "";
    const concs = Array.from(new Set(exp.lemnaEntries.map((e) => Number(e.dilution)))).sort((a, b) => a - b);
    const ctrlSel = $("lemna-ctrl-conc");
    const defaultCtrl = Number(exp.meta.controlConc);

    if (concs.length === 0) {
      ctrlSel.innerHTML = `<option value="${defaultCtrl}">${defaultCtrl}</option>`;
      state.lemnaControlConc = defaultCtrl;
    } else {
      if (state.lemnaControlConc === null || !concs.includes(Number(state.lemnaControlConc))) {
        state.lemnaControlConc = concs.includes(defaultCtrl) ? defaultCtrl : concs[0];
      }
      ctrlSel.innerHTML = concs
        .map((c) => `<option value="${c}" ${c === Number(state.lemnaControlConc) ? "selected" : ""}>${c}</option>`)
        .join("");
    }

    const view = state.views.lemna;
    const controlConc = Number(state.lemnaControlConc ?? defaultCtrl);
    const analysis = M.analyzeLemna(exp.lemnaEntries, controlConc, view.icTarget);
    state.lastLemnaAnalysis = analysis;

    renderConcChips("lemna-conc-chips", concs, controlConc, unit, view);

    const editId = $("lemna-edit-id").value;
    $("lemna-list-count").textContent = analysis.rows.length;
    const listEl = $("lemna-entries-list");
    if (analysis.rows.length === 0) {
      listEl.innerHTML = `<div class="empty-list">No Lemna minor samples yet.<br/>Enter Day 0 and Final frond counts above.</div>`;
    } else {
      listEl.innerHTML = analysis.rows
        .map((r) => {
          const isEditing = r.id === editId;
          const repB = r.n0B !== null ? ` | B: ${r.n0B}→${r.ntB}` : "";
          return `
            <div class="entry-item ${isEditing ? "editing" : ""}">
              <div class="entry-main">
                <div class="entry-top">
                  <span class="entry-conc-tag ${r.isControl ? "control" : ""}">${r.dilution} ${escapeHtml(unit)}${r.isControl ? " · Ctrl" : ""}</span>
                  <span class="entry-val">μ=${M.formatNum(r.mu, 4)}</span>
                  ${r.inhibition !== null ? `<span class="form-hint ${formatInhClass(r.inhibition)}">${r.inhibition.toFixed(1)}%</span>` : ""}
                </div>
                <div class="entry-sub">A: ${r.n0A}→${r.ntA}${repB} · t=${r.tHours}h</div>
              </div>
              <div class="entry-actions">
                <button type="button" class="btn btn-xs btn-ghost" data-lemna-edit="${escapeHtml(r.id)}">Edit</button>
                <button type="button" class="btn btn-xs btn-ghost" data-lemna-del="${escapeHtml(r.id)}">✕</button>
              </div>
            </div>
          `;
        })
        .join("");
    }

    const ctrlRow = analysis.rows.find((r) => r.isControl);
    $("lemna-kpi-ctrl-mu").textContent = ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 5) : "—";
    $("lemna-kpi-ctrl-td").textContent =
      ctrlRow && ctrlRow.doublingTime !== null ? `Td = ${(ctrlRow.doublingTime / 24).toFixed(2)} days` : "Doubling time";

    const inhRows = analysis.rows.filter((r) => r.inhibition !== null && !r.isControl);
    if (inhRows.length > 0) {
      const maxRow = inhRows.reduce((best, cur) => (cur.inhibition > best.inhibition ? cur : best), inhRows[0]);
      $("lemna-kpi-max-inh").textContent = `${maxRow.inhibition.toFixed(1)}%`;
      $("lemna-kpi-max-inh-conc").textContent = `At ${maxRow.dilution} ${unit}`;
    } else {
      $("lemna-kpi-max-inh").textContent = "—";
      $("lemna-kpi-max-inh-conc").textContent = "Highest observed";
    }

    $("lemna-kpi-ic50-label").textContent = `Est. IC${view.icTarget} (Linear)`;
    const ic50Disp = formatIc50Card(analysis.ic50, unit, view.icTarget);
    $("lemna-kpi-ic50").textContent = ic50Disp.main;
    $("lemna-kpi-ic50-sub").textContent = ic50Disp.sub;
    $("lemna-kpi-count").textContent = analysis.rows.length;

    if (state.activeTab === "lemna") {
      C.renderLemnaCharts(analysis, unit, {
        highlightedConcs: view.selectedConcs,
        filterMode: view.filterMode,
        controlConc,
        showErrorBars: view.showErrorBars,
        logX: view.logX,
        icTarget: view.icTarget,
      });
    }

    const tbl = $("lemna-table-container");
    if (analysis.rows.length === 0) {
      tbl.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted);">No Lemna samples to tabulate yet.</div>`;
    } else {
      const body = analysis.rows
        .map(
          (r) => `
          <tr data-conc-row="${r.dilution}" class="${view.selectedConcs.has(r.dilution) ? "row-highlighted" : ""}" title="Click to highlight in graphs">
            <td>${r.dilution} ${escapeHtml(unit)}${r.isControl ? " ★ Ctrl" : ""}</td>
            <td>${r.tHours}</td>
            <td>${r.n0A} / ${r.ntA}</td>
            <td>${r.n0B !== null ? `${r.n0B} / ${r.ntB}` : "—"}</td>
            <td>${M.formatNum(r.avgN0, 1)}</td>
            <td>${M.formatNum(r.avgNt, 1)}</td>
            <td>${M.formatNum(r.mu, 5)}</td>
            <td class="${formatInhClass(r.inhibition)}">${r.inhibition !== null ? `${M.formatNum(r.inhibition, 2)}%` : "—"}</td>
          </tr>`
        )
        .join("");

      tbl.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Dilution</th>
              <th>t (h)</th>
              <th>Rep A (N₀/Nₜ)</th>
              <th>Rep B (N₀/Nₜ)</th>
              <th>AVG N₀</th>
              <th>AVG Nₜ</th>
              <th>μ (h⁻¹)</th>
              <th>Hemmung (%)</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>`;
    }
  }

  function resetLemnaForm() {
    $("lemna-edit-id").value = "";
    $("lemna-form-title").textContent = "New Lemna Sample";
    $("lemna-submit-btn").textContent = "Add Lemna Sample";
    $("lemna-cancel-edit").hidden = true;
    $("lemna-conc").value = "";
    $("lemna-n0-a").value = "";
    $("lemna-nt-a").value = "";
    $("lemna-n0-b").value = "";
    $("lemna-nt-b").value = "";
  }

  // ==========================================================================
  // TAB 4: DILUTIONS & NOTES
  // ==========================================================================

  function updateDilutionMediumAuto() {
    const total = Number($("dil-total").value);
    const tox = Number($("dil-tox-vol").value);
    if (Number.isFinite(total) && Number.isFinite(tox)) {
      $("dil-med-vol").value = Math.max(0, total - tox).toFixed(4).replace(/\.?0+$/, "");
    } else {
      $("dil-med-vol").value = "";
    }
  }

  function renderDilutionsTab() {
    const exp = getActiveExp();
    if (!exp) return;

    const unit = exp.meta.concUnit || "";
    const sorted = [...exp.dilutions].sort((a, b) => Number(a.concentration) - Number(b.concentration));

    $("dil-list-count").textContent = sorted.length;
    const listEl = $("dil-entries-list");
    if (sorted.length === 0) {
      listEl.innerHTML = `<div class="empty-list">No dilution steps defined.<br/>Add rows above or load the Daphnia 20 mL preset.</div>`;
    } else {
      listEl.innerHTML = sorted
        .map(
          (d) => `
          <div class="entry-item">
            <div class="entry-main">
              <div class="entry-top">
                <span class="entry-conc-tag">${d.concentration} ${escapeHtml(unit)}</span>
                <span class="entry-val">${Number(d.mediumMl).toFixed(3)} + ${Number(d.toxicantMl).toFixed(3)} mL</span>
              </div>
              <div class="entry-sub">${escapeHtml(d.mediumName || "Medium")} / ${escapeHtml(d.toxicantName || "Toxicant")} · Total ${(Number(d.mediumMl) + Number(d.toxicantMl)).toFixed(2)} mL</div>
            </div>
            <div class="entry-actions">
              <button type="button" class="btn btn-xs btn-ghost" data-dil-del="${escapeHtml(d.id)}">✕</button>
            </div>
          </div>`
        )
        .join("");
    }

    const tbl = $("dil-table-container");
    if (sorted.length === 0) {
      tbl.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted);">No pipetting plan yet.</div>`;
    } else {
      const medLabel = sorted[0]?.mediumName || "Medium";
      const toxLabel = sorted[0]?.toxicantName || "Toxicant";
      const body = sorted
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
      tbl.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Concentration</th>
              <th>${escapeHtml(medLabel)} (mL)</th>
              <th>${escapeHtml(toxLabel)} (mL)</th>
              <th>${escapeHtml(toxLabel)} (µL)</th>
              <th>Total (mL)</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>`;
    }

    $("exp-notes-textarea").value = exp.notes || "";

    if (state.activeTab === "dilutions") {
      C.renderDilutionChart(sorted, unit);
    }
  }

  // ==========================================================================
  // MASTER RENDER, TAB SWITCHING & SAVE FILE LOADING
  // ==========================================================================

  function renderAll() {
    renderExperimentHeader();
    if (!getActiveExp()) return;
    renderOdTab();
    renderCellCountTab();
    renderLemnaTab();
    renderDilutionsTab();
  }

  let expandedChartCard = null;

  function resizeChartCardPlot(card) {
    if (!card) return;
    const box = card.querySelector(".chart-box");
    if (box && global.Plotly && box.data) {
      requestAnimationFrame(() => {
        try {
          global.Plotly.Plots.resize(box);
        } catch {
          // ignore if chart empty
        }
      });
    }
  }

  function collapseExpandedChart() {
    if (!expandedChartCard) return;
    const card = expandedChartCard;
    expandedChartCard = null;
    card.classList.remove("is-expanded");
    const btn = card.querySelector(".chart-expand-btn");
    if (btn) {
      btn.textContent = "⤢ Fullsize";
      btn.setAttribute("aria-expanded", "false");
      btn.title = "Expand graph to fullsize";
    }
    $("chart-fullscreen-backdrop").classList.remove("open");
    document.body.style.overflow = "";
    resizeChartCardPlot(card);
  }

  function toggleChartFullsize(card) {
    if (!card) return;
    if (expandedChartCard === card) {
      collapseExpandedChart();
      return;
    }
    if (expandedChartCard) {
      collapseExpandedChart();
    }
    expandedChartCard = card;
    card.classList.add("is-expanded");
    const btn = card.querySelector(".chart-expand-btn");
    if (btn) {
      btn.textContent = "✕ Close";
      btn.setAttribute("aria-expanded", "true");
      btn.title = "Exit fullsize (Esc)";
    }
    $("chart-fullscreen-backdrop").classList.add("open");
    document.body.style.overflow = "hidden";
    resizeChartCardPlot(card);
  }

  function initChartFullsizeButtons() {
    document.querySelectorAll(".chart-card").forEach((card) => {
      if (card.querySelector(".chart-card-bar")) return;
      const bar = document.createElement("div");
      bar.className = "chart-card-bar";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-xs btn-ghost chart-expand-btn";
      btn.textContent = "⤢ Fullsize";
      btn.title = "Expand graph to fullsize";
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => toggleChartFullsize(card));
      bar.appendChild(btn);
      card.insertBefore(bar, card.firstChild);
    });
  }

  function switchTab(tabName) {
    collapseExpandedChart();
    state.activeTab = tabName;
    if (!getActiveExp()) return;

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      const isAct = btn.dataset.tab === tabName;
      btn.classList.toggle("active", isAct);
      btn.setAttribute("aria-selected", String(isAct));
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `panel-${tabName}`);
    });

    persist();

    requestAnimationFrame(() => {
      if (tabName === "od") renderOdTab();
      else if (tabName === "cellcount") renderCellCountTab();
      else if (tabName === "lemna") renderLemnaTab();
      else if (tabName === "dilutions") renderDilutionsTab();
    });
  }

  function openSaveFileFromBlob(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = S.parseSaveFile(reader.result);
        let openedId = null;
        let loadedCount = 0;

        for (const imp of result.experiments) {
          const existingIdx = state.workspace.experiments.findIndex((e) => e.id === imp.id);
          if (existingIdx >= 0) {
            const replace = confirm(
              `"${imp.name}" is already in your workspace.\n\nClick OK to reload/overwrite it from this save file, or Cancel to open it as a separate copy.`
            );
            if (replace) {
              state.workspace.experiments[existingIdx] = imp;
              openedId = imp.id;
            } else {
              imp.id = S.uid("exp");
              imp.name = `${imp.name} (Copy)`;
              state.workspace.experiments.push(imp);
              openedId = imp.id;
            }
          } else {
            state.workspace.experiments.push(imp);
            if (imp.id === result.preferredActiveId || openedId === null) {
              openedId = imp.id;
            }
          }
          loadedCount++;
        }

        if (loadedCount > 0 && openedId) {
          state.workspace.activeExperimentId = openedId;
          state.odSelectedWavelength = null;
          state.odControlConc = null;
          state.ccControlConc = null;
          state.lemnaControlConc = null;
          resetOdForm(false);
          resetCcForm(false);
          resetLemnaForm();
          persist();
          renderAll();
          const active = getActiveExp();
          toast(loadedCount === 1 ? `Opened "${active.name}"` : `Opened ${loadedCount} experiments`);
        }
      } catch (err) {
        alert(`Could not open save file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // ==========================================================================
  // MODALS: EXPERIMENT CRUD & OD BATCH ENTRY
  // ==========================================================================

  function openModal(id) {
    $(id).classList.add("open");
  }

  function closeModal(id) {
    $(id).classList.remove("open");
  }

  function openExperimentModal(mode) {
    const exp = getActiveExp();
    if (mode === "edit" && !exp) return;

    $("exp-modal-mode").value = mode;
    if (mode === "create") {
      $("exp-modal-title").textContent = "Create New Experiment";
      $("exp-modal-submit").textContent = "Create Experiment";
      $("exp-edit-danger-actions").hidden = true;
      $("exp-name-input").value = "";
      $("exp-pollutant-input").value = "";
      $("exp-organism-input").value = "Algae";
      $("exp-unit-input").value = "mg/L";
      $("exp-control-input").value = "0";
      $("exp-wl-input").value = "680";
    } else {
      $("exp-modal-title").textContent = "Experiment Settings";
      $("exp-modal-submit").textContent = "Save Changes";
      $("exp-edit-danger-actions").hidden = false;
      $("exp-name-input").value = exp.name;
      $("exp-pollutant-input").value = exp.meta.pollutant || "";
      $("exp-organism-input").value = exp.meta.organism || "";
      $("exp-unit-input").value = exp.meta.concUnit || "mg/L";
      $("exp-control-input").value = exp.meta.controlConc ?? 0;
      $("exp-wl-input").value = exp.meta.defaultWavelength ?? 680;
    }
    openModal("exp-modal");
    setTimeout(() => $("exp-name-input").focus(), 40);
  }

  function addBatchRow(concVal = "") {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="number" step="any" class="input input-mono batch-conc" value="${escapeHtml(concVal)}" placeholder="0" /></td>
      <td><input type="number" step="any" min="0" class="input input-mono batch-r1" placeholder="OD rep 1" /></td>
      <td><input type="number" step="any" min="0" class="input input-mono batch-r2" placeholder="OD rep 2" /></td>
      <td><input type="number" step="any" min="0" class="input input-mono batch-r3" placeholder="optional" /></td>
      <td><button type="button" class="btn btn-xs btn-ghost batch-rm-row">✕</button></td>
    `;
    tr.querySelector(".batch-rm-row").addEventListener("click", () => tr.remove());
    $("batch-rows-body").appendChild(tr);
  }

  function openBatchModal() {
    const exp = getActiveExp();
    if (!exp) return;

    $("batch-date").value = $("od-date").value || todayIso();
    $("batch-time").value = $("od-time").value || nowTimeHm();
    $("batch-wl").value = $("od-wavelength").value || exp.meta.defaultWavelength || 680;

    const existingConcs = Array.from(new Set(exp.odEntries.map((e) => Number(e.concentration)))).sort((a, b) => a - b);
    const seedConcs = existingConcs.length > 0 ? existingConcs : [0, 0.25, 0.5, 1, 2];

    const tbody = $("batch-rows-body");
    tbody.innerHTML = "";
    seedConcs.forEach((c) => addBatchRow(c));
    openModal("batch-modal");
  }

  // ==========================================================================
  // EVENT LISTENERS
  // ==========================================================================

  function bindEvents() {
    // Tabs
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Theme Toggle
    $("btn-theme-toggle").addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      if (getActiveExp()) switchTab(state.activeTab);
    });

    // Experiment Dropdown
    $("experiment-select").addEventListener("change", (ev) => {
      if (!ev.target.value) return;
      state.workspace.activeExperimentId = ev.target.value;
      state.odSelectedWavelength = null;
      state.odControlConc = null;
      state.ccControlConc = null;
      state.lemnaControlConc = null;
      resetViewSelections();
      resetOdForm(false);
      resetCcForm(false);
      resetLemnaForm();
      persist();
      renderAll();
      toast(`Switched to "${getActiveExp().name}"`);
    });

    // Empty state + Topbar New / Open / Save / Backup buttons
    $("btn-new-exp").addEventListener("click", () => openExperimentModal("create"));
    $("btn-empty-new").addEventListener("click", () => openExperimentModal("create"));
    $("btn-edit-exp").addEventListener("click", () => openExperimentModal("edit"));

    $("btn-open-save").addEventListener("click", () => $("import-file-input").click());
    $("btn-empty-open").addEventListener("click", () => $("import-file-input").click());

    $("import-file-input").addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (file) openSaveFileFromBlob(file);
      ev.target.value = "";
    });

    $("btn-save-exp").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp) return;
      const filename = `${slugify(exp.name)}.json`;
      S.downloadFile(filename, S.serializeExperimentSave(exp), "application/json");
      toast(`Saved "${filename}"`);
    });

    $("btn-export-html").addEventListener("click", async () => {
      const exp = getActiveExp();
      if (!exp) return;
      const btn = $("btn-export-html");
      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Exporting...";
      try {
        const filename = await Ecotox.Exporter.exportExperimentHTML(exp, {
          odControlConc: state.odControlConc,
          ccControlConc: state.ccControlConc,
          lemnaControlConc: state.lemnaControlConc,
          odTStart: $("od-t-start").value,
          odTEnd: $("od-t-end").value,
          ccTStart: $("cc-t-start").value,
          ccTEnd: $("cc-t-end").value,
        });
        toast(`Exported "${filename}"`);
      } catch (err) {
        console.error("HTML export failed:", err);
        alert(`HTML export failed: ${err.message}`);
      } finally {
        btn.disabled = !getActiveExp();
        btn.textContent = prevText;
      }
    });

    $("btn-export-json").addEventListener("click", () => {
      if (state.workspace.experiments.length === 0) return;
      const filename = `ecotox_aid_workspace_${todayIso()}.json`;
      S.downloadFile(filename, JSON.stringify(state.workspace, null, 2), "application/json");
      toast(`Backed up all experiments to ${filename}`);
    });

    // Drag & Drop .json save files anywhere on window
    let dragDepth = 0;
    window.addEventListener("dragenter", (ev) => {
      ev.preventDefault();
      dragDepth++;
      document.body.classList.add("drag-over");
    });
    window.addEventListener("dragover", (ev) => {
      ev.preventDefault();
    });
    window.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) document.body.classList.remove("drag-over");
    });
    window.addEventListener("drop", (ev) => {
      ev.preventDefault();
      dragDepth = 0;
      document.body.classList.remove("drag-over");
      const file = ev.dataTransfer?.files?.[0];
      if (file) openSaveFileFromBlob(file);
    });

    // Experiment Create/Edit Form
    $("exp-modal-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const mode = $("exp-modal-mode").value;
      const payload = {
        name: $("exp-name-input").value.trim(),
        pollutant: $("exp-pollutant-input").value.trim(),
        organism: $("exp-organism-input").value.trim(),
        concUnit: $("exp-unit-input").value.trim() || "mg/L",
        controlConc: Number($("exp-control-input").value) || 0,
        defaultWavelength: Number($("exp-wl-input").value) || 680,
      };
      if (!payload.name) return;

      if (mode === "create") {
        const created = S.createBlankExperiment(payload);
        state.workspace.experiments.push(created);
        state.workspace.activeExperimentId = created.id;
        state.odSelectedWavelength = created.meta.defaultWavelength;
        state.odControlConc = created.meta.controlConc;
        state.ccControlConc = created.meta.controlConc;
        state.lemnaControlConc = created.meta.controlConc;
        resetViewSelections();
        resetOdForm(false);
        resetCcForm(false);
        resetLemnaForm();
        persist();
        renderAll();
        toast(`Created "${created.name}"`);
      } else {
        const exp = getActiveExp();
        if (!exp) return;
        exp.name = payload.name;
        exp.meta = {
          pollutant: payload.pollutant,
          organism: payload.organism,
          concUnit: payload.concUnit,
          controlConc: payload.controlConc,
          defaultWavelength: payload.defaultWavelength,
        };
        persist();
        renderAll();
        toast("Experiment settings updated");
      }
      closeModal("exp-modal");
    });

    $("btn-duplicate-exp").addEventListener("click", () => {
      const cur = getActiveExp();
      if (!cur) return;
      const copy = JSON.parse(JSON.stringify(cur));
      copy.id = S.uid("exp");
      copy.name = `${cur.name} (Copy)`;
      copy.createdAt = new Date().toISOString();
      copy.updatedAt = copy.createdAt;
      state.workspace.experiments.push(copy);
      state.workspace.activeExperimentId = copy.id;
      persist();
      renderAll();
      closeModal("exp-modal");
      toast(`Duplicated "${cur.name}"`);
    });

    $("btn-delete-exp").addEventListener("click", () => {
      const cur = getActiveExp();
      if (!cur) return;
      if (!confirm(`Permanently delete experiment "${cur.name}" from local storage?`)) return;

      state.workspace.experiments = state.workspace.experiments.filter((e) => e.id !== cur.id);
      state.workspace.activeExperimentId =
        state.workspace.experiments.length > 0 ? state.workspace.experiments[0].id : null;
      state.odSelectedWavelength = null;
      state.odControlConc = null;
      state.ccControlConc = null;
      state.lemnaControlConc = null;
      persist();
      renderAll();
      closeModal("exp-modal");
      toast("Experiment deleted");
    });

    // Close modals via close buttons, backdrop, or Escape key
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (ev) => {
        if (ev.target === backdrop) backdrop.classList.remove("open");
      });
    });
    $("chart-fullscreen-backdrop").addEventListener("click", collapseExpandedChart);
    window.addEventListener("resize", () => {
      if (expandedChartCard) resizeChartCardPlot(expandedChartCard);
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        if (expandedChartCard) collapseExpandedChart();
        document.querySelectorAll(".modal-backdrop.open").forEach((m) => m.classList.remove("open"));
      }
    });

    // ---------- OD TAB EVENTS ----------
    $("od-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const exp = getActiveExp();
      if (!exp) return;
      const editId = $("od-edit-id").value;
      const entry = {
        id: editId || S.uid("od"),
        date: $("od-date").value,
        time: $("od-time").value,
        concentration: Number($("od-conc").value),
        value: Number($("od-value").value),
        wavelength: Number($("od-wavelength").value) || 680,
        label: $("od-label").value.trim(),
      };
      if (!entry.date || !entry.time || !Number.isFinite(entry.concentration) || !Number.isFinite(entry.value)) return;

      if (editId) {
        const idx = exp.odEntries.findIndex((e) => e.id === editId);
        if (idx >= 0) exp.odEntries[idx] = entry;
        toast("OD measurement updated");
      } else {
        exp.odEntries.push(entry);
        toast("OD measurement added");
      }
      state.odSelectedWavelength = entry.wavelength;
      resetOdForm(true);
      persist();
      renderExperimentHeader();
      renderOdTab();
      $("od-value").focus();
    });

    $("od-cancel-edit").addEventListener("click", () => {
      resetOdForm(true);
      renderOdEntriesList(getActiveExp());
    });

    $("od-entries-list").addEventListener("click", (ev) => {
      const editBtn = ev.target.closest("[data-od-edit]");
      const delBtn = ev.target.closest("[data-od-del]");
      const exp = getActiveExp();
      if (!exp) return;

      if (editBtn) {
        const item = exp.odEntries.find((e) => e.id === editBtn.dataset.odEdit);
        if (!item) return;
        $("od-edit-id").value = item.id;
        $("od-date").value = item.date;
        $("od-time").value = item.time;
        $("od-conc").value = item.concentration;
        $("od-value").value = item.value;
        $("od-wavelength").value = item.wavelength;
        $("od-label").value = item.label || "";
        $("od-form-title").textContent = "Edit OD Measurement";
        $("od-submit-btn").textContent = "Update Measurement";
        $("od-cancel-edit").hidden = false;
        renderOdEntriesList(exp);
      } else if (delBtn) {
        const id = delBtn.dataset.odDel;
        exp.odEntries = exp.odEntries.filter((e) => e.id !== id);
        if ($("od-edit-id").value === id) resetOdForm(true);
        persist();
        renderExperimentHeader();
        renderOdTab();
        toast("OD entry deleted");
      }
    });

    $("btn-od-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.odEntries.length === 0) return;
      if (!confirm(`Clear all ${exp.odEntries.length} OD entries in "${exp.name}"?`)) return;
      exp.odEntries = [];
      resetOdForm(true);
      persist();
      renderExperimentHeader();
      renderOdTab();
      toast("Cleared OD entries");
    });

    $("od-filter-search").addEventListener("input", () => renderOdEntriesList(getActiveExp()));
    $("od-filter-conc").addEventListener("change", () => renderOdEntriesList(getActiveExp()));
    $("od-ctrl-wavelength").addEventListener("change", (ev) => {
      state.odSelectedWavelength = Number(ev.target.value);
      renderOdTab();
    });
    $("od-ctrl-conc").addEventListener("change", (ev) => {
      state.odControlConc = Number(ev.target.value);
      renderOdTab();
    });
    $("od-t-start").addEventListener("input", () => renderOdTab());
    $("od-t-end").addEventListener("input", () => renderOdTab());

    function bindManipDeck(prefix, tabKey, renderFn) {
      const view = state.views[tabKey];
      const chipsEl = $(`${prefix}-conc-chips`);
      if (chipsEl) {
        chipsEl.addEventListener("click", (ev) => {
          const resetBtn = ev.target.closest("[data-chip-reset]");
          if (resetBtn) {
            view.selectedConcs.clear();
            renderFn();
            return;
          }
          const chip = ev.target.closest("[data-chip-conc]");
          if (chip) toggleConcSelection(tabKey, chip.dataset.chipConc, renderFn);
        });
      }

      const modeEl = $(`${prefix}-filter-mode`);
      if (modeEl) {
        modeEl.addEventListener("click", (ev) => {
          const btn = ev.target.closest("button[data-mode]");
          if (!btn) return;
          view.filterMode = btn.dataset.mode;
          modeEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
          renderFn();
        });
      }

      const sdBtn = $(`${prefix}-toggle-sd`);
      if (sdBtn) {
        sdBtn.addEventListener("click", () => {
          view.showErrorBars = !view.showErrorBars;
          sdBtn.classList.toggle("active", view.showErrorBars);
          sdBtn.setAttribute("aria-pressed", String(view.showErrorBars));
          renderFn();
        });
      }

      const fitBtn = $(`${prefix}-toggle-fit`);
      if (fitBtn) {
        fitBtn.addEventListener("click", () => {
          view.showFitLines = !view.showFitLines;
          fitBtn.classList.toggle("active", view.showFitLines);
          fitBtn.setAttribute("aria-pressed", String(view.showFitLines));
          renderFn();
        });
      }

      const logBtn = $(`${prefix}-toggle-logx`);
      if (logBtn) {
        logBtn.addEventListener("click", () => {
          view.logX = !view.logX;
          logBtn.classList.toggle("active", view.logX);
          logBtn.setAttribute("aria-pressed", String(view.logX));
          renderFn();
        });
      }

      const icSel = $(`${prefix}-ic-target`);
      if (icSel) {
        icSel.addEventListener("change", (ev) => {
          view.icTarget = Number(ev.target.value) || 50;
          renderFn();
        });
      }

      const tableEl = $(`${prefix}-table-container`);
      if (tableEl) {
        tableEl.addEventListener("click", (ev) => {
          const tr = ev.target.closest("tr[data-conc-row]");
          if (tr) toggleConcSelection(tabKey, tr.dataset.concRow, renderFn);
        });
      }
    }

    bindManipDeck("od", "od", renderOdTab);
    bindManipDeck("cc", "cc", renderCellCountTab);
    bindManipDeck("lemna", "lemna", renderLemnaTab);

    $("od-table-tabs").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".subtab-btn");
      if (!btn || !getActiveExp()) return;
      state.odTableTab = btn.dataset.table;
      document.querySelectorAll("#od-table-tabs .subtab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderOdTable(state.lastOdAnalysis, getActiveExp().meta.concUnit || "");
    });

    $("btn-od-export-csv").addEventListener("click", () => {
      const exp = getActiveExp();
      const a = state.lastOdAnalysis;
      if (!exp || !a || a.kinetics.length === 0) return toast("No OD data to export");
      const headers = ["Date", "Time", "Elapsed_Hours", "Concentration", "Mean_OD", "SD_OD", "n", "Interval_Mu_h-1", "Interval_Inhibition_Pct"];
      const rows = a.kinetics.map((r) => [
        r.date,
        r.time,
        r.elapsedHours.toFixed(4),
        r.concentration,
        r.meanVal.toFixed(5),
        r.stdVal.toFixed(6),
        r.n,
        r.intervalMu !== null ? r.intervalMu.toFixed(6) : "",
        r.intervalInhibition !== null ? r.intervalInhibition.toFixed(3) : "",
      ]);
      S.downloadFile(`${slugify(exp.name)}_od_kinetics.csv`, S.toCSV(headers, rows), "text/csv");
      toast("Exported OD kinetics CSV");
    });

    $("btn-od-batch").addEventListener("click", openBatchModal);
    $("btn-batch-add-row").addEventListener("click", () => addBatchRow(""));
    $("batch-modal-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const exp = getActiveExp();
      if (!exp) return;
      const date = $("batch-date").value;
      const time = $("batch-time").value;
      const wavelength = Number($("batch-wl").value) || 680;
      let count = 0;

      document.querySelectorAll("#batch-rows-body tr").forEach((tr) => {
        const concRaw = tr.querySelector(".batch-conc").value;
        if (concRaw === "") return;
        const concentration = Number(concRaw);
        if (!Number.isFinite(concentration)) return;

        [".batch-r1", ".batch-r2", ".batch-r3"].forEach((cls, idx) => {
          const valRaw = tr.querySelector(cls).value;
          if (valRaw === "") return;
          const value = Number(valRaw);
          if (!Number.isFinite(value)) return;
          exp.odEntries.push({
            id: S.uid("od"),
            date,
            time,
            concentration,
            wavelength,
            value,
            label: `Rep ${idx + 1}`,
          });
          count++;
        });
      });

      if (count === 0) return toast("No values entered in batch");
      state.odSelectedWavelength = wavelength;
      persist();
      renderExperimentHeader();
      renderOdTab();
      closeModal("batch-modal");
      toast(`Added ${count} OD measurements`);
    });

    // ---------- CELL COUNT TAB EVENTS ----------
    $("cc-mode-toggle").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-mode]");
      if (!btn) return;
      state.ccInputMode = btn.dataset.mode;
      updateCellCountModeUI();
    });

    ["cc-cells-expr", "cc-squares", "cc-dilution", "cc-chamber-factor", "cc-volume-ul", "cc-direct-val"].forEach((id) => {
      $(id).addEventListener("input", updateCellCountPreview);
      $(id).addEventListener("change", updateCellCountPreview);
    });

    $("cc-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const exp = getActiveExp();
      if (!exp) return;
      const editId = $("cc-edit-id").value;
      const date = $("cc-date").value;
      const time = $("cc-time").value;
      const concentration = Number($("cc-conc").value);
      const sampleId = $("cc-sample-id").value.trim();

      if (!date || !time || !Number.isFinite(concentration)) return;

      let entry;
      if (state.ccInputMode === "chamber") {
        const expr = $("cc-cells-expr").value.trim();
        const cellsCounted = M.parseSumExpression(expr);
        const smallSquares = Number($("cc-squares").value);
        const dilutionFactor = Number($("cc-dilution").value) || 1;
        const chamberFactor = Number($("cc-chamber-factor").value) || 4e6;
        const volumeUl = Number($("cc-volume-ul").value) || 1000;

        if (!Number.isFinite(cellsCounted) || !Number.isFinite(smallSquares) || smallSquares <= 0) {
          toast("Enter valid cell count (e.g. 18+14+19+20) and squares > 0");
          return;
        }
        const { cellsPerMl, totalCells } = M.calculateCellCount({
          cellsCounted,
          smallSquares,
          dilutionFactor,
          volumeUl,
          chamberFactor,
        });
        entry = {
          id: editId || S.uid("cc"),
          date,
          time,
          concentration,
          sampleId,
          inputMode: "chamber",
          cellsCountedExpr: expr,
          cellsCounted,
          smallSquares,
          dilutionFactor,
          chamberFactor,
          volumeUl,
          cellsPerMl,
          totalCells,
        };
      } else {
        const cellsPerMl = Number($("cc-direct-val").value);
        if (!Number.isFinite(cellsPerMl) || cellsPerMl < 0) {
          toast("Enter a valid cell density (cells/mL)");
          return;
        }
        entry = {
          id: editId || S.uid("cc"),
          date,
          time,
          concentration,
          sampleId,
          inputMode: "direct",
          cellsCountedExpr: "",
          cellsCounted: null,
          smallSquares: null,
          dilutionFactor: 1,
          chamberFactor: 4e6,
          volumeUl: 1000,
          cellsPerMl,
          totalCells: cellsPerMl,
        };
      }

      if (editId) {
        const idx = exp.cellCountEntries.findIndex((e) => e.id === editId);
        if (idx >= 0) exp.cellCountEntries[idx] = entry;
        toast("Cell count updated");
      } else {
        exp.cellCountEntries.push(entry);
        toast("Cell count added");
      }

      resetCcForm(true);
      persist();
      renderExperimentHeader();
      renderCellCountTab();
    });

    $("cc-cancel-edit").addEventListener("click", () => {
      resetCcForm(true);
      renderCcEntriesList(getActiveExp());
    });

    $("cc-entries-list").addEventListener("click", (ev) => {
      const editBtn = ev.target.closest("[data-cc-edit]");
      const delBtn = ev.target.closest("[data-cc-del]");
      const exp = getActiveExp();
      if (!exp) return;

      if (editBtn) {
        const item = exp.cellCountEntries.find((e) => e.id === editBtn.dataset.ccEdit);
        if (!item) return;
        $("cc-edit-id").value = item.id;
        $("cc-date").value = item.date;
        $("cc-time").value = item.time;
        $("cc-conc").value = item.concentration;
        $("cc-sample-id").value = item.sampleId || "";
        state.ccInputMode = item.inputMode === "direct" ? "direct" : "chamber";
        updateCellCountModeUI();
        if (state.ccInputMode === "chamber") {
          $("cc-cells-expr").value = item.cellsCountedExpr || String(item.cellsCounted ?? "");
          $("cc-squares").value = item.smallSquares || 64;
          $("cc-dilution").value = item.dilutionFactor || 1;
          $("cc-chamber-factor").value = String(item.chamberFactor || 4000000);
          $("cc-volume-ul").value = item.volumeUl ?? 1000;
        } else {
          $("cc-direct-val").value = item.cellsPerMl;
        }
        $("cc-form-title").textContent = "Edit Cell Count";
        $("cc-submit-btn").textContent = "Update Cell Count";
        $("cc-cancel-edit").hidden = false;
        updateCellCountPreview();
        renderCcEntriesList(exp);
      } else if (delBtn) {
        const id = delBtn.dataset.ccDel;
        exp.cellCountEntries = exp.cellCountEntries.filter((e) => e.id !== id);
        if ($("cc-edit-id").value === id) resetCcForm(true);
        persist();
        renderExperimentHeader();
        renderCellCountTab();
        toast("Cell count deleted");
      }
    });

    $("btn-cc-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.cellCountEntries.length === 0) return;
      if (!confirm(`Clear all ${exp.cellCountEntries.length} cell count entries?`)) return;
      exp.cellCountEntries = [];
      resetCcForm(true);
      persist();
      renderExperimentHeader();
      renderCellCountTab();
      toast("Cleared cell count entries");
    });

    $("cc-filter-search").addEventListener("input", () => renderCcEntriesList(getActiveExp()));
    $("cc-filter-conc").addEventListener("change", () => renderCcEntriesList(getActiveExp()));
    $("cc-ctrl-conc").addEventListener("change", (ev) => {
      state.ccControlConc = Number(ev.target.value);
      renderCellCountTab();
    });
    $("cc-t-start").addEventListener("input", () => renderCellCountTab());
    $("cc-t-end").addEventListener("input", () => renderCellCountTab());

    $("cc-table-tabs").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".subtab-btn");
      if (!btn || !getActiveExp()) return;
      state.ccTableTab = btn.dataset.table;
      document.querySelectorAll("#cc-table-tabs .subtab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderCcTable(state.lastCcAnalysis, getActiveExp().meta.concUnit || "");
    });

    $("inoc-source").addEventListener("change", (ev) => {
      const val = ev.target.value;
      const exp = getActiveExp();
      if (!exp) return;
      if (val === "avg_all" && exp.cellCountEntries.length > 0) {
        const avg = M.mean(exp.cellCountEntries.map((e) => Number(e.cellsPerMl)).filter(Number.isFinite));
        $("inoc-c1").value = Math.round(avg);
      } else if (val !== "custom") {
        const found = exp.cellCountEntries.find((e) => e.id === val);
        if (found) $("inoc-c1").value = Math.round(found.cellsPerMl);
      }
      renderInoculationResult();
    });
    ["inoc-c1", "inoc-c2", "inoc-v2"].forEach((id) => {
      $(id).addEventListener("input", () => {
        if (id === "inoc-c1") $("inoc-source").value = "custom";
        renderInoculationResult();
      });
    });

    $("btn-cc-export-csv").addEventListener("click", () => {
      const exp = getActiveExp();
      const a = state.lastCcAnalysis;
      if (!exp || !a || a.kinetics.length === 0) return toast("No cell count data to export");
      const headers = ["Date", "Time", "Elapsed_Hours", "Concentration", "Mean_Cells_per_mL", "SD", "n", "Interval_Mu_h-1", "Interval_Inhibition_Pct"];
      const rows = a.kinetics.map((r) => [
        r.date,
        r.time,
        r.elapsedHours.toFixed(4),
        r.concentration,
        r.meanVal.toFixed(2),
        r.stdVal.toFixed(2),
        r.n,
        r.intervalMu !== null ? r.intervalMu.toFixed(6) : "",
        r.intervalInhibition !== null ? r.intervalInhibition.toFixed(3) : "",
      ]);
      S.downloadFile(`${slugify(exp.name)}_cell_count_kinetics.csv`, S.toCSV(headers, rows), "text/csv");
      toast("Exported Cell Count CSV");
    });

    // ---------- LEMNA TAB EVENTS ----------
    $("lemna-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const exp = getActiveExp();
      if (!exp) return;
      const editId = $("lemna-edit-id").value;
      const entry = {
        id: editId || S.uid("lm"),
        dilution: Number($("lemna-conc").value),
        tHours: Number($("lemna-hours").value) || 168,
        n0A: Number($("lemna-n0-a").value),
        ntA: Number($("lemna-nt-a").value),
        n0B: $("lemna-n0-b").value !== "" ? Number($("lemna-n0-b").value) : null,
        ntB: $("lemna-nt-b").value !== "" ? Number($("lemna-nt-b").value) : null,
      };
      if (!Number.isFinite(entry.dilution) || !Number.isFinite(entry.n0A) || !Number.isFinite(entry.ntA)) return;

      if (editId) {
        const idx = exp.lemnaEntries.findIndex((e) => e.id === editId);
        if (idx >= 0) exp.lemnaEntries[idx] = entry;
        toast("Lemna sample updated");
      } else {
        exp.lemnaEntries.push(entry);
        toast("Lemna sample added");
      }
      resetLemnaForm();
      persist();
      renderExperimentHeader();
      renderLemnaTab();
    });

    $("lemna-cancel-edit").addEventListener("click", () => {
      resetLemnaForm();
      renderLemnaTab();
    });

    $("lemna-entries-list").addEventListener("click", (ev) => {
      const editBtn = ev.target.closest("[data-lemna-edit]");
      const delBtn = ev.target.closest("[data-lemna-del]");
      const exp = getActiveExp();
      if (!exp) return;

      if (editBtn) {
        const item = exp.lemnaEntries.find((e) => e.id === editBtn.dataset.lemnaEdit);
        if (!item) return;
        $("lemna-edit-id").value = item.id;
        $("lemna-conc").value = item.dilution;
        $("lemna-hours").value = item.tHours;
        $("lemna-n0-a").value = item.n0A;
        $("lemna-nt-a").value = item.ntA;
        $("lemna-n0-b").value = item.n0B ?? "";
        $("lemna-nt-b").value = item.ntB ?? "";
        $("lemna-form-title").textContent = "Edit Lemna Sample";
        $("lemna-submit-btn").textContent = "Update Sample";
        $("lemna-cancel-edit").hidden = false;
        renderLemnaTab();
      } else if (delBtn) {
        const id = delBtn.dataset.lemnaDel;
        exp.lemnaEntries = exp.lemnaEntries.filter((e) => e.id !== id);
        if ($("lemna-edit-id").value === id) resetLemnaForm();
        persist();
        renderExperimentHeader();
        renderLemnaTab();
        toast("Lemna sample deleted");
      }
    });

    $("btn-lemna-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.lemnaEntries.length === 0) return;
      if (!confirm(`Clear all ${exp.lemnaEntries.length} Lemna samples?`)) return;
      exp.lemnaEntries = [];
      resetLemnaForm();
      persist();
      renderExperimentHeader();
      renderLemnaTab();
      toast("Cleared Lemna samples");
    });

    $("lemna-ctrl-conc").addEventListener("change", (ev) => {
      state.lemnaControlConc = Number(ev.target.value);
      renderLemnaTab();
    });

    $("btn-lemna-export-csv").addEventListener("click", () => {
      const exp = getActiveExp();
      const a = state.lastLemnaAnalysis;
      if (!exp || !a || a.rows.length === 0) return toast("No Lemna data to export");
      const headers = ["Dilution", "Is_Control", "t_hours", "a_Day0", "a_Final", "b_Day0", "b_Final", "AVG_Day0", "AVG_Final", "Mu_h-1", "Hemmung_Pct"];
      const rows = a.rows.map((r) => [
        r.dilution,
        r.isControl,
        r.tHours,
        r.n0A,
        r.ntA,
        r.n0B ?? "",
        r.ntB ?? "",
        r.avgN0,
        r.avgNt,
        r.mu !== null ? r.mu.toFixed(6) : "",
        r.inhibition !== null ? r.inhibition.toFixed(3) : "",
      ]);
      S.downloadFile(`${slugify(exp.name)}_lemna.csv`, S.toCSV(headers, rows), "text/csv");
      toast("Exported Lemna CSV");
    });

    // ---------- DILUTIONS & NOTES EVENTS ----------
    $("dil-total").addEventListener("input", updateDilutionMediumAuto);
    $("dil-tox-vol").addEventListener("input", updateDilutionMediumAuto);

    $("dil-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const exp = getActiveExp();
      if (!exp) return;
      const conc = Number($("dil-conc").value);
      const total = Number($("dil-total").value);
      const tox = Number($("dil-tox-vol").value);
      const med = Math.max(0, total - tox);
      if (!Number.isFinite(conc) || !Number.isFinite(total) || !Number.isFinite(tox)) return;

      exp.dilutions.push({
        id: S.uid("dil"),
        concentration: conc,
        mediumMl: med,
        toxicantMl: tox,
        mediumName: $("dil-med-name").value.trim() || "Medium",
        toxicantName: $("dil-tox-name").value.trim() || "Toxicant",
      });
      $("dil-conc").value = "";
      $("dil-tox-vol").value = "";
      $("dil-med-vol").value = "";
      persist();
      renderExperimentHeader();
      renderDilutionsTab();
      toast("Dilution step added");
    });

    $("btn-dil-daphnia").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp) return;
      if (exp.dilutions.length > 0 && !confirm("Replace current dilution table with Daphnia 20 mL preset?")) return;
      exp.dilutions = [
        { id: S.uid("dil"), concentration: 0, mediumMl: 20, toxicantMl: 0, mediumName: "Tap water", toxicantName: "Insecticide" },
        { id: S.uid("dil"), concentration: 0.25, mediumMl: 19.975, toxicantMl: 0.025, mediumName: "Tap water", toxicantName: "Insecticide" },
        { id: S.uid("dil"), concentration: 0.5, mediumMl: 19.95, toxicantMl: 0.05, mediumName: "Tap water", toxicantName: "Insecticide" },
        { id: S.uid("dil"), concentration: 1, mediumMl: 19.9, toxicantMl: 0.1, mediumName: "Tap water", toxicantName: "Insecticide" },
        { id: S.uid("dil"), concentration: 2, mediumMl: 19.8, toxicantMl: 0.2, mediumName: "Tap water", toxicantName: "Insecticide" },
      ];
      persist();
      renderExperimentHeader();
      renderDilutionsTab();
      toast("Loaded Daphnia 20 mL dilution series");
    });

    $("dil-entries-list").addEventListener("click", (ev) => {
      const delBtn = ev.target.closest("[data-dil-del]");
      const exp = getActiveExp();
      if (!delBtn || !exp) return;
      exp.dilutions = exp.dilutions.filter((d) => d.id !== delBtn.dataset.dilDel);
      persist();
      renderExperimentHeader();
      renderDilutionsTab();
    });

    $("btn-dil-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.dilutions.length === 0) return;
      if (!confirm("Clear all dilution steps?")) return;
      exp.dilutions = [];
      persist();
      renderExperimentHeader();
      renderDilutionsTab();
    });

    $("btn-dil-export-csv").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.dilutions.length === 0) return toast("No dilutions to export");
      const sorted = [...exp.dilutions].sort((a, b) => Number(a.concentration) - Number(b.concentration));
      const headers = ["Concentration", "Medium_Name", "Medium_mL", "Toxicant_Name", "Toxicant_mL", "Total_mL"];
      const rows = sorted.map((d) => [
        d.concentration,
        d.mediumName || "Medium",
        d.mediumMl,
        d.toxicantName || "Toxicant",
        d.toxicantMl,
        Number(d.mediumMl) + Number(d.toxicantMl),
      ]);
      S.downloadFile(`${slugify(exp.name)}_dilutions.csv`, S.toCSV(headers, rows), "text/csv");
      toast("Exported Dilutions CSV");
    });

    let notesTimer = null;
    $("exp-notes-textarea").addEventListener("input", (ev) => {
      const exp = getActiveExp();
      if (!exp) return;
      exp.notes = ev.target.value;
      $("notes-save-status").textContent = "Saving...";
      clearTimeout(notesTimer);
      notesTimer = setTimeout(() => {
        persist();
        $("notes-save-status").textContent = "Saved locally";
      }, 300);
    });
  }

  // ---------- Bootstrap ----------
  function init() {
    applyTheme(S.loadTheme());
    state.workspace = S.loadWorkspace();
    state.activeTab = state.workspace.activeTab || "od";

    // Default form timestamps
    const exp = getActiveExp();
    $("od-date").value = todayIso();
    $("od-time").value = nowTimeHm();
    $("od-wavelength").value = exp ? exp.meta.defaultWavelength || 680 : 680;
    $("cc-date").value = todayIso();
    $("cc-time").value = nowTimeHm();

    initChartFullsizeButtons();
    bindEvents();
    updateCellCountModeUI();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
