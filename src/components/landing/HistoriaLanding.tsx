import { useEffect, useRef, useState } from "react";
import { Celular, Notebook } from "./Devices";
import { GradeDePerfil, PostLinkedIn, PostInstagram, CalendarioDoMes } from "./Telas";
import { TweetCard } from "./TweetCard";
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

/**
 * CINCO PERFIS, um por tipo de cliente. Não é enfeite de variedade: o visitante precisa se
 * RECONHECER, e "médico, advogado, gestor" é literalmente o público que o Raul descreve.
 *
 * A GRADE DE CADA UM É DO NICHO DELE. Na primeira versão o perfil da advogada mostrava post de
 * cardiologia, e isso quebra a ilusão em meio segundo — destrói exatamente a prova que a seção
 * existe pra dar. As peças de advocacia e de gestão foram geradas na plataforma pra isso.
 *
 * `pasta` diz onde a peça mora: /gerados (as antigas, de saúde e genéricas) ou /nichos (as novas).
 */
type Perfil = {
  id: string; nicho: string; marca: string; handle: string; bio: string;
  autor: string; cargo: string; accent: string;
  grade: [string, "gerados" | "nichos"][];
  legenda: string;
};

const MARCAS: Perfil[] = [
  {
    id: "medico", nicho: "Médico", marca: "Clínica Vida", handle: "clinicavida",
    bio: "Cardiologia · Prevenção que cabe na sua rotina",
    autor: "Dra. Helena Vidal", cargo: "Cardiologista · Clínica Vida",
    accent: "#1B6CA8",
    grade: [["exemplo_sinais_coracao","gerados"],["exemplo_hipertensao","gerados"],["exemplo_colesterol","gerados"],
            ["exemplo_prevencao","gerados"],["exemplo_diabetes","gerados"],["exemplo_nutricao_coracao","gerados"],
            ["exemplo_exercicios","gerados"],["exemplo_obesidade","gerados"],["exemplo_envelhecer","gerados"]],
    legenda: "Muita gente descobre tarde. Estes são os sinais que o corpo dá antes — e que a correria faz a gente ignorar.",
  },
  {
    id: "advogada", nicho: "Advogado", marca: "Duarte Advocacia", handle: "duarteadv",
    bio: "Direito do trabalho · O que ninguém te contou sobre o seu contrato",
    autor: "Camila Duarte", cargo: "Advogada trabalhista · Duarte Advocacia",
    accent: "#A8853F",
    grade: [["adv_justa_causa","nichos"],["adv_hora_extra","nichos"],["adv_acordo","nichos"],
            ["adv_assedio","nichos"],["adv_justa_causa","nichos"],["adv_hora_extra","nichos"],
            ["adv_acordo","nichos"],["adv_assedio","nichos"],["adv_justa_causa","nichos"]],
    legenda: "Assinar no calor do momento custa caro. Três situações em que ainda dá para reverter — e o prazo de cada uma.",
  },
  {
    id: "gestor", nicho: "Gestor", marca: "Torres Gestão", handle: "torresgestao",
    bio: "Consultoria de gestão · Times que entregam sem apagar incêndio",
    autor: "Bruno Torres", cargo: "Consultor de gestão · Torres Gestão",
    accent: "#D2601A",
    grade: [["ges_equipe","nichos"],["ges_reuniao","nichos"],["ges_meta","nichos"],
            ["ges_contratar","nichos"],["ges_equipe","nichos"],["ges_reuniao","nichos"],
            ["ges_meta","nichos"],["ges_contratar","nichos"],["ges_equipe","nichos"]],
    legenda: "Quase toda equipe que parece desmotivada está, na verdade, confusa. Muda o diagnóstico, muda o remédio.",
  },
  {
    id: "coach", nicho: "Mentor", marca: "Método Ferreira", handle: "metodoferreira",
    bio: "Mentoria de carreira · Do travado ao próximo passo",
    autor: "Rafael Ferreira", cargo: "Mentor de carreira",
    accent: "#C98A06",
    grade: [["estilo_dark_editorial","gerados"],["estilo_citacao_serif","gerados"],["exemplo_produtividade","gerados"],
            ["exemplo_saude_mental","gerados"],["estilo_infografico","gerados"],["exemplo_ansiedade","gerados"],
            ["estilo_dark_editorial","gerados"],["estilo_citacao_serif","gerados"],["exemplo_sono","gerados"]],
    legenda: "Disciplina não é acordar às 5h. É escolher o que você quer mais em vez do que quer agora.",
  },
  {
    id: "nutri", nicho: "Nutricionista", marca: "Raiz Nutrição", handle: "raiznutricao",
    bio: "Nutrição clínica · Comida de verdade, sem terrorismo",
    autor: "Marina Raiz", cargo: "Nutricionista clínica",
    accent: "#6E8767",
    grade: [["exemplo_alimentacao_saudavel","gerados"],["exemplo_nutricao_coracao","gerados"],["exemplo_inflamacao","gerados"],
            ["exemplo_obesidade","gerados"],["exemplo_colesterol","gerados"],["exemplo_diabetes","gerados"],
            ["estilo_citacao_serif","gerados"],["exemplo_prevencao","gerados"],["exemplo_sono","gerados"]],
    legenda: "O que você adia hoje cobra caro depois. Comece pelo prato — é o ajuste que dá resultado mais rápido.",
  },
];

