import type { Params } from './params';
import { airState, enthalpy, humidityRatio, psatKPa } from './psychro';

export type Strategy = 'baseline' | 'smart';
export type Mode = 'chiller' | 'partial' | 'free';

const RHO = 1000; // kg/m³ water
const CP = 4.186; // kJ/(kg·K) water
const G = 9.81; // m/s²
const K0 = 273.15;

/** Hydraulic pump power at design: P = ρ·g·H·Q / η, with Q = Qheat / (ρ·cp·ΔT). Returns kW. */
export function pumpDesignKW(heatKW: number, deltaTK: number, headM: number, eff: number): number {
  const flowM3s = heatKW / (RHO * CP * deltaTK);
  return (RHO * G * headM * flowM3s) / eff / 1000;
}

/** Affinity law: power ∝ flow³, with a minimum flow floor. */
export function affinityKW(designKW: number, flowFrac: number, minFrac: number): number {
  return designKW * Math.pow(Math.max(flowFrac, minFrac), 3);
}

/**
 * Full-load COP from a Carnot fraction that falls smoothly at low lift:
 *   COP = η_max · T_evap / (lift + L0),   η_max = η_design · (lift_design + L0) / lift_design
 * At design lift this equals η_design · T_evap / lift (plain Carnot fraction). At low lift the
 * fixed losses (L0, a loss-equivalent lift) dominate, so COP stays finite and keeps responding
 * to ECWT. copMax is only a safety ceiling; hours where it binds are counted.
 */
export function fullLoadCop(chwsC: number, ecwtC: number, p: Params): number {
  const tEvap = chwsC - p.evapApproachK + K0;
  const lift = Math.max(ecwtC + p.condLiftAdderK + K0 - tEvap, 0);
  const liftDesign = p.designEcwtC + p.condLiftAdderK - (p.baselineChwsC - p.evapApproachK);
  const etaMax = (p.carnotEfficiency * (liftDesign + p.lossLiftK)) / liftDesign;
  return Math.min((etaMax * tEvap) / (lift + p.lossLiftK), p.copMax);
}

/** COP at part load: COP_full · PLR / (a + b·PLR + c·PLR²). Below minPlr the chiller is false-loaded. */
export function chillerKW(loadKW: number, n: number, unitCapKW: number, copFull: number, p: Params): number {
  if (loadKW <= 0 || n === 0) return 0;
  const plr = Math.max(loadKW / (n * unitCapKW), p.minPlr);
  const powerFrac = p.plrA + p.plrB * plr + p.plrC * plr * plr;
  return n * (unitCapKW / copFull) * powerFrac;
}

/** Waterside economizer fraction: share of the CHW return→supply ΔT the plate HX can provide. */
export function economizerFraction(wbC: number, chwsC: number, p: Params, approachK = p.towerApproachK): number {
  const hxOut = wbC + approachK + p.hxApproachK;
  const chwr = chwsC + p.chwDeltaTK;
  return Math.min(1, Math.max(0, (chwr - hxOut) / (chwr - chwsC)));
}

export interface PlantSize {
  nDuty: number;
  nInstalled: number;
  designLoadKW: number;
  designRejKW: number;
  chwPumpDesignKW: number;
  cwPumpDesignKW: number;
  fanDesignKW: number;
}

export function sizePlant(p: Params): PlantSize {
  const designLoadKW = p.itLoadMW * 1000;
  const chwPumpDesignKW = pumpDesignKW(designLoadKW, p.chwDeltaTK, p.chwPumpHeadM, p.pumpWireToWaterEff);
  const designCoolKW = designLoadKW + chwPumpDesignKW; // CHW pump heat is part of the chiller load
  const nDuty = Math.max(1, Math.ceil(designCoolKW / p.chillerUnitKW));
  const designCop = fullLoadCop(p.baselineChwsC, p.designEcwtC, p);
  const designRejKW = designCoolKW * (1 + 1 / designCop);
  return {
    nDuty,
    nInstalled: nDuty + 1, // N+1
    designLoadKW,
    designRejKW,
    chwPumpDesignKW,
    cwPumpDesignKW: pumpDesignKW(designRejKW, p.cwDeltaTK, p.cwPumpHeadM, p.pumpWireToWaterEff),
    fanDesignKW: p.towerFanDesignFrac * designRejKW,
  };
}

/**
 * Tower evaporation from an air-side balance (kg/h ≈ L/h).
 * Assumption: air leaves saturated at the mean of tower entering and leaving water temperature.
 *   m_air = Q_rej / (h_out − h_in),  evaporation = m_air · (w_out − w_in)
 * Clamped to 0.5-1.5 × Q_rej / h_fg; if h_out ≤ h_in the balance is undefined and Q_rej / h_fg is used.
 */
export function towerEvaporationKgH(qRejKW: number, towerLeaveC: number, rangeK: number, dbC: number, wbC: number, p: Params): number {
  if (qRejKW <= 0) return 0;
  const ref = (qRejKW * 3600) / p.latentHeatKJkg;
  const air = airState(dbC, wbC);
  const tOut = towerLeaveC + rangeK / 2;
  const wOut = humidityRatio(psatKPa(tOut));
  const hOut = enthalpy(tOut, wOut);
  if (hOut <= air.h) return ref;
  const evap = (qRejKW / (hOut - air.h)) * (wOut - air.w) * 3600;
  return Math.min(1.5 * ref, Math.max(0.5 * ref, evap));
}

