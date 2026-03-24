import { useState } from 'react';
import { ChevronRight, Download } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ComparisonResult, MismatchDetail } from '@/lib/comparisonEngine';
import { exportDiffCSV } from '@/lib/comparisonEngine';

interface Props {
  result: ComparisonResult;
  keyColumn: string;
}

function StatusBadge({ type }: { type: 'mismatch' | 'missing' | 'extra' | 'match' }) {
  const styles = {
    mismatch: 'bg-destructive/10 text-destructive border-destructive/20',
    missing: 'bg-warning/10 text-warning border-warning/20',
    extra: 'bg-primary/10 text-primary border-primary/20',
    match: 'bg-success/10 text-success border-success/20',
  };
  return <Badge variant="outline" className={`font-mono-data text-[10px] uppercase ${styles[type]}`}>{type}</Badge>;
}

function MismatchRow({ m }: { m: MismatchDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-secondary/50 transition-colors">
        <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="font-mono-data text-xs w-24 truncate">{m.rowKey}</span>
        <span className="font-mono-data text-xs w-32 truncate text-muted-foreground">{m.column}</span>
        <span className="font-mono-data text-xs flex-1 truncate text-destructive">"{String(m.valueA)}"</span>
        <span className="font-mono-data text-xs flex-1 truncate text-success">"{String(m.valueB)}"</span>
        <StatusBadge type="mismatch" />
      </button>
      {open && (
        <div className="px-4 pb-4 pl-12 animate-fade-in">
          <div className="bg-secondary/50 rounded-lg p-4 space-y-2 text-xs">
            <p><span className="font-semibold">Reason:</span> <span className="text-muted-foreground">{m.reason}</span></p>
            <p><span className="font-semibold">Types:</span> <span className="font-mono-data text-muted-foreground">File A: {m.typeA} → File B: {m.typeB}</span></p>
            <div className="mt-2 font-mono-data text-xs space-y-1">
              <div className="bg-destructive/10 text-destructive px-2 py-1 rounded">- {String(m.valueA)}</div>
              <div className="bg-success/10 text-success px-2 py-1 rounded">+ {String(m.valueB)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DetailPanel({ result, keyColumn }: Props) {
  const handleExport = () => {
    const csv = exportDiffCSV(result);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'diff-report.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card-elevated animate-slide-up">
      <Tabs defaultValue="mismatches">
        <div className="flex items-center justify-between px-6 pt-4">
          <TabsList className="bg-secondary">
            <TabsTrigger value="mismatches">Mismatches ({result.mismatches.length})</TabsTrigger>
            <TabsTrigger value="missing">Missing ({result.missingInB})</TabsTrigger>
            <TabsTrigger value="extra">Extra ({result.extraInB})</TabsTrigger>
            <TabsTrigger value="schema">Schema Diff ({result.schemaDiff.length})</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>

        <TabsContent value="mismatches" className="mt-0">
          <div className="px-4 py-2 flex items-center gap-4 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
            <span className="w-8" />
            <span className="w-24">Row Key</span>
            <span className="w-32">Column</span>
            <span className="flex-1">File A</span>
            <span className="flex-1">File B</span>
            <span className="w-20">Status</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {result.mismatches.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">All rows match! 🎉</div>
            ) : (
              result.mismatches.slice(0, 200).map((m, i) => <MismatchRow key={i} m={m} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="missing" className="mt-0">
          <div className="max-h-[400px] overflow-y-auto">
            {result.missingRows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No missing rows</div>
            ) : (
              result.missingRows.slice(0, 100).map((row, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border text-xs">
                  <StatusBadge type="missing" />
                  <span className="font-mono-data text-muted-foreground">{keyColumn}: {String(row[keyColumn])}</span>
                  <span className="text-muted-foreground truncate">{JSON.stringify(row).slice(0, 120)}…</span>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="extra" className="mt-0">
          <div className="max-h-[400px] overflow-y-auto">
            {result.extraRows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No extra rows</div>
            ) : (
              result.extraRows.slice(0, 100).map((row, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border text-xs">
                  <StatusBadge type="extra" />
                  <span className="font-mono-data text-muted-foreground">{keyColumn}: {String(row[keyColumn])}</span>
                  <span className="text-muted-foreground truncate">{JSON.stringify(row).slice(0, 120)}…</span>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="schema" className="mt-0">
          <div className="max-h-[400px] overflow-y-auto">
            {result.schemaDiff.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Schemas match perfectly</div>
            ) : (
              result.schemaDiff.map((d, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border text-xs">
                  <span className="font-mono-data font-semibold">{d.column}</span>
                  <div className="flex gap-2">
                    {d.inA && <Badge variant="outline" className="bg-secondary text-xs">File A</Badge>}
                    {d.inB && <Badge variant="outline" className="bg-secondary text-xs">File B</Badge>}
                    {!d.inA && <Badge variant="outline" className="bg-destructive/10 text-destructive text-xs">Missing in A</Badge>}
                    {!d.inB && <Badge variant="outline" className="bg-warning/10 text-warning text-xs">Missing in B</Badge>}
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
