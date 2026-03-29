import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Filter, X } from "lucide-react";

export interface FilterState {
  sources: string[];
  themes: string[];
  dateRange: "24h" | "7d" | "30d" | "all";
}

interface TrendData {
  source: string;
  theme: string;
}

interface TrendFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  trends?: TrendData[];
}

const dateRanges = [
  { value: "24h", label: "Últimas 24h" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "all", label: "Todos" },
] as const;

const TrendFilters = ({ filters, onFilterChange, trends = [] }: TrendFiltersProps) => {
  // Extract unique sources and themes from trends data
  const sources = [...new Set(trends.map(t => t.source))];
  const themes = [...new Set(trends.map(t => t.theme))];

  const activeFiltersCount = 
    filters.sources.length + 
    filters.themes.length + 
    (filters.dateRange !== "all" ? 1 : 0);

  const toggleSource = (source: string) => {
    const newSources = filters.sources.includes(source)
      ? filters.sources.filter((s) => s !== source)
      : [...filters.sources, source];
    onFilterChange({ ...filters, sources: newSources });
  };

  const toggleTheme = (theme: string) => {
    const newThemes = filters.themes.includes(theme)
      ? filters.themes.filter((t) => t !== theme)
      : [...filters.themes, theme];
    onFilterChange({ ...filters, themes: newThemes });
  };

  const clearFilters = () => {
    onFilterChange({ sources: [], themes: [], dateRange: "all" });
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Date Range Pills */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
        {dateRanges.map((range) => (
          <button
            key={range.value}
            onClick={() => onFilterChange({ ...filters, dateRange: range.value })}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
              filters.dateRange === range.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Sources Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter className="w-4 h-4" />
            Fontes
            {filters.sources.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {filters.sources.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-4" align="start">
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Fontes</p>
            {sources.map((source) => (
              <div key={source} className="flex items-center gap-2">
                <Checkbox
                  id={`source-${source}`}
                  checked={filters.sources.includes(source)}
                  onCheckedChange={() => toggleSource(source)}
                />
                <Label
                  htmlFor={`source-${source}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {source}
                </Label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Themes Filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2">
            <Filter className="w-4 h-4" />
            Temas
            {filters.themes.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                {filters.themes.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-4" align="start">
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Temas</p>
            {themes.map((theme) => (
              <div key={theme} className="flex items-center gap-2">
                <Checkbox
                  id={`theme-${theme}`}
                  checked={filters.themes.includes(theme)}
                  onCheckedChange={() => toggleTheme(theme)}
                />
                <Label
                  htmlFor={`theme-${theme}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {theme}
                </Label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear Filters */}
      {activeFiltersCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={clearFilters}
        >
          <X className="w-4 h-4" />
          Limpar ({activeFiltersCount})
        </Button>
      )}
    </div>
  );
};

export default TrendFilters;
