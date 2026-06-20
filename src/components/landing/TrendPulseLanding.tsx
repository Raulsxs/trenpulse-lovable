import { useEffect, useRef } from "react";

/**
 * Landing page da TrendPulse — port fiel do design do Claude Design (Landing.dc.html).
 * O markup é HTML/CSS autocontido (preserva o CSS exato do design); as animações
 * (reveal-on-scroll, parallax, demo do chat→tweet card) rodam via useEffect.
 * Assets em /public/landing/. CTAs (data-tp) são religados ao onSignup/scroll.
 */

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
.tp-landing *{box-sizing:border-box}
.tp-landing{background:#F7F9FB;font-family:'Inter',system-ui,sans-serif;color:#14253A;-webkit-font-smoothing:antialiased;position:relative;overflow-x:hidden}
.tp-landing ::selection{background:rgba(29,175,163,.22)}
@keyframes tpFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
@keyframes tpFloat2{0%,100%{transform:translateY(0)}50%{transform:translateY(10px)}}
@keyframes tpPop{0%{opacity:0;transform:translateY(12px) scale(.96)}100%{opacity:1;transform:none}}
@keyframes tpDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
@keyframes tpBlink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes tpMarquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes tpAurora{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(24px,-18px) scale(1.08)}}
.tp-landing [data-reveal]{opacity:0;transform:translateY(28px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1)}
.tp-landing [data-tp]{cursor:pointer}
.tp-landing a[href]{cursor:pointer}
@media (prefers-reduced-motion: reduce){.tp-landing [data-reveal]{opacity:1!important;transform:none!important}.tp-landing *{animation:none!important}}
@media (max-width:920px){
  .tp-hero-grid{grid-template-columns:1fr!important;gap:40px!important}
  .tp-hero-h1{font-size:42px!important}
  .tp-3col{grid-template-columns:1fr!important}
  .tp-nav-links{display:none!important}
}
`;

// Galeria de exemplos (marquee da seção #exemplos). Mistura os posts próprios (/landing)
// com as amostras dos modelos (/showcase) — variedade real pra escolher. O loop é sem
// emenda porque o conteúdo é duplicado (a animação tpMarquee anda de 0 a -50%).
const GALLERY: { src: string; cap: string; pos?: string }[] = [
  { src: "/landing/post_g7.png", cap: "G7: IA americana vs soberania europeia — o que muda pro seu negócio." },
  { src: "/landing/tweet_gestao.png", cap: "Retenção +5% eleva o lucro em até 95% — você está deixando dinheiro na mesa.", pos: "top" },
  { src: "/landing/post_copa.png", cap: "IA vai transformar a Copa 2026: bola com sensores e impedimento automático." },
  { src: "/landing/post_midjourney.png", cap: "Midjourney lança scanner corporal por ultrassom — estreia em 2027." },
  { src: "/showcase/gpt_post.jpg", cap: "5 sinais de hipertensão que seus pacientes ignoram." },
  { src: "/showcase/seedream_post.jpg", cap: "3 hábitos que destravam mais energia no seu dia." },
  { src: "/showcase/ideogram_post.jpg", cap: "O mito da motivação que trava o seu crescimento." },
  { src: "/showcase/recraft_post.jpg", cap: "Autoridade nas redes sem precisar aparecer." },
  { src: "/showcase/imagen_post.jpg", cap: "Do briefing ao post publicável em segundos." },
  { src: "/showcase/flux_post.jpg", cap: "Fotorrealismo premium pra valorizar a sua marca." },
  { src: "/showcase/nano_story.jpg", cap: "Story 9:16 pronto pra publicar — sem editor." },
  { src: "/showcase/reve_post.jpg", cap: "Tipografia impecável em português, do título ao CTA." },
];
const galleryCard = (g: { src: string; cap: string; pos?: string }) =>
  `<div style="flex:none;width:248px;background:#fbfcfd;border:1px solid rgba(20,37,58,.09);border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(20,37,58,.06)"><img src="${g.src}" alt="Exemplo gerado na plataforma" loading="lazy" style="width:248px;height:248px;object-fit:cover;${g.pos ? `object-position:${g.pos};` : ""}display:block"><div style="padding:13px 14px"><div style="font-size:12.5px;color:#44546B;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${g.cap}</div></div></div>`;
const GALLERY_HTML = GALLERY.map(galleryCard).join("");

