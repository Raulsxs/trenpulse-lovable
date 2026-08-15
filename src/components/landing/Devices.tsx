import type { ReactNode } from "react";

/**
 * Molduras de aparelho desenhadas em CSS puro.
 *
 * POR QUE CSS E NÃO PNG: um mockup de notebook em imagem são megabytes, e o chunk inicial acabou de
 * cair de 2.892 KB para 847 KB — não faz sentido devolver isso em decoração. Em CSS a moldura fica
 * nítida em qualquer densidade de tela, aceita conteúdo React vivo dentro (a grade que re-veste ao
 * trocar de marca, por exemplo) e pesa alguns bytes.
 *
 * PROPORÇÕES: são as reais, não aproximadas. Errar o raio de canto do iPhone é exatamente o que faz
 * um mockup parecer template de apresentação — o olho não sabe nomear, mas percebe.
 *   iPhone 15/16 .... 19.5:9, raio ≈ 12% da largura
 *   MacBook ......... tela 16:10, moldura fina, base trapezoidal
 */

/* ── Celular ──────────────────────────────────────────────────────────────── */

export function Celular({
  children,
  largura = 300,
  className = "",
  sombra = true,
}: {
  children: ReactNode;
  largura?: number;
  className?: string;
  sombra?: boolean;
}) {
  const altura = Math.round(largura * (19.5 / 9));
  const raio = Math.round(largura * 0.125);
  const moldura = Math.max(8, Math.round(largura * 0.032));

  return (
    <div
      className={className}
      style={{
        width: largura,
        height: altura,
        borderRadius: raio,
        padding: moldura,
        background: "linear-gradient(150deg, #2B3240 0%, #171B23 42%, #333A49 100%)",
        boxShadow: sombra
          ? "0 42px 80px -28px rgba(12,18,28,.55), 0 0 0 1px rgba(255,255,255,.07) inset"
          : "0 0 0 1px rgba(255,255,255,.07) inset",
        position: "relative",
        flex: "none",
      }}
    >
      {/* Botões laterais: sem eles a silhueta lê como retângulo, não como aparelho. */}
      <span style={botaoLateral(largura, 0.17, 0.075, "left")} />
      <span style={botaoLateral(largura, 0.28, 0.055, "left")} />
      <span style={botaoLateral(largura, 0.355, 0.055, "left")} />
      <span style={botaoLateral(largura, 0.24, 0.11, "right")} />

      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: raio - moldura,
          overflow: "hidden",
          background: "#fff",
          position: "relative",
        }}
      >
        {/* Dynamic Island. Fica ACIMA do conteúdo, como no aparelho de verdade. */}
        <div
          style={{
            position: "absolute",
            top: Math.round(largura * 0.032),
            left: "50%",
            transform: "translateX(-50%)",
            width: Math.round(largura * 0.3),
            height: Math.round(largura * 0.088),
            borderRadius: 999,
            background: "#12151C",
            zIndex: 3,
          }}
        />
        {children}
      </div>
    </div>
  );
}

const botaoLateral = (
  largura: number,
  topPct: number,
  alturaPct: number,
  lado: "left" | "right",
): React.CSSProperties => ({
  position: "absolute",
  [lado]: -2,
  top: `${topPct * 100}%`,
  width: 3,
  height: `${alturaPct * 100}%`,
  borderRadius: 2,
  background: "linear-gradient(90deg, #3C4453, #232833)",
});

/* ── Notebook ─────────────────────────────────────────────────────────────── */

export function Notebook({
  children,
  largura = 720,
  className = "",
  aspecto = 16 / 10,
}: {
  children: ReactNode;
  largura?: number;
  className?: string;
  /** Proporção da TELA. O padrão é 16:10 (MacBook). O feed do LinkedIn é mais alto que isso e
   *  a barra de ações do post ficava cortada fora da moldura — justo o pedaço que faz a tela
   *  ler como LinkedIn. Passar 4/3 dá a altura necessária sem espremer o conteúdo. */
  aspecto?: number;
}) {
  const alturaTela = Math.round(largura / aspecto);
  const moldura = Math.max(6, Math.round(largura * 0.011));

  return (
    <div className={className} style={{ width: largura, flex: "none" }}>
      <div
        style={{
          width: "100%",
          height: alturaTela + moldura * 2,
          borderRadius: Math.round(largura * 0.018),
          padding: moldura,
          paddingBottom: moldura * 1.6,
          background: "linear-gradient(160deg, #2E3542 0%, #1A1E27 60%, #2A3040 100%)",
          boxShadow: "0 38px 70px -30px rgba(12,18,28,.5), 0 0 0 1px rgba(255,255,255,.06) inset",
          position: "relative",
        }}
      >
        {/* Câmera. Detalhe de 4px que é a diferença entre "tela" e "notebook". */}
        <div
          style={{
            position: "absolute",
            top: moldura * 0.35,
            left: "50%",
            transform: "translateX(-50%)",
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#0B0E14",
          }}
        />
        <div
          style={{
            width: "100%",
            height: alturaTela,
            borderRadius: Math.round(largura * 0.008),
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {children}
        </div>
      </div>

      {/* Base: trapézio invertido, que é o que dá a leitura de perspectiva. */}
      <div
        style={{
          width: "104%",
          marginLeft: "-2%",
          height: Math.round(largura * 0.019),
          background: "linear-gradient(180deg, #39404F 0%, #232936 100%)",
          borderRadius: `0 0 ${Math.round(largura * 0.012)}px ${Math.round(largura * 0.012)}px`,
          clipPath: "polygon(0 0, 100% 0, 98.6% 100%, 1.4% 100%)",
          position: "relative",
        }}
      >
        {/* Recorte do trackpad na borda superior da base. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "13%",
            height: Math.max(3, Math.round(largura * 0.005)),
            borderRadius: "0 0 999px 999px",
            background: "#171B24",
          }}
        />
      </div>
    </div>
  );
}
