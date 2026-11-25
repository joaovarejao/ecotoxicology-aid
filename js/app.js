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
  const D = Ecotox.Docs;

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
    daphniaControlConc: null,
    daphniaTimepoint: "48h",
    vibrioControlConc: null,
    vibrioContactMin: null,
    docsTopic: "all",
    docsSearch: "",
    dilChartOpen: false,
    lastOdAnalysis: null,
    lastCcAnalysis: null,
    lastLemnaAnalysis: null,
    lastDaphniaAnalysis: null,
    lastVibrioAnalysis: null,
    views: {
      od: { selectedConcs: new Set(), filterMode: "highlight", showErrorBars: true, showFitLines: false, logX: false, icTarget: 50 },
      cc: { selectedConcs: new Set(), filterMode: "highlight", showErrorBars: true, showFitLines: false, logX: false, icTarget: 50 },
      lemna: { selectedConcs: new Set(), filterMode: "highlight", showErrorBars: true, showFitLines: false, logX: false, icTarget: 50 },
      daphnia: { selectedConcs: new Set(), filterMode: "highlight", useAbbott: true, logX: false, targetPct: 50 },
      vibrio: { selectedConcs: new Set(), filterMode: "highlight", showErrorBars: true, logX: false, targetPct: 50 },
    },
  };

  function resetViewSelections() {
    state.views.od.selectedConcs.clear();
    state.views.cc.selectedConcs.clear();
    state.views.lemna.selectedConcs.clear();
    state.views.daphnia.selectedConcs.clear();
    state.views.vibrio.selectedConcs.clear();
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

  function toast(message, undoFn = null) {
    const stack = $("toast-stack");
    const el = document.createElement("div");
    el.className = "toast";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;
    el.appendChild(msgSpan);

    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      el.style.opacity = "0";
      el.style.transition = "opacity 0.2s";
      setTimeout(() => el.remove(), 220);
    }

    if (typeof undoFn === "function") {
      const undoBtn = document.createElement("button");
      undoBtn.type = "button";
      undoBtn.className = "toast-undo-btn";
      undoBtn.textContent = "Undo";
      undoBtn.addEventListener("click", () => {
        undoFn();
        dismiss();
      });
      el.appendChild(undoBtn);
    }

    stack.appendChild(el);
    setTimeout(dismiss, typeof undoFn === "function" ? 6000 : 2600);
  }

  const armTimers = new WeakMap();

  function disarmButton(btn) {
    if (!btn) return;
    const t = armTimers.get(btn);
    if (t) {
      clearTimeout(t);
      armTimers.delete(btn);
    }
    if (btn.dataset.origLabel) {
      btn.textContent = btn.dataset.origLabel;
      delete btn.dataset.origLabel;
    }
    btn.classList.remove("armed");
    delete btn.dataset.armed;
  }

  function handleArmedClick(btn, confirmLabel, onConfirm) {
    if (!btn || btn.disabled) return;
    if (btn.dataset.armed === "1") {
      disarmButton(btn);
      onConfirm();
      return;
    }
    btn.dataset.origLabel = btn.textContent;
    btn.dataset.armed = "1";
    btn.classList.add("armed");
    btn.textContent = confirmLabel || "Confirm?";
    const timer = setTimeout(() => disarmButton(btn), 4000);
    armTimers.set(btn, timer);
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
      $("badge-daphnia").textContent = "0";
      $("badge-vibrio").textContent = "0";
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
    $("badge-daphnia").textContent = (exp.daphniaEntries || []).length;
    $("badge-vibrio").textContent = (exp.vibrioEntries || []).length;
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
              <button type="button" class="btn btn-xs btn-ghost" data-od-edit="${escapeHtml(e.id)}" title="Edit or remove measurement">Edit</button>
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
    $("od-delete-wrap").hidden = true;
    $("od-delete-wrap").open = false;
    disarmButton($("od-delete-btn"));
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
              <button type="button" class="btn btn-xs btn-ghost" data-cc-edit="${escapeHtml(e.id)}" title="Edit or remove cell count">Edit</button>
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
    $("cc-delete-wrap").hidden = true;
    $("cc-delete-wrap").open = false;
    disarmButton($("cc-delete-btn"));
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
                <div class="entry-sub">A: ${r.n0A}→${r.ntA}${repB} · t=${r.tHours}h${r.notes ? ` · ${escapeHtml(r.notes)}` : ""}</div>
              </div>
              <div class="entry-actions">
                <button type="button" class="btn btn-xs btn-ghost" data-lemna-edit="${escapeHtml(r.id)}" title="Edit or remove sample">Edit</button>
              </div>
            </div>
          `;
        })
        .join("");
    }

    const ctrlRow = analysis.rows.find((r) => r.isControl);
    $("lemna-kpi-ctrl-mu").textContent = ctrlRow && ctrlRow.mu !== null ? M.formatNum(ctrlRow.mu, 5) : "—";
    if (ctrlRow && ctrlRow.doublingTimeDays !== null) {
      const validOk = analysis.validity && analysis.validity.tdOk && analysis.validity.muOk;
      const pill = `<span class="valid-pill ${validOk ? "ok" : "fail"}">${validOk ? "OECD 221 PASS" : "Check Validity"}</span>`;
      $("lemna-kpi-ctrl-td").innerHTML = `Td = ${ctrlRow.doublingTimeDays.toFixed(2)} d (${ctrlRow.muPerDay.toFixed(3)} d⁻¹) ${pill}`;
    } else {
      $("lemna-kpi-ctrl-td").textContent = "Doubling time (valid: Td < 2.5 d, μ ≥ 0.275 d⁻¹)";
    }

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
            <td>${r.muPerDay !== null ? M.formatNum(r.muPerDay, 3) : "—"}</td>
            <td class="${formatInhClass(r.inhibition)}">${r.inhibition !== null ? `${M.formatNum(r.inhibition, 2)}%` : "—"}</td>
            <td>${r.notes ? escapeHtml(r.notes) : "—"}</td>
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
              <th>μ (d⁻¹)</th>
              <th>Hemmung (%)</th>
              <th>Phytotoxicity Notes</th>
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
    $("lemna-delete-wrap").hidden = true;
    $("lemna-delete-wrap").open = false;
    disarmButton($("lemna-delete-btn"));
    $("lemna-conc").value = "";
    $("lemna-n0-a").value = "";
    $("lemna-nt-a").value = "";
    $("lemna-n0-b").value = "";
    $("lemna-nt-b").value = "";
    $("lemna-notes").value = "";
  }

  // ==========================================================================
  // TAB 4: DAPHNIA MAGNA & PROBIT ANALYSIS (OECD 202 / DIN 38412 L30)
  // ==========================================================================

  function renderDaphniaTab() {
    const exp = getActiveExp();
    if (!exp) return;
    if (!Array.isArray(exp.daphniaEntries)) exp.daphniaEntries = [];
    const unit = exp.meta.concUnit || "mg/L";
    const view = state.views.daphnia;

    const uniqueConcs = Array.from(new Set(exp.daphniaEntries.map((e) => Number(e.concentration)).filter(Number.isFinite))).sort((a, b) => a - b);
    const ctrlSel = $("daphnia-ctrl-conc");
    const defaultCtrl = Number(exp.meta.controlConc ?? 0);
    if (state.daphniaControlConc === null || !uniqueConcs.includes(state.daphniaControlConc)) {
      state.daphniaControlConc = uniqueConcs.includes(defaultCtrl) ? defaultCtrl : uniqueConcs[0] ?? defaultCtrl;
    }
    ctrlSel.innerHTML =
      uniqueConcs.length > 0
        ? uniqueConcs.map((c) => `<option value="${c}" ${c === state.daphniaControlConc ? "selected" : ""}>${c}</option>`).join("")
        : `<option value="${defaultCtrl}">${defaultCtrl}</option>`;

    const controlConc = state.daphniaControlConc;
    const analysis = M.analyzeDaphnia(exp.daphniaEntries, {
      controlConc,
      timepoint: state.daphniaTimepoint,
      targetPct: view.targetPct,
      useAbbott: view.useAbbott,
    });
    state.lastDaphniaAnalysis = analysis;

    renderConcChips("daphnia-conc-chips", uniqueConcs, controlConc, unit, view);

    // Entries list
    $("daphnia-list-count").textContent = exp.daphniaEntries.length;
    const listEl = $("daphnia-entries-list");
    const editId = $("daphnia-edit-id").value;
    if (exp.daphniaEntries.length === 0) {
      listEl.innerHTML = `<div class="empty-list">No Daphnia observations yet.<br/>Enter neonate counts (e.g. 20 animals = 4×5) and 24 h / 48 h immobilization above.</div>`;
    } else {
      const sortedEntries = [...exp.daphniaEntries].sort((a, b) => Number(a.concentration) - Number(b.concentration));
      listEl.innerHTML = sortedEntries
        .map((e) => {
          const isCtrl = Number(e.concentration) === controlConc;
          const p24 = e.immob24 !== null && e.immob24 !== "" && e.immob24 !== undefined ? `24h: ${e.immob24}/${e.totalAnimals}` : "24h: —";
          const p48 = e.immob48 !== null && e.immob48 !== "" && e.immob48 !== undefined ? `48h: ${e.immob48}/${e.totalAnimals}` : "48h: —";
          return `
            <div class="entry-item ${e.id === editId ? "editing" : ""}">
              <div class="entry-main">
                <div class="entry-top">
                  <span class="entry-conc-tag ${isCtrl ? "control" : ""}">${e.concentration} ${escapeHtml(unit)}${isCtrl ? " · Ctrl" : ""}</span>
                  <span class="entry-val">N=${e.totalAnimals}</span>
                </div>
                <div class="entry-sub">${p24} · ${p48}${e.notes ? ` · ${escapeHtml(e.notes)}` : ""}</div>
              </div>
              <div class="entry-actions">
                <button type="button" class="btn btn-xs btn-ghost" data-daphnia-edit="${escapeHtml(e.id)}" title="Edit or remove entry">Edit</button>
              </div>
            </div>`;
        })
        .join("");
    }

    // KPI Cards
    $("daphnia-kpi-ec-label").textContent = `Est. EC${view.targetPct} (${state.daphniaTimepoint})`;
    if (analysis.primaryEC) {
      $("daphnia-kpi-ec").textContent = `${analysis.primaryEC.value.toFixed(4)} ${unit}`;
      $("daphnia-kpi-ec-sub").textContent = `${analysis.primaryEC.method} · ${analysis.primaryEC.detail}`;
    } else {
      $("daphnia-kpi-ec").textContent = "—";
      $("daphnia-kpi-ec-sub").textContent = "Need partial responses or 0%→100% bracket";
    }

    if (analysis.probit) {
      $("daphnia-kpi-probit").textContent = `b = ${analysis.probit.slope.toFixed(2)} · R² = ${analysis.probit.r2 !== null ? analysis.probit.r2.toFixed(3) : "—"}`;
      const gmTxt = analysis.geomMeanEC50 ? `Geom. Mean: ${analysis.geomMeanEC50.value.toFixed(4)} ${unit}` : `EC50=${analysis.probit.ec50 ? analysis.probit.ec50.toFixed(4) : "—"} ${unit}`;
      $("daphnia-kpi-probit-sub").textContent = gmTxt;
    } else if (analysis.geomMeanEC50) {
      $("daphnia-kpi-probit").textContent = `${analysis.geomMeanEC50.value.toFixed(4)} ${unit}`;
      $("daphnia-kpi-probit-sub").textContent = `Geom. Mean √(${analysis.geomMeanEC50.a} × ${analysis.geomMeanEC50.b})`;
    } else {
      $("daphnia-kpi-probit").textContent = "—";
      $("daphnia-kpi-probit-sub").textContent = "Y = a + b·ln(C) · √(a·b)";
    }

    const activeCtrlPct = state.daphniaTimepoint === "24h" ? analysis.controlPct24 : analysis.controlPct48;
    if (analysis.validity.okActive !== null) {
      $("daphnia-kpi-valid").innerHTML = `<span class="valid-pill ${analysis.validity.okActive ? "ok" : "fail"}">${analysis.validity.okActive ? "VALID (PASS)" : "INVALID (>10%)"}</span>`;
      $("daphnia-kpi-valid-sub").textContent = `Control (${state.daphniaTimepoint}): ${activeCtrlPct.toFixed(1)}% immob.`;
    } else {
      $("daphnia-kpi-valid").textContent = "—";
      $("daphnia-kpi-valid-sub").textContent = "Add control row to validate";
    }

    $("daphnia-kpi-gd").textContent = analysis.noec !== null ? `NOEC ${analysis.noec} ${unit}` : "—";
    $("daphnia-kpi-gd-sub").textContent = `GD (>90% mobile): ${analysis.gdValue !== null ? analysis.gdValue : "—"} · LOEC: ${analysis.loec !== null ? analysis.loec : "—"}`;

    if (state.activeTab === "daphnia") {
      C.renderDaphniaCharts(analysis, unit, {
        highlightConcs: Array.from(view.selectedConcs),
        isolate: view.filterMode === "isolate",
        logX: view.logX,
      });
    }

    // Table
    const tbl = $("daphnia-table-container");
    if (analysis.rows.length === 0) {
      tbl.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted);">No Daphnia observations to tabulate yet.</div>`;
    } else {
      const body = analysis.rows
        .map(
          (r) => `
          <tr data-conc-row="${r.concentration}" class="${view.selectedConcs.has(r.concentration) ? "row-highlighted" : ""}" title="Click to highlight in graphs">
            <td>${r.concentration} ${escapeHtml(unit)}${r.isControl ? " ★ Ctrl" : ""}</td>
            <td>${r.totalAnimals} (${r.replicates} rep)</td>
            <td>${r.immob24 !== null ? `${r.immob24} (${r.pct24.toFixed(1)}%)` : "—"}</td>
            <td>${r.immob48 !== null ? `${r.immob48} (${r.pct48.toFixed(1)}%)` : "—"}</td>
            <td class="${formatInhClass(r.activePct)}">${r.activePct !== null ? `${r.activePct.toFixed(1)}%` : "—"}</td>
            <td>${r.lnConc !== null ? r.lnConc.toFixed(3) : "—"}</td>
            <td>${r.probit !== null ? r.probit.toFixed(4) : "—"}</td>
            <td>${r.notes ? escapeHtml(r.notes) : "—"}</td>
          </tr>`
        )
        .join("");

      tbl.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Concentration</th>
              <th>Total (N)</th>
              <th>24 h Immob.</th>
              <th>48 h Immob.</th>
              <th>Active ${state.daphniaTimepoint} (%)</th>
              <th>ln(C)</th>
              <th>Probit (Y)</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>`;
    }
  }

  function resetDaphniaForm() {
    $("daphnia-edit-id").value = "";
    $("daphnia-form-title").textContent = "New Daphnia Observation";
    $("daphnia-submit-btn").textContent = "Add Observation";
    $("daphnia-cancel-edit").hidden = true;
    $("daphnia-delete-wrap").hidden = true;
    $("daphnia-delete-wrap").open = false;
    disarmButton($("daphnia-delete-btn"));
    $("daphnia-conc").value = "";
    $("daphnia-immob-24").value = "";
    $("daphnia-immob-48").value = "";
    $("daphnia-notes").value = "";
  }

  // ==========================================================================
  // TAB 5: VIBRIO FISCHERI BIOLUMINESCENCE (DIN EN ISO 11348-2 L52)
  // ==========================================================================

  function renderVibrioTab() {
    const exp = getActiveExp();
    if (!exp) return;
    if (!Array.isArray(exp.vibrioEntries)) exp.vibrioEntries = [];
    const unit = exp.meta.concUnit || "mg/L";
    const view = state.views.vibrio;

    const contactTimes = Array.from(new Set(exp.vibrioEntries.map((e) => Number(e.contactMin) || 30))).sort((a, b) => a - b);
    const contactSel = $("vibrio-filter-contact");
    if (state.vibrioContactMin === null || !contactTimes.includes(state.vibrioContactMin)) {
      state.vibrioContactMin = contactTimes.includes(30) ? 30 : contactTimes[0] ?? 30;
    }
    contactSel.innerHTML =
      contactTimes.length > 0
        ? contactTimes.map((t) => `<option value="${t}" ${t === state.vibrioContactMin ? "selected" : ""}>${t} min</option>`).join("")
        : `<option value="30">30 min</option>`;

    const activeForTime = exp.vibrioEntries.filter((e) => (Number(e.contactMin) || 30) === state.vibrioContactMin);
    const uniqueConcs = Array.from(
      new Set(activeForTime.filter((e) => e.sampleType !== "reference").map((e) => Number(e.concentration)).filter(Number.isFinite))
    ).sort((a, b) => a - b);

    const ctrlSel = $("vibrio-ctrl-conc");
    const defaultCtrl = Number(exp.meta.controlConc ?? 0);
    if (state.vibrioControlConc === null || !uniqueConcs.includes(state.vibrioControlConc)) {
      state.vibrioControlConc = uniqueConcs.includes(defaultCtrl) ? defaultCtrl : uniqueConcs[0] ?? defaultCtrl;
    }
    ctrlSel.innerHTML =
      uniqueConcs.length > 0
        ? uniqueConcs.map((c) => `<option value="${c}" ${c === state.vibrioControlConc ? "selected" : ""}>${c}</option>`).join("")
        : `<option value="${defaultCtrl}">${defaultCtrl}</option>`;

    const controlConc = state.vibrioControlConc;
    const analysis = M.analyzeVibrio(exp.vibrioEntries, {
      controlConc,
      contactMin: state.vibrioContactMin,
      targetPct: view.targetPct,
    });
    state.lastVibrioAnalysis = analysis;

    renderConcChips("vibrio-conc-chips", uniqueConcs, controlConc, unit, view);

    // Entries list
    $("vibrio-list-count").textContent = exp.vibrioEntries.length;
    const listEl = $("vibrio-entries-list");
    const editId = $("vibrio-edit-id").value;
    if (exp.vibrioEntries.length === 0) {
      listEl.innerHTML = `<div class="empty-list">No Vibrio readings yet.<br/>Add 2% NaCl controls (I₀, I₃₀) and sample wells above.</div>`;
    } else {
      const sorted = [...exp.vibrioEntries].sort((a, b) => Number(a.contactMin || 30) - Number(b.contactMin || 30) || Number(a.concentration) - Number(b.concentration));
      listEl.innerHTML = sorted
        .map((e) => {
          const isCtrl = e.sampleType === "control" || (e.sampleType !== "reference" && Number(e.concentration) === controlConc);
          const isRef = e.sampleType === "reference";
          const tag = isRef ? "ZnSO₄ Ref" : `${e.concentration} ${escapeHtml(unit)}${isCtrl ? " · 2% NaCl" : ""}`;
          return `
            <div class="entry-item ${e.id === editId ? "editing" : ""}">
              <div class="entry-main">
                <div class="entry-top">
                  <span class="entry-conc-tag ${isCtrl ? "control" : ""}">${tag}</span>
                  <span class="entry-val">${Number(e.contactMin || 30)} min</span>
                </div>
                <div class="entry-sub">I₀=${e.i0} → Iₜ=${e.it}${e.well ? ` · ${escapeHtml(e.well)}` : ""}</div>
              </div>
              <div class="entry-actions">
                <button type="button" class="btn btn-xs btn-ghost" data-vibrio-edit="${escapeHtml(e.id)}" title="Edit or remove reading">Edit</button>
              </div>
            </div>`;
        })
        .join("");
    }

    // KPI Cards
    if (analysis.fkt !== null) {
      const pill = `<span class="valid-pill ${analysis.fktValid ? "ok" : "fail"}">${analysis.fktValid ? "ISO VALID" : "OUT OF RANGE"}</span>`;
      $("vibrio-kpi-fkt").textContent = analysis.fkt.toFixed(4);
      $("vibrio-kpi-fkt-sub").innerHTML = `Valid 0.6–1.8 ${pill}`;
    } else {
      $("vibrio-kpi-fkt").textContent = "—";
      $("vibrio-kpi-fkt-sub").textContent = "Add 2% NaCl control to compute f_kt";
    }

    const inhRows = analysis.rows.filter((r) => !r.isControl && r.inhibition !== null);
    if (inhRows.length > 0) {
      const maxRow = inhRows.reduce((b, c) => (c.inhibition > b.inhibition ? c : b), inhRows[0]);
      $("vibrio-kpi-max-inh").textContent = `${maxRow.inhibition.toFixed(1)}%`;
      $("vibrio-kpi-max-inh-sub").innerHTML = `At ${maxRow.concentration} ${escapeHtml(unit)} · ${maxRow.toxic ? '<span class="valid-pill fail">TOXIC (&gt;20%)</span>' : '<span class="valid-pill ok">NON-TOXIC</span>'}`;
    } else {
      $("vibrio-kpi-max-inh").textContent = "—";
      $("vibrio-kpi-max-inh-sub").textContent = ">20% = toxic";
    }

    $("vibrio-kpi-ec-label").textContent = `Est. EC${view.targetPct} (Linear)`;
    const ecDisp = formatIc50Card(analysis.ecTarget, unit, view.targetPct);
    $("vibrio-kpi-ec").textContent = ecDisp.main;
    $("vibrio-kpi-ec-sub").textContent = ecDisp.sub;

    const refAvg = analysis.referenceRows.length > 0
      ? M.mean(analysis.referenceRows.map((r) => r.inhibition).filter((v) => v !== null))
      : null;
    $("vibrio-kpi-lid").textContent = analysis.lid !== null ? `${analysis.lid} ${unit}` : "—";
    $("vibrio-kpi-lid-sub").textContent = refAvg !== null ? `ZnSO₄ Ref inh: ${refAvg.toFixed(1)}%` : "Highest conc. ≤20% inh.";

    if (state.activeTab === "vibrio") {
      C.renderVibrioCharts(analysis, unit, {
        highlightConcs: Array.from(view.selectedConcs),
        isolate: view.filterMode === "isolate",
        logX: view.logX,
        showErrorBars: view.showErrorBars,
      });
    }

    // Table
    const tbl = $("vibrio-table-container");
    if (analysis.rows.length === 0 && analysis.referenceRows.length === 0) {
      tbl.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted);">No Vibrio luminescence readings to tabulate yet.</div>`;
    } else {
      const sampleRowsHtml = analysis.rows
        .map(
          (r) => `
          <tr data-conc-row="${r.concentration}" class="${view.selectedConcs.has(r.concentration) ? "row-highlighted" : ""}" title="Click to highlight in graphs">
            <td>${r.concentration} ${escapeHtml(unit)}${r.isControl ? " ★ 2% NaCl Ctrl" : ""}</td>
            <td>${r.n}</td>
            <td>${M.formatNum(r.meanI0, 1)}</td>
            <td>${r.meanIct !== null ? M.formatNum(r.meanIct, 1) : "—"}</td>
            <td>${M.formatNum(r.meanIt, 1)}</td>
            <td class="${formatInhClass(r.inhibition)}">${r.inhibition !== null ? `${r.inhibition.toFixed(2)}%` : "—"}</td>
            <td>${r.isControl ? "Control" : r.toxic ? '<span class="valid-pill fail">Toxic (&gt;20%)</span>' : '<span class="valid-pill ok">≤20%</span>'}</td>
          </tr>`
        )
        .join("");

      const refRowsHtml = analysis.referenceRows
        .map(
          (r) => `
          <tr>
            <td>ZnSO₄·7H₂O Ref (${r.concentration} ${escapeHtml(unit)})</td>
            <td>1</td>
            <td>${M.formatNum(r.i0, 1)}</td>
            <td>${r.ict !== null ? M.formatNum(r.ict, 1) : "—"}</td>
            <td>${M.formatNum(r.it, 1)}</td>
            <td class="${formatInhClass(r.inhibition)}">${r.inhibition !== null ? `${r.inhibition.toFixed(2)}%` : "—"}</td>
            <td>Positive Ref</td>
          </tr>`
        )
        .join("");

      tbl.innerHTML = `
        <table class="sci-table">
          <thead>
            <tr>
              <th>Concentration / Group</th>
              <th>n</th>
              <th>Mean I₀</th>
              <th>Expected Ict (I₀·f_kt)</th>
              <th>Measured It</th>
              <th>Hemmung (%)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${sampleRowsHtml}${refRowsHtml}</tbody>
        </table>`;
    }
  }

  function resetVibrioForm() {
    $("vibrio-edit-id").value = "";
    $("vibrio-form-title").textContent = "New Vibrio Reading";
    $("vibrio-submit-btn").textContent = "Add Luminescence Reading";
    $("vibrio-cancel-edit").hidden = true;
    $("vibrio-delete-wrap").hidden = true;
    $("vibrio-delete-wrap").open = false;
    disarmButton($("vibrio-delete-btn"));
    $("vibrio-type").value = "sample";
    $("vibrio-conc").value = "";
    $("vibrio-well").value = "";
    $("vibrio-i0").value = "";
    $("vibrio-it").value = "";
  }

  // ==========================================================================
  // DOCUMENTATION HUB & PROTOCOL DILUTION PRESETS
  // ==========================================================================

  function renderDocsHub() {
    if (!D || !D.renderDocsList) return;
    D.renderDocsList($("docs-cards-container"), state.docsTopic, state.docsSearch);
  }

  function applyDilutionPreset(presetKey) {
    const exp = getActiveExp();
    if (!exp) return;
    const presets = {
      daphnia: {
        label: "Daphnia 20 mL (0–2)",
        rows: [
          { concentration: 0, mediumMl: 20.0, toxicantMl: 0, mediumName: "ASTM Medium", toxicantName: "Test Stock" },
          { concentration: 0.25, mediumMl: 19.975, toxicantMl: 0.025, mediumName: "ASTM Medium", toxicantName: "Test Stock" },
          { concentration: 0.5, mediumMl: 19.95, toxicantMl: 0.05, mediumName: "ASTM Medium", toxicantName: "Test Stock" },
          { concentration: 1, mediumMl: 19.9, toxicantMl: 0.1, mediumName: "ASTM Medium", toxicantName: "Test Stock" },
          { concentration: 2, mediumMl: 19.8, toxicantMl: 0.2, mediumName: "ASTM Medium", toxicantName: "Test Stock" },
        ],
      },
      algae_geom: {
        label: "Algae Geometric ≤3.2× (ISO 8692)",
        rows: [
          { concentration: 0, mediumMl: 10.0, toxicantMl: 0, mediumName: "BBM", toxicantName: "Stock (10 mg/L)" },
          { concentration: 1.0, mediumMl: 9.0, toxicantMl: 1.0, mediumName: "BBM", toxicantName: "Stock (10 mg/L)" },
          { concentration: 1.8, mediumMl: 8.2, toxicantMl: 1.8, mediumName: "BBM", toxicantName: "Stock (10 mg/L)" },
          { concentration: 3.2, mediumMl: 6.8, toxicantMl: 3.2, mediumName: "BBM", toxicantName: "Stock (10 mg/L)" },
          { concentration: 5.6, mediumMl: 4.4, toxicantMl: 5.6, mediumName: "BBM", toxicantName: "Stock (10 mg/L)" },
          { concentration: 10.0, mediumMl: 0.0, toxicantMl: 10.0, mediumName: "BBM", toxicantName: "Stock (10 mg/L)" },
        ],
      },
      algae_range: {
        label: "Algae Range-Finding (0.01–100)",
        rows: [
          { concentration: 0, mediumMl: 10.0, toxicantMl: 0, mediumName: "BBM", toxicantName: "Stock (100 mg/L)" },
          { concentration: 0.01, mediumMl: 9.999, toxicantMl: 0.001, mediumName: "BBM", toxicantName: "Stock (100 mg/L)" },
          { concentration: 0.1, mediumMl: 9.99, toxicantMl: 0.01, mediumName: "BBM", toxicantName: "Stock (100 mg/L)" },
          { concentration: 1, mediumMl: 9.9, toxicantMl: 0.1, mediumName: "BBM", toxicantName: "Stock (100 mg/L)" },
          { concentration: 10, mediumMl: 9.0, toxicantMl: 1.0, mediumName: "BBM", toxicantName: "Stock (100 mg/L)" },
          { concentration: 100, mediumMl: 0.0, toxicantMl: 10.0, mediumName: "BBM", toxicantName: "Stock (100 mg/L)" },
        ],
      },
      algae_noec: {
        label: "Algae Wastewater NOEC (1:1.25–1:12)",
        rows: [
          { concentration: 0, mediumMl: 10.0, toxicantMl: 0, mediumName: "BBM", toxicantName: "Wastewater" },
          { concentration: 8.33, mediumMl: 9.167, toxicantMl: 0.833, mediumName: "BBM", toxicantName: "Wastewater (1:12)" },
          { concentration: 12.5, mediumMl: 8.75, toxicantMl: 1.25, mediumName: "BBM", toxicantName: "Wastewater (1:8)" },
          { concentration: 16.67, mediumMl: 8.333, toxicantMl: 1.667, mediumName: "BBM", toxicantName: "Wastewater (1:6)" },
          { concentration: 25, mediumMl: 7.5, toxicantMl: 2.5, mediumName: "BBM", toxicantName: "Wastewater (1:4)" },
          { concentration: 33.33, mediumMl: 6.667, toxicantMl: 3.333, mediumName: "BBM", toxicantName: "Wastewater (1:3)" },
          { concentration: 50, mediumMl: 5.0, toxicantMl: 5.0, mediumName: "BBM", toxicantName: "Wastewater (1:2)" },
          { concentration: 80, mediumMl: 2.0, toxicantMl: 8.0, mediumName: "BBM", toxicantName: "Wastewater (1:1.25)" },
        ],
      },
      vibrio_serial: {
        label: "Vibrio 1:2 Serial (2% NaCl)",
        rows: [
          { concentration: 0, mediumMl: 1.0, toxicantMl: 0, mediumName: "2% NaCl", toxicantName: "Salted Sample" },
          { concentration: 6.25, mediumMl: 0.9375, toxicantMl: 0.0625, mediumName: "2% NaCl", toxicantName: "Salted Sample" },
          { concentration: 12.5, mediumMl: 0.875, toxicantMl: 0.125, mediumName: "2% NaCl", toxicantName: "Salted Sample" },
          { concentration: 25, mediumMl: 0.75, toxicantMl: 0.25, mediumName: "2% NaCl", toxicantName: "Salted Sample" },
          { concentration: 50, mediumMl: 0.5, toxicantMl: 0.5, mediumName: "2% NaCl", toxicantName: "Salted Sample" },
          { concentration: 100, mediumMl: 0.0, toxicantMl: 1.0, mediumName: "2% NaCl", toxicantName: "Salted Sample" },
        ],
      },
    };
    const chosen = presets[presetKey] || presets.daphnia;
    const prev = [...exp.dilutions];
    exp.dilutions = chosen.rows.map((r) => ({ id: S.uid("dil"), ...r }));
    resetDilForm();
    persist();
    renderExperimentHeader();
    renderDilutionsTab();
    toast(`Loaded "${chosen.label}" preset`, () => {
      exp.dilutions = prev;
      persist();
      renderExperimentHeader();
      renderDilutionsTab();
    });
  }

  // ==========================================================================
  // TAB 6: DOCS, DILUTIONS & NOTES
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
      const editId = $("dil-edit-id").value;
      listEl.innerHTML = sorted
        .map(
          (d) => `
          <div class="entry-item ${d.id === editId ? "editing" : ""}">
            <div class="entry-main">
              <div class="entry-top">
                <span class="entry-conc-tag">${d.concentration} ${escapeHtml(unit)}</span>
                <span class="entry-val">${Number(d.mediumMl).toFixed(3)} + ${Number(d.toxicantMl).toFixed(3)} mL</span>
              </div>
              <div class="entry-sub">${escapeHtml(d.mediumName || "Medium")} / ${escapeHtml(d.toxicantName || "Toxicant")} · Total ${(Number(d.mediumMl) + Number(d.toxicantMl)).toFixed(2)} mL</div>
            </div>
            <div class="entry-actions">
              <button type="button" class="btn btn-xs btn-ghost" data-dil-edit="${escapeHtml(d.id)}" title="Edit or remove step">Edit</button>
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
      if (state.dilChartOpen) {
        $("dilution-chart-wrap").hidden = false;
        C.renderDilutionChart(sorted, unit);
      }
      renderDocsHub();
    }
  }

  function resetDilForm() {
    $("dil-edit-id").value = "";
    $("dil-form-title").textContent = "Add Dilution Step";
    $("dil-submit-btn").textContent = "Add Dilution Row";
    $("dil-cancel-edit").hidden = true;
    $("dil-delete-wrap").hidden = true;
    $("dil-delete-wrap").open = false;
    disarmButton($("dil-delete-btn"));
    $("dil-conc").value = "";
    $("dil-tox-vol").value = "";
    $("dil-med-vol").value = "";
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
    renderDaphniaTab();
    renderVibrioTab();
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
      else if (tabName === "daphnia") renderDaphniaTab();
      else if (tabName === "vibrio") renderVibrioTab();
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
        state.daphniaControlConc = null;
        state.vibrioControlConc = null;
        state.vibrioContactMin = null;
          resetOdForm(false);
          resetCcForm(false);
          resetLemnaForm();
          resetDaphniaForm();
          resetVibrioForm();
          resetDilForm();
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

  function refreshDangerZoneCounts(exp) {
    if (!exp) return;
    const setBtn = (id, label, count) => {
      const btn = $(id);
      if (!btn) return;
      disarmButton(btn);
      btn.textContent = `${label} (${count})`;
      btn.disabled = count === 0;
    };
    setBtn("btn-od-clear", "Clear OD", exp.odEntries.length);
    setBtn("btn-cc-clear", "Clear Cell Counts", exp.cellCountEntries.length);
    setBtn("btn-lemna-clear", "Clear Lemna", exp.lemnaEntries.length);
    setBtn("btn-daphnia-clear", "Clear Daphnia", (exp.daphniaEntries || []).length);
    setBtn("btn-vibrio-clear", "Clear Vibrio", (exp.vibrioEntries || []).length);
    setBtn("btn-dil-clear", "Clear Dilutions", exp.dilutions.length);
  }

  function openExperimentModal(mode) {
    const exp = getActiveExp();
    if (mode === "edit" && !exp) return;

    $("exp-modal-mode").value = mode;
    const dangerZone = $("exp-danger-zone");
    dangerZone.open = false;
    ["btn-od-clear", "btn-cc-clear", "btn-lemna-clear", "btn-daphnia-clear", "btn-vibrio-clear", "btn-dil-clear", "btn-delete-exp"].forEach((id) => disarmButton($(id)));

    if (mode === "create") {
      $("exp-modal-title").textContent = "Create New Experiment";
      $("exp-modal-submit").textContent = "Create Experiment";
      $("exp-edit-danger-actions").hidden = true;
      dangerZone.hidden = true;
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
      dangerZone.hidden = false;
      $("exp-name-input").value = exp.name;
      $("exp-pollutant-input").value = exp.meta.pollutant || "";
      $("exp-organism-input").value = exp.meta.organism || "";
      $("exp-unit-input").value = exp.meta.concUnit || "mg/L";
      $("exp-control-input").value = exp.meta.controlConc ?? 0;
      $("exp-wl-input").value = exp.meta.defaultWavelength ?? 680;
      refreshDangerZoneCounts(exp);
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
        state.daphniaControlConc = null;
        state.vibrioControlConc = null;
        state.vibrioContactMin = null;
      resetViewSelections();
      resetOdForm(false);
      resetCcForm(false);
      resetLemnaForm();
      resetDaphniaForm();
      resetVibrioForm();
      resetDilForm();
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
        resetDaphniaForm();
        resetVibrioForm();
        resetDilForm();
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
      handleArmedClick($("btn-delete-exp"), "Click again to permanently delete", () => {
        if (!confirm(`Permanently delete experiment "${cur.name}" and all its measurements?`)) return;
        state.workspace.experiments = state.workspace.experiments.filter((e) => e.id !== cur.id);
        state.workspace.activeExperimentId =
          state.workspace.experiments.length > 0 ? state.workspace.experiments[0].id : null;
        state.odSelectedWavelength = null;
        state.odControlConc = null;
        state.ccControlConc = null;
        state.lemnaControlConc = null;
        state.daphniaControlConc = null;
        state.vibrioControlConc = null;
        state.vibrioContactMin = null;
        resetViewSelections();
        resetOdForm(false);
        resetCcForm(false);
        resetLemnaForm();
        resetDaphniaForm();
        resetVibrioForm();
        resetDilForm();
        persist();
        renderAll();
        closeModal("exp-modal");
        toast("Experiment deleted");
      });
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
      const exp = getActiveExp();
      if (!exp || !editBtn) return;

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
      $("od-delete-wrap").hidden = false;
      $("od-delete-wrap").open = false;
      disarmButton($("od-delete-btn"));
      renderOdEntriesList(exp);
    });

    $("od-delete-btn").addEventListener("click", () => {
      const exp = getActiveExp();
      const id = $("od-edit-id").value;
      if (!exp || !id) return;
      handleArmedClick($("od-delete-btn"), "Confirm Delete", () => {
        const idx = exp.odEntries.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const removed = exp.odEntries[idx];
        exp.odEntries.splice(idx, 1);
        resetOdForm(true);
        persist();
        renderExperimentHeader();
        renderOdTab();
        toast("OD entry deleted", () => {
          exp.odEntries.splice(idx, 0, removed);
          persist();
          renderExperimentHeader();
          renderOdTab();
        });
      });
    });

    $("btn-od-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.odEntries.length === 0) return;
      handleArmedClick($("btn-od-clear"), `Confirm Clear OD (${exp.odEntries.length})`, () => {
        const snapshot = [...exp.odEntries];
        exp.odEntries = [];
        resetOdForm(true);
        persist();
        refreshDangerZoneCounts(exp);
        renderExperimentHeader();
        renderOdTab();
        toast(`Cleared ${snapshot.length} OD entries`, () => {
          exp.odEntries = snapshot;
          persist();
          refreshDangerZoneCounts(exp);
          renderExperimentHeader();
          renderOdTab();
        });
      });
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
      const exp = getActiveExp();
      if (!exp || !editBtn) return;

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
      $("cc-delete-wrap").hidden = false;
      $("cc-delete-wrap").open = false;
      disarmButton($("cc-delete-btn"));
      updateCellCountPreview();
      renderCcEntriesList(exp);
    });

    $("cc-delete-btn").addEventListener("click", () => {
      const exp = getActiveExp();
      const id = $("cc-edit-id").value;
      if (!exp || !id) return;
      handleArmedClick($("cc-delete-btn"), "Confirm Delete", () => {
        const idx = exp.cellCountEntries.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const removed = exp.cellCountEntries[idx];
        exp.cellCountEntries.splice(idx, 1);
        resetCcForm(true);
        persist();
        renderExperimentHeader();
        renderCellCountTab();
        toast("Cell count deleted", () => {
          exp.cellCountEntries.splice(idx, 0, removed);
          persist();
          renderExperimentHeader();
          renderCellCountTab();
        });
      });
    });

    $("btn-cc-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.cellCountEntries.length === 0) return;
      handleArmedClick($("btn-cc-clear"), `Confirm Clear (${exp.cellCountEntries.length})`, () => {
        const snapshot = [...exp.cellCountEntries];
        exp.cellCountEntries = [];
        resetCcForm(true);
        persist();
        refreshDangerZoneCounts(exp);
        renderExperimentHeader();
        renderCellCountTab();
        toast(`Cleared ${snapshot.length} cell count entries`, () => {
          exp.cellCountEntries = snapshot;
          persist();
          refreshDangerZoneCounts(exp);
          renderExperimentHeader();
          renderCellCountTab();
        });
      });
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
      const exp = getActiveExp();
      if (!exp || !editBtn) return;

      const item = exp.lemnaEntries.find((e) => e.id === editBtn.dataset.lemnaEdit);
      if (!item) return;
      $("lemna-edit-id").value = item.id;
      $("lemna-conc").value = item.dilution;
      $("lemna-hours").value = item.tHours;
      $("lemna-n0-a").value = item.n0A;
      $("lemna-nt-a").value = item.ntA;
      $("lemna-n0-b").value = item.n0B ?? "";
      $("lemna-nt-b").value = item.ntB ?? "";
      $("lemna-notes").value = item.notes || "";
      $("lemna-form-title").textContent = "Edit Lemna Sample";
      $("lemna-submit-btn").textContent = "Update Sample";
      $("lemna-cancel-edit").hidden = false;
      $("lemna-delete-wrap").hidden = false;
      $("lemna-delete-wrap").open = false;
      disarmButton($("lemna-delete-btn"));
      renderLemnaTab();
    });

    $("lemna-delete-btn").addEventListener("click", () => {
      const exp = getActiveExp();
      const id = $("lemna-edit-id").value;
      if (!exp || !id) return;
      handleArmedClick($("lemna-delete-btn"), "Confirm Delete", () => {
        const idx = exp.lemnaEntries.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const removed = exp.lemnaEntries[idx];
        exp.lemnaEntries.splice(idx, 1);
        resetLemnaForm();
        persist();
        renderExperimentHeader();
        renderLemnaTab();
        toast("Lemna sample deleted", () => {
          exp.lemnaEntries.splice(idx, 0, removed);
          persist();
          renderExperimentHeader();
          renderLemnaTab();
        });
      });
    });

    $("btn-lemna-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.lemnaEntries.length === 0) return;
      handleArmedClick($("btn-lemna-clear"), `Confirm Clear (${exp.lemnaEntries.length})`, () => {
        const snapshot = [...exp.lemnaEntries];
        exp.lemnaEntries = [];
        resetLemnaForm();
        persist();
        refreshDangerZoneCounts(exp);
        renderExperimentHeader();
        renderLemnaTab();
        toast(`Cleared ${snapshot.length} Lemna samples`, () => {
          exp.lemnaEntries = snapshot;
          persist();
          refreshDangerZoneCounts(exp);
          renderExperimentHeader();
          renderLemnaTab();
        });
      });
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
      const editId = $("dil-edit-id").value;
      const conc = Number($("dil-conc").value);
      const total = Number($("dil-total").value);
      const tox = Number($("dil-tox-vol").value);
      const med = Math.max(0, total - tox);
      if (!Number.isFinite(conc) || !Number.isFinite(total) || !Number.isFinite(tox)) return;

      const entry = {
        id: editId || S.uid("dil"),
        concentration: conc,
        mediumMl: med,
        toxicantMl: tox,
        mediumName: $("dil-med-name").value.trim() || "Medium",
        toxicantName: $("dil-tox-name").value.trim() || "Toxicant",
      };
      if (editId) {
        const idx = exp.dilutions.findIndex((d) => d.id === editId);
        if (idx >= 0) exp.dilutions[idx] = entry;
        toast("Dilution step updated");
      } else {
        exp.dilutions.push(entry);
        toast("Dilution step added");
      }
      resetDilForm();
      persist();
      renderExperimentHeader();
      renderDilutionsTab();
    });

    $("dil-cancel-edit").addEventListener("click", () => {
      resetDilForm();
      renderDilutionsTab();
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
      resetDilForm();
      persist();
      renderExperimentHeader();
      renderDilutionsTab();
      toast("Loaded Daphnia 20 mL dilution series");
    });

    $("dil-entries-list").addEventListener("click", (ev) => {
      const editBtn = ev.target.closest("[data-dil-edit]");
      const exp = getActiveExp();
      if (!editBtn || !exp) return;
      const item = exp.dilutions.find((d) => d.id === editBtn.dataset.dilEdit);
      if (!item) return;
      $("dil-edit-id").value = item.id;
      $("dil-conc").value = item.concentration;
      $("dil-total").value = Number((Number(item.mediumMl) + Number(item.toxicantMl)).toFixed(4));
      $("dil-tox-vol").value = item.toxicantMl;
      $("dil-med-vol").value = item.mediumMl;
      $("dil-med-name").value = item.mediumName || "Medium";
      $("dil-tox-name").value = item.toxicantName || "Toxicant";
      $("dil-form-title").textContent = "Edit Dilution Step";
      $("dil-submit-btn").textContent = "Update Dilution Row";
      $("dil-cancel-edit").hidden = false;
      $("dil-delete-wrap").hidden = false;
      $("dil-delete-wrap").open = false;
      disarmButton($("dil-delete-btn"));
      renderDilutionsTab();
    });

    $("dil-delete-btn").addEventListener("click", () => {
      const exp = getActiveExp();
      const id = $("dil-edit-id").value;
      if (!exp || !id) return;
      handleArmedClick($("dil-delete-btn"), "Confirm Delete", () => {
        const idx = exp.dilutions.findIndex((d) => d.id === id);
        if (idx < 0) return;
        const removed = exp.dilutions[idx];
        exp.dilutions.splice(idx, 1);
        resetDilForm();
        persist();
        renderExperimentHeader();
        renderDilutionsTab();
        toast("Dilution step deleted", () => {
          exp.dilutions.splice(idx, 0, removed);
          persist();
          renderExperimentHeader();
          renderDilutionsTab();
        });
      });
    });

    $("btn-dil-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || exp.dilutions.length === 0) return;
      handleArmedClick($("btn-dil-clear"), `Confirm Clear (${exp.dilutions.length})`, () => {
        const snapshot = [...exp.dilutions];
        exp.dilutions = [];
        resetDilForm();
        persist();
        refreshDangerZoneCounts(exp);
        renderExperimentHeader();
        renderDilutionsTab();
        toast(`Cleared ${snapshot.length} dilution steps`, () => {
          exp.dilutions = snapshot;
          persist();
          refreshDangerZoneCounts(exp);
          renderExperimentHeader();
          renderDilutionsTab();
        });
      });
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

    // ---------- Daphnia & Probit Events ----------
    $("daphnia-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const exp = getActiveExp();
      if (!exp) return;
      if (!Array.isArray(exp.daphniaEntries)) exp.daphniaEntries = [];
      const editId = $("daphnia-edit-id").value;
      const conc = Number($("daphnia-conc").value);
      const totalAnimals = Number($("daphnia-total").value);
      const imm24Raw = $("daphnia-immob-24").value.trim();
      const imm48Raw = $("daphnia-immob-48").value.trim();
      if (!Number.isFinite(conc) || !Number.isFinite(totalAnimals) || totalAnimals <= 0) return;
      if (imm24Raw === "" && imm48Raw === "") {
        return toast("Enter at least 24 h or 48 h immobilized count");
      }
      const entry = {
        id: editId || S.uid("daph"),
        concentration: conc,
        totalAnimals,
        immob24: imm24Raw === "" ? null : Math.min(totalAnimals, Math.max(0, Number(imm24Raw))),
        immob48: imm48Raw === "" ? null : Math.min(totalAnimals, Math.max(0, Number(imm48Raw))),
        notes: $("daphnia-notes").value.trim(),
      };
      if (editId) {
        const idx = exp.daphniaEntries.findIndex((e) => e.id === editId);
        if (idx >= 0) exp.daphniaEntries[idx] = entry;
        toast("Daphnia entry updated");
      } else {
        exp.daphniaEntries.push(entry);
        toast("Daphnia observation added");
      }
      resetDaphniaForm();
      persist();
      renderExperimentHeader();
      renderDaphniaTab();
    });

    $("daphnia-cancel-edit").addEventListener("click", () => {
      resetDaphniaForm();
      renderDaphniaTab();
    });

    $("daphnia-entries-list").addEventListener("click", (ev) => {
      const editBtn = ev.target.closest("[data-daphnia-edit]");
      const exp = getActiveExp();
      if (!exp || !editBtn) return;
      const item = (exp.daphniaEntries || []).find((e) => e.id === editBtn.dataset.daphniaEdit);
      if (!item) return;
      $("daphnia-edit-id").value = item.id;
      $("daphnia-conc").value = item.concentration;
      $("daphnia-total").value = item.totalAnimals;
      $("daphnia-immob-24").value = item.immob24 ?? "";
      $("daphnia-immob-48").value = item.immob48 ?? "";
      $("daphnia-notes").value = item.notes || "";
      $("daphnia-form-title").textContent = "Edit Daphnia Observation";
      $("daphnia-submit-btn").textContent = "Update Observation";
      $("daphnia-cancel-edit").hidden = false;
      $("daphnia-delete-wrap").hidden = false;
      $("daphnia-delete-wrap").open = false;
      disarmButton($("daphnia-delete-btn"));
      renderDaphniaTab();
    });

    $("daphnia-delete-btn").addEventListener("click", () => {
      const exp = getActiveExp();
      const id = $("daphnia-edit-id").value;
      if (!exp || !id) return;
      handleArmedClick($("daphnia-delete-btn"), "Confirm Delete", () => {
        const idx = exp.daphniaEntries.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const removed = exp.daphniaEntries[idx];
        exp.daphniaEntries.splice(idx, 1);
        resetDaphniaForm();
        persist();
        renderExperimentHeader();
        renderDaphniaTab();
        toast("Daphnia observation deleted", () => {
          exp.daphniaEntries.splice(idx, 0, removed);
          persist();
          renderExperimentHeader();
          renderDaphniaTab();
        });
      });
    });

    $("btn-daphnia-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || !exp.daphniaEntries || exp.daphniaEntries.length === 0) return;
      handleArmedClick($("btn-daphnia-clear"), `Confirm Clear (${exp.daphniaEntries.length})`, () => {
        const snapshot = [...exp.daphniaEntries];
        exp.daphniaEntries = [];
        resetDaphniaForm();
        persist();
        refreshDangerZoneCounts(exp);
        renderExperimentHeader();
        renderDaphniaTab();
        toast(`Cleared ${snapshot.length} Daphnia entries`, () => {
          exp.daphniaEntries = snapshot;
          persist();
          refreshDangerZoneCounts(exp);
          renderExperimentHeader();
          renderDaphniaTab();
        });
      });
    });

    $("daphnia-ctrl-conc").addEventListener("change", (ev) => {
      state.daphniaControlConc = Number(ev.target.value);
      renderDaphniaTab();
    });
    $("daphnia-timepoint").addEventListener("change", (ev) => {
      state.daphniaTimepoint = ev.target.value === "24h" ? "24h" : "48h";
      renderDaphniaTab();
    });
    $("daphnia-ec-target").addEventListener("change", (ev) => {
      state.views.daphnia.targetPct = Number(ev.target.value) || 50;
      renderDaphniaTab();
    });
    $("daphnia-conc-chips").addEventListener("click", (ev) => {
      const reset = ev.target.closest("[data-chip-reset]");
      if (reset) {
        state.views.daphnia.selectedConcs.clear();
        renderDaphniaTab();
        return;
      }
      const chip = ev.target.closest("[data-chip-conc]");
      if (chip) toggleConcSelection("daphnia", chip.dataset.chipConc, renderDaphniaTab);
    });
    $("daphnia-filter-mode").addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-mode]");
      if (!btn) return;
      state.views.daphnia.filterMode = btn.dataset.mode;
      $("daphnia-filter-mode").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      renderDaphniaTab();
    });
    $("daphnia-toggle-abbott").addEventListener("click", () => {
      state.views.daphnia.useAbbott = !state.views.daphnia.useAbbott;
      $("daphnia-toggle-abbott").classList.toggle("active", state.views.daphnia.useAbbott);
      $("daphnia-toggle-abbott").setAttribute("aria-pressed", String(state.views.daphnia.useAbbott));
      renderDaphniaTab();
    });
    $("daphnia-toggle-logx").addEventListener("click", () => {
      state.views.daphnia.logX = !state.views.daphnia.logX;
      $("daphnia-toggle-logx").classList.toggle("active", state.views.daphnia.logX);
      $("daphnia-toggle-logx").setAttribute("aria-pressed", String(state.views.daphnia.logX));
      renderDaphniaTab();
    });
    $("daphnia-table-container").addEventListener("click", (ev) => {
      const tr = ev.target.closest("tr[data-conc-row]");
      if (tr) toggleConcSelection("daphnia", tr.dataset.concRow, renderDaphniaTab);
    });
    $("btn-daphnia-export-csv").addEventListener("click", () => {
      const exp = getActiveExp();
      const a = state.lastDaphniaAnalysis;
      if (!exp || !a || a.rows.length === 0) return toast("No Daphnia data to export");
      const headers = ["Concentration", "Is_Control", "Total_N", "Replicates", "Immob_24h", "Pct_24h", "Immob_48h", "Pct_48h", "Active_Pct", "ln_C", "Probit_Y", "Notes"];
      const rows = a.rows.map((r) => [
        r.concentration, r.isControl, r.totalAnimals, r.replicates,
        r.immob24 ?? "", r.pct24 !== null ? r.pct24.toFixed(2) : "",
        r.immob48 ?? "", r.pct48 !== null ? r.pct48.toFixed(2) : "",
        r.activePct !== null ? r.activePct.toFixed(2) : "",
        r.lnConc !== null ? r.lnConc.toFixed(4) : "",
        r.probit !== null ? r.probit.toFixed(4) : "",
        r.notes || "",
      ]);
      S.downloadFile(`${slugify(exp.name)}_daphnia_probit.csv`, S.toCSV(headers, rows), "text/csv");
      toast("Exported Daphnia & Probit CSV");
    });

    // ---------- Vibrio fischeri Events ----------
    $("vibrio-type").addEventListener("change", (ev) => {
      if (ev.target.value === "control" && $("vibrio-conc").value === "") {
        $("vibrio-conc").value = "0";
      } else if (ev.target.value === "reference" && $("vibrio-conc").value === "") {
        $("vibrio-conc").value = "219.8";
      }
    });

    $("vibrio-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const exp = getActiveExp();
      if (!exp) return;
      if (!Array.isArray(exp.vibrioEntries)) exp.vibrioEntries = [];
      const editId = $("vibrio-edit-id").value;
      const sampleType = $("vibrio-type").value || "sample";
      const contactMin = Number($("vibrio-contact").value) || 30;
      const conc = Number($("vibrio-conc").value);
      const i0 = Number($("vibrio-i0").value);
      const it = Number($("vibrio-it").value);
      if (!Number.isFinite(conc) || !Number.isFinite(i0) || i0 <= 0 || !Number.isFinite(it) || it < 0) return;

      const entry = {
        id: editId || S.uid("vib"),
        sampleType,
        contactMin,
        concentration: conc,
        well: $("vibrio-well").value.trim(),
        i0,
        it,
      };
      if (editId) {
        const idx = exp.vibrioEntries.findIndex((e) => e.id === editId);
        if (idx >= 0) exp.vibrioEntries[idx] = entry;
        toast("Vibrio reading updated");
      } else {
        exp.vibrioEntries.push(entry);
        toast("Vibrio reading added");
      }
      state.vibrioContactMin = contactMin;
      resetVibrioForm();
      persist();
      renderExperimentHeader();
      renderVibrioTab();
    });

    $("vibrio-cancel-edit").addEventListener("click", () => {
      resetVibrioForm();
      renderVibrioTab();
    });

    $("vibrio-entries-list").addEventListener("click", (ev) => {
      const editBtn = ev.target.closest("[data-vibrio-edit]");
      const exp = getActiveExp();
      if (!exp || !editBtn) return;
      const item = (exp.vibrioEntries || []).find((e) => e.id === editBtn.dataset.vibrioEdit);
      if (!item) return;
      $("vibrio-edit-id").value = item.id;
      $("vibrio-type").value = item.sampleType || "sample";
      $("vibrio-contact").value = String(item.contactMin || 30);
      $("vibrio-conc").value = item.concentration;
      $("vibrio-well").value = item.well || "";
      $("vibrio-i0").value = item.i0;
      $("vibrio-it").value = item.it;
      $("vibrio-form-title").textContent = "Edit Vibrio Reading";
      $("vibrio-submit-btn").textContent = "Update Reading";
      $("vibrio-cancel-edit").hidden = false;
      $("vibrio-delete-wrap").hidden = false;
      $("vibrio-delete-wrap").open = false;
      disarmButton($("vibrio-delete-btn"));
      renderVibrioTab();
    });

    $("vibrio-delete-btn").addEventListener("click", () => {
      const exp = getActiveExp();
      const id = $("vibrio-edit-id").value;
      if (!exp || !id) return;
      handleArmedClick($("vibrio-delete-btn"), "Confirm Delete", () => {
        const idx = exp.vibrioEntries.findIndex((e) => e.id === id);
        if (idx < 0) return;
        const removed = exp.vibrioEntries[idx];
        exp.vibrioEntries.splice(idx, 1);
        resetVibrioForm();
        persist();
        renderExperimentHeader();
        renderVibrioTab();
        toast("Vibrio reading deleted", () => {
          exp.vibrioEntries.splice(idx, 0, removed);
          persist();
          renderExperimentHeader();
          renderVibrioTab();
        });
      });
    });

    $("btn-vibrio-clear").addEventListener("click", () => {
      const exp = getActiveExp();
      if (!exp || !exp.vibrioEntries || exp.vibrioEntries.length === 0) return;
      handleArmedClick($("btn-vibrio-clear"), `Confirm Clear (${exp.vibrioEntries.length})`, () => {
        const snapshot = [...exp.vibrioEntries];
        exp.vibrioEntries = [];
        resetVibrioForm();
        persist();
        refreshDangerZoneCounts(exp);
        renderExperimentHeader();
        renderVibrioTab();
        toast(`Cleared ${snapshot.length} Vibrio readings`, () => {
          exp.vibrioEntries = snapshot;
          persist();
          refreshDangerZoneCounts(exp);
          renderExperimentHeader();
          renderVibrioTab();
        });
      });
    });

    $("vibrio-filter-contact").addEventListener("change", (ev) => {
      state.vibrioContactMin = Number(ev.target.value) || 30;
      renderVibrioTab();
    });
    $("vibrio-ctrl-conc").addEventListener("change", (ev) => {
      state.vibrioControlConc = Number(ev.target.value);
      renderVibrioTab();
    });
    $("vibrio-ec-target").addEventListener("change", (ev) => {
      state.views.vibrio.targetPct = Number(ev.target.value) || 50;
      renderVibrioTab();
    });
    $("vibrio-conc-chips").addEventListener("click", (ev) => {
      const reset = ev.target.closest("[data-chip-reset]");
      if (reset) {
        state.views.vibrio.selectedConcs.clear();
        renderVibrioTab();
        return;
      }
      const chip = ev.target.closest("[data-chip-conc]");
      if (chip) toggleConcSelection("vibrio", chip.dataset.chipConc, renderVibrioTab);
    });
    $("vibrio-filter-mode").addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-mode]");
      if (!btn) return;
      state.views.vibrio.filterMode = btn.dataset.mode;
      $("vibrio-filter-mode").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      renderVibrioTab();
    });
    $("vibrio-toggle-sd").addEventListener("click", () => {
      state.views.vibrio.showErrorBars = !state.views.vibrio.showErrorBars;
      $("vibrio-toggle-sd").classList.toggle("active", state.views.vibrio.showErrorBars);
      $("vibrio-toggle-sd").setAttribute("aria-pressed", String(state.views.vibrio.showErrorBars));
      renderVibrioTab();
    });
    $("vibrio-toggle-logx").addEventListener("click", () => {
      state.views.vibrio.logX = !state.views.vibrio.logX;
      $("vibrio-toggle-logx").classList.toggle("active", state.views.vibrio.logX);
      $("vibrio-toggle-logx").setAttribute("aria-pressed", String(state.views.vibrio.logX));
      renderVibrioTab();
    });
    $("vibrio-table-container").addEventListener("click", (ev) => {
      const tr = ev.target.closest("tr[data-conc-row]");
      if (tr) toggleConcSelection("vibrio", tr.dataset.concRow, renderVibrioTab);
    });
    $("btn-vibrio-export-csv").addEventListener("click", () => {
      const exp = getActiveExp();
      const a = state.lastVibrioAnalysis;
      if (!exp || !a || a.rows.length === 0) return toast("No Vibrio data to export");
      const headers = ["Concentration", "Is_Control", "n", "Mean_I0", "f_kt", "Expected_Ict", "Mean_It", "Inhibition_Pct", "Toxic_Over_20Pct"];
      const rows = a.rows.map((r) => [
        r.concentration, r.isControl, r.n,
        M.formatNum(r.meanI0, 2),
        a.fkt !== null ? a.fkt.toFixed(5) : "",
        r.meanIct !== null ? M.formatNum(r.meanIct, 2) : "",
        r.meanIt !== null ? M.formatNum(r.meanIt, 2) : "",
        r.inhibition !== null ? r.inhibition.toFixed(2) : "",
        r.toxic,
      ]);
      S.downloadFile(`${slugify(exp.name)}_vibrio_${state.vibrioContactMin}min.csv`, S.toCSV(headers, rows), "text/csv");
      toast("Exported Vibrio Bioluminescence CSV");
    });

    // ---------- Documentation Hub, Notes Timestamp & Dilution Chart Toggle ----------
    $("btn-notes-timestamp").addEventListener("click", () => {
      const exp = getActiveExp();
      const ta = $("exp-notes-textarea");
      if (!exp || !ta) return;
      const stamp = `[${todayIso()} ${nowTimeHm()}] `;
      ta.value = ta.value ? `${ta.value.trimEnd()}\n${stamp}` : stamp;
      exp.notes = ta.value;
      persist();
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
      $("notes-save-status").textContent = "Saved locally";
    });

    $("btn-dil-toggle-chart").addEventListener("click", () => {
      state.dilChartOpen = !state.dilChartOpen;
      const wrap = $("dilution-chart-wrap");
      wrap.hidden = !state.dilChartOpen;
      if (state.dilChartOpen) {
        const exp = getActiveExp();
        if (exp) {
          const sorted = [...exp.dilutions].sort((a, b) => Number(a.concentration) - Number(b.concentration));
          C.renderDilutionChart(sorted, exp.meta.concUnit || "mg/L");
        }
      }
    });

    $("docs-topic-pills").addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-doc-topic]");
      if (!btn) return;
      state.docsTopic = btn.dataset.docTopic;
      $("docs-topic-pills").querySelectorAll("[data-doc-topic]").forEach((b) => b.classList.toggle("active", b === btn));
      renderDocsHub();
    });

    $("docs-search-input").addEventListener("input", (ev) => {
      state.docsSearch = ev.target.value;
      renderDocsHub();
    });

    $("docs-cards-container").addEventListener("click", (ev) => {
      const gotoBtn = ev.target.closest("[data-doc-goto]");
      if (gotoBtn) {
        switchTab(gotoBtn.dataset.docGoto);
        return;
      }
      const presetBtn = ev.target.closest("[data-doc-preset]");
      if (presetBtn) {
        $("dil-preset-select").value = presetBtn.dataset.docPreset;
        applyDilutionPreset(presetBtn.dataset.docPreset);
        return;
      }
      const noteBtn = ev.target.closest("[data-doc-note]");
      if (noteBtn && D && D.getChecklistForId) {
        const exp = getActiveExp();
        const ta = $("exp-notes-textarea");
        const checklist = D.getChecklistForId(noteBtn.dataset.docNote);
        if (exp && ta && checklist) {
          ta.value = ta.value ? `${ta.value.trimEnd()}\n\n${checklist}\n` : `${checklist}\n`;
          exp.notes = ta.value;
          persist();
          $("notes-save-status").textContent = "Saved locally";
          toast("Protocol checklist appended to Lab Notes");
          ta.scrollTop = ta.scrollHeight;
        }
      }
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
