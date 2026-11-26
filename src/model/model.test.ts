import { describe, expect, it } from 'vitest';
import { DEFAULTS as P } from './params';
import { humidityRatio, psatKPa, stullWetBulb } from './psychro';
import { supplyTempC, affinityKW, chillerKW, economizerFraction, fullLoadCop, pumpDesignKW, simulateHour, sizePlant, towerEvaporationKgH } from './plant';
import { itLoadProfile, simulateYear, windowStats, heatwaveHours, HOURS, MONTH_OF_HOUR } from './annual';
import ashburn from '../data/weather/ashburn.json';
import phoenix from '../data/weather/phoenix.json';
import dublin from '../data/weather/dublin.json';
import councilBluffs from '../data/weather/council-bluffs.json';
import singapore from '../data/weather/singapore.json';

const size = sizePlant(P);

describe('Stull wet-bulb', () => {
  it('matches the worked example in Stull (2011): 20 °C, 50 % RH → 13.7 °C', () => {
    expect(stullWetBulb(20, 50)).toBeCloseTo(13.7, 1);
  });
  it('approaches dry-bulb near saturation and never exceeds it', () => {
    expect(stullWetBulb(25, 99)).toBeGreaterThan(24.6);
    expect(stullWetBulb(30, 100)).toBeLessThanOrEqual(30);
  });
  it('drops with humidity', () => {
    expect(stullWetBulb(35, 10)).toBeLessThan(stullWetBulb(35, 40));
  });
});

describe('pumps and fans', () => {
  it('pump design power = ρgHQ/η (10 MW, 6 K, 30 m, 0.7 → ≈167 kW)', () => {
    // Q = 10000 / (1000·4.186·6) = 0.3981 m³/s; P = 1000·9.81·30·0.3981/0.7 = 167.4 kW
    expect(pumpDesignKW(10000, 6, 30, 0.7)).toBeCloseTo(167.4, 0);
  });
  it('affinity law: half flow → one-eighth power, with floor', () => {
    expect(affinityKW(100, 0.5, 0.3)).toBeCloseTo(12.5, 6);
    expect(affinityKW(100, 0.1, 0.3)).toBeCloseTo(2.7, 6);
  });
});

describe('chiller', () => {
  it('design COP ≈ 6 (≈0.58 kW/ton) at 7 °C CHWS / 29.4 °C ECWT', () => {
    const cop = fullLoadCop(7, 29.4, P);
    expect(cop).toBeGreaterThan(5.7);
    expect(cop).toBeLessThan(6.3);
  });
  it('COP rises with warmer CHWS and colder condenser water', () => {
    expect(fullLoadCop(12, 29.4, P)).toBeGreaterThan(fullLoadCop(7, 29.4, P));
    expect(fullLoadCop(7, 20, P)).toBeGreaterThan(fullLoadCop(7, 29.4, P));
  });
  it('low-lift COP stays finite and below the safety ceiling at the 20 °C CHWS / 15.5 °C ECWT corner', () => {
    const cop = fullLoadCop(20, 15.5, P);
    expect(cop).toBeLessThan(P.copMax);
    expect(cop).toBeGreaterThan(fullLoadCop(20, 20, P));
  });
  it('Smart chiller kW rises with ECWT at fixed CHWS and load (no flat region from a COP cap)', () => {
    // WB 21-27 °C: economizer is off for 20 °C CHWS, so only ECWT changes.
    const kws = [21, 22, 23, 24, 25, 26, 27].map((wb) => simulateHour(wb, 8000, 'smart', P, size));
    kws.forEach((r) => expect(r.mode).toBe('chiller'));
    for (let i = 1; i < kws.length; i++) {
      expect(kws[i].ecwtC).toBeGreaterThan(kws[i - 1].ecwtC);
      expect(kws[i].chillerKW).toBeGreaterThan(kws[i - 1].chillerKW);
    }
  });
  it('part-load curve sums to full-load power at PLR 1 and is most efficient near 0.69', () => {
    const full = chillerKW(3517, 1, 3517, 6, P);
    expect(full).toBeCloseTo(3517 / 6, 6);
    const kwPerKw = (plr: number) => chillerKW(plr * 3517, 1, 3517, 6, P) / (plr * 3517);
    expect(kwPerKw(0.69)).toBeLessThan(kwPerKw(1));
    expect(kwPerKw(0.69)).toBeLessThan(kwPerKw(0.3));
  });
});

