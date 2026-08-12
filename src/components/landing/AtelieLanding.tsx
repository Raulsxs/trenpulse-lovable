import { useEffect, useRef, useState } from "react";

/**
 * Landing "Ateliê" — direção nova, em avaliação na rota /landing-nova.
 *
 * A TESE: o diferencial do TrendPulse não é "IA que faz post" (todo concorrente promete isso e
 * ninguém prova). É que a MESMA ideia sai com a SUA identidade. Então o herói não descreve isso —
 * demonstra: uma frase só, quatro marcas, lado a lado. As quatro peças foram geradas na própria
 * plataforma, com o mesmo texto e briefings de marca diferentes.
 *
 * O RISCO ESTÉTICO ASSUMIDO: o acento da página inteira troca junto com a marca selecionada. A
 * página se re-veste enquanto o visitante lê sobre re-vestir conteúdo. É o argumento executado em
 * vez de narrado.
 *
 * DIFERENÇA DE ARQUITETURA pra landing atual: aquela é uma string HTML injetada via
 * dangerouslySetInnerHTML. Esta é React componível, com tokens CSS e dados separados da estrutura —
 * dá pra evoluir sem editar um blob de 600 linhas.
 */

interface Props {
  onSignup: () => void;
  onLogin: () => void;
}

/** As quatro identidades. `accent` é o que re-veste a página quando a marca é selecionada. */
const MARCAS = [
  { id: "clinica", nome: "Clínica Vida", nicho: "Saúde", accent: "#1B6CA8", tinta: "#0C2C47" },
  { id: "coach", nome: "Método Ferreira", nicho: "Coaching", accent: "#C98A06", tinta: "#1A1508" },
  { id: "nutricao", nome: "Raiz Nutrição", nicho: "Nutrição", accent: "#6E8767", tinta: "#232B21" },
  { id: "advocacia", nome: "Duarte Advocacia", nicho: "Advocacia", accent: "#A8853F", tinta: "#0E2038" },
] as const;

/** Custos REAIS, lidos de public.credit_pricing. Nada de número inventado em página de venda. */
const FORMATOS = [
  { nome: "Post", custo: 10, detalhe: "Imagem + legenda pronta" },
  { nome: "Carrossel", custo: 10, detalhe: "Por slide, com fio narrativo" },
  { nome: "Story", custo: 25, detalhe: "9:16, modelo premium" },
  { nome: "Tweet card", custo: 6, detalhe: "Print de tweet, em série" },
] as const;

const PASSOS = [
  { t: "Você escreve a ideia", d: "Em português normal. “Um post sobre por que adiar exame custa caro.” Sem prompt, sem briefing." },
  { t: "A IA veste a sua marca", d: "Paleta, tipografia, tom e as regras que você definiu. O que ela aprendeu das suas referências entra sozinho." },
  { t: "Você publica ou agenda", d: "Nove redes de dentro do TrendPulse. Ou baixa tudo em PNG, se preferir postar do celular." },
] as const;

const MURAL = [
  "estilo_dark_editorial", "exemplo_sinais_coracao", "estilo_citacao_serif", "exemplo_ansiedade",
  "estilo_infografico", "exemplo_sono", "exemplo_hipertensao", "exemplo_saude_mental",
  "exemplo_alimentacao_saudavel", "exemplo_prevencao", "exemplo_envelhecer", "exemplo_exercicios",
] as const;

