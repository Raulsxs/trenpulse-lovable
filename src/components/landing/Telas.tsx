/**
 * Telas que vão DENTRO dos aparelhos (Devices.tsx).
 *
 * FIDELIDADE: são reproduções do chrome real do Instagram e do LinkedIn, não uma "sugestão" de rede
 * social. O olho reconhece essas interfaces sem pensar, e um mockup aproximado lê como amador — que
 * é justamente o oposto do que a página precisa provar. Os detalhes que fazem a diferença são os
 * que ninguém nomeia: a barra de status, a linha de destaques, a barra de navegação inferior, o
 * espaçamento de 2px da grade, o "…ver mais" da legenda do LinkedIn.
 *
 * SOBRE OS NÚMEROS: o chrome real TEM contador (seguidores no Instagram, reações no LinkedIn).
 * Omitir deixava o mockup errado; inventar seria prova social fabricada. A saída é a legenda
 * "Simulação" que acompanha cada aparelho na landing: o chrome fica fiel, e nada é afirmado. As
 * PEÇAS dentro da tela, essas sim, são reais — geradas na plataforma.
 */

/* ── Barra de status do celular ───────────────────────────────────────────── */

function BarraDeStatus({ escura = false }: { escura?: boolean }) {
  const cor = escura ? "#fff" : "#0B0B0B";
  return (
    <div
      style={{
        paddingTop: "11%",
        paddingInline: 22,
        paddingBottom: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 12.5,
        fontWeight: 600,
        color: cor,
        letterSpacing: "-.01em",
      }}
    >
      <span>9:41</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* Sinal, wi-fi e bateria — três silhuetas que o olho lê como "é um celular". */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill={cor}>
          <rect x="0" y="7.5" width="2.6" height="3.5" rx=".7" />
          <rect x="4.2" y="5.2" width="2.6" height="5.8" rx=".7" />
          <rect x="8.4" y="2.6" width="2.6" height="8.4" rx=".7" />
          <rect x="12.6" y="0" width="2.6" height="11" rx=".7" />
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill={cor}>
          <path d="M7.5 10.4 5.2 8a3.3 3.3 0 0 1 4.6 0l-2.3 2.4Z" />
          <path d="M7.5 5.1c1.6 0 3.1.6 4.2 1.7l1.4-1.5a8.2 8.2 0 0 0-11.2 0l1.4 1.5A6 6 0 0 1 7.5 5Z" opacity=".9" />
          <path d="M7.5 1.4c2.6 0 5 1 6.8 2.7L15.5 3A11 11 0 0 0 0 3l1.2 1.2A9.6 9.6 0 0 1 7.5 1.4Z" opacity=".55" />
        </svg>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 1.5 }}>
          <span style={{ width: 20, height: 10.5, borderRadius: 3, border: `1.2px solid ${cor}`, opacity: .45, position: "relative", display: "inline-block" }}>
            <span style={{ position: "absolute", inset: 1.5, width: "72%", borderRadius: 1.5, background: cor }} />
          </span>
          <span style={{ width: 1.5, height: 4, borderRadius: 1, background: cor, opacity: .45 }} />
        </span>
      </span>
    </div>
  );
}

/* ── Instagram: perfil ────────────────────────────────────────────────────── */

