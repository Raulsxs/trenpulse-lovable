/**
 * Onboarding leve — 1 tela, zero chamadas de geração.
 * Nicho via chips → preview mockup instantâneo (CSS, sem API) → cai no chat com
 * um prompt pré-armado do nicho. O aha real acontece DENTRO do produto (chat),
 * onde a geração tem loader próprio e o resultado é editável/publicável.
 * (Substitui o wizard de 4 steps que chamava generate-content síncrono por ~2min.)
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePendingCoupon } from "@/hooks/usePendingCoupon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, ArrowRight, SkipForward } from "lucide-react";

/**
 * Peças REAIS geradas na plataforma — as mesmas de "Feito com TrendPulse" na landing, servidas do
 * nosso domínio.
 *
 * POR QUE SUBSTITUÍRAM O MOCKUP: a tela desenhava um post falso ("Sua marca", "Patrocinado",
 * "127 curtidas") com gradiente por nicho. Três problemas de uma vez:
 *   1. `coaching` e `default` não tinham imagem no mapa, então 2 dos 7 caminhos caíam num gradiente
 *      pelado com texto por cima — que é o que o usuário reportou como "muito ruim".
 *   2. As outras 5 vinham de CDN de terceiro (cloud.inference.sh) no caminho da primeira impressão,
 *      e o onError escondia a imagem em silêncio, devolvendo o mesmo gradiente pelado.
 *   3. Número de curtidas inventado numa tela de boas-vindas corrói confiança exatamente onde ela
 *      está sendo construída.
 *
 * São todas do nicho de saúde (vieram de um cliente real). Mostrar peça de saúde para um advogado é
 * menos personalizado do que a promessa antiga — mas é trabalho DE VERDADE, e prova de qualidade
 * convence mais que personalização falsa. Para personalizar, o caminho é gerar peças reais por nicho.
 */
const EXEMPLOS_REAIS = [
  "/showcase/gerados/exemplo_sinais_coracao.jpg",
  "/showcase/gerados/exemplo_ansiedade.jpg",
  "/showcase/gerados/exemplo_sono.jpg",
];

// 6 nichos (ICP: saúde/coach primeiro) + "Outro". A ideia vira o headline do mockup
// E o prompt pré-armado que o usuário encontra no chat.
const NICHES: { id: string; label: string; emoji: string; idea: string }[] = [
  { id: "saude", label: "Saúde e Bem-estar", emoji: "🏥", idea: "5 hábitos simples para mais saúde no dia a dia" },
  { id: "coaching", label: "Coaching e Mentoria", emoji: "🎯", idea: "A mentalidade que separa quem evolui de quem desiste" },
  { id: "fitness", label: "Fitness e Academia", emoji: "💪", idea: "5 exercícios que podem ser feitos em casa" },
  { id: "beleza", label: "Beleza e Estética", emoji: "💅", idea: "5 cuidados essenciais com a pele no dia a dia" },
  { id: "advocacia", label: "Advocacia e Direito", emoji: "⚖️", idea: "5 direitos que poucos conhecem" },
  { id: "marketing", label: "Marketing e Publicidade", emoji: "📣", idea: "5 erros de marketing que estão custando clientes" },
];

