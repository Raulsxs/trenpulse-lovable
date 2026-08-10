import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Sparkles, Send, Paperclip, Coins, Palette, ChevronDown, Plus, Check, Bot } from "lucide-react";
import { CONTENT_FORMATS } from "@/lib/formats";
import { cn } from "@/lib/utils";

/**
 * Réplica da interface real para os tutoriais da Central de Ajuda.
 *
 * REGRA DESTE ARQUIVO: copiar as CLASSES do componente real, não inventar um visual "parecido".
 * O tutorial só cumpre a função se a pessoa reconhecer a tela quando chegar nela. Onde o produto
 * mudar de estilo, este arquivo tem que mudar junto (as classes abaixo saíram de AgentChat.tsx).
 *
 * Os rótulos e custos dos formatos NÃO são escritos aqui: vêm de src/lib/formats.ts, a mesma lista
 * que o chat usa. Foi a duplicação desses rótulos que fez a ajuda envelhecer sem ninguém notar.
 */

/** Moldura da janela do app: sidebar reduzida + área de conteúdo. */
export function AppFrame({ children, credits = 550 }: { children: ReactNode; credits?: number }) {
  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm select-none">
      <div className="flex h-[300px]">
        {/* Sidebar (versão estreita, só o suficiente pra pessoa reconhecer o lugar) */}
        <div className="w-[86px] shrink-0 border-r border-border bg-card/40 flex flex-col py-2.5 px-2 gap-0.5">
          <div className="flex items-center gap-1.5 px-1 pb-2">
            <div className="w-4 h-4 rounded bg-primary grid place-items-center">
              <Sparkles className="w-2.5 h-2.5 text-primary-foreground" />
            </div>
            <span className="text-[9px] font-bold">TrendPulse</span>
          </div>
          {[
            { label: "Assistente", active: true },
            { label: "Studio" },
            { label: "Calendário" },
            { label: "Conteúdos" },
            { label: "Marcas" },
            { label: "Perfil" },
          ].map((it) => (
            <div key={it.label} className={cn(
              "text-[9px] rounded px-1.5 py-1 truncate",
              it.active ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground",
            )}>
              {it.label}
            </div>
          ))}
          <div className="mt-auto flex items-center gap-1 px-1.5 py-1 rounded bg-[hsl(var(--credit-bg))] text-[hsl(var(--credit))]">
            <Coins className="w-2.5 h-2.5" />
            <span className="text-[9px] font-bold tabular-nums">{credits}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}

/** Cabeçalho da tela do Assistente, como no produto. */
export function AppHeader() {
  return (
    <div className="border-b border-border px-3 py-2 flex items-center gap-2">
      <div className="w-5 h-5 rounded-lg bg-accent/10 grid place-items-center">
        <Bot className="w-3 h-3 text-accent" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold leading-none">Assistente</p>
        <p className="text-[8px] text-muted-foreground leading-none mt-0.5">Eu crio no estilo da sua marca, agendo e publico.</p>
      </div>
    </div>
  );
}

/** Balão de mensagem, com as mesmas cores do chat real. */
export function Msg({ role, children, delay = 0 }: { role: "user" | "assistant"; children: ReactNode; delay?: number }) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay }}
      className={cn("flex", isUser ? "justify-end" : "justify-start gap-1.5")}
    >
      {!isUser && (
        <div className="w-4 h-4 rounded-full bg-accent/15 grid place-items-center shrink-0 mt-0.5">
          <Sparkles className="w-2 h-2 text-accent" />
        </div>
      )}
      <div className={cn(
        "text-[10px] leading-snug px-2 py-1.5 max-w-[82%]",
        isUser
          ? "rounded-xl rounded-br-sm bg-primary text-primary-foreground"
          : "rounded-xl rounded-bl-sm bg-muted/70 text-foreground",
      )}>
        {children}
      </div>
    </motion.div>
  );
}

/** "Gerando…" — o mesmo formato de chip de ferramenta em execução do chat. */
export function Working({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1.5 items-center">
      <div className="w-4 h-4 rounded-full bg-accent/15 grid place-items-center shrink-0">
        <Sparkles className="w-2 h-2 text-accent" />
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5">
        <span className="w-2 h-2 rounded-full border border-primary border-t-transparent animate-spin" />
        <span className="text-[9px] text-muted-foreground">{text}</span>
      </span>
    </motion.div>
  );
}

