# Guia de Migração: Lovable Cloud → Supabase Próprio

## Pré-requisitos
- Conta no GitHub com o projeto conectado
- Conta no Supabase (https://supabase.com)
- Acesso ao Lovable do projeto atual (com Cloud)

---

## Passo 1 — Preparar o código no GitHub

**No projeto Lovable ATUAL (com Cloud):**
1. Clique no ícone do GitHub → "Sincronizar com GitHub"
2. Conecte e transfira o código para o GitHub
3. Confirme que o código aparece no repositório do GitHub

---

## Passo 2 — Criar projeto em branco no Lovable

1. No Lovable, crie um **novo projeto**
2. Diga: "Crie um projeto em branco. Apenas uma tela branca."
3. Conecte esse projeto ao GitHub (novo repositório)
4. Anote o nome do novo repo (ex: `meu-projeto-novo`)

---

## Passo 3 — Copiar código para o novo repo

**No GitHub do projeto ANTIGO:**
1. Clique em **Code → Download ZIP**
2. Extraia o ZIP no seu computador
3. Abra o arquivo `.env` e **apague os valores** (deixe as chaves vazias):
   ```
   VITE_SUPABASE_PROJECT_ID=""
   VITE_SUPABASE_PUBLISHABLE_KEY=""
   VITE_SUPABASE_URL=""
   ```
4. Delete a pasta `dist/` se existir

**No GitHub do projeto NOVO (em branco):**
1. Clone o repo novo via GitHub Desktop ou VS Code
2. Delete todos os arquivos (exceto `.gitignore`)
3. Copie todos os arquivos do projeto antigo para dentro
4. Commit e Push

**O Lovable do projeto novo** deve receber o commit e mostrar a interface do projeto.

---

## Passo 4 — Conectar Supabase próprio

**No Lovable do projeto NOVO:**
1. Menu → **Integrações** → **Conectar Supabase**
2. Crie um **novo projeto Supabase** (região South America - São Paulo)
3. Conecte ao projeto

**Anote do Supabase Dashboard:**
- Project ID
- Anon Key (API Keys)
- Service Role Key (API Keys)
- Project URL (Data API)

---

## Passo 5 — Criar tabelas (migrations)

**Opção A — Pedir ao Lovable (recomendado):**
Mande no chat do Lovable NOVO:
```
Rode todas as SQL migrations que estão na pasta supabase/migrations/
no banco de dados Supabase conectado. Execute em ordem cronológica.
Se alguma tabela já existir, ignore e continue.
```

**Opção B — Manual pelo SQL Editor:**
1. Abra o Supabase Dashboard → SQL Editor
2. Para cada arquivo em `supabase/migrations/` (do mais antigo ao mais novo):
   - Abra no GitHub → copie o conteúdo → cole no SQL Editor → Run
3. Dica: concatene todos em um único arquivo para rodar de uma vez

**Problemas comuns:**
- `relation does not exist` → alguma tabela não foi criada pelas migrations (foi criada diretamente no Lovable Cloud). Crie manualmente baseado nos types em `src/integrations/supabase/types.ts`
- `column already exists` → use `ADD COLUMN IF NOT EXISTS` nas migrations
- `violates foreign key constraint` → um INSERT referencia dados que só existiam no Cloud. Remova esses INSERTs
- `column does not exist` → uma migration antiga criou a tabela sem uma coluna que migrations posteriores esperam. Adicione a coluna manualmente

---

## Passo 6 — Deploy das Edge Functions

**Opção A — Pedir ao Lovable (mais fácil):**
```
Deploy all edge functions from supabase/functions/ to the connected Supabase project.
```

**Opção B — GitHub Actions (automático):**
1. No GitHub do projeto novo, vá em Settings → Secrets → New repository secret
2. Adicione:
   - `SUPABASE_ACCESS_TOKEN` — do Supabase Dashboard → Account → Access Tokens
   - `SUPABASE_PROJECT_ID` — do Supabase Dashboard → Project Settings
3. Crie o arquivo `.github/workflows/deploy-supabase-functions.yml`:
```yaml
name: Deploy Supabase Edge Functions
on:
  push:
    branches: [main]
    paths: ['supabase/functions/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

**Opção C — Supabase CLI (manual):**
```bash
npx supabase login
npx supabase link --project-ref <project-id>
npx supabase functions deploy
```

---

## Passo 7 — Configurar Secrets

**No Supabase Dashboard → Edge Functions → Secrets:**

Adicione todas as API keys que o projeto usa. Exemplos comuns:
- `LOVABLE_API_KEY` — peça ao Lovable novo para configurar (ele tem acesso)
- Chaves de APIs externas (OpenAI, Stripe, etc.)

**Dica:** O Lovable Cloud não expõe secrets já salvas. Se não tem as keys anotadas:
- Gere novas nos dashboards dos provedores
- Ou peça ao Lovable novo para configurar o `LOVABLE_API_KEY` (ele injeta automaticamente)

---

## Passo 8 — Exportar dados do projeto antigo

**No Lovable do projeto ANTIGO, peça:**
```
Crie uma página admin temporária em /admin-export que permita exportar
em CSV todas as tabelas do banco de dados. Use uma edge function com
service_role_key para exportar TODOS os dados (não apenas do usuário logado).
Também exporte os auth.users com id, email, created_at.
```

Exporte todos os CSVs.

---

## Passo 9 — Importar usuários

**IMPORTANTE:** Os usuários precisam ser criados com os **mesmos UUIDs** do projeto antigo. Caso contrário, todas as referências `user_id` nos CSVs ficam quebradas.

**Peça ao Lovable do projeto NOVO:**
```
Crie uma edge function que recebe um array de {id, email} e cria
cada usuário no auth usando supabase.auth.admin.createUser()
com o campo id especificado. Use auto_confirm: true e senha temporária.
```

Passe todos os usuários com seus IDs originais.

---

## Passo 10 — Importar dados das tabelas

**No Supabase Dashboard → Table Editor:**
1. Clique na tabela
2. Insert → Import data from CSV
3. Selecione o CSV correspondente

**Ordem de importação (respeitar foreign keys):**
```
1. Tabelas sem dependências (profiles, configurações, etc.)
2. Tabelas principais (ex: brands, products, etc.)
3. Tabelas que dependem das principais
4. Tabelas que dependem de outras dependentes
```

**Dica:** Para tabelas muito grandes (>1000 registros), o Table Editor pode travar. Use o SQL Editor com INSERT statements ou importe via CLI.

---

## Passo 11 — Configurações finais

**Auth → URL Configuration:**
- Site URL: seu domínio
- Redirect URLs: `https://seu-dominio.com/*`

**Storage:**
- Verifique se os buckets necessários existem
- Migre imagens/arquivos se necessário

**Cron jobs:**
- Reconfigure triggers externos que chamam edge functions periodicamente

---

## Passo 12 — Testar

- [ ] Login/cadastro funciona
- [ ] Dados do usuário carregam corretamente
- [ ] Funcionalidades principais funcionam
- [ ] Edge functions respondem sem erro
- [ ] Storage (upload/download de arquivos) funciona

---

## Checklist resumido

```
[ ] Código no GitHub
[ ] Projeto em branco no Lovable + conectado ao GitHub
[ ] Código copiado (sem .env do Cloud)
[ ] Supabase próprio criado e conectado
[ ] Migrations rodadas (tabelas criadas)
[ ] Edge functions deployadas
[ ] Secrets configuradas
[ ] Dados exportados do antigo
[ ] Usuários criados com mesmos UUIDs
[ ] CSVs importados nas tabelas
[ ] Auth URL configurada
[ ] Storage migrado
[ ] Testes passando
```

---

## Dicas importantes

1. **Não apague o projeto antigo** até confirmar que tudo funciona no novo
2. **Anote todas as API keys** antes de migrar — o Lovable Cloud não expõe depois
3. **Migrations com INSERT de dados** do Cloud vão falhar — remova ou ignore
4. **Tabelas criadas diretamente no Lovable** (sem migration) precisam ser criadas manualmente
5. **O Lovable do projeto novo** pode ajudar a rodar migrations e deployar functions
6. **Teste com um usuário real** antes de considerar a migração completa
