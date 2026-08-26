# SEO TrendPulse — registro de execução

**Data:** 2026-08-25
**Executor:** Gabriel Seixas
**Origem:** reunião com Raul em 25/08/2026
**Card CRM:** Workspace TrendPulse → "Fazer todos os itens para lançamento da Trend (ajustes de SEO e etc)"
**Tempo gasto:** 2h

---

## Por que essa task nasceu

Na reunião o Raul disse que nunca olhou para SEO na TrendPulse, e que quer que
a Trend seja encontrada no Google e **citada pelas IAs** (ChatGPT, Claude,
Perplexity) quando alguém pergunta sobre ferramenta de geração de conteúdo.
Meta declarada: **50 usuários na TrendPulse**.

## Diagnóstico encontrado

O site é um SPA (React + Vite). O HTML servido vem vazio (`<div id="root">`) e
o conteúdo só aparece depois que o JavaScript roda.

- **Googlebot** executa JavaScript → enxerga o site.
- **GPTBot, ClaudeBot, PerplexityBot** NÃO executam JavaScript → enxergavam
  uma página em branco.

Achados concretos, arquivo por arquivo:

| Onde | Problema |
|---|---|
| `index.html` | `<title>TrendPulse</title>` — sem palavra-chave. Ninguém busca a marca ainda. |
| `index.html` | `description` com 34 caracteres (Google exibe até ~155). |
| `index.html` | `twitter:site` = `@Lovable` — perfil de outra empresa, sobra de template. |
| `index.html` | `og:image` apontava para URL de preview temporária da Lovable (`id-preview-...lovable.app`). Se a Lovable apagar, todo link compartilhado quebra. |
| `index.html` | Sem `canonical`, sem JSON-LD. |
| `public/` | Sem `sitemap.xml`. |
| `public/robots.txt` | Sem linha `Sitemap:` e sem crawlers de IA declarados. |

## O que foi feito

### 1. `index.html`
- `title` reescrito: `TrendPulse — Gere posts e carrosséis para Instagram com IA` (58 caracteres).
- `description` reescrita com 145 caracteres, cobrindo Instagram, LinkedIn e TikTok.
- `<link rel="canonical" href="https://trendpulse.com.br/">` adicionado.
- Bloco Open Graph completo: `og:url`, `og:site_name`, `og:locale`, `og:title`, `og:description`, `og:image`.
- `twitter:site content="@Lovable"` **removido**.
- `author` corrigido de `TrendPulse` para `Pulse ID`.
- **JSON-LD** adicionado (`@graph` com `Organization`, `WebSite`, `SoftwareApplication`),
  incluindo os três planos (Free R$0, Pro R$147,90, Business R$297,00) e a lista de
  funcionalidades. É o bloco que dá às IAs uma descrição confiável do produto sem
  precisar executar JavaScript.

### 2. `public/og-image.png` (novo)
Imagem do card de preview baixada da CDN da Lovable e passada a ser servida do
nosso domínio. Elimina a dependência de URL de terceiro.

### 3. `public/sitemap.xml` (novo)
Lista `/`, `/pricing`, `/auth`, `/privacy` com `lastmod`, `changefreq` e `priority`.

### 4. `public/robots.txt`
- Liberado explicitamente: `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`,
  `Claude-Web`, `PerplexityBot`, `Google-Extended`.
- Adicionada linha `Sitemap: https://trendpulse.com.br/sitemap.xml`.

## Como testar

```bash
npm test        # 67 testes passando
npm run build   # build OK, exit 0
```

Depois do deploy:
1. Colar `https://trendpulse.com.br` no WhatsApp → o card de preview deve carregar.
2. Abrir `https://trendpulse.com.br/sitemap.xml` e `/robots.txt` → devem responder.
3. Validar o JSON-LD em https://search.google.com/test/rich-results
4. Submeter o sitemap no Google Search Console.

## Pendências (viram cards próprios)

1. **`og-image.png` está em 1920x2263 (vertical).** O formato correto para card de
   preview é 1200x630 (horizontal). Hoje o WhatsApp e o LinkedIn vão cortar a imagem.
   Precisa de arte nova — tarefa para a Amanda.
2. **Pré-render da landing.** É o item que realmente resolve o problema dos crawlers
   de IA. Mexe no processo de build, e a Lovable faz deploy automático a cada push:
   se o build quebrar, a Trend sai do ar. **Precisa de janela combinada com o Raul.**
3. **Páginas de conteúdo indexáveis.** As 20+ rotas atuais estão atrás de login. SEO de
   SaaS vive de páginas de conteúdo, não da home. Sugestão inicial: `/para-gestores`,
   `/vs-canva`, `/como-criar-carrossel-instagram-com-ia`.
4. **Google Search Console** — a propriedade do domínio ainda não foi criada. Sem isso
   não dá para medir nada do que foi feito aqui. Precisa de acesso do Raul.
5. **`mammoth` não instalado.** Está no `package.json:57` mas ausente de `node_modules`,
   o que quebrava `npm run build` antes desta task. Não tem relação com SEO, mas vale
   conferir se o build da Lovable também está sendo afetado.

## Arquivos alterados

```
M  index.html
M  public/robots.txt
A  public/og-image.png
A  public/sitemap.xml
A  docs/SEO_TRENDPULSE.md
```