describe('economizer', () => {
  // smart CHWS = 27 − 7 = 20 °C, CHWR = 26 °C; HX leaving = WB + 4 + 1.5
  it('full free cooling when WB + 5.5 ≤ CHWS', () => expect(economizerFraction(14.5, 20, P)).toBe(1));
  it('partial when CHWS < WB + 5.5 < CHWR', () => expect(economizerFraction(17.5, 20, P)).toBeCloseTo(0.5, 6));
  it('off when WB + 5.5 ≥ CHWR', () => expect(economizerFraction(21, 20, P)).toBe(0));
  it('free-cooling hour runs no chillers', () => {
    const r = simulateHour(5, 10000, 'smart', P, size);
    expect(r.mode).toBe('free');
    expect(r.chillerKW).toBe(0);
    expect(r.nChillers).toBe(0);
  });
});

describe('plant hour', () => {
  it('sizes N+1: 10 MW / 3,517 kW → 3 duty + 1 standby', () => {
    expect(size.nDuty).toBe(3);
    expect(size.nInstalled).toBe(4);
  });
  it('energy balance: heat rejected = IT load + CHW pump heat + compressor work (no economizer)', () => {
    const r = simulateHour(24, 10000, 'baseline', P, size);
    expect(r.chwPumpKW).toBeGreaterThan(100);
    expect(r.heatRejKW).toBeCloseTo(10000 + r.chwPumpKW + r.chillerKW, 6);
  });
  it('CHW pump heat raises chiller kW', () => {
    const r = simulateHour(24, 10000, 'baseline', P, size);
    const noHeat = chillerKW(10000, r.nChillers, P.chillerUnitKW, fullLoadCop(7, r.ecwtC, P), P);
    expect(r.chillerKW).toBeGreaterThan(noHeat);
  });
  it('makeup = evaporation · COC/(COC−1), evaporation within 0.5-1.5 × Q_rej/h_fg', () => {
    const r = simulateHour(24, 10000, 'baseline', P, size, 30);
    const ref = (r.heatRejKW * 3600) / 2430;
    expect(r.waterL).toBeCloseTo(r.evapL * (4 / 3), 6);
    expect(r.evapL).toBeGreaterThanOrEqual(0.5 * ref);
    expect(r.evapL).toBeLessThanOrEqual(1.5 * ref);
  });
  it('smart staging never uses more chiller power than load-only staging at the same CHWS', () => {
    const p2 = { ...P, smartChwsC: P.baselineChwsC, smartKeepStandby: false }; // same CHWS, economizer can't help at WB 26
    for (const load of [2000, 4000, 6000, 8000, 10000]) {
      const b = simulateHour(26, load, 'baseline', p2, size);
      const s = simulateHour(26, load, 'smart', p2, size);
      expect(s.chillerKW).toBeLessThanOrEqual(b.chillerKW + 1e-9);
    }
  });
  it('keep-standby holds Smart to N chillers unless the load needs N+1', () => {
    const on = simulateHour(26, 9000, 'smart', P, size);
    const off = simulateHour(26, 9000, 'smart', { ...P, smartKeepStandby: false }, size);
    expect(on.nChillers).toBeLessThanOrEqual(size.nDuty);
    expect(off.nChillers).toBe(size.nInstalled);
    expect(off.chillerKW).toBeLessThan(on.chillerKW);
    const spike = simulateHour(26, 13000, 'smart', P, size); // needs 4 units even with standby held
    expect(spike.nChillers).toBe(size.nInstalled);
  });
  it('flags unmet load when demand exceeds installed capacity', () => {
    const r = simulateHour(26, 16000, 'baseline', P, size);
    expect(r.nChillers).toBe(4);
    expect(r.unmetKW).toBeGreaterThan(0);
  });
});

