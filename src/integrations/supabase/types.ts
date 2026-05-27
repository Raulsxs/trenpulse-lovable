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
      brand_background_templates: {
        Row: {
          background_images: Json
          brand_id: string
          content_format: string
          created_at: string
          description: string | null
          id: string
          name: string
          slide_count: number
          source_content_id: string | null
          updated_at: string
        }
        Insert: {
          background_images?: Json
          brand_id: string
          content_format?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slide_count?: number
          source_content_id?: string | null
          updated_at?: string
        }
        Update: {
          background_images?: Json
          brand_id?: string
          content_format?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slide_count?: number
          source_content_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_background_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_example_categories: {
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
            foreignKeyName: "brand_example_categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_examples: {
        Row: {
          brand_id: string
          carousel_group_id: string | null
          category_id: string | null
          category_mode: string
          content_type: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string
          purpose: string
          slide_index: number | null
          subtype: string | null
          thumb_url: string | null
          type: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          carousel_group_id?: string | null
          category_id?: string | null
          category_mode?: string
          content_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url: string
          purpose?: string
          slide_index?: number | null
          subtype?: string | null
          thumb_url?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          carousel_group_id?: string | null
          category_id?: string | null
          category_mode?: string
          content_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string
          purpose?: string
          slide_index?: number | null
          subtype?: string | null
          thumb_url?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_examples_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
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
      brand_template_sets: {
        Row: {
          brand_id: string
          category_id: string | null
          category_name: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          source_example_ids: Json | null
          status: string
          template_set: Json
          updated_at: string
          visual_signature: Json | null
        }
        Insert: {
          brand_id: string
          category_id?: string | null
          category_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          source_example_ids?: Json | null
          status?: string
          template_set?: Json
          updated_at?: string
          visual_signature?: Json | null
        }
        Update: {
          brand_id?: string
          category_id?: string | null
          category_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          source_example_ids?: Json | null
          status?: string
          template_set?: Json
          updated_at?: string
          visual_signature?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_template_sets_brand_id_fkey"
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
      content_metrics: {
        Row: {
          comments: number | null
          content_id: string
          created_at: string | null
          engagement_rate: number | null
          fetched_at: string | null
          id: string
          impressions: number | null
          likes: number | null
          platform: string
          reach: number | null
          saves: number | null
          shares: number | null
          user_id: string
        }
        Insert: {
          comments?: number | null
          content_id: string
          created_at?: string | null
          engagement_rate?: number | null
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id: string
        }
        Update: {
          comments?: number | null
          content_id?: string
          created_at?: string | null
          engagement_rate?: number | null
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform?: string
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_metrics_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: true
            referencedRelation: "generated_contents"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          created_at: string
          delta: number
          generated_content_id: string | null
          id: string
          reason: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          generated_content_id?: string | null
          id?: string
          reason: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          generated_content_id?: string | null
          id?: string
          reason?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_generated_content_id_fkey"
            columns: ["generated_content_id"]
            isOneToOne: false
            referencedRelation: "generated_contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_template_sets: {
        Row: {
          created_at: string
          id: string
          template_set_id: string
          template_set_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_set_id: string
          template_set_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_set_id?: string
          template_set_type?: string
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
          platform_captions: Json | null
          publish_attempts: number | null
          publish_error: string | null
          published_at: string | null
          rendered_image_urls: string[] | null
          scheduled_at: string | null
          slide_count: number | null
          slides: Json | null
          source_summary: string | null
          status: string | null
          template_id: string | null
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
          platform_captions?: Json | null
          publish_attempts?: number | null
          publish_error?: string | null
          published_at?: string | null
          rendered_image_urls?: string[] | null
          scheduled_at?: string | null
          slide_count?: number | null
          slides?: Json | null
          source_summary?: string | null
          status?: string | null
          template_id?: string | null
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
          platform_captions?: Json | null
          publish_attempts?: number | null
          publish_error?: string | null
          published_at?: string | null
          rendered_image_urls?: string[] | null
          scheduled_at?: string | null
          slide_count?: number | null
          slides?: Json | null
          source_summary?: string | null
          status?: string | null
          template_id?: string | null
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
      image_generations: {
        Row: {
          created_at: string
          height: number | null
          id: string
          image_url: string | null
          is_selected: boolean | null
          model_used: string | null
          prompt_id: string | null
          ranking_reason: string | null
          ranking_score: number | null
          seed: string | null
          slide_id: string
          thumb_url: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          image_url?: string | null
          is_selected?: boolean | null
          model_used?: string | null
          prompt_id?: string | null
          ranking_reason?: string | null
          ranking_score?: number | null
          seed?: string | null
          slide_id: string
          thumb_url?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          image_url?: string | null
          is_selected?: boolean | null
          model_used?: string | null
          prompt_id?: string | null
          ranking_reason?: string | null
          ranking_score?: number | null
          seed?: string | null
          slide_id?: string
          thumb_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "image_generations_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "image_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_generations_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      image_prompts: {
        Row: {
          brief_id: string | null
          created_at: string
          id: string
          model_hint: string | null
          negative_prompt: string | null
          prompt: string
          slide_id: string
          variant_index: number | null
        }
        Insert: {
          brief_id?: string | null
          created_at?: string
          id?: string
          model_hint?: string | null
          negative_prompt?: string | null
          prompt: string
          slide_id: string
          variant_index?: number | null
        }
        Update: {
          brief_id?: string | null
          created_at?: string
          id?: string
          model_hint?: string | null
          negative_prompt?: string | null
          prompt?: string
          slide_id?: string
          variant_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "image_prompts_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "visual_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_prompts_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_connections: {
        Row: {
          access_token: string
          created_at: string
          id: string
          instagram_user_id: string
          instagram_username: string | null
          is_active: boolean
          page_id: string
          page_name: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          instagram_user_id: string
          instagram_username?: string | null
          is_active?: boolean
          page_id: string
          page_name?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          instagram_user_id?: string
          instagram_username?: string | null
          is_active?: boolean
          page_id?: string
          page_name?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      linkedin_connections: {
        Row: {
          access_token: string
          created_at: string
          id: string
          is_active: boolean
          linkedin_email: string | null
          linkedin_name: string | null
          linkedin_profile_url: string | null
          linkedin_user_id: string
          organization_id: string | null
          organization_name: string | null
          refresh_token: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          is_active?: boolean
          linkedin_email?: string | null
          linkedin_name?: string | null
          linkedin_profile_url?: string | null
          linkedin_user_id: string
          organization_id?: string | null
          organization_name?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          is_active?: boolean
          linkedin_email?: string | null
          linkedin_name?: string | null
          linkedin_profile_url?: string | null
          linkedin_user_id?: string
          organization_id?: string | null
          organization_name?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          account_type: string
          avatar_url: string | null
          company_name: string | null
          created_at: string
          credits_balance: number
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
          account_type?: string
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          credits_balance?: number
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
          account_type?: string
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          credits_balance?: number
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
      quality_feedback: {
        Row: {
          created_at: string
          id: string
          image_generation_id: string
          notes: string | null
          reasons: Json | null
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_generation_id: string
          notes?: string | null
          reasons?: Json | null
          user_id: string
          vote: string
        }
        Update: {
          created_at?: string
          id?: string
          image_generation_id?: string
          notes?: string | null
          reasons?: Json | null
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_feedback_image_generation_id_fkey"
            columns: ["image_generation_id"]
            isOneToOne: false
            referencedRelation: "image_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_metrics: {
        Row: {
          adherence: number | null
          brand_consistency: number | null
          created_at: string
          id: string
          legibility: number | null
          premium_look: number | null
          publish_ready: boolean | null
          slide_id: string
        }
        Insert: {
          adherence?: number | null
          brand_consistency?: number | null
          created_at?: string
          id?: string
          legibility?: number | null
          premium_look?: number | null
          publish_ready?: boolean | null
          slide_id: string
        }
        Update: {
          adherence?: number | null
          brand_consistency?: number | null
          created_at?: string
          id?: string
          legibility?: number | null
          premium_look?: number | null
          publish_ready?: boolean | null
          slide_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_metrics_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_schedules: {
        Row: {
          active: boolean
          content_id: string
          created_at: string
          days_of_week: number[]
          hour_utc: number
          id: string
          jitter_minutes: number
          last_run_at: string | null
          name: string | null
          platforms: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          content_id: string
          created_at?: string
          days_of_week?: number[]
          hour_utc?: number
          id?: string
          jitter_minutes?: number
          last_run_at?: string | null
          name?: string | null
          platforms?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          content_id?: string
          created_at?: string
          days_of_week?: number[]
          hour_utc?: number
          id?: string
          jitter_minutes?: number
          last_run_at?: string | null
          name?: string | null
          platforms?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_schedules_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "generated_contents"
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
      slide_versions: {
        Row: {
          created_at: string
          id: string
          layout_preset: string | null
          selected_image_generation_id: string | null
          slide_id: string
          slide_text: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          layout_preset?: string | null
          selected_image_generation_id?: string | null
          slide_id: string
          slide_text?: string | null
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          layout_preset?: string | null
          selected_image_generation_id?: string | null
          slide_id?: string
          slide_text?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "slide_versions_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: false
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
      slides: {
        Row: {
          created_at: string
          id: string
          image_layout_params: Json | null
          image_url: string | null
          layout_analysis: string[] | null
          layout_preset: string | null
          post_id: string
          slide_index: number
          slide_text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_layout_params?: Json | null
          image_url?: string | null
          layout_analysis?: string[] | null
          layout_preset?: string | null
          post_id: string
          slide_index: number
          slide_text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_layout_params?: Json | null
          image_url?: string | null
          layout_analysis?: string[] | null
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
      social_connections: {
        Row: {
          account_name: string | null
          connected_at: string | null
          id: string
          pfm_account_id: string | null
          platform: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_name?: string | null
          connected_at?: string | null
          id?: string
          pfm_account_id?: string | null
          platform: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_name?: string | null
          connected_at?: string | null
          id?: string
          pfm_account_id?: string | null
          platform?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          brand_limit: number
          created_at: string | null
          display_name: string
          features: Json | null
          generation_limit: number
          id: string
          is_active: boolean | null
          name: string
          price_monthly: number
          price_yearly: number | null
        }
        Insert: {
          brand_limit: number
          created_at?: string | null
          display_name: string
          features?: Json | null
          generation_limit: number
          id?: string
          is_active?: boolean | null
          name: string
          price_monthly: number
          price_yearly?: number | null
        }
        Update: {
          brand_limit?: number
          created_at?: string | null
          display_name?: string
          features?: Json | null
          generation_limit?: number
          id?: string
          is_active?: boolean | null
          name?: string
          price_monthly?: number
          price_yearly?: number | null
        }
        Relationships: []
      }
      system_template_sets: {
        Row: {
          category: string
          content_format: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_native: boolean
          name: string
          preview_colors: Json | null
          preview_images: Json | null
          reference_images: Json | null
          sort_order: number
          style_prompt: string | null
          supported_formats: string[] | null
          supported_platforms: string[] | null
          template_set: Json
        }
        Insert: {
          category?: string
          content_format?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_native?: boolean
          name: string
          preview_colors?: Json | null
          preview_images?: Json | null
          reference_images?: Json | null
          sort_order?: number
          style_prompt?: string | null
          supported_formats?: string[] | null
          supported_platforms?: string[] | null
          template_set?: Json
        }
        Update: {
          category?: string
          content_format?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_native?: boolean
          name?: string
          preview_colors?: Json | null
          preview_images?: Json | null
          reference_images?: Json | null
          sort_order?: number
          style_prompt?: string | null
          supported_formats?: string[] | null
          supported_platforms?: string[] | null
          template_set?: Json
        }
        Relationships: []
      }
      templates: {
        Row: {
          aspect_ratio: string
          aspect_ratios: string[]
          badge: string | null
          blotato_template_id: string
          blotato_template_key: string
          brand_slots: string[] | null
          category: string
          cost_credits: number
          created_at: string | null
          description: string | null
          engine: string
          format: string
          id: string
          input_schema: Json
          is_active: boolean
          is_free: boolean
          is_personal: boolean
          name: string
          owner_user_id: string | null
          preview_url: string
          preview_video_url: string | null
          prompt_template: string | null
          slug: string
          sort_order: number
          updated_at: string
          viral_views: number | null
        }
        Insert: {
          aspect_ratio?: string
          aspect_ratios: string[]
          badge?: string | null
          blotato_template_id: string
          blotato_template_key: string
          brand_slots?: string[] | null
          category?: string
          cost_credits: number
          created_at?: string | null
          description?: string | null
          engine: string
          format: string
          id?: string
          input_schema: Json
          is_active?: boolean
          is_free?: boolean
          is_personal: boolean
          name: string
          owner_user_id?: string | null
          preview_url: string
          preview_video_url?: string | null
          prompt_template?: string | null
          slug: string
          sort_order?: number
          updated_at: string
          viral_views?: number | null
        }
        Update: {
          aspect_ratio?: string
          aspect_ratios?: string[]
          badge?: string | null
          blotato_template_id?: string
          blotato_template_key?: string
          brand_slots?: string[] | null
          category?: string
          cost_credits?: number
          created_at?: string | null
          description?: string | null
          engine?: string
          format?: string
          id?: string
          input_schema?: Json
          is_active?: boolean
          is_free?: boolean
          is_personal?: boolean
          name?: string
          owner_user_id?: string | null
          preview_url?: string
          preview_video_url?: string | null
          prompt_template?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
          viral_views?: number | null
        }
        Relationships: []
      }
      trends: {
        Row: {
          created_at: string
          description: string | null
          expires_at: string | null
          full_content: string | null
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
          full_content?: string | null
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
          full_content?: string | null
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
      user_photo_library: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_briefs: {
        Row: {
          composition_notes: string | null
          created_at: string
          emotion: string | null
          id: string
          key_message: string | null
          negative_elements: string | null
          palette: Json | null
          slide_id: string
          style: string | null
          text_limit_words: number | null
          text_on_image: boolean | null
          theme: string | null
          updated_at: string
          visual_metaphor: string | null
        }
        Insert: {
          composition_notes?: string | null
          created_at?: string
          emotion?: string | null
          id?: string
          key_message?: string | null
          negative_elements?: string | null
          palette?: Json | null
          slide_id: string
          style?: string | null
          text_limit_words?: number | null
          text_on_image?: boolean | null
          theme?: string | null
          updated_at?: string
          visual_metaphor?: string | null
        }
        Update: {
          composition_notes?: string | null
          created_at?: string
          emotion?: string | null
          id?: string
          key_message?: string | null
          negative_elements?: string | null
          palette?: Json | null
          slide_id?: string
          style?: string | null
          text_limit_words?: number | null
          text_on_image?: boolean | null
          theme?: string | null
          updated_at?: string
          visual_metaphor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visual_briefs_slide_id_fkey"
            columns: ["slide_id"]
            isOneToOne: true
            referencedRelation: "slides"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      debit_credits: {
        Args: {
          p_amount: number
          p_content_id?: string
          p_template_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      get_cron_users_due: {
        Args: never
        Returns: {
          brand_voice: string
          business_niche: string
          content_topics: string[]
          extra_context: Json
          qty_suggestions: number
          user_id: string
          whatsapp_number: string
        }[]
      }
      is_brand_visible_to_user: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      reset_monthly_credits: {
        Args: { p_reset_amount?: number }
        Returns: number
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