const url = ([nome, pasta]: [string, string]) => `/showcase/${pasta}/${nome}.jpg`;

/**
 * A marca do TrendPulse. NÃO é um símbolo novo: é o mesmo do app autenticado
 * (src/components/layout/Sidebar.tsx) — quadrado arredondado na cor primária com o glifo TrendingUp
 * do lucide. A página não tinha marca nenhuma além da palavra escrita, o que é estranho justo numa
 * landing que vende identidade visual. O path vem inline pra não puxar o pacote de ícones só por isto.
 */
const Marca = () => (
  <span className="marca-sim" aria-hidden="true">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  </span>
);

/**
 * SÉRIES DE TWEET CARD, uma por perfil.
 *
 * Por que série e não card avulso: em credit_pricing a ação chama `tweet_card` e a descrição é
 * "Carrossel de tweet card" — o produto entrega uma SEQUÊNCIA por 6 créditos, e o contador "1/3"
 * faz parte do template. Mostrar um card solto na landing vendia o formato errado.
 *
 * A gramática abaixo é a que o renderer entende de verdade (buildTweetCardElement): `**negrito**`
 * vira peso 700, e linha começando com "→" vira bullet com o quadrado azul. Não é markdown genérico.
 */
const TWEETS: Record<string, string[]> = {
  medico: [
    "Pressão alta não dói. É exatamente por isso que ela é perigosa.",
    "Três hábitos mexem mais no seu coração que qualquer remédio:\n→ dormir 7 horas\n→ cortar o sal escondido\n→ caminhar 30 minutos",
    "O melhor exame é o que você **faz**, não o que você agenda.",
  ],
  advogada: [
    "Assinar no calor do momento custa caro. Quase sempre dá pra reverter.",
    "Justa causa exige prova. Se a empresa não tem:\n→ advertência anterior\n→ documento assinado\n→ testemunha\nnão é justa causa.",
    "Você tem **2 anos** para reclamar na Justiça do Trabalho. Não é o resto da vida.",
  ],
  gestor: [
    "Quase toda equipe que parece desmotivada está, na verdade, confusa.",
    "Antes de trocar a pessoa, confira três coisas:\n→ ela sabe o que é sucesso aqui?\n→ ela tem a ferramenta?\n→ alguém já foi honesto com ela?",
    "Meta sem dono não é meta. É **desejo**.",
  ],
  coach: [
    "Disciplina não é acordar às 5h da manhã.",
    "É escolher o que você quer **mais** em vez do que você quer **agora**.",
    "Você não está travado. Você está esperando ter certeza.",
  ],
  nutri: [
    "Comida de verdade não precisa de marketing.",
    "Antes de cortar o carboidrato, tente:\n→ proteína no café da manhã\n→ água antes da fome\n→ mais uma hora de sono",
    "O que você adia hoje cobra caro depois. Comece pelo **prato**.",
  ],
};

/**
 * Peças do mosaico "possibilidades". Fixas de propósito (não seguem o perfil escolhido): a seção
 * existe pra mostrar AMPLITUDE, então tem que aparecer saúde, advocacia, gestão e estilo editorial
 * ao mesmo tempo. Se seguisse o perfil, mostraria nove variações do mesmo nicho.
 */
/** Por ação, não por índice: reordenar CUSTOS não pode mudar o preço anunciado aqui. */
const CUSTO_TWEET = CUSTOS.find((c) => c.action === "tweet_card")?.credits ?? 0;

