import { describe, expect, it } from 'vitest';
import { DEFAULTS as P } from './params';
import { stullWetBulb } from './psychro';
import { affinityKW, chillerKW, economizerFraction, fullLoadCop, pumpDesignKW, simulateHour, sizePlant, towerEvaporationKgH } from './plant';
import { itLoadProfile, simulateYear, windowStats, heatwaveHours, HOURS, MONTH_OF_HOUR } from './annual';
import ashburn from '../data/weather/ashburn.json';
import phoenix from '../data/weather/phoenix.json';
import dublin from '../data/weather/dublin.json';

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
  const opts = { spikes: true, gridKgCO2PerKWh: 0.3 };
  const base = simulateYear(ashburn, P, opts);
  const hot = simulateYear(ashburn, P, { ...opts, heatwave: hw });
  it('adds +X to wet-bulb and dry-bulb only inside the window', () => {
    expect(hot.wbC[a] - base.wbC[a]).toBeCloseTo(8, 6);
    expect(hot.dbC[b - 1] - base.dbC[b - 1]).toBeCloseTo(8, 6);
    expect(hot.wbC[b]).toBe(base.wbC[b]);
  });
  it('flat load at +8 °C: N+1 absorbs it, but the standby chiller is needed (redundancy lost)', () => {
    const flat = simulateYear(ashburn, P, { spikes: false, gridKgCO2PerKWh: 0.3, heatwave: hw });
    const s = windowStats(flat, flat.baseline, a, b, P.maxEcwtC);
    expect(s.capacityExceededHours).toBe(0);
    expect(s.redundancyLostHours).toBeGreaterThan(0);
  });
  it('AI spikes + 8 °C heatwave exceed derated N+1 capacity and lift CHW supply above setpoint', () => {
    const s0 = windowStats(base, base.baseline, a, b, P.maxEcwtC);
    const s1 = windowStats(hot, hot.baseline, a, b, P.maxEcwtC);
    expect(s1.peakCapUse).toBeGreaterThan(s0.peakCapUse);
    expect(s0.capacityExceededHours).toBe(0);
    expect(s1.capacityExceededHours).toBeGreaterThan(0);
    expect(s1.supplyAboveSetpointHours).toBe(s1.capacityExceededHours);
    expect(s1.peakSupplyC).toBeGreaterThan(P.baselineChwsC);
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
