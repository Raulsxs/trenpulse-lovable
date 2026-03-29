/**
 * Pricing page — shows subscription plans.
 * Accessible both as public page (/pricing) and from within the app.
 */
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PricingCards from "@/components/billing/PricingCards";
import CpfCnpjModal from "@/components/billing/CpfCnpjModal";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Pricing() {
  const navigate = useNavigate();
  const { usage, loading } = useSubscription();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
    });
  }, []);

  const [subscribing, setSubscribing] = useState(false);
  const [showCpfModal, setShowCpfModal] = useState(false);
  const pendingPlanRef = useRef<string | null>(null);

  const handleSelectPlan = (planName: string) => {
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }

    if (planName === "free") {
      toast.info("Você já está no plano gratuito!");
      return;
    }

    pendingPlanRef.current = planName;
    setShowCpfModal(true);
  };

  const handleCpfConfirm = async (cpfCnpj: string) => {
    const planName = pendingPlanRef.current;
    if (!planName) return;

    setSubscribing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Não autenticado");

      const user = session.session.user;
      const userId = user.id;

      // Step 1: Create Asaas customer with CPF/CNPJ
      const { data: customerData, error: custErr } = await supabase.functions.invoke("manage-subscription", {
        body: {
          action: "create-customer",
          user_id: userId,
          name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Cliente",
          email: user.email,
          cpf_cnpj: cpfCnpj,
        },
      });

      if (custErr) throw new Error(custErr.message || "Erro ao criar cliente");
      const customerId = customerData.customer_id;

      // Step 2: Create subscription
      const { data: subData, error: subErr } = await supabase.functions.invoke("manage-subscription", {
        body: {
          action: "create-subscription",
          user_id: userId,
          plan_name: planName,
          customer_id: customerId,
          billing_type: "UNDEFINED",
        },
      });

      if (subErr) throw new Error(subErr.message || "Erro ao criar assinatura");

      setShowCpfModal(false);

      if (subData.payment_link) {
        toast.success(`Assinatura ${subData.plan} criada!`, {
          description: "Redirecionando para pagamento...",
        });
        window.open(subData.payment_link, "_blank");
      } else {
        toast.success(`Assinatura ${subData.plan} criada!`);
      }
    } catch (err: any) {
      console.error("[Pricing] Subscription error:", err);
      toast.error("Erro ao processar assinatura", {
        description: err.message || "Tente novamente.",
      });
    } finally {
      setSubscribing(false);
    }
  };

  // If user is authenticated, show inside dashboard layout
  if (isAuthenticated) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold mb-3">Pare de perder tempo criando conteúdo</h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              A IA do TrendPulse cria posts profissionais em segundos.
              Escolha o plano que faz sentido para você.
            </p>
          </div>

          <PricingCards
            currentPlan={usage?.plan_name}
            onSelectPlan={handleSelectPlan}
          />

          {/* Trust signals — reduce anxiety */}
          <div className="text-center mt-12 space-y-2 text-sm text-muted-foreground">
            <p>Todos os planos incluem chat com IA, geração visual e publicação direta.</p>
            <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
              <span className="flex items-center gap-1.5">Cancele quando quiser</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">Sem fidelidade</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1.5">PIX, boleto ou cartão</span>
            </div>
          </div>
        </div>
        <CpfCnpjModal
          open={showCpfModal}
          onClose={() => setShowCpfModal(false)}
          onConfirm={handleCpfConfirm}
          loading={subscribing}
        />
      </DashboardLayout>
    );
  }

  // Public pricing page (not logged in)
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Conteúdo profissional sem designer, sem esforço</h1>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
            A IA do TrendPulse cria posts, carrosséis e documentos LinkedIn
            em segundos. Teste grátis e veja a diferença.
          </p>
        </div>

        <PricingCards onSelectPlan={handleSelectPlan} />

        <div className="text-center mt-16 space-y-4">
          <p className="text-muted-foreground">
            Aceita PIX, boleto e cartão de crédito
          </p>
          <button
            onClick={() => navigate("/")}
            className="text-primary hover:underline text-sm"
          >
            Voltar para a página inicial
          </button>
        </div>
      </div>
      <CpfCnpjModal
        open={showCpfModal}
        onClose={() => setShowCpfModal(false)}
        onConfirm={handleCpfConfirm}
        loading={subscribing}
      />
    </div>
  );
}
