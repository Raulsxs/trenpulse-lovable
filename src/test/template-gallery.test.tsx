/**
 * Tests para TemplateGallery (design icon-based).
 *
 * Cobre:
 *   1) Renderiza skeleton em loading
 *   2) Renderiza empty state quando lista vazia
 *   3) Renderiza um card por template com nome visivel
 *   4) Click no card chama onTemplateClick com o slug correto
 *   5) cost_credits=0 → badge FREE; format=video → badge VIDEO; >0 → badge PRO
 *   6) Descricao renderiza quando presente; nao renderiza quando null
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

const videoTemplate: GalleryTemplate = {
  id: "33",
  slug: "story-video",
  name: "Story 9:16",
  description: "Video vertical para Stories",
  category: "video",
  format: "video",
  preview_url: "https://placeholder/video.png",
  preview_video_url: null,
  cost_credits: 1,
  viral_views: null,
};

const noDescTemplate: GalleryTemplate = {
  ...tweetCard,
  id: "44",
  slug: "no-desc",
  name: "Sem descricao",
  description: null,
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

  it("3) renderiza um card por template com nome visivel", () => {
    render(<TemplateGallery templates={[tweetCard, newspaper]} onTemplateClick={vi.fn()} />);
    expect(screen.getByTestId("template-card-tweet-card")).toBeInTheDocument();
    expect(screen.getByTestId("template-card-newspaper")).toBeInTheDocument();
    expect(screen.getByText("Tweet Card")).toBeInTheDocument();
    expect(screen.getByText("Newspaper Infographic")).toBeInTheDocument();
  });

  it("4) click chama onTemplateClick com slug correto", () => {
    const onClick = vi.fn();
    render(<TemplateGallery templates={[tweetCard, newspaper]} onTemplateClick={onClick} />);
    fireEvent.click(screen.getByTestId("template-card-newspaper"));
    expect(onClick).toHaveBeenCalledWith("newspaper");
  });

  it("5) badges: FREE para 0 creditos, VIDEO para format=video, PRO para paid", () => {
    render(<TemplateGallery templates={[tweetCard, newspaper, videoTemplate]} onTemplateClick={vi.fn()} />);
    expect(screen.getByTestId("template-card-tweet-card")).toHaveTextContent("FREE");
    expect(screen.getByTestId("template-card-newspaper")).toHaveTextContent("PRO");
    expect(screen.getByTestId("template-card-story-video")).toHaveTextContent("VIDEO");
  });

  it("6) descricao renderiza quando presente; nao renderiza quando null", () => {
    render(<TemplateGallery templates={[tweetCard, noDescTemplate]} onTemplateClick={vi.fn()} />);
    expect(screen.getByText("Quote em formato de tweet")).toBeInTheDocument();
    const noDescCard = screen.getByTestId("template-card-no-desc");
    expect(noDescCard.querySelector("p + p")).toBeNull();
  });
});