/** Card de conteúdo gerado, com os botões REAIS do ActionCard. */
export function ResultCard({ title, meta, tall }: { title: string; meta: string; tall?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}
      className="ml-5 rounded-lg border border-border bg-card overflow-hidden"
    >
      <div className={cn(
        "grid place-items-center px-3",
        tall ? "h-24 w-[68px] mx-auto my-1.5 rounded" : "h-16",
      )} style={{ background: "linear-gradient(135deg, hsl(210 100% 35%), hsl(175 72% 40%))" }}>
        <p className="text-white text-[9px] font-bold text-center leading-tight">{title}</p>
      </div>
      <div className="p-2">
        <p className="text-[8px] uppercase tracking-wide text-muted-foreground">{meta}</p>
        <div className="flex gap-1 mt-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[8px] font-semibold">Publicar</span>
          <span className="px-1.5 py-0.5 rounded border border-border text-[8px]">Agendar</span>
          <span className="px-1.5 py-0.5 rounded border border-border text-[8px]">Ajustar</span>
          <span className="px-1.5 py-0.5 rounded border border-border text-[8px]">Refazer</span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Barra inferior: atalhos de formato + campo + seletores.
 * `highlight` acende um atalho (use o `id` de CONTENT_FORMATS), `typed` mostra texto no campo.
 */
export function AppComposer({ highlight, typed = "", caret, brand = "Sem marca" }: {
  highlight?: string; typed?: string; caret?: boolean; brand?: string;
}) {
  return (
    <div className="border-t border-border px-2.5 py-2 space-y-1.5 bg-background">
      <div className="flex gap-1 overflow-hidden">
        {CONTENT_FORMATS.map((f) => {
          const Icon = f.icon;
          const on = highlight === f.id;
          return (
            <span key={f.id} className={cn(
              "inline-flex items-center gap-1 h-5 shrink-0 rounded-full border px-1.5 text-[8px] font-medium transition-colors",
              on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground",
            )}>
              <Icon className="w-2 h-2" />
              {f.label}
              <span className="inline-flex items-center gap-0.5 opacity-70"><Coins className="w-1.5 h-1.5" />{f.cost}</span>
            </span>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card px-2 py-1.5">
        <div className="min-h-[14px] text-[10px] text-foreground">
          {typed || <span className="text-muted-foreground">Ex.: crie um carrossel sobre liderança e agenda pra segunda 9h</span>}
          {caret && <span className="inline-block w-px h-2.5 bg-primary align-middle ml-px animate-pulse" />}
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground">
            <Palette className="w-2 h-2" />{brand}<ChevronDown className="w-2 h-2" />
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />Padrão
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[8px] text-muted-foreground">
            <Paperclip className="w-2 h-2" />Anexar
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2 py-0.5 text-[8px] font-semibold">
            <Send className="w-2 h-2" />Enviar
          </span>
        </div>
      </div>
    </div>
  );
}

/** Dropdown do seletor de marca aberto — onde fica o "Criar marca". */
export function BrandDropdown({ highlightCreate }: { highlightCreate?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-9 left-2 w-[150px] rounded-lg border border-border bg-popover shadow-lg p-1 z-10"
    >
      <div className="text-[8px] text-muted-foreground px-1.5 py-0.5">Sem marca</div>
      <div className={cn(
        "flex items-center gap-1 rounded px-1.5 py-1 text-[9px] font-semibold",
        highlightCreate ? "bg-primary text-primary-foreground" : "text-primary",
      )}>
        <Plus className="w-2.5 h-2.5" /> Criar marca
      </div>
    </motion.div>
  );
}

/** Painel do wizard de marca (/brands/new), com o stepper igual ao real. */
export function BrandWizardPanel({ step, steps }: { step: number; steps: { n: number; label: string; detail: string }[] }) {
  return (
    <div className="flex-1 p-3 overflow-hidden">
      <div className="flex items-center gap-1 mb-2.5">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1">
            <span className={cn(
              "w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold",
              step > s.n ? "bg-green-500 text-white" : step === s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}>
              {step > s.n ? <Check className="w-2 h-2" /> : s.n}
            </span>
            {i < steps.length - 1 && <span className="w-3 h-px bg-border" />}
          </div>
        ))}
      </div>

      {steps.map((s) => (
        step === s.n && (
          <motion.div key={s.n} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <p className="text-[11px] font-bold">{s.label}</p>
            <p className="text-[9px] text-muted-foreground leading-snug mt-0.5">{s.detail}</p>
            <div className="mt-2 space-y-1.5">
              {s.n === 1 && (
                <>
                  <div className="rounded border border-border bg-card px-2 py-1 text-[9px] text-muted-foreground">Nome da marca</div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-8 h-8 rounded border border-dashed border-border grid place-items-center text-muted-foreground text-[8px]">logo</div>
                    <span className="text-[8px] text-muted-foreground">PNG com fundo transparente</span>
                  </div>
                </>
              )}
              {s.n === 2 && (
                <div className="flex gap-1">
                  {["hsl(210 100% 35%)", "hsl(175 72% 40%)", "hsl(215 28% 17%)"].map((c) => (
                    <span key={c} className="w-6 h-6 rounded border border-border" style={{ background: c }} />
                  ))}
                  <span className="w-6 h-6 rounded border border-dashed border-border grid place-items-center text-[9px] text-muted-foreground">+</span>
                </div>
              )}
              {s.n === 3 && (
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-9 h-9 rounded border border-border" style={{ background: "linear-gradient(135deg, hsl(210 100% 35% / .7), hsl(175 72% 40% / .7))" }} />
                  ))}
                  <span className="w-9 h-9 rounded border border-dashed border-border grid place-items-center text-[9px] text-muted-foreground">+</span>
                </div>
              )}
              {s.n === 4 && (
                <div className="rounded border border-border bg-card p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full border border-primary border-t-transparent animate-spin" />
                    <span className="text-[9px] text-muted-foreground">Analisando seus exemplos…</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )
      ))}
    </div>
  );
}
