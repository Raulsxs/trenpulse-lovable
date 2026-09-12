import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Copy, Check, KeyRound, Trash2, ShieldAlert, Terminal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ENDPOINT = "https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/mcp";

/**
 * Escopos, em português de gente. A descrição é o que a pessoa lê para decidir — por isso fala do
 * que o agente PASSA A PODER FAZER, não do nome interno da permissão.
 *
 * `publish` vem desmarcado e avisado: publicar na hora pula o calendário, ou seja, pula a chance de
 * a pessoa ver a peça antes de ela ir ao ar no perfil dela. Quem quer isso pede; ninguém deve
 * receber por descuido.
 */
const ESCOPOS = [
  { id: "read", rotulo: "Consultar", desc: "Saldo de créditos, calendário e redes conectadas", padrao: true },
  { id: "generate", rotulo: "Gerar conteúdo", desc: "Criar post, carrossel, story e tweet card — gasta crédito", padrao: true },
  { id: "schedule", rotulo: "Agendar", desc: "Colocar conteúdo no calendário e montar a semana", padrao: true },
  { id: "publish", rotulo: "Publicar na hora", desc: "Vai direto para a rede, sem passar pelo calendário", padrao: false, alerta: true },
] as const;

interface Token {
  id: string;
  name: string;
  prefixo: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
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

/** Botão de copiar que confirma na própria etiqueta — sem toast para uma ação tão pequena. */
function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [feito, setFeito] = useState(false);
  return (
    <Button
      type="button" variant="outline" size="sm" className="shrink-0"
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

export default function AgentAccess() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>(ESCOPOS.filter((e) => e.padrao).map((e) => e.id));
  const [novoToken, setNovoToken] = useState<string | null>(null);
  const [revogando, setRevogando] = useState<Token | null>(null);

  const carregar = useCallback(async () => {
    // `as any`: api_tokens é tabela nova e ainda não está nos tipos gerados (mesmo padrão de
    // user_credits). A RLS já garante que só vêm os tokens do próprio usuário.
    const { data, error } = await (supabase as any)
      .from("api_tokens")
      .select("id, name, prefixo, scopes, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) toast.error("Não consegui carregar seus tokens: " + error.message);
    setTokens((data as Token[]) || []);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

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
    setNovoToken(linha.token);   // única vez que ele existe em texto claro
    setNome("");
    carregar();
  };

  const revogar = async (t: Token) => {
    const { error } = await (supabase as any)
      .from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", t.id);
    if (error) return toast.error("Falha ao revogar: " + error.message);
    toast.success(`"${t.name}" foi revogado. Ele para de funcionar na próxima chamada.`);
    setRevogando(null);
    carregar();
  };

  const ativos = tokens.filter((t) => !t.revoked_at);
  const revogados = tokens.filter((t) => t.revoked_at);

  return (
    <div className="space-y-6">
      {/* ── O token recém-criado. Aparece UMA vez; o banco só guarda o hash. ── */}
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
              Guarde num gerenciador de senhas. Só o resumo criptográfico fica salvo aqui, então nem
              nós conseguimos mostrá-lo outra vez. Perdeu? Revogue e crie outro.
            </p>
            <div className="flex gap-2">
              <code className="flex-1 min-w-0 rounded-md bg-background border border-border px-3 py-2.5 font-mono text-xs break-all">
                {novoToken}
              </code>
              <Copiar texto={novoToken} rotulo="Copiar token" />
            </div>

            <div className="rounded-md border border-border bg-background p-4 space-y-3">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" /> Conectar no Claude Code
              </p>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 font-mono text-[11px] leading-relaxed break-all text-muted-foreground">
                  claude mcp add --transport http trendpulse {ENDPOINT} --header "Authorization: Bearer {novoToken}"
                </code>
                <Copiar
                  texto={`claude mcp add --transport http trendpulse ${ENDPOINT} --header "Authorization: Bearer ${novoToken}"`}
                />
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={() => setNovoToken(null)}>
              Já guardei
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Criar ── */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Novo acesso de agente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="nome-token">Nome</Label>
            <Input
              id="nome-token" value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Claude no meu notebook" maxLength={60}
              onKeyDown={(e) => { if (e.key === "Enter" && !criando) criar(); }}
            />
            <p className="text-xs text-muted-foreground">
              Serve para você saber qual revogar depois. Um token por máquina facilita a vida.
            </p>
          </div>

          <div className="space-y-3">
            <Label>O que este agente pode fazer</Label>
            {ESCOPOS.map((e) => {
              const marcado = escolhidos.includes(e.id);
              return (
                <label
                  key={e.id}
                  className="flex items-start gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <Checkbox
                    checked={marcado}
                    onCheckedChange={(v) =>
                      setEscolhidos((atual) => (v ? [...atual, e.id] : atual.filter((x) => x !== e.id)))
                    }
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      {e.rotulo}
                      {e.alerta && (
                        <Badge variant="outline" className="text-[10px] font-normal border-destructive/40 text-destructive">
                          <ShieldAlert className="w-3 h-3 mr-1" /> fora do padrão
                        </Badge>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{e.desc}</span>
                  </span>
                </label>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Ferramenta fora da permissão nem aparece para o agente — ele não sabe que ela existe.
            </p>
          </div>

          <Button onClick={criar} disabled={criando} className="w-full sm:w-auto">
            {criando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Criar token
          </Button>
        </CardContent>
      </Card>

      {/* ── Lista ── */}
      <Card className="shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhum token ainda. Crie um acima para conectar o Claude ou o Codex à sua conta.
            </p>
          ) : (
            <div className="divide-y divide-border/60 -my-3">
              {[...ativos, ...revogados].map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <span className={t.revoked_at ? "line-through text-muted-foreground" : ""}>{t.name}</span>
                      {t.revoked_at && <Badge variant="secondary" className="text-[10px]">revogado</Badge>}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground mt-0.5">{t.prefixo}…</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.scopes.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px] font-normal">
                          {ESCOPOS.find((e) => e.id === s)?.rotulo || s}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Criado {quando(t.created_at)} · Usado {quando(t.last_used_at)}
                    </p>
                  </div>
                  {!t.revoked_at && (
                    <Button
                      variant="ghost" size="sm" onClick={() => setRevogando(t)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Revogar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!revogando} onOpenChange={(o) => !o && setRevogando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar “{revogando?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O agente que usa este token perde o acesso na próxima chamada. Seus outros tokens e sua
              conta não são afetados, e nada que já foi gerado ou agendado se perde. Não dá para
              desfazer — se precisar de novo, crie outro token.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revogando && revogar(revogando)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
