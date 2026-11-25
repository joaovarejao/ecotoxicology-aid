/**
 * Ecotoxicology Aid — Scientific Calculations Module
 * Implements exact parity with calculations.ipynb:
 * - OD & Cell Count time-series kinetics (mean, sample SD, linear regression mu, stepwise mu, inhibition %)
 * - Thoma / Neubauer chamber cell counting & Vorkultur inoculation dilution
 * - Lemna minor frond assay (AVG, mu, Hemmung %)
 * - Linear IC50 estimation & dilution series calculations
 */
(function (global) {
  "use strict";

  const Ecotox = (global.Ecotox = global.Ecotox || {});

  /**
   * Safely evaluates a simple addition expression of non-negative numbers (e.g., "18+14+19+20" -> 71).
   * Returns NaN if invalid.
   */
  function parseSumExpression(input) {
    if (typeof input === "number") return Number.isFinite(input) ? input : NaN;
    const str = String(input || "").trim();
    if (!str) return NaN;
    // Allow only digits, decimal points/commas, plus signs, and whitespace
    const normalized = str.replace(/,/g, ".");
    if (!/^[0-9.\s+]+$/.test(normalized)) return NaN;
    const parts = normalized.split("+").map((p) => p.trim()).filter((p) => p !== "");
    if (parts.length === 0) return NaN;
    let sum = 0;
    for (const part of parts) {
      const val = Number(part);
      if (!Number.isFinite(val) || val < 0) return NaN;
      sum += val;
    }
    return sum;
  }

  /**
   * Parses date ("YYYY-MM-DD" or "DD.MM.YY" or "DD.MM.YYYY") and time ("HH:MM" or "HH:MM:SS")
   * into a local timestamp in milliseconds.
   */
  function parseTimestampMs(dateStr, timeStr) {
    if (!dateStr) return NaN;
    let year, month, day;
    const cleanDate = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      const [y, m, d] = cleanDate.split("-").map(Number);
      year = y;
      month = m;
      day = d;
    } else if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(cleanDate)) {
      const [d, m, y] = cleanDate.split(".").map(Number);
      year = y < 100 ? 2000 + y : y;
      month = m;
      day = d;
    } else {
      const parsed = Date.parse(`${cleanDate} ${timeStr || "00:00"}`);
      return Number.isFinite(parsed) ? parsed : NaN;
    }

    const cleanTime = String(timeStr || "00:00").trim();
    const timeParts = cleanTime.split(":").map(Number);
    const hours = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
    const minutes = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;
    const seconds = Number.isFinite(timeParts[2]) ? timeParts[2] : 0;

    return new Date(year, month - 1, day, hours, minutes, seconds, 0).getTime();
  }

  /**
   * Arithmetic mean of an array of numbers.
   */
  function mean(values) {
    if (!values || values.length === 0) return NaN;
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i];
    return sum / values.length;
  }

  /**
   * Sample standard deviation (ddof = 1, matching pandas .std()).
   * Returns 0.0 for n <= 1.
   */
  function sampleStd(values) {
    if (!values || values.length <= 1) return 0.0;
    const avg = mean(values);
    let sqDiffSum = 0;
    for (let i = 0; i < values.length; i++) {
      const diff = values[i] - avg;
      sqDiffSum += diff * diff;
    }
    return Math.sqrt(sqDiffSum / (values.length - 1));
  }

  /**
   * Ordinary Least Squares simple linear regression (y = slope * x + intercept).
   * Matches np.polyfit(x, y, 1).
   */
  function linearRegression(xs, ys) {
    const n = xs.length;
    if (n < 2 || n !== ys.length) return null;

    const meanX = mean(xs);
    const meanY = mean(ys);

    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }

    if (sxx === 0) return null;

    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    let r2 = 1.0;
    if (syy > 0) {
      let ssRes = 0;
      for (let i = 0; i < n; i++) {
        const pred = slope * xs[i] + intercept;
        const err = ys[i] - pred;
        ssRes += err * err;
      }
      r2 = Math.max(0, 1 - ssRes / syy);
    }

    return { slope, intercept, r2 };
  }

  /**
   * Thoma / Neubauer Chamber Cell Count calculation.
   * Default chamberFactor = 4e6 (small square = 2.5e-7 mL).
   */
  function calculateCellCount({
    cellsCounted,
    smallSquares = 64,
    dilutionFactor = 1,
    volumeUl = 1000,
    chamberFactor = 4e6,
  }) {
    const n = Number(cellsCounted);
    const sq = Number(smallSquares);
    const df = Number(dilutionFactor);
    const vol = Number(volumeUl);
    const cf = Number(chamberFactor);

    if (!Number.isFinite(n) || !Number.isFinite(sq) || sq <= 0 || !Number.isFinite(df) || df <= 0) {
      return { cellsPerMl: NaN, totalCells: NaN };
    }

    const cellsPerMl = (n / sq) * cf * df;
    const totalCells = Number.isFinite(vol) && vol >= 0 ? cellsPerMl * (vol / 1000) : NaN;
    return { cellsPerMl, totalCells };
  }

  /**
   * Vorkultur / Inoculation volume calculation (C1 * V1 = C2 * V2).
   */
  function calculateInoculation(stockCellsPerMl, targetCellsPerMl, finalVolumeMl) {
    const c1 = Number(stockCellsPerMl);
    const c2 = Number(targetCellsPerMl);
    const v2 = Number(finalVolumeMl);

    if (!Number.isFinite(c1) || c1 <= 0 || !Number.isFinite(c2) || c2 < 0 || !Number.isFinite(v2) || v2 <= 0) {
      return null;
    }

    const stockVolumeMl = (c2 * v2) / c1;
    const mediumVolumeMl = v2 - stockVolumeMl;
    const feasible = stockVolumeMl <= v2;
    return {
      stockVolumeMl,
      stockVolumeUl: stockVolumeMl * 1000,
      mediumVolumeMl,
      dilutionRatio: c1 / (c2 || 1),
      feasible,
    };
  }

  /**
   * Estimates IC50 via linear interpolation across adjacent sorted (concentration, inhibition) points.
   */
  function estimateIC50(summaryRows) {
    if (!summaryRows || summaryRows.length < 2) return null;
    const valid = summaryRows
      .filter((r) => Number.isFinite(r.concentration) && Number.isFinite(r.inhibition))
      .sort((a, b) => a.concentration - b.concentration);

    if (valid.length < 2) return null;

    // Look for first crossing from < 50% to >= 50%
    for (let i = 0; i < valid.length - 1; i++) {
      const a = valid[i];
      const b = valid[i + 1];
      if (a.inhibition < 50 && b.inhibition >= 50 && b.inhibition !== a.inhibition) {
        const frac = (50 - a.inhibition) / (b.inhibition - a.inhibition);
        const ic50 = a.concentration + frac * (b.concentration - a.concentration);
        return {
          value: ic50,
          bracket: [a.concentration, b.concentration],
          status: "interpolated",
        };
      }
    }

    const maxInh = Math.max(...valid.map((r) => r.inhibition));
    if (maxInh < 50) {
      return { value: null, status: "below_50", maxInhibition: maxInh };
    }
    return { value: null, status: "not_monotonic", maxInhibition: maxInh };
  }

  /**
   * Generic time-series kinetics engine used by both OD and Cell Count tabs.
   *
   * @param {Array} records - Array of objects with { date, time, concentration, value }
   * @param {Object} options - { controlConc: 0, tStartHours: null, tEndHours: null }
   * @returns {Object} { averaged, summary, kinetics, concentrations, timepointsCount, t0Ms, ic50, controlMu }
   */
  function analyzeTimeSeries(records, options = {}) {
    const controlConc = Number.isFinite(Number(options.controlConc)) ? Number(options.controlConc) : 0;
    const tStartHours = options.tStartHours !== null && options.tStartHours !== undefined && options.tStartHours !== ""
      ? Number(options.tStartHours)
      : null;
    const tEndHours = options.tEndHours !== null && options.tEndHours !== undefined && options.tEndHours !== ""
      ? Number(options.tEndHours)
      : null;

    if (!records || records.length === 0) {
      return {
        averaged: [],
        summary: [],
        kinetics: [],
        concentrations: [],
        timepointsCount: 0,
        t0Ms: null,
        ic50: null,
        controlMu: null,
      };
    }

    // Parse and validate rows
    const validRows = [];
    for (const r of records) {
      const ts = parseTimestampMs(r.date, r.time);
      const conc = Number(r.concentration);
      const val = Number(r.value);
      if (Number.isFinite(ts) && Number.isFinite(conc) && Number.isFinite(val)) {
        validRows.push({
          timestamp: ts,
          date: r.date,
          time: r.time,
          concentration: conc,
          value: val,
        });
      }
    }

    if (validRows.length === 0) {
      return {
        averaged: [],
        summary: [],
        kinetics: [],
        concentrations: [],
        timepointsCount: 0,
        t0Ms: null,
        ic50: null,
        controlMu: null,
      };
    }

    const t0Ms = Math.min(...validRows.map((r) => r.timestamp));

    // 1. Group by (timestamp, concentration) -> Averaged Data
    const groupMap = new Map();
    for (const row of validRows) {
      const key = `${row.timestamp}__${row.concentration}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          timestamp: row.timestamp,
          date: row.date,
          time: row.time,
          concentration: row.concentration,
          values: [],
        });
      }
      groupMap.get(key).values.push(row.value);
    }

    const averaged = Array.from(groupMap.values())
      .map((g) => {
        const m = mean(g.values);
        const sd = sampleStd(g.values);
        const elapsedHours = (g.timestamp - t0Ms) / 3600000;
        return {
          timestamp: g.timestamp,
          date: g.date,
          time: g.time,
          elapsedHours,
          concentration: g.concentration,
          meanVal: m,
          stdVal: sd,
          lnMeanVal: m > 0 ? Math.log(m) : null,
          n: g.values.length,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp || a.concentration - b.concentration);

    const concentrations = Array.from(new Set(averaged.map((r) => r.concentration))).sort((a, b) => a - b);
    const uniqueTimestamps = Array.from(new Set(averaged.map((r) => r.timestamp))).sort((a, b) => a - b);

    // 2. Calculate Overall Mu per concentration (using optional tStartHours/tEndHours window)
    const muByConc = new Map();
    const r2ByConc = new Map();
    const pointsUsedByConc = new Map();

    for (const conc of concentrations) {
      let pts = averaged
        .filter((r) => r.concentration === conc && r.lnMeanVal !== null)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (tStartHours !== null && Number.isFinite(tStartHours)) {
        pts = pts.filter((r) => r.elapsedHours >= tStartHours - 1e-9);
      }
      if (tEndHours !== null && Number.isFinite(tEndHours)) {
        pts = pts.filter((r) => r.elapsedHours <= tEndHours + 1e-9);
      }

      pointsUsedByConc.set(conc, pts.length);

      if (pts.length >= 2) {
        const firstTs = pts[0].timestamp;
        const xs = pts.map((p) => (p.timestamp - firstTs) / 3600000);
        const ys = pts.map((p) => p.lnMeanVal);
        const reg = linearRegression(xs, ys);
        if (reg) {
          muByConc.set(conc, reg.slope);
          r2ByConc.set(conc, reg.r2);
        } else {
          muByConc.set(conc, null);
          r2ByConc.set(conc, null);
        }
      } else {
        muByConc.set(conc, null);
        r2ByConc.set(conc, null);
      }
    }

    const controlMu = muByConc.has(controlConc) ? muByConc.get(controlConc) : null;

    // 3. Summary Table: concentration, mu (h^-1), r2, inhibition (%)
    const summary = concentrations.map((conc) => {
      const mu = muByConc.get(conc);
      const r2 = r2ByConc.get(conc);
      let inhibition = null;
      if (conc === controlConc && mu !== null) {
        inhibition = 0.0;
      } else if (mu !== null && controlMu !== null && controlMu !== 0) {
        inhibition = (1 - mu / controlMu) * 100;
      }
      return {
        concentration: conc,
        isControl: conc === controlConc,
        mu,
        r2,
        doublingTime: mu !== null && mu > 0 ? Math.log(2) / mu : null,
        inhibition,
        pointsCount: pointsUsedByConc.get(conc) || 0,
      };
    });

    // 4. Kinetics Over Time (stepwise interval mu and interval inhibition %)
    const byConc = new Map();
    for (const row of averaged) {
      if (!byConc.has(row.concentration)) byConc.set(row.concentration, []);
      byConc.get(row.concentration).push(row);
    }

    const kineticsUnsorted = [];
    for (const [conc, grp] of byConc.entries()) {
      grp.sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 0; i < grp.length; i++) {
        const cur = grp[i];
        let intervalMu = null;
        if (i > 0) {
          const prev = grp[i - 1];
          const dt = cur.elapsedHours - prev.elapsedHours;
          if (dt > 0 && cur.lnMeanVal !== null && prev.lnMeanVal !== null) {
            intervalMu = (cur.lnMeanVal - prev.lnMeanVal) / dt;
          }
        }
        kineticsUnsorted.push({
          ...cur,
          intervalMu,
          intervalInhibition: null,
        });
      }
    }

    // Map control intervalMu by timestamp
    const ctrlIntervalMuByTs = new Map();
    for (const row of kineticsUnsorted) {
      if (row.concentration === controlConc) {
        ctrlIntervalMuByTs.set(row.timestamp, row.intervalMu);
      }
    }

    const kinetics = kineticsUnsorted
      .map((row) => {
        const ctrlMu = ctrlIntervalMuByTs.get(row.timestamp);
        let intervalInhibition = null;
        if (row.intervalMu !== null && ctrlMu !== null && ctrlMu !== undefined && ctrlMu !== 0) {
          intervalInhibition = row.concentration === controlConc ? 0.0 : (1 - row.intervalMu / ctrlMu) * 100;
        }
        return {
          ...row,
          ctrlIntervalMu: ctrlMu ?? null,
          intervalInhibition,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp || a.concentration - b.concentration);

    const ic50 = estimateIC50(summary);

    return {
      averaged,
      summary,
      kinetics,
      concentrations,
      timepointsCount: uniqueTimestamps.length,
      t0Ms,
      ic50,
      controlMu,
    };
  }

  /**
   * Lemna minor Frond Assay analysis matching LemnaSample in calculations.ipynb.
   */
  function analyzeLemna(entries, controlConc = 0) {
    if (!entries || entries.length === 0) {
      return { rows: [], controlMu: null, ic50: null };
    }

    const computed = entries
      .map((e) => {
        const dilution = Number(e.dilution);
        const tHours = Number(e.tHours) || 168;
        const n0A = Number(e.n0A);
        const ntA = Number(e.ntA);
        const hasB = e.n0B !== "" && e.n0B !== null && e.n0B !== undefined && e.ntB !== "" && e.ntB !== null && e.ntB !== undefined;
        const n0B = hasB ? Number(e.n0B) : null;
        const ntB = hasB ? Number(e.ntB) : null;

        const n0Vals = [n0A].concat(Number.isFinite(n0B) ? [n0B] : []).filter(Number.isFinite);
        const ntVals = [ntA].concat(Number.isFinite(ntB) ? [ntB] : []).filter(Number.isFinite);

        const avgN0 = mean(n0Vals);
        const avgNt = mean(ntVals);
        const sdN0 = sampleStd(n0Vals);
        const sdNt = sampleStd(ntVals);

        let mu = null;
        if (Number.isFinite(avgN0) && Number.isFinite(avgNt) && avgN0 > 0 && avgNt > 0 && tHours > 0) {
          mu = (Math.log(avgNt) - Math.log(avgN0)) / tHours;
        }

        return {
          id: e.id,
          dilution,
          concentration: dilution,
          isControl: dilution === Number(controlConc),
          tHours,
          n0A,
          ntA,
          n0B: Number.isFinite(n0B) ? n0B : null,
          ntB: Number.isFinite(ntB) ? ntB : null,
          avgN0,
          avgNt,
          sdN0,
          sdNt,
          mu,
          doublingTime: mu !== null && mu > 0 ? Math.log(2) / mu : null,
          inhibition: null,
        };
      })
      .sort((a, b) => a.dilution - b.dilution);

    const ctrlRow = computed.find((r) => r.isControl && r.mu !== null);
    const controlMu = ctrlRow ? ctrlRow.mu : null;

    const rows = computed.map((r) => {
      let inhibition = null;
      if (r.isControl && r.mu !== null) {
        inhibition = 0.0;
      } else if (r.mu !== null && controlMu !== null && controlMu !== 0) {
        inhibition = (1 - r.mu / controlMu) * 100;
      }
      return { ...r, inhibition };
    });

    const ic50 = estimateIC50(rows);
    return { rows, controlMu, ic50 };
  }

  /**
   * Formatting helpers for consistent scientific display.
   */
  function formatNum(val, decimals = 4) {
    if (val === null || val === undefined || !Number.isFinite(val)) return "—";
    return val.toFixed(decimals);
  }

  function formatSci(val, sig = 2) {
    if (val === null || val === undefined || !Number.isFinite(val)) return "—";
    if (val === 0) return "0";
    const abs = Math.abs(val);
    if (abs >= 1e4 || abs < 1e-2) {
      return val.toExponential(sig);
    }
    return Number(val.toPrecision(sig + 1)).toString();
  }

  Ecotox.Math = {
    parseSumExpression,
    parseTimestampMs,
    mean,
    sampleStd,
    linearRegression,
    calculateCellCount,
    calculateInoculation,
    estimateIC50,
    analyzeTimeSeries,
    analyzeLemna,
    formatNum,
    formatSci,
  };
})(typeof window !== "undefined" ? window : globalThis);