const MOSAICO: [string, "gerados" | "nichos"][] = [
  ["estilo_dark_editorial", "gerados"], ["adv_hora_extra", "nichos"], ["ges_meta", "nichos"],
  ["estilo_citacao_serif", "gerados"], ["exemplo_sinais_coracao", "gerados"], ["ges_contratar", "nichos"],
  ["estilo_infografico", "gerados"], ["adv_assedio", "nichos"], ["exemplo_produtividade", "gerados"],
  ["ges_reuniao", "nichos"], ["exemplo_alimentacao_saudavel", "gerados"], ["adv_acordo", "nichos"],
];

/** Texto REAL do style_guide de uma marca de verdade — não é exemplo escrito à mão. */
const O_QUE_A_IA_ENTENDEU = {
  padrao: "Fundo branco predominante com ampla área de respiro.",
  faz: "Focar em fluxos operacionais, diagramas corporativos e arquitetura empresarial.",
  naoFaz: "Não utilizar imagens genéricas de pessoas.",
};


/**
 * Largura da janela, pra dimensionar os aparelhos em vez de deixá-los serem cortados.
 *
 * USA ResizeObserver, NÃO o evento `resize`. Motivo medido: ao redimensionar a janela, o CSS
 * respondia (o herói voltava pra duas colunas) mas o estado React ficava preso na largura antiga —
 * o notebook continuava com 319px numa tela de 1440. O evento `resize` não é confiável: além de
 * redimensionamento programático, ele também escapa em zoom do navegador e em mudança da viewport
 * visual (barra de URL e teclado no celular). O ResizeObserver observa o LAYOUT e dispara em todos
 * esses casos.
 *
 * O listener de `resize` fica junto como rede, custa quase nada.
 */
