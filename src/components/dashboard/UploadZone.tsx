import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import type { ParsedFile } from '@/lib/fileParser';
import { parseFile } from '@/lib/fileParser';

interface Props {
  onFilesLoaded: (a: ParsedFile, b: ParsedFile) => void;
}

interface FileSlotProps {
  label: string;
  file: ParsedFile | null;
  loading: boolean;
  onDrop: (f: File) => void;
}

function FileSlot({ label, file, loading, onDrop }: FileSlotProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onDrop(f);
  }, [onDrop]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onDrop(f);
  }, [onDrop]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`card-elevated-hover flex-1 p-8 flex flex-col items-center justify-center gap-4 border-2 border-dashed transition-colors cursor-pointer min-h-[200px] ${
        dragOver ? 'border-primary bg-primary/5' : file ? 'border-success/40' : 'border-border'
      }`}
    >
      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Parsing…</p>
        </div>
      ) : file ? (
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="font-semibold text-sm">{file.name}</p>
          <div className="flex gap-4 text-xs text-muted-foreground font-mono-data">
            <span>{file.rowCount.toLocaleString()} rows</span>
            <span>{file.colCount} columns</span>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center gap-3 cursor-pointer">
          <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
            {label === 'File A' ? <FileSpreadsheet className="h-7 w-7 text-muted-foreground" /> : <Upload className="h-7 w-7 text-muted-foreground" />}
          </div>
          <div className="text-center">
            <p className="font-semibold text-sm">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">Drop .xlsx, .xls, or .csv here</p>
          </div>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleChange} />
        </label>
      )}
    </div>
  );
}

export default function UploadZone({ onFilesLoaded }: Props) {
  const [fileA, setFileA] = useState<ParsedFile | null>(null);
  const [fileB, setFileB] = useState<ParsedFile | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  const handleA = useCallback(async (f: File) => {
    setLoadingA(true);
    const parsed = await parseFile(f);
    setFileA(parsed);
    setLoadingA(false);
    if (fileB) onFilesLoaded(parsed, fileB);
  }, [fileB, onFilesLoaded]);

  const handleB = useCallback(async (f: File) => {
    setLoadingB(true);
    const parsed = await parseFile(f);
    setFileB(parsed);
    setLoadingB(false);
    if (fileA) onFilesLoaded(fileA, parsed);
  }, [fileA, onFilesLoaded]);

  return (
    <div className="flex flex-col sm:flex-row gap-4 animate-slide-up">
      <FileSlot label="File A" file={fileA} loading={loadingA} onDrop={handleA} />
      <FileSlot label="File B" file={fileB} loading={loadingB} onDrop={handleB} />
    </div>
  );
}
