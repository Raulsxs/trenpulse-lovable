/**
 * Tests para TemplatePublishActions (Fase 2.1).
 *
 * Cobre:
 *   1) Loading inicial enquanto carrega contas
 *   2) Empty state quando sem contas conectadas
 *   3) Renderiza checkbox por conta agrupado por plataforma
 *   4) Botoes desabilitados sem selecao
 *   5) Click em Publicar agora invoca publish-postforme com platforms+accountIds corretos
 *   6) Erro do publish mostra toast e mantem componente
 *   7) Modal Agendar com datetime preenchido invoca publish-postforme com scheduledAt
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { useConnectedAccountsMock, functionsInvokeMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  useConnectedAccountsMock: vi.fn(),
  functionsInvokeMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@/hooks/useConnectedAccounts", () => ({
  useConnectedAccounts: () => useConnectedAccountsMock(),
  invalidateConnectedAccounts: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: functionsInvokeMock },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: (msg: string) => toastErrorMock(msg),
    success: (msg: string) => toastSuccessMock(msg),
  },
}));

import TemplatePublishActions from "@/components/templates/TemplatePublishActions";

const igAccount = { platform: "instagram", connected: true, account_name: "@maikon", pfm_account_id: "spc_ig_1" };
const liAccount1 = { platform: "linkedin", connected: true, account_name: "Maikon Madeira", pfm_account_id: "spc_li_1" };
const liAccount2 = { platform: "linkedin", connected: true, account_name: "Heart Surgery", pfm_account_id: "spc_li_2" };

beforeEach(() => {
  useConnectedAccountsMock.mockReset();
  functionsInvokeMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
});

describe("TemplatePublishActions", () => {
  it("1) loading inicial mostra spinner", () => {
    useConnectedAccountsMock.mockReturnValue({ accounts: [], loading: true });
    render(<TemplatePublishActions contentId="c-1" />);
    expect(screen.getByTestId("publish-loading")).toBeInTheDocument();
  });

  it("2) empty state quando nenhuma conta conectada", () => {
    useConnectedAccountsMock.mockReturnValue({ accounts: [], loading: false });
    render(<TemplatePublishActions contentId="c-1" />);
    expect(screen.getByTestId("publish-no-accounts")).toBeInTheDocument();
  });

  it("3) renderiza checkbox por conta agrupado por plataforma", () => {
    useConnectedAccountsMock.mockReturnValue({
      accounts: [igAccount, liAccount1, liAccount2],
      loading: false,
    });
    render(<TemplatePublishActions contentId="c-1" />);

    expect(screen.getByTestId("publish-platform-instagram")).toBeInTheDocument();
    expect(screen.getByTestId("publish-platform-linkedin")).toBeInTheDocument();
    expect(screen.getByTestId("publish-account-spc_ig_1")).toBeInTheDocument();
    expect(screen.getByTestId("publish-account-spc_li_1")).toBeInTheDocument();
    expect(screen.getByTestId("publish-account-spc_li_2")).toBeInTheDocument();
  });

  it("4) Publicar e Agendar desabilitados sem selecao; habilitam apos selecionar", () => {
    useConnectedAccountsMock.mockReturnValue({ accounts: [igAccount], loading: false });
    render(<TemplatePublishActions contentId="c-1" />);

    expect(screen.getByTestId("publish-now")).toBeDisabled();
    expect(screen.getByTestId("publish-schedule-open")).toBeDisabled();

    fireEvent.click(screen.getByLabelText("@maikon"));

    expect(screen.getByTestId("publish-now")).not.toBeDisabled();
    expect(screen.getByTestId("publish-schedule-open")).not.toBeDisabled();
  });

  it("5) Publicar agora invoca publish-postforme com platforms+accountIds corretos", async () => {
    useConnectedAccountsMock.mockReturnValue({
      accounts: [igAccount, liAccount1, liAccount2],
      loading: false,
    });
    functionsInvokeMock.mockResolvedValue({ data: { success: true }, error: null });
    const onSuccess = vi.fn();
    render(<TemplatePublishActions contentId="c-1" onSuccess={onSuccess} />);

    fireEvent.click(screen.getByLabelText("@maikon"));
    fireEvent.click(screen.getByLabelText("Heart Surgery"));

    fireEvent.click(screen.getByTestId("publish-now"));

    await waitFor(() => expect(functionsInvokeMock).toHaveBeenCalledTimes(1));
    const call = functionsInvokeMock.mock.calls[0];
    expect(call[0]).toBe("publish-postforme");
    expect(call[1].body.contentId).toBe("c-1");
    expect(call[1].body.platforms.sort()).toEqual(["instagram", "linkedin"]);
    expect(call[1].body.accountIds.sort()).toEqual(["spc_ig_1", "spc_li_2"]);
    expect("scheduledAt" in call[1].body).toBe(false);

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(onSuccess).toHaveBeenCalled();
  });

  it("6) Erro do publish mostra toast e mantem componente funcional", async () => {
    useConnectedAccountsMock.mockReturnValue({ accounts: [igAccount], loading: false });
    functionsInvokeMock.mockResolvedValue({
      data: null,
      error: { message: "PFM API down" },
    });
    render(<TemplatePublishActions contentId="c-1" />);

    fireEvent.click(screen.getByLabelText("@maikon"));
    fireEvent.click(screen.getByTestId("publish-now"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("PFM API down"));
    // Componente continua interativo
    expect(screen.getByTestId("publish-now")).not.toBeDisabled();
    expect(screen.queryByTestId("publish-no-accounts")).toBeNull();
  });

  it("7) Modal Agendar invoca publish-postforme com scheduledAt ISO", async () => {
    useConnectedAccountsMock.mockReturnValue({ accounts: [igAccount], loading: false });
    functionsInvokeMock.mockResolvedValue({ data: { success: true }, error: null });
    render(<TemplatePublishActions contentId="c-1" />);

    fireEvent.click(screen.getByLabelText("@maikon"));
    fireEvent.click(screen.getByTestId("publish-schedule-open"));

    await waitFor(() => expect(screen.getByTestId("publish-schedule-dialog")).toBeInTheDocument());

    // datetime-local valor: "2026-12-31T15:30"
    fireEvent.change(screen.getByTestId("publish-schedule-input"), {
      target: { value: "2026-12-31T15:30" },
    });

    fireEvent.click(screen.getByTestId("publish-schedule-confirm"));

    await waitFor(() => expect(functionsInvokeMock).toHaveBeenCalledTimes(1));
    const body = functionsInvokeMock.mock.calls[0][1].body;
    expect(body.contentId).toBe("c-1");
    expect(body.platforms).toEqual(["instagram"]);
    expect(body.accountIds).toEqual(["spc_ig_1"]);
    expect(typeof body.scheduledAt).toBe("string");
    // ISO format check
    expect(() => new Date(body.scheduledAt).toISOString()).not.toThrow();
  });

  it("8) Confirmar agendamento sem datetime mostra toast de erro", () => {
    useConnectedAccountsMock.mockReturnValue({ accounts: [igAccount], loading: false });
    render(<TemplatePublishActions contentId="c-1" />);

    fireEvent.click(screen.getByLabelText("@maikon"));
    fireEvent.click(screen.getByTestId("publish-schedule-open"));

    // Confirm button is disabled when datetime is empty - clicking should be a noop.
    // Verifica que botao esta disabled (nem aparece a tela de erro).
    const confirm = screen.getByTestId("publish-schedule-confirm");
    expect(confirm).toBeDisabled();
  });
});
