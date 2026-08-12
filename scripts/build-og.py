"""
Gera public/og.jpg — o cartão de compartilhamento (1200x630).

POR QUE UM SCRIPT E NÃO UM MODELO DE IMAGEM: texto de card de compartilhamento precisa ser
pixel-exato. Modelo de difusão erra letra, e este é o ativo mais visto da marca — aparece em todo
link mandado no WhatsApp, LinkedIn e DM. O que é gerado pela plataforma são as PEÇAS dentro do
card, que é o que interessa provar.

POR QUE PIL E NÃO HTML: existiu uma versão em HTML pra rasterizar no browser, mas ela foi removida
por dois motivos. O rasterizador trava quando o painel não está compondo frames, o que tornava a
regeração imprevisível; e manter HTML + script era ter DUAS fontes pro mesmo artefato, que é o tipo
de duplicata que sempre diverge. Aqui roda offline, sempre igual, sem browser.

    python scripts/build-og.py

Paleta e tipografia iguais às da landing.
"""
import os
from PIL import Image, ImageDraw, ImageFont

L, A = 1200, 630
GROUND = (247, 249, 251)
GROUND_TINT = (231, 239, 249)
NAVY = (20, 37, 58)
AZUL = (0, 89, 179)
SLATE = (68, 84, 107)
MUTED = (121, 135, 156)
TEAL = (29, 175, 163)

BOLD = "C:/Windows/Fonts/segoeuib.ttf"
REG = "C:/Windows/Fonts/segoeui.ttf"

# Três ESTILOS diferentes, não três variações do mesmo template: o card precisa provar amplitude
# num olhar só. Era o defeito da primeira versão, em que as três eram do mesmo molde de onda azul.
# Posições ABSOLUTAS na tela de 1200x630. A coluna de texto vai até x=677 (medido: o headline a
# 63px tem 603px), então nada de peça começa antes de x=700 — a versão anterior usava offset
# relativo e o headline entrava por cima da primeira peça.
PECAS = [
    ("public/showcase/gerados/exemplo_sinais_coracao.jpg", (706, 42), -7),
    ("public/showcase/gerados/estilo_dark_editorial.jpg", (930, 186), 4),
    ("public/showcase/gerados/estilo_citacao_serif.jpg", (700, 330), 2),
]
LADO = 238


def gradiente_de_fundo() -> Image.Image:
    """Radial claro no canto superior direito — mesmo efeito do CSS da landing."""
    base = Image.new("RGB", (L, A), GROUND)
    px = base.load()
    cx, cy, raio = L * 0.90, A * 0.06, L * 0.72
    for y in range(A):
        for x in range(0, L, 2):  # de 2 em 2: o gradiente é suave, ninguém vê a diferença
            d = min((((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / raio, 1.0)
            t = (1 - d) ** 2
            cor = tuple(round(GROUND[i] + (GROUND_TINT[i] - GROUND[i]) * t) for i in range(3))
            px[x, y] = cor
            if x + 1 < L:
                px[x + 1, y] = cor
    return base


def cartao(caminho: str, angulo: int) -> Image.Image:
    """Peça com cantos arredondados, borda fina e sombra, rotacionada."""
    im = Image.open(caminho).convert("RGB").resize((LADO, LADO), Image.LANCZOS)

    mask = Image.new("L", (LADO, LADO), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, LADO - 1, LADO - 1], radius=18, fill=255)
    peca = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))
    peca.paste(im, (0, 0), mask)
    ImageDraw.Draw(peca).rounded_rectangle(
        [0, 0, LADO - 1, LADO - 1], radius=18, outline=(20, 37, 58, 28), width=1
    )

    # Sombra: a própria silhueta desfocada, deslocada pra baixo.
    from PIL import ImageFilter
    pad = 40
    tela = Image.new("RGBA", (LADO + pad * 2, LADO + pad * 2), (0, 0, 0, 0))
    sombra = Image.new("RGBA", (LADO + pad * 2, LADO + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle(
        [pad, pad + 16, pad + LADO, pad + LADO + 16], radius=18, fill=(20, 37, 58, 44)
    )
    sombra = sombra.filter(ImageFilter.GaussianBlur(16))
    tela.alpha_composite(sombra)
    tela.alpha_composite(peca, (pad, pad))
    return tela.rotate(angulo, resample=Image.BICUBIC, expand=True)


def main() -> None:
    img = gradiente_de_fundo().convert("RGBA")
    d = ImageDraw.Draw(img)

    # Filete da marca no topo: azul primário virando o teal do accent.
    for x in range(L):
        t = max(0.0, (x / L - 0.52) / 0.48)
        d.line([(x, 0), (x, 5)], fill=tuple(round(AZUL[i] + (TEAL[i] - AZUL[i]) * t) for i in range(3)))

    for caminho, (x, y), ang in PECAS:
        c = cartao(caminho, ang)
        img.alpha_composite(c, (x - 40, y - 40))   # -40 compensa o padding da sombra

    f_marca = ImageFont.truetype(BOLD, 19)
    f_h1 = ImageFont.truetype(BOLD, 63)
    f_sub = ImageFont.truetype(REG, 23)
    f_dom = ImageFont.truetype(BOLD, 17)

    d.ellipse([74, 137, 86, 149], fill=AZUL)
    d.text((97, 130), "TrendPulse", font=f_marca, fill=NAVY)

    d.text((74, 190), "Sua marca postando", font=f_h1, fill=NAVY)
    d.text((74, 256), "todo dia.", font=f_h1, fill=AZUL)

    d.rounded_rectangle([74, 350, 158, 355], radius=3, fill=TEAL)

    d.text((74, 380), "Você escreve a ideia. A IA entrega o", font=f_sub, fill=SLATE)
    d.text((74, 413), "post pronto, com a sua cara.", font=f_sub, fill=SLATE)

    d.text((74, 556), "trendpulse.com.br", font=f_dom, fill=MUTED)

    saida = "public/og.jpg"
    img.convert("RGB").save(saida, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{saida}  {Image.open(saida).size}  {os.path.getsize(saida)//1024} KB")


if __name__ == "__main__":
    main()
