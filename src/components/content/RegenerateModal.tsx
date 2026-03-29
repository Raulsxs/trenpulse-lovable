import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, Loader2, Sparkles } from "lucide-react";

interface RegenerateModalProps {
  open: boolean;
  onClose: () => void;
  onRegenerate: (prompt: string) => Promise<void>;
  isRegenerating: boolean;
  currentTitle: string;
}

const RegenerateModal = ({ 
  open, 
  onClose, 
  onRegenerate, 
  isRegenerating,
  currentTitle 
}: RegenerateModalProps) => {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = async () => {
    await onRegenerate(prompt);
    setPrompt("");
  };

  const handleClose = () => {
    if (!isRegenerating) {
      setPrompt("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-violet-500" />
            Regenerar Conteúdo
          </DialogTitle>
          <DialogDescription>
            A IA irá criar novos textos e imagens baseados no seu prompt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground mb-1">Conteúdo atual:</p>
            <p className="text-sm font-medium text-foreground">{currentTitle}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt" className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              Instruções para regeneração (opcional)
            </Label>
            <Textarea
              id="prompt"
              placeholder="Ex: Deixe mais informal e use emojis. Foque nos benefícios para o paciente..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="resize-none"
              disabled={isRegenerating}
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para regenerar com as mesmas configurações.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={handleClose}
              disabled={isRegenerating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isRegenerating}
              className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Regenerando...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Regenerar Tudo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RegenerateModal;
