import { useEffect, useRef, useState } from "react";
import { Celular, Notebook } from "./Devices";
import { GradeDePerfil, PostLinkedIn, CalendarioDoMes } from "./Telas";
import { CUSTOS, PACOTES, CREDITOS_DE_BOAS_VINDAS, postsPorPacote, carrosseisPorPacote } from "@/lib/precos";

/**
 * Landing "História" — a página conta o produto na ordem das perguntas que o visitante faz.
 * Plano completo em docs/arquitetura/landing-historia.md.
 *
 * A DECISÃO CENTRAL: o produto aparece DENTRO do habitat dele. O TrendPulse fabrica post de rede
 * social; mostrar as peças como quadrados soltos numa página branca é mostrar o produto
 * descontextualizado — e era o que fazia as versões anteriores parecerem genéricas. Um JPG numa
 * página diz "olha uma imagem"; o mesmo JPG numa grade de perfil, dentro de um celular, diz "é isto
 * que o seu paciente vai ver".
 *
 * ZERO MÉTRICA INVENTADA em qualquer seção. É por isso que o herói usa grade de perfil (que não tem
 * contador) e não feed (que teria).
 */

interface Props {
  onSignup: () => void;
  onLogin: () => void;
}

/** As quatro identidades, geradas na plataforma com o MESMO texto e briefings diferentes. */
const MARCAS = [
  {
    id: "clinica", nicho: "Saúde", marca: "Clínica Vida", handle: "clinicavida",
    autor: "Dra. Helena Vidal", cargo: "Cardiologista · Clínica Vida",
    accent: "#1B6CA8",
    grade: ["exemplo_sinais_coracao", "exemplo_hipertensao", "exemplo_colesterol", "exemplo_prevencao",
            "exemplo_diabetes", "exemplo_nutricao_coracao", "exemplo_exercicios", "exemplo_obesidade", "exemplo_envelhecer"],
    legenda: "Muita gente descobre tarde. Estes são os sinais que o corpo dá antes — e que a correria faz a gente ignorar.",
  },
  {
    id: "coach", nicho: "Coaching", marca: "Método Ferreira", handle: "metodoferreira",
    autor: "Rafael Ferreira", cargo: "Mentor de carreira",
    accent: "#C98A06",
    grade: ["estilo_dark_editorial", "estilo_citacao_serif", "exemplo_produtividade", "exemplo_saude_mental",
            "estilo_infografico", "exemplo_ansiedade", "exemplo_sono", "estilo_dark_editorial", "estilo_citacao_serif"],
    legenda: "Disciplina não é acordar às 5h. É escolher o que você quer mais em vez do que quer agora.",
  },
  {
    id: "nutricao", nicho: "Nutrição", marca: "Raiz Nutrição", handle: "raiznutricao",
    autor: "Marina Raiz", cargo: "Nutricionista clínica",
    accent: "#6E8767",
    grade: ["exemplo_alimentacao_saudavel", "exemplo_nutricao_coracao", "exemplo_inflamacao", "exemplo_obesidade",
            "exemplo_colesterol", "exemplo_diabetes", "estilo_citacao_serif", "exemplo_prevencao", "exemplo_sono"],
    legenda: "O que você adia hoje cobra caro depois. Comece pelo prato — é o ajuste que dá resultado mais rápido.",
  },
  {
    id: "advocacia", nicho: "Advocacia", marca: "Duarte Advocacia", handle: "duarteadv",
    autor: "Camila Duarte", cargo: "Advogada trabalhista",
    accent: "#A8853F",
    grade: ["estilo_citacao_serif", "estilo_dark_editorial", "estilo_infografico", "exemplo_produtividade",
            "estilo_citacao_serif", "estilo_dark_editorial", "exemplo_saude_mental", "estilo_infografico", "exemplo_prevencao"],
    legenda: "Prazo perdido não volta. Estes são os três que mais tiram direito de quem tinha razão.",
  },
] as const;

const url = (nome: string) => `/showcase/gerados/${nome}.jpg`;

/** Texto REAL do style_guide de uma marca de verdade — não é exemplo escrito à mão. */
const O_QUE_A_IA_ENTENDEU = {
  padrao: "Fundo branco predominante com ampla área de respiro.",
  faz: "Focar em fluxos operacionais, diagramas corporativos e arquitetura empresarial.",
  naoFaz: "Não utilizar imagens genéricas de pessoas.",
};

