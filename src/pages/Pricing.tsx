/**
 * Pricing — créditos prepagos (sem assinatura).
 * Logado: abre o BuyCreditsModal (PIX via create-credit-charge/Asaas).
 * Deslogado: mostra os packs e manda pro signup (50cr grátis na conta nova).
 * (Substitui o fluxo de assinatura manage-subscription, que apontava pro Asaas sandbox.)
 */
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import BuyCreditsModal from "@/components/billing/BuyCreditsModal";
import { PricingSection } from "@/components/landing/PricingSection";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

// O que cada ação custa (espelha a tabela credit_pricing)
const COSTS = [
  { label: "Post com imagem", credits: 4 },
  { label: "Carrossel (por slide)", credits: 4 },
  { label: "Story 9:16 (modelo premium)", credits: 20 },
  { label: "Carrossel de tweet card", credits: 2 },
  { label: "Imagem livre", credits: 4 },
];

function CostsTable() {
  return (
    <div className="max-w-md mx-auto bg-muted/40 rounded-xl p-5">
      <p className="text-sm font-semibold text-foreground mb-3">Quanto custa cada criação</p>
      <ul className="space-y-2">
        {COSTS.map((c) => (
          <li key={c.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{c.label}</span>
            <span className="font-medium text-foreground">{c.credits} créditos</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Pricing() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
    });
  }, []);

  // Logado: header + botão que abre o modal de compra real (PIX)
  if (isAuthenticated) {
    return (
      <DashboardLayout>
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-3">Créditos que não expiram</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-6">
              Sem mensalidade. Recarregue quando quiser e pague só pelo que criar.
            </p>
            <Button size="lg" className="gap-2" onClick={() => setBuyOpen(true)}>
              <Sparkles className="w-5 h-5" />
              Comprar créditos
            </Button>
          </div>

          <CostsTable />

          <p className="text-center text-sm text-muted-foreground">
            Pagamento via PIX — os créditos caem na hora.
          </p>
        </div>
        <BuyCreditsModal open={buyOpen} onClose={() => setBuyOpen(false)} />
      </DashboardLayout>
    );
  }

  // Público (deslogado): packs + CTA pro signup
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-16 space-y-12">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Conteúdo profissional sem designer, sem mensalidade</h1>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
            A IA do TrendPulse cria posts, carrosséis e stories em segundos.
            Comece com 50 créditos grátis.
          </p>
        </div>

        <PricingSection />

        <CostsTable />

        <div className="text-center">
          <button onClick={() => navigate("/")} className="text-primary hover:underline text-sm">
            Voltar para a página inicial
          </button>
        </div>
      </div>
    </div>
  );
}
