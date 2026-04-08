import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { HelpCircle, Palette, Wand2, MessageSquare, Share2, CalendarDays, LayoutDashboard, FileText, Sparkles, Play, BookOpen } from "lucide-react";
import { HelpTutorials } from "./HelpTutorials";

interface HelpSection {
  id: string;
  icon: React.ElementType;
  title: string;
  items: { question: string; answer: string }[];
}

const HELP_SECTIONS: HelpSection[] = [
  {
    id: "brands",
    icon: Palette,
    title: "Marcas (Brand Kit)",
    items: [
      {
        question: "O que são as Marcas?",
        answer:
          "Marcas são identidades visuais que você cadastra na plataforma. Cada marca contém logo, paleta de cores, fontes, regras de estilo e exemplos visuais. Quando você gera conteúdo, a IA usa essas informações para criar posts que seguem fielmente a identidade da sua marca.",
      },
      {
        question: "Como criar uma Marca?",
        answer:
          "Vá ao Assistente IA (chat) e clique em '🎨 Nova marca' ou digite \"criar minha marca\". O assistente vai pedir o nome da marca e exemplos de posts do seu estilo — a IA analisa automaticamente cores, fontes e tom. Você também pode criar e editar marcas manualmente pelo Brand Kit no menu lateral.",
      },
      {
        question: "Posso ter mais de uma Marca?",
        answer:
          "Sim! O número de marcas depende do seu plano. No plano gratuito você pode ter 1 marca; nos planos Pro, de 2 a 10 marcas. Cada conteúdo gerado pode usar uma marca diferente.",
      },
    ],
  },
  {
    id: "generate",
    icon: Wand2,
    title: "Geração de Conteúdo",
    items: [
      {
        question: "Como gerar conteúdo com IA?",
        answer:
          "No Assistente IA (chat), cole um link de artigo ou descreva o tema do conteúdo. O assistente abre um assistente visual de criação onde você escolhe: plataforma (Instagram ou LinkedIn), formato (Post, Carrossel, Story ou Documento), de onde vem o conteúdo (link, sugestões ou escrever do zero), estilo visual e a marca. A IA gera textos e imagens automaticamente!",
      },
      {
        question: "Como funciona o assistente de criação?",
        answer:
          "Ao iniciar uma criação, um assistente visual aparece abaixo do chat guiando você nas escolhas: 1) Plataforma → 2) Formato → 3) Marca → 4) Fonte do conteúdo (link, sugestões automáticas ou escrever do zero) → 5) Estilo visual → Geração. Você pode voltar em qualquer etapa ou cancelar.",
      },
      {
        question: "Posso usar um link para gerar conteúdo?",
        answer:
          "Sim! Cole um link no chat junto ao seu pedido. Exemplo: 'crie um post sobre este artigo: https://...' O assistente extrai automaticamente o conteúdo do link e usa como base para a geração. Você também pode escolher 'Colar um link' dentro do assistente de criação.",
      },
      {
        question: "Quais formatos posso gerar?",
        answer:
          "Post único (1 slide), Carrossel (múltiplos slides, de 3 a 12), Story (formato vertical 9:16) e Documento LinkedIn (slides em formato 4:5). Cada formato tem dimensões e estilos visuais específicos.",
      },
      {
        question: "Posso editar o conteúdo depois de gerar?",
        answer:
          "Sim! Após a geração, use os botões no card de ações: 'Novo texto' para regenerar apenas o texto, 'Nova imagem' para regenerar apenas a imagem, 'Refazer tudo' para começar do zero, ou 'Studio' para editar manualmente textos e elementos visuais.",
      },
      {
        question: "O que são os estilos visuais?",
        answer:
          "Ao gerar conteúdo, você escolhe como as imagens serão criadas: 'IA — Design completo' (IA cria a imagem inteira com texto), 'IA — Ilustração' (cena fotorrealista sem texto pesado), 'Fundo de marca' (background gerado pela IA com texto sobreposto), 'Template limpo' (cores da sua marca como fundo com texto) ou 'Suas fotos' (fotos da marca como fundo).",
      },
    ],
  },
  {
    id: "chat",
    icon: MessageSquare,
    title: "Assistente IA (Chat)",
    items: [
      {
        question: "O que posso fazer no chat?",
        answer:
          "O Assistente IA é o coração da plataforma. Você pode: criar marcas, gerar conteúdos, pedir sugestões de temas, tirar dúvidas sobre marketing digital e muito mais. Cole um link, descreva um tema ou use os atalhos rápidos abaixo do chat para começar.",
      },
      {
        question: "Como usar os atalhos rápidos?",
        answer:
          "Na barra abaixo do chat há atalhos para '✨ Criar conteúdo', '📸 Criar um post', '🎠 Criar um carrossel', '📱 Criar um story', '🔗 Tenho um link' e '🎨 Nova marca'. Clique em qualquer um para iniciar o assistente de criação já com o formato pré-selecionado.",
      },
      {
        question: "Posso enviar imagens no chat?",
        answer:
          "Sim! Durante a criação de uma marca, o chat habilita o botão de imagem para você enviar exemplos do seu estilo visual. Basta clicar no ícone de imagem que aparece no campo de mensagem.",
      },
      {
        question: "O que é o modo de geração rápida (⚙️)?",
        answer:
          "Clique no ícone ⚙️ ao lado do campo de mensagem para configurar uma plataforma e marca padrão. Com isso configurado, basta descrever o tema no chat e a IA gera o conteúdo direto, sem precisar passar pelo assistente de criação.",
      },
    ],
  },
  {
    id: "social",
    icon: Share2,
    title: "Redes Sociais",
    items: [
      {
        question: "Como conectar minhas redes sociais?",
        answer:
          "Vá em 'Meu Perfil' no menu lateral e role até a seção 'Contas Conectadas'. Clique em 'Conectar' no Instagram ou LinkedIn, autorize o acesso e pronto! Depois de conectar, você pode publicar conteúdos diretamente pela plataforma.",
      },
      {
        question: "A publicação é automática?",
        answer:
          "Sim! Quando você agenda um conteúdo, a plataforma publica automaticamente na data e horário escolhidos. Você também pode publicar manualmente a qualquer momento clicando em 'Publicar agora'.",
      },
    ],
  },
  {
    id: "calendar",
    icon: CalendarDays,
    title: "Calendário Editorial",
    items: [
      {
        question: "Como agendar publicações?",
        answer:
          "Abra um conteúdo gerado (em 'Meus Conteúdos' ou direto do chat após gerar), clique em 'Agendar', escolha data e horário. O conteúdo aparecerá no Calendário Editorial e será publicado automaticamente na hora marcada.",
      },
      {
        question: "Posso reorganizar o calendário?",
        answer:
          "Sim! No Calendário você vê todos os conteúdos agendados em visão semanal. Use os filtros de marca para focar em conteúdos específicos. Você pode cancelar ou reagendar conteúdos a qualquer momento.",
      },
    ],
  },
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "Dashboard & Tendências",
    items: [
      {
        question: "O que são as Tendências?",
        answer:
          "Tendências são notícias e temas relevantes que a plataforma busca automaticamente de fontes confiáveis. Você pode gerar conteúdo a partir de qualquer tendência — a IA transforma a notícia em posts visuais prontos para publicar.",
      },
      {
        question: "Como buscar tendências?",
        answer:
          "No Dashboard, clique em 'Buscar Tendências'. A plataforma faz o scraping automático de fontes de notícias e traz os temas mais relevantes. Você pode filtrar por fonte, tema e salvar favoritos.",
      },
    ],
  },
  {
    id: "analytics",
    icon: Sparkles,
    title: "Analytics",
    items: [
      {
        question: "O que é o Analytics?",
        answer:
          "O Analytics mostra métricas e estatísticas dos seus conteúdos gerados e publicados. Acompanhe o volume de gerações, publicações e o desempenho das suas redes sociais conectadas.",
      },
    ],
  },
];

