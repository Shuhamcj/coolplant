import type { HourResult, PlantSize } from '../model/plant';
import type { Params } from '../model/params';
import { MODE_COLOR, MODE_LABEL, fmt } from '../format';

const C = {
  chws: '#2563eb',
  chwr: '#ea580c',
  cws: '#0ea5e9',
  cwr: '#d97706',
  off: '#cbd5e1',
  offFill: '#f1f5f9',
  chiller: '#4f46e5',
  hx: '#0d9488',
  tower: '#0891b2',
};

/** Animated pipe: dashes move when the pipe is active; speed scales with flow fraction. */
function Pipe({ d, color, active, speed = 1 }: { d: string; color: string; active: boolean; speed?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke={active ? color : C.off} strokeWidth={5} strokeLinejoin="round" opacity={active ? 0.25 : 1} />
      {active && (
        <path d={d} fill="none" stroke={color} strokeWidth={3} strokeDasharray="8 8" strokeLinejoin="round" className="flow"
          style={{ animationDuration: `${Math.min(6, 1.2 / Math.max(speed, 0.2))}s` }} />
      )}
    </g>
  );
}

function Pump({ x, y, active, label }: { x: number; y: number; active: boolean; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={14} fill={active ? '#fff' : C.offFill} stroke={active ? '#334155' : C.off} strokeWidth={2} />
      <path d={`M${x - 6} ${y - 8} L${x + 9} ${y} L${x - 6} ${y + 8} Z`} fill={active ? '#334155' : C.off} />
      <text x={x} y={y + 28} textAnchor="middle" className="fill-slate-600 text-[10px]">{label}</text>
    </g>
  );
}

