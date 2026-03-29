// Types for the Visual Content Studio

export interface StyleGuide {
  style_preset: string;
  recommended_templates: string[];
  layout_rules: {
    wave_position?: 'bottom' | 'top';
    card_style?: string;
    logo_position?: string;
    typography_notes?: string;
  };
  confirmed_palette: string[];
}

export interface Brand {
  id: string;
  owner_user_id: string;
  name: string;
  palette: string[];
  fonts: { headings: string; body: string };
  logo_url: string | null;
  visual_tone: string;
  do_rules: string | null;
  dont_rules: string | null;
  style_guide: StyleGuide | null;
  created_at: string;
  updated_at: string;
}

export interface BrandExample {
  id: string;
  brand_id: string;
  image_url: string;
  thumb_url: string | null;
  description: string | null;
  content_type: string;
  created_at: string;
}

export interface Project {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  brand?: Brand;
}

export interface Post {
  id: string;
  project_id: string;
  raw_post_text: string;
  content_type: 'noticia' | 'educativo' | 'frase' | 'curiosidade' | 'tutorial' | 'anuncio';
  status: string;
  created_at: string;
  updated_at: string;
  project?: Project;
  slides?: Slide[];
}

export interface Slide {
  id: string;
  post_id: string;
  slide_index: number;
  slide_text: string | null;
  layout_preset: string;
  created_at: string;
  updated_at: string;
  visual_brief?: VisualBrief;
  image_prompts?: ImagePrompt[];
  image_generations?: ImageGeneration[];
  selected_image?: ImageGeneration | null;
}

export interface VisualBrief {
  id: string;
  slide_id: string;
  theme: string | null;
  key_message: string | null;
  emotion: string | null;
  visual_metaphor: string | null;
  style: string | null;
  palette: string[];
  negative_elements: string | null;
  text_on_image: boolean;
  text_limit_words: number;
  composition_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImagePrompt {
  id: string;
  slide_id: string;
  brief_id: string | null;
  prompt: string;
  negative_prompt: string | null;
  model_hint: 'cheap' | 'high';
  variant_index: number;
  created_at: string;
}

export interface ImageGeneration {
  id: string;
  slide_id: string;
  prompt_id: string | null;
  model_used: string | null;
  image_url: string | null;
  thumb_url: string | null;
  width: number;
  height: number;
  seed: string | null;
  ranking_score: number | null;
  ranking_reason: string | null;
  is_selected: boolean;
  created_at: string;
}

export interface SlideVersion {
  id: string;
  slide_id: string;
  version: number;
  slide_text: string | null;
  layout_preset: string | null;
  selected_image_generation_id: string | null;
  created_at: string;
}

export interface QualityFeedback {
  id: string;
  image_generation_id: string;
  user_id: string;
  vote: 'up' | 'down';
  reasons: string[];
  notes: string | null;
  created_at: string;
}

export interface QualityMetrics {
  id: string;
  slide_id: string;
  adherence: number;
  legibility: number;
  brand_consistency: number;
  premium_look: number;
  publish_ready: boolean;
  created_at: string;
}

export type ContentType = Post['content_type'];
export type QualityTier = 'cheap' | 'high';

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  noticia: 'Notícia',
  educativo: 'Educativo',
  frase: 'Frase/Citação',
  curiosidade: 'Curiosidade',
  tutorial: 'Tutorial',
  anuncio: 'Anúncio'
};

export const VISUAL_TONES = [
  { value: 'clean', label: 'Clean/Minimalista' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'tech', label: 'Tech/Futurista' },
  { value: 'luxury', label: 'Luxo/Premium' },
  { value: 'playful', label: 'Playful/Divertido' },
  { value: 'organic', label: 'Orgânico/Natural' }
];

export const LAYOUT_PRESETS = [
  { value: 'default', label: 'Padrão' },
  { value: 'centered', label: 'Centralizado' },
  { value: 'split', label: 'Dividido' },
  { value: 'full-image', label: 'Imagem Full' },
  { value: 'quote', label: 'Citação' },
  { value: 'minimal', label: 'Minimal' }
];
