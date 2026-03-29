import { useOnboarding } from "./OnboardingProvider";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

const OnboardingTrigger = () => {
  const { startOnboarding, isActive } = useOnboarding();

  if (isActive) return null;

  return (
    <Button
      variant="ghost"
      onClick={startOnboarding}
      className="w-full justify-start gap-3 px-4 py-3 h-auto text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    >
      <HelpCircle className="w-5 h-5" />
      Tour da plataforma
    </Button>
  );
};

export default OnboardingTrigger;
