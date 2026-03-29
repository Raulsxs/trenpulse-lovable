import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Brand, BrandExample, Project, Post, Slide, VisualBrief, ImagePrompt, ImageGeneration } from '@/types/studio';

// ============ BRANDS ============
export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      // RLS now handles shared brands automatically
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as Brand[];
    }
  });
}

export function useCreateBrand() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (brand: Partial<Brand>) => {
      // Force token refresh to ensure RLS sees a valid auth.uid()
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      let userId: string | undefined;
      
      if (refreshData?.session?.user?.id) {
        userId = refreshData.session.user.id;
      } else {
        // Fallback: try getUser which validates against the server
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id;
      }
      
      if (!userId) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const brandId = crypto.randomUUID();

      const insertPayload = {
        id: brandId,
        name: brand.name || 'Nova Marca',
        owner_user_id: userId,
        palette: brand.palette as any,
        fonts: brand.fonts as any,
        visual_tone: brand.visual_tone,
        do_rules: brand.do_rules,
        dont_rules: brand.dont_rules,
        logo_url: brand.logo_url || null,
      };

      const { error } = await supabase
        .from('brands')
        .insert(insertPayload);

      if (error) throw error;

      return { ...insertPayload } as unknown as Brand;
    },
      
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Marca criada com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar marca: ' + error.message);
    }
  });
}

export function useUpdateBrand() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Brand> & { id: string }) => {
      const { data, error } = await supabase
        .from('brands')
        .update({
          name: updates.name,
          palette: updates.palette as any,
          fonts: updates.fonts as any,
          visual_tone: updates.visual_tone,
          do_rules: updates.do_rules,
          dont_rules: updates.dont_rules,
          logo_url: updates.logo_url,
          default_visual_style: (updates as any).default_visual_style,
          creation_mode: (updates as any).creation_mode,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as unknown as Brand;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Marca atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar marca: ' + error.message);
    }
  });
}

export function useDeleteBrand() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('brands').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Marca excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir marca: ' + error.message);
    }
  });
}

// ============ BRAND EXAMPLES ============
export function useBrandExamples(brandId: string) {
  return useQuery({
    queryKey: ['brand-examples', brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_examples')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as BrandExample[];
    },
    enabled: !!brandId
  });
}

export function useAddBrandExample() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (example: { brand_id: string; image_url: string; thumb_url?: string; description?: string; content_type?: string; type?: string; subtype?: string; category_id?: string | null; category_mode?: string; carousel_group_id?: string | null; slide_index?: number | null }) => {
      const { data, error } = await supabase
        .from('brand_examples')
        .insert({
          brand_id: example.brand_id,
          image_url: example.image_url,
          thumb_url: example.thumb_url,
          description: example.description,
          content_type: example.content_type || example.type || 'post',
          type: example.type || 'post',
          subtype: example.subtype,
          category_id: example.category_id || null,
          category_mode: example.category_mode || 'auto',
          carousel_group_id: example.carousel_group_id || null,
          slide_index: example.slide_index ?? null,
        } as any)
        .select()
        .single();
      
      if (error) throw error;

      // Mark brand dirty
      await markBrandDirty(example.brand_id);

      return data as BrandExample;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['brand-examples', variables.brand_id] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Exemplo adicionado!');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar exemplo: ' + error.message);
    }
  });
}

export function useUpdateBrandExample() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, brandId, type, subtype, description, category_id, category_mode }: { id: string; brandId: string; type: string; subtype: string | null; description: string | null; category_id?: string | null; category_mode?: string }) => {
      const updatePayload: any = { type, subtype, description, content_type: type };
      if (category_id !== undefined) updatePayload.category_id = category_id;
      if (category_mode !== undefined) updatePayload.category_mode = category_mode;

      const { error } = await supabase
        .from('brand_examples')
        .update(updatePayload)
        .eq('id', id);
      
      if (error) throw error;

      // Mark brand dirty
      await markBrandDirty(brandId);

      return brandId;
    },
    onSuccess: (brandId) => {
      queryClient.invalidateQueries({ queryKey: ['brand-examples', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Exemplo atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar exemplo: ' + error.message);
    }
  });
}

