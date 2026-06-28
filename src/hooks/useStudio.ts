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

      const insertPayload: any = {
        id: brandId,
        name: brand.name || 'Nova Marca',
        owner_user_id: userId,
        palette: brand.palette as any,
        fonts: brand.fonts as any,
        visual_tone: brand.visual_tone,
        do_rules: brand.do_rules,
        dont_rules: brand.dont_rules,
        logo_url: brand.logo_url || null,
        creation_mode: (brand as any).creation_mode ?? null,
        default_visual_style: (brand as any).default_visual_style ?? null,
        visual_preferences: (brand as any).visual_preferences ?? null,
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
          visual_preferences: (updates as any).visual_preferences,
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

// Hooks de Studio (projects/posts/slides/pipeline de imagem) removidos no Sprint 3 —
// o pipeline Studio foi podado (páginas /studio/* e 6 edge functions órfãs).
