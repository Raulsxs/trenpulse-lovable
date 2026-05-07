import { Sparkles, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function SelfServePlaceholder() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-background">
      <div className="max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-3">Estamos preparando algo novo</h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          A nova experiência TrendPulse com galeria de templates virais está chegando.
          Em breve você poderá criar conteúdo a partir de templates testados e prontos pra performar.
        </p>
        <Button onClick={handleSignOut} variant="outline" className="gap-2">
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );
}
