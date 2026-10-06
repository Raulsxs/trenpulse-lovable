/**
 * SMOKE TESTS — núcleo do servidor MCP.
 *
 * Duas instabilidades medidas em produção em 2026-09-13 motivam estes testes:
 *  - `gerar_post` levou 75,8 s pelo MCP; Codex e Claude Desktop cortam em ~60 s. A geração era
 *    cobrada e o agente recebia timeout. Resposta: ferramentas lentas viram job na fila.
 *  - Cada chamada abria um login novo (8 sessões em 15 s). Resposta: sessão reutilizada, com
 *    validade checada por `sessaoAindaValida`.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import {
  FERRAMENTAS_LENTAS, TOOL_ACOMPANHAR, promptDoJob, colunasDoJob, tituloDoJob,
  sessaoAindaValida, textoDoJob, toolsVisiveis,
  TOOL_PREPARAR_ENVIO, extensaoImagem, mimeDaExtensao, caminhoEnvio,
  LINK_MCP, ESCOPOS_OAUTH, urlDoRecurso, urlMetadados, metadadosDoRecurso, cabecalhoWwwAuthenticate,
  FERRAMENTAS_IMEDIATAS, TOOL_LISTAR_MARCAS, textoDasMarcas,
} from "../../supabase/functions/_shared/mcp-core";

const CATALOGO = {
  consultar_saldo: { escopo: "read" },
  gerar_post: { escopo: "generate" },
  gerar_carrossel: { escopo: "generate" },
  agendar_arte: { escopo: "schedule" },
};
const TOOLS = [
  { name: "consultar_saldo", description: "saldo", input_schema: { type: "object" } },
  { name: "gerar_post", description: "cria post", input_schema: { type: "object" } },
  { name: "gerar_carrossel", description: "cria carrossel", input_schema: { type: "object" } },
  { name: "agendar_arte", description: "agenda", input_schema: { type: "object" } },
  { name: "editar_slide", description: "fora do catálogo", input_schema: { type: "object" } },
];

describe("FERRAMENTAS_LENTAS", () => {
  it("todas as que geram imagem vão para a fila", () => {
    for (const t of ["gerar_post", "gerar_carrossel", "gerar_story", "gerar_tweet_card", "link_para_post"]) {
      expect(FERRAMENTAS_LENTAS.has(t), t).toBe(true);
    }
  });
  it("leitura, agendamento e reescrita de texto seguem síncronos — responder na hora é o que o agente precisa", () => {
    for (const t of ["consultar_saldo", "listar_conexoes", "agendar_arte", "agendar_conteudo", "adaptar_para_rede", "planejar_calendario"]) {
      expect(FERRAMENTAS_LENTAS.has(t), t).toBe(false);
    }
  });
});

describe("toolsVisiveis", () => {
  it("só mostra o que o escopo permite, e nunca o que está fora do catálogo", () => {
    const nomes = toolsVisiveis(TOOLS, CATALOGO, ["read"]).map((t) => t.name);
    // listar_marcas acompanha o escopo de leitura: sem o id da marca, nada do que é gerado sai com identidade.
    expect(nomes).toEqual(["consultar_saldo", "listar_marcas"]);
    expect(nomes).not.toContain("editar_slide");
  });

  it("quem pode gerar ganha acompanhar_geracao — senão receberia um job_id sem ter como usar", () => {
    const nomes = toolsVisiveis(TOOLS, CATALOGO, ["generate"]).map((t) => t.name);
    expect(nomes).toContain("acompanhar_geracao");
    expect(toolsVisiveis(TOOLS, CATALOGO, ["read", "schedule"]).map((t) => t.name)).not.toContain("acompanhar_geracao");
  });

  it("a descrição das lentas avisa ANTES da chamada que a resposta é um job", () => {
    const post = toolsVisiveis(TOOLS, CATALOGO, ["generate"]).find((t) => t.name === "gerar_post")!;
    expect(post.description).toMatch(/job_id/);
    expect(post.description).toMatch(/acompanhar_geracao/);
    const saldo = toolsVisiveis(TOOLS, CATALOGO, ["read"]).find((t) => t.name === "consultar_saldo")!;
    expect(saldo.description).toBe("saldo");
  });

  it("usa inputSchema (formato MCP), não input_schema", () => {
    const [t] = toolsVisiveis(TOOLS, CATALOGO, ["read"]);
    expect(t).toHaveProperty("inputSchema");
    expect(t).not.toHaveProperty("input_schema");
    expect(TOOL_ACOMPANHAR.inputSchema.required).toEqual(["job_id"]);
  });
});

describe("promptDoJob / colunasDoJob", () => {
  it("é uma ordem explícita com os argumentos, e proíbe perguntas", () => {
    const p = promptDoJob("gerar_post", { tema: "sono e produtividade", plataforma: "instagram" });
    expect(p).toContain("gerar_post");
    expect(p).toContain('"tema":"sono e produtividade"');
    expect(p).toMatch(/Não faça perguntas/);
  });

  it("marca e modelo NÃO vão no texto — vão como coluna, para o agente não tratar como sugestão", () => {
    const p = promptDoJob("gerar_post", { tema: "x", brandId: "0b1c2d3e-0000-4000-8000-000000000000", modelo: "nano-banana" });
    expect(p).not.toContain("brandId");
    expect(p).not.toContain("nano-banana");
  });

  it("limita o tamanho dos argumentos", () => {
    expect(promptDoJob("gerar_post", { tema: "a".repeat(10_000) }).length).toBeLessThan(2400);
  });

  it("só aceita brand_id com forma de uuid e modelo curto", () => {
    expect(colunasDoJob({ brandId: "0b1c2d3e-0000-4000-8000-000000000000", modelo: "gpt-image-2" }))
      .toEqual({ brand_id: "0b1c2d3e-0000-4000-8000-000000000000", model: "gpt-image-2" });
    expect(colunasDoJob({ brandId: "'; drop table x", modelo: "m".repeat(80) })).toEqual({ brand_id: null, model: null });
    expect(colunasDoJob({})).toEqual({ brand_id: null, model: null });
  });

  it("título cabe na fila do app", () => {
    expect(tituloDoJob("gerar_carrossel", { tema: "t".repeat(200) }).length).toBeLessThanOrEqual(58);
    expect(tituloDoJob("link_para_post", { url: "https://x.com/a" })).toBe("link para post: https://x.com/a");
  });
});

describe("sessaoAindaValida", () => {
  const agora = Date.parse("2026-09-13T12:00:00Z");
  it("vale com folga maior que a margem de 5 min", () => {
    expect(sessaoAindaValida("2026-09-13T12:30:00Z", agora)).toBe(true);
  });
  it("renova ANTES de expirar — uma geração de 2 min não pode começar com JWT a 4 min do fim", () => {
    expect(sessaoAindaValida("2026-09-13T12:04:00Z", agora)).toBe(false);
  });
  it("expirada, vazia ou lixo contam como inválida", () => {
    expect(sessaoAindaValida("2026-09-13T11:00:00Z", agora)).toBe(false);
    expect(sessaoAindaValida(null, agora)).toBe(false);
    expect(sessaoAindaValida("", agora)).toBe(false);
    expect(sessaoAindaValida("não é data", agora)).toBe(false);
  });
  it("aceita epoch em ms", () => {
    expect(sessaoAindaValida(agora + 3600_000, agora)).toBe(true);
  });
});

describe("textoDoJob", () => {
  const base = { id: "j1", content_id: null, error: null };
  it("em andamento, manda esperar e NÃO gerar de novo — era o que causava cobrança dobrada", () => {
    const t = textoDoJob({ ...base, status: "processing" });
    expect(t.ok).toBe(true);
    expect(t.texto).toMatch(/não peça a peça outra vez/);
  });
  it("pronto, devolve o content_id e o próximo passo", () => {
    const t = textoDoJob({ ...base, status: "done", content_id: "c9" });
    expect(t.texto).toContain("content_id=c9");
    expect(t.texto).toMatch(/agendar_conteudo/);
  });
  it("done sem content_id é falha, não sucesso", () => {
    expect(textoDoJob({ ...base, status: "done" }).ok).toBe(false);
  });
  it("falha repassa o motivo", () => {
    const t = textoDoJob({ ...base, status: "failed", error: "Saldo insuficiente" });
    expect(t.ok).toBe(false);
    expect(t.texto).toContain("Saldo insuficiente");
  });
  it("job inexistente não vaza se é de outra conta — só diz que não achou", () => {
    expect(textoDoJob(null).texto).toMatch(/só é visível para a conta que criou/);
  });
});

describe("preparar_envio_imagem — arte do computador para o calendário", () => {
  const USER = "1294d060-6783-4f7a-9df4-3c5f567eded4";

  it("aparece para quem pode agendar, e só para quem pode agendar", () => {
    expect(toolsVisiveis(TOOLS, CATALOGO, ["schedule"]).map((t) => t.name)).toContain("preparar_envio_imagem");
    expect(toolsVisiveis(TOOLS, CATALOGO, ["read", "generate"]).map((t) => t.name)).not.toContain("preparar_envio_imagem");
  });

  it("a descrição manda NÃO usar base64 — era o caminho que não cabia numa chamada", () => {
    expect(TOOL_PREPARAR_ENVIO.description).toMatch(/base64/);
    expect(TOOL_PREPARAR_ENVIO.description).toMatch(/agendar_arte/);
  });

  it("aceita só imagens, normalizando jpeg para jpg", () => {
    expect(extensaoImagem("arte.PNG")).toBe("png");
    expect(extensaoImagem("foto.jpeg")).toBe("jpg");
    expect(extensaoImagem("capa.webp")).toBe("webp");
    expect(extensaoImagem("roteiro.pdf")).toBeNull();
    expect(extensaoImagem("sem-extensao")).toBeNull();
    expect(extensaoImagem("script.png.exe")).toBeNull();
    expect(mimeDaExtensao("jpg")).toBe("image/jpeg");
  });

  it("o caminho é do servidor, dentro da pasta do usuário, e o agente não injeta nada nele", () => {
    const c = caminhoEnvio(USER, "png", 1789339311000, "ab/../../x");
    expect(c).toBe(`mcp/${USER}/envio-1789339311000-abx.png`);
    expect(c).not.toContain("..");
  });

  it("recusa userId que não é uuid — um caminho montado com lixo escaparia da pasta", () => {
    expect(() => caminhoEnvio("../outro", "png")).toThrow();
  });
});

describe("conexão por link — descoberta OAuth", () => {
  const SUPA = "https://qdmhqxpazffmaxleyzxs.supabase.co";

  it("pelo link da Trend, o recurso é o link — é o endereço que o usuário colou e o cliente compara", () => {
    expect(urlDoRecurso("trend", SUPA)).toBe(LINK_MCP);
    expect(LINK_MCP).toBe("https://www.trendpulse.com.br/mcp");
  });

  it("direto no Supabase (token antigo), o recurso é o endereço da função", () => {
    expect(urlDoRecurso(null, SUPA)).toBe(`${SUPA}/functions/v1/mcp`);
    expect(urlDoRecurso("qualquer-outra-coisa", SUPA)).toBe(`${SUPA}/functions/v1/mcp`);
  });

  it("metadados do link seguem a RFC 9728: .well-known na raiz, caminho do recurso depois", () => {
    expect(urlMetadados(LINK_MCP)).toBe("https://www.trendpulse.com.br/.well-known/oauth-protected-resource/mcp");
    expect(urlMetadados(`${SUPA}/functions/v1/mcp`)).toBe(`${SUPA}/functions/v1/mcp/.well-known/oauth-protected-resource`);
  });

  it("aponta o servidor de autorização para o Supabase Auth", () => {
    const m = metadadosDoRecurso(LINK_MCP, SUPA);
    expect(m.resource).toBe(LINK_MCP);
    expect(m.authorization_servers).toEqual([`${SUPA}/auth/v1`]);
  });

  it("o 401 carrega o endereço dos metadados — é o que faz o cliente abrir o login sozinho", () => {
    expect(cabecalhoWwwAuthenticate(LINK_MCP))
      .toBe('Bearer resource_metadata="https://www.trendpulse.com.br/.well-known/oauth-protected-resource/mcp"');
  });

  it("quem conecta por link agenda e gera, mas não publica na hora", () => {
    expect([...ESCOPOS_OAUTH].sort()).toEqual(["generate", "read", "schedule"]);
    expect(ESCOPOS_OAUTH).not.toContain("publish");
  });
});

describe("marcas pelo MCP — sem o id, tudo o que o agente gera sai sem identidade", () => {
  // Caso real (2026-10-04): o CRM de um cliente gerava pelo MCP e nenhuma ferramenta devolvia um brandId.
  const COM_MARCA = [
    { name: "gerar_post", description: "cria post", input_schema: { type: "object", properties: { tema: { type: "string" }, brandId: { type: "string" } } } },
    { name: "consultar_saldo", description: "saldo", input_schema: { type: "object", properties: {} } },
    { name: "agendar_arte", description: "agenda arte", input_schema: { type: "object", properties: { imagem: { type: "string" } } } },
  ];

  it("listar_marcas aparece para quem lê a conta, e só para quem lê", () => {
    expect(toolsVisiveis(TOOLS, CATALOGO, ["read"]).map((t) => t.name)).toContain("listar_marcas");
    expect(toolsVisiveis(TOOLS, CATALOGO, ["generate", "schedule"]).map((t) => t.name)).not.toContain("listar_marcas");
    expect(TOOL_LISTAR_MARCAS.description).toMatch(/ANTES de gerar/);
  });

  it("a dica de brandId só entra onde a ferramenta aceita brandId", () => {
    const vis = toolsVisiveis(COM_MARCA, CATALOGO, ["read", "generate", "schedule"]);
    expect(vis.find((t) => t.name === "gerar_post")!.description).toMatch(/passe brandId \(ids em listar_marcas\)/);
    expect(vis.find((t) => t.name === "agendar_arte")!.description).not.toMatch(/brandId/);
    expect(vis.find((t) => t.name === "consultar_saldo")!.description).toBe("saldo");
  });

  it("cada marca sai com nome, id e o modo em português", () => {
    const txt = textoDasMarcas([
      { id: "b1", name: "Heart surgery", creation_mode: "style_copy" },
      { id: "b2", name: "Fotos pessoais", creation_mode: "photo_backgrounds" },
      { id: "b3", name: null, creation_mode: "modo_novo" },
    ]);
    expect(txt).toContain("- Heart surgery → marca=b1 · copia o estilo dos exemplos");
    expect(txt).toContain("- Fotos pessoais → marca=b2 · fotos pessoais de fundo");
    expect(txt).toContain("- (sem nome) → marca=b3");
    expect(txt).toMatch(/PERGUNTE/);
  });

  it("sem marca cadastrada, diz que a peça sai sem identidade e onde criar", () => {
    expect(textoDasMarcas([])).toMatch(/Nenhuma marca cadastrada/);
  });
});

describe("agendar pelo MCP é imediato — a descrição não pode prometer confirmação que não existe", () => {
  // No app há uma tela de confirmação. Pelo MCP não: a descrição antiga dizia "sempre será confirmada
  // pelo usuário", o agente externo confiava e agendava sem perguntar.
  it("as três ferramentas que gravam no calendário avisam que a ação já vale", () => {
    expect([...FERRAMENTAS_IMEDIATAS].sort()).toEqual(["agendar_arte", "agendar_conteudo", "desagendar_conteudo"]);
    const arte = toolsVisiveis(TOOLS, CATALOGO, ["schedule"]).find((t) => t.name === "agendar_arte")!;
    expect(arte.description).toMatch(/AQUI A AÇÃO É IMEDIATA/);
    expect(arte.description).toMatch(/confirme com o usuário/);
  });

  it("ferramenta de leitura não ganha o aviso", () => {
    const saldo = toolsVisiveis(TOOLS, CATALOGO, ["read"]).find((t) => t.name === "consultar_saldo")!;
    expect(saldo.description).not.toMatch(/IMEDIATA/);
  });
});
