import { useMemo, useState } from 'react';
import cities from './data/cities.json';
import ashburn from './data/weather/ashburn.json';
import phoenix from './data/weather/phoenix.json';
import councilBluffs from './data/weather/council-bluffs.json';
import dublin from './data/weather/dublin.json';
import singapore from './data/weather/singapore.json';
import { DEFAULTS, PARAM_INFO, type Params } from './model/params';
import { simulateYear, windowStats, heatwaveHours, L_PER_GAL, type Heatwave } from './model/annual';
import { Schematic } from './components/Schematic';
import type { Strategy } from './model/plant';
import { ModeTimeline } from './components/ModeTimeline';
import { CityCompare, MonthlyBars, PPUELine } from './components/Charts';
import { MODE_COLOR, MODE_LABEL, STRAT_COLOR, fmt } from './format';

// Cached Open-Meteo 2025 weather, same order as cities.json.
const WEATHER: Record<string, typeof ashburn> = { ashburn, phoenix, 'council-bluffs': councilBluffs, dublin, singapore };

const hourLabel = (h: number) =>
  new Date(Date.UTC(2025, 0, 1) + h * 3600e3).toLocaleString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }) + ' local';

function Card({ title, value, sub, note }: { title: string; value: string; sub?: string; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-sm text-slate-600">{sub}</div>}
      {note && <div className="mt-1 text-[11px] text-slate-400">{note}</div>}
    </div>
  );
}

function Panel({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {note && <p className="mb-2 text-xs text-slate-500">{note}</p>}
      {children}
    </section>
  );
}

