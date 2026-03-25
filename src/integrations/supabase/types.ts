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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      authority_voice_profiles: {
        Row: {
          admired_posts: Json
          created_at: string
          example_posts: Json
          id: string
          preferred_structures: Json
          storytelling_patterns: Json
          tone: string
          updated_at: string
          user_id: string
          vocabulary_preferences: Json
        }
        Insert: {
          admired_posts?: Json
          created_at?: string
          example_posts?: Json
          id?: string
          preferred_structures?: Json
          storytelling_patterns?: Json
          tone?: string
          updated_at?: string
          user_id: string
          vocabulary_preferences?: Json
        }
        Update: {
          admired_posts?: Json
          created_at?: string
          example_posts?: Json
          id?: string
          preferred_structures?: Json
          storytelling_patterns?: Json
          tone?: string
          updated_at?: string
          user_id?: string
          vocabulary_preferences?: Json
        }
        Relationships: []
      }
      diagnostic_profiles: {
        Row: {
          brand_pillars: string[]
          completed: boolean
          core_practice: string | null
          created_at: string
          firm: string | null
          generated_skills: Json
          id: string
          identity_intelligence: Json
          last_active_at: string | null
          leadership_style: string | null
          level: string | null
          north_star_goal: string | null
          sector_focus: string | null
          skill_ratings: Json
          user_id: string
          years_experience: string | null
        }
        Insert: {
          brand_pillars?: string[]
          completed?: boolean
          core_practice?: string | null
          created_at?: string
          firm?: string | null
          generated_skills?: Json
          id?: string
          identity_intelligence?: Json
          last_active_at?: string | null
          leadership_style?: string | null
          level?: string | null
          north_star_goal?: string | null
          sector_focus?: string | null
          skill_ratings?: Json
          user_id: string
          years_experience?: string | null
        }
        Update: {
          brand_pillars?: string[]
          completed?: boolean
          core_practice?: string | null
          created_at?: string
          firm?: string | null
          generated_skills?: Json
          id?: string
          identity_intelligence?: Json
          last_active_at?: string | null
          leadership_style?: string | null
          level?: string | null
          north_star_goal?: string | null
          sector_focus?: string | null
          skill_ratings?: Json
          user_id?: string
          years_experience?: string | null
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
          tsv: unknown
          user_id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          tsv?: unknown
          user_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          tsv?: unknown
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          file_type: string
          file_url: string
          filename: string
          id: string
          page_count: number | null
          status: string
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_type: string
          file_url: string
          filename: string
          id?: string
          page_count?: number | null
          status?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          file_type?: string
          file_url?: string
          filename?: string
          id?: string
          page_count?: number | null
          status?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          account_name: string | null
          content: string
          created_at: string
          embedding: string | null
          framework_tag: string | null
          has_strategic_insight: boolean
          id: string
          image_url: string | null
          pinned: boolean
          skill_pillar: string | null
          summary: string | null
          title: string | null
          tsv: unknown
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          content: string
          created_at?: string
          embedding?: string | null
          framework_tag?: string | null
          has_strategic_insight?: boolean
          id?: string
          image_url?: string | null
          pinned?: boolean
          skill_pillar?: string | null
          summary?: string | null
          title?: string | null
          tsv?: unknown
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          content?: string
          created_at?: string
          embedding?: string | null
          framework_tag?: string | null
          has_strategic_insight?: boolean
          id?: string
          image_url?: string | null
          pinned?: boolean
          skill_pillar?: string | null
          summary?: string | null
          title?: string | null
          tsv?: unknown
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evidence_fragments: {
        Row: {
          confidence: number
          content: string
          created_at: string
          embedding: string | null
          entities: Json | null
          fragment_type: string
          id: string
          metadata: Json | null
          skill_pillars: string[]
          source_registry_id: string
          tags: string[]
          title: string
          tsv: unknown
          user_id: string
        }
        Insert: {
          confidence?: number
          content: string
          created_at?: string
          embedding?: string | null
          entities?: Json | null
          fragment_type: string
          id?: string
          metadata?: Json | null
          skill_pillars?: string[]
          source_registry_id: string
          tags?: string[]
          title: string
          tsv?: unknown
          user_id: string
        }
        Update: {
          confidence?: number
          content?: string
          created_at?: string
          embedding?: string | null
          entities?: Json | null
          fragment_type?: string
          id?: string
          metadata?: Json | null
          skill_pillars?: string[]
          source_registry_id?: string
          tags?: string[]
          title?: string
          tsv?: unknown
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_fragments_source_registry_id_fkey"
            columns: ["source_registry_id"]
            isOneToOne: false
            referencedRelation: "source_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      framework_activations: {
        Row: {
          content: string
          created_at: string
          framework_id: string
          id: string
          metadata: Json | null
          output_type: string
          title: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          framework_id: string
          id?: string
          metadata?: Json | null
          output_type: string
          title: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          framework_id?: string
          id?: string
          metadata?: Json | null
          output_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "framework_activations_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "master_frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      influence_snapshots: {
        Row: {
          audience_breakdown: Json
          authority_themes: Json
          authority_trajectory: string | null
          created_at: string
          engagement_rate: number
          follower_growth: number
          followers: number
          format_breakdown: Json
          id: string
          post_count: number
          recommendations: Json
          snapshot_date: string
          tone_analysis: Json
          top_format: string | null
          top_topic: string | null
          user_id: string
        }
        Insert: {
          audience_breakdown?: Json
          authority_themes?: Json
          authority_trajectory?: string | null
          created_at?: string
          engagement_rate?: number
          follower_growth?: number
          followers?: number
          format_breakdown?: Json
          id?: string
          post_count?: number
          recommendations?: Json
          snapshot_date?: string
          tone_analysis?: Json
          top_format?: string | null
          top_topic?: string | null
          user_id: string
        }
        Update: {
          audience_breakdown?: Json
          authority_themes?: Json
          authority_trajectory?: string | null
          created_at?: string
          engagement_rate?: number
          follower_growth?: number
          followers?: number
          format_breakdown?: Json
          id?: string
          post_count?: number
          recommendations?: Json
          snapshot_date?: string
          tone_analysis?: Json
          top_format?: string | null
          top_topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      learned_intelligence: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          intelligence_type: string
          skill_boost_pct: number
          skill_pillars: string[]
          source_document_id: string | null
          source_entry_id: string | null
          tags: string[]
          title: string
          tsv: unknown
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          intelligence_type?: string
          skill_boost_pct?: number
          skill_pillars?: string[]
          source_document_id?: string | null
          source_entry_id?: string | null
          tags?: string[]
          title: string
          tsv?: unknown
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          intelligence_type?: string
          skill_boost_pct?: number
          skill_pillars?: string[]
          source_document_id?: string | null
          source_entry_id?: string | null
          tags?: string[]
          title?: string
          tsv?: unknown
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learned_intelligence_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learned_intelligence_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_connections: {
        Row: {
          access_token: string
          connected_at: string | null
          created_at: string | null
          display_name: string | null
          id: string
          last_synced_at: string | null
          linkedin_id: string | null
          refresh_token: string | null
          scopes: string[] | null
          status: string
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_synced_at?: string | null
          linkedin_id?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          last_synced_at?: string | null
          linkedin_id?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      linkedin_posts: {
        Row: {
          comment_count: number
          created_at: string
          engagement_score: number
          format_type: string | null
          id: string
          like_count: number
          linkedin_post_id: string
          media_type: string | null
          post_text: string | null
          published_at: string | null
          repost_count: number
          synced_at: string
          theme: string | null
          tone: string | null
          user_id: string
        }
        Insert: {
          comment_count?: number
          created_at?: string
          engagement_score?: number
          format_type?: string | null
          id?: string
          like_count?: number
          linkedin_post_id: string
          media_type?: string | null
          post_text?: string | null
          published_at?: string | null
          repost_count?: number
          synced_at?: string
          theme?: string | null
          tone?: string | null
          user_id: string
        }
        Update: {
          comment_count?: number
          created_at?: string
          engagement_score?: number
          format_type?: string | null
          id?: string
          like_count?: number
          linkedin_post_id?: string
          media_type?: string | null
          post_text?: string | null
          published_at?: string | null
          repost_count?: number
          synced_at?: string
          theme?: string | null
          tone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      master_frameworks: {
        Row: {
          created_at: string
          diagram_description: Json | null
          diagram_url: string | null
          entry_id: string | null
          framework_steps: Json
          id: string
          source_type: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          diagram_description?: Json | null
          diagram_url?: string | null
          entry_id?: string | null
          framework_steps?: Json
          id?: string
          source_type?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          diagram_description?: Json | null
          diagram_url?: string | null
          entry_id?: string | null
          framework_steps?: Json
          id?: string
          source_type?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_frameworks_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      narrative_suggestions: {
        Row: {
          angle: string
          created_at: string
          id: string
          reason: string
          recommended_format: string
          source_signal_id: string | null
          status: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          angle?: string
          created_at?: string
          id?: string
          reason?: string
          recommended_format?: string
          source_signal_id?: string | null
          status?: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          angle?: string
          created_at?: string
          id?: string
          reason?: string
          recommended_format?: string
          source_signal_id?: string | null
          status?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          metadata: Json | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          metadata?: Json | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      skill_targets: {
        Row: {
          created_at: string
          id: string
          pillar: string
          target_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pillar: string
          target_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pillar?: string
          target_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      source_registry: {
        Row: {
          content_preview: string | null
          created_at: string
          fragment_count: number
          id: string
          processed: boolean
          processed_at: string | null
          source_id: string
          source_metadata: Json | null
          source_type: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content_preview?: string | null
          created_at?: string
          fragment_count?: number
          id?: string
          processed?: boolean
          processed_at?: string | null
          source_id: string
          source_metadata?: Json | null
          source_type: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content_preview?: string | null
          created_at?: string
          fragment_count?: number
          id?: string
          processed?: boolean
          processed_at?: string | null
          source_id?: string
          source_metadata?: Json | null
          source_type?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategic_signals: {
        Row: {
          confidence: number
          consulting_opportunity: Json | null
          content_opportunity: Json | null
          created_at: string
          explanation: string
          fragment_count: number
          framework_opportunity: Json | null
          id: string
          signal_title: string
          skill_pillars: string[]
          status: string
          strategic_implications: string
          supporting_evidence_ids: string[]
          theme_tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          consulting_opportunity?: Json | null
          content_opportunity?: Json | null
          created_at?: string
          explanation: string
          fragment_count?: number
          framework_opportunity?: Json | null
          id?: string
          signal_title: string
          skill_pillars?: string[]
          status?: string
          strategic_implications: string
          supporting_evidence_ids?: string[]
          theme_tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          consulting_opportunity?: Json | null
          content_opportunity?: Json | null
          created_at?: string
          explanation?: string
          fragment_count?: number
          framework_opportunity?: Json | null
          id?: string
          signal_title?: string
          skill_pillars?: string[]
          status?: string
          strategic_implications?: string
          supporting_evidence_ids?: string[]
          theme_tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_logs: {
        Row: {
          created_at: string
          duration_hours: number
          id: string
          pillar: string
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_hours?: number
          id?: string
          pillar: string
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_hours?: number
          id?: string
          pillar?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_vault:
        | {
            Args: { p_limit?: number; p_query: string; p_user_id: string }
            Returns: {
              content: string
              created_at: string
              id: string
              pinned: boolean
              rank: number
              skill_pillar: string
              source: string
              summary: string
              title: string
              type: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_query: string
              p_query_embedding?: string
              p_user_id: string
            }
            Returns: {
              content: string
              created_at: string
              id: string
              pinned: boolean
              rank: number
              skill_pillar: string
              source: string
              summary: string
              title: string
              type: string
            }[]
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
