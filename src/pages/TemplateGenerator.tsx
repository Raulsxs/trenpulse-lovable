/**
 * TemplateGenerator — pagina /templates/:slug.
 *
 * Une TemplateForm (input dinamico baseado em input_schema) + render-template
 * edge function (geracao + persistencia em generated_contents) + preview com
 * as imagens retornadas. Fase 2 plugara publicacao via ActionCard; aqui o
 * botao "Publicar" e placeholder.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TemplateForm, type Template as FormTemplate } from "@/components/templates/TemplateForm";
import TemplatePublishActions from "@/components/templates/TemplatePublishActions";
import { supabase } from "@/integrations/supabase/client";

type DbTemplate = FormTemplate & {
  description: string | null;
  format: string;
  category: string;
  preview_url: string;
};

type RenderResult = {
  contentId: string;
  mediaUrls: string[];
  status: "done" | "processing";
  creationId?: string;
};

type ViewState = "loading" | "form" | "submitting" | "result" | "not_found";

export default function TemplateGenerator() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>("loading");
  const [template, setTemplate] = useState<DbTemplate | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!slug) {
        setView("not_found");
        return;
      }
      const { data, error } = await supabase
        .from("templates")
        .select("id, slug, name, description, format, category, preview_url, input_schema")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (!mounted) return;
      if (error || !data) {
        setView("not_found");
        return;
      }
      setTemplate(data as DbTemplate);
      setView("form");
    })();
    return () => {
      mounted = false;
    };
  }, [slug]);

  const handleSubmit = async (inputs: Record<string, unknown>) => {
    if (!template) return;
    setView("submitting");
    const { data, error } = await supabase.functions.invoke("render-template", {
      body: { templateId: template.id, inputs },
    });
    if (error || !data || !data.contentId) {
      const msg = (error as any)?.message || (data as any)?.error || "Erro ao gerar conteudo";
      toast.error(msg);
      setView("form");
      return;
    }
    setResult(data as RenderResult);
    setView("result");
  };

  const goBackToForm = () => {
    setResult(null);
    setView("form");
  };

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center" data-testid="generator-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (view === "not_found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center" data-testid="generator-not-found">
        <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Template nao encontrado</h1>
        <p className="text-muted-foreground mb-6">
          O template que voce esta tentando acessar nao existe ou foi desativado.
        </p>
        <Button onClick={() => navigate("/discover")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-10 bg-background/80 backdrop-blur" data-testid="generator-header">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/discover")} data-testid="generator-back">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold leading-tight">{template.name}</h1>
            {template.description && (
              <p className="text-xs text-muted-foreground">{template.description}</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="generator-form-card">
            <CardHeader>
              <CardTitle>Preencha os campos</CardTitle>
              <CardDescription>
                Os dados sao enviados para gerar a imagem do template.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TemplateForm
                template={template}
                onSubmit={handleSubmit}
                isSubmitting={view === "submitting"}
              />
            </CardContent>
          </Card>

          <div className="space-y-4" data-testid="generator-preview-area">
            {view === "result" && result ? (
              <Card data-testid="generator-result">
                <CardHeader>
                  <CardTitle>Pronto</CardTitle>
                  <CardDescription>
                    {result.status === "done"
                      ? `${result.mediaUrls.length} imagem(ns) gerada(s)`
                      : "Renderizando — aguarde"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {result.mediaUrls.map((url, idx) => (
                      <div
                        key={url}
                        className="aspect-square overflow-hidden rounded-md bg-muted"
                        data-testid={`generator-media-${idx}`}
                      >
                        <img
                          src={url}
                          alt={`Resultado ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="pt-2">
                    <TemplatePublishActions contentId={result.contentId} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={goBackToForm} data-testid="generator-back-to-form">
                      Voltar e ajustar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card data-testid="generator-empty-preview">
                <CardHeader>
                  <CardTitle>Como funciona</CardTitle>
                  <CardDescription>
                    Preencha o formulario ao lado e clique em "Gerar conteudo".
                    A imagem sera renderizada e aparecera aqui.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Tipo: {template.format}</p>
                  <p>Categoria: {template.category}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
