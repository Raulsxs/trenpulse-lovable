import { Sparkles, Play, Image, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

const CATEGORY_ICON: Record<string, React.ElementType> = {
  infographic: FileText,
  video: Play,
  slideshow: Play,
  social: Sparkles,
  card: Sparkles,
  quote: Image,
  photo_quote: Image,
};

const BADGE_STYLE: Record<string, string> = {
  FREE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  PRO: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  VIDEO: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
};

function getBadge(t: GalleryTemplate): { label: string; style: string } {
  if (t.format === "video" || t.category === "video") {
    return { label: "VIDEO", style: BADGE_STYLE.VIDEO };
  }
  if (t.cost_credits === 0) {
    return { label: "FREE", style: BADGE_STYLE.FREE };
  }
  return { label: "PRO", style: BADGE_STYLE.PRO };
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
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
        data-testid="template-gallery-loading"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
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
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
      data-testid="template-gallery"
    >
      {templates.map((t) => {
        const Icon = CATEGORY_ICON[t.category] ?? CATEGORY_ICON[t.format] ?? Sparkles;
        const isVideo = t.format === "video" || t.category === "video";
        const badge = getBadge(t);

        return (
          <button
            key={t.id}
            onClick={() => onTemplateClick(t.slug)}
            data-testid={`template-card-${t.slug}`}
            className={cn(
              "group relative flex flex-col items-start p-4 rounded-2xl border border-border text-left",
              "bg-card hover:bg-muted/50 hover:border-primary/40 transition-all duration-200",
              "hover:shadow-md hover:scale-[1.02] active:scale-[0.99]"
            )}
          >
            <span className={cn(
              "absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full",
              badge.style
            )}>
              {badge.label}
            </span>

            <div className={cn(
              "w-full rounded-xl mb-3 flex items-center justify-center h-20",
              isVideo ? "bg-blue-50 dark:bg-blue-950/30" : "bg-muted/60"
            )}>
              <Icon className={cn(
                "w-8 h-8",
                isVideo ? "text-blue-500" : "text-muted-foreground/60"
              )} />
            </div>

            <p className="text-sm font-semibold text-foreground leading-tight mb-1">
              {t.name}
            </p>
            {t.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {t.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default TemplateGallery;
