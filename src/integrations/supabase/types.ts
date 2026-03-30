export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_cron_config: {
        Row: {
          active: boolean | null
          created_at: string | null
          days_of_week: number[] | null
          hour_utc: number | null
          id: string
          last_run_at: string | null
          qty_suggestions: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          days_of_week?: number[] | null
          hour_utc?: number | null
          id?: string
          last_run_at?: string | null
          qty_suggestions?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          days_of_week?: number[] | null
          hour_utc?: number | null
          id?: string
          last_run_at?: string | null
          qty_suggestions?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_user_context: {
        Row: {
          brand_voice: string | null
          business_niche: string | null
          content_topics: string[] | null
          extra_context: Json | null
          instagram_handle: string | null
          onboarding_done: boolean | null
          onboarding_step: number | null
          updated_at: string | null
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          brand_voice?: string | null
          business_niche?: string | null
          content_topics?: string[] | null
          extra_context?: Json | null
          instagram_handle?: string | null
          onboarding_done?: boolean | null
          onboarding_step?: number | null
          updated_at?: string | null
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          brand_voice?: string | null
          business_niche?: string | null
          content_topics?: string[] | null
          extra_context?: Json | null
          instagram_handle?: string | null
          onboarding_done?: boolean | null
          onboarding_step?: number | null
          updated_at?: string | null
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      brand_shares: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          permission: string
          shared_with_user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          permission?: string
          shared_with_user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          permission?: string
          shared_with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_shares_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          creation_mode: string
          default_template_set_id: string | null
          default_visual_style: string | null
          do_rules: string | null
          dont_rules: string | null
          fonts: Json | null
          id: string
          logo_url: string | null
          name: string
          owner_user_id: string
          palette: Json | null
          render_mode: string
          style_guide: Json | null
          style_guide_updated_at: string | null
          style_guide_version: number
          template_sets_dirty: boolean
          template_sets_dirty_count: number
          template_sets_last_error: string | null
          template_sets_status: string
          template_sets_updated_at: string | null
          updated_at: string
          visual_preferences: Json | null
          visual_tone: string | null
        }
        Insert: {
          created_at?: string
          creation_mode?: string
          default_template_set_id?: string | null
          default_visual_style?: string | null
          do_rules?: string | null
          dont_rules?: string | null
          fonts?: Json | null
          id?: string
          logo_url?: string | null
          name: string
          owner_user_id: string
          palette?: Json | null
          render_mode?: string
          style_guide?: Json | null
          style_guide_updated_at?: string | null
          style_guide_version?: number
          template_sets_dirty?: boolean
          template_sets_dirty_count?: number
          template_sets_last_error?: string | null
          template_sets_status?: string
          template_sets_updated_at?: string | null
          updated_at?: string
          visual_preferences?: Json | null
          visual_tone?: string | null
        }
        Update: {
          created_at?: string
          creation_mode?: string
          default_template_set_id?: string | null
          default_visual_style?: string | null
          do_rules?: string | null
          dont_rules?: string | null
          fonts?: Json | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          palette?: Json | null
          render_mode?: string
          style_guide?: Json | null
          style_guide_updated_at?: string | null
          style_guide_version?: number
          template_sets_dirty?: boolean
          template_sets_dirty_count?: number
          template_sets_last_error?: string | null
          template_sets_status?: string
          template_sets_updated_at?: string | null
          updated_at?: string
          visual_preferences?: Json | null
          visual_tone?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          intent: string | null
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          intent?: string | null
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          intent?: string | null
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_contents: {
        Row: {
          brand_id: string | null
          brand_snapshot: Json | null
          caption: string | null
          content_type: string
          created_at: string
          generation_metadata: Json | null
          hashtags: string[] | null
          id: string
          image_urls: string[] | null
          include_cta: boolean | null
          instagram_media_id: string | null
          key_insights: string[] | null
          platform: string
          publish_attempts: number | null
          publish_error: string | null
          published_at: string | null
          rendered_image_urls: string[] | null
          scheduled_at: string | null
          slide_count: number | null
          slides: Json | null
          source_summary: string | null
          status: string | null
          template_set_id: string | null
          title: string
          trend_id: string | null
          updated_at: string
          user_id: string
          visual_mode: string
        }
        Insert: {
          brand_id?: string | null
          brand_snapshot?: Json | null
          caption?: string | null
          content_type?: string
          created_at?: string
          generation_metadata?: Json | null
          hashtags?: string[] | null
          id?: string
          image_urls?: string[] | null
          include_cta?: boolean | null
          instagram_media_id?: string | null
          key_insights?: string[] | null
          platform?: string
          publish_attempts?: number | null
          publish_error?: string | null
          published_at?: string | null
          rendered_image_urls?: string[] | null
          scheduled_at?: string | null
          slide_count?: number | null
          slides?: Json | null
          source_summary?: string | null
          status?: string | null
          template_set_id?: string | null
          title: string
          trend_id?: string | null
          updated_at?: string
          user_id: string
          visual_mode?: string
        }
        Update: {
          brand_id?: string | null
          brand_snapshot?: Json | null
          caption?: string | null
          content_type?: string
          created_at?: string
          generation_metadata?: Json | null
          hashtags?: string[] | null
          id?: string
          image_urls?: string[] | null
          include_cta?: boolean | null
          instagram_media_id?: string | null
          key_insights?: string[] | null
          platform?: string
          publish_attempts?: number | null
          publish_error?: string | null
          published_at?: string | null
          rendered_image_urls?: string[] | null
          scheduled_at?: string | null
          slide_count?: number | null
          slides?: Json | null
          source_summary?: string | null
          status?: string | null
          template_set_id?: string | null
          title?: string
          trend_id?: string | null
          updated_at?: string
          user_id?: string
          visual_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_contents_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          content_type: string
          created_at: string
          id: string
          project_id: string
          raw_post_text: string
          status: string | null
          updated_at: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          project_id: string
          raw_post_text: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          project_id?: string
          raw_post_text?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          instagram_handle: string | null
          interest_areas: string[] | null
          native_language: string
          preferred_audience: string
          preferred_language: string
          preferred_tone: string
          rss_sources: string[] | null
          secondary_languages: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          instagram_handle?: string | null
          interest_areas?: string[] | null
          native_language?: string
          preferred_audience?: string
          preferred_language?: string
          preferred_tone?: string
          rss_sources?: string[] | null
          secondary_languages?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          instagram_handle?: string | null
          interest_areas?: string[] | null
          native_language?: string
          preferred_audience?: string
          preferred_language?: string
          preferred_tone?: string
          rss_sources?: string[] | null
          secondary_languages?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          brand_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_trends: {
        Row: {
          id: string
          saved_at: string
          trend_id: string
          user_id: string
        }
        Insert: {
          id?: string
          saved_at?: string
          trend_id: string
          user_id: string
        }
        Update: {
          id?: string
          saved_at?: string
          trend_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_trends_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["id"]
          },
        ]
      }
      slides: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          layout_preset: string | null
          post_id: string
          slide_index: number
          slide_text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          layout_preset?: string | null
          post_id: string
          slide_index: number
          slide_text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          layout_preset?: string | null
          post_id?: string
          slide_index?: number
          slide_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slides_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      trends: {
        Row: {
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          keywords: string[] | null
          relevance_score: number | null
          scraped_at: string | null
          source: string
          source_url: string | null
          theme: string
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          relevance_score?: number | null
          scraped_at?: string | null
          source: string
          source_url?: string | null
          theme: string
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          relevance_score?: number | null
          scraped_at?: string | null
          source?: string
          source_url?: string | null
          theme?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          created_at: string | null
          generations_count: number | null
          id: string
          period_start: string
          publications_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          generations_count?: number | null
          id?: string
          period_start: string
          publications_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          generations_count?: number | null
          id?: string
          period_start?: string
          publications_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_brand_visible_to_user: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
