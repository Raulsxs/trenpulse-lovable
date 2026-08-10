/**
 * Formatos de conteúdo — FONTE ÚNICA DE VERDADE.
 *
 * POR QUE ESTE ARQUIVO EXISTE: os atalhos viviam duplicados no AgentChat e nos tutoriais da Central
 * de Ajuda. As duas listas divergiram sem ninguém perceber (a ajuda mostrava "Frase" e "Link", que
 * não existem, e escondia "Editorial" e "Tweet", que existem). Nada quebrava, nenhum teste falhava,
 * e o usuário novo procurava um botão que não estava lá.
 *
 * Quem exibe formato IMPORTA daqui. Nunca copie esta lista.
 */
import { Image as ImageIcon, LayoutGrid, Newspaper, Smartphone, MessageSquareQuote, Linkedin } from "lucide-react";

export interface ContentFormat {
  id: string;
  icon: typeof ImageIcon;
  emoji: string;          // usado onde não dá pra renderizar ícone (ex.: lista de tutoriais)
  label: string;
  cost: number;           // espelha credit_pricing; caso típico (carrossel 5 slides, editorial 4)
  template: string;       // termina em ": " → o usuário só completa o tema
  hint: string;           // o que é, em linguagem de quem nunca usou
}

export const CONTENT_FORMATS: ContentFormat[] = [
  {
    id: "post", icon: ImageIcon, emoji: "📷", label: "Post", cost: 10,
    template: "Crie um post para Instagram sobre: ",
    hint: "Uma imagem única pro feed do Instagram.",
  },
  {
    id: "carrossel", icon: LayoutGrid, emoji: "🎠", label: "Carrossel", cost: 50,
    template: "Crie um carrossel de 5 slides educativos e visualmente impactantes para Instagram sobre: ",
    hint: "Vários slides que a pessoa desliza pro lado. Bom pra ensinar passo a passo.",
  },
  {
    id: "editorial", icon: Newspaper, emoji: "📰", label: "Editorial", cost: 20,
    template: "Crie um carrossel editorial cinematográfico sobre: ",
    hint: "Carrossel com cara de revista: foto grande e manchete de impacto.",
  },
  {
    id: "story", icon: Smartphone, emoji: "📱", label: "Story", cost: 25,
    template: "Crie um story para Instagram sobre: ",
    hint: "Formato vertical que ocupa a tela toda e some em 24h.",
  },
  {
    id: "tweet", icon: MessageSquareQuote, emoji: "💬", label: "Tweet", cost: 6,
    template: "Crie um tweet card visual sobre: ",
    hint: "Card imitando um print de post do X (Twitter), com seu nome e foto. Bom pra frases.",
  },
  {
    id: "linkedin", icon: Linkedin, emoji: "💼", label: "LinkedIn", cost: 10,
    template: "Crie um post para LinkedIn sobre: ",
    hint: "Post quadrado com tom profissional, no formato que o LinkedIn favorece.",
  },
];

/** Passos do wizard de marca (/brands/new). Espelha STEPS de src/pages/BrandWizard.tsx. */
export const BRAND_WIZARD_STEPS = [
  { n: 1, label: "Nome & Logo", detail: "O nome que aparece e o logo em PNG (de preferência com fundo transparente)." },
  { n: 2, label: "Paleta & Fontes", detail: "As cores e as letras da sua identidade." },
  { n: 3, label: "Exemplos Visuais", detail: "Posts que representam seu estilo, pra IA aprender sua cara." },
  { n: 4, label: "Gerar Estilos", detail: "A IA analisa tudo e monta o guia de estilo da marca." },
];
