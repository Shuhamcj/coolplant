/**
 * Wet-bulb temperature from dry-bulb and relative humidity, Stull (2011):
 * "Wet-Bulb Temperature from Relative Humidity and Air Temperature",
 * J. Appl. Meteor. Climatol. 50, 2267-2269.
 *
 * Tw = T·atan(0.151977·(RH + 8.313659)^0.5) + atan(T + RH) − atan(RH − 1.676331)
 *      + 0.00391838·RH^1.5·atan(0.023101·RH) − 4.686035
 *
 * T in °C, RH in % (0-100). Stated validity: RH 5-99 %, T −20 to 50 °C, sea-level
 * pressure; error mostly within ±0.3 °C. Outside that range we clamp RH and also
 * never return a wet-bulb above the dry-bulb.
 */
export function stullWetBulb(tC: number, rhPct: number): number {
  const rh = Math.min(99, Math.max(5, rhPct));
  const tw =
    tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;
  return Math.min(tw, tC);
}

// ---- Moist-air properties at sea-level pressure (101.325 kPa) ----
const P_ATM = 101.325; // kPa

/** Saturation vapour pressure over water, Magnus form (Alduchov & Eskridge 1996), kPa. */
export function psatKPa(tC: number): number {
  return 0.61094 * Math.exp((17.625 * tC) / (tC + 243.04));
}

/** Humidity ratio from vapour pressure, kg water / kg dry air. */
export function humidityRatio(pvKPa: number): number {
  return (0.622 * pvKPa) / (P_ATM - pvKPa);
}

/** Moist-air enthalpy, kJ / kg dry air: h = 1.006·T + w·(2501 + 1.86·T). */
export function enthalpy(tC: number, w: number): number {
  return 1.006 * tC + w * (2501 + 1.86 * tC);
}

export function satEnthalpy(tC: number): number {
  return enthalpy(tC, humidityRatio(psatKPa(tC)));
}

/**
 * Entering-air state from dry-bulb and wet-bulb. Uses the usual approximation that enthalpy is
 * constant along a wet-bulb line: h_in ≈ h_sat(WB), then w_in = (h_in − 1.006·DB) / (2501 + 1.86·DB).
 * Working from DB + WB (not RH) lets the heatwave test shift both temperatures directly.
 */
export function airState(dbC: number, wbC: number): { h: number; w: number } {
  const h = satEnthalpy(wbC);
  return { h, w: Math.max(0, (h - 1.006 * dbC) / (2501 + 1.86 * dbC)) };
}
