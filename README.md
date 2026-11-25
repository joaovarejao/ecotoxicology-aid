# Ecotoxicology Aid

Offline-ready browser web app for analyzing ecotoxicology lab assays: **Optical Density (OD)**, **Cell Count (Thoma / Neubauer chamber)**, **Lemna minor frond assays**, and **dilution series (Verdünnungsreihe)**.

## Features

- **Experiment Management**: Create, switch, duplicate, rename, and delete experiments from the top dropdown. Automatically reopens the last active experiment and tab via `localStorage`.
- **Portable Local Save Files & HTML Reports**: Save experiments as `.json` or export standalone, print-ready `.html` reports with embedded vector charts and tables (re-importable back into the app via **Open File** or drag-and-drop).
- **OD Measurements Tab**:
  - Single & Quick Batch entry (multiple concentrations and replicates per timepoint)
  - Replicate averaging (`mean ± sample SD`), linear regression specific growth rate ($\mu$, $\text{h}^{-1}$), optional exponential phase window (`t_start` / `t_end`), overall & stepwise growth inhibition (%), and linear $\text{IC}_{50}$ estimation
  - Interactive Plotly charts (Growth Curves, Semi-Log $\ln(\text{OD})$, Stepwise $\mu$, Dose-Response) with PNG export and CSV tables
- **Cell Count Tab**:
  - Thoma / Neubauer chamber calculator (supports sum expressions like `18+14+19+20`) and Direct `cells/mL` mode
  - Built-in **Vorkultur / Inoculation Calculator** ($C_1 V_1 = C_2 V_2$)
  - Snapshot bar chart for single timepoints or full 4-chart growth kinetics suite for multi-timepoint assays
- **Lemna minor Tab**:
  - Replicate A/B frond count averaging, specific growth rate $\mu$, doubling time, and % inhibition (*Hemmung*)
  - Interactive frond count, growth rate, and dose-response charts + CSV export
- **Dilutions & Notes Tab**:
  - Pipetting volume planner (*Verdünnungsreihe*) with stacked volume chart and persistent per-experiment lab notes
- **Interactive Graph Controls**: Click color-coded concentration chips (or summary table rows) to **Highlight** or **Isolate** curves across all charts, star the active control concentration, shade exponential `t_start`/`t_end` fit windows, overlay OLS regression lines on Semi-Log plots, switch Dose-Response between Linear and `Log X`, choose `IC50`/`IC20`/`IC10` endpoints, toggle `± SD` error bars, and expand any graph individually to **Fullsize**.
- **100% Offline**: Bundles `plotly-basic` locally with light/dark theme support.

## Usage

Open `index.html` directly in any modern browser, or host it directly with GitHub Pages.