export function useDeleteBrandExample() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, brandId }: { id: string; brandId: string }) => {
      const { error } = await supabase.from('brand_examples').delete().eq('id', id);
      if (error) throw error;

      // Mark brand dirty
      await markBrandDirty(brandId);

      return brandId;
    },
    onSuccess: (brandId) => {
      queryClient.invalidateQueries({ queryKey: ['brand-examples', brandId] });
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      toast.success('Exemplo removido!');
    },
    onError: (error) => {
      toast.error('Erro ao remover exemplo: ' + error.message);
    }
  });
}

// Helper to mark brand dirty for template sets
async function markBrandDirty(brandId: string) {
  // We do a select + update to increment count
  const { data: brand } = await supabase
    .from('brands')
    .select('template_sets_dirty_count')
    .eq('id', brandId)
    .single();
  
  const currentCount = (brand as any)?.template_sets_dirty_count || 0;
  
  await supabase.from('brands').update({
    template_sets_dirty: true,
    template_sets_dirty_count: currentCount + 1,
  } as any).eq('id', brandId);
}

// ============ BRAND EXAMPLE CATEGORIES ============
export function useBrandCategories(brandId: string) {
  return useQuery({
    queryKey: ['brand-categories', brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_example_categories' as any)
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as any[];
    },
    enabled: !!brandId,
  });
}

export function useCreateBrandCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ brandId, name, description }: { brandId: string; name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('brand_example_categories' as any)
        .insert({ brand_id: brandId, name, description: description || null })
        .select()
        .single();
      
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['brand-categories', variables.brandId] });
      toast.success('Pilar editorial criado!');
    },
    onError: (error: any) => {
      if (error.message?.includes('idx_brand_example_categories_unique_name')) {
        toast.error('Já existe um pilar com esse nome');
      } else {
        toast.error('Erro ao criar pilar: ' + error.message);
      }
    }
  });
}

// ============ PROJECTS ============
export function useProjects(brandId?: string) {
  return useQuery({
    queryKey: ['projects', brandId],
    queryFn: async () => {
      let query = supabase
        .from('projects')
        .select('*, brands(*)')
        .order('created_at', { ascending: false });
      
      if (brandId) {
        query = query.eq('brand_id', brandId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data.map(p => ({
        ...p,
        brand: p.brands as any
      })) as unknown as Project[];
    }
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, brands(*)')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return { ...data, brand: data.brands as any } as unknown as Project;
    },
    enabled: !!id
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (project: { name: string; brand_id: string; description?: string }) => {
      const { data, error } = await supabase
        .from('projects')
        .insert(project)
        .select()
        .single();
      
      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto criado!');
    },
    onError: (error) => {
      toast.error('Erro ao criar projeto: ' + error.message);
    }
  });
}

// ============ POSTS ============
export function usePosts(projectId: string) {
  return useQuery({
    queryKey: ['posts', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Post[];
    },
    enabled: !!projectId
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: ['post', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          slides(*, 
            visual_briefs(*),
            image_prompts(*),
            image_generations(*)
          )
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      
      // Process slides to add selected_image
      const slides = (data.slides || []).map((slide: any) => ({
        ...slide,
        visual_brief: slide.visual_briefs?.[0] || null,
        image_prompts: slide.image_prompts || [],
        image_generations: slide.image_generations || [],
        selected_image: slide.image_generations?.find((g: any) => g.is_selected) || null
      })).sort((a: any, b: any) => a.slide_index - b.slide_index);
      
      return { ...data, slides } as Post;
    },
    enabled: !!id
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (post: { project_id: string; raw_post_text: string; content_type: string }) => {
      const { data, error } = await supabase
        .from('posts')
        .insert(post)
        .select()
        .single();
      
      if (error) throw error;
      return data as Post;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.project_id] });
      toast.success('Post criado!');
    },
    onError: (error) => {
      toast.error('Erro ao criar post: ' + error.message);
    }
  });
}

