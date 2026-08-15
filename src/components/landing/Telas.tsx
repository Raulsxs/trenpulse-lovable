/**
 * Telas que vão DENTRO dos aparelhos (Devices.tsx).
 *
 * REGRA QUE VALE PARA TODAS: nenhum número de engajamento. Nem curtida, nem seguidor, nem
 * visualização. Número inventado numa página de venda é prova social fabricada, e corrói justamente
 * a confiança que a página está tentando construir.
 *
 * É por isso que o herói usa GRADE DE PERFIL e não feed: a grade do Instagram não tem contador
 * nenhum, então ela mostra volume e consistência sem precisar mentir. O feed teria que exibir
 * curtidas — e aí ou a gente inventa, ou fica um espaço vazio que denuncia o mockup.
 */

/* ── Instagram: grade de perfil ───────────────────────────────────────────── */

export function GradeDePerfil({
  pecas,
  handle,
  accent,
}: {
  pecas: string[];
  handle: string;
  accent: string;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
      {/* Barra de topo */}
      <div
        style={{
          paddingTop: "13%",
          paddingBottom: 10,
          paddingInline: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid #EFEFEF",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#171B23", letterSpacing: "-.01em" }}>
          {handle}
        </span>
      </div>

      {/* Cabeçalho do perfil. Onde estariam publicações/seguidores, ficam os FORMATOS —
          informação verdadeira sobre o produto no lugar de métrica inventada. */}
      <div style={{ padding: "12px 14px 10px", display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            flex: "none",
            background: accent,
            display: "grid",
            placeItems: "center",
            color: "#fff",
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          {handle[0]?.toUpperCase()}
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {["Post", "Carrossel", "Story"].map((t) => (
            <div key={t} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#171B23" }}>✓</div>
              <div style={{ fontSize: 9.5, color: "#8E8E8E" }}>{t}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", borderTop: "1px solid #EFEFEF" }}>
        <div style={{ flex: 1, padding: "7px 0", textAlign: "center", borderBottom: "1.5px solid #171B23" }}>
          <GradeIcone />
        </div>
        <div style={{ flex: 1, padding: "7px 0", textAlign: "center", opacity: 0.32 }}>
          <PessoaIcone />
        </div>
      </div>

      {/* A grade. É ela que carrega o argumento: nove peças coerentes entre si. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, background: "#fff", flex: 1, alignContent: "start" }}>
        {pecas.slice(0, 9).map((src, i) => (
          <img
            key={src + i}
            src={src}
            alt=""
            loading="lazy"
            style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }}
          />
        ))}
      </div>
    </div>
  );
}

const GradeIcone = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#171B23" strokeWidth="2" style={{ display: "inline-block" }}>
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);
const PessoaIcone = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#171B23" strokeWidth="2" style={{ display: "inline-block" }}>
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
  </svg>
);

/* ── LinkedIn: post no feed ───────────────────────────────────────────────── */

export function PostLinkedIn({
  peca,
  autor,
  cargo,
  legenda,
  accent,
}: {
  peca: string;
  autor: string;
  cargo: string;
  legenda: string;
  accent: string;
}) {
  return (
    <div style={{ height: "100%", background: "#F4F2EE", padding: "16px 0", overflow: "hidden" }}>
      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 8,
          border: "1px solid rgba(0,0,0,.08)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 14px 8px", display: "flex", gap: 9, alignItems: "flex-start" }}>
          <div
            style={{
              width: 38, height: 38, borderRadius: "50%", flex: "none", background: accent,
              display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 15,
            }}
          >
            {autor[0]?.toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#000000E6", lineHeight: 1.25 }}>{autor}</div>
            <div style={{ fontSize: 11.5, color: "#00000099", lineHeight: 1.3 }}>{cargo}</div>
            <div style={{ fontSize: 11, color: "#00000099" }}>agora</div>
          </div>
        </div>

        <p style={{ margin: 0, padding: "0 14px 11px", fontSize: 13, lineHeight: 1.45, color: "#000000E6" }}>
          {legenda}
        </p>

        <img src={peca} alt="" loading="lazy" style={{ width: "100%", display: "block", aspectRatio: "1" as never, objectFit: "cover" }} />

        {/* Barra de ações SEM contador — o LinkedIn real mostra reações aqui, e inventar
            número seria fabricar prova. Os botões sozinhos já dão a leitura de "é o LinkedIn". */}
        <div style={{ display: "flex", borderTop: "1px solid rgba(0,0,0,.08)", padding: "4px 6px" }}>
          {["Gostei", "Comentar", "Compartilhar", "Enviar"].map((a) => (
            <div key={a} style={{ flex: 1, textAlign: "center", padding: "8px 0", fontSize: 11.5, fontWeight: 600, color: "#00000099" }}>
              {a}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Calendário do produto ────────────────────────────────────────────────── */

export function CalendarioDoMes({
  pecas,
  accent,
}: {
  pecas: string[];
  accent: string;
}) {
  // Um mês genérico de 30 dias começando numa quarta. Não é um mês específico de propósito:
  // a página não deve envelhecer sozinha.
  const OFFSET = 3;
  const DIAS = 30;
  // Distribuição de post diário útil: sai peça de segunda a sexta.
  const temPeca = (dia: number) => {
    const diaSemana = (OFFSET + dia - 1) % 7;
    return diaSemana >= 1 && diaSemana <= 5;
  };

  let usadas = 0;
  return (
    <div style={{ height: "100%", background: "#FBFCFD", padding: "14px 16px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#14253A", letterSpacing: "-.015em" }}>
          Seu mês
        </span>
        <span style={{ fontSize: 11, color: "#79879C" }}>agendado uma vez, publica sozinho</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
          <div key={i} style={{ fontSize: 9.5, fontWeight: 700, color: "#A6B0BF", textAlign: "center", paddingBottom: 2 }}>
            {d}
          </div>
        ))}

        {Array.from({ length: OFFSET }).map((_, i) => <div key={`p${i}`} />)}

        {Array.from({ length: DIAS }).map((_, i) => {
          const dia = i + 1;
          const cheio = temPeca(dia);
          const src = cheio ? pecas[usadas++ % pecas.length] : null;
          return (
            <div
              key={dia}
              style={{
                aspectRatio: "1",
                borderRadius: 5,
                border: cheio ? "none" : "1px dashed #DCE3EC",
                background: cheio ? "#fff" : "transparent",
                overflow: "hidden",
                position: "relative",
                boxShadow: cheio ? "0 1px 3px rgba(20,37,58,.10)" : "none",
              }}
            >
              {src ? (
                <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <span style={{ position: "absolute", top: 3, left: 4, fontSize: 8, color: "#C3CCD8" }}>{dia}</span>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: accent, flex: "none" }} />
        <span style={{ fontSize: 10.5, color: "#5A6879" }}>22 peças agendadas · fins de semana livres</span>
      </div>
    </div>
  );
}
