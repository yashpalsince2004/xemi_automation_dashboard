import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import type { ComparisonResult } from '@/lib/comparisonEngine';

interface Props {
  result: ComparisonResult;
}

export default function AnalyticsWidgets({ result }: Props) {
  const matchRateData = useMemo(() =>
    result.matchRateByRow.filter((_, i) => i % Math.max(1, Math.floor(result.matchRateByRow.length / 100)) === 0)
      .map((v, i) => ({ row: i, rate: Math.round(v) })),
    [result.matchRateByRow]
  );

  const heatmapData = useMemo(() =>
    Object.entries(result.columnMismatchCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([col, count]) => ({ col: col.length > 12 ? col.slice(0, 12) + '…' : col, count })),
    [result.columnMismatchCounts]
  );

  const categoryData = useMemo(() =>
    Object.entries(result.failureCategories)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value })),
    [result.failureCategories]
  );

  const COLORS = ['hsl(0, 84%, 60%)', 'hsl(38, 92%, 50%)', 'hsl(231, 90%, 60%)', 'hsl(142, 71%, 45%)', 'hsl(280, 60%, 55%)', 'hsl(200, 70%, 50%)'];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up">
      {/* Match Rate */}
      <div className="card-elevated p-5">
        <h3 className="text-sm font-semibold mb-4">Match Rate Over Rows</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={matchRateData}>
            <XAxis dataKey="row" hide />
            <YAxis domain={[0, 100]} fontSize={10} tickFormatter={v => `${v}%`} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Line type="monotone" dataKey="rate" stroke="hsl(231, 90%, 60%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Column Heatmap */}
      <div className="card-elevated p-5">
        <h3 className="text-sm font-semibold mb-4">Column Mismatch Frequency</h3>
        {heatmapData.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">No mismatches</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={heatmapData} layout="vertical">
              <XAxis type="number" fontSize={10} />
              <YAxis type="category" dataKey="col" fontSize={10} width={80} className="font-mono-data" />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {heatmapData.map((_, i) => (
                  <Cell key={i} fill={`hsl(231, 90%, ${60 + i * 2}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Failure Categories */}
      <div className="card-elevated p-5">
        <h3 className="text-sm font-semibold mb-4">Failure Breakdown</h3>
        {categoryData.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">No failures</div>
        ) : (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 text-xs">
              {categoryData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-mono-data font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
