import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Plus, Copy, Check, KeyRound, Trash2, ShieldAlert, Link2, ChevronDown, ExternalLink, Unplug,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Perfil → Agentes: o lugar onde a pessoa liga o Claude ou o Codex à conta dela.
 *
 * O caminho principal é UM LINK (OAuth): cola no app, clica em conectar, entra na Trend e autoriza.
 * Sem token para copiar nem arquivo para editar. O token pessoal continua existindo, recolhido em
 * "avançado", para automação e para quem já usa o instalador.
 */

/** Tem que ser igual a LINK_MCP em supabase/functions/_shared/mcp-core.ts. */
const LINK = "https://trendpulse.com.br/mcp";
/** Endereço direto da função, usado só pelo token pessoal. */
const ENDPOINT_DIRETO = "https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/mcp";

const ESCOPOS = [
  { id: "read", rotulo: "Consultar", desc: "Saldo de créditos, calendário e redes conectadas", padrao: true },
  { id: "generate", rotulo: "Gerar conteúdo", desc: "Criar post, carrossel, story e tweet card — gasta crédito", padrao: true },
  { id: "schedule", rotulo: "Agendar", desc: "Colocar conteúdo no calendário e montar a semana", padrao: true },
  { id: "publish", rotulo: "Publicar na hora", desc: "Vai direto para a rede, sem passar pelo calendário", padrao: false, alerta: true },
] as const;

interface Token {
  id: string; name: string; prefixo: string; scopes: string[];
  created_at: string; last_used_at: string | null; revoked_at: string | null;
}
interface Grant {
  client: { id: string; name: string; uri: string; logo_uri: string };
  scopes: string[];
  granted_at: string;
}

const quando = (iso: string | null) => {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return d.toLocaleDateString("pt-BR");
};

function Copiar({ texto, rotulo = "Copiar", size = "sm" as const }: { texto: string; rotulo?: string; size?: "sm" | "default" }) {
  const [feito, setFeito] = useState(false);
  return (
    <Button
      type="button" variant="outline" size={size} className="shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setFeito(true);
          setTimeout(() => setFeito(false), 2000);
        } catch {
          toast.error("Não consegui copiar. Selecione o texto e copie na mão.");
        }
      }}
    >
      {feito ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
      {feito ? "Copiado" : rotulo}
    </Button>
  );
}

/** Um comando de terminal com botão de copiar. */
function Comando({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5">
      <code className="flex-1 min-w-0 font-mono text-xs leading-relaxed break-all">{texto}</code>
      <Copiar texto={texto} />
    </div>
  );
}

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{n}</span>
      <div className="min-w-0 flex-1 space-y-2 text-sm pt-0.5">{children}</div>
    </li>
  );
}