export function Schematic({ hr, size, loadKW, wbC, dbC, p }: { hr: HourResult; size: PlantSize; loadKW: number; wbC: number; dbC: number; p: Params }) {
  const n = size.nInstalled;
  const fanFrac = Math.cbrt(hr.fanKW / size.fanDesignKW);
  const cwFlow = hr.heatRejKW / size.designRejKW;
  const chwFlow = loadKW / size.designLoadKW;
  const hxOn = hr.econFrac > 0;

  // Towers: one cell per chiller, across the top-left.
  const tW = Math.min(90, (420 - 10 * (n - 1)) / n);
  const towers = Array.from({ length: n }, (_, i) => 30 + i * (tW + 10));
  // Chillers: right of the plate HX.
  const cW = Math.min(64, (330 - 8 * (n - 1)) / n);
  const chillers = Array.from({ length: n }, (_, i) => 610 + i * (cW + 8));
  const lastX = chillers[n - 1] + cW;

  return (
    <svg viewBox="0 0 960 380" className="w-full" role="img" aria-label={`Plant schematic: ${MODE_LABEL[hr.mode]}, ${hr.nChillers} of ${n} chillers running`}>
      {/* ---- condenser water ---- */}
      <Pipe d={`M${towers[0] + tW * 0.75} 100 V128 H${lastX - 10}`} color={C.cws} active={hr.heatRejKW > 0} speed={cwFlow} />
      {towers.slice(1).map((x) => <Pipe key={'ts' + x} d={`M${x + tW * 0.75} 100 V128`} color={C.cws} active speed={cwFlow} />)}
      <Pipe d={`M${lastX - 10} 112 H${towers[0] + tW * 0.25} V100`} color={C.cwr} active={hr.heatRejKW > 0} speed={cwFlow} />
      {towers.slice(1).map((x) => <Pipe key={'tr' + x} d={`M${x + tW * 0.25} 112 V100`} color={C.cwr} active speed={cwFlow} />)}
      <Pipe d="M510 128 V170" color={C.cws} active={hxOn} speed={cwFlow} />
      <Pipe d="M560 170 V112" color={C.cwr} active={hxOn} speed={cwFlow} />
      {chillers.map((x, i) => (
        <g key={'cc' + i}>
          <Pipe d={`M${x + 10} 128 V170`} color={C.cws} active={i < hr.nChillers} speed={cwFlow} />
          <Pipe d={`M${x + cW - 10} 170 V112`} color={C.cwr} active={i < hr.nChillers} speed={cwFlow} />
        </g>
      ))}

      {/* ---- chilled water ---- */}
      <Pipe d="M230 290 H520 V250" color={C.chwr} active speed={chwFlow} />
      <Pipe d={`M550 250 V275 H${chillers[n - 1] + 10}`} color={C.chwr} active={hr.nChillers > 0} speed={chwFlow} />
      {chillers.map((x, i) => (
        <g key={'ce' + i}>
          <Pipe d={`M${x + 10} 275 V250`} color={C.chwr} active={i < hr.nChillers} speed={chwFlow} />
          <Pipe d={`M${x + cW - 10} 250 V310`} color={C.chws} active={i < hr.nChillers} speed={chwFlow} />
        </g>
      ))}
      <Pipe d={`M${hr.nChillers > 0 ? chillers[n - 1] + cW - 10 : 550} 310 H230`} color={C.chws} active speed={chwFlow} />
      {hr.nChillers === 0 && <Pipe d="M550 250 V310" color={C.chws} active speed={chwFlow} />}

      {/* ---- cooling towers ---- */}
      {towers.map((x, i) => (
        <g key={'t' + i}>
          <rect x={x} y={40} width={tW} height={60} rx={4} fill={hr.heatRejKW > 0 ? '#ecfeff' : C.offFill} stroke={hr.heatRejKW > 0 ? C.tower : C.off} strokeWidth={2} />
          <g transform={`translate(${x + tW / 2} 40)`}>
            <circle r={Math.min(16, tW / 2 - 2)} fill="#fff" stroke={fanFrac > 0.02 ? C.tower : C.off} strokeWidth={2} />
            <g className={fanFrac > 0.02 ? 'spin' : ''} style={{ animationDuration: `${Math.min(8, 0.6 / Math.max(fanFrac, 0.05))}s` }}>
              {[0, 120, 240].map((a) => (
                <ellipse key={a} rx={3} ry={Math.min(12, tW / 2 - 5)} cy={-Math.min(6, tW / 4)} transform={`rotate(${a})`} fill={fanFrac > 0.02 ? C.tower : C.off} />
              ))}
            </g>
          </g>
        </g>
      ))}
      <text x={30} y={22} className="fill-slate-700 text-[12px] font-semibold">Cooling towers ({n} cells)</text>
      <text x={250} y={22} className="fill-slate-500 text-[11px]">fans {fmt(hr.fanKW)} kW · {fmt(fanFrac * 100)}% airflow · WB {wbC.toFixed(1)} °C / DB {dbC.toFixed(1)} °C</text>
      <text x={300} y={146} className="fill-sky-600 text-[11px]" textAnchor="middle">CW supply {hr.towerC.toFixed(1)} °C</text>
      <text x={300} y={106} className="fill-amber-600 text-[11px]" textAnchor="middle">CW return {(hr.towerC + hr.cwRangeK).toFixed(1)} °C</text>
      <Pump x={470} y={128} active={hr.heatRejKW > 0} label={`CW ${fmt(hr.cwPumpKW)} kW`} />

      {/* ---- plate HX ---- */}
      <rect x={500} y={170} width={70} height={80} rx={4} fill={hxOn ? '#ccfbf1' : C.offFill} stroke={hxOn ? C.hx : C.off} strokeWidth={2} />
      {[0, 1, 2, 3, 4].map((k) => <line key={k} x1={512 + k * 11} y1={180} x2={512 + k * 11} y2={240} stroke={hxOn ? C.hx : C.off} strokeWidth={2} />)}
      <text x={535} y={266} textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">Plate HX</text>
      <text x={535} y={160} textAnchor="middle" className="fill-slate-500 text-[10px]">{hxOn ? `${fmt(hr.econFrac * 100)}% of load` : 'off'}</text>

      {/* ---- chillers ---- */}
      {chillers.map((x, i) => {
        const on = i < hr.nChillers;
        return (
          <g key={'c' + i}>
            <rect x={x} y={170} width={cW} height={80} rx={4} fill={on ? '#e0e7ff' : C.offFill} stroke={on ? C.chiller : C.off} strokeWidth={2} />
            <line x1={x} y1={210} x2={x + cW} y2={210} stroke={on ? C.chiller : C.off} strokeDasharray="3 3" />
            <text x={x + cW / 2} y={214} textAnchor="middle" className={`text-[10px] font-semibold ${on ? 'fill-indigo-700' : 'fill-slate-400'}`}>{cW > 30 ? `CH-${i + 1}` : i + 1}</text>
          </g>
        );
      })}
      <text x={610} y={160} className="fill-slate-700 text-[11px] font-semibold">
        Chillers: {hr.nChillers} of {n} on{hr.nChillers > 0 ? ` · PLR ${hr.plr.toFixed(2)} · ${fmt(hr.chillerKW)} kW` : ''}
      </text>
      <text x={610} y={266} className="fill-slate-500 text-[10px]">condenser (top) / evaporator (bottom){hr.nChillers > 0 ? ` · ECWT ${hr.ecwtC.toFixed(1)} °C` : ''}</text>

      {/* ---- CHW side ---- */}
      <Pump x={330} y={290} active label={`CHW ${fmt(hr.chwPumpKW)} kW`} />
      <rect x={30} y={262} width={200} height={70} rx={6} fill="#f8fafc" stroke="#475569" strokeWidth={2} />
      <text x={130} y={290} textAnchor="middle" className="fill-slate-800 text-[12px] font-semibold">Data hall</text>
      <text x={130} y={308} textAnchor="middle" className="fill-slate-600 text-[11px]">IT {fmt(loadKW)} kW</text>
      <text x={130} y={324} textAnchor="middle" className="fill-slate-500 text-[10px]">supply air ≈ {(hr.supplyC + p.airSideApproachK).toFixed(1)} °C (CHW + {p.airSideApproachK} K)</text>
      <text x={420} y={284} textAnchor="middle" className="fill-orange-600 text-[11px]">CHW return {(hr.supplyC + p.chwDeltaTK).toFixed(1)} °C</text>
      <text x={420} y={326} textAnchor="middle" className="fill-blue-600 text-[11px]">
        CHW supply {hr.supplyC.toFixed(1)} °C{hr.supplyC > hr.chwsC + 0.05 ? ` (setpoint ${hr.chwsC.toFixed(1)})` : ''}
      </text>

      {/* ---- mode badge ---- */}
      <rect x={760} y={330} width={180} height={30} rx={15} fill={MODE_COLOR[hr.mode]} />
      <text x={850} y={350} textAnchor="middle" className="fill-white text-[12px] font-semibold">{MODE_LABEL[hr.mode]}</text>
      {hr.unmetKW > 1 && (
        <text x={600} y={350} textAnchor="middle" className="fill-red-600 text-[12px] font-semibold">⚠ {fmt(hr.unmetKW)} kW unmet</text>
      )}
    </svg>
  );
}