export function GradeDePerfil({
  pecas,
  handle,
  nome,
  bio,
  accent,
  compacto = false,
}: {
  pecas: string[];
  handle: string;
  nome: string;
  bio: string;
  accent: string;
  /** Abaixo de ~240px de largura o chrome completo do Instagram nao cabe: os tres contadores
   *  colidem e viram borrao. No compacto some contador, destaque e botao, e a grade cresce —
   *  que e o que interessa numa miniatura de apoio. */
  compacto?: boolean;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <BarraDeStatus />

      {/* Barra superior: seta, handle com chevron, sino e menu */}
      <div style={{ padding: "6px 14px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <SetaVoltar />
        <span style={{ fontSize: 14.5, fontWeight: 700, color: "#0B0B0B", letterSpacing: "-.02em", flex: 1, display: "flex", alignItems: "center", gap: 3 }}>
          {handle}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
        <IconeSino />
        <IconeMenu />
      </div>

      {/* Linha do perfil: avatar + três contadores. É o elemento mais reconhecível
          da tela — sem ele, não lê como Instagram. */}
      <div style={{ padding: compacto ? "6px 12px 8px" : "0 14px", display: "flex", alignItems: "center", gap: compacto ? 10 : 12, minWidth: 0 }}>
        <div
          style={{
            width: compacto ? 46 : 78, height: compacto ? 46 : 78, borderRadius: "50%", flex: "none", background: accent,
            display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: compacto ? 19 : 30,
            border: "2px solid #fff", boxShadow: "0 0 0 1.5px #DBDBDB",
          }}
        >
          {nome[0]?.toUpperCase()}
        </div>
        {!compacto && (
          <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 0, justifyContent: "space-between" }}>
            {[["128", "publicações"], ["2.940", "seguidores"], ["312", "seguindo"]].map(([n, l]) => (
              <div key={l} style={{ textAlign: "center", minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "#0B0B0B", lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{n}</div>
                <div style={{ fontSize: 10.5, color: "#0B0B0B", whiteSpace: "nowrap", letterSpacing: "-.02em" }}>{l}</div>
              </div>
            ))}
          </div>
        )}
        {compacto && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0B0B0B", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nome}</div>
            <div style={{ fontSize: 10.5, color: "#737373" }}>Perfil profissional</div>
          </div>
        )}
      </div>

      {/* Nome, categoria e bio */}
      {!compacto && <div style={{ padding: "11px 16px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0B0B0B", lineHeight: 1.35 }}>{nome}</div>
        <div style={{ fontSize: 13, color: "#737373", lineHeight: 1.35 }}>{bio}</div>
      </div>}

      {/* Botões de ação */}
      {!compacto && <div style={{ padding: "12px 16px 0", display: "flex", gap: 6 }}>
        <div style={{ flex: 1, background: "#0095F6", color: "#fff", borderRadius: 8, padding: "7px 0", textAlign: "center", fontSize: 13, fontWeight: 600 }}>Seguir</div>
        <div style={{ flex: 1, background: "#EFEFEF", color: "#0B0B0B", borderRadius: 8, padding: "7px 0", textAlign: "center", fontSize: 13, fontWeight: 600 }}>Mensagem</div>
        <div style={{ width: 34, background: "#EFEFEF", borderRadius: 8, display: "grid", placeItems: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="2.4"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>}

      {/* Destaques */}
      {!compacto && <div style={{ padding: "14px 16px 12px", display: "flex", gap: 16, overflow: "hidden" }}>
        {["Antes", "Dicas", "Casos"].map((d) => (
          <div key={d} style={{ textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", border: "1.5px solid #DBDBDB", background: "#FAFAFA", display: "grid", placeItems: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${accent}1F` }} />
            </div>
            <div style={{ fontSize: 11, color: "#0B0B0B", marginTop: 4 }}>{d}</div>
          </div>
        ))}
      </div>}

      {/* Abas */}
      <div style={{ display: "flex", borderTop: "1px solid #DBDBDB" }}>
        {[<GradeIcone key="g" />, <ReelsIcone key="r" />, <MarcadoIcone key="m" />].map((ic, k) => (
          <div key={k} style={{ flex: 1, padding: "9px 0", textAlign: "center", borderBottom: k === 0 ? "1.5px solid #0B0B0B" : "none", opacity: k === 0 ? 1 : .32 }}>
            {ic}
          </div>
        ))}
      </div>

      {/* A grade. 2px de gap, que é o valor real do Instagram. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, flex: 1, alignContent: "start", overflow: "hidden" }}>
        {pecas.slice(0, 9).map((src, i) => (
          <img key={src + i} src={src} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
        ))}
      </div>

      {/* Barra de navegação inferior */}
      <div style={{ borderTop: "1px solid #DBDBDB", padding: "9px 22px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" }}>
        <CasaIcone /><LupaIcone /><ReelsIcone /><LojaIcone />
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: accent, border: "1.5px solid #0B0B0B" }} />
      </div>
    </div>
  );
}

const SetaVoltar = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="2.2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);
const IconeSino = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
const IconeMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" strokeLinecap="round"><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></svg>
);
const GradeIcone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" style={{ display: "inline-block" }}>
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);
const ReelsIcone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" style={{ display: "inline-block" }}>
    <rect x="3" y="3" width="18" height="18" rx="4" /><line x1="8" y1="3" x2="11" y2="8" /><line x1="15" y1="3" x2="18" y2="8" /><line x1="3" y1="8" x2="21" y2="8" /><polygon points="11 12 15.5 14.5 11 17" fill="#0B0B0B" stroke="none" />
  </svg>
);
const MarcadoIcone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" style={{ display: "inline-block" }}>
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="10" r="2.6" /><path d="M7 19c0-2.8 2.2-5 5-5s5 2.2 5 5" />
  </svg>
);
const CasaIcone = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="#0B0B0B"><path d="M12 3 2.5 10.5V21H9v-6h6v6h6.5V10.5L12 3Z" /></svg>
);
const LupaIcone = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="2"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
);
const LojaIcone = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="2"><path d="M4 8h16l-1.2 12H5.2L4 8Z" /><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" /></svg>
);

