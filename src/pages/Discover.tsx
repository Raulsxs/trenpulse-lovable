/**
 * Discover — entry point do produto self_serve (Fase 1.4).
 *
 * Hoje: galeria de templates curados com filtro por formato.
 * V2 (Fase 5): tab "Tendencias" alimentada por scrape-trends.
 * V2 (Fase 4): tab "Meus templates" pra templates pessoais salvos.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateGallery, type GalleryTemplate } from "@/components/templates/TemplateGallery";
import { supabase } from "@/integrations/supabase/client";

type FormatFilter = "all" | "post" | "story" | "linkedin" | "tweet" | "video" | "carousel";

const FORMAT_OPTIONS: { value: FormatFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "post", label: "Post" },
  { value: "story", label: "Story" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tweet", label: "Tweet" },
  { value: "carousel", label: "Carrossel" },
  { value: "video", label: "Vídeo" },
];

export default function Discover() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<GalleryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FormatFilter>("all");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("id, slug, name, description, category, format, preview_url, preview_video_url, cost_credits, viral_views")
        .eq("is_active", true)
        .eq("is_personal", false)
        .order("viral_views", { ascending: false, nullsFirst: false });
      if (!mounted) return;
      if (!error && data) setTemplates(data as GalleryTemplate[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const visible = useMemo(() => {
    if (filter === "all") return templates;
    return templates.filter((t) => t.format === filter);
  }, [templates, filter]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b" data-testid="discover-header">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Descobrir</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Escolha um template e gere conteúdo a partir de um link, PDF ou texto livre.
            Cada template foi validado em alta performance no feed.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 mb-6" data-testid="discover-filters" role="tablist">
          {FORMAT_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(opt.value)}
              data-testid={`discover-filter-${opt.value}`}
              role="tab"
              aria-selected={filter === opt.value}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <TemplateGallery
          templates={visible}
          loading={loading}
          emptyMessage={
            filter === "all"
              ? "Nenhum template disponível ainda."
              : `Nenhum template no formato "${filter}". Tente outro filtro.`
          }
          onTemplateClick={(slug) => navigate(`/templates/${slug}`)}
        />
      </main>
    </div>
  );
}
