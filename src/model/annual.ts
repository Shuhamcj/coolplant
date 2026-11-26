import type { Params } from './params';
import { simulateHour, sizePlant, type HourResult, type PlantSize, type Strategy } from './plant';
import { psatKPa, stullWetBulb } from './psychro';

export const HOURS = 8760;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const L_PER_GAL = 3.78541;
/** Shared deadband for "above setpoint" / "above limit" temperature counts, K. */
export const TEMP_TOL_K = 0.05;

export interface Weather {
  tempC: number[];
  rh: number[];
}

/** Hour-of-year → month index (non-leap year). */
export const MONTH_OF_HOUR: number[] = DAYS_IN_MONTH.flatMap((d, m) => Array(d * 24).fill(m));

/** Mulberry32: tiny seeded PRNG so AI spikes are the same on every run. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hourly IT load in kW: flat at the slider value, plus optional seeded AI-training bursts of 2-6 h. */
export function itLoadProfile(p: Params, spikes: boolean): Float64Array {
  const base = p.itLoadMW * 1000;
  const out = new Float64Array(HOURS).fill(base);
  if (!spikes) return out;
  const rand = mulberry32(42);
  for (let h = 0; h < HOURS; h++) {
    if (rand() < p.aiSpikeStartProb) {
      const len = 2 + Math.floor(rand() * 5);
      for (let k = 0; k < len && h < HOURS; k++, h++) out[h] = base * (1 + p.aiSpikePct / 100);
    }
  }
  return out;
}

export interface Totals {
  itKWh: number;
  mechKWh: number;
  chillerKWh: number;
  pumpKWh: number;
  fanKWh: number;
  waterGal: number;
  co2Tonnes: number;
  pPUE: number;
  freeHours: number;
  partialHours: number;
  unmetHours: number;
  copLimitHours: number;
  peakPlr: number;
}

export interface StrategyRun {
  hours: HourResult[];
  totals: Totals;
  monthly: { mechMWh: number; waterKGal: number }[];
  dailyPPUE: number[];
}

export interface Heatwave {
  deltaC: number;
  days: number;
  startDay: number; // 0-based day of year
  /** Take the N+1 standby chiller out of service for the heatwave window. */
  unitOut?: boolean;
}

export interface AnnualResult {
  size: PlantSize;
  wbC: Float64Array;
  dbC: Float64Array;
  rh: Float64Array;
  loadKW: Float64Array;
  baseline: StrategyRun;
  smart: StrategyRun;
}

export function wetBulbSeries(w: Weather): Float64Array {
  return Float64Array.from(w.tempC, (t, i) => stullWetBulb(t, w.rh[i]));
}

function runStrategy(strategy: Strategy, wbC: Float64Array, dbC: Float64Array, unitsOut: Uint8Array, loadKW: Float64Array, p: Params, size: PlantSize, gridKg: number): StrategyRun {
  const hours: HourResult[] = new Array(HOURS);
  const monthly = MONTHS.map(() => ({ mechMWh: 0, waterKGal: 0 }));
  const dailyIT = new Float64Array(365);
  const dailyMech = new Float64Array(365);
  const t: Totals = { itKWh: 0, mechKWh: 0, chillerKWh: 0, pumpKWh: 0, fanKWh: 0, waterGal: 0, co2Tonnes: 0, pPUE: 0, freeHours: 0, partialHours: 0, unmetHours: 0, copLimitHours: 0, peakPlr: 0 };

  for (let h = 0; h < HOURS; h++) {
    const r = simulateHour(wbC[h], loadKW[h], strategy, p, size, dbC[h], unitsOut[h]);
    hours[h] = r;
    const gal = r.waterL / L_PER_GAL;
    t.itKWh += loadKW[h];
    t.mechKWh += r.mechKW;
    t.chillerKWh += r.chillerKW;
    t.pumpKWh += r.chwPumpKW + r.cwPumpKW;
    t.fanKWh += r.fanKW;
    t.waterGal += gal;
    if (r.mode === 'free') t.freeHours++;
    if (r.mode === 'partial') t.partialHours++;
    if (r.unmetKW > 1) t.unmetHours++;
    if (r.atCopLimit) t.copLimitHours++;
    t.peakPlr = Math.max(t.peakPlr, r.plr);
    monthly[MONTH_OF_HOUR[h]].mechMWh += r.mechKW / 1000;
    monthly[MONTH_OF_HOUR[h]].waterKGal += gal / 1000;
    dailyIT[Math.floor(h / 24)] += loadKW[h];
    dailyMech[Math.floor(h / 24)] += r.mechKW;
  }
  t.co2Tonnes = (t.mechKWh * gridKg) / 1000;
  t.pPUE = (t.itKWh + t.mechKWh) / t.itKWh;
  return { hours, totals: t, monthly, dailyPPUE: Array.from(dailyIT, (it, d) => (it + dailyMech[d]) / it) };
}

