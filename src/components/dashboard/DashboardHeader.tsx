import { FileUp, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import logo from '@/assets/logo.png';
import { toast } from 'sonner';

interface Props {
  fileA?: { name: string } | null;
  fileB?: { name: string } | null;
  onUploadClick: () => void;
}

export default function DashboardHeader({ fileA, fileB, onUploadClick }: Props) {
  return (
    <header className="card-elevated px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <img src={logo} alt="XEMI" className="h-9" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">XEMI</h1>
          <p className="text-xs text-muted-foreground">File Comparison Dashboard</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {fileA && fileB && (
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono-data text-xs bg-secondary px-2 py-1 rounded">{fileA.name}</span>
            <span>vs</span>
            <span className="font-mono-data text-xs bg-secondary px-2 py-1 rounded">{fileB.name}</span>
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings className="h-4 w-4" />
              Import <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              toast.info('Import functionality coming soon...');
            }}>Auto</DropdownMenuItem>
            <DropdownMenuItem>Manual</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings className="h-4 w-4" />
              Export <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              toast.info('Running Auto Export...');
              fetch('/api/run-auto')
                .then(res => res.json())
                .then(data => {
                  if (data.error) toast.error('Error: ' + data.error);
                  else toast.success('Auto Export Finished!');
                })
                .catch(err => toast.error('Failed to run auto export'));
            }}>Auto</DropdownMenuItem>
            <DropdownMenuItem>Manual</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button onClick={onUploadClick} size="sm" className="gap-2">
          <FileUp className="h-4 w-4" />
          Upload Files
        </Button>
      </div>
    </header>
  );
}
