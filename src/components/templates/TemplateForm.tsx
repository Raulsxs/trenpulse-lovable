/**
 * TemplateForm — form dinâmico que renderiza inputs a partir de um template.input_schema.
 *
 * Usado em /templates/:slug (Fase 1 do refactor template-first). Recebe um Template
 * (carregado de public.templates) e chama onSubmit com os inputs prontos para
 * a edge function render-template.
 *
 * Suporta os 6 field types do schema: text, textarea, image (URL string), array
 * (repeater), boolean, number. Validação client-side: required + max length.
 */
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

// ─── Tipos (espelham TemplateRow de render-template) ─────────────

export type FieldType = "text" | "textarea" | "image" | "array" | "boolean" | "number";

export type FieldSpec = {
  name: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  max?: number;
  min?: number;
  item_type?: FieldType | "object";
};

export type Template = {
  id: string;
  slug: string;
  name: string;
  input_schema: { fields: FieldSpec[] };
};

export type TemplateFormProps = {
  template: Template;
  onSubmit: (inputs: Record<string, unknown>) => void;
  isSubmitting?: boolean;
};

// ─── Defaults ────────────────────────────────────────────────────

function defaultValueFor(field: FieldSpec): unknown {
  switch (field.type) {
    case "boolean": return false;
    case "number": return "";
    case "array": return [""];
    default: return "";
  }
}

function buildDefaults(fields: FieldSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.name] = defaultValueFor(f);
  return out;
}

// ─── Component ───────────────────────────────────────────────────

export function TemplateForm({ template, onSubmit, isSubmitting }: TemplateFormProps) {
  const fields = template.input_schema?.fields ?? [];
  const form = useForm<Record<string, unknown>>({
    defaultValues: buildDefaults(fields),
    mode: "onSubmit",
  });

  const handleFinalSubmit = (raw: Record<string, unknown>) => {
    // Coerce números (vêm como string do input) e remove vazios opcionais.
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = raw[f.name];
      if (f.type === "number") {
        if (typeof v === "string" && v.trim() !== "") out[f.name] = Number(v);
        else if (typeof v === "number") out[f.name] = v;
      } else if (f.type === "array") {
        const arr = Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "") : [];
        out[f.name] = arr;
      } else if (f.type === "boolean") {
        out[f.name] = Boolean(v);
      } else {
        if (typeof v === "string" && v.trim() === "" && !f.required) continue;
        out[f.name] = v;
      }
    }
    onSubmit(out);
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleFinalSubmit)}
      className="space-y-5"
      data-testid="template-form"
    >
      {fields.map((field) => (
        <FieldRow key={field.name} field={field} form={form} />
      ))}

      <Button type="submit" disabled={isSubmitting} data-testid="template-form-submit">
        {isSubmitting ? "Gerando..." : "Gerar conteúdo"}
      </Button>
    </form>
  );
}

// ─── FieldRow ────────────────────────────────────────────────────

type FieldRowProps = {
  field: FieldSpec;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
};