const BODY = `
<header style="position:fixed;top:0;left:0;right:0;z-index:50;backdrop-filter:blur(14px);background:rgba(247,249,251,.78);border-bottom:1px solid rgba(20,37,58,.08)">
  <div style="max-width:1200px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px">
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#0059B3,#1DAFA3);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,89,179,.28)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"></polyline><polyline points="15 7 21 7 21 13"></polyline></svg>
      </div>
      <span style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:20px;letter-spacing:-.02em">TrendPulse</span>
    </div>
    <nav class="tp-nav-links" style="display:flex;align-items:center;gap:28px;font-size:14px;color:#44546B;font-weight:500">
      <a href="#como" style="color:inherit;text-decoration:none">Como funciona</a>
      <a href="#recursos" style="color:inherit;text-decoration:none">Recursos</a>
      <a href="#exemplos" style="color:inherit;text-decoration:none">Exemplos</a>
      <a href="#precos" style="color:inherit;text-decoration:none">Preços</a>
    </nav>
    <div style="display:flex;align-items:center;gap:10px">
      <button data-tp="login" style="border:none;background:transparent;font-family:inherit;font-size:14px;font-weight:600;color:#44546B;cursor:pointer;padding:9px 12px">Entrar</button>
      <button data-tp="signup" style="border:none;font-family:inherit;font-size:14px;font-weight:600;color:#fff;cursor:pointer;padding:10px 18px;border-radius:10px;background:linear-gradient(135deg,#0059B3,#1DAFA3);box-shadow:0 6px 16px rgba(0,89,179,.26);display:flex;align-items:center;gap:7px">Começar grátis
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      </button>
    </div>
  </div>
</header>

<section style="position:relative;padding:148px 24px 88px">
  <div style="position:absolute;top:-40px;left:-80px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(0,89,179,.20),transparent 68%);filter:blur(20px);animation:tpAurora 14s ease-in-out infinite;pointer-events:none"></div>
  <div style="position:absolute;top:60px;right:-60px;width:480px;height:480px;border-radius:50%;background:radial-gradient(circle,rgba(29,175,163,.22),transparent 68%);filter:blur(20px);animation:tpAurora 17s ease-in-out infinite;pointer-events:none"></div>
  <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(20,37,58,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(20,37,58,.035) 1px,transparent 1px);background-size:46px 46px;mask-image:radial-gradient(circle at 50% 30%,#000,transparent 72%);-webkit-mask-image:radial-gradient(circle at 50% 30%,#000,transparent 72%);pointer-events:none"></div>

  <div class="tp-hero-grid" style="position:relative;max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1.04fr .96fr;gap:56px;align-items:center">
    <div>
      <div data-reveal style="display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid rgba(20,37,58,.1);box-shadow:0 2px 8px rgba(20,37,58,.05);color:#0059B3;padding:7px 14px;border-radius:999px;font-size:13px;font-weight:600;margin-bottom:26px">
        <span style="width:7px;height:7px;border-radius:50%;background:#1DAFA3;box-shadow:0 0 0 3px rgba(29,175,163,.2)"></span>
        Feito para coaches e consultores
      </div>
      <h1 class="tp-hero-h1" data-reveal data-delay="80" style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:62px;line-height:1.04;letter-spacing:-.03em;margin:0 0 22px">
        Vire referência <span style="color:transparent;background:linear-gradient(120deg,#0059B3,#1DAFA3);-webkit-background-clip:text;background-clip:text">sem virar refém</span> do conteúdo.
      </h1>
      <p data-reveal data-delay="160" style="font-size:19px;line-height:1.6;color:#44546B;max-width:520px;margin:0 0 32px">
        Diga o tema, cole um link ou escreva uma frase. Em segundos o TrendPulse cria posts, carrosséis e stories com a <strong style="color:#14253A;font-weight:600">sua</strong> identidade — prontos para publicar.
      </p>
      <div data-reveal data-delay="240" style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:26px">
        <button data-tp="signup" style="border:none;font-family:inherit;font-size:16px;font-weight:700;color:#fff;cursor:pointer;padding:15px 26px;border-radius:13px;background:linear-gradient(135deg,#0059B3,#1DAFA3);box-shadow:0 12px 28px rgba(0,89,179,.3);display:flex;align-items:center;gap:9px">
          Criar conta grátis
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
        <button data-tp="examples" style="font-family:inherit;font-size:16px;font-weight:600;color:#14253A;cursor:pointer;padding:15px 24px;border-radius:13px;background:#fff;border:1px solid rgba(20,37,58,.14)">Ver exemplos</button>
      </div>
      <div data-reveal data-delay="320" style="display:flex;align-items:center;gap:14px;font-size:14px;color:#79879C">
        <div style="display:flex">
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#2C7FD6,#0059B3);border:2px solid #F7F9FB"></div>
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#1DAFA3,#13897f);border:2px solid #F7F9FB;margin-left:-9px"></div>
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#6c8cff,#2C7FD6);border:2px solid #F7F9FB;margin-left:-9px"></div>
        </div>
        <span><strong style="color:#14253A;font-weight:600">5 gerações grátis</strong> · sem cartão de crédito</span>
      </div>
    </div>

    <div data-reveal data-delay="200" style="position:relative">
      <div data-parallax="0.04" style="position:relative;z-index:2;background:#fff;border:1px solid rgba(20,37,58,.1);border-radius:20px;box-shadow:0 30px 70px -24px rgba(20,37,58,.32);overflow:hidden">
        <div style="display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid rgba(20,37,58,.08);background:#fbfcfd">
          <span style="width:10px;height:10px;border-radius:50%;background:#ff5f57"></span>
          <span style="width:10px;height:10px;border-radius:50%;background:#febc2e"></span>
          <span style="width:10px;height:10px;border-radius:50%;background:#28c840"></span>
          <span style="margin-left:8px;font-size:12.5px;font-weight:600;color:#79879C">TrendPulse · Estúdio</span>
        </div>
        <div style="padding:18px;min-height:360px;display:flex;flex-direction:column;gap:12px">
          <div id="tpUser" style="align-self:flex-end;max-width:80%;background:linear-gradient(135deg,#0059B3,#1f6fc0);color:#fff;padding:10px 14px;border-radius:14px 14px 4px 14px;font-size:14px;font-weight:500;opacity:0;transform:translateY(8px);transition:opacity .35s,transform .35s">Crie um tweet card sobre retenção de clientes</div>
          <div id="tpThinking" style="align-self:flex-start;background:#eef2f6;border-radius:14px 14px 14px 4px;padding:12px 14px;display:none;gap:5px">
            <span style="width:7px;height:7px;border-radius:50%;background:#79879C;animation:tpDot 1.2s infinite"></span>
            <span style="width:7px;height:7px;border-radius:50%;background:#79879C;animation:tpDot 1.2s infinite .2s"></span>
            <span style="width:7px;height:7px;border-radius:50%;background:#79879C;animation:tpDot 1.2s infinite .4s"></span>
          </div>
          <div id="tpResult" style="align-self:flex-start;display:none;flex-direction:column;width:272px;max-width:100%;background:#fff;border:1px solid rgba(0,89,179,.18);border-radius:14px;overflow:hidden;box-shadow:0 14px 30px -12px rgba(20,37,58,.3)">
            <div style="position:relative">
              <img src="/landing/tweet_gestao.png" alt="Tweet card gerado pela IA" style="width:100%;display:block">
              <span style="position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#fff;background:rgba(20,37,58,.82);padding:5px 10px;border-radius:999px;box-shadow:0 2px 8px rgba(20,37,58,.25)">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
                Tweet card · X
              </span>
            </div>
            <div style="padding:11px 13px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid rgba(20,37,58,.07)">
              <div style="font-size:11.5px;color:#79879C;font-weight:500">Com sua marca · pronto</div>
              <div style="display:flex;gap:6px">
                <span style="font-size:11px;font-weight:600;color:#15803D;background:#e8f5ee;padding:4px 9px;border-radius:6px">Baixar</span>
                <span style="font-size:11px;font-weight:600;color:#A05E03;background:#FFF4E0;border:1px solid rgba(160,94,3,.25);padding:4px 9px;border-radius:6px">Refazer · 4 cr</span>
              </div>
            </div>
          </div>
        </div>
        <div style="border-top:1px solid rgba(20,37,58,.08);padding:11px 14px;display:flex;align-items:center;gap:10px">
          <div style="flex:1;background:#f1f4f7;border-radius:11px;padding:11px 14px;font-size:14px;color:#14253A;min-height:42px;display:flex;align-items:center">
            <span id="tpInput"></span><span style="display:inline-block;width:2px;height:17px;background:#0059B3;margin-left:1px;animation:tpBlink 1s step-end infinite"></span>
          </div>
          <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#0059B3,#1DAFA3);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 6px 14px rgba(0,89,179,.3)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </div>
        </div>
      </div>
      <div style="position:absolute;z-index:3;top:-26px;right:-22px;width:84px;height:84px;border-radius:18px;overflow:hidden;border:3px solid #fff;box-shadow:0 16px 36px -8px rgba(20,37,58,.4);animation:tpFloat 6s ease-in-out infinite">
        <img src="/landing/foto_pessoal.png" alt="Sua marca" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div style="position:absolute;z-index:3;bottom:-20px;left:-26px;background:#fff;border:1px solid rgba(20,37,58,.1);border-radius:13px;padding:11px 15px;box-shadow:0 16px 34px -10px rgba(20,37,58,.3);display:flex;align-items:center;gap:10px;animation:tpFloat2 7s ease-in-out infinite">
        <div style="width:32px;height:32px;border-radius:9px;background:#e8f5ee;display:flex;align-items:center;justify-content:center">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div><div style="font-size:13px;font-weight:700;color:#14253A">Publicado</div><div style="font-size:11px;color:#79879C">em 9 redes sociais</div></div>
      </div>
    </div>
  </div>
</section>

<section style="border-top:1px solid rgba(20,37,58,.07);border-bottom:1px solid rgba(20,37,58,.07);background:#fff">
  <div data-reveal style="max-width:1100px;margin:0 auto;padding:26px 24px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px">
    <div style="display:flex;align-items:center;gap:11px;font-size:13.5px;color:#79879C;font-weight:500">
      <div style="display:flex">
        <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#2C7FD6,#0059B3);border:2px solid #fff"></div>
        <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#1DAFA3,#13897f);border:2px solid #fff;margin-left:-9px"></div>
        <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#6c8cff,#2C7FD6);border:2px solid #fff;margin-left:-9px"></div>
      </div>
      Coaches e consultores publicando todos os dias
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:34px">
      <div><div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:19px;color:#14253A">9 redes</div><div style="font-size:12.5px;color:#79879C">Publicação direta</div></div>
      <div><div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:19px;color:#14253A">&lt; 30s</div><div style="font-size:12.5px;color:#79879C">por conteúdo</div></div>
      <div><div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:19px;color:#14253A">3 formatos</div><div style="font-size:12.5px;color:#79879C">Post · carrossel · story</div></div>
      <div><div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:19px;color:#14253A">Sua marca</div><div style="font-size:12.5px;color:#79879C">Identidade preservada</div></div>
    </div>
  </div>
</section>

<section id="como" style="padding:96px 24px 80px">
  <div style="max-width:1080px;margin:0 auto">
    <div data-reveal style="text-align:center;margin-bottom:56px">
      <div style="font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#1DAFA3;margin-bottom:12px">Como funciona</div>
      <h2 style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:40px;letter-spacing:-.025em;margin:0 0 14px">Da ideia ao post em 3 passos</h2>
      <p style="font-size:17px;color:#44546B;max-width:560px;margin:0 auto">Sem briefing, sem designer, sem template em branco. Você diz o tema — a IA entrega pronto.</p>
    </div>
    <div class="tp-3col" style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;position:relative">
      <div data-reveal data-delay="0" style="position:relative">
        <div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:54px;line-height:1;color:transparent;background:linear-gradient(135deg,#0059B3,#1DAFA3);-webkit-background-clip:text;background-clip:text;opacity:.22;margin-bottom:6px">01</div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:20px;margin:0 0 8px">Escolha o formato</h3>
        <p style="font-size:14.5px;color:#44546B;line-height:1.55;margin:0 0 16px">Post, carrossel ou story — para Instagram ou LinkedIn.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span style="font-size:12.5px;font-weight:600;color:#0059B3;background:rgba(0,89,179,.08);border:1px solid rgba(0,89,179,.16);padding:6px 12px;border-radius:9px">Post</span>
          <span style="font-size:12.5px;font-weight:600;color:#0059B3;background:rgba(0,89,179,.08);border:1px solid rgba(0,89,179,.16);padding:6px 12px;border-radius:9px">Carrossel</span>
          <span style="font-size:12.5px;font-weight:600;color:#0059B3;background:rgba(0,89,179,.08);border:1px solid rgba(0,89,179,.16);padding:6px 12px;border-radius:9px">Story</span>
        </div>
      </div>
      <div data-reveal data-delay="120" style="position:relative">
        <div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:54px;line-height:1;color:transparent;background:linear-gradient(135deg,#0059B3,#1DAFA3);-webkit-background-clip:text;background-clip:text;opacity:.22;margin-bottom:6px">02</div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:20px;margin:0 0 8px">Diga o que quer</h3>
        <p style="font-size:14.5px;color:#44546B;line-height:1.55;margin:0 0 16px">Cole um link, escreva uma frase ou peça sugestões. A IA cuida do resto.</p>
        <div style="background:#fff;border:1px solid rgba(20,37,58,.1);border-radius:11px;padding:11px 13px;font-size:13.5px;box-shadow:0 2px 8px rgba(20,37,58,.04)"><span style="color:#79879C">Ex: </span><span style="color:#14253A;font-weight:500">A disciplina que separa quem sonha de quem realiza</span></div>
      </div>
      <div data-reveal data-delay="240" style="position:relative">
        <div style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:54px;line-height:1;color:transparent;background:linear-gradient(135deg,#0059B3,#1DAFA3);-webkit-background-clip:text;background-clip:text;opacity:.22;margin-bottom:6px">03</div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:20px;margin:0 0 8px">Publique</h3>
        <p style="font-size:14.5px;color:#44546B;line-height:1.55;margin:0 0 16px">Revise, ajuste se quiser e publique direto — ou agende no calendário.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span style="font-size:12.5px;font-weight:600;color:#fff;background:linear-gradient(135deg,#0059B3,#1DAFA3);padding:7px 13px;border-radius:9px">Publicar agora</span>
          <span style="font-size:12.5px;font-weight:600;color:#14253A;background:#fff;border:1px solid rgba(20,37,58,.14);padding:7px 13px;border-radius:9px">Agendar</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section id="recursos" style="padding:88px 24px;background:#fff;border-top:1px solid rgba(20,37,58,.07)">
  <div style="max-width:1140px;margin:0 auto">
    <div data-reveal style="text-align:center;margin-bottom:54px">
      <div style="font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#1DAFA3;margin-bottom:12px">Recursos</div>
      <h2 style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:40px;letter-spacing:-.025em;margin:0 0 14px">Tudo para manter sua autoridade no ar</h2>
      <p style="font-size:17px;color:#44546B;max-width:560px;margin:0 auto">As ferramentas que normalmente exigem uma agência inteira — num só lugar.</p>
    </div>
    <div class="tp-3col" style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">
      <div data-reveal data-delay="0" style="background:#fbfcfd;border:1px solid rgba(20,37,58,.09);border-radius:16px;padding:24px">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(0,89,179,.1);display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0059B3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:17.5px;margin:0 0 7px">Chat inteligente</h3>
        <p style="font-size:14px;color:#44546B;line-height:1.55;margin:0">Digite um tema, cole um link ou peça sugestões. A IA entende e gera o conteúdo ideal.</p>
      </div>
      <div data-reveal data-delay="80" style="background:#fbfcfd;border:1px solid rgba(20,37,58,.09);border-radius:16px;padding:24px">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(29,175,163,.12);display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#13897f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"></circle><circle cx="6.5" cy="12" r="2.5"></circle><circle cx="17" cy="14" r="2.5"></circle><path d="M11 7 9 11M16 12l-7 1"></path></svg>
        </div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:17.5px;margin:0 0 7px">Sua identidade visual</h3>
        <p style="font-size:14px;color:#44546B;line-height:1.55;margin:0">Suba exemplos da sua marca e a IA replica cores, tipografia e estilo em cada post.</p>
      </div>
      <div data-reveal data-delay="160" style="background:#fbfcfd;border:1px solid rgba(20,37,58,.09);border-radius:16px;padding:24px">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(0,89,179,.1);display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0059B3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        </div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:17.5px;margin:0 0 7px">Geração instantânea</h3>
        <p style="font-size:14px;color:#44546B;line-height:1.55;margin:0">Posts, carrosséis, stories e documentos prontos em segundos com IA.</p>
      </div>
      <div data-reveal data-delay="0" style="background:#fbfcfd;border:1px solid rgba(20,37,58,.09);border-radius:16px;padding:24px">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(29,175,163,.12);display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#13897f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>
        </div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:17.5px;margin:0 0 7px">Calendário editorial</h3>
        <p style="font-size:14px;color:#44546B;line-height:1.55;margin:0">Agende publicações e organize seu calendário sem sair da plataforma.</p>
      </div>
      <div data-reveal data-delay="80" style="background:#fbfcfd;border:1px solid rgba(20,37,58,.09);border-radius:16px;padding:24px">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(0,89,179,.1);display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0059B3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"></path></svg>
        </div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:17.5px;margin:0 0 7px">Publicação em 9 redes</h3>
        <p style="font-size:14px;color:#44546B;line-height:1.55;margin:0">Instagram, LinkedIn, TikTok, X e mais — com um clique. Sem baixar, sem complicação.</p>
      </div>
      <div data-reveal data-delay="160" style="background:#fbfcfd;border:1px solid rgba(20,37,58,.09);border-radius:16px;padding:24px">
        <div style="width:46px;height:46px;border-radius:12px;background:rgba(29,175,163,.12);display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#13897f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l4-1 11-11a2.8 2.8 0 0 0-4-4L3 16z"></path><path d="M14 6l4 4"></path></svg>
        </div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:17.5px;margin:0 0 7px">Frases & citações</h3>
        <p style="font-size:14px;color:#44546B;line-height:1.55;margin:0">Escreva sua frase e a IA cria uma arte elegante com aspas, autor e design profissional.</p>
      </div>
    </div>
  </div>
</section>

<section style="padding:88px 24px">
  <div style="max-width:1100px;margin:0 auto">
    <div data-reveal style="text-align:center;margin-bottom:54px">
      <div style="font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#1DAFA3;margin-bottom:12px">Para quem é</div>
      <h2 style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:40px;letter-spacing:-.025em;margin:0 0 14px">Feito para quem vende a própria expertise</h2>
      <p style="font-size:17px;color:#44546B;max-width:560px;margin:0 auto">Sua autoridade cresce com presença constante. O TrendPulse mantém o feed vivo enquanto você atende.</p>
    </div>
    <div class="tp-3col" style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">
      <div data-reveal data-delay="0" style="background:#fff;border:1px solid rgba(20,37,58,.09);border-radius:18px;padding:28px;box-shadow:0 1px 3px rgba(20,37,58,.05)">
        <div style="width:48px;height:48px;border-radius:13px;background:linear-gradient(135deg,#0059B3,#2C7FD6);display:flex;align-items:center;justify-content:center;margin-bottom:18px">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path></svg>
        </div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:19px;margin:0 0 14px">Coaches</h3>
        <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px">
          <li style="display:flex;gap:9px;font-size:14px;color:#44546B;line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Frases de impacto com design elegante</li>
          <li style="display:flex;gap:9px;font-size:14px;color:#44546B;line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Stories diários sem travar a rotina</li>
          <li style="display:flex;gap:9px;font-size:14px;color:#44546B;line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Carrosséis de método e mindset</li>
        </ul>
      </div>
      <div data-reveal data-delay="120" style="background:linear-gradient(160deg,#0b2138,#13344f);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:28px;box-shadow:0 24px 48px -22px rgba(11,33,56,.6);position:relative;overflow:hidden">
        <div style="position:absolute;top:-30px;right:-30px;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,rgba(29,175,163,.4),transparent 70%);filter:blur(8px)"></div>
        <div style="position:relative">
          <div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1DAFA3;background:rgba(29,175,163,.14);padding:5px 11px;border-radius:999px;margin-bottom:16px">Mais comum</div>
          <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:19px;margin:0 0 14px;color:#fff">Consultores</h3>
          <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px">
            <li style="display:flex;gap:9px;font-size:14px;color:rgba(255,255,255,.78);line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Documentos LinkedIn sobre frameworks</li>
            <li style="display:flex;gap:9px;font-size:14px;color:rgba(255,255,255,.78);line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Posts a partir de notícias do setor</li>
            <li style="display:flex;gap:9px;font-size:14px;color:rgba(255,255,255,.78);line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Conteúdo que gera reuniões</li>
          </ul>
        </div>
      </div>
      <div data-reveal data-delay="240" style="background:#fff;border:1px solid rgba(20,37,58,.09);border-radius:18px;padding:28px;box-shadow:0 1px 3px rgba(20,37,58,.05)">
        <div style="width:48px;height:48px;border-radius:13px;background:linear-gradient(135deg,#1DAFA3,#13897f);display:flex;align-items:center;justify-content:center;margin-bottom:18px">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.5 6.5H21l-5 4 2 7-6-4.2L6 19.5l2-7-5-4h6.5z"></path></svg>
        </div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:19px;margin:0 0 14px">Mentores & especialistas</h3>
        <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px">
          <li style="display:flex;gap:9px;font-size:14px;color:#44546B;line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Dicas rápidas para o feed</li>
          <li style="display:flex;gap:9px;font-size:14px;color:#44546B;line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Bastidores e provas de resultado</li>
          <li style="display:flex;gap:9px;font-size:14px;color:#44546B;line-height:1.5"><span style="color:#1DAFA3;font-weight:700">›</span>Lançamentos com calendário pronto</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section id="exemplos" style="padding:88px 0;background:#fff;border-top:1px solid rgba(20,37,58,.07);overflow:hidden">
  <div data-reveal style="text-align:center;margin-bottom:48px;padding:0 24px">
    <div style="font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#1DAFA3;margin-bottom:12px">Exemplos</div>
    <h2 style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:40px;letter-spacing:-.025em;margin:0 0 14px">Conteúdos gerados na plataforma</h2>
    <p style="font-size:17px;color:#44546B;max-width:560px;margin:0 auto">Saídas reais — prontas para publicar, com legenda e formato corretos.</p>
  </div>
  <div data-reveal style="position:relative">
    <div style="position:absolute;left:0;top:0;bottom:0;width:90px;z-index:2;background:linear-gradient(90deg,#fff,transparent);pointer-events:none"></div>
    <div style="position:absolute;right:0;top:0;bottom:0;width:90px;z-index:2;background:linear-gradient(270deg,#fff,transparent);pointer-events:none"></div>
    <div style="display:flex;gap:18px;width:max-content;animation:tpMarquee 90s linear infinite;padding:0 9px">${GALLERY_HTML}${GALLERY_HTML}</div>
  </div>
</section>

<section id="precos" style="padding:88px 24px">
  <div style="max-width:1040px;margin:0 auto">
    <div data-reveal style="text-align:center;margin-bottom:24px">
      <div style="font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#1DAFA3;margin-bottom:12px">Preços</div>
      <h2 style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:40px;letter-spacing:-.025em;margin:0 0 14px">Sem mensalidade, sem surpresa</h2>
      <p style="font-size:17px;color:#44546B;max-width:540px;margin:0 auto 18px">Você compra créditos e usa quando quiser. Eles <strong style="color:#14253A">não expiram</strong>.</p>
      <span style="display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:#0059B3;background:rgba(0,89,179,.08);padding:8px 16px;border-radius:999px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0059B3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
        Crie a conta e ganhe 50 créditos grátis — sem cartão
      </span>
    </div>
    <div class="tp-3col" style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start;margin-top:34px">
      <div data-reveal data-delay="0" style="background:#fff;border:1px solid rgba(20,37,58,.1);border-radius:18px;padding:26px;box-shadow:0 1px 3px rgba(20,37,58,.05)">
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:18px;margin:0 0 3px">Inicial</h3>
        <p style="font-size:13px;color:#79879C;margin:0 0 18px">Pra começar a publicar</p>
        <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:6px"><span style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:38px">R$50</span></div>
        <div style="margin-bottom:20px"><span style="font-size:12.5px;font-weight:700;color:#A05E03;background:#FFF4E0;border:1px solid rgba(160,94,3,.25);padding:5px 11px;border-radius:8px;font-variant-numeric:tabular-nums">500 créditos</span></div>
        <ul style="list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:11px">
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>≈ 62 posts com imagem</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>ou ≈ 125 slides editoriais</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>Todos os formatos liberados</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>Publicação e agendamento em 9 redes</li>
        </ul>
        <button data-tp="signup" style="width:100%;border:1px solid rgba(20,37,58,.16);background:#fff;font-family:inherit;font-size:14.5px;font-weight:600;color:#14253A;padding:12px;border-radius:11px;cursor:pointer">Comprar créditos</button>
      </div>
      <div data-reveal data-delay="120" style="position:relative;background:#fff;border:2px solid #0059B3;border-radius:18px;padding:26px;box-shadow:0 24px 50px -22px rgba(0,89,179,.4)">
        <div style="position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#0059B3,#1DAFA3);color:#fff;font-size:11.5px;font-weight:700;letter-spacing:.04em;padding:5px 14px;border-radius:999px;white-space:nowrap">Mais popular</div>
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:18px;margin:0 0 3px">Popular</h3>
        <p style="font-size:13px;color:#79879C;margin:0 0 18px">4 meses de post diário</p>
        <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:6px"><span style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:38px">R$100</span></div>
        <div style="margin-bottom:20px"><span style="font-size:12.5px;font-weight:700;color:#A05E03;background:#FFF4E0;border:1px solid rgba(160,94,3,.25);padding:5px 11px;border-radius:8px;font-variant-numeric:tabular-nums">1.050 créditos · +5% bônus</span></div>
        <ul style="list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:11px">
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>≈ 131 posts com imagem</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>ou ≈ 26 carrosséis completos</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>Todos os formatos liberados</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>Publicação e agendamento em 9 redes</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>Legendas bilíngues</li>
        </ul>
        <button data-tp="signup" style="width:100%;border:none;background:linear-gradient(135deg,#0059B3,#1DAFA3);font-family:inherit;font-size:14.5px;font-weight:700;color:#fff;padding:13px;border-radius:11px;cursor:pointer;box-shadow:0 10px 22px rgba(0,89,179,.3)">Comprar créditos</button>
      </div>
      <div data-reveal data-delay="240" style="background:#fff;border:1px solid rgba(20,37,58,.1);border-radius:18px;padding:26px;box-shadow:0 1px 3px rgba(20,37,58,.05)">
        <h3 style="font-family:'Plus Jakarta Sans';font-weight:700;font-size:18px;margin:0 0 3px">Pro</h3>
        <p style="font-size:13px;color:#79879C;margin:0 0 18px">9 meses de post diário</p>
        <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:6px"><span style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:38px">R$200</span></div>
        <div style="margin-bottom:20px"><span style="font-size:12.5px;font-weight:700;color:#A05E03;background:#FFF4E0;border:1px solid rgba(160,94,3,.25);padding:5px 11px;border-radius:8px;font-variant-numeric:tabular-nums">2.200 créditos · +10% bônus</span></div>
        <ul style="list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:11px">
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>≈ 275 posts com imagem</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>ou ≈ 55 carrosséis completos</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>Todos os formatos liberados</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>Publicação e agendamento em 9 redes</li>
          <li style="display:flex;gap:9px;font-size:13.5px;color:#14253A"><span style="color:#0059B3">✓</span>Legendas bilíngues</li>
        </ul>
        <button data-tp="signup" style="width:100%;border:1px solid rgba(20,37,58,.16);background:#fff;font-family:inherit;font-size:14.5px;font-weight:600;color:#14253A;padding:12px;border-radius:11px;cursor:pointer">Comprar créditos</button>
      </div>
    </div>
    <p data-reveal style="text-align:center;font-size:13.5px;color:#79879C;margin-top:26px">Sem mensalidade. Pague só pelo que criar. <strong style="color:#14253A">PIX na hora.</strong></p>
  </div>
</section>

<section style="padding:40px 24px 88px">
  <div data-reveal style="max-width:820px;margin:0 auto;background:#fff;border:1px solid rgba(20,37,58,.09);border-radius:22px;padding:40px;display:flex;gap:28px;align-items:center;box-shadow:0 16px 40px -22px rgba(20,37,58,.25)">
    <div style="flex:none;width:96px;height:96px;border-radius:20px;overflow:hidden;border:3px solid #fff;box-shadow:0 10px 24px -8px rgba(20,37,58,.35)">
      <img src="/landing/foto_pessoal.png" alt="Cliente" style="width:100%;height:100%;object-fit:cover">
    </div>
    <div>
      <div style="display:flex;gap:3px;margin-bottom:12px">
        <span style="color:#1DAFA3;font-size:16px">★</span><span style="color:#1DAFA3;font-size:16px">★</span><span style="color:#1DAFA3;font-size:16px">★</span><span style="color:#1DAFA3;font-size:16px">★</span><span style="color:#1DAFA3;font-size:16px">★</span>
      </div>
      <p style="font-family:'Plus Jakarta Sans';font-weight:600;font-size:21px;line-height:1.4;letter-spacing:-.01em;margin:0 0 16px;color:#14253A">"Eu publicava uma vez por semana, sem constância. Hoje meu feed não para — e levo minutos, não tardes inteiras."</p>
      <div style="font-size:14px;color:#79879C">— Depoimento de cliente · <span style="color:#9aa6b5">substitua por um real</span></div>
    </div>
  </div>
</section>

<section style="padding:0 24px 96px">
  <div data-reveal style="max-width:1040px;margin:0 auto;position:relative;border-radius:28px;overflow:hidden;background:linear-gradient(135deg,#06223c 0%,#0059B3 55%,#1DAFA3 120%);padding:72px 40px;text-align:center;box-shadow:0 30px 70px -30px rgba(0,89,179,.6)">
    <div style="position:absolute;top:-60px;right:-40px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.16),transparent 70%);animation:tpAurora 16s ease-in-out infinite"></div>
    <div style="position:relative">
      <h2 style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:42px;line-height:1.1;letter-spacing:-.025em;color:#fff;margin:0 0 16px">Seu próximo post está a 30 segundos de distância</h2>
      <p style="font-size:18px;color:rgba(255,255,255,.82);max-width:520px;margin:0 auto 30px">Crie sua conta grátis e gere seu primeiro conteúdo agora. Sem cartão de crédito.</p>
      <button data-tp="signup" style="border:none;font-family:inherit;font-size:17px;font-weight:700;color:#0059B3;background:#fff;padding:16px 32px;border-radius:14px;cursor:pointer;display:inline-flex;align-items:center;gap:10px;box-shadow:0 14px 30px rgba(0,0,0,.18)">
        Começar agora — é grátis
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0059B3" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
      </button>
    </div>
  </div>
</section>

<footer style="padding:36px 24px;border-top:1px solid rgba(20,37,58,.08);background:#fff">
  <div style="max-width:1140px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:18px">
    <div style="display:flex;align-items:center;gap:9px">
      <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#0059B3,#1DAFA3);display:flex;align-items:center;justify-content:center">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"></polyline><polyline points="15 7 21 7 21 13"></polyline></svg>
      </div>
      <span style="font-family:'Plus Jakarta Sans';font-weight:800;font-size:16px">TrendPulse</span>
    </div>
    <div style="display:flex;gap:26px;font-size:14px;color:#79879C">
      <a href="/privacy" style="color:inherit;text-decoration:none">Privacidade</a>
      <a href="#precos" style="color:inherit;text-decoration:none">Preços</a>
      <a href="#" style="color:inherit;text-decoration:none">Contato</a>
    </div>
    <p style="font-size:12.5px;color:#9aa6b5;margin:0">© 2026 TrendPulse. Todos os direitos reservados.</p>
  </div>
</footer>
`;

