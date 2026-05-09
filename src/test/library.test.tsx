/**
 * Tests para Library page (Fase 2.4).
 *
 * Cobre:
 *   1) Loading inicial
 *   2) Lista contents do user em ordem desc (renderiza cards)
 *   3) Filtro por status esconde outros
 *   4) Empty state quando lista vazia
 *   5) Click em card abre dialog com preview
 *   6) Botao cancelar agendamento muda status pra draft (chama supabase.update)
 *   7) Card com status published nao mostra botao de cancelar
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { getUserMock, limitMock, updateEqMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  limitMock: vi.fn(),
  updateEqMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: limitMock,
          }),
        }),
      }),
      update: () => ({
        eq: updateEqMock,
      }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (msg: string) => toastSuccessMock(msg),
    error: (msg: string) => toastErrorMock(msg),
  },
}));

import Library from "@/pages/Library";

const draftItem = {
  id: "c-1",
  title: "Draft post",
  caption: "Hello world draft",
  status: "draft",
  scheduled_at: null,
  published_at: null,
  image_urls: ["https://cdn/a.png"],
  template_id: "t-1",
  content_type: "post",
  created_at: "2026-05-09T10:00:00Z",
  templates: { slug: "tweet-card", name: "Tweet Card" },
};

const scheduledItem = {
  id: "c-2",
  title: "Scheduled post",
  caption: "Scheduled caption",
  status: "scheduled",
  scheduled_at: "2026-12-31T15:00:00Z",
  published_at: null,
  image_urls: ["https://cdn/b.png"],
  template_id: "t-2",
  content_type: "post",
  created_at: "2026-05-08T10:00:00Z",
  templates: { slug: "newspaper-infographic", name: "Newspaper Infographic" },
};

const publishedItem = {
  id: "c-3",
  title: "Published post",
  caption: null,
  status: "published",
  scheduled_at: null,
  published_at: "2026-05-07T10:00:00Z",
  image_urls: ["https://cdn/c.png"],
  template_id: null,
  content_type: "post",
  created_at: "2026-05-07T09:00:00Z",
  templates: null,
};

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={["/library"]}>
      <Routes>
        <Route path="/library" element={<Library />} />
        <Route path="/" element={<div data-testid="root-stub" />} />
        <Route path="/discover" element={<div data-testid="discover-stub" />} />
        <Route path="/templates/:slug" element={<div data-testid="template-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getUserMock.mockReset();
  limitMock.mockReset();
  updateEqMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

describe("Library", () => {
  it("1) loading inicial mostra spinner", () => {
    getUserMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderLibrary();
    expect(screen.getByTestId("library-loading")).toBeInTheDocument();
  });

  it("2) lista contents em ordem (3 cards, badges corretos)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
    limitMock.mockResolvedValue({ data: [draftItem, scheduledItem, publishedItem], error: null });
    renderLibrary();

    await waitFor(() => expect(screen.getByTestId("library-grid")).toBeInTheDocument());
    expect(screen.getByTestId("library-card-c-1")).toBeInTheDocument();
    expect(screen.getByTestId("library-card-c-2")).toBeInTheDocument();
    expect(screen.getByTestId("library-card-c-3")).toBeInTheDocument();
    expect(screen.getByTestId("library-badge-c-1")).toHaveTextContent("Rascunho");
    expect(screen.getByTestId("library-badge-c-2")).toHaveTextContent("Agendado");
    expect(screen.getByTestId("library-badge-c-3")).toHaveTextContent("Publicado");
  });

  it("3) filtro por status esconde outros", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
    limitMock.mockResolvedValue({ data: [draftItem, scheduledItem, publishedItem], error: null });
    renderLibrary();

    await waitFor(() => expect(screen.getByTestId("library-grid")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("library-filter-scheduled"));

    expect(screen.queryByTestId("library-card-c-1")).toBeNull();
    expect(screen.getByTestId("library-card-c-2")).toBeInTheDocument();
    expect(screen.queryByTestId("library-card-c-3")).toBeNull();
  });

  it("4) empty state quando lista vazia", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
    limitMock.mockResolvedValue({ data: [], error: null });
    renderLibrary();

    await waitFor(() => expect(screen.getByTestId("library-empty")).toBeInTheDocument());
    expect(screen.getByText(/Você ainda não gerou/)).toBeInTheDocument();
  });

  it("5) click em card abre dialog com preview", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
    limitMock.mockResolvedValue({ data: [scheduledItem], error: null });
    renderLibrary();

    await waitFor(() => expect(screen.getByTestId("library-card-c-2")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("library-card-c-2"));

    expect(screen.getByTestId("library-dialog")).toBeInTheDocument();
    expect(screen.getByText("Scheduled caption")).toBeInTheDocument();
    // Item agendado mostra botao cancelar
    expect(screen.getByTestId("library-dialog-cancel-schedule")).toBeInTheDocument();
  });

  it("6) cancelar agendamento chama update e mostra toast", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
    limitMock.mockResolvedValue({ data: [scheduledItem], error: null });
    updateEqMock.mockResolvedValue({ error: null });
    renderLibrary();

    await waitFor(() => expect(screen.getByTestId("library-card-c-2")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("library-card-c-2"));
    fireEvent.click(screen.getByTestId("library-dialog-cancel-schedule"));

    await waitFor(() => expect(updateEqMock).toHaveBeenCalledWith("id", "c-2"));
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith("Agendamento cancelado"));
  });

  it("7) item publicado nao mostra botao cancelar agendamento", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
    limitMock.mockResolvedValue({ data: [publishedItem], error: null });
    renderLibrary();

    await waitFor(() => expect(screen.getByTestId("library-card-c-3")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("library-card-c-3"));

    expect(screen.getByTestId("library-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("library-dialog-cancel-schedule")).toBeNull();
  });
});
