/**
 * AgentChat (/agent) — chat agêntico isolado (Fase 2 do pivot).
 * Consome o SSE do edge function `ai-agent` (Claude Haiku 4.5 + tool-calling).
 * Mantém os `messages` no formato Anthropic (devolvidos no done/confirm_request) p/ continuidade,
 * persistidos em localStorage por usuário. Reusa o ActionCard; confirma publicar/agendar/gasto-alto
 * via ConfirmAction. NÃO toca no /chat atual.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, Paperclip, X, Bot, Wand2, Coins, Square, Plus, Check, AlertTriangle, Image as ImageIcon, LayoutGrid, CalendarClock, ListChecks } from "lucide-react";
import ActionCard from "@/components/chat/ActionCard";
import ConfirmAction from "@/components/chat/ConfirmAction";
import { useCredits } from "@/hooks/useCredits";

const SUPABASE_URL = "https://qdmhqxpazffmaxleyzxs.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbWhxeHBhemZmbWF4bGV5enhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTI0OTQsImV4cCI6MjA4ODcyODQ5NH0.HlS0S8B1iqfO0MeUIKl8xu5unlK5jx6kvtPkcRklxuo";

const TOOL_LABEL: Record<string, string> = {
  gerar_post: "Gerando post…", gerar_carrossel: "Gerando carrossel…", gerar_story: "Gerando story…",
  gerar_tweet_card: "Gerando tweet card…", gerar_carrossel_editorial: "Montando carrossel editorial…",
  imagem_livre: "Gerando imagem…", editar_imagem: "Editando a imagem…", editar_conteudo: "Ajustando o conteúdo…",
  replicar_post: "Replicando o post…", link_para_post: "Lendo o link…", listar_agenda: "Consultando a agenda…",
  editar_slide: "Refazendo o slide…", detalhes_conteudo: "Vendo os detalhes…",
  listar_conexoes: "Vendo suas conexões…", consultar_saldo: "Conferindo seu saldo…",
  buscar_tendencias: "Buscando tendências…", planejar_calendario: "Planejando o calendário…",
  agendar_conteudo: "Agendando…", publicar: "Publicando…",
};

const MODELS = [
  { id: "gpt-image-2", label: "GPT-Image · texto + marca" },
  { id: "reve", label: "Reve · texto pt-BR impecável" },
  { id: "ideogram", label: "Ideogram · copia estilo" },
  { id: "seedream", label: "Seedream · rápido" },
  { id: "imagen-fast", label: "Imagen · rápido" },
  { id: "nano-banana", label: "Nano Banana · 9:16/premium" },
  { id: "qwen", label: "Qwen · fotos" },
  { id: "recraft", label: "Recraft · design" },
  { id: "flux-pro", label: "Flux Pro · fotorrealismo" },
];

interface Tool { name: string; ok?: boolean; cancelled?: boolean }
interface Action { contentId: string; contentType: any; platform?: string }
interface Msg { id: string; role: "user" | "assistant"; text: string; tools: Tool[]; action?: Action }

const SUGGESTIONS = [
  { icon: ImageIcon, text: "Crie um post sobre 5 sinais de burnout" },
  { icon: LayoutGrid, text: "Monte um carrossel com dicas de produtividade" },
  { icon: CalendarClock, text: "Monte um plano de conteúdo pra essa semana" },
  { icon: ListChecks, text: "O que tenho agendado essa semana?" },
];

export default function AgentChat() {
  const [uiMessages, setUiMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [model, setModel] = useState<string>("gpt-image-2");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<any>(null);
  const { balance } = useCredits();
  const location = useLocation();
  // Prefill vindo do FeatureSpotlight ("Criar vídeo" → cai com o pedido pronto no input).
  useEffect(() => {
    const pf = (location.state as any)?.prefill;
    if (typeof pf === "string" && pf) setInput(pf);
  }, [location.state]);

  const convo = useRef<any[]>([]);        // messages Anthropic (continuidade)
  const curId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const storeKey = useRef<string>("");
  const uiRef = useRef<Msg[]>([]);
  const toolBreak = useRef(false);   // separa texto pré/pós tool no mesmo balão
  const shownContent = useRef<Set<string>>(new Set()); // dedup ActionCard por content_id (1 card/conteúdo) — evita 2 canais realtime no mesmo content (crash)

  useEffect(() => { uiRef.current = uiMessages; }, [uiMessages]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("brands").select("id, name").limit(20);
      if (data) setBrands(data as any);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        storeKey.current = `tp_agent_${user.id}`;
        try {
          const raw = localStorage.getItem(storeKey.current);
          if (raw) {
            const saved = JSON.parse(raw);
            if (Array.isArray(saved.ui)) {
              // Sanitiza estados antigos: remove ActionCards duplicados (mesmo content_id) — senão
              // a conversa salva quando havia o bug recria 2+ canais realtime e crasha na carga.
              const seen = new Set<string>();
              const cleaned = saved.ui.map((m: Msg) => {
                if (m.action?.contentId) {
                  if (seen.has(m.action.contentId)) return { ...m, action: undefined };
                  seen.add(m.action.contentId);
                }
                return m;
              });
              setUiMessages(cleaned);
              shownContent.current = seen;
            }
            if (Array.isArray(saved.convo)) convo.current = saved.convo;
          }
        } catch { /* ignore */ }
      }
    })();
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [uiMessages, pendingConfirm]);

  function persist() {
    if (!storeKey.current) return;
    try { localStorage.setItem(storeKey.current, JSON.stringify({ ui: uiRef.current, convo: convo.current })); } catch { /* ignore */ }
  }

  const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()));
  const patchCur = (fn: (m: Msg) => Msg) =>
    setUiMessages((ms) => ms.map((m) => (m.id === curId.current ? fn(m) : m)));

  function handleEvent(evt: any) {
    switch (evt.type) {
      case "text": {
        const delta = evt.delta || "";
        if (toolBreak.current) {
          toolBreak.current = false;
          patchCur((m) => ({ ...m, text: m.text + (m.text && !m.text.endsWith("\n") ? "\n\n" : "") + delta }));
        } else {
          patchCur((m) => ({ ...m, text: m.text + delta }));
        }
        break;
      }
      case "tool_start":
        patchCur((m) => ({ ...m, tools: [...m.tools, { name: evt.name }] }));
        break;
      case "tool_done":
        toolBreak.current = true;
        patchCur((m) => {
          const tools = [...m.tools];
          for (let i = tools.length - 1; i >= 0; i--) if (tools[i].name === evt.name && tools[i].ok === undefined) { tools[i] = { ...tools[i], ok: evt.ok, cancelled: evt.cancelled }; break; }
          return { ...m, tools };
        });
        break;
      case "action_result":
        if (evt.action_result?.content_id) {
          const cid = evt.action_result.content_id;
          // Dedup: só 1 ActionCard por content_id. Edições reusam o mesmo id — o card existente
          // atualiza sozinho via realtime. Dois cards no mesmo content = 2 canais = crash.
          if (!shownContent.current.has(cid)) {
            shownContent.current.add(cid);
            patchCur((m) => ({ ...m, action: { contentId: cid, contentType: evt.action_result.content_type || "post", platform: evt.action_result.platform } }));
          }
        }
        break;
      case "confirm_request":
        convo.current = evt.messages || convo.current;
        setPendingConfirm({ tool_use_id: evt.tool_use_id, name: evt.name, input: evt.input, cost: evt.cost, messages: evt.messages });
        break;
      case "done":
        if (Array.isArray(evt.messages)) convo.current = evt.messages;
        break;
      case "error":
        toast.error(evt.error || "Erro no agente");
        patchCur((m) => ({ ...m, text: m.text || "Tive um problema aqui. Tenta de novo?" }));
        break;
    }
  }

  async function streamAgent(body: any) {
    setSending(true);
    const ac = new AbortController();
    abortRef.current = ac;
    const aId = newId();
    curId.current = aId;
    toolBreak.current = false;
    setUiMessages((ms) => [...ms, { id: aId, role: "assistant", text: "", tools: [] }]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("Faça login novamente."); return; }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) { toast.error(`Agente indisponível (${res.status})`); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try { handleEvent(JSON.parse(line.slice(5).trim())); } catch { /* ignore parse */ }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(e?.message || "Falha na conexão com o agente");
    } finally {
      setSending(false);
      persist();
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const photosNow = [...photos];
    setPhotos([]);
    setUiMessages((ms) => [...ms, { id: newId(), role: "user", text, tools: [] }]);
    convo.current = [...convo.current, { role: "user", content: text }];
    await streamAgent({ messages: convo.current, brandId: brandId || undefined, model, imageUrls: photosNow });
  }

  async function handleConfirm(approved: boolean) {
    const pc = pendingConfirm;
    setPendingConfirm(null);
    if (!pc) return;
    await streamAgent({ messages: pc.messages, confirm: { tool_use_id: pc.tool_use_id, name: pc.name, input: pc.input, approved } });
  }

  function handleStop() { abortRef.current?.abort(); setSending(false); }
  function handleNew() {
    abortRef.current?.abort();
    convo.current = [];
    curId.current = null;
    shownContent.current.clear();
    toolBreak.current = false;
    setUiMessages([]);
    setPendingConfirm(null);
    setTimeout(persist, 0);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const urls: string[] = [];
      for (const f of files) {
        const ext = f.name.split(".").pop() || "png";
        const path = `${user.id}/agent/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
        const { error } = await supabase.storage.from("content-images").upload(path, f, { contentType: f.type, upsert: true });
        if (error) throw error;
        urls.push(supabase.storage.from("content-images").getPublicUrl(path).data.publicUrl);
      }
      setPhotos((p) => [...p, ...urls].slice(0, 10));
    } catch (err: any) {
      toast.error("Erro no upload: " + (err.message || "tente de novo"));
    } finally {
      setUploading(false);
    }
  }

  const lastId = uiMessages[uiMessages.length - 1]?.id;

  return (
    <div className="flex flex-col h-[calc(100dvh-0px)] max-w-3xl mx-auto w-full">
      <header className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="w-[18px] h-[18px] text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-sm font-bold leading-tight truncate">
            Assistente
            <span className="rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-px leading-4">beta</span>
          </h1>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">Eu crio no estilo da sua marca, agendo e publico.</p>
        </div>
        {balance !== null && (
          <span
            title={`${balance} créditos disponíveis`}
            className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--credit))]/25 bg-[hsl(var(--credit-bg))] px-2 py-0.5 text-[11px] font-bold leading-4 tabular-nums text-[hsl(var(--credit))] shrink-0"
          >
            <Coins className="w-3 h-3" />{balance}
          </span>
        )}
        {uiMessages.length > 0 && (
          <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 shrink-0" onClick={handleNew} title="Nova conversa"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Nova</span></Button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-5 space-y-4">
        {uiMessages.length === 0 && (
          <div className="max-w-md mx-auto pt-8 sm:pt-12">
            <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <h2 className="text-lg font-bold leading-snug">Do prompt ao feed.</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Descreva o que você quer postar. Eu gero, aplico a marca, agendo e publico pra você.</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.text}
                    onClick={() => setInput(s.text)}
                    className="group flex items-start gap-2.5 text-left text-[13px] leading-snug rounded-lg border border-border bg-card px-3 py-2.5 hover:border-primary/50 hover:bg-primary/[0.03] transition-colors duration-150"
                  >
                    <Icon className="w-4 h-4 mt-px text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    <span>{s.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {uiMessages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap shadow-sm" : "max-w-[90%] sm:max-w-[88%] space-y-2"}>
              {m.role === "assistant" && m.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.tools.map((t, i) => {
                    const running = t.ok === undefined;
                    const failed = t.ok === false && !t.cancelled;
                    return (
                      <span
                        key={i}
                        className={
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (running
                            ? "bg-accent/10 text-accent"
                            : failed
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : failed ? <AlertTriangle className="w-3 h-3" /> : t.cancelled ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                        {TOOL_LABEL[t.name] || t.name}{t.cancelled ? " (cancelado)" : ""}
                      </span>
                    );
                  })}
                </div>
              )}
              {m.text && (
                <div className={m.role === "assistant" ? "rounded-2xl rounded-bl-sm bg-card border border-border px-3.5 py-2 text-sm whitespace-pre-wrap" : ""}>{m.text}</div>
              )}
              {m.role === "assistant" && sending && m.id === lastId && !m.text && !m.action && m.tools.length === 0 && (
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-card border border-border px-3.5 py-3 w-fit" aria-label="Pensando">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-pulse" style={{ animationDelay: "300ms" }} />
                </div>
              )}
              {m.action && (
                <ActionCard contentId={m.action.contentId} contentType={m.action.contentType} platform={m.action.platform} />
              )}
            </div>
          </div>
        ))}
        {pendingConfirm && (
          <div className="flex justify-start"><div className="max-w-[90%] sm:max-w-[88%] w-full">
            <ConfirmAction name={pendingConfirm.name} input={pendingConfirm.input} cost={pendingConfirm.cost} busy={sending} onConfirm={() => handleConfirm(true)} onCancel={() => handleConfirm(false)} />
          </div></div>
        )}
      </div>

      <div className="border-t border-border p-2.5 sm:p-3 space-y-2">
        {photos.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {photos.map((u, i) => (
              <div key={i} className="relative">
                <img src={u} alt="" className="w-12 h-12 rounded-md object-cover border border-border" />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 shadow-sm hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-border bg-card overflow-hidden focus-within:border-primary/50 transition-colors">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ex.: crie um carrossel sobre liderança e agenda pra segunda 9h"
            className="border-0 resize-none min-h-[56px] focus-visible:ring-0 rounded-none text-sm"
            disabled={sending}
          />
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 border-t border-border/60 bg-muted/20">
            {brands.length > 0 && (
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} title="Marca aplicada" className="h-8 text-xs bg-background border border-border rounded-md px-2 max-w-[110px] sm:max-w-[140px] focus-visible:outline-none focus-visible:border-primary/50 transition-colors">
                <option value="">Sem marca</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <select value={model} onChange={(e) => setModel(e.target.value)} title="Modelo de imagem" className="h-8 text-xs bg-background border border-border rounded-md px-2 max-w-[120px] sm:max-w-[160px] focus-visible:outline-none focus-visible:border-primary/50 transition-colors">
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <label className="inline-flex items-center gap-1 h-8 text-xs text-muted-foreground border border-border rounded-md px-2 cursor-pointer hover:border-primary/40 hover:text-foreground transition-colors">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Fotos</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            {sending ? (
              <Button onClick={handleStop} variant="outline" size="sm" className="ml-auto h-8 gap-1.5"><Square className="w-3.5 h-3.5" /> Parar</Button>
            ) : (
              <Button onClick={handleSend} disabled={!input.trim()} size="sm" className="ml-auto h-8 gap-1.5"><Send className="w-4 h-4" /> Enviar</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
