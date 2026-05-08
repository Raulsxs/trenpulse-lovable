/**
 * Tests para TemplateForm — Fase 1.3 do refactor template-first.
 *
 * Cobre:
 *   1. Renderiza todos os 6 tipos de campo (text, textarea, image, array, boolean, number)
 *   2. Bloqueia submit quando required ausente e mostra erro inline
 *   3. Array repeater adiciona e remove items
 *   4. Max length de textarea mostra counter e respeita o limite
 *   5. onSubmit recebe inputs no formato esperado pra render-template
 *   6. Tweet card fixture funciona end-to-end
 *   7. Photo Quote fixture com inputs textarea + text opcional
 *   8. isSubmitting desabilita botão
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { TemplateForm, type Template } from "@/components/templates/TemplateForm";

// ── Fixtures ─────────────────────────────────────────────────────

const tweetCardTemplate: Template = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "tweet-card",
  name: "Tweet Card",
  input_schema: {
    fields: [
      { name: "author", type: "text", label: "Autor", required: true },
      { name: "handle", type: "text", label: "@handle", required: true },
      { name: "quote", type: "textarea", label: "Texto", required: true, max: 280 },
      { name: "avatar_url", type: "image", label: "Avatar", required: false },
    ],
  },
};

const photoQuoteTemplate: Template = {
  id: "22222222-2222-2222-2222-222222222222",
  slug: "photo-quote",
  name: "Photo Quote",
  input_schema: {
    fields: [
      { name: "phrase", type: "textarea", label: "Frase", required: true, max: 200 },
      { name: "author_name", type: "text", label: "Autor", required: false },
    ],
  },
};

const allTypesTemplate: Template = {
  id: "33333333-3333-3333-3333-333333333333",
  slug: "all-types",
  name: "All Types Demo",
  input_schema: {
    fields: [
      { name: "title", type: "text", label: "Título", required: true },
      { name: "body", type: "textarea", label: "Corpo", required: false, max: 50 },
      { name: "cover", type: "image", label: "Capa", required: false },
      { name: "tags", type: "array", label: "Tags", item_type: "text", required: false },
      { name: "featured", type: "boolean", label: "Destacar", required: false },
      { name: "priority", type: "number", label: "Prioridade", required: false, min: 1, max: 10 },
    ],
  },
};

// Helper: troca valor em input/textarea via fireEvent.
function setValue(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

function clickSubmit() {
  fireEvent.click(screen.getByTestId("template-form-submit"));
}

// ── Tests ────────────────────────────────────────────────────────

describe("TemplateForm", () => {
  it("1) renderiza os 6 tipos de campo conforme schema", () => {
    render(<TemplateForm template={allTypesTemplate} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("field-title")).toBeInTheDocument();
    expect(screen.getByTestId("field-body")).toBeInTheDocument();
    expect(screen.getByTestId("field-cover")).toBeInTheDocument();
    expect(screen.getByTestId("field-tags")).toBeInTheDocument();
    expect(screen.getByTestId("field-featured")).toBeInTheDocument();
    expect(screen.getByTestId("field-priority")).toBeInTheDocument();

    expect(screen.getByLabelText(/Título/)).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText(/Corpo/)).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByLabelText(/Capa/)).toHaveAttribute("type", "url");
    expect(screen.getByLabelText(/Prioridade/)).toHaveAttribute("type", "number");
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByTestId("array-tags")).toBeInTheDocument();
  });

  it("2) bloqueia submit quando required ausente e mostra erro inline", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm template={tweetCardTemplate} onSubmit={onSubmit} />);

    clickSubmit();

    await waitFor(() => expect(screen.getByTestId("error-author")).toBeInTheDocument());
    expect(screen.getByTestId("error-handle")).toBeInTheDocument();
    expect(screen.getByTestId("error-quote")).toBeInTheDocument();
    expect(screen.queryByTestId("error-avatar_url")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("3) array repeater adiciona e remove items", async () => {
    render(<TemplateForm template={allTypesTemplate} onSubmit={vi.fn()} />);

    const tagsContainer = screen.getByTestId("array-tags");
    expect(within(tagsContainer).queryAllByRole("textbox")).toHaveLength(1);

    const addBtn = screen.getByTestId("array-tags-add");
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    expect(within(tagsContainer).queryAllByRole("textbox")).toHaveLength(3);

    const removeBtn1 = screen.getByTestId("array-tags-remove-1");
    fireEvent.click(removeBtn1);
    expect(within(tagsContainer).queryAllByRole("textbox")).toHaveLength(2);
  });

  it("4) max length de textarea mostra counter e respeita limite", () => {
    render(<TemplateForm template={tweetCardTemplate} onSubmit={vi.fn()} />);

    const counter = screen.getByTestId("counter-quote");
    expect(counter).toHaveTextContent("0/280");

    const textarea = screen.getByLabelText(/Texto/) as HTMLTextAreaElement;
    setValue(textarea, "Hello world");
    expect(counter).toHaveTextContent("11/280");
    expect(textarea).toHaveAttribute("maxLength", "280");
  });

  it("5) onSubmit recebe inputs no formato esperado pra render-template (tweet-card)", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm template={tweetCardTemplate} onSubmit={onSubmit} />);

    setValue(screen.getByLabelText(/Autor/), "Alex Hormozi");
    setValue(screen.getByLabelText(/@handle/), "@hormozi");
    setValue(screen.getByLabelText(/Texto/), "Build the boring thing.");

    clickSubmit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.author).toBe("Alex Hormozi");
    expect(submitted.handle).toBe("@hormozi");
    expect(submitted.quote).toBe("Build the boring thing.");
    expect("avatar_url" in submitted).toBe(false);
  });

  it("6) photo-quote: required textarea e optional text funcionam", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm template={photoQuoteTemplate} onSubmit={onSubmit} />);

    clickSubmit();
    await waitFor(() => expect(screen.getByTestId("error-phrase")).toBeInTheDocument());
    expect(screen.queryByTestId("error-author_name")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    setValue(screen.getByLabelText(/Frase/), "Discipline equals freedom");
    clickSubmit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ phrase: "Discipline equals freedom" });
  });

  it("7) number, boolean e array são serializados nos tipos corretos no submit", async () => {
    const onSubmit = vi.fn();
    render(<TemplateForm template={allTypesTemplate} onSubmit={onSubmit} />);

    setValue(screen.getByLabelText(/Título/), "x");
    setValue(screen.getByLabelText(/Prioridade/), "5");
    fireEvent.click(screen.getByRole("switch"));

    const tagsContainer = screen.getByTestId("array-tags");
    const tagInputs = within(tagsContainer).getAllByRole("textbox");
    setValue(tagInputs[0], "marketing");

    clickSubmit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const out = onSubmit.mock.calls[0][0];
    expect(out.title).toBe("x");
    expect(out.priority).toBe(5);
    expect(typeof out.priority).toBe("number");
    expect(out.featured).toBe(true);
    expect(out.tags).toEqual(["marketing"]);
  });

  it("8) isSubmitting desabilita o botão e troca o label", () => {
    render(<TemplateForm template={photoQuoteTemplate} onSubmit={vi.fn()} isSubmitting />);
    const btn = screen.getByTestId("template-form-submit");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Gerando...");
  });
});