function useLargura() {
  const [w, setW] = useState(typeof window === "undefined" ? 1440 : window.innerWidth);
  useEffect(() => {
    const medir = () => setW(window.innerWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(document.documentElement);
    window.addEventListener("resize", medir);
    return () => { ro.disconnect(); window.removeEventListener("resize", medir); };
  }, []);
  return w;
}

export default function HistoriaLanding({ onSignup, onLogin }: Props) {
  // Começa no Gestor, não no Médico: abrir em consultório fazia a página inteira ler como produto
  // de saúde já na primeira dobra.
  const [i, setI] = useState(2);
  const [escolheu, setEscolheu] = useState(false);
  const m = MARCAS[i];

  // Rodízio lento até o visitante escolher. É o que comunica "serve pra vários" sem depender de
  // ele clicar — e para no primeiro toque pra não brigar com quem está lendo.
  useEffect(() => {
    if (escolheu) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((k) => (k + 1) % MARCAS.length), 5200);
    return () => window.clearInterval(id);
  }, [escolheu]);
  const janela = useLargura();
  const estreito = janela < 780;
  // Os aparelhos encolhem pra caber, com um piso pra não virarem ilegíveis.
  const larguraNote = Math.max(300, Math.min(660, janela - 56));
  const larguraCal = Math.max(300, Math.min(720, janela - 56));
  const larguraCel = Math.max(228, Math.min(296, janela - 80));
  // Três tweet cards lado a lado dentro do bloco de 1200px (56 de padding, 18 de gap × 2).
  // Numa coluna só, o card ocupa a largura disponível.
  // Os três cards dividem a coluna que sobra ao lado do celular do palco:
  // bloco 1200 − 56 de padding − 286 do celular − 44 de gap − 36 dos dois vãos, dividido por 3.
  const larguraTw = estreito
    ? Math.min(360, janela - 52)
    : Math.max(196, Math.min(252, (Math.min(1200, janela) - 56 - 286 - 44 - 36) / 3));
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
          <span className="wm"><Marca /> TrendPulse</span>
          <div className="topo-a">
            <button className="btxt" onClick={onLogin}>Entrar</button>
            <button className="bt" onClick={onSignup}>Criar conta</button>
          </div>
        </div>
      </header>

      {/* ══ 1. Vai ficar bom? ══════════════════════════════════════════════ */}
      <section className="heroi">
        <div className="heroi-texto">
          <p className="olho" data-rv>Para médicos, advogados, gestores e mentores</p>
          <h1 data-rv data-d="60">
            Seu feed<br />cheio.<br /><em>Sem você.</em>
          </h1>
          <p className="lede" data-rv data-d="120">
            Você escreve a ideia em português normal. A IA entrega o post pronto com a sua
            identidade e publica em nove redes. <strong>Troque o perfil aqui embaixo</strong> — é o
            mesmo produto, com cinco caras diferentes.
          </p>

          <div className="chips" data-rv data-d="180" role="tablist" aria-label="Escolher tipo de profissional">
            {MARCAS.map((x, k) => (
              <button key={x.id} role="tab" aria-selected={k === i}
                className={`chip ${k === i ? "on" : ""}`}
                style={{ ["--c" as string]: x.accent }}
                onClick={() => { setI(k); setEscolheu(true); }}>
                {x.nicho}
                {/* Barra de carga do rodízio. Sem ela a troca automática lê como falha da página
                    ("por que isso mudou sozinho?"); com ela lê como demonstração, e o visitante
                    entende que existe uma FILA de perfis pra ver. A `key` remonta o elemento a
                    cada troca, que é o que reinicia a animação de CSS. */}
                {k === i && !escolheu && <span key={i} className="carga" aria-hidden="true" />}
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
          <Celular largura={larguraCel}>
            {/* `key` no perfil: remonta a tela a cada troca, e a animação de CSS transforma o corte
                seco num fade curto. Trocar a grade inteira sem transição parecia glitch. */}
            <div key={m.id} className="troca">
              <GradeDePerfil pecas={m.grade.map(url)} handle={m.handle} nome={m.marca} bio={m.bio} accent={m.accent} />
            </div>
          </Celular>
          <span key={m.id} className="etiqueta">{m.marca}</span>
          <span className="simul">Simulação · as peças são reais, geradas na plataforma</span>
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
                {m.grade.slice(0, 4).map((g, k) => <img key={g[0] + k} src={url(g)} alt="" loading="lazy" />)}
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

          {/* A MESMA FRASE, QUATRO IDENTIDADES. Prova direta e sem texto: quatro peças geradas na
              plataforma com o mesmo texto e briefings de marca diferentes. */}
          <div className="mesma-frase" data-rv data-d="120">
            <p className="mf-titulo">
              A mesma frase — <em>“O que você adia hoje cobra caro depois.”</em> — gerada quatro vezes,
              mudando só a marca:
            </p>
            <div className="mf-linha">
              {[["clinica","Clínica"],["coach","Mentoria"],["nutricao","Nutrição"],["advocacia","Advocacia"]].map(([f, l]) => (
                <figure key={f}>
                  <img src={`/showcase/marcas/${f}.jpg`} alt={`A mesma frase com a identidade de ${l}`} loading="lazy" />
                  <figcaption>{l}</figcaption>
                </figure>
              ))}
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
          {/* ADAPTAÇÃO POR MOLDURA, não por encolhimento. No desktop o LinkedIn aparece num
              notebook, que é onde ele é usado. Num celular o notebook é a moldura errada: a peça é
              quadrada e o post pede mais altura do que largura, então a tela de notebook cortava o
              post ao meio. Aí a moldura sai e o post vira o que ele é — um cartão de feed —, e o
              celular ao lado assume o papel de mostrar a outra rede. */}
          <div className="redes" data-rv data-d="60">
            {estreito ? (
              <div className="li-solto">
                <PostLinkedIn peca={url(m.grade[0])} autor={m.autor} cargo={m.cargo} legenda={m.legenda} accent={m.accent} compacto />
              </div>
            ) : (
              <Notebook largura={larguraNote} aspecto={4 / 3}>
                <PostLinkedIn peca={url(m.grade[0])} autor={m.autor} cargo={m.cargo} legenda={m.legenda} accent={m.accent} />
              </Notebook>
            )}
            <div className="redes-cel">
              <Celular largura={estreito ? larguraCel : 196} sombra={estreito}>
                <GradeDePerfil pecas={m.grade.map(url)} handle={m.handle} nome={m.marca} bio={m.bio} accent={m.accent} compacto={!estreito} />
              </Celular>
            </div>
          </div>
          <p className="redes-nota" data-rv>Simulação do LinkedIn e do Instagram · as peças são reais, geradas na plataforma</p>
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
            <Notebook largura={larguraCal}>
              <CalendarioDoMes pecas={m.grade.map(url)} accent={m.accent} />
            </Notebook>
          </div>
        </div>
      </section>

      {/* ══ 5. O que ela sabe fazer ════════════════════════════════════════ */}
      <section className="bl">
        <div className="bl-in">
          <p className="olho" data-rv>Quatro formatos</p>
          <h2 data-rv>Não é só post quadrado</h2>
          <p className="sub" data-rv>
            Carrossel com fio narrativo, story vertical, card de tweet em série. Tudo com a sua
            identidade, e você escolhe na hora de pedir.
          </p>

          <div className="formatos" data-rv data-d="60">
            <figure className="fmt">
              <img src="/showcase/gerados/estilo_dark_editorial.jpg" alt="Post gerado na plataforma" loading="lazy" />
              <figcaption><strong>Post</strong><span>10 cr</span></figcaption>
            </figure>

            <figure className="fmt carrossel">
              {/* Três peças escalonadas: é o que faz ler como carrossel e não como post solto. */}
              <div className="pilha">
                <img src="/showcase/nichos/ges_equipe.jpg" alt="" loading="lazy" />
                <img src="/showcase/nichos/ges_reuniao.jpg" alt="" loading="lazy" />
                <img src="/showcase/nichos/ges_meta.jpg" alt="Carrossel gerado na plataforma" loading="lazy" />
              </div>
              <figcaption><strong>Carrossel</strong><span>10 cr / slide</span></figcaption>
            </figure>

            <figure className="fmt">
              <img className="vertical" src="/showcase/nichos/story_decisao.jpg" alt="Story vertical gerado na plataforma" loading="lazy" />
              <figcaption><strong>Story 9:16</strong><span>25 cr</span></figcaption>
            </figure>

            <figure className="fmt">
              <div className="tw">
                <TweetCard autor={m.autor} handle={m.handle} accent={m.accent} largura={252}
                  texto={TWEETS[m.id][0]} indice={1} total={3} />
              </div>
              <figcaption><strong>Tweet card</strong><span>6 cr a série</span></figcaption>
            </figure>
          </div>

          {/* MOSAICO. O Raul pediu "uma área só pra falar das possibilidades, passando várias
              imagens bacanas". Os quatro formatos acima dizem o QUE existe; o mosaico mostra o
              VOLUME e a variedade de cara — é o argumento que nenhum texto ganha. Todas geradas
              na plataforma, de nichos diferentes de propósito. */}
          <div className="mosaico" data-rv data-d="120">
            <p className="mos-titulo">
              Tudo abaixo saiu da plataforma, em marcas e nichos diferentes:
            </p>
            <div className="mos-grade">
              {MOSAICO.map((g) => (
                <img key={g[0]} src={url(g)} alt="Peça gerada no TrendPulse" loading="lazy" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ 6. O print de tweet ════════════════════════════════════════════ */}
      <section className="bl">
        <div className="bl-in">
          <p className="olho" data-rv>O print de tweet</p>
          <h2 data-rv>Aquele print que você salva sem pensar</h2>
          <p className="sub" data-rv>
            Frase curta, fundo branco, cara de tweet. Funciona porque não parece anúncio: parece
            alguém pensando alto. Você já passou por vários esta semana, provavelmente sem reparar
            que foram montados — e é justo o formato mais chato de fazer na mão.
          </p>

          {/* O contraste é o argumento. Quem já tentou fazer isso reconhece a coluna da esquerda
              na hora, e é esse reconhecimento que faz a da direita valer alguma coisa. */}
          <div className="tw-duas" data-rv data-d="60">
            <div className="tw-col">
              <span className="tw-tag ruim">Na mão</span>
              <ul>
                <li>Publicar o tweet de verdade só pra tirar o print</li>
                <li>Recortar, limpar a barra de status, acertar a margem</li>
                <li>Ou remontar no Canva, um card de cada vez</li>
                <li>E refazer tudo do zero quando quiser uma sequência</li>
              </ul>
            </div>
            <div className="tw-col">
              <span className="tw-tag bom">No TrendPulse</span>
              <ul>
                <li>Você escreve a frase no chat</li>
                <li>Sai pronto com o seu nome, o seu @ e o selo</li>
                <li>Pede três e vira carrossel, numerado 1/3</li>
                <li>{CUSTO_TWEET} créditos a série inteira</li>
              </ul>
            </div>
          </div>

          {/* NO FEED, não solto. O card flutuando na página lê como asset; dentro do post do
              Instagram, com bolinha de carrossel e "1/3" no canto, ele lê como o que o seguidor
              vai ver de verdade. É a moldura que prova o valor do formato. */}
          <div className="tw-palco" data-rv data-d="80">
            <div className="tw-fone">
              <Celular largura={estreito ? larguraCel : 286}>
                <div key={m.id} className="troca">
                  <PostInstagram
                    autor={m.autor} handle={m.handle} accent={m.accent}
                    legenda={TWEETS[m.id][0].replace(/\*\*/g, "").split("\n")[0]}
                    slides={3} slideAtual={1}
                    midia={<TweetCard autor={m.autor} handle={m.handle} accent={m.accent}
                      largura={estreito ? larguraCel - 20 : 266} texto={TWEETS[m.id][0]}
                      indice={1} total={3} sombra={false} />}
                  />
                </div>
              </Celular>
              <span className="simul">Simulação do Instagram · o card é o que a plataforma gera</span>
            </div>

            <div className="tw-aberto">
              <p className="serie-titulo">
                Arrastando, o seguidor vê os três. É uma geração só, para {m.marca}:
              </p>
              <div className="serie-linha aberta">
                {TWEETS[m.id].map((t, k) => (
                  <TweetCard key={m.id + k} autor={m.autor} handle={m.handle} accent={m.accent}
                    largura={larguraTw} texto={t} indice={k + 1} total={3} />
                ))}
              </div>
            </div>
          </div>

          <div className="serie-tw" data-rv data-d="100">
            <p className="serie-nota">
              O texto é desenhado por template, não gerado por modelo de imagem. É por isso que ele
              nunca sai com letra torta, acento faltando ou palavra embolada — o defeito clássico de
              quem tenta fazer card de texto com IA de imagem.
            </p>
          </div>
        </div>
      </section>

      {/* ══ 6. Quanto custa? ═══════════════════════════════════════════════ */}
      <section className="bl">
        <div className="bl-in">
          <p className="olho" data-rv>Preço</p>
          <h2 data-rv>Você paga o que usar</h2>
          <p className="sub" data-rv>
            Créditos pré-pagos, sem mensalidade e sem pacote parado. Onde aparece “a partir de”, o
            preço depende do modelo de imagem que você escolher na hora de gerar.
          </p>

          <div className="custos" data-rv>
            {CUSTOS.slice(0, 5).map((c) => (
              <div key={c.action} className="custo">
                <div className="custo-top">
                  <h3>{c.label}</h3>
                  {/* Formato com preço variável mostra o PISO, não o padrão: anunciar 25 num story
                      que sai por 10 no GPT-Image 2 é anunciar o teto como se fosse o preço. */}
                  <span className="cr">
                    {c.variaPorModelo ? <small className="de">a partir de </small> : null}
                    {c.variaPorModelo ? c.variaPorModelo.min : c.credits}<small>cr</small>
                  </span>
                </div>
                <p>{c.detalhe}</p>
                {c.variaPorModelo && <p className="varia">{c.variaPorModelo.nota}</p>}
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
        <span className="wm rod"><Marca /> TrendPulse</span>
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
  font-family:Inter,system-ui,sans-serif; min-height:100vh;
  /* CLIP, NAO HIDDEN. overflow-x:hidden faz o overflow-y virar 'auto' pela especificacao, e isso
     transforma este container num SCROLL CONTAINER. O .topo (position:sticky) passa entao a grudar
     neste container em vez de na viewport, e o Chrome erra o calculo de repintura durante o scroll —
     e o rastro que aparecia no fundo escuro. overflow-x:clip corta o transbordo horizontal SEM criar
     scroll container, que e exatamente o que a pagina precisa (o celular do heroi invade a coluna). */
  overflow-x:clip;
}
.hl *{box-sizing:border-box}
.hl [data-rv]{opacity:0;transform:translateY(24px);transition:opacity .75s cubic-bezier(.16,1,.3,1),transform .75s cubic-bezier(.16,1,.3,1)}
@media (prefers-reduced-motion:reduce){
  .hl [data-rv]{opacity:1!important;transform:none!important;transition:none!important}
  .hl *{animation:none!important}
}
.hl :focus-visible{outline:2px solid var(--marca);outline-offset:3px;border-radius:4px}

/* SEM backdrop-filter. Um filtro de fundo num cabecalho fixo obriga o compositor a re-amostrar a
   area atras dele a cada quadro; passando por cima de um bloco escuro de contraste alto, o Chrome
   arrasta ladrilho antigo e deixa faixa/fantasma — o segundo motivo do glitch no fundo azul.
   O fundo ja estava em 90% de opacidade, entao o desfoque quase nao aparecia: subindo pra 97% o
   ganho visual perdido e nulo e a classe inteira de bug some. */
.hl .topo{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--papel) 97%,transparent);border-bottom:1px solid var(--linha)}
.hl .topo-in{max-width:1200px;margin:0 auto;padding:13px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.hl .wm{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-weight:800;font-size:19px;letter-spacing:-.028em;display:inline-flex;align-items:center;gap:9px;color:var(--tinta)}
.hl .wm.rod{font-size:16px}
.hl .marca-sim{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--marca);flex:none}
.hl .wm.rod .marca-sim{width:24px;height:24px;border-radius:7px}
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
.hl .simul{display:block;text-align:center;margin-top:5px;font-size:10.5px;color:var(--t3);letter-spacing:.01em}
.hl .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:34px}
.hl .chip{position:relative;overflow:hidden;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;background:transparent;color:var(--t2);border:1px solid var(--linha);border-radius:999px;padding:11px 18px;min-height:44px;transition:border-color .25s,color .25s,background .25s}
.hl .chip:hover{border-color:var(--c);color:var(--tinta)}
.hl .chip.on{background:var(--c);border-color:var(--c);color:#fff}
/* Barra de carga do rodizio: percorre o chip ativo no mesmo tempo do intervalo (5.2s). */
.hl .carga{position:absolute;left:0;bottom:0;height:2.5px;width:100%;background:rgba(255,255,255,.85);transform-origin:left;animation:carga 5.2s linear forwards}
@keyframes carga{from{transform:scaleX(0)}to{transform:scaleX(1)}}
/* Fade curto na troca de perfil, no aparelho e na etiqueta. */
.hl .troca{height:100%;animation:troca .5s cubic-bezier(.16,1,.3,1)}
@keyframes troca{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}
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
.hl .redes-cel{margin-left:-26px;margin-bottom:-30px;position:relative;z-index:2}
/* LinkedIn sem moldura, pra telas onde o notebook nao cabe. */
.hl .li-solto{width:100%;max-width:420px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.hl .redes-nota{text-align:center;margin:26px 0 0;font-size:11.5px;color:#8894A5;letter-spacing:.01em}

.hl .cal{display:flex;justify-content:center}

.hl .custos{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--linha);border:1px solid var(--linha);border-radius:12px;overflow:hidden;margin-bottom:44px}
.hl .custo{background:var(--papel);padding:20px 18px}
.hl .custo-top{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:7px}
.hl .custo h3{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:14.5px;font-weight:700;margin:0;letter-spacing:-.015em}
.hl .cr{font-size:23px;font-weight:800;color:var(--marca);font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.hl .cr small{font-size:11px;font-weight:600;margin-left:1px}
.hl .custo p{font-size:12.5px;color:var(--t2);margin:0;line-height:1.45}
.hl .cr .de{display:block;font-size:9.5px;font-weight:600;color:var(--t3);letter-spacing:.04em;text-transform:uppercase;margin-bottom:-2px}
.hl .varia{font-size:11px;color:var(--t3);margin-top:7px;line-height:1.4;font-variant-numeric:tabular-nums}

/* ── Mosaico de possibilidades ── */
.hl .mosaico{margin-top:56px;padding-top:38px;border-top:1px solid var(--linha)}
.hl .mos-titulo{font-size:15.5px;color:var(--t2);margin:0 0 20px;max-width:64ch}
.hl .mos-grade{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.hl .mos-grade img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:9px;border:1px solid var(--linha);display:block;transition:transform .45s cubic-bezier(.16,1,.3,1)}
.hl .mos-grade img:hover{transform:scale(1.05)}

/* ── O print de tweet: na mao x aqui ── */
.hl .tw-duas{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px}
.hl .tw-col{background:#fff;border:1px solid var(--linha);border-radius:13px;padding:20px 22px}
.hl .tw-tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:13px}
.hl .tw-tag.ruim{background:#F4E7E5;color:#9B4238}
.hl .tw-tag.bom{background:#E3F1EA;color:#186B4E}
.hl .tw-col ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.hl .tw-col li{font-size:14px;line-height:1.45;color:var(--t2);padding-left:18px;position:relative}
.hl .tw-col li::before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:var(--linha)}
.hl .tw-col:last-child li::before{background:var(--teal)}

/* ── Palco do tweet card: celular com o post real + serie aberta ao lado ── */
.hl .tw-palco{display:grid;grid-template-columns:auto 1fr;gap:44px;align-items:center;margin-top:44px}
/* A legenda "Simulação" e mais larga que o celular e engordava esta coluna em 10px, o que
   empurrava o terceiro card pra linha de baixo. Travando a coluna na largura do aparelho. */
.hl .tw-fone{display:flex;flex-direction:column;align-items:center;width:286px;max-width:100%}
.hl .tw-fone .simul{width:100%}
.hl .tw-aberto{min-width:0}
.hl .serie-linha.aberta{justify-content:flex-start}

/* ── Serie de tweet cards ── */
.hl .serie-tw{margin-top:38px;padding-top:30px;border-top:1px solid var(--linha)}
.hl .serie-titulo{font-size:15.5px;color:var(--t2);margin:0 0 24px;max-width:64ch;line-height:1.55}
.hl .serie-titulo em{font-style:normal;color:var(--tinta);font-weight:600}
/* Largura do card vem por PROP, não por CSS: todas as medidas internas do TweetCard sao derivadas
   dela (canvas real de 1080), entao esticar a caixa por CSS deixaria o conteudo em outra escala. */
.hl .serie-linha{display:flex;gap:18px;align-items:flex-start;justify-content:center;flex-wrap:wrap}
.hl .serie-nota{font-size:12.5px;color:var(--t3);margin:20px 0 0;line-height:1.5;max-width:68ch}

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

/* ── A mesma frase, quatro identidades ── */
.hl .mesma-frase{margin-top:52px;padding-top:36px;border-top:1px solid var(--linha)}
.hl .mf-titulo{font-size:15.5px;color:var(--t2);margin:0 0 22px;max-width:64ch;line-height:1.55}
.hl .mf-titulo em{font-style:normal;color:var(--tinta);font-weight:600}
.hl .mf-linha{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.hl .mf-linha figure{margin:0}
.hl .mf-linha img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid var(--linha);display:block}
.hl .mf-linha figcaption{font-size:11.5px;font-weight:600;color:var(--t3);margin-top:8px;text-align:center}

/* ── Os quatro formatos ── */
.hl .formatos{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;align-items:end}
.hl .fmt{margin:0;display:flex;flex-direction:column}
.hl .fmt>img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;border:1px solid var(--linha);display:block;box-shadow:0 12px 28px -18px rgba(20,37,58,.45)}
.hl .fmt>img.vertical{aspect-ratio:9/16;object-fit:cover}
.hl .fmt figcaption{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:11px}
.hl .fmt figcaption strong{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-size:15px;font-weight:700;letter-spacing:-.015em;color:var(--tinta)}
.hl .fmt figcaption span{font-size:12.5px;font-weight:600;color:var(--marca);font-variant-numeric:tabular-nums;white-space:nowrap}
.hl .pilha{position:relative;aspect-ratio:1}
.hl .pilha img{position:absolute;width:84%;aspect-ratio:1;object-fit:cover;border-radius:12px;border:1px solid var(--linha);display:block;box-shadow:0 10px 24px -14px rgba(20,37,58,.5)}
.hl .pilha img:nth-child(1){top:0;left:0;opacity:.5;transform:scale(.9) translate(-4%,-2%)}
.hl .pilha img:nth-child(2){top:6%;left:8%;opacity:.78;transform:scale(.95)}
.hl .pilha img:nth-child(3){top:14%;left:16%}
.hl .tw{display:flex;justify-content:center;align-items:center;aspect-ratio:1}

@media (max-width:1080px){
  .hl .formatos{grid-template-columns:repeat(2,1fr);gap:28px}
  .hl .mf-linha{grid-template-columns:repeat(2,1fr)}
  .hl .mos-grade{grid-template-columns:repeat(4,1fr)}
}
@media (max-width:980px){
  /* Celular em cima, serie embaixo: lado a lado o card cai abaixo de 200px e o texto some. */
  .hl .tw-palco{grid-template-columns:1fr;gap:34px;justify-items:center}
  .hl .serie-linha.aberta{justify-content:center}
  .hl .tw-aberto{width:100%}
}
@media (max-width:780px){
  .hl .tw-duas{grid-template-columns:1fr}
}
@media (max-width:560px){
  .hl .formatos{grid-template-columns:1fr;gap:34px}
  .hl .tw{aspect-ratio:auto}
  .hl .mos-grade{grid-template-columns:repeat(3,1fr);gap:7px}
}

@media (max-width:1080px){
  .hl .custos{grid-template-columns:repeat(2,1fr)}
  .hl .redes-cel{margin-left:-18px}
}
@media (max-width:900px){
  .hl .heroi{grid-template-columns:1fr;gap:44px;padding-top:56px}
  .hl .heroi-device{grid-column:1;grid-row:2;margin-left:0}
  .hl .tres{grid-template-columns:1fr;gap:32px}
  .hl .pacotes{grid-template-columns:1fr}
  .hl .redes{flex-direction:column;align-items:center;gap:30px}
  .hl .redes-cel{margin:0;transform:none}
}
@media (max-width:640px){
  .hl .bl-in{padding:60px 22px}
  .hl .heroi{padding-left:22px;padding-right:22px}
  .hl .custos{grid-template-columns:1fr}
  .hl .bt.g{width:100%}
}
`;
