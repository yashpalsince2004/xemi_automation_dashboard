import { useState, useCallback, useRef } from 'react';
import { FileSearch, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import UploadZone from '@/components/dashboard/UploadZone';
import KeyColumnSelector from '@/components/dashboard/KeyColumnSelector';
import SummaryFunnel from '@/components/dashboard/SummaryFunnel';
import DetailPanel from '@/components/dashboard/DetailPanel';
import AnalyticsWidgets from '@/components/dashboard/AnalyticsWidgets';
import SbComparison from '@/components/sb-compare/SbComparison';
import ExportSbDashboard from '@/components/sb-compare/ExportSbDashboard';
import type { ParsedFile } from '@/lib/fileParser';
import type { ComparisonResult } from '@/lib/comparisonEngine';
import { compareFiles } from '@/lib/comparisonEngine';

export default function Index() {
  const [fileA, setFileA] = useState<ParsedFile | null>(null);
  const [fileB, setFileB] = useState<ParsedFile | null>(null);
  const [keyColumn, setKeyColumn] = useState('');
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(true);
  const uploadRef = useRef<HTMLDivElement>(null);

  const handleFilesLoaded = useCallback((a: ParsedFile, b: ParsedFile) => {
    setFileA(a);
    setFileB(b);
    setResult(null);
    const commonCols = a.columns.filter(c => b.columns.includes(c));
    if (commonCols.length > 0) setKeyColumn(commonCols[0]);
  }, []);

  const handleCompare = useCallback(() => {
    if (!fileA || !fileB || !keyColumn) return;
    const res = compareFiles(fileA, fileB, keyColumn);
    setResult(res);
    setShowUpload(false);
  }, [fileA, fileB, keyColumn]);

  const commonColumns = fileA && fileB
    ? fileA.columns.filter(c => fileB.columns.includes(c))
    : [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-6">
        <DashboardHeader
          fileA={fileA}
          fileB={fileB}
          onUploadClick={() => { setShowUpload(true); setResult(null); }}
        />

        <Tabs defaultValue="generic" className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-4xl mb-6 bg-slate-100/50 p-1 rounded-xl">
            <TabsTrigger value="generic" className="rounded-lg">Generic Compare</TabsTrigger>
            <TabsTrigger value="sb" className="rounded-lg">SB Flat File Compare</TabsTrigger>
            <TabsTrigger value="bulk-sb" className="rounded-lg">Export Compare (500+)</TabsTrigger>
            <TabsTrigger value="import-sb" className="rounded-lg" disabled>Import Compare (Coming Soon)</TabsTrigger>
          </TabsList>

          <TabsContent value="generic" className="space-y-4">
            {showUpload && (
              <div ref={uploadRef}>
                <UploadZone onFilesLoaded={handleFilesLoaded} />
              </div>
            )}

            {fileA && fileB && !result && (
              <KeyColumnSelector
                columns={commonColumns}
                selected={keyColumn}
                onSelect={setKeyColumn}
                onCompare={handleCompare}
              />
            )}

            {result ? (
              <>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { setFileA(null); setFileB(null); setResult(null); setShowUpload(true); setKeyColumn(''); setActiveStage(null); }}>
                    <RotateCcw className="h-4 w-4" /> Compare Another
                  </Button>
                </div>
                <SummaryFunnel result={result} activeStage={activeStage} onStageClick={setActiveStage} />
                <DetailPanel result={result} keyColumn={keyColumn} />
                <AnalyticsWidgets result={result} />
              </>
            ) : !fileA && !fileB && (
              <div className="card-elevated flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
                <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
                  <FileSearch className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold">Upload two files to begin comparison</h2>
                <p className="text-sm text-muted-foreground max-w-md text-center">
                  Drop your Excel or CSV files above. DiffLens will perform a deep structural and data-level comparison and present differences in an interactive dashboard.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sb">
            <SbComparison />
          </TabsContent>

          <TabsContent value="bulk-sb">
            <ExportSbDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