export interface HourResult {
  mode: Mode;
  chwsC: number;
  /** Actual CHW supply; above chwsC only when chillers cannot carry the load. */
  supplyC: number;
  towerC: number;
  ecwtC: number;
  econFrac: number;
  nChillers: number;
  /** Fewest chillers that can carry the load; > nDuty means the N+1 redundancy is in use. */
  nRequired: number;
  plr: number;
  /** Chiller load as a fraction of installed (derated) N+1 capacity. */
  capUse: number;
  chillerKW: number;
  chwPumpKW: number;
  cwPumpKW: number;
  fanKW: number;
  mechKW: number;
  heatRejKW: number;
  cwRangeK: number;
  evapL: number;
  waterL: number;
  unmetKW: number;
  atCopLimit: boolean;
}

/** One steady-state plant hour. dbC defaults to wbC (saturated air) so callers without dry-bulb still work. */
export function simulateHour(wbC: number, loadKW: number, strategy: Strategy, p: Params, size: PlantSize, dbC = wbC): HourResult {
  const smart = strategy === 'smart';
  const chwsC = smart ? p.smartChwsC : p.baselineChwsC;

  // CHW pump flow follows IT load (constant ΔT); all CHW pump power ends up as heat in the CHW loop.
  const chwPumpKW = affinityKW(size.chwPumpDesignKW, loadKW / size.designLoadKW, p.pumpMinFlowFrac);
  const coolKW = loadKW + chwPumpKW;

  // Tower: first guess at design approach; if rejection exceeds design, approach grows (fans already at 100%).
  // One fixed-point pass is enough because rejection depends only weakly on approach.
  let approach = p.towerApproachK;
  let r = solveChillers(wbC, coolKW, chwsC, approach, smart, p, size);
  let rejRatio = r.heatRejKW / size.designRejKW;
  if (rejRatio > 1) {
    approach = p.towerApproachK * rejRatio;
    r = solveChillers(wbC, coolKW, chwsC, approach, smart, p, size);
    rejRatio = r.heatRejKW / size.designRejKW;
  }

  const cwFlowFrac = Math.max(rejRatio, p.pumpMinFlowFrac);
  const cwPumpKW = affinityKW(size.cwPumpDesignKW, rejRatio, p.pumpMinFlowFrac);
  // Fans: airflow ∝ heat rejected × (design approach / actual approach). When the tower is held warmer
  // than WB + approach (free-cooling setpoint, condenser-water floor, freeze floor) it needs less air.
  const actualApproach = Math.max(r.towerC - wbC, 0.1);
  const airFrac = rejRatio >= 1 ? 1 : rejRatio * Math.min(1, p.towerApproachK / actualApproach);
  const fanKW = size.fanDesignKW * Math.pow(airFrac, 3);
  const rangeK = (p.cwDeltaTK * rejRatio) / cwFlowFrac;
  const evapL = towerEvaporationKgH(r.heatRejKW, r.towerC, rangeK, dbC, wbC, p);
  const waterL = evapL * (1 + 1 / (p.cyclesOfConcentration - 1));

  return {
    ...r,
    chwsC,
    supplyC: chwsC + (p.chwDeltaTK * r.unmetKW) / coolKW,
    chwPumpKW,
    cwPumpKW,
    fanKW,
    mechKW: r.chillerKW + chwPumpKW + cwPumpKW + fanKW,
    cwRangeK: rangeK,
    evapL,
    waterL,
  };
}

function solveChillers(wbC: number, loadKW: number, chwsC: number, approachK: number, smart: boolean, p: Params, size: PlantSize) {
  const econFrac = smart ? economizerFraction(wbC, chwsC, p, approachK) : 0;
  const mode: Mode = econFrac >= 1 ? 'free' : econFrac > 0 ? 'partial' : 'chiller';
  // Tower leaving water: full free cooling holds CHWS − HX approach; partial runs as cold as possible;
  // chillers-only holds the condenser-water floor. Never below the freeze-protection floor.
  const coldest = wbC + approachK;
  const towerC = Math.max(
    p.freezeMinTowerC,
    mode === 'free' ? chwsC - p.hxApproachK : mode === 'partial' ? coldest : Math.max(coldest, p.minCondWaterC),
  );
  const ecwtC = Math.max(towerC, p.minCondWaterC); // partial mode: chiller side mixes up to the floor
  const chLoad = loadKW * (1 - econFrac);

  const unitCap = p.chillerUnitKW * (1 - p.capDeratePerK * Math.max(0, ecwtC - p.designEcwtC));
  const copFull = fullLoadCop(chwsC, ecwtC, p);
  const nRequired = chLoad > 0 ? Math.ceil(chLoad / unitCap) : 0;
  const nMin = Math.min(size.nInstalled, nRequired);

  // Baseline: stage by load only (fewest chillers that carry the load).
  // Smart: try every count from nMin up to the allowed maximum and keep the lowest kW.
  // With keep-standby on, the N+1 unit only starts when the load actually needs it.
  let n = nMin;
  let kw = chillerKW(Math.min(chLoad, n * unitCap), n, unitCap, copFull, p);
  if (smart) {
    const nMax = p.smartKeepStandby ? Math.max(size.nDuty, nMin) : size.nInstalled;
    for (let k = nMin + 1; k <= nMax && nMin > 0; k++) {
      const kwK = chillerKW(chLoad, k, unitCap, copFull, p);
      if (kwK < kw) [n, kw] = [k, kwK];
    }
  }
  const served = Math.min(chLoad, n * unitCap);
  return {
    mode,
    towerC,
    ecwtC,
    econFrac,
    nChillers: n,
    nRequired,
    plr: n ? served / (n * unitCap) : 0,
    capUse: chLoad / (size.nInstalled * unitCap),
    chillerKW: kw,
    heatRejKW: loadKW * econFrac + served + kw,
    unmetKW: chLoad - served,
    atCopLimit: n > 0 && copFull >= p.copMax,
  };
}
