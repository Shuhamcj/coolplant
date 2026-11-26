/**
 * Every assumed number in the model lives here, with a label, unit and note.
 * The UI renders this table directly, so nothing is hidden.
 * None of these values are calibrated to a real facility.
 */
export interface Params {
  // Load
  itLoadMW: number;
  aiSpikePct: number;
  aiSpikeStartProb: number;
  // Chilled water
  baselineChwsC: number;
  maxServerInletC: number;
  smartChwsC: number;
  airSideApproachK: number;
  chwDeltaTK: number;
  // Chillers
  chillerUnitKW: number;
  smartKeepStandby: boolean;
  carnotEfficiency: number;
  lossLiftK: number;
  evapApproachK: number;
  condLiftAdderK: number;
  copMax: number;
  minPlr: number;
  plrA: number;
  plrB: number;
  plrC: number;
  designEcwtC: number;
  capDeratePerK: number;
  minCondWaterC: number;
  maxEcwtC: number;
  // Towers + economizer
  towerApproachK: number;
  freezeMinTowerC: number;
  hxApproachK: number;
  towerFanDesignFrac: number;
  // Pumps
  chwPumpHeadM: number;
  cwPumpHeadM: number;
  cwDeltaTK: number;
  pumpWireToWaterEff: number;
  pumpMinFlowFrac: number;
  // Water
  latentHeatKJkg: number;
  cyclesOfConcentration: number;
}

export const DEFAULTS: Params = {
  itLoadMW: 10,
  aiSpikePct: 30,
  aiSpikeStartProb: 0.03,
  baselineChwsC: 7,
  maxServerInletC: 27,
  smartChwsC: 20,
  airSideApproachK: 7,
  chwDeltaTK: 6,
  chillerUnitKW: 3517, // 1,000 tons
  smartKeepStandby: true,
  carnotEfficiency: 0.68,
  lossLiftK: 20,
  evapApproachK: 2,
  condLiftAdderK: 7,
  copMax: 14,
  minPlr: 0.15,
  plrA: 0.2229,
  plrB: 0.3134,
  plrC: 0.4637,
  designEcwtC: 29.4,
  capDeratePerK: 0.015,
  minCondWaterC: 15.5,
  maxEcwtC: 40,
  towerApproachK: 4,
  freezeMinTowerC: 10,
  hxApproachK: 1.5,
  towerFanDesignFrac: 0.011,
  chwPumpHeadM: 30,
  cwPumpHeadM: 25,
  cwDeltaTK: 5.5,
  pumpWireToWaterEff: 0.7,
  pumpMinFlowFrac: 0.3,
  latentHeatKJkg: 2430,
  cyclesOfConcentration: 4,
};