/* ── LinkedIn: post no feed ───────────────────────────────────────────────── */

export function PostLinkedIn({
  peca,
  autor,
  cargo,
  legenda,
  accent,
  compacto = false,
}: {
  peca: string;
  autor: string;
  cargo: string;
  legenda: string;
  accent: string;
  /** Em tela estreita o LinkedIn real também derruba as colunas laterais.
   *
   *  ALTURA MUDA JUNTO: no compacto a tela cresce conforme o conteúdo em vez de fingir 100% de uma
   *  moldura que não cabe. A conta é simples e não tinha saída: o chrome do post ocupa ~222px fixos
   *  e a peça é QUADRADA, então numa coluna de 294px o post pede 516px de altura — mais alto que
   *  largo. Espremer isso numa tela de notebook cortava o post ao meio (medido: 261px pra fora).
   *  Quem chama decide a moldura; aqui só paramos de mentir sobre a altura. */
  compacto?: boolean;
}) {
  const inicial = autor[0]?.toUpperCase();
  return (
    <div style={{ height: compacto ? "auto" : "100%", background: "#F4F2EE", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Barra de navegação. Os itens do LinkedIn são ícone EM CIMA do rótulo, empilhados —
          escrito só como texto lado a lado, a barra lia como menu de site qualquer. */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", padding: "0 20px", display: "flex", alignItems: "center", gap: 8, height: 46, flex: "none" }}>
        <div style={{ width: 26, height: 26, borderRadius: 4, background: "#0A66C2", color: "#fff", fontWeight: 800, fontSize: 16, lineHeight: 1, display: "grid", placeItems: "center", fontFamily: "Georgia, serif", flex: "none" }}>in</div>
        <div style={{ background: "#EDF3F8", borderRadius: 4, height: 28, width: compacto ? 110 : 176, display: "flex", alignItems: "center", gap: 6, padding: "0 8px", flex: "none" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00000099" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
          <span style={{ fontSize: 11.5, color: "#00000066" }}>Pesquisar</span>
        </div>
        <div style={{ flex: 1 }} />
        {!compacto && NAV_LINKEDIN.map(({ rotulo, d }, i) => (
          <div key={rotulo} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "0 10px", color: i === 0 ? "#000000E6" : "#00000099", borderBottom: i === 0 ? "2px solid #000000E6" : "2px solid transparent", height: 46, justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
            <span style={{ fontSize: 10, lineHeight: 1 }}>{rotulo}</span>
          </div>
        ))}
        {!compacto && <div style={{ width: 1, height: 28, background: "rgba(0,0,0,.12)", margin: "0 4px" }} />}
        {!compacto && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: "#00000099" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: accent }} />
            <span style={{ fontSize: 10, lineHeight: 1 }}>Eu ⌄</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 14, padding: compacto ? "12px 14px" : "14px 12px", flex: compacto ? "none" : 1, minHeight: 0, justifyContent: "center" }}>
        {/* Coluna esquerda: cartão de perfil. Some no compacto. */}
        {!compacto && <div style={{ width: 160, flex: "none" }}>
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", overflow: "hidden" }}>
            <div style={{ height: 38, background: `linear-gradient(120deg, ${accent}, ${accent}AA)` }} />
            <div style={{ padding: "0 12px 11px", marginTop: -22, textAlign: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: accent, border: "2px solid #fff", margin: "0 auto", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 17 }}>
                {inicial}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#000000E6", marginTop: 6, lineHeight: 1.2 }}>{autor}</div>
              <div style={{ fontSize: 10.5, color: "#00000099", lineHeight: 1.3, marginTop: 2 }}>{cargo}</div>
            </div>
            {/* O card de perfil do LinkedIn tem esta faixa de estatística embaixo. Sem número:
                inventar contagem numa página de venda é prova social fabricada. */}
            <div style={{ borderTop: "1px solid rgba(0,0,0,.08)", padding: "7px 12px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#00000099" }}>Impressões</span>
              <span style={{ fontSize: 10, color: "#0A66C2", fontWeight: 600 }}>—</span>
            </div>
          </div>
        </div>}

        {/* Coluna central: o post. Largura FIXA, não flex — a peça é quadrada e a altura dela
            é a largura desta coluna, então quem manda no encaixe vertical é este número. */}
        <div style={{ width: compacto ? "auto" : 262, flex: compacto ? 1 : "none", minWidth: 0 }}>
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", overflow: "hidden" }}>
            <div style={{ padding: "9px 12px 5px", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", flex: "none", background: accent, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 15 }}>
                {inicial}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#000000E6", lineHeight: 1.25 }}>{autor}</div>
                <div style={{ fontSize: 10.5, color: "#00000099", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cargo}</div>
                <div style={{ fontSize: 10, color: "#00000099", display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                  1 h ·
                  {/* Globo de "público". O path anterior era um rabisco que não fechava. */}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00000099" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><line x1="3" y1="12" x2="21" y2="12" />
                  </svg>
                </div>
              </div>
              <span style={{ color: "#00000099", fontSize: 14, letterSpacing: 1, flex: "none" }}>···</span>
            </div>

            <p style={{ margin: 0, padding: "0 12px 7px", fontSize: 11.5, lineHeight: 1.4, color: "#000000E6", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {legenda} <span style={{ color: "#00000099" }}>…ver mais</span>
            </p>

            {/* A PEÇA INTEIRA, quadrada. Antes ia em aspecto 1.65 com object-fit cover, e o corte
                central comia as bordas do título — no print do Raul o "5" tinha sumido na margem
                esquerda. A coluna central foi estreitada (com a coluna direita entrando, como no
                LinkedIn real) justamente pra a peça caber inteira sem cortar nada. */}
            <img src={peca} alt="" loading="lazy" style={{ width: "100%", display: "block", aspectRatio: "1", objectFit: "cover" }} />

            {/* Reações. Sem número: contagem inventada é prova social fabricada. */}
            <div style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid rgba(0,0,0,.08)" }}>
              <Reacao cor="#378FE9" d="M6.5 20h9.2a1.8 1.8 0 0 0 1.8-1.4l1.4-5.6a1.5 1.5 0 0 0-1.5-1.9h-4.3l.7-3.2A1.7 1.7 0 0 0 12 5.8L8.4 11h-1.9v9ZM3.5 11h2.2v9H3.5v-9Z" />
              <Reacao cor="#DF704D" desloca d="M12 20.3s-7.6-4.7-7.6-9.6a4.3 4.3 0 0 1 7.6-2.7 4.3 4.3 0 0 1 7.6 2.7c0 4.9-7.6 9.6-7.6 9.6Z" />
              <Reacao cor="#6DAE4F" desloca d="M12 3.2a8.8 8.8 0 1 1 0 17.6 8.8 8.8 0 0 1 0-17.6Zm-3.4 6.4h1.6v2.1H8.6V9.6Zm5.2 0h1.6v2.1h-1.6V9.6Zm-5.4 4.2h7.2a3.6 3.6 0 0 1-7.2 0Z" />
            </div>

            <div style={{ display: "flex", padding: "2px 4px" }}>
              {ACOES_LINKEDIN.map(({ rotulo, d }) => (
                <div key={rotulo} style={{ flex: 1, textAlign: "center", padding: "7px 0", fontSize: 10, fontWeight: 600, color: "#00000099", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
                  {rotulo}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna direita. Sem ela a tela lê como "um card solto num fundo bege", não como
            LinkedIn — o feed real é sempre três colunas no desktop. */}
        {!compacto && <div style={{ width: 160, flex: "none" }}>
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", padding: "10px 12px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#000000E6", marginBottom: 8 }}>Publicado pelo TrendPulse</div>
            {["Agendado para hoje", "Sai também no Instagram", "Legenda adaptada à rede"].map((l) => (
              <div key={l} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "4px 0" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, flex: "none", marginTop: 5 }} />
                <span style={{ fontSize: 10, color: "#00000099", lineHeight: 1.35 }}>{l}</span>
              </div>
            ))}
          </div>
        </div>}
      </div>
    </div>
  );
}

const Reacao = ({ cor, d, desloca }: { cor: string; d: string; desloca?: boolean }) => (
  <span style={{ width: 16, height: 16, borderRadius: "50%", background: cor, display: "grid", placeItems: "center", marginLeft: desloca ? -5 : 0, border: "1.5px solid #fff", flex: "none" }}>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d={d} /></svg>
  </span>
);

const NAV_LINKEDIN = [
  { rotulo: "Início", d: "M12 3 2 11h3v9h5.5v-6h3v6H19v-9h3L12 3Z" },
  { rotulo: "Rede", d: "M9 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Zm7.3-.4a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1.8 20.5c0-4 3.2-7.2 7.2-7.2s7.2 3.2 7.2 7.2H1.8Zm16.1 0c0-2.4-.8-4.5-2.2-6.2 3.6.2 6.5 3.1 6.5 6.2h-4.3Z" },
  { rotulo: "Vagas", d: "M9.2 4h5.6a2 2 0 0 1 2 2v1.8h3.4a1.8 1.8 0 0 1 1.8 1.8v8.6A1.8 1.8 0 0 1 20.2 20H3.8A1.8 1.8 0 0 1 2 18.2V9.6a1.8 1.8 0 0 1 1.8-1.8h3.4V6a2 2 0 0 1 2-2Zm.2 3.8h5.2V6.2H9.4v1.6Z" },
];

const ACOES_LINKEDIN = [
  { rotulo: "Gostei", d: "M6.5 20h9.2a1.8 1.8 0 0 0 1.8-1.4l1.4-5.6a1.5 1.5 0 0 0-1.5-1.9h-4.3l.7-3.2A1.7 1.7 0 0 0 12 5.8L8.4 11h-1.9v9ZM3.5 11h2.2v9H3.5v-9Z" },
  { rotulo: "Comentar", d: "M3 4.8A1.8 1.8 0 0 1 4.8 3h14.4A1.8 1.8 0 0 1 21 4.8v9.6a1.8 1.8 0 0 1-1.8 1.8H8.6L3 21V4.8Z" },
  { rotulo: "Enviar", d: "M14 4.2v3.6C7.4 8.6 4.2 13.4 3 20c2.6-3.6 6.2-5.4 11-5.4v3.7l7-7-7-7.1Z" },
];

/* ── Calendário do produto ────────────────────────────────────────────────── */

export function CalendarioDoMes({ pecas, accent }: { pecas: string[]; accent: string }) {
  // Mês genérico de 30 dias começando numa quarta — não é um mês específico de propósito,
  // pra a página não envelhecer sozinha. Peça de segunda a sexta: rotina de post diário útil.
  const OFFSET = 3;
  const DIAS = 30;
  const temPeca = (dia: number) => {
    const ds = (OFFSET + dia - 1) % 7;
    return ds >= 1 && ds <= 5;
  };

  let usadas = 0;
  const total = Array.from({ length: DIAS }, (_, i) => i + 1).filter(temPeca).length;

  return (
    <div style={{ height: "100%", background: "#FBFCFD", padding: "16px 20px", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#14253A", letterSpacing: "-.02em" }}>Seu mês no TrendPulse</span>
        <span style={{ fontSize: 11.5, color: "#79879C" }}>agendado uma vez, publica sozinho</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
        {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d, i) => (
          <div key={i} style={{ fontSize: 9.5, fontWeight: 700, color: "#A6B0BF", textAlign: "center", paddingBottom: 3, textTransform: "uppercase", letterSpacing: ".06em" }}>{d}</div>
        ))}
        {Array.from({ length: OFFSET }).map((_, i) => <div key={`p${i}`} />)}
        {Array.from({ length: DIAS }).map((_, i) => {
          const dia = i + 1;
          const cheio = temPeca(dia);
          const src = cheio ? pecas[usadas++ % pecas.length] : null;
          return (
            <div key={dia} style={{
              aspectRatio: "1", borderRadius: 6,
              border: cheio ? "none" : "1px dashed #DCE3EC",
              background: cheio ? "#fff" : "transparent",
              overflow: "hidden", position: "relative",
              boxShadow: cheio ? "0 1px 4px rgba(20,37,58,.12)" : "none",
            }}>
              {src
                ? <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                : <span style={{ position: "absolute", top: 4, left: 5, fontSize: 9, color: "#C3CCD8" }}>{dia}</span>}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13 }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: accent, flex: "none" }} />
        <span style={{ fontSize: 11.5, color: "#5A6879" }}>{total} peças agendadas · fins de semana livres</span>
      </div>
    </div>
  );
}

/* ── Instagram: post no feed (carrossel) ──────────────────────────────────── */

/**
 * O tweet card sozinho, flutuando na página, é fraco: parece um asset, não um post. Dentro do feed
 * do Instagram ele vira o que de fato é — a peça que o seguidor vai ver ao rolar. É essa moldura
 * que prova o valor do formato, não a imagem solta.
 *
 * `midia` é um NODE, não uma URL, porque o tweet card é desenhado em CSS (reprodução do template
 * Satori) e não existe como arquivo aqui. O mesmo componente serve para qualquer peça.
 *
 * SEM CONTADOR de curtida ou comentário: número inventado é prova social fabricada. O chrome fica
 * fiel, a contagem some, e a landing rotula o aparelho como simulação.
 */
export function PostInstagram({
  midia,
  autor,
  handle,
  legenda,
  accent,
  slides = 1,
  slideAtual = 1,
}: {
  midia: React.ReactNode;
  autor: string;
  handle: string;
  legenda: string;
  accent: string;
  slides?: number;
  slideAtual?: number;
}) {
  return (
    <div style={{ height: "100%", background: "#fff", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif", overflow: "hidden" }}>
      <BarraDeStatus />

      {/* Barra do app */}
      <div style={{ padding: "4px 14px 10px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#0B0B0B", letterSpacing: "-.04em", fontFamily: "'Segoe Script', cursive, system-ui", flex: 1 }}>Instagram</span>
        <CoracaoIcone />
        <MensagemIcone />
      </div>

      {/* Cabeçalho do post */}
      <div style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 9 }}>
        {/* Anel de story em volta do avatar — detalhe que o olho reconhece na hora. */}
        <span style={{ padding: 2, borderRadius: "50%", background: "linear-gradient(45deg,#F9CE34,#EE2A7B,#6228D7)", flex: "none", display: "grid" }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: accent, border: "2px solid #fff", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>
            {autor[0]?.toUpperCase()}
          </span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0B0B0B", lineHeight: 1.2 }}>{handle}</div>
          <div style={{ fontSize: 11, color: "#737373", lineHeight: 1.2 }}>Publicado pelo TrendPulse</div>
        </div>
        <span style={{ color: "#0B0B0B", fontSize: 15, letterSpacing: 1 }}>···</span>
      </div>

      {/* Mídia + contador de slide, como no carrossel real */}
      <div style={{ position: "relative", width: "100%" }}>
        {midia}
        {slides > 1 && (
          <span style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,.62)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999 }}>
            {slideAtual}/{slides}
          </span>
        )}
      </div>

      {/* Bolinhas do carrossel */}
      {slides > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: "8px 0 2px" }}>
          {Array.from({ length: slides }).map((_, k) => (
            <span key={k} style={{ width: 5, height: 5, borderRadius: "50%", background: k === slideAtual - 1 ? "#0095F6" : "#C7C7C7" }} />
          ))}
        </div>
      )}

      {/* Barra de ações */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 13px 4px" }}>
        <CoracaoIcone /><ComentarIcone /><EnviarIcone />
        <span style={{ flex: 1 }} />
        <SalvarIcone />
      </div>

      {/* Legenda. Sem contagem de curtida: seria número inventado. */}
      <div style={{ padding: "2px 13px 0", fontSize: 12.5, lineHeight: 1.4, color: "#0B0B0B" }}>
        <span style={{ fontWeight: 600 }}>{handle}</span>{" "}
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{legenda}</span>
      </div>
      <div style={{ padding: "5px 13px 0", fontSize: 10.5, color: "#737373" }}>há 2 horas</div>

      <div style={{ flex: 1 }} />

      {/* Navegação inferior */}
      <div style={{ borderTop: "1px solid #DBDBDB", padding: "9px 22px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <CasaIcone /><LupaIcone /><ReelsIcone /><LojaIcone />
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: accent, border: "1.5px solid #0B0B0B" }} />
      </div>
    </div>
  );
}

const CoracaoIcone = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" strokeLinejoin="round"><path d="M12 20.5S3.5 15.2 3.5 9.6A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8.5 2.7c0 5.6-8.5 10.9-8.5 10.9Z" /></svg>
);
const MensagemIcone = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" strokeLinejoin="round"><path d="M21.5 2.5 2.5 9.2l7.6 3.1 3.1 7.6 8.3-17.4Z" /><line x1="10.1" y1="12.3" x2="14.5" y2="7.9" /></svg>
);
const ComentarIcone = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" strokeLinejoin="round"><path d="M21 11.6c0 4.4-4 8-9 8a10 10 0 0 1-2.7-.4L3.5 21l1.6-4.6A7.6 7.6 0 0 1 3 11.6c0-4.4 4-8 9-8s9 3.6 9 8Z" /></svg>
);
const EnviarIcone = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" strokeLinejoin="round"><path d="M21.5 2.5 2.5 9.2l7.6 3.1 3.1 7.6 8.3-17.4Z" /><line x1="10.1" y1="12.3" x2="14.5" y2="7.9" /></svg>
);
const SalvarIcone = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="1.9" strokeLinejoin="round"><polygon points="18.5 3.5 5.5 3.5 5.5 20.5 12 15.6 18.5 20.5" /></svg>
);