describe('tower air-side water balance', () => {
  it('hot dry air evaporates more per kJ than humid air at the same wet-bulb', () => {
    const dry = towerEvaporationKgH(10000, 28, 5.5, 40, 22, P);
    const humid = towerEvaporationKgH(10000, 28, 5.5, 23, 22, P);
    expect(dry).toBeGreaterThan(humid);
  });
  it('cold winter air takes more heat sensibly, so evaporation is below Q/h_fg', () => {
    const ref = (10000 * 3600) / 2430;
    expect(towerEvaporationKgH(10000, 18.5, 5.5, -5, -6, P)).toBeLessThan(ref);
  });
  it('July evaporation per MWh rejected is higher in Phoenix than in Dublin', () => {
    const perMWh = (w: typeof ashburn) => {
      const run = simulateYear(w, P, { spikes: false, gridKgCO2PerKWh: 0.3 }).baseline;
      let evap = 0, rej = 0;
      run.hours.forEach((r, h) => { if (MONTH_OF_HOUR[h] === 6) { evap += r.evapL; rej += r.heatRejKW / 1000; } });
      return evap / rej; // L per MWh rejected
    };
    expect(perMWh(phoenix)).toBeGreaterThan(perMWh(dublin));
  });
});

describe('tower in free cooling', () => {
  it('holds tower water at CHWS − HX approach, not WB + approach, and cuts fan power', () => {
    const r = simulateHour(0, 10000, 'smart', P, size);
    expect(r.mode).toBe('free');
    expect(r.towerC).toBeCloseTo(P.smartChwsC - P.hxApproachK, 6);
    const coldTowerFan = size.fanDesignKW * Math.pow(r.heatRejKW / size.designRejKW, 3);
    expect(r.fanKW).toBeLessThan(coldTowerFan);
  });
  it('never drops tower water below the 10 °C freeze floor', () => {
    const r = simulateHour(-15, 10000, 'smart', { ...P, smartChwsC: 11 }, size);
    expect(r.mode).toBe('free');
    expect(r.towerC).toBe(10);
  });
});

