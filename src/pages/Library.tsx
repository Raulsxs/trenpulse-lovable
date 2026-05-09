/**
 * Library — biblioteca de conteudo gerado (Fase 2.4 do refactor template-first).
 *
 * Lista os generated_contents do usuario logado com filtro por status,
 * preview em dialog e acao de cancelar agendamento.
 *
 * Rota: /library (self_serve apenas, white_glove tem o /contents legacy).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ImageIcon, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type ContentStatus = "draft" | "scheduled" | "published" | string;

type LibraryItem = {
  id: string;
  title: string;
  caption: string | null;
  status: ContentStatus;
  scheduled_at: string | null;
  published_at: string | null;
  image_urls: string[] | null;
  template_id: string | null;
  content_type: string | null;
  created_at: string;
  templates?: { slug: string; name: string } | null;
};

type Filter = "all" | "draft" | "scheduled" | "published";

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Rascunhos" },
  { value: "scheduled", label: "Agendados" },
  { value: "published", label: "Publicados" },
];

const STATUS_VARIANT: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendado", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  published: { label: "Publicado", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function Library() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [openItem, setOpenItem] = useState<LibraryItem | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchItems = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/");
      return;
    }
    const { data, error } = await supabase
      .from("generated_contents")
      .select(
        "id, title, caption, status, scheduled_at, published_at, image_urls, template_id, content_type, created_at, templates:templates(slug, name)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setItems(data as LibraryItem[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.status === filter);
  }, [items, filter]);

  const cancelSchedule = async (id: string) => {
    setCancelling(true);
    const { error } = await supabase
      .from("generated_contents")
      .update({ status: "draft", scheduled_at: null })
      .eq("id", id);
    setCancelling(false);
    if (error) {
      toast.error(error.message || "Erro ao cancelar agendamento");
      return;
    }
    toast.success("Agendamento cancelado");
    setOpenItem(null);
    await fetchItems();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" data-testid="library-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b" data-testid="library-header">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary/10">
              <ImageIcon className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Biblioteca</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/discover")}>
            <Sparkles className="h-4 w-4 mr-1" />
            Descobrir templates
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 mb-6" data-testid="library-filters" role="tablist">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(opt.value)}
              data-testid={`library-filter-${opt.value}`}
              role="tab"
              aria-selected={filter === opt.value}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="text-center py-16" data-testid="library-empty">
            <ImageIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <p className="text-muted-foreground mb-6">
              {filter === "all"
                ? "Você ainda não gerou nenhum conteúdo. Vai para Discover e escolha um template."
                : `Nenhum conteúdo no status "${filter}".`}
            </p>
            {filter === "all" && (
              <Button onClick={() => navigate("/discover")}>
                Ir para Discover
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="library-grid">
            {visible.map((it) => {
              const variant = STATUS_VARIANT[it.status] ?? { label: it.status, className: "bg-muted text-muted-foreground" };
              const dateIso = it.published_at || it.scheduled_at || it.created_at;
              const thumb = it.image_urls?.[0];
              return (
                <Card
                  key={it.id}
                  className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
                  onClick={() => setOpenItem(it)}
                  data-testid={`library-card-${it.id}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenItem(it);
                    }
                  }}
                >
                  <div className="aspect-square bg-muted relative">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={it.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-10 w-10" />
                      </div>
                    )}
                    <Badge className={`absolute top-2 right-2 ${variant.className}`} data-testid={`library-badge-${it.id}`}>
                      {variant.label}
                    </Badge>
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm leading-tight line-clamp-2">{it.title}</CardTitle>
                  </CardHeader>
                  <CardFooter className="pt-0 pb-3 text-xs text-muted-foreground flex justify-between items-center gap-2">
                    <span className="truncate">{it.templates?.name ?? "—"}</span>
                    <span className="whitespace-nowrap">{formatDate(dateIso)}</span>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!openItem} onOpenChange={(open) => !open && setOpenItem(null)}>
        {openItem && (
          <DialogContent className="max-w-2xl" data-testid="library-dialog">
            <DialogHeader>
              <DialogTitle>{openItem.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {openItem.image_urls?.[0] && (
                <img
                  src={openItem.image_urls[0]}
                  alt={openItem.title}
                  className="w-full max-h-[60vh] object-contain rounded-md bg-muted"
                />
              )}
              {openItem.caption && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Legenda</p>
                  <p className="text-sm whitespace-pre-wrap">{openItem.caption}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge className={STATUS_VARIANT[openItem.status]?.className ?? ""}>
                  {STATUS_VARIANT[openItem.status]?.label ?? openItem.status}
                </Badge>
                {openItem.templates?.name && <span>• {openItem.templates.name}</span>}
                {openItem.scheduled_at && (
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {formatDate(openItem.scheduled_at)}
                  </span>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpenItem(null)} data-testid="library-dialog-close">
                Fechar
              </Button>
              {openItem.status === "scheduled" && (
                <Button
                  variant="destructive"
                  onClick={() => cancelSchedule(openItem.id)}
                  disabled={cancelling}
                  data-testid="library-dialog-cancel-schedule"
                >
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <X className="h-4 w-4 mr-1" />}
                  Cancelar agendamento
                </Button>
              )}
              {openItem.status === "draft" && openItem.templates?.slug && (
                <Button
                  onClick={() => navigate(`/templates/${openItem.templates!.slug}`)}
                  data-testid="library-dialog-republish"
                >
                  Refazer no template
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