export default function AtelieLanding({ onSignup, onLogin }: Props) {
  const [marcaAtiva, setMarcaAtiva] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const marca = MARCAS[marcaAtiva];

  // Reveal on scroll. Usa a curva-assinatura já documentada no tailwind.config (ease-out-expo),
  // e desliga inteiro em reduced motion — o conteúdo nunca depende de animação pra existir.
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const alvos = [...el.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      alvos.forEach((a) => { a.style.opacity = "1"; a.style.transform = "none"; });
      return;
    }
    const io = new IntersectionObserver(
      (entradas) => entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        const alvo = e.target as HTMLElement;
        alvo.style.transitionDelay = `${alvo.dataset.delay || 0}ms`;
        alvo.style.opacity = "1";
        alvo.style.transform = "none";
        io.unobserve(alvo);
      }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    alvos.forEach((a) => io.observe(a));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={raiz} className="atelie" style={{ ["--accent" as string]: marca.accent }}>
      <style>{CSS}</style>

      {/* ── Topo ───────────────────────────────────────────────────────────── */}
      <header className="topo">
        <div className="topo-in">
          <span className="wordmark">TrendPulse</span>
          <div className="topo-acoes">
            <button className="btn-texto" onClick={onLogin}>Entrar</button>
            <button className="btn" onClick={onSignup}>Criar conta</button>
          </div>
        </div>
      </header>

      {/* ── Herói: a tese demonstrada ──────────────────────────────────────── */}
      <section className="heroi">
        <div className="col">
          <p className="sobrancelha" data-reveal>Uma ideia · quatro marcas</p>
          <h1 data-reveal data-delay="60">
            A mesma frase.<br />
            <em>A sua cara.</em>
          </h1>
          <p className="lede" data-reveal data-delay="120">
            Abaixo, o mesmo texto gerado quatro vezes no TrendPulse — mudando só a marca.
            É isso que separa uma ferramenta de IA de uma identidade que se sustenta.
          </p>

          <div className="seletor" data-reveal data-delay="180" role="tablist" aria-label="Escolher marca">
            {MARCAS.map((m, i) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={i === marcaAtiva}
                className={`chip ${i === marcaAtiva ? "on" : ""}`}
                style={{ ["--chip" as string]: m.accent }}
                onClick={() => setMarcaAtiva(i)}
              >
                {m.nicho}
              </button>
            ))}
          </div>

          <div className="ctas" data-reveal data-delay="240">
            <button className="btn grande" onClick={onSignup}>Criar minha marca — 50 créditos grátis</button>
            <span className="nota">Sem cartão. 50 créditos dão 5 posts.</span>
          </div>
        </div>

        <div className="col pecas" data-reveal data-delay="80">
          {MARCAS.map((m, i) => (
            <figure key={m.id} className={`peca ${i === marcaAtiva ? "ativa" : ""}`}>
              <img
                src={`/showcase/marcas/${m.id}.jpg`}
                alt={`O mesmo texto gerado com a identidade da marca ${m.nome}`}
                loading={i === 0 ? "eager" : "lazy"}
                width={900}
                height={900}
              />
              <figcaption>
                <span className="pt" style={{ background: m.accent }} aria-hidden="true" />
                {m.nome}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Como funciona ──────────────────────────────────────────────────── */}
      <section className="bloco">
        <h2 data-reveal>Como sai um post</h2>
        {/* Numeração é honesta aqui: são três etapas em ordem, não decoração. */}
        <ol className="passos">
          {PASSOS.map((p, i) => (
            <li key={p.t} data-reveal data-delay={i * 80}>
              <span className="num">{i + 1}</span>
              <h3>{p.t}</h3>
              <p>{p.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Formatos, com custo real ───────────────────────────────────────── */}
      <section className="bloco">
        <h2 data-reveal>O que ela entrega</h2>
        <p className="sub" data-reveal>Você compra créditos e gasta no que usar. Sem mensalidade, sem pacote parado.</p>
        <div className="formatos">
          {FORMATOS.map((f, i) => (
            <div key={f.nome} className="formato" data-reveal data-delay={i * 60}>
              <div className="formato-topo">
                <h3>{f.nome}</h3>
                <span className="custo">{f.custo}<small>cr</small></span>
              </div>
              <p>{f.detalhe}</p>
            </div>
          ))}
        </div>
        <p className="rodape-bloco" data-reveal>
          R$50 = 500 créditos. Dá cerca de 50 posts, ou 10 carrosséis de 5 slides.
        </p>
      </section>

      {/* ── Mural: prova de volume e de variedade ──────────────────────────── */}
      <section className="bloco">
        <h2 data-reveal>Feito aqui dentro</h2>
        <p className="sub" data-reveal>Peças reais, geradas na plataforma. Estilos diferentes porque marcas são diferentes.</p>
        <div className="mural">
          {MURAL.map((nome, i) => (
            <img
              key={nome}
              src={`/showcase/gerados/${nome}.jpg`}
              alt="Peça gerada na plataforma"
              loading="lazy"
              width={1024}
              height={1024}
              data-reveal
              data-delay={(i % 4) * 60}
            />
          ))}
        </div>
      </section>

      {/* ── Fechamento ─────────────────────────────────────────────────────── */}
      <section className="fecho">
        <h2 data-reveal>Sua marca já tem o que dizer.</h2>
        <p data-reveal data-delay="60">Falta só ela dizer todo dia.</p>
        <button className="btn grande" onClick={onSignup} data-reveal data-delay="120">
          Começar com 50 créditos grátis
        </button>
      </section>

      <footer className="rodape">
        <span>TrendPulse</span>
        <nav>
          <a href="/pricing">Preços</a>
          <a href="/privacy">Privacidade</a>
          <button className="btn-texto" onClick={onLogin}>Entrar</button>
        </nav>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Estilos. Escopados em .atelie pra não vazar no resto do app.
   --accent é trocado pelo React conforme a marca selecionada: a página se re-veste
   enquanto o visitante lê sobre re-vestir conteúdo.
   ───────────────────────────────────────────────────────────────────────────── */
const CSS = `
.atelie {
  --papel: #F4F3F0;
  --papel-2: #EAE8E3;
  --tinta: #16181C;
  --tinta-2: #5A5E66;
  --tinta-3: #8E939B;
  --linha: #DAD7D1;
  --accent: #0059B3;

  background: var(--papel);
  color: var(--tinta);
  font-family: Inter, system-ui, sans-serif;
  min-height: 100vh;
  overflow-x: hidden;
  /* --accent NÃO transiciona aqui de propósito. Custom property sem @property registrado é
     interpolada de forma DISCRETA no Chromium (vira na metade da duração), e isso somava com os
     500ms de transição de cor dos consumidores: o acento chegava um passo atrasado, mostrando a
     cor da marca anterior. Quem anima é quem consome a variável; a variável em si troca na hora. */
}
.atelie * { box-sizing: border-box; }
.atelie [data-reveal] {
  opacity: 0; transform: translateY(22px);
  transition: opacity .7s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1);
}
@media (prefers-reduced-motion: reduce) {
  .atelie [data-reveal] { opacity: 1 !important; transform: none !important; transition: none !important; }
  .atelie * { animation: none !important; }
}
.atelie :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 3px; }

/* ── Topo ── */
.atelie .topo { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--papel) 88%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--linha); }
.atelie .topo-in { max-width: 1180px; margin: 0 auto; padding: 14px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.atelie .wordmark { font-family: 'Plus Jakarta Sans', Inter, sans-serif; font-weight: 800; font-size: 19px; letter-spacing: -.025em; }
.atelie .topo-acoes { display: flex; align-items: center; gap: 6px; }

.atelie .btn {
  font: inherit; font-weight: 600; font-size: 14px; cursor: pointer;
  background: var(--tinta); color: var(--papel); border: none;
  padding: 12px 18px; border-radius: 7px;
  transition: background .25s cubic-bezier(.16,1,.3,1), transform .25s cubic-bezier(.16,1,.3,1);
}
.atelie .btn:hover { background: var(--accent); transform: translateY(-1px); }
.atelie .btn.grande { font-size: 16px; padding: 17px 28px; }
.atelie .btn-texto {
  font: inherit; font-weight: 600; font-size: 14px; cursor: pointer;
  background: none; border: none; color: var(--tinta-2); padding: 12px 14px;
  transition: color .2s;
}
.atelie .btn-texto:hover { color: var(--tinta); }

/* ── Herói ── */
.atelie .heroi {
  max-width: 1180px; margin: 0 auto; padding: 84px 28px 96px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center;
}
.atelie .sobrancelha {
  font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
  color: var(--accent); margin: 0 0 20px; transition: color .5s cubic-bezier(.16,1,.3,1);
}
.atelie h1 {
  font-family: 'Plus Jakarta Sans', Inter, sans-serif;
  font-size: clamp(44px, 6vw, 76px); line-height: 1.02; letter-spacing: -.038em;
  font-weight: 800; margin: 0 0 26px; text-wrap: balance;
}
.atelie h1 em { font-style: normal; color: var(--accent); transition: color .5s cubic-bezier(.16,1,.3,1); }
.atelie .lede { font-size: 18px; line-height: 1.55; color: var(--tinta-2); max-width: 46ch; margin: 0 0 30px; }

.atelie .seletor { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 34px; }
.atelie .chip {
  font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
  background: transparent; color: var(--tinta-2);
  border: 1px solid var(--linha); border-radius: 999px; padding: 10px 17px;
  min-height: 44px;
  transition: border-color .25s, color .25s, background .25s;
}
.atelie .chip:hover { border-color: var(--chip); color: var(--tinta); }
.atelie .chip.on { background: var(--chip); border-color: var(--chip); color: #fff; }

.atelie .ctas { display: flex; flex-direction: column; align-items: flex-start; gap: 11px; }
.atelie .nota { font-size: 13px; color: var(--tinta-3); }

/* Pilha de peças: a ativa vem à frente e ganha escala. As outras ficam de prova. */
.atelie .pecas { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.atelie .peca { margin: 0; }
.atelie .peca img {
  width: 100%; aspect-ratio: 1; object-fit: cover; display: block;
  border-radius: 12px; border: 1px solid var(--linha);
  filter: saturate(.72); opacity: .5;
  transition: opacity .5s cubic-bezier(.16,1,.3,1), filter .5s cubic-bezier(.16,1,.3,1), transform .5s cubic-bezier(.16,1,.3,1), box-shadow .5s cubic-bezier(.16,1,.3,1);
}
.atelie .peca.ativa img {
  opacity: 1; filter: none; transform: scale(1.045);
  box-shadow: 0 18px 44px -18px rgba(20,24,30,.45);
}
.atelie .peca figcaption {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; font-weight: 600; color: var(--tinta-3); margin-top: 9px;
  transition: color .35s;
}
.atelie .peca.ativa figcaption { color: var(--tinta); }
.atelie .peca .pt { width: 8px; height: 8px; border-radius: 50%; flex: none; }

/* ── Blocos ── */
.atelie .bloco { max-width: 1180px; margin: 0 auto; padding: 76px 28px; border-top: 1px solid var(--linha); }
.atelie h2 {
  font-family: 'Plus Jakarta Sans', Inter, sans-serif;
  font-size: clamp(28px, 3.4vw, 40px); letter-spacing: -.028em; font-weight: 800;
  margin: 0 0 12px; text-wrap: balance;
}
.atelie .sub { font-size: 16.5px; color: var(--tinta-2); margin: 0 0 40px; max-width: 58ch; }
.atelie .rodape-bloco { font-size: 14.5px; color: var(--tinta-3); margin: 28px 0 0; }

.atelie .passos { list-style: none; margin: 34px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; }
.atelie .passos li { padding-top: 20px; border-top: 2px solid var(--accent); transition: border-color .5s cubic-bezier(.16,1,.3,1); }
.atelie .num { font-size: 12px; font-weight: 700; letter-spacing: .1em; color: var(--tinta-3); display: block; margin-bottom: 12px; font-variant-numeric: tabular-nums; }
.atelie .passos h3 { font-family: 'Plus Jakarta Sans', Inter, sans-serif; font-size: 19px; font-weight: 700; letter-spacing: -.015em; margin: 0 0 9px; }
.atelie .passos p { font-size: 15px; line-height: 1.6; color: var(--tinta-2); margin: 0; }

.atelie .formatos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--linha); border: 1px solid var(--linha); border-radius: 12px; overflow: hidden; }
.atelie .formato { background: var(--papel); padding: 24px 22px; }
.atelie .formato-topo { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.atelie .formato h3 { font-family: 'Plus Jakarta Sans', Inter, sans-serif; font-size: 17px; font-weight: 700; margin: 0; letter-spacing: -.015em; }
.atelie .custo { font-size: 26px; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; letter-spacing: -.03em; transition: color .5s cubic-bezier(.16,1,.3,1); }
.atelie .custo small { font-size: 12px; font-weight: 600; margin-left: 2px; }
.atelie .formato p { font-size: 14px; color: var(--tinta-2); margin: 0; line-height: 1.5; }

.atelie .mural { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.atelie .mural img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; border: 1px solid var(--linha); display: block; }

/* ── Fecho ── */
.atelie .fecho { max-width: 1180px; margin: 0 auto; padding: 96px 28px 104px; border-top: 1px solid var(--linha); text-align: center; }
.atelie .fecho h2 { margin-bottom: 8px; }
.atelie .fecho p { font-size: 19px; color: var(--tinta-2); margin: 0 0 32px; }

.atelie .rodape { border-top: 1px solid var(--linha); }
.atelie .rodape { max-width: 1180px; margin: 0 auto; padding: 26px 28px 40px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: 14px; color: var(--tinta-3); }
.atelie .rodape nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.atelie .rodape a { color: var(--tinta-2); text-decoration: none; padding: 12px 12px; min-height: 44px; display: inline-flex; align-items: center; }
.atelie .rodape a:hover { color: var(--tinta); }

/* ── Estreito ── */
@media (max-width: 960px) {
  .atelie .heroi { grid-template-columns: 1fr; gap: 44px; padding-top: 56px; padding-bottom: 64px; }
  .atelie .passos { grid-template-columns: 1fr; gap: 28px; }
  .atelie .formatos { grid-template-columns: repeat(2, 1fr); }
  .atelie .mural { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 560px) {
  .atelie .mural { grid-template-columns: repeat(2, 1fr); }
  .atelie .bloco { padding: 56px 22px; }
  .atelie .heroi { padding-left: 22px; padding-right: 22px; }
  .atelie .btn.grande { width: 100%; }
}
`;
