import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles, Play, Image, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  description: string | null;
  blotato_template_key: string;
  category: string;
  badge: string | null;
  is_free: boolean;
  sort_order: number;
  aspect_ratio: string;
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  infographic: FileText,
  video: Play,
  social: Sparkles,
  quote: Image,
};

const BADGE_STYLE: Record<string, string> = {
  FREE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  PRO: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  VIDEO: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  NEW: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    supabase
      .from("templates" as any)
      .select("id, name, description, blotato_template_key, category, badge, is_free, sort_order, aspect_ratio")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (error) {
          console.error("[Templates] fetch error:", error);
          toast.error("Erro ao carregar templates");
        } else {
          setTemplates((data as Template[]) || []);
        }
        setLoading(false);
      });
  }, []);

  const handleGenerate = async () => {
    if (!selected || !prompt.trim()) {
      toast.error("Digite um tema para gerar o conteúdo");
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("render-template", {
        body: { templateId: selected.id, prompt: prompt.trim() },
      });

      if (error) throw error;

      if (data?.status === "done") {
        toast.success(`${selected.name} gerado com sucesso!`);
        setSelected(null);
        setPrompt("");
        navigate("/contents");
      } else {
        toast.error(data?.error || "Falha ao gerar template. Tente novamente.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao gerar template";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
            Templates
          </h1>
          <p className="text-muted-foreground text-sm">
            Escolha um template e gere conteúdo profissional em segundos.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {templates.map((tpl) => {
              const Icon = CATEGORY_ICON[tpl.category] ?? Sparkles;
              const isVideo = tpl.category === "video";

              return (
                <button
                  key={tpl.id}
                  onClick={() => { setSelected(tpl); setPrompt(""); }}
                  className={cn(
                    "group relative flex flex-col items-start p-4 rounded-2xl border border-border",
                    "bg-card hover:bg-muted/50 hover:border-primary/40 transition-all duration-200",
                    "hover:shadow-md hover:scale-[1.02] active:scale-[0.99] text-left"
                  )}
                >
                  {/* Badge */}
                  {tpl.badge && (
                    <span className={cn(
                      "absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      BADGE_STYLE[tpl.badge] ?? "bg-muted text-muted-foreground"
                    )}>
                      {tpl.badge}
                    </span>
                  )}

                  {/* Icon preview */}
                  <div className={cn(
                    "w-full rounded-xl mb-3 flex items-center justify-center",
                    isVideo ? "h-20 bg-blue-50 dark:bg-blue-950/30" : "h-20 bg-muted/60"
                  )}>
                    <Icon className={cn(
                      "w-8 h-8",
                      isVideo ? "text-blue-500" : "text-muted-foreground/60"
                    )} />
                  </div>

                  <p className="text-sm font-semibold text-foreground leading-tight mb-1">
                    {tpl.name}
                  </p>
                  {tpl.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {tpl.description}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setPrompt(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected && (() => {
                const Icon = CATEGORY_ICON[selected.category] ?? Sparkles;
                return <Icon className="w-5 h-5 text-primary" />;
              })()}
              {selected?.name}
            </DialogTitle>
            <DialogDescription>
              {selected?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {selected?.badge && (
              <span className={cn(
                "inline-block text-xs font-semibold px-2.5 py-1 rounded-full",
                BADGE_STYLE[selected.badge] ?? "bg-muted text-muted-foreground"
              )}>
                {selected.badge}
                {!selected.is_free && " · Usa créditos Blotato"}
              </span>
            )}

            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Tema ou instrução
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  selected?.category === "quote"
                    ? "Ex: Frase motivacional sobre persistência"
                    : selected?.category === "video"
                      ? "Ex: Os 5 hábitos dos empreendedores de sucesso"
                      : "Ex: 5 benefícios do marketing digital para pequenas empresas"
                }
                rows={3}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleGenerate();
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">Ctrl+Enter para gerar</p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="w-full gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Gerar {selected?.name}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
