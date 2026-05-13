/**
 * TemplateGallery — grid de cards de templates clicaveis (Fase 1.2).
 *
 * Cada card: thumbnail, nome, badge de cost_credits, viral_views formatado.
 * Hover scale sutil. Click invoca onTemplateClick(slug).
 *
 * Props sao deliberadamente "burras" (recebe array pronto de templates).
 * O fetch + filtros sao responsabilidade da pagina pai (Discover).
 */
import { Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export type GalleryTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  format: string;
  preview_url: string;
  preview_video_url: string | null;
  cost_credits: number;
  viral_views: number | null;
};

export type TemplateGalleryProps = {
  templates: GalleryTemplate[];
  loading?: boolean;
  emptyMessage?: string;
  onTemplateClick: (slug: string) => void;
};

function formatViews(n: number | null): string | null {
  if (n === null || n === undefined) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function TemplateGallery({
  templates,
  loading,
  emptyMessage,
  onTemplateClick,
}: TemplateGalleryProps) {
  if (loading) {
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        data-testid="template-gallery-loading"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div
        className="text-center py-12 text-muted-foreground"
        data-testid="template-gallery-empty"
      >
        {emptyMessage || "Nenhum template encontrado."}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      data-testid="template-gallery"
    >
      {templates.map((t) => {
        const views = formatViews(t.viral_views);
        const isFree = t.cost_credits === 0;
        return (
          <Card
            key={t.id}
            className="group overflow-hidden cursor-pointer transition-transform hover:scale-[1.02] hover:shadow-lg"
            onClick={() => onTemplateClick(t.slug)}
            data-testid={`template-card-${t.slug}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTemplateClick(t.slug);
              }
            }}
          >
            <div className="aspect-[3/4] bg-gradient-to-br from-slate-800 to-slate-900 relative overflow-hidden">
              <img
                src={t.preview_url}
                alt={t.name}
                className="absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-90"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <div className="absolute top-2 left-2">
                <Badge variant={isFree ? "secondary" : "default"} className="text-xs">
                  {isFree ? "Free" : `${t.cost_credits} créditos`}
                </Badge>
              </div>
              {views && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                  <Eye className="h-3 w-3" />
                  <span data-testid={`template-views-${t.slug}`}>{views}</span>
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="font-medium text-sm leading-tight">{t.name}</h3>
              {t.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {t.description}
                </p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default TemplateGallery;
