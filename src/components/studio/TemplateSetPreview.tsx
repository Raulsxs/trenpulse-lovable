import SlideTemplateRenderer from "@/components/content/SlideTemplateRenderer";

interface TemplateSetPreviewProps {
  templateSet: {
    template_set: any;
    visual_signature?: any;
  };
  brand: {
    name: string;
    palette: any;
    fonts: any;
    visual_tone: string;
    logo_url: string | null;
  };
}

const MINI_W = 120;
const MINI_H = 150;
const RENDER_W = 1080;
const RENDER_H = 1350;
const SCALE = MINI_W / RENDER_W;

type SlideRole = "cover" | "content" | "bullets" | "cta";

function getPreviewRoles(templateSet: any): SlideRole[] {
  const formats = templateSet?.formats;
  const layoutParams = templateSet?.layout_params;
  
  if (!formats && !layoutParams) return ["cover"];

  // Check which formats are defined
  const hasCarousel = !!formats?.carousel;
  const hasPost = !!formats?.post;
  const hasStory = !!formats?.story;
  
  // If only post/story (no carousel), it's likely a single-slide format (e.g., Frases)
  // Show only cover preview
  if (!hasCarousel && (hasPost || hasStory)) {
    return ["cover"];
  }
  
  // For carousel, show cover + content + cta
  if (hasCarousel) {
    const roles: SlideRole[] = ["cover"];
    if (layoutParams?.content || layoutParams?.bullets) roles.push("content");
    if (layoutParams?.cta) roles.push("cta");
    return roles;
  }
  
  // Fallback: check layout_params keys
  const availableRoles: SlideRole[] = [];
  if (layoutParams?.cover) availableRoles.push("cover");
  if (layoutParams?.content) availableRoles.push("content");
  if (layoutParams?.cta) availableRoles.push("cta");
  
  return availableRoles.length > 0 ? availableRoles : ["cover"];
}

export default function TemplateSetPreview({ templateSet, brand }: TemplateSetPreviewProps) {
  const layoutParams = templateSet.template_set?.layout_params;
  if (!layoutParams) return null;

  const brandSnapshot = {
    name: brand.name,
    palette: brand.palette || [],
    fonts: brand.fonts || { headings: "Inter", body: "Inter" },
    visual_tone: brand.visual_tone || "clean",
    logo_url: brand.logo_url,
    layout_params: layoutParams,
  };

  const roles = getPreviewRoles(templateSet.template_set);

  const sampleSlides = roles.map((role) => ({
    headline: role === "cover" ? "Título" : role === "cta" ? "CTA" : "Conteúdo",
    body: role === "cta" ? "Siga-nos" : "Texto de exemplo",
    role,
    bullets: role === "content" ? ["Item 1", "Item 2"] : undefined,
  }));

  // Adjust dimensions for story format
  const formats = templateSet.template_set?.formats;
  const isStoryOnly = formats?.story && !formats?.post && !formats?.carousel;
  const renderW = RENDER_W;
  const renderH = isStoryOnly ? 1920 : RENDER_H;
  const miniH = isStoryOnly ? Math.round(MINI_W * (1920 / 1080)) : MINI_H;
  const scale = MINI_W / renderW;

  return (
    <div className="flex gap-2 mt-2">
      {sampleSlides.map((slide, i) => (
        <div
          key={slide.role}
          className="rounded-md overflow-hidden border border-border/50 shadow-sm"
          style={{ width: MINI_W, height: miniH }}
        >
          <div
            style={{
              width: renderW,
              height: renderH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              pointerEvents: "none",
            }}
          >
            <SlideTemplateRenderer
              slide={slide as any}
              slideIndex={i}
              totalSlides={sampleSlides.length}
              brand={brandSnapshot}
              template="parameterized"
              dimensions={{ width: renderW, height: renderH }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
