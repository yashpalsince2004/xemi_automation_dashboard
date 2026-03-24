import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';

interface Props {
  columns: string[];
  selected: string;
  onSelect: (col: string) => void;
  onCompare: () => void;
}

export default function KeyColumnSelector({ columns, selected, onSelect, onCompare }: Props) {
  return (
    <div className="card-elevated p-4 flex flex-col sm:flex-row items-center gap-4 animate-slide-up">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">Match rows by:</span>
        <Select value={selected} onValueChange={onSelect}>
          <SelectTrigger className="w-[200px] font-mono-data text-xs">
            <SelectValue placeholder="Select key column" />
          </SelectTrigger>
          <SelectContent>
            {columns.map(c => (
              <SelectItem key={c} value={c} className="font-mono-data text-xs">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={onCompare} className="gap-2">
        <Play className="h-4 w-4" /> Run Comparison
      </Button>
    </div>
  );
}