// ============ SLIDES ============
export function useCreateSlides() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ postId, slides }: { postId: string; slides: { slide_text: string; slide_index: number }[] }) => {
      const { data, error } = await supabase
        .from('slides')
        .insert(slides.map(s => ({ ...s, post_id: postId })))
        .select();
      
      if (error) throw error;
      return data as Slide[];
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['post', variables.postId] });
    }
  });
}

export function useUpdateSlide() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Slide> & { id: string }) => {
      const { data, error } = await supabase
        .from('slides')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Slide;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post'] });
    }
  });
}

// ============ AI PIPELINE ============
export function useGenerateBrief() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (slideId: string) => {
      const { data, error } = await supabase.functions.invoke('create-visual-brief', {
        body: { slide_id: slideId }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.brief as VisualBrief;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post'] });
      toast.success('Brief visual gerado!');
    },
    onError: (error) => {
      toast.error('Erro ao gerar brief: ' + error.message);
    }
  });
}

export function useBuildPrompts() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (slideId: string) => {
      const { data, error } = await supabase.functions.invoke('build-image-prompts', {
        body: { slide_id: slideId }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.prompts as ImagePrompt[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post'] });
      toast.success('Prompts gerados!');
    },
    onError: (error) => {
      toast.error('Erro ao gerar prompts: ' + error.message);
    }
  });
}

export function useGenerateImages() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ slideId, qualityTier = 'cheap', nVariations = 2 }: { 
      slideId: string; 
      qualityTier?: 'cheap' | 'high'; 
      nVariations?: number 
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-image-variations', {
        body: { slide_id: slideId, quality_tier: qualityTier, n_variations: nVariations }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.generations as ImageGeneration[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post'] });
      toast.success('Imagens geradas!');
    },
    onError: (error) => {
      toast.error('Erro ao gerar imagens: ' + error.message);
    }
  });
}

export function useRankAndSelect() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (slideId: string) => {
      const { data, error } = await supabase.functions.invoke('rank-and-select', {
        body: { slide_id: slideId }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post'] });
      toast.success('Imagem selecionada automaticamente!');
    },
    onError: (error) => {
      toast.error('Erro ao ranquear imagens: ' + error.message);
    }
  });
}

export function useSelectImage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ slideId, imageId }: { slideId: string; imageId: string }) => {
      // Deselect all
      await supabase
        .from('image_generations')
        .update({ is_selected: false })
        .eq('slide_id', slideId);
      
      // Select this one
      const { error } = await supabase
        .from('image_generations')
        .update({ is_selected: true })
        .eq('id', imageId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post'] });
      toast.success('Imagem selecionada!');
    }
  });
}

// ============ FEEDBACK ============
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (feedback: { 
      image_generation_id: string; 
      vote: 'up' | 'down'; 
      reasons?: string[]; 
      notes?: string 
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('quality_feedback')
        .insert({ ...feedback, user_id: user.id });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Feedback registrado!');
    }
  });
}

// ============ QUALITY METRICS ============
export function useQualityMetrics(days: number = 30) {
  return useQuery({
    queryKey: ['quality-metrics', days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      
      const { data, error } = await supabase
        .from('quality_metrics')
        .select('*')
        .gte('created_at', since.toISOString());
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return {
          totalSlides: 0,
          publishReadyRate: 0,
          avgAdherence: 0,
          avgLegibility: 0,
          avgPremium: 0,
          avgBrandConsistency: 0
        };
      }
      
      const publishReady = data.filter(m => m.publish_ready).length;
      
      return {
        totalSlides: data.length,
        publishReadyRate: Math.round((publishReady / data.length) * 100),
        avgAdherence: Number((data.reduce((a, m) => a + (m.adherence || 0), 0) / data.length).toFixed(1)),
        avgLegibility: Number((data.reduce((a, m) => a + (m.legibility || 0), 0) / data.length).toFixed(1)),
        avgPremium: Number((data.reduce((a, m) => a + (m.premium_look || 0), 0) / data.length).toFixed(1)),
        avgBrandConsistency: Number((data.reduce((a, m) => a + (m.brand_consistency || 0), 0) / data.length).toFixed(1))
      };
    }
  });
}
