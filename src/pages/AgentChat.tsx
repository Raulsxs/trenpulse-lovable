/**
 * AgentChat (/agent) — chat agêntico isolado (Fase 2 do pivot).
 * Consome o SSE do edge function `ai-agent` (Claude Haiku 4.5 + tool-calling).
 * Mantém os `messages` no formato Anthropic (devolvidos no done/confirm_request) p/ continuidade,
 * persistidos em localStorage por usuário. Reusa o ActionCard; confirma publicar/agendar/gasto-alto
 * via ConfirmAction. NÃO toca no /chat atual.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, Paperclip, X, Bot, Wand2, Coins, Square, Plus } from "lucide-react";
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
  listar_conexoes: "Vendo suas conexões…", consultar_saldo: "Conferindo seu saldo…",
  buscar_tendencias: "Buscando tendências…", planejar_calendario: "Planejando o calendário…",
  agendar_conteudo: "Agendando…", publicar: "Publicando…",
};

interface Tool { name: string; ok?: boolean; cancelled?: boolean }
interface Action { contentId: string; contentType: any; platform?: string }
interface Msg { id: string; role: "user" | "assistant"; text: string; tools: Tool[]; action?: Action }

const SUGGESTIONS = [
  "Crie um post sobre 5 sinais de burnout",
  "Monte um carrossel com dicas de produtividade",
  "Monte um plano de conteúdo pra essa semana",
  "O que tenho agendado essa semana?",
];

export default function AgentChat() {
  const [uiMessages, setUiMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<any>(null);
  const { balance } = useCredits();

  const convo = useRef<any[]>([]);        // messages Anthropic (continuidade)
  const curId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const storeKey = useRef<string>("");
  const uiRef = useRef<Msg[]>([]);

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
            if (Array.isArray(saved.ui)) setUiMessages(saved.ui);
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
      case "text":
        patchCur((m) => ({ ...m, text: m.text + (evt.delta || "") }));
        break;
      case "tool_start":
        patchCur((m) => ({ ...m, tools: [...m.tools, { name: evt.name }] }));
        break;
      case "tool_done":
        patchCur((m) => {
          const tools = [...m.tools];
          for (let i = tools.length - 1; i >= 0; i--) if (tools[i].name === evt.name && tools[i].ok === undefined) { tools[i] = { ...tools[i], ok: evt.ok, cancelled: evt.cancelled }; break; }
          return { ...m, tools };
        });
        break;
      case "action_result":
        if (evt.action_result?.content_id) {
          patchCur((m) => ({ ...m, action: { contentId: evt.action_result.content_id, contentType: evt.action_result.content_type || "post", platform: evt.action_result.platform } }));
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
    await streamAgent({ messages: convo.current, brandId: brandId || undefined, imageUrls: photosNow });
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

  return (
    <div className="flex flex-col h-[calc(100dvh-0px)] max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-border">
        <Bot className="w-5 h-5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold leading-tight truncate">Assistente TrendPulse <span className="text-[10px] font-medium text-primary align-middle">beta</span></h1>
          <p className="text-[11px] text-muted-foreground leading-tight truncate">Peça posts, carrosséis, edições — eu crio, agendo e publico.</p>
        </div>
        {balance !== null && (
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums shrink-0"><Coins className="w-3.5 h-3.5 text-[hsl(var(--credit))]" />{balance}</span>
        )}
        {uiMessages.length > 0 && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 shrink-0" onClick={handleNew} title="Nova conversa"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Nova</span></Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4">
        {uiMessages.length === 0 && (
          <div className="text-center pt-10 space-y-4">
            <Sparkles className="w-8 h-8 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Descreva o que você quer postar — eu cuido do resto.</p>
            <div className="flex flex-col gap-2 max-w-sm mx-auto">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => setInput(s)} className="text-left text-sm rounded-lg border border-border px-3 py-2 hover:border-primary/40 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
        {uiMessages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3.5 py-2 text-sm whitespace-pre-wrap" : "max-w-[90%] sm:max-w-[88%] space-y-2"}>
              {m.role === "assistant" && m.tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.tools.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {t.ok === undefined ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      {TOOL_LABEL[t.name] || t.name}{t.cancelled ? " (cancelado)" : ""}
                    </span>
                  ))}
                </div>
              )}
              {m.text && (
                <div className={m.role === "assistant" ? "rounded-2xl rounded-bl-sm bg-card border border-border px-3.5 py-2 text-sm whitespace-pre-wrap" : ""}>{m.text}</div>
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
                <img src={u} alt="" className="w-12 h-12 rounded object-cover border border-border" />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 shadow-sm"><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ex.: crie um carrossel sobre liderança e agenda pra segunda 9h"
            className="border-0 resize-none min-h-[56px] focus-visible:ring-0 rounded-none text-sm"
            disabled={sending}
          />
          <div className="flex items-center gap-2 px-2.5 py-2 border-t border-border/60 bg-muted/20">
            {brands.length > 0 && (
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="text-xs bg-background border border-border rounded-md px-2 py-1.5 max-w-[120px] sm:max-w-[140px]">
                <option value="">Sem marca</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-md px-2 py-1.5 cursor-pointer hover:border-primary/40">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Fotos</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            {sending ? (
              <Button onClick={handleStop} variant="outline" className="ml-auto h-8 gap-1.5"><Square className="w-3.5 h-3.5" /> Parar</Button>
            ) : (
              <Button onClick={handleSend} disabled={!input.trim()} className="ml-auto h-8 gap-1.5"><Send className="w-4 h-4" /> Enviar</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