/** Hour range [start, end) covered by a heatwave. */
export const heatwaveHours = (hw: Heatwave) => [hw.startDay * 24, Math.min(HOURS, (hw.startDay + hw.days) * 24)] as const;

export function simulateYear(w: Weather, p: Params, opts: { spikes: boolean; gridKgCO2PerKWh: number; heatwave?: Heatwave | null }): AnnualResult {
  const size = sizePlant(p);
  // Copies, so a heatwave never touches the cached weather and Clear restores the original year.
  const dbC = Float64Array.from(w.tempC);
  const rh = Float64Array.from(w.rh);
  const unitsOut = new Uint8Array(HOURS);
  if (opts.heatwave) {
    // Heatwave test: +X °C dry-bulb with the humidity ratio held constant. At constant pressure that means
    // constant vapour pressure, so RH = p_v / p_sat(DB + X); wet-bulb is then recomputed with Stull.
    const [a, b] = heatwaveHours(opts.heatwave);
    for (let h = a; h < b; h++) {
      const pv = (rh[h] / 100) * psatKPa(dbC[h]);
      dbC[h] += opts.heatwave.deltaC;
      rh[h] = Math.min(100, (100 * pv) / psatKPa(dbC[h]));
      if (opts.heatwave.unitOut) unitsOut[h] = 1;
    }
  }
  const wbC = Float64Array.from(dbC, (t, i) => stullWetBulb(t, rh[i]));
  const loadKW = itLoadProfile(p, opts.spikes);
  return {
    size,
    wbC,
    dbC,
    rh,
    loadKW,
    baseline: runStrategy('baseline', wbC, dbC, unitsOut, loadKW, p, size, opts.gridKgCO2PerKWh),
    smart: runStrategy('smart', wbC, dbC, unitsOut, loadKW, p, size, opts.gridKgCO2PerKWh),
  };
}

export interface WindowStats {
  capacityExceededHours: number;
  maxUnmetKW: number;
  supplyAboveSetpointHours: number;
  peakSupplyC: number;
  peakCapUse: number;
  peakPlr: number;
  peakChillersOn: number;
  redundancyLostHours: number;
  ecwtOverLimitHours: number;
  tripHours: number;
  peakEcwtC: number;
  peakInletC: number;
  inletOverLimitHours: number;
  peakWbC: number;
  mechMWh: number;
}

/** Stress metrics over hours [start, end). */
export function windowStats(res: AnnualResult, run: StrategyRun, start: number, end: number, p: Params): WindowStats {
  const s: WindowStats = { capacityExceededHours: 0, maxUnmetKW: 0, supplyAboveSetpointHours: 0, peakSupplyC: -Infinity, peakCapUse: 0, peakPlr: 0, peakChillersOn: 0, redundancyLostHours: 0, ecwtOverLimitHours: 0, tripHours: 0, peakEcwtC: -Infinity, peakInletC: -Infinity, inletOverLimitHours: 0, peakWbC: -Infinity, mechMWh: 0 };
  for (let h = start; h < end; h++) {
    const r = run.hours[h];
    if (r.unmetKW > 1) s.capacityExceededHours++;
    if (r.supplyC > r.chwsC + TEMP_TOL_K) s.supplyAboveSetpointHours++;
    if (r.nRequired > res.size.nDuty) s.redundancyLostHours++;
    if (r.nChillers > 0 || r.tripped) {
      s.peakEcwtC = Math.max(s.peakEcwtC, r.ecwtC);
      if (r.ecwtC > p.maxEcwtC) s.ecwtOverLimitHours++;
    }
    if (r.tripped) s.tripHours++;
    const inlet = r.supplyC + p.airSideApproachK;
    s.peakInletC = Math.max(s.peakInletC, inlet);
    if (inlet > p.maxServerInletC + TEMP_TOL_K) s.inletOverLimitHours++;
    s.maxUnmetKW = Math.max(s.maxUnmetKW, r.unmetKW);
    s.peakSupplyC = Math.max(s.peakSupplyC, r.supplyC);
    s.peakCapUse = Math.max(s.peakCapUse, r.capUse);
    s.peakPlr = Math.max(s.peakPlr, r.plr);
    s.peakChillersOn = Math.max(s.peakChillersOn, r.nChillers);
    s.peakWbC = Math.max(s.peakWbC, res.wbC[h]);
    s.mechMWh += r.mechKW / 1000;
  }
  return s;
}
