import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnnualResult, Totals } from '../model/annual';
import { MONTHS } from '../model/annual';
import { STRAT_COLOR, fmt } from '../format';

/** pPUE y-axis from 1.00 to the next 0.05 above the max, ticks every 0.05. */
function ppueAxis(max: number) {
  const top = Math.ceil((max - 1e-9) / 0.05) * 0.05;
  return { top, ticks: Array.from({ length: Math.round((top - 1) / 0.05) + 1 }, (_, i) => +(1 + i * 0.05).toFixed(2)) };
}

export function MonthlyBars({ res, metric }: { res: AnnualResult; metric: 'mechMWh' | 'waterKGal' }) {
  const data = MONTHS.map((m, i) => ({ m, Baseline: res.baseline.monthly[i][metric], Smart: res.smart.monthly[i][metric] }));
  const unit = metric === 'mechMWh' ? 'MWh' : 'k gal';
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="m" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} label={{ value: unit, angle: -90, position: 'insideLeft', fontSize: 11 }} />
        <Tooltip formatter={(v) => `${fmt(Number(v))} ${unit}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Baseline" fill={STRAT_COLOR.baseline} />
        <Bar dataKey="Smart" fill={STRAT_COLOR.smart} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PPUELine({ res }: { res: AnnualResult }) {
  const data = res.baseline.dailyPPUE.map((b, d) => ({ d: d + 1, Baseline: b, Smart: res.smart.dailyPPUE[d] }));
  const { top, ticks } = ppueAxis(Math.max(...res.baseline.dailyPPUE, ...res.smart.dailyPPUE));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="d" tick={{ fontSize: 11 }} ticks={[1, 91, 182, 274, 365]} label={{ value: 'Day of year', position: 'insideBottom', offset: -2, fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} domain={[1, top]} ticks={ticks} allowDataOverflow tickFormatter={(v) => Number(v).toFixed(2)} />
        <Tooltip formatter={(v) => Number(v).toFixed(3)} labelFormatter={(d) => `Day ${d}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="Baseline" stroke={STRAT_COLOR.baseline} dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line dataKey="Smart" stroke={STRAT_COLOR.smart} dot={false} strokeWidth={1.5} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CityCompare({ rows }: { rows: { name: string; b: Totals; s: Totals }[] }) {
  const cols: [string, (t: Totals) => string][] = [
    ['pPUE', (t) => t.pPUE.toFixed(3)],
    ['Plant MWh', (t) => fmt(t.mechKWh / 1e3)],
    ['Water M gal', (t) => fmt(t.waterGal / 1e6, 1)],
    ['CO₂ t', (t) => fmt(t.co2Tonnes)],
    ['Econ. hours', (t) => fmt(t.freeHours + t.partialHours)],
  ];
  const chart = rows.map((r) => ({ city: r.name.split(',')[0], Baseline: r.b.pPUE, Smart: r.s.pPUE }));
  const { top, ticks } = ppueAxis(Math.max(...rows.map((r) => Math.max(r.b.pPUE, r.s.pPUE))));
  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-slate-500">
            <tr>
              <th rowSpan={2} className="py-1 text-left">City</th>
              {cols.map(([c]) => <th key={c} colSpan={2} className="border-l border-slate-100 text-center">{c}</th>)}
            </tr>
            <tr>
              {cols.map(([c]) => [
                <th key={c + 'b'} className="border-l border-slate-100 font-normal" style={{ color: STRAT_COLOR.baseline }}>Base</th>,
                <th key={c + 's'} className="font-normal" style={{ color: STRAT_COLOR.smart }}>Smart</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-slate-100 text-center">
                <td className="py-1 text-left">{r.name}</td>
                {cols.map(([c, f]) => [
                  <td key={c + 'b'} className="border-l border-slate-100 text-slate-500">{f(r.b)}</td>,
                  <td key={c + 's'} className="font-medium">{f(r.s)}</td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chart} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="city" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={[1, top]} ticks={ticks} allowDataOverflow tickFormatter={(v) => Number(v).toFixed(2)} label={{ value: 'pPUE', angle: -90, position: 'insideLeft', fontSize: 11 }} />
          <Tooltip formatter={(v) => Number(v).toFixed(3)} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Baseline" fill={STRAT_COLOR.baseline} />
          <Bar dataKey="Smart" fill={STRAT_COLOR.smart} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
