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
   * Estimates ICx (e.g. IC10, IC20, IC50) via linear interpolation across sorted (concentration, inhibition) points.
   */
  function estimateICx(summaryRows, targetPct = 50) {
    const target = Number.isFinite(Number(targetPct)) ? Number(targetPct) : 50;
    if (!summaryRows || summaryRows.length < 2) return null;
    const valid = summaryRows
      .filter((r) => Number.isFinite(r.concentration) && Number.isFinite(r.inhibition))
      .sort((a, b) => a.concentration - b.concentration);

    if (valid.length < 2) return null;

    for (let i = 0; i < valid.length - 1; i++) {
      const a = valid[i];
      const b = valid[i + 1];
      if (a.inhibition < target && b.inhibition >= target && b.inhibition !== a.inhibition) {
        const frac = (target - a.inhibition) / (b.inhibition - a.inhibition);
        const val = a.concentration + frac * (b.concentration - a.concentration);
        return {
          value: val,
          targetPct: target,
          bracket: [a.concentration, b.concentration],
          status: "interpolated",
        };
      }
    }

    const maxInh = Math.max(...valid.map((r) => r.inhibition));
    if (maxInh < target) {
      return { value: null, targetPct: target, status: "below_50", maxInhibition: maxInh };
    }
    return { value: null, targetPct: target, status: "not_monotonic", maxInhibition: maxInh };
  }

  function estimateIC50(summaryRows) {
    return estimateICx(summaryRows, 50);
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
    const fitLineByConc = new Map();
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
          const xStart = pts[0].elapsedHours;
          const xEnd = pts[pts.length - 1].elapsedHours;
          fitLineByConc.set(conc, {
            x0: xStart,
            y0: reg.intercept,
            x1: xEnd,
            y1: reg.slope * (xEnd - xStart) + reg.intercept,
          });
        } else {
          muByConc.set(conc, null);
          r2ByConc.set(conc, null);
          fitLineByConc.set(conc, null);
        }
      } else {
        muByConc.set(conc, null);
        r2ByConc.set(conc, null);
        fitLineByConc.set(conc, null);
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
        muPerDay: mu !== null ? mu * 24 : null,
        r2,
        fitLine: fitLineByConc.get(conc) || null,
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

    const icTarget = Number.isFinite(Number(options.icTarget)) ? Number(options.icTarget) : 50;
    const ic50 = estimateICx(summary, icTarget);

    return {
      averaged,
      summary,
      kinetics,
      concentrations,
      timepointsCount: uniqueTimestamps.length,
      t0Ms,
      ic50,
      icTarget,
      controlMu,
    };
  }

  /**
   * Lemna minor Frond Assay analysis matching LemnaSample in calculations.ipynb.
   */
  function analyzeLemna(entries, controlConc = 0, icTarget = 50) {
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
          muPerDay: mu !== null ? mu * 24 : null,
          doublingTime: mu !== null && mu > 0 ? Math.log(2) / mu : null,
          doublingTimeDays: mu !== null && mu > 0 ? Math.log(2) / (mu * 24) : null,
          notes: typeof e.notes === "string" ? e.notes : "",
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

    const ic50 = estimateICx(rows, icTarget);
    const controlMuDay = controlMu !== null ? controlMu * 24 : null;
    const controlTdDays = controlMuDay !== null && controlMuDay > 0 ? Math.log(2) / controlMuDay : null;
    const validity = {
      controlMuDay,
      controlTdDays,
      muOk: controlMuDay !== null ? controlMuDay >= 0.275 : null,
      tdOk: controlTdDays !== null ? controlTdDays < 2.5 : null,
    };
    return { rows, controlMu, controlMuDay, controlTdDays, validity, ic50, icTarget };
  }

  /**
   * High-accuracy Acklam rational approximation of the inverse standard normal CDF (Phi^-1).
   * Used for Finney Probit transformation: Probit(p) = Phi^-1(p) + 5.
   */
  function normInv(p) {
    if (!(p > 0 && p < 1)) return null;
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    const plow = 0.02425;
    const phigh = 1 - plow;
    let q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= phigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-ax * ax);
    return sign * y;
  }

  function normCdf(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  /**
   * Convert percentage response (0 < pct < 100) to Finney Probit (mean 5, sd 1).
   */
  function probToProbit(pct) {
    const p = Number(pct) / 100;
    if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
    const z = normInv(p);
    return z === null ? null : z + 5;
  }

  /**
   * Convert Finney Probit value back to percentage (0..100).
   */
  function probitToProb(probit) {
    if (!Number.isFinite(Number(probit))) return null;
    return normCdf(Number(probit) - 5) * 100;
  }

  /**
   * Acute Daphnia magna Immobilization & Probit Analysis
   * Implements DIN 38412 L30, DIN EN ISO 6341-L40 / OECD 202, and Bliss/Finney Probit Analysis.
   * Supports 24h and 48h observations, replicate pooling, Abbott control correction,
   * Probit linear regression Y = a + b * ln(C), Geometric Mean fallback sqrt(a*b),
   * GD (Hazard Dose: >90% mobile), NOEC/LOEC, and OECD 202 validity (control <= 10%).
   */
  function analyzeDaphnia(entries, options = {}) {
    const controlConc = Number.isFinite(Number(options.controlConc)) ? Number(options.controlConc) : 0;
    const timepoint = options.timepoint === "24h" ? "24h" : "48h";
    const targetPct = Number.isFinite(Number(options.targetPct)) ? Number(options.targetPct) : 50;
    const useAbbott = options.useAbbott !== false;

    if (!entries || entries.length === 0) {
      return {
        rows: [],
        timepoint,
        targetPct,
        controlPct24: null,
        controlPct48: null,
        validity: { ok24: null, ok48: null, okActive: null },
        probit: null,
        geomMeanEC50: null,
        linearECx: null,
        primaryEC: null,
        gdValue: null,
        noec: null,
        loec: null,
      };
    }

    // Pool replicates by concentration
    const byConc = new Map();
    for (const e of entries) {
      const conc = Number(e.concentration);
      const total = Number(e.totalAnimals);
      const imm24 = e.immob24 !== "" && e.immob24 !== null && e.immob24 !== undefined ? Number(e.immob24) : null;
      const imm48 = e.immob48 !== "" && e.immob48 !== null && e.immob48 !== undefined ? Number(e.immob48) : null;
      if (!Number.isFinite(conc) || !Number.isFinite(total) || total <= 0) continue;

      if (!byConc.has(conc)) {
        byConc.set(conc, {
          concentration: conc,
          totalAnimals: 0,
          totalFor24: 0,
          immob24: 0,
          has24: false,
          totalFor48: 0,
          immob48: 0,
          has48: false,
          replicates: 0,
          notes: [],
        });
      }
      const g = byConc.get(conc);
      g.totalAnimals += total;
      g.replicates += 1;
      if (Number.isFinite(imm24) && imm24 >= 0) {
        g.immob24 += Math.min(imm24, total);
        g.totalFor24 += total;
        g.has24 = true;
      }
      if (Number.isFinite(imm48) && imm48 >= 0) {
        g.immob48 += Math.min(imm48, total);
        g.totalFor48 += total;
        g.has48 = true;
      }
      if (e.notes && String(e.notes).trim()) g.notes.push(String(e.notes).trim());
    }

    const rawRows = Array.from(byConc.values())
      .sort((a, b) => a.concentration - b.concentration)
      .map((g) => {
        const pct24 = g.has24 && g.totalFor24 > 0 ? (g.immob24 / g.totalFor24) * 100 : null;
        const pct48 = g.has48 && g.totalFor48 > 0 ? (g.immob48 / g.totalFor48) * 100 : null;
        return {
          concentration: g.concentration,
          isControl: g.concentration === controlConc,
          totalAnimals: g.totalAnimals,
          replicates: g.replicates,
          immob24: g.has24 ? g.immob24 : null,
          mobile24: g.has24 ? g.totalFor24 - g.immob24 : null,
          pct24,
          immob48: g.has48 ? g.immob48 : null,
          mobile48: g.has48 ? g.totalFor48 - g.immob48 : null,
          pct48,
          notes: g.notes.join("; "),
        };
      });

    const ctrlRow = rawRows.find((r) => r.isControl);
    const controlPct24 = ctrlRow ? ctrlRow.pct24 : null;
    const controlPct48 = ctrlRow ? ctrlRow.pct48 : null;

    const abbott = (pct, ctrlPct) => {
      if (pct === null) return null;
      if (!useAbbott || ctrlPct === null || ctrlPct <= 0 || ctrlPct >= 100) return pct;
      return Math.max(0, ((pct - ctrlPct) / (100 - ctrlPct)) * 100);
    };

    const rows = rawRows.map((r) => {
      const corr24 = r.isControl ? r.pct24 : abbott(r.pct24, controlPct24);
      const corr48 = r.isControl ? r.pct48 : abbott(r.pct48, controlPct48);
      const activePct = timepoint === "24h" ? corr24 : corr48;
      const rawActivePct = timepoint === "24h" ? r.pct24 : r.pct48;
      const lnConc = r.concentration > 0 ? Math.log(r.concentration) : null;
      const probit = activePct !== null && activePct > 0 && activePct < 100 ? probToProbit(activePct) : null;
      return {
        ...r,
        corr24,
        corr48,
        activePct,
        rawActivePct,
        inhibition: activePct,
        lnConc,
        probit,
      };
    });

    // Probit regression Y = a + b * ln(C) over non-control points with C > 0 and 0 < pct < 100
    const probitPts = rows.filter((r) => !r.isControl && r.lnConc !== null && r.probit !== null);
    let probit = null;
    if (probitPts.length >= 2) {
      const xs = probitPts.map((r) => r.lnConc);
      const ys = probitPts.map((r) => r.probit);
      const reg = linearRegression(xs, ys);
      if (reg && Math.abs(reg.slope) > 1e-12) {
        const solveEC = (pct) => {
          const yT = probToProbit(pct);
          if (yT === null) return null;
          const xVal = (yT - reg.intercept) / reg.slope;
          const cVal = Math.exp(xVal);
          return Number.isFinite(cVal) && cVal > 0 ? cVal : null;
        };
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const ecTarget = solveEC(targetPct);
        const xSpanMin = ecTarget ? Math.min(minX, Math.log(ecTarget)) : minX;
        const xSpanMax = ecTarget ? Math.max(maxX, Math.log(ecTarget)) : maxX;
        probit = {
          slope: reg.slope,
          intercept: reg.intercept,
          r2: reg.r2,
          n: probitPts.length,
          ec10: solveEC(10),
          ec20: solveEC(20),
          ec50: solveEC(50),
          ec90: solveEC(90),
          ecTarget,
          targetProbit: probToProbit(targetPct),
          lineX: [xSpanMin, xSpanMax],
          lineY: [reg.intercept + reg.slope * xSpanMin, reg.intercept + reg.slope * xSpanMax],
        };
      }
    }

    // Geometric Mean EC50 fallback (Daphnientest.pdf p. 6): sqrt(a * b)
    // a = highest concentration with 0% immobilization, b = lowest concentration with 100% immobilization
    const testRows = rows.filter((r) => !r.isControl && r.concentration > 0 && r.activePct !== null);
    let highestZero = null;
    let lowestHundred = null;
    for (const r of testRows) {
      if (r.activePct <= 0) highestZero = r.concentration;
      if (r.activePct >= 100 && lowestHundred === null) lowestHundred = r.concentration;
    }
    let geomMeanEC50 = null;
    if (highestZero !== null && lowestHundred !== null && lowestHundred > highestZero) {
      geomMeanEC50 = {
        value: Math.sqrt(highestZero * lowestHundred),
        a: highestZero,
        b: lowestHundred,
      };
    }

    // Linear interpolation ECx fallback
    const linearECx = estimateICx(rows, targetPct);

    // Primary EC estimate priority: Probit (if positive slope & valid) -> Geometric Mean (if target=50) -> Linear
    let primaryEC = null;
    if (probit && probit.slope > 0 && probit.ecTarget !== null) {
      primaryEC = {
        method: "Probit",
        value: probit.ecTarget,
        detail: `R² = ${probit.r2 !== null ? probit.r2.toFixed(3) : "—"} (n=${probit.n})`,
      };
    } else if (targetPct === 50 && geomMeanEC50) {
      primaryEC = {
        method: "Geom. Mean",
        value: geomMeanEC50.value,
        detail: `√(${geomMeanEC50.a} × ${geomMeanEC50.b})`,
      };
    } else if (linearECx && linearECx.status === "interpolated") {
      primaryEC = {
        method: "Linear",
        value: linearECx.value,
        detail: `Bracket ${linearECx.bracket[0]}–${linearECx.bracket[1]}`,
      };
    }

    // GD (Hazard Dose / Gefährdungsdosis): >90% mobile (<10% immobilized)
    // NOEC: highest concentration with <=10% immobilization (OECD 202 practical threshold)
    // LOEC: lowest concentration above NOEC with >10% immobilization
    let gdValue = null;
    let noec = null;
    let loec = null;
    for (const r of testRows) {
      if (r.activePct < 10) {
        gdValue = r.concentration;
      }
      if (r.activePct <= 10) {
        if (loec === null) noec = r.concentration;
      } else if (loec === null) {
        loec = r.concentration;
      }
    }

    const ok24 = controlPct24 !== null ? controlPct24 <= 10 : null;
    const ok48 = controlPct48 !== null ? controlPct48 <= 10 : null;
    const okActive = timepoint === "24h" ? ok24 : ok48;

    return {
      rows,
      timepoint,
      targetPct,
      useAbbott,
      controlPct24,
      controlPct48,
      validity: { ok24, ok48, okActive },
      probit,
      geomMeanEC50,
      linearECx,
      primaryEC,
      gdValue,
      noec,
      loec,
    };
  }

  /**
   * Vibrio fischeri Bioluminescence Inhibition Assay (DIN EN ISO 11348-2 L52)
   * Formulas (Arbeitsvorschrift Leuchtbakterientest.pdf p. 8):
   *   f_kt = I_kt / I_k0  (mean across 2% NaCl control replicates)
   *   I_ct = I_0 * f_kt   (control-corrected expected luminescence)
   *   Hemmung [%] = ((I_ct - I_t) / I_ct) * 100
   * Toxicity criterion: inhibition > 20%.
   * ISO 11348 validity criterion: 0.6 <= f_kt <= 1.8.
   */
  function analyzeVibrio(entries, options = {}) {
    const controlConc = Number.isFinite(Number(options.controlConc)) ? Number(options.controlConc) : 0;
    const contactMin = options.contactMin !== undefined && options.contactMin !== null ? Number(options.contactMin) : null;
    const targetPct = Number.isFinite(Number(options.targetPct)) ? Number(options.targetPct) : 50;

    if (!entries || entries.length === 0) {
      return {
        rows: [],
        replicates: [],
        referenceRows: [],
        fkt: null,
        fktValid: null,
        ec20: null,
        ec50: null,
        ecTarget: null,
        targetPct,
        lid: null,
        contactTimes: [],
      };
    }

    const contactTimes = Array.from(new Set(entries.map((e) => Number(e.contactMin) || 30))).sort((a, b) => a - b);
    const activeEntries = contactMin !== null ? entries.filter((e) => (Number(e.contactMin) || 30) === contactMin) : entries;

    // Identify 2% NaCl controls for f_kt
    const ctrlEntries = activeEntries.filter((e) => e.sampleType === "control" || (e.sampleType !== "reference" && Number(e.concentration) === controlConc));
    const fktVals = ctrlEntries
      .map((e) => {
        const i0 = Number(e.i0);
        const it = Number(e.it);
        return Number.isFinite(i0) && Number.isFinite(it) && i0 > 0 ? it / i0 : null;
      })
      .filter((v) => v !== null);

    const fkt = fktVals.length > 0 ? mean(fktVals) : null;
    const fktSd = fktVals.length > 1 ? sampleStd(fktVals) : 0;
    const fktValid = fkt !== null ? fkt >= 0.6 && fkt <= 1.8 : null;

    // Evaluate every replicate
    const evaluated = activeEntries.map((e) => {
      const conc = Number(e.concentration);
      const i0 = Number(e.i0);
      const it = Number(e.it);
      const isCtrl = e.sampleType === "control" || (e.sampleType !== "reference" && conc === controlConc);
      const isRef = e.sampleType === "reference";
      const ict = fkt !== null && Number.isFinite(i0) ? i0 * fkt : null;
      let inhibition = null;
      if (ict !== null && ict > 0 && Number.isFinite(it)) {
        inhibition = ((ict - it) / ict) * 100;
      }
      return {
        ...e,
        concentration: conc,
        i0,
        it,
        ict,
        inhibition,
        isControl: isCtrl,
        isReference: isRef,
      };
    });

    const referenceRows = evaluated.filter((r) => r.isReference);
    const sampleAndCtrl = evaluated.filter((r) => !r.isReference);

    // Aggregate by concentration
    const byConc = new Map();
    for (const r of sampleAndCtrl) {
      if (!Number.isFinite(r.concentration)) continue;
      if (!byConc.has(r.concentration)) byConc.set(r.concentration, []);
      byConc.get(r.concentration).push(r);
    }

    const rows = Array.from(byConc.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([conc, grp]) => {
        const i0s = grp.map((x) => x.i0).filter(Number.isFinite);
        const its = grp.map((x) => x.it).filter(Number.isFinite);
        const icts = grp.map((x) => x.ict).filter((v) => v !== null && Number.isFinite(v));
        const inhs = grp.map((x) => x.inhibition).filter((v) => v !== null && Number.isFinite(v));
        const meanInh = inhs.length > 0 ? mean(inhs) : null;
        const sdInh = inhs.length > 1 ? sampleStd(inhs) : 0;
        const isControl = grp.some((x) => x.isControl);
        return {
          concentration: conc,
          isControl,
          n: grp.length,
          meanI0: mean(i0s),
          meanIt: mean(its),
          meanIct: icts.length > 0 ? mean(icts) : null,
          inhibition: meanInh,
          sdInhibition: sdInh,
          toxic: !isControl && meanInh !== null && meanInh > 20,
        };
      });

    const ec20 = estimateICx(rows, 20);
    const ec50 = estimateICx(rows, 50);
    const ecTarget = estimateICx(rows, targetPct);

    // LID / G_L: highest non-control concentration with inhibition <= 20%
    let lid = null;
    for (const r of rows) {
      if (!r.isControl && r.inhibition !== null && r.inhibition <= 20) {
        lid = r.concentration;
      }
    }

    return {
      rows,
      replicates: evaluated,
      referenceRows,
      fkt,
      fktSd,
      fktValid,
      ec20,
      ec50,
      ecTarget,
      targetPct,
      lid,
      contactTimes,
    };
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
    estimateICx,
    estimateIC50,
    analyzeTimeSeries,
    analyzeLemna,
    probToProbit,
    probitToProb,
    analyzeDaphnia,
    analyzeVibrio,
    formatNum,
    formatSci,
  };
})(typeof window !== "undefined" ? window : globalThis);