export default function HistoriaLanding({ onSignup, onLogin }: Props) {
  const [i, setI] = useState(0);
  const m = MARCAS[i];
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const alvos = [...el.querySelectorAll<HTMLElement>("[data-rv]")];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      alvos.forEach((a) => { a.style.opacity = "1"; a.style.transform = "none"; });
      return;
    }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const t = e.target as HTMLElement;
      t.style.transitionDelay = `${t.dataset.d || 0}ms`;
      t.style.opacity = "1"; t.style.transform = "none";
      io.unobserve(t);
    }), { rootMargin: "0px 0px -6% 0px" });
    alvos.forEach((a) => io.observe(a));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={raiz} className="hl" style={{ ["--ac" as string]: m.accent }}>
      <style>{CSS}</style>

      <header className="topo">
        <div className="topo-in">
          <span className="wm">TrendPulse</span>
          <div className="topo-a">
            <button className="btxt" onClick={onLogin}>Entrar</button>
            <button className="bt" onClick={onSignup}>Criar conta</button>
          </div>
        </div>
      </header>

      {/* ══ 1. Vai ficar bom? ══════════════════════════════════════════════ */}
      <section className="heroi">
        <div className="heroi-texto">
          <p className="olho" data-rv>Uma ideia · quatro marcas</p>
          <h1 data-rv data-d="60">
            Seu feed<br />cheio.<br /><em>Sem você.</em>
          </h1>
          <p className="lede" data-rv data-d="120">
            Você escreve a ideia em português normal. A IA entrega o post pronto com a sua
            identidade e publica em nove redes. Troque a marca aqui do lado: é o mesmo produto.
          </p>

          <div className="chips" data-rv data-d="180" role="tablist" aria-label="Escolher marca">
            {MARCAS.map((x, k) => (
              <button key={x.id} role="tab" aria-selected={k === i}
                className={`chip ${k === i ? "on" : ""}`}
                style={{ ["--c" as string]: x.accent }}
                onClick={() => setI(k)}>
                {x.nicho}
              </button>
            ))}
          </div>

          <div className="cta-bloco" data-rv data-d="240">
            <button className="bt g" onClick={onSignup}>
              Criar minha marca — {CREDITOS_DE_BOAS_VINDAS} créditos grátis
            </button>
            <span className="nota">Sem cartão. Dá {Math.floor(CREDITOS_DE_BOAS_VINDAS / CUSTOS[0].credits)} posts pra testar.</span>
          </div>
        </div>

        {/* O celular OCLUI o headline de propósito: é o que tira a página do
            "tudo dentro da própria caixa" e dá profundidade. */}
        <div className="heroi-device" data-rv data-d="80">
          <Celular largura={296}>
            <GradeDePerfil pecas={m.grade.map(url)} handle={m.handle} accent={m.accent} />
          </Celular>
          <span className="etiqueta">{m.marca}</span>
        </div>
      </section>

      {/* ══ 2. Vai ter a minha cara? ═══════════════════════════════════════ */}
      <section className="bl">
        <div className="bl-in">
          <p className="olho" data-rv>A cópia da marca</p>
          <h2 data-rv>Ela aprende a sua cara antes de desenhar</h2>
          <p className="sub" data-rv>
            Você sobe o que já publicou. A IA lê e escreve, com palavras, o que entendeu — e é esse
            texto que entra em toda geração daí em diante.
          </p>

          <div className="tres" data-rv data-d="60">
            <div className="passo">
              <span className="n">1</span>
              <h3>Você sobe referências</h3>
              <div className="refs">
                {m.grade.slice(0, 4).map((n) => <img key={n} src={url(n)} alt="" loading="lazy" />)}
              </div>
            </div>

            <div className="passo">
              <span className="n">2</span>
              <h3>A IA descreve o que viu</h3>
              {/* Texto REAL de um style_guide gravado no banco. */}
              <div className="guia">
                <p className="g-l">Estilo identificado</p>
                <p className="g-t">{O_QUE_A_IA_ENTENDEU.padrao}</p>
                <p className="g-l ok">Sempre faz</p>
                <p className="g-t">{O_QUE_A_IA_ENTENDEU.faz}</p>
                <p className="g-l no">Nunca faz</p>
                <p className="g-t">{O_QUE_A_IA_ENTENDEU.naoFaz}</p>
              </div>
            </div>

            <div className="passo">
              <span className="n">3</span>
              <h3>Toda peça sai assim</h3>
              <img className="saida" src={url(m.grade[0])} alt="Peça gerada com a identidade da marca" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      {/* ══ 3. E onde eu publico? ══════════════════════════════════════════ */}
      <section className="bl escuro">
        <div className="bl-in">
          <p className="olho claro" data-rv>Uma peça, nove redes</p>
          <h2 className="claro" data-rv>O mesmo conteúdo, no tom de cada rede</h2>
          <p className="sub claro" data-rv>
            A legenda muda sozinha: no LinkedIn ela fica mais longa e profissional, no Instagram
            mais direta. Você aprova e publica de dentro do TrendPulse.
          </p>
          <div className="redes" data-rv data-d="60">
            <Notebook largura={660}>
              <PostLinkedIn peca={url(m.grade[0])} autor={m.autor} cargo={m.cargo} legenda={m.legenda} accent={m.accent} />
            </Notebook>
            <div className="redes-cel">
              <Celular largura={186} sombra={false}>
                <GradeDePerfil pecas={m.grade.map(url)} handle={m.handle} accent={m.accent} />
              </Celular>
            </div>
          </div>
        </div>
      </section>

      {/* ══ 4. E a constância? ═════════════════════════════════════════════ */}
      <section className="bl">
        <div className="bl-in">
          <p className="olho" data-rv>O calendário</p>
          <h2 data-rv>Uma hora na segunda. O mês inteiro resolvido.</h2>
          <p className="sub" data-rv>
            Você gera em lote, arrasta pro dia e escolhe a hora. Depois disso o TrendPulse publica
            sozinho — inclusive quando você está em consulta.
          </p>
          <div className="cal" data-rv data-d="60">
            <Notebook largura={720}>
              <CalendarioDoMes pecas={m.grade.map(url)} accent={m.accent} />
            </Notebook>
          </div>
        </div>
      </section>

      {/* ══ 5. Quanto custa? ═══════════════════════════════════════════════ */}
      <section className="bl">
        <div className="bl-in">
          <p className="olho" data-rv>Preço</p>
          <h2 data-rv>Você paga o que usar</h2>
          <p className="sub" data-rv>Créditos pré-pagos, sem mensalidade e sem pacote parado.</p>

          <div className="custos" data-rv>
            {CUSTOS.slice(0, 5).map((c) => (
              <div key={c.action} className="custo">
                <div className="custo-top">
                  <h3>{c.label}</h3>
                  <span className="cr">{c.credits}<small>cr</small></span>
                </div>
                <p>{c.detalhe}</p>
              </div>
            ))}
          </div>

          <div className="pacotes" data-rv data-d="60">
            {PACOTES.map((p) => (
              <div key={p.nome} className={`pac ${p.destaque ? "dest" : ""}`}>
                {p.destaque && <span className="tag">Mais escolhido</span>}
                <h3>{p.nome}</h3>
                <div className="preco">R${p.precoReais}</div>
                <div className="cred">
                  {p.creditos.toLocaleString("pt-BR")} créditos
                  {p.bonus && <span className="bon"> · {p.bonus}</span>}
                </div>
                <ul>
                  <li>≈ {postsPorPacote(p)} posts com imagem</li>
                  <li>ou ≈ {carrosseisPorPacote(p)} carrosséis de 5 slides</li>
                  <li>Todos os formatos liberados</li>
                </ul>
                <button className={`bt ${p.destaque ? "" : "vaz"}`} onClick={onSignup}>Começar</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Fecho ══════════════════════════════════════════════════════════ */}
      <section className="fecho">
        <h2 data-rv>Você já sabe o que dizer.</h2>
        <p data-rv data-d="60">O TrendPulse cuida de dizer todo dia.</p>
        <button className="bt g" onClick={onSignup} data-rv data-d="120">
          Começar com {CREDITOS_DE_BOAS_VINDAS} créditos grátis
        </button>
      </section>

      <footer className="rodape">
        <span>TrendPulse</span>
        <nav>
          <a href="/pricing">Preços</a>
          <a href="/privacy">Privacidade</a>
          <button className="btxt" onClick={onLogin}>Entrar</button>
        </nav>
      </footer>
    </div>
  );
}

