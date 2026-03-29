import { Button } from "@/components/ui/button";

interface QuickRepliesProps {
  options: (string | { label: string; value: string })[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export default function QuickReplies({ options, onSelect, disabled }: QuickRepliesProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((opt, i) => {
        const label = typeof opt === "string" ? opt : opt.label;
        const value = typeof opt === "string" ? opt : opt.value;
        return (
          <Button
            key={`${value}-${i}`}
            size="sm"
            variant="outline"
            className="text-xs rounded-full"
            onClick={() => onSelect(value)}
            disabled={disabled}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}