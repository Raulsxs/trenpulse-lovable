/**
 * Tests para Discover page (Fase 1.4).
 *
 * Cobre:
 *   1) Loading inicial mostra skeleton da gallery
 *   2) Carrega templates do supabase e renderiza
 *   3) Filtro por formato esconde templates de outros formatos
 *   4) Click no card navega pra /templates/:slug
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { orderMock } = vi.hoisted(() => ({
  orderMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: orderMock,
          }),
        }),
      }),
    }),
  },
}));

import Discover from "@/pages/Discover";

const tweetCard = {
  id: "11",
  slug: "tweet-card",
  name: "Tweet Card",
  description: "Quote tweet",
  category: "card",
  format: "post",
  preview_url: "https://example/a.png",
  preview_video_url: null,
  cost_credits: 0,
  viral_views: 433_000,
};

const storyTemplate = {
  ...tweetCard,
  id: "22",
  slug: "story-9-16",
  name: "Story 9:16",
  format: "story",
};

function renderDiscover() {
  return render(
    <MemoryRouter initialEntries={["/discover"]}>
      <Routes>
        <Route path="/discover" element={<Discover />} />
        <Route path="/templates/:slug" element={<div data-testid="generator-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  orderMock.mockReset();
});

describe("Discover", () => {
  it("1) loading mostra skeleton da gallery", () => {
    orderMock.mockReturnValue(new Promise(() => {})); // never resolves
    renderDiscover();
    expect(screen.getByTestId("template-gallery-loading")).toBeInTheDocument();
  });

  it("2) carrega templates do supabase e renderiza", async () => {
    orderMock.mockResolvedValue({ data: [tweetCard, storyTemplate], error: null });
    renderDiscover();
    await waitFor(() => {
      expect(screen.getByTestId("template-card-tweet-card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("template-card-story-9-16")).toBeInTheDocument();
  });

  it("3) filtro por formato esconde templates de outros formatos", async () => {
    orderMock.mockResolvedValue({ data: [tweetCard, storyTemplate], error: null });
    renderDiscover();
    await waitFor(() => expect(screen.getByTestId("template-card-tweet-card")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("discover-filter-story"));

    expect(screen.queryByTestId("template-card-tweet-card")).toBeNull();
    expect(screen.getByTestId("template-card-story-9-16")).toBeInTheDocument();
  });

  it("4) click no card navega pra /templates/:slug", async () => {
    orderMock.mockResolvedValue({ data: [tweetCard], error: null });
    renderDiscover();
    await waitFor(() => expect(screen.getByTestId("template-card-tweet-card")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("template-card-tweet-card"));
    await waitFor(() => expect(screen.getByTestId("generator-stub")).toBeInTheDocument());
  });
});
