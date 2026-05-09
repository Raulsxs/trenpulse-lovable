/**
 * Tests para TemplateGenerator (Fase 1.5).
 *
 * Cobre:
 *   1) Loading inicial enquanto fetch do template
 *   2) Erro 'Template nao encontrado' quando slug invalido
 *   3) Renderiza TemplateForm quando carrega com sucesso
 *   4) Submit chama render-template e mostra preview
 *   5) Submit que falha mostra toast e mantem form
 *   6) Botao "Voltar e ajustar" retorna do preview pro form
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────
// vi.hoisted: mocks declarados antes do hoist do vi.mock pra evitar TDZ.

const { fromMaybeSingleMock, functionsInvokeMock, toastErrorMock } = vi.hoisted(() => ({
  fromMaybeSingleMock: vi.fn(),
  functionsInvokeMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: fromMaybeSingleMock,
          }),
        }),
      }),
    }),
    functions: {
      invoke: functionsInvokeMock,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (msg: string) => toastErrorMock(msg),
    success: vi.fn(),
  },
}));

// TemplatePublishActions tem seus proprios testes — aqui mockamos pra isolar
// e nao depender do hook useConnectedAccounts.
vi.mock("@/components/templates/TemplatePublishActions", () => ({
  default: ({ contentId }: { contentId: string }) => (
    <div data-testid="publish-actions-stub" data-content-id={contentId}>
      [TemplatePublishActions stub]
    </div>
  ),
}));

import TemplateGenerator from "@/pages/TemplateGenerator";

// ── Fixtures ─────────────────────────────────────────────────────

const tweetCardDb = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "tweet-card",
  name: "Tweet Card",
  description: "Quote em formato de tweet",
  format: "post",
  category: "card",
  preview_url: "https://example.com/tweet.png",
  input_schema: {
    fields: [
      { name: "author", type: "text", label: "Autor", required: true },
      { name: "handle", type: "text", label: "@handle", required: true },
      { name: "quote", type: "textarea", label: "Texto", required: true, max: 280 },
    ],
  },
};

function renderWithRoute(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/templates/${slug}`]}>
      <Routes>
        <Route path="/templates/:slug" element={<TemplateGenerator />} />
        <Route path="/discover" element={<div>Discover Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fromMaybeSingleMock.mockReset();
  functionsInvokeMock.mockReset();
  toastErrorMock.mockReset();
});

// ── Tests ────────────────────────────────────────────────────────

describe("TemplateGenerator", () => {
  it("1) renderiza loading inicialmente", () => {
    fromMaybeSingleMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRoute("tweet-card");
    expect(screen.getByTestId("generator-loading")).toBeInTheDocument();
  });

  it("2) mostra 'Template nao encontrado' quando supabase retorna null", async () => {
    fromMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    renderWithRoute("missing-slug");

    await waitFor(() => {
      expect(screen.getByTestId("generator-not-found")).toBeInTheDocument();
    });
    expect(screen.getByText(/Template nao encontrado/i)).toBeInTheDocument();
  });

  it("3) renderiza TemplateForm quando carrega com sucesso", async () => {
    fromMaybeSingleMock.mockResolvedValue({ data: tweetCardDb, error: null });
    renderWithRoute("tweet-card");

    await waitFor(() => {
      expect(screen.getByTestId("template-form")).toBeInTheDocument();
    });
    expect(screen.getByText("Tweet Card")).toBeInTheDocument();
    expect(screen.getByLabelText(/Autor/)).toBeInTheDocument();
    expect(screen.getByLabelText(/@handle/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Texto/)).toBeInTheDocument();
    // Estado inicial sem result deve mostrar o painel "Como funciona"
    expect(screen.getByTestId("generator-empty-preview")).toBeInTheDocument();
  });

  it("4) submit chama render-template e mostra preview no sucesso", async () => {
    fromMaybeSingleMock.mockResolvedValue({ data: tweetCardDb, error: null });
    functionsInvokeMock.mockResolvedValue({
      data: {
        contentId: "content-123",
        mediaUrls: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
        status: "done",
      },
      error: null,
    });

    renderWithRoute("tweet-card");
    await waitFor(() => expect(screen.getByTestId("template-form")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Autor/), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/@handle/), { target: { value: "@alex" } });
    fireEvent.change(screen.getByLabelText(/Texto/), { target: { value: "Build in public." } });

    fireEvent.click(screen.getByTestId("template-form-submit"));

    await waitFor(() => {
      expect(functionsInvokeMock).toHaveBeenCalledWith("render-template", {
        body: {
          templateId: tweetCardDb.id,
          inputs: { author: "Alex", handle: "@alex", quote: "Build in public." },
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("generator-result")).toBeInTheDocument();
    });
    expect(screen.getByTestId("generator-media-0")).toBeInTheDocument();
    expect(screen.getByTestId("generator-media-1")).toBeInTheDocument();
    expect(screen.getByTestId("publish-actions-stub")).toHaveAttribute("data-content-id", "content-123");
  });

  it("5) submit que falha mostra toast e mantem form", async () => {
    fromMaybeSingleMock.mockResolvedValue({ data: tweetCardDb, error: null });
    functionsInvokeMock.mockResolvedValue({
      data: null,
      error: { message: "Render failed unexpectedly" },
    });

    renderWithRoute("tweet-card");
    await waitFor(() => expect(screen.getByTestId("template-form")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Autor/), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/@handle/), { target: { value: "@alex" } });
    fireEvent.change(screen.getByLabelText(/Texto/), { target: { value: "x" } });

    fireEvent.click(screen.getByTestId("template-form-submit"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("Render failed unexpectedly"));
    // Form ainda visivel, sem result
    expect(screen.getByTestId("template-form")).toBeInTheDocument();
    expect(screen.queryByTestId("generator-result")).toBeNull();
  });

  it("6) 'Voltar e ajustar' retorna do preview pro form", async () => {
    fromMaybeSingleMock.mockResolvedValue({ data: tweetCardDb, error: null });
    functionsInvokeMock.mockResolvedValue({
      data: { contentId: "c-1", mediaUrls: ["https://x/a.png"], status: "done" },
      error: null,
    });

    renderWithRoute("tweet-card");
    await waitFor(() => expect(screen.getByTestId("template-form")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Autor/), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText(/@handle/), { target: { value: "@a" } });
    fireEvent.change(screen.getByLabelText(/Texto/), { target: { value: "y" } });
    fireEvent.click(screen.getByTestId("template-form-submit"));

    await waitFor(() => expect(screen.getByTestId("generator-result")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("generator-back-to-form"));

    expect(screen.queryByTestId("generator-result")).toBeNull();
    expect(screen.getByTestId("generator-empty-preview")).toBeInTheDocument();
  });
});