export const PARAM_INFO: Record<keyof Params, { label: string; unit: string; note: string; group: string }> = {
  itLoadMW: { group: 'Load', label: 'IT load (design)', unit: 'MW', note: 'All IT power assumed to become heat in the CHW loop. Plant is sized to this value.' },
  aiSpikePct: { group: 'Load', label: 'AI-rack spike size', unit: '% of IT', note: 'Synthetic, seeded bursts of 2-6 h when spikes are enabled.' },
  aiSpikeStartProb: { group: 'Load', label: 'Spike start probability', unit: 'per hour', note: 'Seeded PRNG, same pattern every run.' },
  baselineChwsC: { group: 'Chilled water', label: 'Baseline CHW supply', unit: '°C', note: 'Legacy fixed setpoint (≈44.6 °F).' },
  maxServerInletC: { group: 'Chilled water', label: 'Max server inlet', unit: '°C', note: 'ASHRAE TC 9.9 recommended envelope upper limit (18-27 °C).' },
  smartChwsC: { group: 'Chilled water', label: 'Smart CHW supply (elevated setpoint)', unit: '°C', note: 'Fixed elevated setpoint, not a dynamic reset. Slider 14-20 °C; max = 27 − 7 so inlet stays ≤ 27 °C.' },
  airSideApproachK: { group: 'Chilled water', label: 'CHWS → server inlet approach', unit: 'K', note: 'Coil approach + mixing/bypass. Server inlet ≈ CHWS + this.' },
  chwDeltaTK: { group: 'Chilled water', label: 'CHW ΔT', unit: 'K', note: 'Held constant; flow varies with load (variable primary).' },
  chillerUnitKW: { group: 'Chillers', label: 'Chiller unit capacity', unit: 'kW', note: '3,517 kW = 1,000 tons. N = ceil(IT/unit), installed N+1.' },
  smartKeepStandby: { group: 'Chillers', label: 'Smart: keep one chiller on standby', unit: '', note: 'If true, Smart staging may not start the N+1 unit unless load needs it.' },
  carnotEfficiency: { group: 'Chillers', label: 'Fraction of Carnot COP at design lift', unit: '–', note: 'Gives ≈0.58 kW/ton at 7 °C CHWS / 29.4 °C ECWT, full load.' },
  lossLiftK: { group: 'Chillers', label: 'Loss-equivalent lift', unit: 'K', note: 'COP ∝ T_evap / (lift + this). Makes Carnot fraction fall smoothly at low lift.' },
  evapApproachK: { group: 'Chillers', label: 'Evaporator approach', unit: 'K', note: 'T_evap = CHWS − this.' },
  condLiftAdderK: { group: 'Chillers', label: 'Condenser lift adder', unit: 'K', note: 'T_cond = ECWT + this (CW range 5.5 K + 1.5 K approach).' },
  copMax: { group: 'Chillers', label: 'COP safety ceiling', unit: '–', note: '≈0.25 kW/ton. Should rarely bind; hours at this limit are reported.' },
  minPlr: { group: 'Chillers', label: 'Min part-load ratio', unit: '–', note: 'Below this the chiller is false-loaded (power at min PLR).' },
  plrA: { group: 'Chillers', label: 'Part-load curve a', unit: '–', note: 'Power fraction = a + b·PLR + c·PLR². Shape typical of VSD centrifugal; illustrative.' },
  plrB: { group: 'Chillers', label: 'Part-load curve b', unit: '–', note: 'a+b+c = 1 so power = full-load power at PLR 1.' },
  plrC: { group: 'Chillers', label: 'Part-load curve c', unit: '–', note: 'Best efficiency near PLR ≈ 0.69.' },
  designEcwtC: { group: 'Chillers', label: 'Design entering CW temp', unit: '°C', note: '85 °F, AHRI 550/590 standard rating condition.' },
  capDeratePerK: { group: 'Chillers', label: 'Capacity derate', unit: '1/K', note: 'Capacity loss per K of ECWT above design.' },
  minCondWaterC: { group: 'Chillers', label: 'Min condenser water', unit: '°C', note: 'Head-pressure floor for chiller ECWT (not applied to the economizer HX).' },
  maxEcwtC: { group: 'Chillers', label: 'Max entering CW temp', unit: '°C', note: 'Flag only (≈104 °F). Hours above it are reported in the heatwave test; real chillers may trip on high head pressure there.' },
  towerApproachK: { group: 'Towers & economizer', label: 'Tower approach', unit: 'K', note: 'Tower leaving water = wet-bulb + approach (fans modulate to hold it).' },
  freezeMinTowerC: { group: 'Towers & economizer', label: 'Min tower leaving water', unit: '°C', note: 'Freeze protection. In full free cooling the tower is held at CHWS − HX approach, never below this.' },
  hxApproachK: { group: 'Towers & economizer', label: 'Plate HX approach', unit: 'K', note: 'Economizer CHW leaving = tower water + this.' },
  towerFanDesignFrac: { group: 'Towers & economizer', label: 'Tower fan design power', unit: 'kW/kW rejected', note: 'Fan kW = frac × design rejection × (airflow fraction)³; airflow ∝ rejection × design approach / actual approach.' },
  chwPumpHeadM: { group: 'Pumps', label: 'CHW pump head', unit: 'm', note: '≈100 ft. P = ρ·g·H·Q / η at design flow.' },
  cwPumpHeadM: { group: 'Pumps', label: 'CW pump head', unit: 'm', note: '≈80 ft.' },
  cwDeltaTK: { group: 'Pumps', label: 'CW ΔT (design)', unit: 'K', note: '≈10 °F condenser range.' },
  pumpWireToWaterEff: { group: 'Pumps', label: 'Pump wire-to-water efficiency', unit: '–', note: 'Motor × VFD × pump.' },
  pumpMinFlowFrac: { group: 'Pumps', label: 'Min pump flow fraction', unit: '–', note: 'Pump/fan affinity law (cube) applied above this floor.' },
  latentHeatKJkg: { group: 'Water', label: 'Latent heat of vaporization', unit: 'kJ/kg', note: 'At ≈30 °C. Only sets the 0.5-1.5 × Q_rej / h_fg clamp on the air-side evaporation balance.' },
  cyclesOfConcentration: { group: 'Water', label: 'Cycles of concentration', unit: '–', note: 'Blowdown = evaporation / (COC − 1). Drift ignored.' },
};