const CSS = `
/* PALETA DO TRENDPULSE, nao inventada: os mesmos valores de src/index.css e da landing atual.
   --marca #0059B3 e o --primary do app; --teal #1DAFA3 e o --accent; a tinta e o papel sao os
   mesmos #14253A / #F7F9FB.

   SEPARACAO QUE IMPORTA: --marca e a voz da PAGINA (botao, link, olho de secao, numero, headline).
   --ac e a cor da MARCA DEMONSTRADA, e so pode aparecer DENTRO do aparelho e na etiqueta dele.
   Na primeira versao eu deixei --ac reger a pagina inteira: trocar pra "Clinica Vida" pintava a
   landing de azul-clinico e o TrendPulse sumia da propria pagina. */
.hl{
  --papel:#F7F9FB; --papel2:#EDF1F6; --tinta:#14253A; --t2:#44546B; --t3:#79879C;
  --linha:#DDE3EA; --escuro:#14253A;
  --marca:#0059B3; --teal:#1DAFA3;
  --ac:#0059B3;
  background:var(--papel); color:var(--tinta);
  font-family:Inter,system-ui,sans-serif; min-height:100vh; overflow-x:hidden;
}
.hl *{box-sizing:border-box}
.hl [data-rv]{opacity:0;transform:translateY(24px);transition:opacity .75s cubic-bezier(.16,1,.3,1),transform .75s cubic-bezier(.16,1,.3,1)}
@media (prefers-reduced-motion:reduce){
  .hl [data-rv]{opacity:1!important;transform:none!important;transition:none!important}
  .hl *{animation:none!important}
}
.hl :focus-visible{outline:2px solid var(--marca);outline-offset:3px;border-radius:4px}

.hl .topo{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--papel) 90%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--linha)}
.hl .topo-in{max-width:1200px;margin:0 auto;padding:13px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.hl .wm{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-weight:800;font-size:19px;letter-spacing:-.028em}
.hl .topo-a{display:flex;align-items:center;gap:4px}

.hl .bt{font:inherit;font-weight:600;font-size:14px;cursor:pointer;background:var(--tinta);color:var(--papel);border:none;padding:13px 19px;border-radius:8px;min-height:44px;transition:background .25s cubic-bezier(.16,1,.3,1),transform .25s cubic-bezier(.16,1,.3,1)}
.hl .bt:hover{background:var(--marca);transform:translateY(-1px)}
.hl .bt.g{font-size:16px;padding:17px 30px}
.hl .bt.vaz{background:transparent;color:var(--tinta);border:1px solid var(--linha)}
.hl .bt.vaz:hover{background:var(--tinta);color:var(--papel)}
.hl .btxt{font:inherit;font-weight:600;font-size:14px;cursor:pointer;background:none;border:none;color:var(--t2);padding:13px 14px;min-height:44px;transition:color .2s}
.hl .btxt:hover{color:var(--tinta)}

.hl .olho{font-size:11.5px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--marca);margin:0 0 18px}
.hl .olho.claro{color:var(--teal)}
.hl h1{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:clamp(52px,8.5vw,116px);line-height:.92;letter-spacing:-.05em;font-weight:800;margin:0 0 28px;text-wrap:balance}
.hl h1 em{font-style:normal;color:var(--marca)}
.hl h2{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:clamp(28px,3.6vw,42px);letter-spacing:-.032em;font-weight:800;margin:0 0 14px;text-wrap:balance}
.hl h2.claro,.hl .sub.claro{color:#F2F0EC}
.hl .lede{font-size:18px;line-height:1.55;color:var(--t2);max-width:44ch;margin:0 0 30px}
.hl .sub{font-size:16.5px;line-height:1.55;color:var(--t2);max-width:58ch;margin:0 0 44px}
.hl .sub.claro{color:#B6BCC6}

/* ── Herói: grid com o device INVADINDO a coluna do texto ── */
.hl .heroi{max-width:1200px;margin:0 auto;padding:76px 28px 92px;display:grid;grid-template-columns:1.15fr .85fr;gap:0;align-items:center;position:relative}
.hl .heroi-texto{position:relative;z-index:2;grid-column:1}
.hl .heroi-device{grid-column:2;grid-row:1;justify-self:center;position:relative;z-index:1;margin-left:-64px}
.hl .etiqueta{display:block;text-align:center;margin-top:14px;font-size:12px;font-weight:600;color:var(--ac);transition:color .4s cubic-bezier(.16,1,.3,1)}
.hl .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:34px}
.hl .chip{font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;background:transparent;color:var(--t2);border:1px solid var(--linha);border-radius:999px;padding:11px 18px;min-height:44px;transition:border-color .25s,color .25s,background .25s}
.hl .chip:hover{border-color:var(--c);color:var(--tinta)}
.hl .chip.on{background:var(--c);border-color:var(--c);color:#fff}
.hl .cta-bloco{display:flex;flex-direction:column;align-items:flex-start;gap:11px}
.hl .nota{font-size:13px;color:var(--t3)}

/* ── Blocos ── */
.hl .bl{border-top:1px solid var(--linha)}
.hl .bl-in{max-width:1200px;margin:0 auto;padding:82px 28px}
.hl .bl.escuro{background:var(--escuro);border-top:none}

.hl .tres{display:grid;grid-template-columns:repeat(3,1fr);gap:36px}
.hl .passo .n{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--marca);color:#fff;font-size:12px;font-weight:700;margin-bottom:14px}
.hl .passo h3{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:17px;font-weight:700;letter-spacing:-.02em;margin:0 0 16px}
.hl .refs{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.hl .refs img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:7px;border:1px solid var(--linha);filter:grayscale(.35) opacity(.75)}
.hl .guia{background:#fff;border:1px solid var(--linha);border-radius:11px;padding:15px 16px}
.hl .g-l{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin:0 0 4px}
.hl .g-l.ok{color:#1E8A63;margin-top:13px}
.hl .g-l.no{color:#B0473C;margin-top:13px}
.hl .g-t{font-size:13px;line-height:1.45;color:var(--tinta);margin:0}
.hl .saida{width:100%;aspect-ratio:1;object-fit:cover;border-radius:11px;border:1px solid var(--linha);box-shadow:0 14px 32px -16px rgba(20,23,28,.4)}

.hl .redes{display:flex;align-items:flex-end;gap:0;justify-content:center;flex-wrap:wrap}
.hl .redes-cel{margin-left:-52px;margin-bottom:-26px;position:relative;z-index:2}

.hl .cal{display:flex;justify-content:center}

.hl .custos{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--linha);border:1px solid var(--linha);border-radius:12px;overflow:hidden;margin-bottom:44px}
.hl .custo{background:var(--papel);padding:20px 18px}
.hl .custo-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:7px}
.hl .custo h3{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:14.5px;font-weight:700;margin:0;letter-spacing:-.015em}
.hl .cr{font-size:23px;font-weight:800;color:var(--marca);font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.hl .cr small{font-size:11px;font-weight:600;margin-left:1px}
.hl .custo p{font-size:12.5px;color:var(--t2);margin:0;line-height:1.45}

.hl .pacotes{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.hl .pac{background:#fff;border:1px solid var(--linha);border-radius:14px;padding:26px 24px;position:relative;display:flex;flex-direction:column}
.hl .pac.dest{border-color:var(--marca);box-shadow:0 0 0 1px var(--marca)}
.hl .tag{position:absolute;top:-10px;left:24px;background:var(--marca);color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:4px 10px;border-radius:999px}
.hl .pac h3{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:16px;font-weight:700;margin:0 0 8px}
.hl .preco{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:38px;font-weight:800;letter-spacing:-.04em;line-height:1}
.hl .cred{font-size:13px;color:var(--t2);margin:6px 0 16px}
.hl .bon{color:var(--marca);font-weight:600}
.hl .pac ul{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:7px;flex:1}
.hl .pac li{font-size:13.5px;color:var(--t2);padding-left:16px;position:relative}
.hl .pac li::before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:var(--teal)}

.hl .fecho{border-top:1px solid var(--linha);max-width:1200px;margin:0 auto;padding:96px 28px 104px;text-align:center}
.hl .fecho h2{margin-bottom:8px}
.hl .fecho p{font-size:19px;color:var(--t2);margin:0 0 32px}

.hl .rodape{border-top:1px solid var(--linha);max-width:1200px;margin:0 auto;padding:24px 28px 40px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:14px;color:var(--t3)}
.hl .rodape nav{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
.hl .rodape a{color:var(--t2);text-decoration:none;padding:12px;min-height:44px;display:inline-flex;align-items:center}
.hl .rodape a:hover{color:var(--tinta)}

@media (max-width:1080px){
  .hl .custos{grid-template-columns:repeat(2,1fr)}
  .hl .redes-cel{margin-left:-38px}
}
@media (max-width:900px){
  .hl .heroi{grid-template-columns:1fr;gap:44px;padding-top:56px}
  .hl .heroi-device{grid-column:1;grid-row:2;margin-left:0}
  .hl .tres{grid-template-columns:1fr;gap:32px}
  .hl .pacotes{grid-template-columns:1fr}
  .hl .redes{flex-direction:column;align-items:center;gap:24px}
  .hl .redes-cel{margin:0;transform:none}
}
@media (max-width:640px){
  .hl .bl-in{padding:60px 22px}
  .hl .heroi{padding-left:22px;padding-right:22px}
  .hl .custos{grid-template-columns:1fr}
  .hl .bt.g{width:100%}
  /* Notebook em viewport estreito vira a tela pura: a moldura roubaria os pixels que
     interessam e ainda faria overflow. */
  .hl .redes>div:first-child,.hl .cal>div{width:100%!important}
}
`;
