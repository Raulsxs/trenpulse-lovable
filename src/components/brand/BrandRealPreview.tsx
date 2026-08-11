import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Sparkles, Loader2, Image as ImageIcon } from "lucide-react";

/**
 * Painel lateral da edição de marca: mostra MATERIAL REAL, não um mock.
 *
 * POR QUE MUDOU: o preview anterior desenhava um post falso ("5 sinais de hipertensão...") com a
 * paleta aplicada num gradiente. Como não tinha relação com o que a marca realmente produz, parecia
 * aleatório — e a marca é justamente o argumento mais forte do produto.
 *
 * Ordem de preferência, da prova mais forte para a mais fraca:
 *   1. PEÇAS REAIS já geradas com esta marca (prova concreta do resultado)
 *   2. REFERÊNCIAS que o usuário subiu (o insumo que a IA copia)
 *   3. Nada disso: convida a subir referências, em vez de inventar um exemplo
 *
 * Mais o bloco "o que a IA entendeu": o style_guide já era gerado e gravado, mas nunca foi mostrado
 * a ninguém. Exibi-lo é o que transforma a marca de "formulário que preenchi" em "a IA entendeu meu
 * estilo" — que é o valor real da feature.
 */

interface StyleGuide {
  visual_patterns?: string[];
  do_summary?: string[];
  dont_summary?: string[];
  confidence?: number | string;
  style_preset?: string;
}

export default function BrandRealPreview({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const [loading, setLoading] = useState(true);
  const [pecas, setPecas] = useState<string[]>([]);
  const [refs, setRefs] = useState<string[]>([]);
  const [guide, setGuide] = useState<StyleGuide | null>(null);

  useEffect(() => {
    if (!brandId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const [gen, ex, br] = await Promise.all([
        supabase.from("generated_contents").select("image_urls").eq("brand_id", brandId)
          .not("image_urls", "is", null).order("created_at", { ascending: false }).limit(6),
        supabase.from("brand_examples").select("image_url").eq("brand_id", brandId).limit(6),
        (supabase as any).from("brands").select("style_guide").eq("id", brandId).maybeSingle(),
      ]);
      if (cancelled) return;
      // Primeira imagem de cada peça: queremos variedade de peças, não os slides de uma só.
      setPecas(((gen.data as any[]) || []).map((g) => (g.image_urls || [])[0]).filter(Boolean).slice(0, 4));
      setRefs(((ex.data as any[]) || []).map((e) => e.image_url).filter(Boolean).slice(0, 4));
      setGuide(((br as any)?.data?.style_guide as StyleGuide) || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border h-48 grid place-items-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const usandoPecas = pecas.length > 0;
  const imagens = usandoPecas ? pecas : refs;

  // Padrões que começam com "Unable to analyze" vêm de uma análise que rodou sem receber as imagens.
  // Mostrar isso ao usuário só transmite defeito; filtramos e tratamos como se não existisse.
  const limpa = (arr?: string[]) => (arr || []).filter((s) => s && !/^unable to analyze/i.test(s));
  const patterns = limpa(guide?.visual_patterns);
  const dos = limpa(guide?.do_summary);
  const donts = limpa(guide?.dont_summary);
  const temGuia = patterns.length > 0 || dos.length > 0 || donts.length > 0;

  return (
    <div className="space-y-3">
      {imagens.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-foreground">
            {usandoPecas ? "Peças já criadas com esta marca" : "Suas referências visuais"}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {imagens.map((src, i) => (
              <img
                key={i} src={src} alt=""
                loading="lazy"
                className="w-full aspect-square object-cover rounded-lg border border-border bg-muted"
              />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {usandoPecas
              ? "Resultado real desta marca. É este estilo que a IA mantém nas próximas peças."
              : "É a partir destas imagens que a IA aprende o estilo da marca."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <ImageIcon className="w-5 h-5 mx-auto text-muted-foreground mb-1.5" />
          <p className="text-[11px] font-medium">Nenhuma referência ainda</p>
          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
            Suba exemplos na aba <strong>Exemplos</strong>: é assim que a IA aprende a sua cara.
          </p>
        </div>
      )}

      {temGuia && (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <p className="text-[11px] font-semibold">O que a IA entendeu da {brandName || "sua marca"}</p>
          </div>

          {patterns.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Estilo identificado</p>
              <ul className="space-y-0.5">
                {patterns.slice(0, 3).map((p, i) => (
                  <li key={i} className="text-[11px] leading-snug flex gap-1.5">
                    <span className="text-primary shrink-0">•</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dos.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide mb-1">Sempre faz</p>
              <ul className="space-y-0.5">
                {dos.slice(0, 3).map((p, i) => (
                  <li key={i} className="text-[11px] leading-snug flex gap-1.5">
                    <span className="text-emerald-600 shrink-0">✓</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {donts.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-destructive uppercase tracking-wide mb-1">Nunca faz</p>
              <ul className="space-y-0.5">
                {donts.slice(0, 2).map((p, i) => (
                  <li key={i} className="text-[11px] leading-snug flex gap-1.5">
                    <span className="text-destructive shrink-0">×</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground leading-snug pt-0.5 border-t border-border/60">
            Isto é aplicado automaticamente em toda geração desta marca.
          </p>
        </div>
      )}

      {!temGuia && imagens.length > 0 && !usandoPecas && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-[11px] leading-snug">
            <Eye className="w-3 h-3 inline mr-1" />
            Use <strong>Gerar Estilos</strong> na aba Exemplos para a IA analisar suas referências e
            montar o guia da marca.
          </p>
        </div>
      )}
    </div>
  );
}
