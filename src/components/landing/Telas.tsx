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
}: {
  pecas: string[];
  handle: string;
  nome: string;
  bio: string;
  accent: string;
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
      <div style={{ padding: "0 14px", display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <div
          style={{
            width: 78, height: 78, borderRadius: "50%", flex: "none", background: accent,
            display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 30,
            border: "2px solid #fff", boxShadow: "0 0 0 1.5px #DBDBDB",
          }}
        >
          {nome[0]?.toUpperCase()}
        </div>
        <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 0, justifyContent: "space-around" }}>
          {[["128", "publicações"], ["2.940", "seguidores"], ["312", "seguindo"]].map(([n, l]) => (
            <div key={l} style={{ textAlign: "center", minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: "#0B0B0B", lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{n}</div>
              <div style={{ fontSize: 11.5, color: "#0B0B0B", whiteSpace: "nowrap" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Nome, categoria e bio */}
      <div style={{ padding: "11px 16px 0" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0B0B0B", lineHeight: 1.35 }}>{nome}</div>
        <div style={{ fontSize: 13, color: "#737373", lineHeight: 1.35 }}>{bio}</div>
      </div>

      {/* Botões de ação */}
      <div style={{ padding: "12px 16px 0", display: "flex", gap: 6 }}>
        <div style={{ flex: 1, background: "#0095F6", color: "#fff", borderRadius: 8, padding: "7px 0", textAlign: "center", fontSize: 13, fontWeight: 600 }}>Seguir</div>
        <div style={{ flex: 1, background: "#EFEFEF", color: "#0B0B0B", borderRadius: 8, padding: "7px 0", textAlign: "center", fontSize: 13, fontWeight: 600 }}>Mensagem</div>
        <div style={{ width: 34, background: "#EFEFEF", borderRadius: 8, display: "grid", placeItems: "center" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0B0B0B" strokeWidth="2.4"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </div>

      {/* Destaques */}
      <div style={{ padding: "14px 16px 12px", display: "flex", gap: 16 }}>
        {["Antes", "Dicas", "Casos"].map((d) => (
          <div key={d} style={{ textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", border: "1.5px solid #DBDBDB", background: "#FAFAFA", display: "grid", placeItems: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${accent}1F` }} />
            </div>
            <div style={{ fontSize: 11, color: "#0B0B0B", marginTop: 4 }}>{d}</div>
          </div>
        ))}
      </div>

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
  /** Em tela estreita o LinkedIn real também derruba as colunas laterais. Sem isto o post
   *  ficava cortado ao meio pela moldura do notebook — justo o que a seção precisa mostrar. */
  compacto?: boolean;
}) {
  return (
    <div style={{ height: "100%", background: "#F4F2EE", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Barra de navegação do LinkedIn */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,.08)", padding: "0 24px", display: "flex", alignItems: "center", gap: 10, height: 44, flex: "none" }}>
        <div style={{ width: 24, height: 24, borderRadius: 4, background: "#0A66C2", color: "#fff", fontWeight: 800, fontSize: 15, display: "grid", placeItems: "center", fontFamily: "Georgia, serif", flex: "none" }}>in</div>
        <div style={{ background: "#EDF3F8", borderRadius: 4, height: 27, width: compacto ? 120 : 190, display: "flex", alignItems: "center", gap: 6, padding: "0 8px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00000099" strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
          <span style={{ fontSize: 11.5, color: "#00000066" }}>Pesquisar</span>
        </div>
        <div style={{ flex: 1 }} />
        {!compacto && ["Início", "Rede", "Vagas", "Mensagens"].map((t) => (
          <span key={t} style={{ fontSize: 11, color: "#00000099", padding: "0 8px" }}>{t}</span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 14, padding: compacto ? "12px 14px" : "14px 24px", flex: 1, minHeight: 0 }}>
        {/* Coluna esquerda: cartão de perfil. Some no compacto. */}
        {!compacto && <div style={{ width: 150, flex: "none" }}>
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", overflow: "hidden" }}>
            <div style={{ height: 38, background: `linear-gradient(120deg, ${accent}, ${accent}AA)` }} />
            <div style={{ padding: "0 12px 12px", marginTop: -22, textAlign: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: accent, border: "2px solid #fff", margin: "0 auto", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 17 }}>
                {autor[0]?.toUpperCase()}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#000000E6", marginTop: 6, lineHeight: 1.2 }}>{autor}</div>
              <div style={{ fontSize: 10.5, color: "#00000099", lineHeight: 1.3, marginTop: 2 }}>{cargo}</div>
            </div>
          </div>
        </div>}

        {/* Coluna central: o post */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,.08)", overflow: "hidden" }}>
            <div style={{ padding: "11px 13px 7px", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", flex: "none", background: accent, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 16 }}>
                {autor[0]?.toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#000000E6", lineHeight: 1.25 }}>{autor}</div>
                <div style={{ fontSize: 11, color: "#00000099", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cargo}</div>
                <div style={{ fontSize: 10.5, color: "#00000099", display: "flex", alignItems: "center", gap: 3 }}>
                  1 h ·
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00000099" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></svg>
                </div>
              </div>
              <span style={{ color: "#00000099", fontSize: 15, letterSpacing: 1, flex: "none" }}>···</span>
            </div>

            <p style={{ margin: 0, padding: "0 13px 9px", fontSize: 12.5, lineHeight: 1.45, color: "#000000E6" }}>
              {legenda} <span style={{ color: "#00000099" }}>…ver mais</span>
            </p>

            <img src={peca} alt="" loading="lazy" style={{ width: "100%", display: "block", aspectRatio: "1", objectFit: "cover" }} />

            {/* Linha de reações: os ícones do LinkedIn real, sem número.
                A contagem viria aqui — deixamos vazio de propósito, e a landing
                rotula o aparelho como simulação. */}
            <div style={{ padding: "7px 13px", display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid rgba(0,0,0,.08)" }}>
              <span style={{ width: 15, height: 15, borderRadius: "50%", background: "#378FE9", display: "grid", placeItems: "center", fontSize: 8, color: "#fff" }}>👍</span>
              <span style={{ width: 15, height: 15, borderRadius: "50%", background: "#DF704D", display: "grid", placeItems: "center", fontSize: 8, marginLeft: -5 }}>❤</span>
            </div>

            <div style={{ display: "flex", padding: "3px 5px" }}>
              {[["Gostei", "👍"], ["Comentar", "💬"], ["Compartilhar", "🔁"], ["Enviar", "➤"]].map(([a, ic]) => (
                <div key={a} style={{ flex: 1, textAlign: "center", padding: "8px 0", fontSize: 11, fontWeight: 600, color: "#00000099", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, filter: "grayscale(1)" }}>{ic}</span>{a}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