interface HelpCenterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function HelpCenterModal({ open, onOpenChange }: HelpCenterModalProps) {
  const [tab, setTab] = useState<"tutorials" | "faq">("tutorials");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <HelpCircle className="w-6 h-6 text-primary" />
            Central de Ajuda
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Tudo o que você precisa saber para usar o TrendPulse
          </p>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => setTab("tutorials")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              tab === "tutorials" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Play className="w-4 h-4" />
            Tutoriais
          </button>
          <button
            onClick={() => setTab("faq")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              tab === "faq" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Perguntas Frequentes
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          {tab === "tutorials" ? (
            <HelpTutorials />
          ) : (
            <div className="space-y-2">
              {HELP_SECTIONS.map((section) => (
                <div key={section.id} className="rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/50">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <section.icon className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  </div>
                  <Accordion type="multiple" className="px-2">
                    {section.items.map((item, idx) => (
                      <AccordionItem key={idx} value={`${section.id}-${idx}`} className="border-border/50">
                        <AccordionTrigger className="text-sm font-medium py-3 px-2 hover:no-underline">
                          {item.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground leading-relaxed px-2 pb-3">
                          {item.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Trigger button for sidebar */
export function HelpCenterTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="w-full justify-start gap-3 px-4 py-3 h-auto text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      >
        <HelpCircle className="w-5 h-5" />
        Central de Ajuda
      </Button>
      <HelpCenterModal open={open} onOpenChange={setOpen} />
    </>
  );
}
