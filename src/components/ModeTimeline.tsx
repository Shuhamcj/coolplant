import { useEffect, useRef } from 'react';
import type { HourResult } from '../model/plant';
import { MODE_COLOR, MODE_LABEL } from '../format';
import { MONTHS } from '../model/annual';

const CELL_W = 3;
const CELL_H = 6;

/** Year-long plant mode heat strip: one column per day, one row per hour of day. Click to select an hour. */
export function ModeTimeline({ hours, selected, onSelect }: { hours: HourResult[]; selected: number; onSelect: (h: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    for (let h = 0; h < hours.length; h++) {
      ctx.fillStyle = MODE_COLOR[hours[h].mode];
      ctx.fillRect(Math.floor(h / 24) * CELL_W, (h % 24) * CELL_H, CELL_W, CELL_H);
    }
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.floor(selected / 24) * CELL_W - 1, (selected % 24) * CELL_H - 1, CELL_W + 2, CELL_H + 2);
  }, [hours, selected]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const day = Math.floor(((e.clientX - r.left) / r.width) * 365);
    const hod = Math.floor(((e.clientY - r.top) / r.height) * 24);
    onSelect(Math.min(8759, Math.max(0, day * 24 + hod)));
  };

  return (
    <div>
      <canvas ref={ref} width={365 * CELL_W} height={24 * CELL_H} onClick={click} className="w-full cursor-crosshair rounded" style={{ imageRendering: 'pixelated' }} />
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        {MONTHS.map((m) => <span key={m}>{m}</span>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
        {(Object.keys(MODE_COLOR) as (keyof typeof MODE_COLOR)[]).map((m) => (
          <span key={m} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: MODE_COLOR[m] }} /> {MODE_LABEL[m]}
          </span>
        ))}
        <span className="text-slate-400">Rows: hour of day 0-23 (top to bottom). Click to inspect an hour.</span>
      </div>
    </div>
  );
}
