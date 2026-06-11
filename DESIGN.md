# DESIGN.md — TrendPulse (Onda 1, 2026-06-11)

## Direção

Estúdio claro, frio, denso. Layering sutil (bordas quase invisíveis, elevação por lightness), 1 accent (teal do produto), e a assinatura: **chip de custo âmbar** em toda ação que gasta créditos.

## Tokens (espelham o app: HSL no index.css + mockup 02)

- **Base/canvas:** `--background: 210 33% 98%` (bancada fria) · superfícies brancas com borda `rgba(20,37,58,0.10)`
- **Texto:** primário `#14253A`-equivalente · secundário `hsl(215 25% 35%)` · meta `hsl(215 18% 55%)`
- **Primary (marca):** `210 100% 35%` (azul TrendPulse) · **Accent:** `175 72% 40%` (teal — ação criativa, único accent)
- **Créditos (assinatura):** âmbar — texto `#A05E03`, fundo `#FFF4E0`, borda `rgba(160,94,3,0.25)`. NUNCA usar âmbar pra outra coisa.
- **Sucesso** `#15803D` · destrutivo padrão shadcn

## Densidade (a regra da Onda 1)

- Unidade base **8px**; paddings de card 12-16px (não 24+); fonte UI 13.5px; títulos de seção 11px uppercase tracking-wide.
- Botões `size="sm"` como default em painéis; `h-9` máximo em ações primárias de card.
- Sidebar 208px, itens py-7px.

## Componentes-assinatura

- **CostChip** (`src/components/ui/cost-chip.tsx`): pill âmbar `N cr`, variante `grátis` (verde). Em toda ação que debita.
- **Stepper do loop** (ActionCard): Gerado → Marca aplicada → Agendar → Publicado; feito=verde, atual=azul, futuro=cinza.
- **4 ações universais** em todo resultado: [Publicar agora][Agendar][Baixar·grátis][Refazer·Ncr].

## Profundidade

Bordas-only + elevação por cor (sem sombras dramáticas). Dropdown 1 nível acima do pai. Inputs levemente rebaixados (`--inset`).

## Tipografia

Inter (a do app). Hierarquia por peso (700/600/500) + tamanho; números tabulares (`tabular-nums`) em créditos/contadores.

## Motion

Micro-interações 120-180ms ease-out. Nada de bounce.

## Bans do projeto

Sem gradient text, sem side-stripe borders, sem glassmorphism, sem hero-metric, sem modais novos quando inline resolve. Em dúvida: mockup 02 é a referência visual.
