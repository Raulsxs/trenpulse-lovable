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
import { Sparkles, Send, Loader2, Paperclip, X, Bot, Wand2, Coins, Square, Plus, Check, AlertTriangle, Image as ImageIcon, LayoutGrid, CalendarClock, ListChecks, FileText, Upload } from "lucide-react";
import ActionCard from "@/components/chat/ActionCard";
import ConfirmAction from "@/components/chat/ConfirmAction";
import { useCredits } from "@/hooks/useCredits";
import { isSupportedDocument, extractDocumentText, truncateForPrompt } from "@/lib/documentExtract";

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

// 3 níveis amigáveis (o leigo escolhe por benefício, não por nome de modelo). O id continua sendo
// o modelo real que o backend entende. Econômico=seedream, Padrão=gpt-image-2, Premium=nano-banana.
const MODELS = [
  { id: "seedream", label: "Econômico · mais posts pelo mesmo valor" },
  { id: "gpt-image-2", label: "Padrão · melhor texto (recomendado)" },
  { id: "nano-banana", label: "Premium · máxima qualidade" },
];

interface Tool { name: string; ok?: boolean; cancelled?: boolean }
interface Action { contentId: string; contentType: any; platform?: string; refreshKey?: number }
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
  // Documento (PDF/DOCX/TXT/MD) anexado como briefing — injeta o texto na próxima mensagem.
  const [doc, setDoc] = useState<{ name: string; text: string } | null>(null);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
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
  const toolBreak = useRef(false);   // separa texto pré/pós tool no mesmo balão
  const shownContent = useRef<Set<string>>(new Set()); // dedup ActionCard por content_id (1 card/conteúdo) — evita 2 canais realtime no mesmo content (crash)

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
                let action = m.action;
                if (action?.contentId) {
                  if (seen.has(action.contentId)) action = undefined;
                  else seen.add(action.contentId);
                }
                // Tool "rodando" (ok indefinido) só sobrevive se a sessão anterior foi interrompida
                // no meio. Geração NÃO retoma ao recarregar → marca como concluída pra não ficar
                // girando "Gerando imagem…" pra sempre (o bug do spinner fantasma ao voltar pra página).
                const tools = m.tools?.some((t) => t.ok === undefined)
                  ? m.tools.map((t) => (t.ok === undefined ? { ...t, ok: true } : t))
                  : m.tools;
                return { ...m, action, tools };
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

  // Persiste só QUANDO o streaming termina (sending=false), via efeito — assim grava o estado JÁ
  // commitado (tool concluída + ActionCard). O persist() antigo lia uiRef.current no finally, antes
  // do React commitar os últimos eventos, salvando o frame "Gerando imagem…" → spinner fantasma.
  useEffect(() => {
    if (!storeKey.current || sending) return;
    try { localStorage.setItem(storeKey.current, JSON.stringify({ ui: uiMessages, convo: convo.current })); } catch { /* ignore */ }
  }, [uiMessages, sending]);

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
          // Dedup: só 1 ActionCard por content_id (2 cards no mesmo content = 2 canais realtime = crash).
          if (!shownContent.current.has(cid)) {
            shownContent.current.add(cid);
            patchCur((m) => ({ ...m, action: { contentId: cid, contentType: evt.action_result.content_type || "post", platform: evt.action_result.platform } }));
          } else {
            // Edição reusa o mesmo content_id. O card NÃO se atualiza sozinho — o canal realtime já foi
            // encerrado após carregar a 1ª imagem. Sem isto, "corrigiu mas não mostrou a imagem corrigida"
            // (queixa do Felipe). Bump refreshKey no card existente → ActionCard re-busca o conteúdo.
            setUiMessages((prev) => prev.map((m) => m.action?.contentId === cid
              ? { ...m, action: { ...m.action, refreshKey: (m.action.refreshKey || 0) + 1 } }
              : m));
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
      setSending(false); // dispara o efeito de persistência com o estado final já commitado
    }
  }

  async function handleSend() {
    const text = input.trim();
    // Permite enviar só com documento anexado (sem digitar) — o briefing carrega o pedido.
    if ((!text && !doc) || sending) return;
    setInput("");
    const photosNow = [...photos];
    setPhotos([]);
    const docNow = doc;
    setDoc(null);
    // Texto que a IA vê: o digitado + o conteúdo do documento no padrão """...""" (o agente já lê isso).
    const sendText = docNow
      ? `${text || `Use o documento "${docNow.name}" como base para criar o conteúdo.`}\n\nDOCUMENTO "${docNow.name}":\n"""\n${docNow.text}\n"""`
      : text;
    // No balão do usuário mostramos o texto digitado + um marcador do anexo (não o texto cru gigante).
    const bubble = docNow ? `${text}${text ? "\n\n" : ""}📎 ${docNow.name}`.trim() : text;
    setUiMessages((ms) => [...ms, { id: newId(), role: "user", text: bubble, tools: [] }]);
    convo.current = [...convo.current, { role: "user", content: sendText }];
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
    setPendingConfirm(null); // o efeito de persistência grava o estado limpo (sending=false)
  }

  async function uploadImages(files: File[]) {
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

  async function extractDoc(file: File) {
    setExtractingDoc(true);
    try {
      const text = await extractDocumentText(file);
      if (!text) { toast.error("Não consegui extrair texto desse documento."); return; }
      setDoc({ name: file.name, text: truncateForPrompt(text) });
      toast.success(`"${file.name}" carregado como briefing`);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao ler o documento");
    } finally {
      setExtractingDoc(false);
    }
  }

  // Roteia arquivos: imagens → upload (referência); documento (PDF/DOCX/TXT/MD) → briefing de texto.
  async function handleFiles(files: File[]) {
    if (!files.length) return;
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const docFile = files.find(isSupportedDocument);
    if (imgs.length) await uploadImages(imgs);
    if (docFile) await extractDoc(docFile);
    if (!imgs.length && !docFile) toast.error("Formato não suportado. Use imagem, PDF, DOCX, TXT ou MD.");
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    handleFiles(files);
  }

  function onDragEnter(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
    e.preventDefault(); dragDepth.current += 1; setDragging(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (Array.from(e.dataTransfer?.types || []).includes("Files")) e.preventDefault();
  }
  function onDragLeave() { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); dragDepth.current = 0; setDragging(false);
    if (sending) return;
    handleFiles(Array.from(e.dataTransfer.files || []));
  }

  const lastId = uiMessages[uiMessages.length - 1]?.id;

  return (
    <div
      className="relative flex flex-col h-[calc(100dvh-0px)] max-w-3xl mx-auto w-full"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-primary/5 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="w-8 h-8" />
            <p className="text-sm font-semibold">Solte aqui — imagem, PDF, artigo ou documento</p>
          </div>
        </div>
      )}
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
                    // Só gira se há stream ativo. Sem isso, uma tool persistida com ok indefinido
                    // (sessão interrompida) renderizaria o spinner "Gerando imagem…" pra sempre.
                    const running = sending && t.ok === undefined;
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
                <ActionCard contentId={m.action.contentId} contentType={m.action.contentType} platform={m.action.platform} refreshKey={m.action.refreshKey} />
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
        {(photos.length > 0 || doc || extractingDoc) && (
          <div className="flex gap-2 flex-wrap items-center">
            {photos.map((u, i) => (
              <div key={i} className="relative">
                <img src={u} alt="" className="w-12 h-12 rounded-md object-cover border border-border" />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 shadow-sm hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </div>
            ))}
            {extractingDoc && (
              <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-muted/40 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo documento…
              </div>
            )}
            {doc && (
              <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-card text-xs">
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="max-w-[160px] truncate">{doc.name}</span>
                <button onClick={() => setDoc(null)} className="hover:text-destructive transition-colors"><X className="w-3 h-3" /></button>
              </div>
            )}
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
              {uploading || extractingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Anexar</span>
              <input type="file" accept="image/*,.pdf,.docx,.txt,.md" multiple className="hidden" onChange={handleUpload} disabled={uploading || extractingDoc} />
            </label>
            {sending ? (
              <Button onClick={handleStop} variant="outline" size="sm" className="ml-auto h-8 gap-1.5"><Square className="w-3.5 h-3.5" /> Parar</Button>
            ) : (
              <Button onClick={handleSend} disabled={!input.trim() && !doc} size="sm" className="ml-auto h-8 gap-1.5"><Send className="w-4 h-4" /> Enviar</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
