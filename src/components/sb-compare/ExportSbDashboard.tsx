import { useState, useMemo } from 'react';
import { Play, Search, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Download, Filter, Minus, Plus, ChevronRight, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuCheckboxItem 
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface Mismatch {
  segment: string;
  rowIdx: number | string;
  field: string;
  valA: string;
  valB: string;
  issue: string;
  rowData?: Record<string, string>;
}

interface CompareResult {
  fileName: string;
  hasError: boolean;
  summary: string;
  mismatches: Mismatch[];
}

const exportToExcel = (mismatches: Mismatch[], fileName: string) => {
  const data = mismatches.map(m => {
    let rowDetails = '';
    if (m.rowData && Object.keys(m.rowData).length > 0) {
      rowDetails = Object.entries(m.rowData)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    }

    return {
      Segment: m.segment,
      Row: m.rowIdx,
      Field: m.field || '-',
      'Golden': m.valA || '-',
      'Generated': m.valB || '-',
      Issue: m.issue,
      'Row Details': rowDetails
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mismatches');
  XLSX.writeFile(wb, `${fileName.replace('.sb', '')}_mismatches.xlsx`);
  toast.success('Exported mismatches to Excel');
};

const FILTER_OPTIONS = [
  "Mandatory Fields",
  "Job No/Date",
  "Address",
  "CHA License Number",
  "Importer Exporter Code",
  "Name"
];

function MismatchRowView({ m }: { m: Mismatch }) {
  const [isOpen, setIsOpen] = useState(false);
  const isRowLevel = m.issue === 'missing row' || m.issue === 'extra row';
  
  return (
    <>
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{m.segment}</td>
        <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{m.rowIdx}</td>
        <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{m.field || '-'}</td>
        <td className="px-4 py-2 text-rose-600 bg-rose-50/50 dark:bg-rose-900/10 dark:text-rose-400">{m.valA || '-'}</td>
        <td className="px-4 py-2 text-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10 dark:text-emerald-400">{m.valB || '-'}</td>
        <td className="px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
              m.issue === 'missing row' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' :
              m.issue === 'extra row' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
              'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
            }`}>
              {m.issue}
            </span>
            {isRowLevel && m.rowData && Object.keys(m.rowData).length > 0 && (
              <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-slate-400"
                aria-label="View row details"
              >
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {isOpen && isRowLevel && m.rowData && (
        <tr>
          <td colSpan={6} className="p-0 border-b border-slate-100 dark:border-slate-800">
            <div className="bg-slate-50/50 dark:bg-slate-900/50 p-4 shadow-inner">
              <h5 className="text-xs font-bold text-slate-500 uppercase mb-3 px-1">{m.issue === 'missing row' ? 'Missing Golden Row Details' : 'Extra Generated Row Details'}</h5>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Field</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-600 dark:text-slate-300">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {Object.entries(m.rowData).map(([field, value]) => (
                      <tr key={field} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-2 font-medium text-slate-600 dark:text-slate-300 w-1/3 sm:w-1/4">{field}</td>
                        <td className="px-4 py-2 text-slate-800 dark:text-slate-200 break-words">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ExportSbDashboard() {
  const [results, setResults] = useState<CompareResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>(
    FILTER_OPTIONS.reduce((acc, opt) => ({ ...acc, [opt]: false }), {})
  );
  const [tempFilters, setTempFilters] = useState<Record<string, boolean>>(
    FILTER_OPTIONS.reduce((acc, opt) => ({ ...acc, [opt]: false }), {})
  );
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [isAutomationRunning, setIsAutomationRunning] = useState(false);

  const runComparison = async () => {
    setIsLoading(true);
    setResults([]);
    try {
      const res = await fetch('/api/bulk-compare');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setResults(json.data);
      toast.success(`Successfully compared ${json.data.length} files`);
    } catch (err: any) {
      toast.error('Failed to run export comparison: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const runAutomation = async () => {
    setIsAutomationRunning(true);
    try {
      const res = await fetch('/api/run-auto');
      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
      } else {
        toast.success('Export automation started! Check the progress widget.');
      }
    } catch (err: any) {
      toast.error('Failed to start automation: ' + err.message);
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const toggleRow = (fileName: string) => {
    setExpandedRows(prev => ({ ...prev, [fileName]: !prev[fileName] }));
  };

  const processedResults = useMemo(() => {
    const hasDisabledFilter = Object.values(activeFilters).some(v => !v);
    if (!hasDisabledFilter) return results;

    return results.map(res => {
      if (!res.mismatches) return res;
      
      const filteredMismatches = res.mismatches.filter(m => {
        const fieldNorm = m.field?.trim().toLowerCase() || '';
        
        if (!activeFilters['Mandatory Fields'] && m.issue?.toLowerCase() === 'mandatory missing') return false;
        if (!activeFilters['Job No/Date'] && (fieldNorm === 'job number' || fieldNorm === 'job date' || fieldNorm === 'job no' || fieldNorm === 'job no.')) return false;
        if (!activeFilters['Address'] && (
          fieldNorm.includes('address') || 
          fieldNorm.includes('city') || 
          fieldNorm.includes('state') || 
          fieldNorm.includes('pin') || 
          fieldNorm.includes('zip') || 
          fieldNorm.includes('country')
        )) return false;
        if (!activeFilters['Name'] && fieldNorm.includes('name')) return false;
        
        for (const [filterName, isEnabled] of Object.entries(activeFilters)) {
          if (filterName === 'Mandatory Fields' || filterName === 'Job No/Date' || filterName === 'Address' || filterName === 'Name') continue;
          
          if (!isEnabled && m.field?.trim().toLowerCase() === filterName.toLowerCase()) {
            return false;
          }
        }
        
        return true;
      });
      
      if (filteredMismatches.length !== res.mismatches.length) {
        const newHasError = filteredMismatches.length > 0 || (res.hasError && res.summary.toLowerCase().includes('missing file'));
        
        let newSummary = res.summary;
        if (!newHasError) {
          newSummary = 'Perfect Match';
        } else if (newSummary.includes('mismatches found')) {
          newSummary = `${filteredMismatches.length} mismatches found`;
        }

        return {
          ...res,
          mismatches: filteredMismatches,
          hasError: newHasError,
          summary: newSummary
        };
      }

      return res;
    });
  }, [results, activeFilters]);

  const filteredResults = useMemo(() => {
    return processedResults.filter(r => r.fileName.toLowerCase().includes(search.toLowerCase()));
  }, [processedResults, search]);

  const totalFiles = processedResults.length;
  const errorFiles = processedResults.filter(r => r.hasError).length;
  const matchFiles = totalFiles - errorFiles;

  return (
    <div className="flex flex-col gap-8 animate-fade-in font-sans pb-10">

      {/* Zentra-styled Header & Metrics */}
      <div className="bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-800/50 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        {/* Soft background glow */}
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">Export Comparison</h2>
            <p className="text-muted-foreground mt-1">Analyze up to 500 sets of shipping bills instantly.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={runAutomation} disabled={isAutomationRunning} size="lg" variant="outline" className="rounded-full px-6 gap-2 bg-white/50 dark:bg-slate-900/50 hover:scale-105 transition-transform border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400">
              {isAutomationRunning ? <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Rocket className="h-4 w-4" />}
              {isAutomationRunning ? 'Running Automation...' : 'Run Export Automation'}
            </Button>
            <Button onClick={runComparison} disabled={isLoading} size="lg" className="rounded-full px-8 gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
              {isLoading ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <Play className="h-4 w-4" />}
              {isLoading ? 'Processing...' : 'Run Export Comparison'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 text-sm font-medium mb-1">Total Files</p>
            <p className="text-4xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{totalFiles || '--'}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-emerald-400" />
            <p className="text-slate-500 text-sm font-medium mb-1">Perfect Matches</p>
            <p className="text-4xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{results.length ? matchFiles : '--'}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-rose-400" />
            <p className="text-slate-500 text-sm font-medium mb-1">Differences Found</p>
            <p className="text-4xl font-bold tracking-tight text-rose-600 dark:text-rose-400">{results.length ? errorFiles : '--'}</p>
          </div>
        </div>
      </div>

      {/* Zentra-styled List Area */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm mb-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold">File Reports</h3>
              <div className="flex items-center gap-3">
                <DropdownMenu 
                  open={isFilterOpen} 
                  onOpenChange={(open) => {
                    if (open) setTempFilters(activeFilters);
                    setIsFilterOpen(open);
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-full h-9 px-4 gap-2 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-100">
                      <Filter className="h-4 w-4" />
                      Field Filters
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 p-2">
                    <div className="max-h-[300px] overflow-y-auto pr-1">
                      {FILTER_OPTIONS.map(opt => (
                        <DropdownMenuCheckboxItem
                          key={opt}
                          checked={tempFilters[opt]}
                          onSelect={(e) => e.preventDefault()}
                          onCheckedChange={(checked) => setTempFilters(prev => ({ ...prev, [opt]: !!checked }))}
                        >
                          {opt}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </div>
                    <div className="pt-2 mt-2 border-t flex justify-end">
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setActiveFilters(tempFilters);
                          setIsFilterOpen(false);
                        }}
                      >
                        Apply Filters
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search files..."
                className="pl-9 rounded-full bg-slate-50 border-slate-200 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {filteredResults.map((res) => {
              const isExpanded = expandedRows[res.fileName];
              return (
                <div key={res.fileName} className={`flex flex-col transition-all duration-200 border rounded-2xl overflow-hidden ${isExpanded ? 'border-primary/20 shadow-md ring-1 ring-primary/10' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50'}`}>
                  
                  {/* Row Header */}
                  <div 
                    className="flex justify-between items-center p-4 cursor-pointer select-none bg-white dark:bg-slate-900" 
                    onClick={() => toggleRow(res.fileName)}
                  >
                    <div className="flex items-center gap-4">
                      {res.hasError ? <AlertCircle className="h-5 w-5 text-rose-500" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{res.fileName}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm font-medium px-3 py-1 rounded-full ${res.hasError ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10'}`}>
                        {res.summary}
                      </span>
                      {res.hasError ? (isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />) : <div className="w-5" />}
                    </div>
                  </div>

                  {/* Expanded Detail Pane */}
                  {res.hasError && (
                    <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 p-6">
                          
                          {/* Main Mismatches Table */}
                          {res.mismatches.length > 0 && (
                            <>
                              <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Mismatched Values</h4>
                                <Button onClick={() => exportToExcel(res.mismatches, res.fileName)} size="sm" variant="outline" className="gap-2">
                                  <Download className="h-4 w-4" />
                                  Export to Excel
                                </Button>
                              </div>
                              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                                <table className="w-full text-sm text-left">
                                  <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Segment</th>
                                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Row</th>
                                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Field</th>
                                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Golden</th>
                                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300">Generated</th>
                                      <th className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 w-40">Issue</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {res.mismatches.map((m, idx) => (
                                      <MismatchRowView key={idx} m={m} />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}

                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
            {filteredResults.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                No files found matching your search.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