describe('heatwave', () => {
  const hw = { deltaC: 8, days: 7, startDay: 195 };
  const [a, b] = heatwaveHours(hw);
  const opts = { spikes: false, gridKgCO2PerKWh: 0.3 };
  const base = simulateYear(ashburn, P, opts);
  const hot = simulateYear(ashburn, P, { ...opts, heatwave: hw });
  it('adds +X to dry-bulb only, holds humidity ratio, and recomputes RH and wet-bulb', () => {
    const w = (t: number, rh: number) => { const pv = (rh / 100) * psatKPa(t); return humidityRatio(pv); };
    for (const h of [a, a + 13, b - 1]) {
      expect(hot.dbC[h] - base.dbC[h]).toBeCloseTo(8, 6);
      expect(hot.rh[h]).toBeLessThan(base.rh[h]);
      expect(w(hot.dbC[h], hot.rh[h])).toBeCloseTo(w(base.dbC[h], base.rh[h]), 9);
      expect(hot.wbC[h]).toBeGreaterThan(base.wbC[h]);
      expect(hot.wbC[h] - base.wbC[h]).toBeLessThan(8); // wet-bulb rises less than dry-bulb at constant w
    }
    expect(hot.dbC[b]).toBe(base.dbC[b]);
    expect(hot.wbC[b]).toBe(base.wbC[b]);
  });
  it('wet-bulb never exceeds dry-bulb, in any city, with or without a heatwave', () => {
    for (const w of [ashburn, phoenix, councilBluffs, dublin, singapore]) {
      for (const r of [simulateYear(w, P, opts), simulateYear(w, P, { ...opts, heatwave: { deltaC: 12, days: 14, startDay: 190 } })]) {
        r.wbC.forEach((wb, h) => expect(wb).toBeLessThanOrEqual(r.dbC[h]));
      }
    }
  });
  it('with all N+1 units available, the plant rides through +8 °C', () => {
    expect(windowStats(hot, hot.baseline, a, b, P).capacityExceededHours).toBe(0);
  });
  it('with the N+1 unit out of service, the same heatwave exceeds capacity and CHW supply rises', () => {
    const out = simulateYear(ashburn, P, { ...opts, heatwave: { ...hw, unitOut: true } });
    const s = windowStats(out, out.baseline, a, b, P);
    expect(s.capacityExceededHours).toBeGreaterThan(0);
    // Supply counts as above setpoint past a 0.05 K deadband, so tiny shortfalls may not register.
    expect(s.supplyAboveSetpointHours).toBeGreaterThan(0);
    expect(s.supplyAboveSetpointHours).toBeLessThanOrEqual(s.capacityExceededHours);
    expect(s.peakSupplyC).toBeGreaterThan(P.baselineChwsC);
    expect(s.peakInletC).toBeGreaterThan(P.baselineChwsC + P.airSideApproachK);
    expect(s.peakChillersOn).toBe(size.nInstalled - 1);
    // Outside the window all units are back.
    expect(out.baseline.hours[b].nAvailable).toBe(size.nInstalled);
  });
  it('short capacity with chillers running: supply settles where capacity (+3 %/K) meets load', () => {
    expect(supplyTempC(20, 10000, 0, 9000, P)).toBe(20);
    expect(supplyTempC(20, 10000, 300, 9700, P)).toBeCloseTo(20 + 300 / 9700 / 0.03, 9); // ≈ +1.03 K
    expect(supplyTempC(7, 10000, 10000, 0, P)).toBeCloseTo(7 + 6, 9); // all tripped: lower bound CHWS + ΔT
  });
  it('server-inlet and CHW-supply hour counts match when Smart CHWS + 7 K = 27 °C (shared tolerance)', () => {
    expect(P.smartChwsC + P.airSideApproachK).toBe(P.maxServerInletC);
    const hw14 = { deltaC: 12, days: 14, startDay: 195, unitOut: true };
    const [s0, s1] = heatwaveHours(hw14);
    for (const w of [ashburn, singapore]) {
      const r = simulateYear(w, P, { ...opts, heatwave: hw14 });
      const st = windowStats(r, r.smart, s0, s1, P);
      expect(st.supplyAboveSetpointHours).toBeGreaterThan(0);
      expect(st.inletOverLimitHours).toBe(st.supplyAboveSetpointHours);
    }
  });
  it('ECWT above 40 °C trips the chillers: capacity drops to zero and CHW supply rises', () => {
    const ok = simulateHour(35, 10000, 'baseline', P, size); // ECWT ≈ 39 °C
    expect(ok.tripped).toBe(false);
    expect(ok.nChillers).toBeGreaterThan(0);
    const trip = simulateHour(37, 10000, 'baseline', P, size); // ECWT ≈ 41 °C
    expect(trip.ecwtC).toBeGreaterThan(P.maxEcwtC);
    expect(trip.tripped).toBe(true);
    expect(trip.nChillers).toBe(0);
    expect(trip.chillerKW).toBe(0);
    expect(trip.unmetKW).toBeCloseTo(10000 + trip.chwPumpKW, 6);
    expect(trip.supplyC).toBeCloseTo(P.baselineChwsC + P.chwDeltaTK, 6);
  });
  it('Clear restores the original annual totals (heatwave does not mutate cached weather)', () => {
    const before = JSON.stringify(ashburn);
    simulateYear(ashburn, P, { ...opts, heatwave: { ...hw, unitOut: true } });
    expect(JSON.stringify(ashburn)).toBe(before);
    const again = simulateYear(ashburn, P, opts);
    expect(again.baseline.totals).toEqual(base.baseline.totals);
    expect(again.smart.totals).toEqual(base.smart.totals);
  });
});

describe('annual (Ashburn cached weather)', () => {
  const res = simulateYear(ashburn, P, { spikes: false, gridKgCO2PerKWh: 0.3 });
  it('has 8,760 hours of weather', () => {
    expect(ashburn.tempC).toHaveLength(HOURS);
    expect(res.baseline.hours).toHaveLength(HOURS);
  });
  it('smart uses less energy and has economizer hours; baseline has none', () => {
    expect(res.smart.totals.mechKWh).toBeLessThan(res.baseline.totals.mechKWh);
    expect(res.smart.totals.freeHours).toBeGreaterThan(0);
    expect(res.baseline.totals.freeHours + res.baseline.totals.partialHours).toBe(0);
  });
  it('pPUE is in a plausible mechanical-only range', () => {
    expect(res.baseline.totals.pPUE).toBeGreaterThan(1.05);
    expect(res.baseline.totals.pPUE).toBeLessThan(1.4);
    expect(res.smart.totals.pPUE).toBeGreaterThan(1);
  });
  it('AI spikes raise IT energy and are deterministic', () => {
    const a = itLoadProfile(P, true);
    expect(a.reduce((s, x) => s + x, 0)).toBeGreaterThan(P.itLoadMW * 1000 * HOURS);
    expect(itLoadProfile(P, true)).toEqual(a);
  });
});
