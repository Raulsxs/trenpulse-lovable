import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, Send } from "lucide-react";
import type { ConfigStep, GenerationFlowState } from "@/hooks/useGenerationFlow";

function SourceInputField({ placeholder, onSubmit }: { placeholder: string; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length > 0) {
      onSubmit(trimmed);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[80px] p-3 text-sm border border-border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <Button
        size="sm"
        className="self-end rounded-full text-xs gap-1"
        onClick={handleSubmit}
        disabled={text.trim().length === 0}
      >
        <Send className="w-3 h-3" />
        Continuar
      </Button>
    </div>
  );
}

interface Brand {
  id: string;
  name: string;
  thumbnail?: string | null;
  creation_mode?: string | null;
  default_visual_style?: string | null;
}

interface BgTemplate {
  id: string;
  name: string;
}

interface ConfigPhaseProps {
  configStep: ConfigStep;
  flow: GenerationFlowState;
  userId: string;
  onSelect: (key: string, value: any) => void;
  onCancel: () => void;
  onBack?: () => void;
}

export default function ConfigPhase({ configStep, flow, userId, onSelect, onCancel, onBack }: ConfigPhaseProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [bgTemplates, setBgTemplates] = useState<BgTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (configStep === "brand") {
      setLoading(true);
      supabase
        .from("brands")
        .select("id, name, creation_mode, render_mode")
        .eq("owner_user_id", userId)
        .then(async ({ data }) => {
          const rawBrands = data || [];

          // Fetch one thumbnail per brand from brand_examples
          const brandsWithThumbs: Brand[] = await Promise.all(
            rawBrands.map(async (b) => {
              const { data: examples } = await supabase
                .from("brand_examples")
                .select("image_url")
                .eq("brand_id", b.id)
                .limit(1);
              return {
                ...b,
                creation_mode: b.creation_mode,
                default_visual_style: (b as any).default_visual_style || null,
                thumbnail: examples?.[0]?.image_url || null,
              };
            })
          );

          setBrands(brandsWithThumbs);
          setLoading(false);
          // Auto-select if single brand — pass full brand object with metadata
          if (brandsWithThumbs.length === 1) {
            onSelect("brand_auto", brandsWithThumbs[0]);
          }
        });
    }
  }, [configStep, userId]);

  useEffect(() => {
    if (configStep === "background_template_pick" && flow.brandId) {
      setLoading(true);
      supabase
        .from("brand_background_templates")
        .select("id, name")
        .eq("brand_id", flow.brandId)
        .then(({ data }) => {
          setBgTemplates(data || []);
          setLoading(false);
        });
    }
  }, [configStep, flow.brandId]);

  const renderButtons = (options: { label: string; value: string }[], key: string) => (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant="outline"
          className="rounded-full text-xs"
          onClick={() => onSelect(key, opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );

  const wrapper = (title: string, children: React.ReactNode) => (
    <div className="bg-muted/50 border border-border rounded-xl p-4 my-2 animate-in fade-in slide-in-from-bottom-2">
      <p className="text-sm font-medium text-foreground mb-3">{title}</p>
      {children}
      <div className="mt-3 flex justify-between">
        {onBack && configStep !== "platform" ? (
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={onBack}>
            ← Voltar
          </Button>
        ) : <div />}
        <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return wrapper("Carregando...", <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />);
  }

  switch (configStep) {
    case "platform":
      return wrapper(
        "Para qual plataforma?",
        renderButtons([
          { label: "📸 Instagram", value: "instagram" },
          { label: "💼 LinkedIn", value: "linkedin" },
        ], "platform")
      );

    case "content_type": {
      const isLinkedIn = flow.platform === "linkedin";
      const contentTypeOptions = isLinkedIn
        ? [
            { label: "📷 Post com Imagem", value: "post" },
            { label: "📄 Documento", value: "document" },
            { label: "📰 Artigo", value: "article" },
          ]
        : [
            { label: "📷 Post", value: "post" },
            { label: "🎠 Carrossel", value: "carousel" },
            { label: "📱 Story", value: "story" },
          ];
      return wrapper(
        "Que tipo de publicação?",
        renderButtons(contentTypeOptions, "contentType")
      );
    }

    case "brand":
      if (brands.length === 0) {
        return wrapper(
          "Você ainda não tem uma marca configurada. Vou usar um estilo padrão.",
          <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => onSelect("brand_skip", null)}>
            Continuar sem marca
          </Button>
        );
      }
      // Auto-select handled in useEffect for single brand
      return wrapper(
        "Qual marca usar?",
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <button
              key={b.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border hover:border-primary/50 bg-background text-left transition-all hover:shadow-sm"
              onClick={() => onSelect("brandId", { id: b.id, name: b.name, creation_mode: b.creation_mode, default_visual_style: b.default_visual_style })}
            >
              {b.thumbnail ? (
                <img
                  src={b.thumbnail}
                  alt={b.name}
                  className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-muted-foreground">{b.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <span className="text-sm font-medium">{b.name}</span>
            </button>
          ))}
          <button
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-dashed border-border/60 hover:border-primary/30 bg-muted/10 text-left transition-all"
            onClick={() => onSelect("brand_skip", null)}
          >
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground text-lg">○</span>
            </div>
            <span className="text-sm text-muted-foreground">Sem marca</span>
          </button>
        </div>
      );

    case "content_style":
      return wrapper(
        "Qual o estilo do conteúdo?",
        renderButtons([
          { label: "📰 Notícia", value: "news" },
          { label: "💬 Frase", value: "quote" },
          { label: "💡 Dica", value: "tip" },
          { label: "📚 Educativo", value: "educational" },
          { label: "🤔 Curiosidade", value: "curiosity" },
        ], "contentStyle")
      );

    case "source_input": {
      const isQuote = flow.contentStyle === "quote";

      // Quote mode: simple text input for the phrase
      if (isQuote) {
        return wrapper(
          "✍️ Qual a frase que deseja usar?",
          <SourceInputField placeholder="Digite a frase exata que quer no post..." onSubmit={(text) => onSelect("sourceInput", text)} />
        );
      }

      // Normal mode: 3 clear options — link, recommendations, or write notes
      return wrapper(
        "📝 De onde vem o conteúdo?",
        <div className="flex flex-col gap-2">
          <button
            className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
            onClick={() => onSelect("source_mode", "link")}
          >
            <span className="text-lg">🔗</span>
            <div>
              <div className="text-sm font-medium">Colar um link</div>
              <div className="text-xs text-muted-foreground">Artigo, notícia ou página web</div>
            </div>
          </button>
          <button
            className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
            onClick={() => onSelect("source_mode", "suggest")}
          >
            <span className="text-lg">💡</span>
            <div>
              <div className="text-sm font-medium">Sugestões de conteúdo</div>
              <div className="text-xs text-muted-foreground">A IA sugere temas do seu nicho</div>
            </div>
          </button>
          <button
            className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
            onClick={() => onSelect("source_mode", "write")}
          >
            <span className="text-lg">✏️</span>
            <div>
              <div className="text-sm font-medium">Escrever do zero</div>
              <div className="text-xs text-muted-foreground">Descreva o que quer no post</div>
            </div>
          </button>
        </div>
      );
    }

    case "illustration_title":
      return wrapper(
        "📷 Imagem ilustrativa",
        <div className="flex flex-col gap-2">
          <button
            className="flex items-center gap-3 p-3 rounded-xl border border-primary bg-primary/5 text-left transition-all"
            onClick={() => onSelect("illustration_title", "with_title")}
          >
            <span className="text-lg">🔤</span>
            <div>
              <div className="text-sm font-medium text-primary">Com título na imagem</div>
              <div className="text-xs text-muted-foreground">Ilustração + headline sobreposto. Ideal para feed.</div>
            </div>
          </button>
          <button
            className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
            onClick={() => onSelect("illustration_title", "no_title")}
          >
            <span className="text-lg">🖼️</span>
            <div>
              <div className="text-sm font-medium">Só imagem, sem título</div>
              <div className="text-xs text-muted-foreground">Ilustração pura. Legenda vai separada no post.</div>
            </div>
          </button>
        </div>
      );

    case "source_link":
      return wrapper(
        "🔗 Cole o link do artigo ou notícia",
        <SourceInputField placeholder="https://..." onSubmit={(text) => onSelect("sourceInput", text)} />
      );

    case "source_write":
      return wrapper(
        "✏️ Sobre o que é o conteúdo?",
        <SourceInputField placeholder="Ex: Os benefícios da telemedicina para hospitais rurais" onSubmit={(text) => onSelect("sourceInput", text)} />
      );

    case "visual_style": {
      const brandMode = flow.brandCreationMode;
      const hasStyleExamples = brandMode === "style_copy" || brandMode === "inspired";
      const hasPhotoBackgrounds = brandMode === "photo_backgrounds";

      return wrapper(
        "Como quer o visual?",
        <div className="flex flex-col gap-2">
          <button
            className="flex items-start gap-3 p-3 rounded-xl border border-primary bg-primary/5 text-left transition-all"
            onClick={() => onSelect("visualStyle", "ai_full_design")}
          >
            <span className="text-lg">✨</span>
            <div>
              <p className="text-sm font-medium text-primary">Design completo por IA</p>
              <p className="text-xs text-muted-foreground">Imagem pronta com texto integrado. Bom design geral, pronto para publicar.</p>
            </div>
          </button>
          {hasStyleExamples && (
            <button
              className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/50 text-left transition-all"
              onClick={() => onSelect("visualStyle", "ai_background")}
            >
              <span className="text-lg">🖼️</span>
              <div>
                <p className="text-sm font-medium">Visual da marca + texto</p>
                <p className="text-xs text-muted-foreground">Background fiel ao seu estilo visual (mockups, detalhes). Texto perfeito e editável.</p>
              </div>
            </button>
          )}
          {hasPhotoBackgrounds && (
            <button
              className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/50 text-left transition-all"
              onClick={() => onSelect("visualStyle", "photo_overlay")}
            >
              <span className="text-lg">📸</span>
              <div>
                <p className="text-sm font-medium">Sua foto + texto</p>
                <p className="text-xs text-muted-foreground">Usa suas fotos pessoais como fundo com texto sobreposto. Ideal para marcas pessoais.</p>
              </div>
            </button>
          )}
          <button
            className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/50 text-left transition-all"
            onClick={() => onSelect("visualStyle", "ai_illustration")}
          >
            <span className="text-lg">📷</span>
            <div>
              <p className="text-sm font-medium">Imagem ilustrativa</p>
              <p className="text-xs text-muted-foreground">Cena visual gerada por IA sobre o tema. Ideal para posts com legenda.</p>
            </div>
          </button>
          <button
            className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/50 text-left transition-all"
            onClick={() => onSelect("visualStyle", "template_clean")}
          >
            <span className="text-lg">🎨</span>
            <div>
              <p className="text-sm font-medium">Só texto, sem imagem</p>
              <p className="text-xs text-muted-foreground">Fundo com cores da marca. Mais rápido, ideal para dicas e citações.</p>
            </div>
          </button>
        </div>
      );
    }

    case "slide_count":
      return wrapper(
        "Quantos slides?",
        renderButtons([
          { label: "3", value: "3" },
          { label: "5", value: "5" },
          { label: "7", value: "7" },
          { label: "🤖 IA decide", value: "auto" },
        ], "slideCount")
      );

    case "background_mode":
      return wrapper(
        "Qual fundo usar para a imagem?",
        <div className="flex flex-col gap-2">
          <button
            className="flex items-start gap-3 p-3 rounded-xl border border-primary bg-primary/5 text-left transition-all"
            onClick={() => onSelect("backgroundMode", "ai_generate")}
          >
            <span className="text-lg">✨</span>
            <div>
              <p className="text-sm font-medium text-primary">IA cria um fundo novo</p>
              <p className="text-xs text-muted-foreground">Imagem original baseada na sua marca</p>
            </div>
          </button>
          <button
            className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/50 text-left transition-all"
            onClick={() => onSelect("backgroundMode", "saved_template")}
          >
            <span className="text-lg">🖼️</span>
            <div>
              <p className="text-sm font-medium">Usar fundo que já salvei</p>
              <p className="text-xs text-muted-foreground">Aproveitar um background que você curtiu antes</p>
            </div>
          </button>
          <button
            className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/50 text-left transition-all"
            onClick={() => onSelect("backgroundMode", "user_upload")}
          >
            <span className="text-lg">📤</span>
            <div>
              <p className="text-sm font-medium">Subir minha própria imagem</p>
              <p className="text-xs text-muted-foreground">Upload de foto ou arte para usar como fundo</p>
            </div>
          </button>
        </div>
      );

    // visual_fidelity removed — always uses brand_guided

    case "background_template_pick":
      if (bgTemplates.length === 0) {
        return wrapper(
          "Nenhum fundo salvo encontrado. Vou usar IA para criar o fundo.",
          <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => onSelect("bg_fallback", null)}>
            Continuar com IA
          </Button>
        );
      }
      return wrapper(
        "Escolha um fundo salvo:",
        renderButtons(
          bgTemplates.map((t) => ({ label: t.name, value: t.id })),
          "templateId"
        )
      );

    case "upload_image":
      return wrapper(
        "Envie a imagem de fundo:",
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer flex items-center gap-2 border border-border rounded-full px-4 py-2 text-xs hover:bg-accent transition-colors">
              <Upload className="w-4 h-4" />
              Escolher arquivo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    // Upload to storage and pass URL
                    onSelect("upload_file", file);
                  }
                }}
              />
            </label>
          </div>
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium mb-1">Dica para fotos pessoais:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Posicione o rosto na parte superior da foto</li>
              <li>Deixe espaço na parte inferior para o texto</li>
              <li>Formato vertical (9:16) funciona melhor para stories</li>
            </ul>
          </div>
        </div>
      );

    case "photo_source":
      return wrapper(
        "De onde vem a foto?",
        <div className="flex flex-col gap-2">
          <button
            className="flex items-start gap-3 p-3 rounded-xl border border-primary bg-primary/5 text-left transition-all"
            onClick={() => onSelect("photoSource", "brand_photos")}
          >
            <span className="text-lg">🏷️</span>
            <div>
              <p className="text-sm font-medium text-primary">Fotos da marca</p>
              <p className="text-xs text-muted-foreground">Usar as fotos que você subiu na criação da marca</p>
            </div>
          </button>
          <button
            className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/50 text-left transition-all"
            onClick={() => onSelect("photoSource", "upload")}
          >
            <span className="text-lg">📤</span>
            <div>
              <p className="text-sm font-medium">Upload de foto</p>
              <p className="text-xs text-muted-foreground">Subir uma foto do seu computador para este post</p>
            </div>
          </button>
        </div>
      );

    default:
      return null;
  }
}