/** Tira de peças reais. Sem moldura de rede social: é uma amostra do resultado, não um post fingido. */
function ExemplosReais() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {EXEMPLOS_REAIS.map((src) => (
        <img
          key={src}
          src={src}
          alt="Post gerado na plataforma"
          loading="lazy"
          className="w-full aspect-square object-cover rounded-lg border border-border bg-muted"
        />
      ))}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [customNiche, setCustomNiche] = useState("");
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Cupom do link de compra: resgata sozinho aqui (primeiro caminho do comprador novo).
  // O hook roda no mount, ANTES do early return de onboarding_done abaixo tirar a pessoa da tela.
  const { redeemed } = usePendingCoupon();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        navigate("/auth");
        return;
      }
      const uid = data.session.user.id;
      // Self-guard: quem JÁ concluiu o onboarding não deve vê-lo de novo (blinda contra chegar aqui
      // por link antigo/back). Só trata como concluído quando a query CONFIRMA (evita bounce por race).
      const { data: ctx, error } = await supabase
        .from("ai_user_context")
        .select("onboarding_done")
        .eq("user_id", uid)
        .maybeSingle();
      if (!error && ctx?.onboarding_done) {
        navigate("/agent", { replace: true });
        return;
      }
      setUserId(uid);
    });
  }, [navigate]);

  const niche = NICHES.find((n) => n.id === selected);
  const isOther = selected === "outro";
  const nicheLabel = isOther ? customNiche.trim() : niche?.label || "";
  // Ideia que chega pré-escrita no chat (editável, não envia sozinha). Já não alimenta mockup nenhum.
  const ideiaPrefill = isOther
    ? `Uma dica de ${customNiche.trim() || "especialista"} que seu cliente precisa ver`
    : niche?.idea || "";
  const canContinue = !!selected && (!isOther || customNiche.trim().length > 0);

  const finish = async (skipped = false) => {
    if (!userId || saving) return;
    setSaving(true);
    try {
      await supabase.from("ai_user_context").upsert(
        {
          user_id: userId,
          onboarding_done: true,
          ...(nicheLabel && !skipped ? { business_niche: nicheLabel } : {}),
        },
        { onConflict: "user_id" },
      );
      // Conta nova (passou pelo onboarding) cai no Assistente (/agent) — a experiência padrão.
      // Prefill = prompt pré-armado do nicho (editável, não envia sozinho; o AgentChat lê location.state).
      const prefill = !skipped && ideiaPrefill ? ideiaPrefill : undefined;
      navigate("/agent", prefill ? { state: { prefill } } : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-background overflow-y-auto">
      <div className="w-full max-w-lg mx-auto px-4 pt-10 pb-8">
        <div className="text-center space-y-5 animate-in fade-in slide-in-from-bottom-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>

          <div>
            <h1 className="text-3xl font-bold mb-2">Bem-vindo ao TrendPulse!</h1>
            <p className="text-muted-foreground text-lg">
              O que você faz? A IA cria conteúdo sob medida pro seu negócio.
            </p>
          </div>

          {/* Cupom resgatado sozinho (comprador do curso). Nunca bloqueia o onboarding: se falhar,
              o hook fica quieto e a pessoa ainda pode resgatar em Perfil → Créditos. */}
          {redeemed !== null && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm animate-in fade-in slide-in-from-top-2">
              <span className="text-base">🎉</span>
              <span><strong>{redeemed} créditos</strong> adicionados à sua conta!</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-left">
            {NICHES.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelected(n.id)}
                className={`p-3 rounded-xl border text-sm font-medium transition-all text-left ${
                  selected === n.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/50 text-foreground"
                }`}
              >
                <span className="mr-1.5">{n.emoji}</span>
                {n.label}
              </button>
            ))}
            <button
              onClick={() => setSelected("outro")}
              className={`p-3 rounded-xl border text-sm font-medium transition-all text-left col-span-2 ${
                isOther
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/50 text-foreground"
              }`}
            >
              <span className="mr-1.5">🏢</span>
              Outro
            </button>
          </div>

          {isOther && (
            <Input
              placeholder="Descreva seu negócio (ex: pet shop, consultoria financeira...)"
              value={customNiche}
              onChange={(e) => setCustomNiche(e.target.value)}
              className="text-center h-12 rounded-xl"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && canContinue && finish()}
            />
          )}

          {/* Sempre visível: a tira não depende mais do nicho, então esconder até a escolha só
              deixava a tela vazia. E ela é o argumento mais forte da página. */}
          <div className="space-y-2">
            <ExemplosReais />
            <p className="text-[11px] text-muted-foreground">
              Peças reais criadas na plataforma. É este acabamento que você vai ter, com a sua marca.
            </p>
          </div>

          {/* Depois da escolha, mostra a ideia que vai chegar pré-escrita no chat: o usuário sai
              daqui sabendo o que vai acontecer na próxima tela, em vez de ser surpreendido. */}
          {canContinue && ideiaPrefill && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-left animate-in fade-in slide-in-from-bottom-2">
              <p className="text-[11px] text-muted-foreground mb-1">Vamos começar por esta ideia:</p>
              <p className="text-sm font-medium text-foreground">{ideiaPrefill}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="w-full gap-2 text-base h-14 rounded-xl"
              onClick={() => finish()}
              disabled={!canContinue || saving}
            >
              <Sparkles className="w-5 h-5" />
              Criar meu primeiro post
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => finish(true)} disabled={saving}>
              <SkipForward className="w-4 h-4 mr-1" />
              Pular e explorar sozinho
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
