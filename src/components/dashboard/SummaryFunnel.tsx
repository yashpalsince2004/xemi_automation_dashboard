import { useMemo } from 'react';
import type { ComparisonResult } from '@/lib/comparisonengine';

interface Props {
  result: ComparisonResult;
  activeStage: string | null;
  onStageClick: (stage: string) => void;
}

interface Stage {
  key: string;
  label: string;
  count: number;
}

export default function SummaryFunnel({ result, activeStage, onStageClick }: Props) {
  const stages: Stage[] = useMemo(() => [
    { key: 'totalA', label: 'Rows (File A)', count: result.totalA },
    { key: 'totalB', label: 'Rows (File B)', count: result.totalB },
    { key: 'matched', label: 'Matched Rows', count: result.matched },
    { key: 'mismatched', label: 'Mismatched Rows', count: result.mismatched },
    { key: 'missingInB', label: 'Missing in B', count: result.missingInB },
  ], [result]);

  const maxCount = Math.max(...stages.map(s => s.count), 1);
  const matchRate = result.totalA > 0 ? ((result.matched / result.totalA) * 100).toFixed(1) : '0';

  return (
    <div className="card-elevated p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">Comparison Pipeline</h2>
        <span className="text-xs text-muted-foreground font-mono-data">
          {result.totalA.toLocaleString()} total rows analyzed
        </span>
      </div>

      <div className="flex gap-2 items-end h-48">
        {stages.map((stage) => {
          const height = Math.max((stage.count / maxCount) * 100, 8);
          const isActive = activeStage === stage.key;
          const drift = stage.key === 'mismatched' ? `-${(100 - parseFloat(matchRate)).toFixed(1)}%` : null;

          return (
            <div
              key={stage.key}
              className="flex-1 flex flex-col items-center gap-2 cursor-pointer group"
              onClick={() => onStageClick(stage.key)}
            >
              <span className="text-xs text-muted-foreground">{stage.label}</span>
              <span className="font-mono-data text-sm font-semibold">
                {stage.count.toLocaleString()}
              </span>
              <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
                <div
                  className={`w-full max-w-[80px] rounded-t-md transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-t from-primary to-primary/70'
                      : 'bg-secondary group-hover:bg-primary/20'
                  }`}
                  style={{
                    height: `${height}%`,
                    backgroundImage: !isActive ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, hsl(var(--muted-foreground) / 0.08) 4px, hsl(var(--muted-foreground) / 0.08) 8px)' : undefined,
                  }}
                />
              </div>
              {isActive && (
                <div className="text-[10px] font-mono-data bg-foreground text-card px-2 py-1 rounded shadow-lg animate-fade-in">
                  {stage.count.toLocaleString()} rows | Match: {matchRate}%{drift ? ` | Drift: ${drift}` : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 card-elevated bg-secondary/50 p-4 flex items-center gap-3 rounded-lg">
        <span className="text-lg">✨</span>
        <span className="text-sm text-muted-foreground">
          What would you like to explore next? Try clicking a stage above to filter the detail table.
        </span>
      </div>
    </div>
  );
}
