# Handoff — sessão 25/08/2026 (SEO TrendPulse)

Documento para retomar o trabalho numa próxima sessão do Claude Code.
Leia junto com `docs/SEO_TRENDPULSE.md`, que tem o detalhe técnico da execução.

---

## Contexto: reunião Raul + Gabriel, 25/08/2026

Reunião de alinhamento. Pontos que importam:

- **A Pulse largou o Notion.** As tasks do Gabriel agora vivem no **CRM próprio da
  Pulse** (construído pelo Filipe). Estrutura: workspaces → projetos → Kanban
  (A fazer / Fazendo / Revisão / Concluído). O `CLAUDE.md` global ainda diz que as
  tasks vêm do Notion — **está desatualizado**.
- O Raul cobra registro no CRM: horas por tarefa, comentário do que foi feito,
  checklists. Frase dele: *"hoje eu tô no escuro, não sei o que tu tá fazendo"*.
- **Gabriel ainda não tem a senha do CRM** — o Raul ia mandar. Até lá, todo trabalho
  fica registrado em arquivo para ser colado no CRM depois.
- **Meta numérica da TrendPulse: 50 usuários.** Único KPI concreto da reunião.
- **Público-alvo:** gestores e donos de empresa, não público geral.
- Empresa hoje: 5 clientes (Maikon, GSS, Agis, Mairó, Bambino). Raul quer +2 até
  o fim do ano.
- Metas do Gabriel até o fim de 2026: entrar em cliente operacional (candidato:
  Maikon, pouca demanda), aprender o bastante para tocar cliente do zero.
- Referências de estudo indicadas pelo Raul: Augusto Galego e Lucas Montano (YouTube).

### Correções de nome (a transcrição da reunião erra)
- **Higgsfield** — aparece como "Rigsfield", "Rixfield", "Rick's Food".
- **Pulse ID** — aparece como "Pulse HD", "PulseG".
- **SaaS** — aparece como "SAS".

## As 4 frentes abertas (cards do CRM)

1. Pensar ideias de vídeos virais de TikTok para a Trend — *card criado pelo Raul*
2. Analisar roteiros de vídeo para o Higgsfield — *card criado pelo Raul*
3. Fazer todos os itens de lançamento da Trend, ajustes de SEO — *card criado pelo Raul* — **EM EXECUÇÃO**
4. Pesquisar como divulgar/crescer SaaS — *card ainda não criado*

## O que foi feito nesta sessão

Frente 3, "Bloco A" (SEO técnico on-page). Detalhe completo em `docs/SEO_TRENDPULSE.md`.

Arquivos no working tree, **NÃO commitados**:

```
M  index.html                 title/description/canonical/OG/JSON-LD; twitter:site @Lovable removido
M  public/robots.txt          7 crawlers de IA liberados + linha Sitemap:
A  public/og-image.png        imagem do card de preview, agora servida do nosso domínio
A  public/sitemap.xml         4 URLs
A  docs/SEO_TRENDPULSE.md     registro para colar no CRM
A  docs/HANDOFF_...md         este arquivo
```

Verificado: `npm test` 67/67 passando, `npm run build` exit 0, tags confirmadas
no `dist/index.html`.

## Estado real: SEO NÃO está resolvido

O que foi feito é a camada base on-page. Não está valendo nada ainda porque:

1. **Nada foi deployado.** Os arquivos estão só na máquina do Gabriel. O site no ar
   continua com o title antigo.
2. **Não dá para medir** — a propriedade do Google Search Console nem existe.

## Próximos passos, em ordem de impacto

| # | O quê | Bloqueio |
|---|---|---|
| 1 | Commitar + PR + deploy do que já foi feito | decisão do Gabriel |
| 2 | Criar propriedade no Google Search Console, submeter sitemap | precisa de acesso do Raul |
| 3 | Páginas de conteúdo indexáveis (`/para-gestores`, `/vs-canva`, `/como-criar-carrossel-instagram-com-ia`) | nenhum, é o de maior retorno |
| 4 | Pré-render da landing | **precisa de janela combinada com o Raul** — mexe no build e a Lovable faz deploy automático a cada push; se quebrar, a Trend sai do ar |
| 5 | `og-image.png` em 1200x630 (hoje está 1920x2263, vertical, vai cortar no WhatsApp) | arte com a Amanda |

## Expectativa a manter honesta com o Raul

SEO não dá retorno em dias — Google leva de semanas a meses para ranquear site novo.
**Os 50 usuários não virão de SEO no curto prazo.** Virão do TikTok. SEO compõe depois.

## Decisão técnica já tomada sobre vídeo (frente 1 e 2)

O vídeo de referência que o Raul mandou ("cara mexendo no sisteminha") é **screen
recording**, não precisa de Higgsfield. Higgsfield é caro e só se justifica em cena
com pessoa ou mundo real — no máximo para o hook de 2 segundos de abertura. Roteiro
tem que estar pronto antes de queimar crédito; foi exigência explícita do Raul.

## Pendência técnica não relacionada a SEO

`mammoth` está em `package.json:57` mas ausente de `node_modules`, o que quebrava
`npm run build` com:

```
[vite]: Rollup failed to resolve import "mammoth" from "src/lib/documentExtract.ts"
```

Foi instalado com `npm install mammoth --no-save` (o `package.json` não mudou).
Numa máquina limpa, rodar `npm install`.

**Verificado em 26/08: o build da Lovable NÃO é afetado.** O projeto tem dois
lockfiles. O `package-lock.json` (npm) é de 07/04 e não contém `mammoth`; o
`bun.lock` contém, desde o commit `e73e529` (14/05). A Lovable usa bun, e os 22
commits deployados depois disso confirmam. O problema é só do `npm run build`
local, com o `package-lock.json` defasado.
