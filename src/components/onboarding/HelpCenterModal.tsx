import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { HelpCircle, Palette, Wand2, MessageSquare, Share2, CalendarDays, FileText, Sparkles, Play, BookOpen, Lightbulb, Coins } from "lucide-react";
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
    title: "Marcas",
    items: [
      {
        question: "O que são as Marcas?",
        answer:
          "Marcas são identidades visuais que você cadastra na plataforma. Cada marca contém logo, paleta de cores, fontes, regras de estilo e exemplos visuais. Quando você gera conteúdo, a IA usa essas informações para criar posts que seguem fielmente a identidade da sua marca.",
      },
      {
        question: "Como criar uma Marca?",
        answer:
          "No chat, abra o seletor de marca (ao lado do campo de mensagem) e clique em '+ Criar marca'. Você também chega por 'Marcas' no menu lateral. São 4 passos: 1) Nome & Logo, 2) Paleta & Fontes, 3) Exemplos Visuais (posts que representam seu estilo) e 4) Gerar Estilos, onde a IA analisa tudo e monta o guia da marca. Dá pra parar no passo 1 e completar depois.",
      },
      {
        question: "Posso ter mais de uma Marca?",
        answer:
          "Pode, sem limite de quantidade. Crie uma para cada negócio ou linha de conteúdo, e escolha qual usar no seletor ao lado do campo de mensagem, antes de gerar.",
      },
      {
        question: "Preciso ter um logo?",
        answer:
          "Não é obrigatório, mas ajuda muito: quando a marca tem logo, ele é aplicado automaticamente em toda peça, sempre idêntico. O melhor formato é PNG com fundo transparente e marcas escuras ou coloridas (logo claro some em fundo claro).",
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
          "Escreva no chat, em português normal, o que você quer postar. Exemplo: 'crie um post sobre 5 sinais de burnout'. Não há formulário nem etapas: ele entende o pedido, cria a arte com a identidade da sua marca e escreve a legenda. Se quiser dar um empurrão, clique num atalho de formato acima do campo, que ele já preenche o começo do pedido.",
      },
      {
        question: "Preciso escrever de um jeito especial?",
        answer:
          "Não. Fale como falaria com uma pessoa. Quanto mais específico o assunto, melhor o resultado: 'post sobre os 3 erros mais comuns na primeira consulta' rende mais que 'post sobre saúde'. Se quiser uma rede específica, é só dizer ('para o LinkedIn').",
      },
      {
        question: "Posso usar um link para gerar conteúdo?",
        answer:
          "Pode. Cole o link no chat, sozinho ou junto ao pedido, e diga o formato: 'faz um carrossel sobre esse artigo: https://...'. Ele lê a página e usa como base. Alguns sites bloqueiam leitura automática (comum em revista médica e conteúdo com assinatura); quando isso acontece ele avisa, e você pode colar o texto direto no chat.",
      },
      {
        question: "Quais formatos posso gerar?",
        answer:
          "Post (imagem única pro feed), Carrossel (vários slides que a pessoa desliza), Story (vertical 9:16, ocupa a tela toda), Editorial (carrossel com cara de revista: foto grande e manchete), Tweet card (card imitando print do X, com seu nome e foto), post de LinkedIn e vídeo animado curto. Os atalhos logo acima do campo de mensagem já preenchem o pedido pra você.",
      },
      {
        question: "Posso editar o conteúdo depois de gerar?",
        answer:
          "Pode. No card do conteúdo use 'Ajustar' para pedir uma mudança no visual (texto menor, outras cores) ou 'Refazer' para gerar de novo. Se quiser mudar só a legenda, peça no chat: 'muda a legenda para...' — isso é bem mais barato, porque não regera a imagem.",
      },
      {
        question: "Como escolho a qualidade da imagem?",
        answer:
          "No seletor ao lado do campo de mensagem há três opções: Econômico (Seedream, rende mais peças pelo mesmo saldo), Padrão (GPT-Image 2, o recomendado, melhor texto em português) e Premium (Nano Banana Pro, máxima qualidade, ideal para formatos verticais). O custo em créditos muda conforme a escolha.",
      },
      {
        question: "Posso pedir vários conteúdos de uma vez?",
        answer:
          "Sim. Use o botão 'Fila' para enfileirar vários pedidos: eles são gerados um a um em segundo plano e você pode até fechar a aba, que continua. O painel lateral mostra o andamento.",
      },
    ],
  },
  {
    id: "pedir-certo",
    icon: Lightbulb,
    title: "Como pedir certo (e o que esperar)",
    items: [
      {
        question: "Quero CRIAR um post, EDITAR uma foto ou REPLICAR um estilo — qual caminho?",
        answer:
          "São 3 caminhos diferentes: 1) CRIAR um post — descreva o TEMA (ex: \"5 sinais de burnout\") e a IA cria a arte do zero no estilo da sua marca. 2) EDITAR uma foto — anexe a foto (botão de imagem 📎) e escolha \"Editar a imagem\"; a IA mexe na foto real. 3) REPLICAR — anexe um post de referência e a IA cria um parecido. O erro mais comum é querer editar uma foto mas só descrever a edição sem anexar a foto.",
      },
      {
        question: "Quero usar/editar uma foto minha. Como faço?",
        answer:
          "Sempre ANEXE a foto primeiro (botão de imagem). Depois escolha o que fazer com ela: \"Editar a imagem\" (a IA altera a própria foto), \"Post no estilo da marca\" (usa a foto como base de um post novo) ou, com 2+ fotos, \"Carrossel editorial\". Se você só DESCREVER a edição (ex: \"coloque um troféu nessa foto\") sem anexar nenhuma foto, a IA não tem o que editar — ela vai te pedir pra anexar.",
      },
      {
        question: "Por que meu pedido virou o texto da imagem?",
        answer:
          "Isso acontecia quando você digitava uma INSTRUÇÃO (ex: \"faça o Haaland segurar um troféu\") num pedido de CRIAR post: a IA tratava a frase como o título do post e a escrevia na arte. Agora: para criar, descreva o TEMA (não a instrução); para editar, anexe a foto. A IA também passou a reescrever seu pedido numa manchete curta antes de gerar.",
      },
      {
        question: "O que a IA faz bem — e o que é arriscado?",
        answer:
          "✅ Faz bem: design gráfico, infográficos, posts com texto curto, fundos, carrosséis, ajustes de luz/recorte, posts no estilo da sua marca. ⚠️ É arriscado (pode sair tosco): montagem fotorrealista complexa (colocar um objeto novo na mão de alguém), \"melhorar a qualidade\" de uma foto muito ruim, textos longos dentro da imagem, e rostos de pessoas específicas. Para esses casos, capriche no pedido, gere de novo se precisar, ou use uma foto sua de base.",
      },
      {
        question: "O texto da imagem saiu com erro de ortografia. Por quê?",
        answer:
          "O modelo de imagem desenha o texto como parte da arte e, às vezes, erra uma palavra (especialmente palavras longas ou raras). Dicas: prefira textos curtos, gere de novo (cada geração é diferente), e para posts com muito texto use o formato Carrossel (texto mais controlado). Estamos sempre melhorando os modelos de texto em português.",
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
          "Logo acima do campo de mensagem há atalhos de formato: Post, Carrossel, Editorial, Story, Tweet e LinkedIn, cada um mostrando quanto custa em créditos. Clicar preenche o pedido no campo e você só completa o assunto. Nada é enviado até você mandar.",
      },
      {
        question: "Posso enviar imagens e documentos no chat?",
        answer:
          "Pode. Use o clipe para anexar fotos (o assistente enxerga a imagem e entende o pedido) ou arraste um PDF, DOCX ou TXT para usar como base do conteúdo. Se você anexar uma arte já pronta e quiser publicá-la como está, é só dizer: ele não redesenha.",
      },
      {
        question: "O conteúdo não saiu como eu queria. O que faço?",
        answer:
          "Fale com ele em português normal, como pediria a uma pessoa: 'deixa o texto menor', 'usa cores mais fortes', 'muda a legenda para falar de X'. Pedir só a legenda é bem mais barato que refazer a imagem inteira.",
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
          "Vá em 'Meu Perfil' no menu lateral, aba 'Conexões', e clique em conectar na rede desejada. Dá pra conectar Instagram, LinkedIn, TikTok, X, Facebook, Pinterest, Bluesky, Threads e YouTube. É preciso conectar ANTES de publicar: sem isso o botão de publicar não tem para onde enviar.",
      },
      {
        question: "A publicação é automática?",
        answer:
          "É. Ao agendar, a plataforma publica sozinha na data e hora marcadas, mesmo com o computador desligado. Você também pode publicar na hora pelo botão 'Publicar' no card do conteúdo.",
      },
      {
        question: "Posso publicar em várias redes de uma vez?",
        answer:
          "Pode. Ao publicar ou agendar, escolha quais contas quer usar. A legenda é adaptada automaticamente para cada rede, porque o que funciona no LinkedIn não é o que funciona no Instagram.",
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
    id: "credits",
    icon: Coins,
    title: "Créditos e cobrança",
    items: [
      {
        question: "O que são os créditos?",
        answer:
          "São o que você gasta ao gerar conteúdo. Você compra um saldo e cada criação desconta dele, então paga só pelo que usa: não há mensalidade nem cobrança automática. O saldo aparece no menu lateral e não expira.",
      },
      {
        question: "Quanto custa cada coisa?",
        answer:
          "Um post custa cerca de 10 créditos, um carrossel 10 por slide (um de 5 slides sai por 50), um story 25 e um tweet card 6. O valor exato aparece em cada atalho de formato, antes de você clicar. Um crédito equivale a cerca de dez centavos.",
      },
      {
        question: "Como compro mais créditos?",
        answer:
          "Clique no saldo no menu lateral, ou em 'Recarregar'. Você escolhe o pacote e paga por PIX (cai na hora) ou cartão. Pacotes maiores rendem bônus de créditos.",
      },
      {
        question: "Recebi um cupom. Onde uso?",
        answer:
          "Em 'Meu Perfil', aba 'Plano & Créditos', no campo 'Tem um cupom?'. Ele também aparece na janela de recarga. Se você entrou por um link de cupom, os créditos costumam ser aplicados sozinhos ao criar a conta.",
      },
      {
        question: "Se eu não gostar do resultado, perco o crédito?",
        answer:
          "A geração é cobrada quando acontece, mesmo que o resultado não agrade. Por isso vale usar o modo Econômico para testar uma ideia, e pedir ajuste só de legenda quando a imagem já está boa (custa bem menos que refazer tudo).",
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
