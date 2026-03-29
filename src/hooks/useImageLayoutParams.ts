import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ImageLayoutParams {
  text_safe_zone?: { top: number; left: number; right: number; bottom: number };
  focal_point?: { x: number; y: number };
  brightness?: "light" | "medium" | "dark";
  dominant_colors?: string[];
  suggested_text_position?: string;
  suggested_overlay_opacity?: number;
  has_busy_areas?: boolean;
  clean_areas?: string[];
}

export function useImageLayoutParams(
  slideId: string | undefined | null,
  selectedImageId: string | undefined | null
) {
  const [imageLayoutParams, setImageLayoutParams] = useState<ImageLayoutParams | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setImageLayoutParams(null);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!slideId) {
      setImageLayoutParams(null);
      setIsAnalyzing(false);
      return;
    }

    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 20;
    const pollInterval = 1000;

    const fetchParams = async () => {
      const { data } = await supabase
        .from("slides")
        .select("image_layout_params")
        .eq("id", slideId)
        .single();

      if (cancelled) return;

      const params = data?.image_layout_params as ImageLayoutParams | null;

      if (params && params.text_safe_zone) {
        setImageLayoutParams(params);
        setIsAnalyzing(false);
        return;
      }

      pollCount++;
      if (pollCount >= maxPolls) {
        setIsAnalyzing(false);
        return;
      }

      setTimeout(fetchParams, pollInterval);
    };

    if (selectedImageId) {
      setIsAnalyzing(true);
      fetchParams();
    } else {
      fetchParams();
    }

    return () => {
      cancelled = true;
    };
  }, [slideId, selectedImageId, refreshKey]);

  return { imageLayoutParams, isAnalyzing, refresh };
}