interface Props {
  onSignup: () => void;
  onLogin: () => void;
}

export default function TrendPulseLanding({ onSignup, onLogin }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];

    // ── CTAs ──
    const onClick = (e: Event) => {
      const t = (e.target as HTMLElement).closest("[data-tp]");
      if (!t) return;
      const action = t.getAttribute("data-tp");
      if (action === "signup") onSignup();
      else if (action === "login") onLogin();
      else if (action === "examples") {
        const el = root.querySelector("#exemplos");
        if (el) window.scrollTo({ top: (el as HTMLElement).getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
      }
    };
    root.addEventListener("click", onClick);

    // ── Smooth anchors ──
    const anchorClick = (e: Event) => {
      const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute("href")!.slice(1);
      if (!id) return;
      const el = root.querySelector("#" + CSS.escape(id));
      if (el) { e.preventDefault(); window.scrollTo({ top: (el as HTMLElement).getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" }); }
    };
    root.addEventListener("click", anchorClick);

    // ── Reveal on scroll ──
    const revealEls = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
    const parallaxEls = [...root.querySelectorAll<HTMLElement>("[data-parallax]")];
    const shown = new WeakSet<HTMLElement>();
    const reveal = (el: HTMLElement, delay: number) => {
      if (shown.has(el)) return;
      shown.add(el);
      timers.push(window.setTimeout(() => { el.style.opacity = "1"; el.style.transform = "none"; }, delay));
    };
    if (reduce) {
      revealEls.forEach((el) => { el.style.opacity = "1"; el.style.transform = "none"; });
    } else {
      const checkReveal = () => {
        const vh = window.innerHeight;
        revealEls.forEach((el) => {
          if (shown.has(el)) return;
          const r = el.getBoundingClientRect();
          if (r.top < vh * 0.92 && r.bottom > 0) reveal(el, parseInt(el.getAttribute("data-delay") || "0", 10));
        });
      };
      const parallax = () => {
        const y = window.scrollY || 0;
        parallaxEls.forEach((el) => { const s = parseFloat(el.getAttribute("data-parallax") || "0"); el.style.transform = `translate3d(0, ${(y * s).toFixed(1)}px, 0)`; });
      };
      const onScroll = () => { checkReveal(); parallax(); };
      [200, 600].forEach((t) => timers.push(window.setTimeout(checkReveal, t)));
      timers.push(window.setTimeout(() => revealEls.forEach((el) => reveal(el, 0)), 3000));
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      checkReveal();
      // cleanup will remove these:
      (root as any).__tpScroll = onScroll;
    }

    // ── Demo do chat → tweet card ──
    let typeInterval = 0;
    const runDemo = () => {
      const input = root.querySelector<HTMLElement>("#tpInput");
      const user = root.querySelector<HTMLElement>("#tpUser");
      const think = root.querySelector<HTMLElement>("#tpThinking");
      const result = root.querySelector<HTMLElement>("#tpResult");
      if (!input || !user || !think || !result) { timers.push(window.setTimeout(runDemo, 300)); return; }
      const full = "Crie um tweet card sobre retenção de clientes";
      user.textContent = full;
      if (reduce) { input.textContent = ""; user.style.opacity = "1"; user.style.transform = "none"; think.style.display = "none"; result.style.display = "flex"; return; }
      input.textContent = ""; user.style.opacity = "0"; user.style.transform = "translateY(8px)"; think.style.display = "none"; result.style.display = "none"; result.style.animation = "none";
      let i = 0;
      clearInterval(typeInterval);
      typeInterval = window.setInterval(() => {
        i++; input.textContent = full.slice(0, i);
        if (i >= full.length) {
          clearInterval(typeInterval);
          timers.push(window.setTimeout(() => { input.textContent = ""; user.style.opacity = "1"; user.style.transform = "none"; }, 500));
          timers.push(window.setTimeout(() => { think.style.display = "flex"; }, 1000));
          timers.push(window.setTimeout(() => { think.style.display = "none"; result.style.display = "flex"; result.style.animation = "tpPop .5s cubic-bezier(.16,1,.3,1) both"; }, 2700));
          timers.push(window.setTimeout(runDemo, 8200));
        }
      }, 65);
    };
    runDemo();

    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("click", anchorClick);
      const onScroll = (root as any).__tpScroll;
      if (onScroll) { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); }
      clearInterval(typeInterval);
      timers.forEach(clearTimeout);
    };
  }, [onSignup, onLogin]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      {/* min-h-screen é necessário: o index.css só libera scroll no body via
          `body:has(> #root > .min-h-screen)` — sem essa classe o body fica overflow:hidden. */}
      <div ref={rootRef} className="tp-landing min-h-screen" dangerouslySetInnerHTML={{ __html: BODY }} />
    </>
  );
}
