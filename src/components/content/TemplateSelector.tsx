import { cn } from "@/lib/utils";
import { templates, TemplateStyle } from "@/lib/templates";
import { Check, Sparkles } from "lucide-react";

interface TemplateSelectorProps {
  selectedTemplate: TemplateStyle;
  onSelectTemplate: (template: TemplateStyle) => void;
}

const TemplateSelector = ({ selectedTemplate, onSelectTemplate }: TemplateSelectorProps) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Sparkles className="w-4 h-4 text-primary" />
        Estilo Visual
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.values(templates).map((template) => (
          <button
            key={template.id}
            onClick={() => onSelectTemplate(template.id)}
            className={cn(
              "relative p-3 rounded-xl border-2 transition-all text-left group overflow-hidden",
              selectedTemplate === template.id
                ? "border-primary bg-primary/5 shadow-lg shadow-primary/20"
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            {/* Preview mini - simulating photo with overlay */}
            <div className="flex gap-1 mb-2 h-8 rounded-md overflow-hidden">
              <div className={cn("flex-1 relative", template.overlayStyle)}>
                <div className="absolute inset-0 bg-gradient-to-br from-gray-400 to-gray-600" />
                <div className={cn("absolute inset-0", template.overlayStyle)} />
              </div>
            </div>
            
            <p className="text-xs font-semibold text-foreground">{template.name}</p>
            <p className="text-xs text-muted-foreground">{template.description}</p>
            
            {selectedTemplate === template.id && (
              <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow-lg">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TemplateSelector;
