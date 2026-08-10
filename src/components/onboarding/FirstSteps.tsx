import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Check, ArrowRight, Palette, Sparkles, Link2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Checklist de primeiros passos — o caminho que o usuário novo não tem hoje.
 *
 * PROBLEMA QUE RESOLVE: quem chega pela primeira vez vê um chat vazio e não sabe (a) por onde
 * começar nem (b) que precisa CONECTAR uma rede antes de publicar. O segundo é a frustração mais
 * previsível do fluxo: a pessoa gera, gosta, clica em publicar e só então descobre o pré-requisito.
 *
 * Some sozinho quando os 4 passos estão feitos (não vira enfeite permanente pra quem já sabe usar),
 * e também pode ser dispensado à mão. Uma consulta leve por montagem, sem bloquear a tela.
 */

const DISMISS_KEY = "tp_first_steps_done";

interface Step {
  key: string;
  icon: typeof Palette;
  label: string;
  hint: string;
  done: boolean;
  action: () => void;
}

export default function FirstSteps({ onPickPrompt }: { onPickPrompt?: (text: string) => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<{ brand: boolean; generated: boolean; connected: boolean; published: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (dismissed) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // head:true → só conta, não traz linha. Consultas leves, em paralelo.
      // `brands` não leva .eq(): a RLS já filtra por owner_user_id = auth.uid() (mais marcas
      // compartilhadas com ele, o que é o comportamento desejado: o passo é "ter uma marca pra
      // aplicar", não "ter criado uma do zero").
      const [brands, contents, published, conns] = await Promise.all([
        supabase.from("brands").select("id", { count: "exact", head: true }),
        supabase.from("generated_contents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("generated_contents").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "published"),
        supabase.from("social_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setState({
        brand: (brands.count || 0) > 0,
        generated: (contents.count || 0) > 0,
        connected: (conns.count || 0) > 0,
        published: (published.count || 0) > 0,
      });
    })();
  }, [dismissed]);

  if (dismissed || !state) return null;

  const steps: Step[] = [
    {
      key: "brand", icon: Palette, label: "Criar sua marca",
      hint: "Suas cores e seu logo entram em toda peça automaticamente.",
      done: state.brand, action: () => navigate("/brands/new"),
    },
    {
      key: "generate", icon: Sparkles, label: "Gerar seu primeiro conteúdo",
      hint: "Escreva o assunto e eu monto a arte pronta.",
      done: state.generated,
      action: () => onPickPrompt?.("Crie um post para Instagram sobre: "),
    },
    {
      key: "connect", icon: Link2, label: "Conectar uma rede social",
      hint: "Precisa disso antes de publicar. Leva um minuto.",
      done: state.connected, action: () => navigate("/profile?tab=conexoes"),
    },
    {
      key: "publish", icon: Send, label: "Publicar ou agendar",
      hint: "Do conteúdo pronto direto pro seu perfil.",
      done: state.published, action: () => navigate("/contents"),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  // Completou tudo: some de vez, sem precisar de clique.
  if (doneCount === steps.length) {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
    return null;
  }

  // O próximo passo pendente é o único destacado — evita a paralisia de "4 coisas pra fazer".
  const nextKey = steps.find((s) => !s.done)?.key;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3.5 mb-5 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-semibold">Primeiros passos <span className="text-muted-foreground font-normal">· {doneCount} de {steps.length}</span></p>
        <button
          onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ } }}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Dispensar
        </button>
      </div>

      <div className="h-1 rounded-full bg-muted mb-3 overflow-hidden">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <div className="space-y-1">
        {steps.map((s) => {
          const Icon = s.icon;
          const isNext = s.key === nextKey;
          return (
            <button
              key={s.key}
              onClick={s.action}
              disabled={s.done}
              className={cn(
                "w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                s.done ? "opacity-55 cursor-default" : "hover:bg-primary/[0.04]",
                isNext && "bg-primary/[0.06]",
              )}
            >
              <span className={cn(
                "w-5 h-5 rounded-full grid place-items-center shrink-0 mt-px",
                s.done ? "bg-emerald-500/15 text-emerald-600" : isNext ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}>
                {s.done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[13px] font-medium leading-snug", s.done && "line-through")}>{s.label}</span>
                {!s.done && isNext && <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">{s.hint}</span>}
              </span>
              {!s.done && isNext && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
