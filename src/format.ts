export const fmt = (x: number, digits = 0) => x.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const MODE_COLOR = { free: '#0d9488', partial: '#f59e0b', chiller: '#4f46e5' } as const;
export const MODE_LABEL = { free: 'Full free cooling', partial: 'Partial economizer', chiller: 'Chillers only' } as const;
export const STRAT_COLOR = { baseline: '#94a3b8', smart: '#0d9488' } as const;
