import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react';

interface FileSlotProps {
  label: string;
  accept: string;
  file: File | null;
  onDrop: (f: File) => void;
  className?: string;
}

function FileSlot({ label, accept, file, onDrop, className = '' }: FileSlotProps) {
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

  const acceptedDesc = accept.includes('.xlsx') ? 'Drop .xlsx or .xls here' : 'Drop .sb here';

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`card-elevated-hover flex-1 p-8 flex flex-col items-center justify-center gap-4 border-2 border-dashed transition-colors cursor-pointer min-h-[160px] ${
        dragOver ? 'border-primary bg-primary/5' : file ? 'border-success/40' : 'border-border'
      } ${className}`}
    >
      {file ? (
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="font-semibold text-sm">{file.name}</p>
        </div>
      ) : (
        <label className="flex flex-col items-center gap-3 cursor-pointer w-full h-full text-center">
          <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center">
            {accept.includes('xlsx') ? <FileSpreadsheet className="h-7 w-7 text-muted-foreground" /> : <Upload className="h-7 w-7 text-muted-foreground" />}
          </div>
          <div>
            <p className="font-semibold text-sm">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">{acceptedDesc}</p>
          </div>
          <input type="file" accept={accept} className="hidden" onChange={handleChange} />
        </label>
      )}
    </div>
  );
}

interface Props {
  onFilesLoaded: (sbFileA: File, sbFileB: File) => void;
}

export default function SbUploadZone({ onFilesLoaded }: Props) {
  const [sbFileA, setSbFileA] = useState<File | null>(null);
  const [sbFileB, setSbFileB] = useState<File | null>(null);

  const handleA = (f: File) => {
    setSbFileA(f);
    if (sbFileB) onFilesLoaded(f, sbFileB);
  };

  const handleB = (f: File) => {
    setSbFileB(f);
    if (sbFileA) onFilesLoaded(sbFileA, f);
  };

  return (
    <div className="flex flex-col animate-slide-up gap-4">
      <h2 className="text-lg font-semibold mb-2">Upload Files for SB Compare</h2>
      <div className="flex flex-col sm:flex-row gap-4">
        <FileSlot label="SB File A" accept=".sb,.txt" file={sbFileA} onDrop={handleA} />
        <FileSlot label="SB File B" accept=".sb,.txt" file={sbFileB} onDrop={handleB} />
      </div>
    </div>
  );
}
