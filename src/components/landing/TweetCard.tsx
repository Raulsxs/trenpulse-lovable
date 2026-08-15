/**
 * Tweet card — reprodução FIEL do template que o produto renderiza.
 *
 * Fonte da verdade: `buildTweetCardElement` em supabase/functions/render-slide-image/index.ts.
 * Toda medida aqui é a medida de lá dividida por 1080 (o canvas real), então o card na landing é o
 * mesmo desenho em outra escala — não uma aproximação.
 *
 * O QUE A VERSÃO ANTERIOR INVENTAVA, e por que isso importa numa página de venda: tinha logo do X no
 * canto, rodapé "14:20 · Publicado pelo TrendPulse" e um selo verificado com path de estrela
 * desenhado à mão. Nada disso existe no template. Mostrar na landing um card que o produto não
 * entrega é prometer errado — a pessoa gera e recebe outra coisa.
 *
 * DESENHADO EM CSS, não gerado por modelo de imagem: o card sai do Satori a partir de um template
 * determinístico, então CSS reproduz exatamente. Difusão erraria alinhamento e, pior, letra.
 */

/** Mesma heurística de `tweetFontSize` do renderer — Satori não mede texto em runtime. */
function corpoFs(texto: string): number {
  const n = (texto || "").length;
  if (n <= 70) return 64;
  if (n <= 140) return 54;
  if (n <= 220) return 48;
  if (n <= 280) return 42;
  return 38;
}

/** Selo verificado oficial do X — o mesmo path do VERIFIED_BADGE_SVG do renderer. */
const SeloVerificado = ({ tam }: { tam: number }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path fill="#1d9bf0" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
  </svg>
);

export function TweetCard({
  autor,
  handle,
  texto,
  accent,
  largura = 300,
  indice,
  total,
  sombra = true,
}: {
  autor: string;
  handle: string;
  /** Aceita **negrito** e linhas iniciadas por → / - / •, como o renderer. */
  texto: string;
  /** Cor do avatar sem foto. O renderer usa #1d4e89 fixo; na landing ele veste a marca demonstrada. */
  accent: string;
  largura?: number;
  /** Posição na série (1-based). O produto vende tweet card EM SÉRIE, e o contador é parte do card. */
  indice?: number;
  total?: number;
  sombra?: boolean;
}) {
  // Tudo em proporção ao canvas real de 1080px.
  const s = largura / 1080;
  const px = (n: number) => n * s;
  const fs = corpoFs(texto) * s;
  const espaco = fs * 0.26;

  // Mesma gramática de texto do renderer: **negrito**, e linha com marcador vira bullet azul.
  const linhas = (texto || "").split("\n").map((cru, li) => {
    const ehBullet = /^\s*(→|-|•|\*)\s+/.test(cru);
    const linha = cru.replace(/^\s*(→|-|•|\*)\s+/, "");
    const partes = linha.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return { li, ehBullet, partes };
  });

  return (
    <div
      style={{
        width: largura,
        // QUADRADO, como o arquivo que a pessoa recebe (canvas 1080×1080 no renderer). Com altura
        // automática cada card da série saía de um tamanho, e a landing mostrava um recorte que o
        // produto não entrega.
        aspectRatio: "1",
        background: "#fff",
        padding: px(72),
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        // O card real é uma IMAGEM quadrada de canto reto. O raio e a sombra existem só pra ele
        // pousar na página; a borda arredondada NÃO faz parte do que a pessoa recebe.
        borderRadius: sombra ? px(28) : 0,
        boxShadow: sombra ? "0 18px 44px -20px rgba(20,37,58,.42)" : "none",
        display: "flex",
        flexDirection: "column",
        flex: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: px(24) }}>
        <div
          style={{
            width: px(112), height: px(112), borderRadius: "50%", flexShrink: 0, background: accent,
            display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: px(44),
          }}
        >
          {autor[0]?.toUpperCase()}
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: px(8) }}>
            <span style={{ fontSize: px(42), fontWeight: 700, color: "#0f1419", letterSpacing: "-.01em", whiteSpace: "nowrap" }}>{autor}</span>
            <SeloVerificado tam={px(34)} />
          </div>
          <span style={{ fontSize: px(34), color: "#536471", marginTop: px(2) }}>@{handle}</span>
        </div>
      </div>

      {/* flex:1 espelha o `flexGrow: imageDataUri ? 0 : 1` do renderer: sem imagem, o corpo cresce e
          empurra o contador da série pro rodapé do card. */}
      <div style={{ marginTop: px(40), fontSize: fs, color: "#0f1419", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {linhas.map(({ li, ehBullet, partes }) => (
          <div
            key={li}
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "flex-start",
              marginTop: li === 0 ? 0 : ehBullet ? px(18) : px(10),
            }}
          >
            {/* Quadrado azul de 18px no canvas de 1080 — a fonte Inter não tem o glifo "→",
                então o renderer desenha o marcador, e aqui é a mesma medida em escala. */}
            {ehBullet && (
              <span style={{ width: px(18), height: px(18), borderRadius: px(5), background: "#1d9bf0", marginRight: px(16), marginTop: fs * 0.32, flexShrink: 0 }} />
            )}
            {partes.map((p, k) => {
              const negrito = /^\*\*[^*]+\*\*$/.test(p);
              const t = negrito ? p.slice(2, -2) : p;
              return (
                <span key={k} style={{ fontWeight: negrito ? 700 : 400, lineHeight: 1.42, marginRight: espaco, whiteSpace: "pre-wrap" }}>
                  {t}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Contador da série — existe no template quando total > 1, e é o que mostra que
          tweet card é vendido EM SÉRIE, não como card avulso. */}
      {indice && total && total > 1 && (
        <div style={{ marginTop: px(24), fontSize: px(30), color: "#536471" }}>
          {indice}/{total}
        </div>
      )}
    </div>
  );
}