function FieldRow({ field, form }: FieldRowProps) {
  const error = form.formState.errors[field.name];
  const errorMessage = (error as any)?.message as string | undefined;
  const labelText = field.label ?? field.name;

  return (
    <div className="space-y-1.5" data-testid={`field-${field.name}`}>
      <Label htmlFor={field.name} className="flex items-center gap-1">
        {labelText}
        {field.required && <span className="text-destructive" aria-label="obrigatório">*</span>}
      </Label>

      {renderInput(field, form)}

      {errorMessage && (
        <p className="text-sm text-destructive" role="alert" data-testid={`error-${field.name}`}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function renderInput(field: FieldSpec, form: ReturnType<typeof useForm<Record<string, unknown>>>) {
  const required = field.required ? `${field.label ?? field.name} é obrigatório` : false;

  switch (field.type) {
    case "text":
    case "image":
      return (
        <Input
          id={field.name}
          type={field.type === "image" ? "url" : "text"}
          placeholder={field.type === "image" ? "https://..." : undefined}
          {...form.register(field.name, {
            required,
            maxLength: field.max ? { value: field.max, message: `Máximo ${field.max} caracteres` } : undefined,
          })}
        />
      );

    case "textarea":
      return <TextareaWithCounter field={field} form={form} required={required} />;

    case "number":
      return (
        <Input
          id={field.name}
          type="number"
          min={field.min}
          max={field.max}
          {...form.register(field.name, {
            required,
            min: field.min !== undefined ? { value: field.min, message: `Mínimo ${field.min}` } : undefined,
            max: field.max !== undefined ? { value: field.max, message: `Máximo ${field.max}` } : undefined,
          })}
        />
      );

    case "boolean":
      return (
        <Controller
          name={field.name}
          control={form.control}
          render={({ field: { value, onChange } }) => (
            <Switch id={field.name} checked={Boolean(value)} onCheckedChange={onChange} />
          )}
        />
      );

    case "array":
      return <ArrayRepeater field={field} form={form} />;

    default:
      return <p className="text-sm text-muted-foreground">Tipo de campo não suportado: {field.type}</p>;
  }
}

// ─── TextareaWithCounter ─────────────────────────────────────────

function TextareaWithCounter({
  field,
  form,
  required,
}: {
  field: FieldSpec;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
  required: string | false;
}) {
  const value = form.watch(field.name);
  const length = typeof value === "string" ? value.length : 0;
  const max = field.max;

  return (
    <div className="space-y-1">
      <Textarea
        id={field.name}
        rows={4}
        maxLength={max}
        {...form.register(field.name, {
          required,
          maxLength: max ? { value: max, message: `Máximo ${max} caracteres` } : undefined,
        })}
      />
      {max && (
        <div className="text-xs text-muted-foreground text-right" data-testid={`counter-${field.name}`}>
          {length}/{max}
        </div>
      )}
    </div>
  );
}

// ─── ArrayRepeater ───────────────────────────────────────────────

function ArrayRepeater({
  field,
  form,
}: {
  field: FieldSpec;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
}) {
  // Mantém apenas a quantidade de slots em estado local. Cada slot registra
  // a si mesmo no form via `${field.name}.${i}` quando renderizado. Remoção
  // copia os valores subsequentes pra cima e shrinks o slot count.
  const [slotCount, setSlotCount] = useState(1);
  const itemRequired = field.required;

  const removeAt = (index: number) => {
    // Recopia valores subsequentes pra cima antes de reduzir.
    const all = form.getValues(field.name) as unknown[] | undefined;
    if (Array.isArray(all)) {
      for (let i = index; i < all.length - 1; i++) {
        form.setValue(`${field.name}.${i}` as any, all[i + 1]);
      }
      form.setValue(`${field.name}.${all.length - 1}` as any, "");
    }
    setSlotCount((c) => Math.max(1, c - 1));
  };

  return (
    <div className="space-y-2" data-testid={`array-${field.name}`}>
      {Array.from({ length: slotCount }).map((_, index) => (
        <div key={index} className="flex gap-2 items-start">
          <div className="flex-1">
            {field.item_type === "textarea" ? (
              <Textarea
                rows={2}
                {...form.register(`${field.name}.${index}` as any, {
                  required: itemRequired && index === 0 ? "Pelo menos 1 item" : false,
                })}
              />
            ) : (
              <Input
                {...form.register(`${field.name}.${index}` as any, {
                  required: itemRequired && index === 0 ? "Pelo menos 1 item" : false,
                })}
              />
            )}
          </div>
          {slotCount > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAt(index)}
              aria-label={`Remover item ${index + 1}`}
              data-testid={`array-${field.name}-remove-${index}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setSlotCount((c) => c + 1)}
        data-testid={`array-${field.name}-add`}
      >
        <Plus className="h-4 w-4 mr-1" />
        Adicionar item
      </Button>
    </div>
  );
}

export default TemplateForm;
