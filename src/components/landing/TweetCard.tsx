/**
 * Tweet card — o formato que o TrendPulse gera por 6 créditos e que NÃO aparecia em lugar nenhum
 * da landing. Vender um formato sem nunca mostrá-lo é o tipo de buraco que só aparece quando
 * alguém pergunta "e o tweet card?".
 *
 * DESENHADO EM CSS, não gerado por modelo de imagem, de propósito: no produto ele sai do Satori a
 * partir de um template determinístico. Reproduzir o template em CSS deixa a landing mostrando
 * exatamente o que a pessoa vai receber, em vez de uma aproximação feita por difusão — que erraria
 * o alinhamento e, pior, poderia errar uma letra.
 */

export function TweetCard({
  autor,
  handle,
  texto,
  accent,
  largura = 300,
}: {
  autor: string;
  handle: string;
  texto: string;
  accent: string;
  largura?: number;
}) {
  return (
    <div
      style={{
        width: largura,
        background: "#fff",
        border: "1px solid #E6E8EB",
        borderRadius: 16,
        padding: "18px 18px 14px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        boxShadow: "0 10px 30px -14px rgba(20,37,58,.30)",
        flex: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: "50%", flex: "none", background: accent,
            display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: 16,
          }}
        >
          {autor[0]?.toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0F1419", letterSpacing: "-.01em" }}>{autor}</span>
            {/* Selo verificado — parte do desenho do template, não uma alegação sobre ninguém. */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill={accent} aria-hidden="true">
              <path d="M12 1.5 14.6 4l3.5-.4 1 3.4 3.2 1.6-1.4 3.3 1.4 3.3-3.2 1.6-1 3.4-3.5-.4L12 22.5 9.4 20l-3.5.4-1-3.4-3.2-1.6L3.1 12 1.7 8.7l3.2-1.6 1-3.4L9.4 4 12 1.5Z" />
              <path d="m8.6 12.2 2.2 2.2 4.6-4.8" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 13.5, color: "#536471" }}>@{handle}</div>
        </div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="#0F1419" aria-hidden="true" style={{ flex: "none" }}>
          <path d="M18.9 2H22l-7 8 8.2 12H16l-5-7.3L5.2 22H2l7.5-8.6L1.6 2H9l4.6 6.7L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z" />
        </svg>
      </div>

      <p style={{ margin: 0, fontSize: 19.5, lineHeight: 1.4, color: "#0F1419", letterSpacing: "-.012em", fontWeight: 400 }}>
        {texto}
      </p>

      {/* Só hora e data. O card real do X mostra contador de visualizações aqui, mas número
          inventado numa página de venda é prova social fabricada — a mesma regra que vale para
          o resto da landing. */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 14, fontSize: 12.5, color: "#536471" }}>
        <span>14:20</span><span>·</span><span>Publicado pelo TrendPulse</span>
      </div>
    </div>
  );
}
