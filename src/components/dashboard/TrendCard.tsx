import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  TrendingUp, 
  ExternalLink, 
  Sparkles, 
  Clock,
  Newspaper,
  Heart,
  Loader2
} from "lucide-react";
import { useState } from "react";

export interface Trend {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  theme: string;
  publishedAt: string;
  score: number;
}

interface TrendCardProps {
  trend: Trend;
  onGenerateContent: (trend: Trend) => void;
  onViewDetails: (trend: Trend) => void;
  isSaved?: boolean;
  onToggleSave?: (trendId: string) => Promise<void>;
}

const getScoreColor = (score: number) => {
  if (score >= 8) return "text-score-high bg-score-high/10";
  if (score >= 5) return "text-score-medium bg-score-medium/10";
  return "text-score-low bg-score-low/10";
};

const getScoreLabel = (score: number) => {
  if (score >= 8) return "Alta Relevância";
  if (score >= 5) return "Média Relevância";
  return "Baixa Relevância";
};

const themeColors: Record<string, string> = {
  "IA em Saúde": "bg-primary/10 text-primary",
  "Inovação": "bg-accent/10 text-accent",
  "Gestão Hospitalar": "bg-success/10 text-success",
  "Radiologia": "bg-warning/10 text-warning",
  "Dispositivos Médicos": "bg-destructive/10 text-destructive",
};

const TrendCard = ({ 
  trend, 
  onGenerateContent, 
  onViewDetails, 
  isSaved = false,
  onToggleSave 
}: TrendCardProps) => {
  const [isSaving, setIsSaving] = useState(false);

  const formattedDate = new Date(trend.publishedAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const handleToggleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onToggleSave) return;
    
    setIsSaving(true);
    try {
      await onToggleSave(trend.id);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="group shadow-card hover:shadow-card-hover transition-all duration-300 border-border/50 overflow-hidden">
      <CardContent className="p-0">
        {/* Score Bar */}
        <div className={cn("h-1 w-full", 
          trend.score >= 8 ? "bg-score-high" : 
          trend.score >= 5 ? "bg-score-medium" : "bg-score-low"
        )} />
        
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge 
                variant="secondary" 
                className={cn("text-xs font-medium", themeColors[trend.theme] || "bg-muted text-muted-foreground")}
              >
                {trend.theme}
              </Badge>
              <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", getScoreColor(trend.score))}>
                <TrendingUp className="w-3 h-3" />
                {trend.score.toFixed(1)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onToggleSave && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    isSaved && "text-rose-500 hover:text-rose-600"
                  )}
                  onClick={handleToggleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Heart className={cn("w-4 h-4", isSaved && "fill-current")} />
                  )}
                </Button>
              )}
              <span className={cn("text-xs px-2 py-1 rounded-full", getScoreColor(trend.score))}>
                {getScoreLabel(trend.score)}
              </span>
            </div>
          </div>

          {/* Title */}
          <h3 
            className="font-heading font-semibold text-lg text-foreground mb-2 line-clamp-2 cursor-pointer hover:text-primary transition-colors"
            onClick={() => onViewDetails(trend)}
          >
            {trend.title}
          </h3>

          {/* Summary */}
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {trend.summary}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Newspaper className="w-3.5 h-3.5" />
                <span>{trend.source}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{formattedDate}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => window.open(trend.sourceUrl, "_blank")}
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => onGenerateContent(trend)}
              >
                <Sparkles className="w-4 h-4" />
                Gerar Conteúdo
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TrendCard;
