import { useState, useMemo } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { loadSbSpecs, parseSbFlat, generateExportIssues } from '@/lib/sbParser';
import type { SbSpecs, SbData } from '@/lib/sbParser';
import SbUploadZone from './SbUploadZone';
import SbGrid from './SbGrid';
import { toast } from 'sonner';

export default function SbComparison() {
  const [specs, setSpecs] = useState<SbSpecs | null>(null);
  const [parsedA, setParsedA] = useState<SbData | null>(null);
  const [parsedB, setParsedB] = useState<SbData | null>(null);
  
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [includeJobInfo, setIncludeJobInfo] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFilesLoaded = async (fileA: File, fileB: File) => {
    setIsProcessing(true);
    try {
      let loadedSpecs = specs;
      if (!loadedSpecs) {
        const specResponse = await fetch('/xemi_automation_dashboard/SB_Tables.xlsx').catch(() => fetch('/SB_Tables.xlsx'));
        if (!specResponse.ok) throw new Error("Could not load SB_Tables.xlsx");
        const specBuffer = await specResponse.arrayBuffer();
        loadedSpecs = await loadSbSpecs(specBuffer);
        setSpecs(loadedSpecs);
      }

      const textA = await fileA.text();
      const parsedAData = await parseSbFlat(textA, loadedSpecs);
      setParsedA(parsedAData);

      const textB = await fileB.text();
      const parsedBData = await parseSbFlat(textB, loadedSpecs);
      setParsedB(parsedBData);

      const segments = Object.keys(loadedSpecs);
      if (segments.length > 0) {
        setSelectedSegment(segments[0]);
      }
      toast.success("Files successfully parsed!");
    } catch (e: any) {
      console.error(e);
      toast.error("Error parsing files: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSpecs(null);
    setParsedA(null);
    setParsedB(null);
    setSelectedSegment('');
  };

  const handleExport = () => {
    if (!specs || !parsedA || !parsedB) return;
    try {
      generateExportIssues(specs, parsedA, parsedB);
      toast.success("Issues exported successfully!");
    } catch (e: any) {
      toast.error("Export failed: " + e.message);
    }
  };

  const segments = useMemo(() => specs ? Object.keys(specs) : [], [specs]);

  const currentSpec = specs?.[selectedSegment] || [];
  const currentRowsA = parsedA?.[selectedSegment] || [];
  const currentRowsB = parsedB?.[selectedSegment] || [];

  if (!specs || !parsedA || !parsedB) {
    return (
      <div className="animate-fade-in w-full">
        {isProcessing ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="font-medium text-muted-foreground">Parsing files...</p>
          </div>
        ) : (
          <SbUploadZone onFilesLoaded={handleFilesLoaded} />
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="card-elevated px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex flex-col gap-1.5 w-full md:w-64">
            <Label className="text-xs text-muted-foreground">Section / Table</Label>
            <Select value={selectedSegment} onValueChange={setSelectedSegment}>
              <SelectTrigger>
                <SelectValue placeholder="Select Table" />
              </SelectTrigger>
              <SelectContent>
                {segments.map(seg => (
                  <SelectItem key={seg} value={seg}>{`<TABLE> ${seg}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-6 pt-4">
            <div className="flex items-center space-x-2">
              <Switch id="issues-only" checked={showIssuesOnly} onCheckedChange={setShowIssuesOnly} />
              <Label htmlFor="issues-only" className="cursor-pointer">Show issues only</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch id="include-job-info" checked={includeJobInfo} onCheckedChange={setIncludeJobInfo} />
              <Label htmlFor="include-job-info" className="cursor-pointer">Job No/Date</Label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto mt-2 md:mt-0 pt-4">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button size="sm" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" /> Export Issues
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <h3 className="font-semibold text-lg text-primary">
          Section {selectedSegment} <span className="text-muted-foreground font-normal text-sm ml-2">| A: {currentRowsA.length} rows | B: {currentRowsB.length} rows</span>
        </h3>
      </div>

      <SbGrid 
        spec={currentSpec} 
        rowsA={currentRowsA} 
        rowsB={currentRowsB} 
        showIssuesOnly={showIssuesOnly} 
        includeJobInfo={includeJobInfo}
      />
    </div>
  );
}