export default function AgentAccess() {
  // ── apps conectados por link ──
  const [grants, setGrants] = useState<Grant[]>([]);
  const [carregandoGrants, setCarregandoGrants] = useState(true);
  const [desconectando, setDesconectando] = useState<Grant | null>(null);

  // ── token pessoal (avançado) ──
  const [avancado, setAvancado] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>(ESCOPOS.filter((e) => e.padrao).map((e) => e.id));
  const [novoToken, setNovoToken] = useState<string | null>(null);
  const [revogando, setRevogando] = useState<Token | null>(null);

  const carregarGrants = useCallback(async () => {
    const { data, error } = await (supabase.auth as any).oauth.listGrants();
    // Erro aqui é tratado como lista vazia: sem nenhum app conectado ainda, não há o que mostrar, e
    // uma mensagem de erro assustaria quem só veio pegar o link.
    setGrants(!error && Array.isArray(data) ? (data as Grant[]) : []);
    setCarregandoGrants(false);
  }, []);

  const carregarTokens = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("api_tokens")
      .select("id, name, prefixo, scopes, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) toast.error("Não consegui carregar seus tokens: " + error.message);
    const lista = (data as Token[]) || [];
    setTokens(lista);
    // Quem já usa token pessoal chega com a seção aberta — esconder o que a pessoa usa atrapalha.
    if (lista.some((t) => !t.revoked_at)) setAvancado(true);
    setCarregando(false);
  }, []);

  useEffect(() => { carregarGrants(); carregarTokens(); }, [carregarGrants, carregarTokens]);

  const desconectar = async (g: Grant) => {
    const { error } = await (supabase.auth as any).oauth.revokeGrant({ clientId: g.client.id });
    if (error) return toast.error("Falha ao desconectar: " + error.message);
    toast.success(`${g.client.name} foi desconectado. O acesso para na próxima chamada.`);
    setDesconectando(null);
    carregarGrants();
  };

  const criar = async () => {
    if (!nome.trim()) return toast.error("Dê um nome ao token — é como você vai reconhecê-lo depois.");
    if (!escolhidos.length) return toast.error("Escolha ao menos uma permissão.");
    setCriando(true);
    const { data, error } = await (supabase as any).rpc("create_api_token", {
      p_name: nome.trim(), p_scopes: escolhidos, p_expires_at: null,
    });
    setCriando(false);
    if (error) return toast.error("Falha ao criar: " + error.message);
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha?.token) return toast.error("O token não voltou do servidor. Tente de novo.");
    setNovoToken(linha.token);
    setNome("");
    carregarTokens();
  };

  const revogar = async (t: Token) => {
    const { error } = await (supabase as any)
      .from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", t.id);
    if (error) return toast.error("Falha ao revogar: " + error.message);
    toast.success(`"${t.name}" foi revogado. Ele para de funcionar na próxima chamada.`);
    setRevogando(null);
    carregarTokens();
  };

  const ativos = tokens.filter((t) => !t.revoked_at);
  const revogados = tokens.filter((t) => t.revoked_at);

  return (
    <div className="space-y-6">
      {/* ═════════ Conectar por link ═════════ */}
      <Card className="shadow-card border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Conectar ao Claude ou ao Codex
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cole este link no app, clique em conectar e autorize com a sua conta TrendPulse. O agente
            passa a criar conteúdo, subir suas artes e cuidar do seu calendário sem você sair da conversa.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-2">
            <div className="flex-1 min-w-0 rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 font-mono text-sm truncate">
              {LINK}
            </div>
            <Copiar texto={LINK} rotulo="Copiar link" size="default" />
          </div>

          <Tabs defaultValue="claude" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="claude">Claude</TabsTrigger>
              <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
              <TabsTrigger value="codex">Codex</TabsTrigger>
            </TabsList>

            <TabsContent value="claude" className="mt-0">
              <ol className="space-y-3.5">
                <Passo n={1}>
                  <p>
                    No Claude, abra{" "}
                    <a href="https://claude.ai/customize/connectors" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2 inline-flex items-center gap-1">
                      Configurações → Conectores <ExternalLink className="w-3 h-3" />
                    </a>.
                  </p>
                </Passo>
                <Passo n={2}><p>Clique em <b>Adicionar conector personalizado</b>, dê o nome <b>TrendPulse</b> e cole o link.</p></Passo>
                <Passo n={3}><p>Clique em <b>Conectar</b>, entre com a sua conta TrendPulse e autorize.</p></Passo>
              </ol>
              <p className="text-xs text-muted-foreground mt-4">
                Vale para o site e para o app do Claude. Em planos Team e Enterprise, só administradores
                adicionam conectores. Aqui o agente agenda artes que já estão num link — para subir arquivos
                do seu computador, use o Claude Code ou o Codex.
              </p>
            </TabsContent>

            <TabsContent value="claude-code" className="mt-0">
              <ol className="space-y-3.5">
                <Passo n={1}><p>No terminal, adicione o TrendPulse:</p><Comando texto={`claude mcp add --transport http trendpulse ${LINK}`} /></Passo>
                <Passo n={2}>
                  <p>Conecte a sua conta:</p><Comando texto="claude mcp login trendpulse" />
                  <p className="text-xs text-muted-foreground">Ou, dentro do Claude Code, digite <code className="font-mono">/mcp</code>, escolha TrendPulse e autentique.</p>
                </Passo>
                <Passo n={3}><p>O navegador abre: entre com a sua conta TrendPulse e autorize.</p></Passo>
              </ol>
            </TabsContent>

            <TabsContent value="codex" className="mt-0">
              <ol className="space-y-3.5">
                <Passo n={1}><p>No terminal, adicione o TrendPulse:</p><Comando texto={`codex mcp add trendpulse --url ${LINK}`} /></Passo>
                <Passo n={2}><p>Conecte a sua conta:</p><Comando texto="codex mcp login trendpulse" /></Passo>
                <Passo n={3}><p>O navegador abre: entre com a sua conta TrendPulse e autorize.</p></Passo>
              </ol>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ═════════ Apps conectados ═════════ */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Apps conectados</CardTitle>
        </CardHeader>
        <CardContent>
          {carregandoGrants ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : grants.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nenhum app conectado ainda. Quando você autorizar o Claude ou o Codex, eles aparecem aqui.
            </p>
          ) : (
            <div className="divide-y divide-border/60 -my-3">
              {grants.map((g) => (
                <div key={g.client.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{g.client.name || "App sem nome"}</p>
                    <p className="text-xs text-muted-foreground">Conectado {quando(g.granted_at)}</p>
                  </div>
                  <Button
                    variant="ghost" size="sm" onClick={() => setDesconectando(g)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Unplug className="w-3.5 h-3.5 mr-1.5" /> Desconectar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═════════ Token pessoal (avançado) ═════════ */}
      <div className="space-y-4">
        <button
          type="button" onClick={() => setAvancado((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${avancado ? "rotate-180" : ""}`} />
          Avançado: token pessoal {ativos.length > 0 && <Badge variant="secondary" className="text-[10px]">{ativos.length} ativo{ativos.length > 1 ? "s" : ""}</Badge>}
        </button>

        {avancado && (
          <>
            <p className="text-sm text-muted-foreground">
              Para automações, servidores e o instalador de clique duplo. No dia a dia, prefira o link acima.
            </p>

            {novoToken && (
              <Card className="border-[hsl(var(--credit))]/40 bg-[hsl(var(--credit))]/5 shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[hsl(var(--credit))]" />
                    Copie agora — este token não aparece de novo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Guarde num gerenciador de senhas. Só o resumo criptográfico fica salvo aqui. Perdeu? Revogue e crie outro.
                  </p>
                  <div className="flex gap-2">
                    <code className="flex-1 min-w-0 rounded-md bg-background border border-border px-3 py-2.5 font-mono text-xs break-all">{novoToken}</code>
                    <Copiar texto={novoToken} rotulo="Copiar token" />
                  </div>
                  <Comando texto={`claude mcp add --transport http trendpulse ${ENDPOINT_DIRETO} --header "Authorization: Bearer ${novoToken}"`} />
                  <Button variant="outline" size="sm" onClick={() => setNovoToken(null)}>Já guardei</Button>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-card border-border/50">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Novo token</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="nome-token">Nome</Label>
                  <Input
                    id="nome-token" value={nome} onChange={(e) => setNome(e.target.value)}
                    placeholder="Automação do escritório" maxLength={60}
                    onKeyDown={(e) => { if (e.key === "Enter" && !criando) criar(); }}
                  />
                </div>
                <div className="space-y-3">
                  <Label>O que este token pode fazer</Label>
                  {ESCOPOS.map((e) => (
                    <label key={e.id} className="flex items-start gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-muted/40 transition-colors">
                      <Checkbox
                        checked={escolhidos.includes(e.id)}
                        onCheckedChange={(v) => setEscolhidos((a) => (v ? [...a, e.id] : a.filter((x) => x !== e.id)))}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          {e.rotulo}
                          {"alerta" in e && e.alerta && (
                            <Badge variant="outline" className="text-[10px] font-normal border-destructive/40 text-destructive">
                              <ShieldAlert className="w-3 h-3 mr-1" /> fora do padrão
                            </Badge>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{e.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <Button onClick={criar} disabled={criando} className="w-full sm:w-auto">
                  {criando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Criar token
                </Button>
              </CardContent>
            </Card>

            {!carregando && tokens.length > 0 && (
              <Card className="shadow-card border-border/50">
                <CardHeader><CardTitle className="text-base">Tokens</CardTitle></CardHeader>
                <CardContent>
                  <div className="divide-y divide-border/60 -my-3">
                    {[...ativos, ...revogados].map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                            <span className={t.revoked_at ? "line-through text-muted-foreground" : ""}>{t.name}</span>
                            {t.revoked_at && <Badge variant="secondary" className="text-[10px]">revogado</Badge>}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground mt-0.5">{t.prefixo}…</p>
                          <p className="text-xs text-muted-foreground mt-1.5">Criado {quando(t.created_at)} · Usado {quando(t.last_used_at)}</p>
                        </div>
                        {!t.revoked_at && (
                          <Button variant="ghost" size="sm" onClick={() => setRevogando(t)} className="shrink-0 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Revogar
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <AlertDialog open={!!desconectando} onOpenChange={(o) => !o && setDesconectando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar {desconectando?.client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O app perde o acesso à sua conta na próxima chamada. Nada do que já foi criado ou agendado
              se perde. Para voltar a usar, é só conectar pelo link de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => desconectando && desconectar(desconectando)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!revogando} onOpenChange={(o) => !o && setRevogando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar “{revogando?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Quem usa este token perde o acesso na próxima chamada. Seus outros acessos e sua conta não
              são afetados. Não dá para desfazer — se precisar de novo, crie outro token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => revogando && revogar(revogando)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
