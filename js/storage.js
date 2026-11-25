/**
 * Ecotoxicology Aid — Local Storage & Save File Management
 * Starts empty with no hardcoded seed data.
 * Persists open experiments and the last active experiment/tab locally in localStorage,
 * and reads/writes portable .json save files (plus File System Access handles for auto-save).
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});
  const STORAGE_KEY = "ecotox_aid_workspace_v2";
  const THEME_KEY = "ecotox_aid_theme_v1";
  const SAVE_FORMAT = "ecotox-aid-save";
  const HANDLE_DB_NAME = "ecotox_aid_handles_v1";
  const HANDLE_STORE_NAME = "handles";

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createEmptyWorkspace() {
    return {
      version: 2,
      activeExperimentId: null,
      activeTab: "od",
      experiments: [],
    };
  }

  function createBlankExperiment({
    name,
    pollutant = "",
    organism = "Algae",
    concUnit = "mg/L",
    controlConc = 0,
    defaultWavelength = 680,
  }) {
    const now = new Date().toISOString();
    return {
      id: uid("exp"),
      name: (name || "Untitled Experiment").trim(),
      createdAt: now,
      updatedAt: now,
      meta: {
        pollutant: pollutant.trim(),
        organism: organism.trim(),
        concUnit: concUnit.trim() || "mg/L",
        controlConc: Number.isFinite(Number(controlConc)) ? Number(controlConc) : 0,
        defaultWavelength: Number.isFinite(Number(defaultWavelength)) ? Number(defaultWavelength) : 680,
      },
      odEntries: [],
      cellCountEntries: [],
      lemnaEntries: [],
      daphniaEntries: [],
      vibrioEntries: [],
      dilutions: [],
      notes: "",
      chartSettings: {
        variableStyles: {},
        perChartStyles: {},
      },
    };
  }

  function normalizeExperiment(exp) {
    return {
      id: exp.id || uid("exp"),
      name: exp.name || "Untitled Experiment",
      createdAt: exp.createdAt || new Date().toISOString(),
      updatedAt: exp.updatedAt || new Date().toISOString(),
      meta: {
        pollutant: exp.meta?.pollutant ?? "",
        organism: exp.meta?.organism ?? "",
        concUnit: exp.meta?.concUnit ?? "mg/L",
        controlConc: Number.isFinite(Number(exp.meta?.controlConc)) ? Number(exp.meta.controlConc) : 0,
        defaultWavelength: Number.isFinite(Number(exp.meta?.defaultWavelength)) ? Number(exp.meta.defaultWavelength) : 680,
      },
      odEntries: Array.isArray(exp.odEntries) ? exp.odEntries : [],
      cellCountEntries: Array.isArray(exp.cellCountEntries) ? exp.cellCountEntries : [],
      lemnaEntries: Array.isArray(exp.lemnaEntries) ? exp.lemnaEntries : [],
      daphniaEntries: Array.isArray(exp.daphniaEntries) ? exp.daphniaEntries : [],
      vibrioEntries: Array.isArray(exp.vibrioEntries) ? exp.vibrioEntries : [],
      dilutions: Array.isArray(exp.dilutions) ? exp.dilutions : [],
      notes: typeof exp.notes === "string" ? exp.notes : "",
      chartSettings: {
        variableStyles:
          exp.chartSettings && typeof exp.chartSettings.variableStyles === "object"
            ? exp.chartSettings.variableStyles
            : {},
        perChartStyles:
          exp.chartSettings && typeof exp.chartSettings.perChartStyles === "object"
            ? exp.chartSettings.perChartStyles
            : {},
      },
    };
  }

  /**
   * Loads workspace from localStorage.
   * Starts completely empty if no prior session exists; otherwise automatically restores
   * the last open experiment (activeExperimentId) and tab (activeTab).
   */
  function loadWorkspace() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.experiments)) {
          const experiments = parsed.experiments.map(normalizeExperiment);
          let activeExperimentId = parsed.activeExperimentId || null;
          if (experiments.length === 0) {
            activeExperimentId = null;
          } else if (!experiments.some((e) => e.id === activeExperimentId)) {
            activeExperimentId = experiments[0].id;
          }
          const validTabs = ["od", "cellcount", "lemna", "daphnia", "vibrio", "dilutions"];
          const activeTab = validTabs.includes(parsed.activeTab) ? parsed.activeTab : "od";
          return {
            version: 2,
            activeExperimentId,
            activeTab,
            experiments,
          };
        }
      }
    } catch (err) {
      console.error("Failed to read workspace from localStorage:", err);
    }

    return createEmptyWorkspace();
  }

  function saveWorkspace(workspace) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      return true;
    } catch (err) {
      console.error("Failed to persist workspace to localStorage:", err);
      return false;
    }
  }

  /**
   * Wraps a single experiment into the recognized Ecotoxicology Aid save-file envelope.
   */
  function serializeExperimentSave(experiment) {
    return JSON.stringify(
      {
        format: SAVE_FORMAT,
        version: 1,
        savedAt: new Date().toISOString(),
        experiment: normalizeExperiment(experiment),
      },
      null,
      2
    );
  }

  /**
   * Parses any recognized local save file:
   * 1) { format: "ecotox-aid-save", experiment: {...} }
   * 2) { experiments: [...], activeExperimentId? } (workspace backup)
   * 3) Raw experiment object { name, odEntries/cellCountEntries/lemnaEntries }
   */
  function parseSaveFile(rawText) {
    let jsonText = String(rawText || "").trim();
    const embeddedMatch = jsonText.match(/<script[^>]*id=["']ecotox-save-data["'][^>]*>([\s\S]*?)<\/script>/i);
    if (embeddedMatch) {
      jsonText = embeddedMatch[1].replace(/<\\\/script/gi, "</script").trim();
    }
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Save file does not contain a valid JSON object.");
    }

    if (parsed.format === SAVE_FORMAT && parsed.experiment && typeof parsed.experiment === "object") {
      const exp = normalizeExperiment(parsed.experiment);
      return {
        type: "experiment",
        experiments: [exp],
        preferredActiveId: exp.id,
      };
    }

    if (Array.isArray(parsed.experiments)) {
      const experiments = parsed.experiments.map(normalizeExperiment);
      if (experiments.length === 0) {
        throw new Error("Workspace save file contains no experiments.");
      }
      return {
        type: "workspace",
        experiments,
        preferredActiveId: parsed.activeExperimentId || experiments[0].id,
      };
    }

    if (
      typeof parsed.name === "string" &&
      (Array.isArray(parsed.odEntries) ||
        Array.isArray(parsed.cellCountEntries) ||
        Array.isArray(parsed.lemnaEntries) ||
        Array.isArray(parsed.daphniaEntries) ||
        Array.isArray(parsed.vibrioEntries) ||
        Array.isArray(parsed.dilutions))
    ) {
      const exp = normalizeExperiment(parsed);
      return {
        type: "experiment",
        experiments: [exp],
        preferredActiveId: exp.id,
      };
    }

    throw new Error("Unrecognized Ecotoxicology Aid save file format.");
  }

  function loadTheme() {
    try {
      return global.localStorage.getItem(THEME_KEY) || "light";
    } catch {
      return "light";
    }
  }

  function saveTheme(theme) {
    try {
      global.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCSV(headers, rows) {
    const escapeCell = (val) => {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [headers.map(escapeCell).join(",")];
    for (const row of rows) {
      lines.push(row.map(escapeCell).join(","));
    }
    return lines.join("\n");
  }

  // ---------- File System Access API & IndexedDB File Handle Persistence ----------

  function supportsFileHandles() {
    return (
      typeof global.showOpenFilePicker === "function" &&
      typeof global.showSaveFilePicker === "function" &&
      global.isSecureContext !== false
    );
  }

  function openHandlesDb() {
    return new Promise((resolve, reject) => {
      if (typeof global.indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = global.indexedDB.open(HANDLE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
          db.createObjectStore(HANDLE_STORE_NAME, { keyPath: "expId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Failed to open handles DB"));
    });
  }

  async function saveFileHandleRecord(expId, record) {
    if (!expId) return false;
    try {
      const db = await openHandlesDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
        tx.objectStore(HANDLE_STORE_NAME).put({
          expId,
          handle: record.handle || null,
          fileName: record.fileName || (record.handle && record.handle.name) || "",
          formatType: record.formatType === "workspace" ? "workspace" : "experiment",
          autoSave: record.autoSave !== false,
          updatedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      });
    } catch {
      return false;
    }
  }

  async function loadFileHandleRecord(expId) {
    if (!expId) return null;
    try {
      const db = await openHandlesDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
        const req = tx.objectStore(HANDLE_STORE_NAME).get(expId);
        req.onsuccess = () => {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      });
    } catch {
      return null;
    }
  }

  async function deleteFileHandleRecord(expId) {
    if (!expId) return false;
    try {
      const db = await openHandlesDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
        tx.objectStore(HANDLE_STORE_NAME).delete(expId);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      });
    } catch {
      return false;
    }
  }

  async function queryHandlePermission(handle, mode = "readwrite") {
    if (!handle) return "denied";
    try {
      if (typeof handle.queryPermission === "function") {
        return await handle.queryPermission({ mode });
      }
      return "granted";
    } catch {
      return "denied";
    }
  }

  async function requestHandlePermission(handle, mode = "readwrite") {
    if (!handle) return "denied";
    try {
      if (typeof handle.requestPermission === "function") {
        return await handle.requestPermission({ mode });
      }
      return "granted";
    } catch {
      return "denied";
    }
  }

  async function writeContentToHandle(handle, content) {
    if (!handle || typeof handle.createWritable !== "function") {
      throw new Error("File handle does not support writing.");
    }
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
      await writable.close();
    } catch (err) {
      try {
        await writable.abort();
      } catch {
        // ignore abort error
      }
      throw err;
    }
  }

  Ecotox.Storage = {
    SAVE_FORMAT,
    uid,
    createEmptyWorkspace,
    createBlankExperiment,
    normalizeExperiment,
    loadWorkspace,
    saveWorkspace,
    serializeExperimentSave,
    parseSaveFile,
    loadTheme,
    saveTheme,
    downloadFile,
    toCSV,
    supportsFileHandles,
    saveFileHandleRecord,
    loadFileHandleRecord,
    deleteFileHandleRecord,
    queryHandlePermission,
    requestHandlePermission,
    writeContentToHandle,
  };
})(typeof window !== "undefined" ? window : globalThis);
