/**
 * Tests para TemplateGallery (Fase 1.2).
 *
 * Cobre:
 *   1) Renderiza skeleton em loading
 *   2) Renderiza empty state quando lista vazia
 *   3) Renderiza um card por template com nome + thumbnail
 *   4) Click no card chama onTemplateClick com o slug correto
 *   5) Cost_credits=0 vira badge "Free"; >0 vira "X créditos"
 *   6) viral_views grandes formatados (1.5M, 433K)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateGallery, type GalleryTemplate } from "@/components/templates/TemplateGallery";

const tweetCard: GalleryTemplate = {
  id: "11",
  slug: "tweet-card",
  name: "Tweet Card",
  description: "Quote em formato de tweet",
  category: "card",
  format: "post",
  preview_url: "https://placeholder/tweet.png",
  preview_video_url: null,
  cost_credits: 0,
  viral_views: 433_000,
};

const newspaper: GalleryTemplate = {
  id: "22",
  slug: "newspaper",
  name: "Newspaper Infographic",
  description: "Layout de jornal antigo",
  category: "infographic",
  format: "post",
  preview_url: "https://placeholder/news.png",
  preview_video_url: null,
  cost_credits: 1,
  viral_views: 1_500_000,
};

const noViewsTemplate: GalleryTemplate = {
  ...newspaper,
  id: "33",
  slug: "no-views",
  name: "Sem views",
  viral_views: null,
};

describe("TemplateGallery", () => {
  it("1) renderiza skeleton em loading", () => {
    render(<TemplateGallery templates={[]} loading onTemplateClick={vi.fn()} />);
    expect(screen.getByTestId("template-gallery-loading")).toBeInTheDocument();
  });

  it("2) renderiza empty state quando lista vazia", () => {
    render(<TemplateGallery templates={[]} onTemplateClick={vi.fn()} emptyMessage="Vazio aqui" />);
    expect(screen.getByTestId("template-gallery-empty")).toHaveTextContent("Vazio aqui");
  });

  it("3) renderiza um card por template com nome + thumbnail", () => {
    render(<TemplateGallery templates={[tweetCard, newspaper]} onTemplateClick={vi.fn()} />);
    expect(screen.getByTestId("template-card-tweet-card")).toBeInTheDocument();
    expect(screen.getByTestId("template-card-newspaper")).toBeInTheDocument();
    expect(screen.getByText("Tweet Card")).toBeInTheDocument();
    expect(screen.getByAltText("Tweet Card")).toHaveAttribute("src", tweetCard.preview_url);
  });

  it("4) click chama onTemplateClick com slug correto", () => {
    const onClick = vi.fn();
    render(<TemplateGallery templates={[tweetCard, newspaper]} onTemplateClick={onClick} />);
    fireEvent.click(screen.getByTestId("template-card-newspaper"));
    expect(onClick).toHaveBeenCalledWith("newspaper");
  });

  it("5) cost_credits 0 = Free, >0 = X créditos", () => {
    render(<TemplateGallery templates={[tweetCard, newspaper]} onTemplateClick={vi.fn()} />);
    const tweetCardEl = screen.getByTestId("template-card-tweet-card");
    expect(tweetCardEl).toHaveTextContent("Free");
    const newspaperEl = screen.getByTestId("template-card-newspaper");
    expect(newspaperEl).toHaveTextContent("1 crédito");
  });

  it("6) viral_views formatados em K e M; null nao renderiza views", () => {
    render(
      <TemplateGallery templates={[tweetCard, newspaper, noViewsTemplate]} onTemplateClick={vi.fn()} />,
    );
    expect(screen.getByTestId("template-views-tweet-card")).toHaveTextContent("433K");
    expect(screen.getByTestId("template-views-newspaper")).toHaveTextContent("1.5M");
    expect(screen.queryByTestId("template-views-no-views")).toBeNull();
  });
});