export default function App() {
  const [itLoadMW, setItLoadMW] = useState(DEFAULTS.itLoadMW);
  const [spikes, setSpikes] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>('smart');
  const [hour, setHour] = useState(4800);
  const [cityId, setCityId] = useState('ashburn');
  const [smartChwsC, setSmartChwsC] = useState(DEFAULTS.smartChwsC);
  const [keepStandby, setKeepStandby] = useState(DEFAULTS.smartKeepStandby);

  const p: Params = useMemo(() => ({ ...DEFAULTS, itLoadMW, smartChwsC, smartKeepStandby: keepStandby }), [itLoadMW, smartChwsC, keepStandby]);
  // All five cities are simulated every time so the comparison view always matches the controls.
  const all = useMemo(
    () => cities.map((c) => ({ city: c, res: simulateYear(WEATHER[c.id], p, { spikes, gridKgCO2PerKWh: c.gridKgCO2PerKWh }) })),
    [p, spikes],
  );
  const { city, res: normal } = all.find((x) => x.city.id === cityId)!;
  const weather = WEATHER[cityId];
  // Heatwave test: controls stage a scenario; Apply re-runs the selected city with it (comparison table stays on normal weather).
  const [hwDraft, setHwDraft] = useState<Heatwave>({ deltaC: 5, days: 5, startDay: 195 });
  const [hw, setHw] = useState<Heatwave | null>(null);
  const hot = useMemo(() => (hw ? simulateYear(weather, p, { spikes, gridKgCO2PerKWh: city.gridKgCO2PerKWh, heatwave: hw }) : null), [hw, weather, p, spikes, city]);
  const res = hot ?? normal;
  const b = res.baseline.totals;
  const s = res.smart.totals;
  const run = res[strategy];
  const hr = run.hours[hour];

  const rows: [string, number, number][] = [
    ['Plant energy (MWh)', b.mechKWh / 1e3, s.mechKWh / 1e3],
    ['   Chillers (MWh)', b.chillerKWh / 1e3, s.chillerKWh / 1e3],
    ['   Pumps (MWh)', b.pumpKWh / 1e3, s.pumpKWh / 1e3],
    ['   Tower fans (MWh)', b.fanKWh / 1e3, s.fanKWh / 1e3],
    ['Water (M gal)', b.waterGal / 1e6, s.waterGal / 1e6],
    ['CO₂ (t)', b.co2Tonnes, s.co2Tonnes],
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">
          CoolPlant <span className="font-normal text-slate-500">· weather-smart data center cooling plant simulator</span>
        </h1>
        <p className="text-sm text-slate-600">
          Hourly, 8,760-hour model of a water-cooled chilled water plant (N+1 chillers, cooling towers, waterside economizer) on real{' '}
          {weather.year} weather. Educational model with stated assumptions. <b>Not validated against a real facility.</b>
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <div className="text-xs text-slate-500">City</div>
          <select value={cityId} onChange={(e) => setCityId(e.target.value)} className="rounded border border-slate-300 px-2 py-1 font-medium">
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="text-[11px] text-slate-400">Weather: Open-Meteo archive {weather.year} (cached)</div>
        </div>
        <label className="block w-64">
          <div className="text-xs text-slate-500">
            IT load: <b className="text-slate-800">{itLoadMW} MW</b> (plant sized to this)
          </div>
          <input type="range" min={1} max={50} step={1} value={itLoadMW} onChange={(e) => setItLoadMW(+e.target.value)} className="w-full accent-teal-600" />
        </label>
        <label className="block w-56">
          <div className="text-xs text-slate-500">
            Smart CHWS: <b className="text-slate-800">{smartChwsC} °C</b> (inlet ≈ {smartChwsC + DEFAULTS.airSideApproachK} °C)
          </div>
          <input type="range" min={14} max={DEFAULTS.maxServerInletC - DEFAULTS.airSideApproachK} step={0.5} value={smartChwsC} onChange={(e) => setSmartChwsC(+e.target.value)} className="w-full accent-teal-600" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keepStandby} onChange={(e) => setKeepStandby(e.target.checked)} className="accent-teal-600" />
          Smart: keep one chiller on standby
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={spikes} onChange={(e) => setSpikes(e.target.checked)} className="accent-teal-600" />
          AI-rack load spikes <span className="text-[11px] text-slate-400">(+{DEFAULTS.aiSpikePct}%, 2-6 h, synthetic, seeded)</span>
        </label>
        <div>
          <div className="text-xs text-slate-500">Strategy shown in timeline / hour view</div>
          <div className="mt-1 inline-flex overflow-hidden rounded border border-slate-300 text-sm">
            {(['baseline', 'smart'] as const).map((k) => (
              <button key={k} onClick={() => setStrategy(k)} className={`px-3 py-1 ${strategy === k ? 'bg-slate-800 text-white' : 'bg-white'}`}>
                {k === 'baseline' ? 'Baseline' : 'Smart'}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-slate-500">
          Plant: {res.size.nDuty} + 1 chillers × {fmt(DEFAULTS.chillerUnitKW)} kW ({fmt(DEFAULTS.chillerUnitKW / 3.517)} tons)
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card title="Energy saved" value={`${fmt((b.mechKWh - s.mechKWh) / 1e6, 2)} GWh`} sub={`${fmt((1 - s.mechKWh / b.mechKWh) * 100)}% of plant kWh`} note="Chillers + pumps + tower fans" />
        <Card title="Water saved" value={`${fmt((b.waterGal - s.waterGal) / 1e6, 2)} M gal`} sub={`${fmt(b.waterGal / 1e6, 1)} → ${fmt(s.waterGal / 1e6, 1)} M gal/yr`} note={`Evaporation + blowdown, COC ${DEFAULTS.cyclesOfConcentration}`} />
        <Card title="CO₂ avoided" value={`${fmt(b.co2Tonnes - s.co2Tonnes)} t`} sub={`${fmt(b.co2Tonnes)} → ${fmt(s.co2Tonnes)} t/yr`} note={`Grid ${city.gridKgCO2PerKWh} kg/kWh (${city.gridSource})`} />
        <Card title="Mechanical pPUE" value={s.pPUE.toFixed(3)} sub={`baseline ${b.pPUE.toFixed(3)}`} note="(IT + plant) / IT. Excludes CRAH fans, UPS, lighting" />
        <Card title="Economizer hours" value={fmt(s.freeHours + s.partialHours)} sub={`${fmt(s.freeHours)} full · ${fmt(s.partialHours)} partial`} note="Smart strategy only" />
      </div>

      <Panel
        title={`Plant mode timeline: ${strategy === 'smart' ? 'Smart' : 'Baseline'}`}
        note={strategy === 'baseline' ? 'Baseline has no economizer, so every hour is chillers only.' : undefined}
      >
        <ModeTimeline hours={run.hours} selected={hour} onSelect={setHour} />
      </Panel>

      <Panel title="Selected hour">
        <input type="range" min={0} max={8759} value={hour} onChange={(e) => setHour(+e.target.value)} className="w-full accent-teal-600" />
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
          <div><span className="text-slate-500">Time:</span> {hourLabel(hour)}</div>
          <div><span className="text-slate-500">Dry-bulb / RH:</span> {weather.tempC[hour].toFixed(1)} °C / {weather.rh[hour]}%</div>
          <div><span className="text-slate-500">Wet-bulb (Stull):</span> {res.wbC[hour].toFixed(1)} °C</div>
          <div><span className="text-slate-500">Mode:</span> <b style={{ color: MODE_COLOR[hr.mode] }}>{MODE_LABEL[hr.mode]}</b> ({fmt(hr.econFrac * 100)}% by HX)</div>
          <div><span className="text-slate-500">CHWS / chiller ECWT:</span> {hr.supplyC.toFixed(1)} / {hr.nChillers > 0 ? `${hr.ecwtC.toFixed(1)} °C` : '–'}</div>
          <div><span className="text-slate-500">Tower leaving water:</span> {hr.towerC.toFixed(1)} °C</div>
          <div><span className="text-slate-500">Chillers on:</span> {hr.nChillers} of {res.size.nInstalled} @ PLR {hr.plr.toFixed(2)}</div>
          <div><span className="text-slate-500">Chiller kW:</span> {fmt(hr.chillerKW)}</div>
          <div><span className="text-slate-500">Pumps / fans kW:</span> {fmt(hr.chwPumpKW + hr.cwPumpKW)} / {fmt(hr.fanKW)}</div>
          <div><span className="text-slate-500">IT load:</span> {fmt(res.loadKW[hour])} kW</div>
          <div><span className="text-slate-500">Hourly pPUE:</span> {((res.loadKW[hour] + hr.mechKW) / res.loadKW[hour]).toFixed(3)}</div>
          <div><span className="text-slate-500">Water:</span> {fmt(hr.waterL / L_PER_GAL)} gal/h</div>
          <div><span className="text-slate-500">Unmet load:</span> {fmt(hr.unmetKW)} kW</div>
          <div><span className="text-slate-500">Plant CO₂:</span> {fmt(hr.mechKW * city.gridKgCO2PerKWh)} kg/h</div>
          <div><span className="text-slate-500">Chiller COP:</span> {hr.chillerKW > 0 ? (((res.loadKW[hour] + hr.chwPumpKW) * (1 - hr.econFrac) - hr.unmetKW) / hr.chillerKW).toFixed(2) : '–'}{hr.atCopLimit ? ' (at limit)' : ''}</div>
        </div>
      </Panel>

      <Panel title="Plant schematic (selected hour)" note="Lit equipment is running; pipe dash speed follows flow, fan speed follows airflow. Driven by the hour slider above.">
        <Schematic hr={hr} size={res.size} loadKW={res.loadKW[hour]} wbC={res.wbC[hour]} dbC={res.dbC[hour]} p={p} />
      </Panel>

      <Panel title="Heatwave test" note={`Adds +X °C to dry-bulb and wet-bulb for N days, for ${city.name} only. Stress metrics compare the same window with and without the heatwave.`}>
        <div className="flex flex-wrap items-end gap-6 text-sm">
          <label className="w-48">+{hwDraft.deltaC} °C
            <input type="range" min={1} max={12} value={hwDraft.deltaC} onChange={(e) => setHwDraft({ ...hwDraft, deltaC: +e.target.value })} className="w-full accent-red-600" /></label>
          <label className="w-48">{hwDraft.days} days
            <input type="range" min={1} max={14} value={hwDraft.days} onChange={(e) => setHwDraft({ ...hwDraft, days: +e.target.value })} className="w-full accent-red-600" /></label>
          <label className="w-56">Start: {hourLabel(hwDraft.startDay * 24).split(',')[0]}
            <input type="range" min={0} max={364 - hwDraft.days + 1} value={hwDraft.startDay} onChange={(e) => setHwDraft({ ...hwDraft, startDay: +e.target.value })} className="w-full accent-red-600" /></label>
          <button onClick={() => { setHw(hwDraft); setHour(hwDraft.startDay * 24 + 15); }} className="rounded bg-red-600 px-3 py-1 text-white">Apply heatwave</button>
          {hw && <button onClick={() => setHw(null)} className="rounded border border-slate-300 px-3 py-1">Clear</button>}
        </div>
        {hw && hot && (() => {
          const [a, z] = heatwaveHours(hw);
          const cols = (['baseline', 'smart'] as const).flatMap((k) => [
            { k: `${k === 'baseline' ? 'Baseline' : 'Smart'} normal`, s: windowStats(normal, normal[k], a, z, p.maxEcwtC) },
            { k: `${k === 'baseline' ? 'Baseline' : 'Smart'} +${hw.deltaC} °C`, s: windowStats(hot, hot[k], a, z, p.maxEcwtC) },
          ]);
          const rows: [string, (s: (typeof cols)[0]['s']) => string][] = [
            ['Peak wet-bulb (°C)', (s) => s.peakWbC.toFixed(1)],
            ['Plant capacity exceeded (h)', (s) => String(s.capacityExceededHours)],
            ['Max unmet load (kW)', (s) => fmt(s.maxUnmetKW)],
            ['Hours CHW supply above setpoint', (s) => String(s.supplyAboveSetpointHours)],
            ['Peak CHW supply (°C)', (s) => s.peakSupplyC.toFixed(1)],
            ['Peak chiller loading (% of derated N+1)', (s) => fmt(s.peakCapUse * 100)],
            ['Peak PLR / chillers on', (s) => `${s.peakPlr.toFixed(2)} / ${s.peakChillersOn}`],
            [`Hours standby chiller needed (> ${res.size.nDuty} required)`, (s) => String(s.redundancyLostHours)],
            [`Hours ECWT > ${p.maxEcwtC} °C (chiller limit flag)`, (s) => String(s.ecwtOverLimitHours)],
            ['Plant energy in window (MWh)', (s) => fmt(s.mechMWh, 1)],
          ];
          return (
            <table className="mt-3 w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Metric ({hw.days} days)</th>{cols.map((c) => <th key={c.k}>{c.k}</th>)}</tr></thead>
              <tbody>{rows.map(([n, f]) => <tr key={n} className="border-t border-slate-100"><td className="py-1">{n}</td>{cols.map((c) => <td key={c.k}>{f(c.s)}</td>)}</tr>)}</tbody>
            </table>
          );
        })()}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Monthly plant energy" note="Chillers + CHW/CW pumps + tower fans">
          <MonthlyBars res={res} metric="mechMWh" />
        </Panel>
        <Panel title="Monthly makeup water" note="Evaporation (Q_rej / h_fg) + blowdown">
          <MonthlyBars res={res} metric="waterKGal" />
        </Panel>
      </div>
      <Panel title="Daily mechanical pPUE">
        <PPUELine res={res} />
      </Panel>

      <Panel title="Annual totals">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1">Metric</th>
              <th style={{ color: STRAT_COLOR.baseline }}>Baseline</th>
              <th style={{ color: STRAT_COLOR.smart }}>Smart</th>
              <th>Saving</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, x, y]) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="whitespace-pre py-1">{k}</td>
                <td>{fmt(x, 1)}</td>
                <td>{fmt(y, 1)}</td>
                <td>{fmt(x - y, 1)} ({fmt((1 - y / x) * 100)}%)</td>
              </tr>
            ))}
            <tr className="border-t border-slate-100">
              <td className="py-1">Mechanical pPUE</td><td>{b.pPUE.toFixed(3)}</td><td>{s.pPUE.toFixed(3)}</td><td>{(b.pPUE - s.pPUE).toFixed(3)}</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1">Hours at COP safety ceiling ({DEFAULTS.copMax})</td><td>{b.copLimitHours}</td><td>{s.copLimitHours}</td><td />
            </tr>
            <tr className="border-t border-slate-100">
              <td className="py-1">Peak chiller PLR / unmet-load hours</td>
              <td>{b.peakPlr.toFixed(2)} / {b.unmetHours}</td><td>{s.peakPlr.toFixed(2)} / {s.unmetHours}</td><td />
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">
          Baseline: CHWS fixed {DEFAULTS.baselineChwsC} °C, no economizer, fewest chillers that carry the load. Smart: elevated fixed CHWS of {smartChwsC} °C (server
          inlet ≈ {smartChwsC + DEFAULTS.airSideApproachK} °C, inside the {DEFAULTS.maxServerInletC} °C ASHRAE TC 9.9 recommended limit), waterside economizer
          whenever wet-bulb allows, chiller count chosen for lowest kW{keepStandby ? ' while holding one unit on standby' : ' (may use the N+1 standby unit)'}.
          CHW pump heat is added to the chiller load in both strategies.
        </p>
      </Panel>

      <Panel title="City comparison" note="All five cities under the current controls. Each city uses its own 2025 weather and grid CO₂ factor.">
        <CityCompare rows={all.map(({ city, res }) => ({ name: city.name, b: res.baseline.totals, s: res.smart.totals }))} />
      </Panel>

      <Panel title="Every assumed number" note="All values are assumptions or textbook defaults, not measured data. See README for equations and references.">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr><th className="py-1">Group</th><th>Parameter</th><th>Value</th><th>Note</th></tr>
          </thead>
          <tbody>
            {(Object.keys(PARAM_INFO) as (keyof Params)[]).map((k) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="py-1 text-slate-500">{PARAM_INFO[k].group}</td>
                <td>{PARAM_INFO[k].label}</td>
                <td className="tabular-nums">{String(p[k])} {PARAM_INFO[k].unit}</td>
                <td className="text-slate-500">{PARAM_INFO[k].note}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-100">
              <td className="py-1 text-slate-500">Grid</td><td>CO₂ factor ({city.name})</td><td>{city.gridKgCO2PerKWh} kg/kWh</td>
              <td className="text-slate-500">{city.gridSource}</td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
