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
      aura_conversation_memory: {
        Row: {
          actions_committed: string[] | null
          content: string | null
          created_at: string | null
          id: string
          key_decisions: string[] | null
          metadata: Json | null
          role: string | null
          session_date: string
          session_id: string | null
          summary: string | null
          topics_discussed: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          actions_committed?: string[] | null
          content?: string | null
          created_at?: string | null
          id?: string
          key_decisions?: string[] | null
          metadata?: Json | null
          role?: string | null
          session_date?: string
          session_id?: string | null
          summary?: string | null
          topics_discussed?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          actions_committed?: string[] | null
          content?: string | null
          created_at?: string | null
          id?: string
          key_decisions?: string[] | null
          metadata?: Json | null
          role?: string | null
          session_date?: string
          session_id?: string | null
          summary?: string | null
          topics_discussed?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      authority_scores: {
        Row: {
          authority_score: number
          consistency_score: number
          created_at: string
          engagement_score: number
          id: string
          momentum_score: number
          snapshot_date: string
          strategic_resonance_score: number
          user_id: string
        }
        Insert: {
          authority_score?: number
          consistency_score?: number
          created_at?: string
          engagement_score?: number
          id?: string
          momentum_score?: number
          snapshot_date?: string
          strategic_resonance_score?: number
          user_id: string
        }
        Update: {
          authority_score?: number
          consistency_score?: number
          created_at?: string
          engagement_score?: number
          id?: string
          momentum_score?: number
          snapshot_date?: string
          strategic_resonance_score?: number
          user_id?: string
        }
        Relationships: []
      }
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
      beta_allowlist: {
        Row: {
          activated_at: string | null
          created_at: string | null
          email: string
          id: string
          invited_at: string | null
          invited_by: string | null
          name: string | null
          personal_note: string | null
          requested_at: string | null
          sector: string | null
          seniority: string | null
          source: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          name?: string | null
          personal_note?: string | null
          requested_at?: string | null
          sector?: string | null
          seniority?: string | null
          source?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          name?: string | null
          personal_note?: string | null
          requested_at?: string | null
          sector?: string | null
          seniority?: string | null
          source?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          created_at: string | null
          feedback_type: string | null
          id: string
          message: string | null
          page: string | null
          rating: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          feedback_type?: string | null
          id?: string
          message?: string | null
          page?: string | null
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          feedback_type?: string | null
          id?: string
          message?: string | null
          page?: string | null
          rating?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      captures: {
        Row: {
          created_at: string
          error_message: string | null
          extracted_text: string | null
          id: string
          metadata: Json | null
          processing_status: string
          raw_content: string | null
          source_url: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          metadata?: Json | null
          processing_status?: string
          raw_content?: string | null
          source_url?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          metadata?: Json | null
          processing_status?: string
          raw_content?: string | null
          source_url?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          linked_id: string | null
          linked_label: string | null
          linked_type: string | null
          pinned: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_id?: string | null
          linked_label?: string | null
          linked_type?: string | null
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_id?: string | null
          linked_label?: string | null
          linked_type?: string | null
          pinned?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          mode: string | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          mode?: string | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          mode?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          body: string
          created_at: string
          generation_params: Json
          id: string
          language: string
          signal_id: string | null
          status: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          generation_params?: Json
          id?: string
          language?: string
          signal_id?: string | null
          status?: string
          title?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          generation_params?: Json
          id?: string
          language?: string
          signal_id?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "strategic_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      content_topics: {
        Row: {
          avg_engagement: number
          created_at: string
          id: string
          label: string
          parent_topic_id: string | null
          post_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_engagement?: number
          created_at?: string
          id?: string
          label: string
          parent_topic_id?: string | null
          post_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_engagement?: number
          created_at?: string
          id?: string
          label?: string
          parent_topic_id?: string | null
          post_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_topics_parent_topic_id_fkey"
            columns: ["parent_topic_id"]
            isOneToOne: false
            referencedRelation: "content_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      design_system: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          scope: string
          tokens: Json
          updated_at: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          scope?: string
          tokens?: Json
          updated_at?: string | null
          version?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          scope?: string
          tokens?: Json
          updated_at?: string | null
          version?: number
        }
        Relationships: []
      }
      diagnostic_profiles: {
        Row: {
          audit_completed_at: string | null
          audit_interpretation: string | null
          audit_results: Json | null
          avatar_url: string | null
          brand_assessment_answers: Json | null
          brand_assessment_completed_at: string | null
          brand_assessment_results: Json | null
          brand_pillars: string[]
          completed: boolean
          core_practice: string | null
          created_at: string
          firm: string | null
          first_name: string | null
          generated_skills: Json
          id: string
          identity_intelligence: Json
          last_active_at: string | null
          last_name: string | null
          last_visit_at: string | null
          leadership_style: string | null
          level: string | null
          linkedin_url: string | null
          north_star_goal: string | null
          notification_prefs: Json | null
          onboarding_completed: boolean
          phone_verified: boolean | null
          phone_whatsapp: string | null
          primary_strength: string | null
          sector_focus: string | null
          skill_ratings: Json
          user_id: string
          years_experience: string | null
        }
        Insert: {
          audit_completed_at?: string | null
          audit_interpretation?: string | null
          audit_results?: Json | null
          avatar_url?: string | null
          brand_assessment_answers?: Json | null
          brand_assessment_completed_at?: string | null
          brand_assessment_results?: Json | null
          brand_pillars?: string[]
          completed?: boolean
          core_practice?: string | null
          created_at?: string
          firm?: string | null
          first_name?: string | null
          generated_skills?: Json
          id?: string
          identity_intelligence?: Json
          last_active_at?: string | null
          last_name?: string | null
          last_visit_at?: string | null
          leadership_style?: string | null
          level?: string | null
          linkedin_url?: string | null
          north_star_goal?: string | null
          notification_prefs?: Json | null
          onboarding_completed?: boolean
          phone_verified?: boolean | null
          phone_whatsapp?: string | null
          primary_strength?: string | null
          sector_focus?: string | null
          skill_ratings?: Json
          user_id: string
          years_experience?: string | null
        }
        Update: {
          audit_completed_at?: string | null
          audit_interpretation?: string | null
          audit_results?: Json | null
          avatar_url?: string | null
          brand_assessment_answers?: Json | null
          brand_assessment_completed_at?: string | null
          brand_assessment_results?: Json | null
          brand_pillars?: string[]
          completed?: boolean
          core_practice?: string | null
          created_at?: string
          firm?: string | null
          first_name?: string | null
          generated_skills?: Json
          id?: string
          identity_intelligence?: Json
          last_active_at?: string | null
          last_name?: string | null
          last_visit_at?: string | null
          leadership_style?: string | null
          level?: string | null
          linkedin_url?: string | null
          north_star_goal?: string | null
          notification_prefs?: Json | null
          onboarding_completed?: boolean
          phone_verified?: boolean | null
          phone_whatsapp?: string | null
          primary_strength?: string | null
          sector_focus?: string | null
          skill_ratings?: Json
          user_id?: string
          years_experience?: string | null
        }
        Relationships: []
      }
      discovery_review_queue: {
        Row: {
          authorship_signals: Json
          candidate_url: string
          confidence: number
          created_at: string
          id: string
          rejection_reason: string
          reviewed: boolean
          snippet: string | null
          user_id: string
        }
        Insert: {
          authorship_signals?: Json
          candidate_url: string
          confidence?: number
          created_at?: string
          id?: string
          rejection_reason?: string
          reviewed?: boolean
          snippet?: string | null
          user_id: string
        }
        Update: {
          authorship_signals?: Json
          candidate_url?: string
          confidence?: number
          created_at?: string
          id?: string
          rejection_reason?: string
          reviewed?: boolean
          snippet?: string | null
          user_id?: string
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
          error_message: string | null
          file_size: number | null
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
          error_message?: string | null
          file_size?: number | null
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
          error_message?: string | null
          file_size?: number | null
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
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          duplicate_rows: number
          error_details: Json | null
          filename: string | null
          id: string
          import_type: string
          imported_rows: number
          skipped_rows: number
          started_at: string | null
          status: string
          total_rows: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duplicate_rows?: number
          error_details?: Json | null
          filename?: string | null
          id?: string
          import_type?: string
          imported_rows?: number
          skipped_rows?: number
          started_at?: string | null
          status?: string
          total_rows?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duplicate_rows?: number
          error_details?: Json | null
          filename?: string | null
          id?: string
          import_type?: string
          imported_rows?: number
          skipped_rows?: number
          started_at?: string | null
          status?: string
          total_rows?: number
          user_id?: string
        }
        Relationships: []
      }
      industry_trends: {
        Row: {
          action_recommendation: string | null
          canonical_url: string | null
          category: string | null
          confidence_level: string | null
          content_angle: string | null
          content_clean: string | null
          content_markdown: string | null
          content_quality_score: number
          content_raw: string | null
          content_text: string | null
          decision_label: string | null
          fetched_at: string
          final_score: number
          headline: string
          id: string
          impact_level: string | null
          insight: string
          is_valid: boolean
          last_checked_at: string | null
          opportunity_type: string | null
          published_at: string | null
          rejection_reason: string | null
          relevance_score: number
          selection_reason: string | null
          signal_type: string | null
          snapshot_quality: number
          source: string
          status: string
          summary: string | null
          topic_relevance_score: number
          url: string | null
          user_id: string
          validation_score: number
          validation_status: string
        }
        Insert: {
          action_recommendation?: string | null
          canonical_url?: string | null
          category?: string | null
          confidence_level?: string | null
          content_angle?: string | null
          content_clean?: string | null
          content_markdown?: string | null
          content_quality_score?: number
          content_raw?: string | null
          content_text?: string | null
          decision_label?: string | null
          fetched_at?: string
          final_score?: number
          headline: string
          id?: string
          impact_level?: string | null
          insight: string
          is_valid?: boolean
          last_checked_at?: string | null
          opportunity_type?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          relevance_score?: number
          selection_reason?: string | null
          signal_type?: string | null
          snapshot_quality?: number
          source: string
          status?: string
          summary?: string | null
          topic_relevance_score?: number
          url?: string | null
          user_id: string
          validation_score?: number
          validation_status?: string
        }
        Update: {
          action_recommendation?: string | null
          canonical_url?: string | null
          category?: string | null
          confidence_level?: string | null
          content_angle?: string | null
          content_clean?: string | null
          content_markdown?: string | null
          content_quality_score?: number
          content_raw?: string | null
          content_text?: string | null
          decision_label?: string | null
          fetched_at?: string
          final_score?: number
          headline?: string
          id?: string
          impact_level?: string | null
          insight?: string
          is_valid?: boolean
          last_checked_at?: string | null
          opportunity_type?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          relevance_score?: number
          selection_reason?: string | null
          signal_type?: string | null
          snapshot_quality?: number
          source?: string
          status?: string
          summary?: string | null
          topic_relevance_score?: number
          url?: string | null
          user_id?: string
          validation_score?: number
          validation_status?: string
        }
        Relationships: []
      }
      influence_snapshots: {
        Row: {
          audience_breakdown: Json
          authority_themes: Json
          authority_trajectory: string | null
          comments: number
          created_at: string
          engagement_rate: number
          follower_growth: number
          followers: number
          format_breakdown: Json
          id: string
          impressions: number
          post_count: number
          posts_count: number
          reactions: number
          recommendations: Json
          saves: number
          shares: number
          snapshot_date: string
          source_type: string
          tone_analysis: Json
          top_format: string | null
          top_topic: string | null
          user_id: string
        }
        Insert: {
          audience_breakdown?: Json
          authority_themes?: Json
          authority_trajectory?: string | null
          comments?: number
          created_at?: string
          engagement_rate?: number
          follower_growth?: number
          followers?: number
          format_breakdown?: Json
          id?: string
          impressions?: number
          post_count?: number
          posts_count?: number
          reactions?: number
          recommendations?: Json
          saves?: number
          shares?: number
          snapshot_date?: string
          source_type?: string
          tone_analysis?: Json
          top_format?: string | null
          top_topic?: string | null
          user_id: string
        }
        Update: {
          audience_breakdown?: Json
          authority_themes?: Json
          authority_trajectory?: string | null
          comments?: number
          created_at?: string
          engagement_rate?: number
          follower_growth?: number
          followers?: number
          format_breakdown?: Json
          id?: string
          impressions?: number
          post_count?: number
          posts_count?: number
          reactions?: number
          recommendations?: Json
          saves?: number
          shares?: number
          snapshot_date?: string
          source_type?: string
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
      lifecycle_emails: {
        Row: {
          email_type: string
          id: string
          metadata: Json | null
          sent_at: string | null
          user_id: string | null
        }
        Insert: {
          email_type: string
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          user_id?: string | null
        }
        Update: {
          email_type?: string
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      linkedin_connections: {
        Row: {
          access_token: string
          connected_at: string | null
          created_at: string | null
          display_name: string | null
          handle: string | null
          id: string
          last_synced_at: string | null
          linkedin_id: string | null
          profile_name: string | null
          profile_url: string | null
          refresh_token: string | null
          scopes: string[] | null
          source_status: string
          status: string
          timezone: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          linkedin_id?: string | null
          profile_name?: string | null
          profile_url?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          source_status?: string
          status?: string
          timezone?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          linkedin_id?: string | null
          profile_name?: string | null
          profile_url?: string | null
          refresh_token?: string | null
          scopes?: string[] | null
          source_status?: string
          status?: string
          timezone?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      linkedin_post_metrics: {
        Row: {
          comments: number
          created_at: string
          engagement_rate: number
          id: string
          impressions: number
          post_id: string
          reactions: number
          saves: number
          shares: number
          snapshot_date: string
          source_type: string
          user_id: string
        }
        Insert: {
          comments?: number
          created_at?: string
          engagement_rate?: number
          id?: string
          impressions?: number
          post_id: string
          reactions?: number
          saves?: number
          shares?: number
          snapshot_date?: string
          source_type?: string
          user_id: string
        }
        Update: {
          comments?: number
          created_at?: string
          engagement_rate?: number
          id?: string
          impressions?: number
          post_id?: string
          reactions?: number
          saves?: number
          shares?: number
          snapshot_date?: string
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "influence_dashboard_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linkedin_post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "linkedin_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_posts: {
        Row: {
          carousel_structure_type: string | null
          comment_count: number
          content_engine_output_type: string | null
          content_type: string | null
          created_at: string
          cta_style: string | null
          engagement_score: number
          enriched_by: string[]
          format_type: string | null
          framework_type: string | null
          hook: string | null
          hook_style: string | null
          id: string
          like_count: number
          linkedin_post_id: string | null
          linkedin_url: string | null
          media_type: string | null
          post_text: string | null
          post_url: string | null
          published_at: string | null
          published_confirmed_at: string | null
          quality_score: Json | null
          rejection_reason: string | null
          repost_count: number
          source_metadata: Json
          source_signal_id: string | null
          source_trust: number
          source_type: string
          synced_at: string
          theme: string | null
          title: string | null
          tone: string | null
          topic_label: string | null
          tracking_status: string
          user_id: string
          visual_strategy_type: string | null
          visual_style: string | null
        }
        Insert: {
          carousel_structure_type?: string | null
          comment_count?: number
          content_engine_output_type?: string | null
          content_type?: string | null
          created_at?: string
          cta_style?: string | null
          engagement_score?: number
          enriched_by?: string[]
          format_type?: string | null
          framework_type?: string | null
          hook?: string | null
          hook_style?: string | null
          id?: string
          like_count?: number
          linkedin_post_id?: string | null
          linkedin_url?: string | null
          media_type?: string | null
          post_text?: string | null
          post_url?: string | null
          published_at?: string | null
          published_confirmed_at?: string | null
          quality_score?: Json | null
          rejection_reason?: string | null
          repost_count?: number
          source_metadata?: Json
          source_signal_id?: string | null
          source_trust?: number
          source_type?: string
          synced_at?: string
          theme?: string | null
          title?: string | null
          tone?: string | null
          topic_label?: string | null
          tracking_status?: string
          user_id: string
          visual_strategy_type?: string | null
          visual_style?: string | null
        }
        Update: {
          carousel_structure_type?: string | null
          comment_count?: number
          content_engine_output_type?: string | null
          content_type?: string | null
          created_at?: string
          cta_style?: string | null
          engagement_score?: number
          enriched_by?: string[]
          format_type?: string | null
          framework_type?: string | null
          hook?: string | null
          hook_style?: string | null
          id?: string
          like_count?: number
          linkedin_post_id?: string | null
          linkedin_url?: string | null
          media_type?: string | null
          post_text?: string | null
          post_url?: string | null
          published_at?: string | null
          published_confirmed_at?: string | null
          quality_score?: Json | null
          rejection_reason?: string | null
          repost_count?: number
          source_metadata?: Json
          source_signal_id?: string | null
          source_trust?: number
          source_type?: string
          synced_at?: string
          theme?: string | null
          title?: string | null
          tone?: string | null
          topic_label?: string | null
          tracking_status?: string
          user_id?: string
          visual_strategy_type?: string | null
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_posts_source_signal_id_fkey"
            columns: ["source_signal_id"]
            isOneToOne: false
            referencedRelation: "strategic_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      market_mirror_cache: {
        Row: {
          client_cio_text: string | null
          curator_text: string | null
          gaps: Json | null
          generated_at: string
          headhunter_text: string | null
          id: string
          user_id: string
        }
        Insert: {
          client_cio_text?: string | null
          curator_text?: string | null
          gaps?: Json | null
          generated_at?: string
          headhunter_text?: string | null
          id?: string
          user_id: string
        }
        Update: {
          client_cio_text?: string | null
          curator_text?: string | null
          gaps?: Json | null
          generated_at?: string
          headhunter_text?: string | null
          id?: string
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
      notification_events: {
        Row: {
          acted_on: boolean | null
          body: string | null
          channel: string
          expires_at: string | null
          id: string
          metadata: Json | null
          read: boolean | null
          read_at: string | null
          sent_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          acted_on?: boolean | null
          body?: string | null
          channel: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          read?: boolean | null
          read_at?: string | null
          sent_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          acted_on?: boolean | null
          body?: string | null
          channel?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          read?: boolean | null
          read_at?: string | null
          sent_at?: string | null
          title?: string
          type?: string
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
      page_backgrounds: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          gradient_overlay: string | null
          id: string
          image_url: string | null
          opacity: number | null
          page_key: string
          position: string | null
          theme: string
          tint_color: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          gradient_overlay?: string | null
          id?: string
          image_url?: string | null
          opacity?: number | null
          page_key: string
          position?: string | null
          theme?: string
          tint_color?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          gradient_overlay?: string | null
          id?: string
          image_url?: string | null
          opacity?: number | null
          page_key?: string
          position?: string | null
          theme?: string
          tint_color?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      qa_audit_results: {
        Row: {
          category: string
          details: Json | null
          id: string
          layer: string
          run_at: string | null
          run_by: string | null
          run_id: string
          status: string
          test_id: string
          test_name: string
        }
        Insert: {
          category: string
          details?: Json | null
          id?: string
          layer: string
          run_at?: string | null
          run_by?: string | null
          run_id: string
          status: string
          test_id: string
          test_name: string
        }
        Update: {
          category?: string
          details?: Json | null
          id?: string
          layer?: string
          run_at?: string | null
          run_by?: string | null
          run_id?: string
          status?: string
          test_id?: string
          test_name?: string
        }
        Relationships: []
      }
      qa_reports: {
        Row: {
          failed: number | null
          id: string
          passed: number | null
          results: Json | null
          run_at: string | null
          total_checks: number | null
          triggered_by: string | null
        }
        Insert: {
          failed?: number | null
          id?: string
          passed?: number | null
          results?: Json | null
          run_at?: string | null
          total_checks?: number | null
          triggered_by?: string | null
        }
        Update: {
          failed?: number | null
          id?: string
          passed?: number | null
          results?: Json | null
          run_at?: string | null
          total_checks?: number | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      recommended_moves: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          metadata: Json
          output_type: string
          rationale: string
          source_signal_ids: string[]
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          metadata?: Json
          output_type?: string
          rationale?: string
          source_signal_ids?: string[]
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          metadata?: Json
          output_type?: string
          rationale?: string
          source_signal_ids?: string[]
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      score_snapshots: {
        Row: {
          components: Json
          created_at: string
          id: string
          score: number
          tier: string | null
          user_id: string
        }
        Insert: {
          components?: Json
          created_at?: string
          id?: string
          score?: number
          tier?: string | null
          user_id: string
        }
        Update: {
          components?: Json
          created_at?: string
          id?: string
          score?: number
          tier?: string | null
          user_id?: string
        }
        Relationships: []
      }
      signal_topic_preferences: {
        Row: {
          id: string
          preference_score: number | null
          theme_tag: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          preference_score?: number | null
          theme_tag: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          preference_score?: number | null
          theme_tag?: string
          updated_at?: string | null
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
          commercial_validation_score: number | null
          confidence: number
          confidence_explanation: string | null
          consulting_opportunity: Json | null
          content_opportunity: Json | null
          created_at: string
          explanation: string
          fragment_count: number
          framework_opportunity: Json | null
          id: string
          last_decay_at: string | null
          priority_score: number
          signal_title: string
          signal_velocity: number | null
          skill_pillars: string[]
          status: string
          strategic_implications: string
          supporting_evidence_ids: string[]
          theme_tags: string[]
          unique_orgs: number
          updated_at: string
          user_id: string
          user_signal_feedback: string | null
          velocity_status: string | null
          what_it_means_for_you: string | null
        }
        Insert: {
          commercial_validation_score?: number | null
          confidence?: number
          confidence_explanation?: string | null
          consulting_opportunity?: Json | null
          content_opportunity?: Json | null
          created_at?: string
          explanation: string
          fragment_count?: number
          framework_opportunity?: Json | null
          id?: string
          last_decay_at?: string | null
          priority_score?: number
          signal_title: string
          signal_velocity?: number | null
          skill_pillars?: string[]
          status?: string
          strategic_implications: string
          supporting_evidence_ids?: string[]
          theme_tags?: string[]
          unique_orgs?: number
          updated_at?: string
          user_id: string
          user_signal_feedback?: string | null
          velocity_status?: string | null
          what_it_means_for_you?: string | null
        }
        Update: {
          commercial_validation_score?: number | null
          confidence?: number
          confidence_explanation?: string | null
          consulting_opportunity?: Json | null
          content_opportunity?: Json | null
          created_at?: string
          explanation?: string
          fragment_count?: number
          framework_opportunity?: Json | null
          id?: string
          last_decay_at?: string | null
          priority_score?: number
          signal_title?: string
          signal_velocity?: number | null
          skill_pillars?: string[]
          status?: string
          strategic_implications?: string
          supporting_evidence_ids?: string[]
          theme_tags?: string[]
          unique_orgs?: number
          updated_at?: string
          user_id?: string
          user_signal_feedback?: string | null
          velocity_status?: string | null
          what_it_means_for_you?: string | null
        }
        Relationships: []
      }
      sync_errors: {
        Row: {
          context: Json | null
          created_at: string
          error_message: string
          error_type: string
          id: string
          sync_run_id: string | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_message: string
          error_type?: string
          id?: string
          sync_run_id?: string | null
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_message?: string
          error_type?: string
          id?: string
          sync_run_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_errors_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          account_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          records_fetched: number
          records_stored: number
          started_at: string
          status: string
          sync_type: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          records_fetched?: number
          records_stored?: number
          started_at?: string
          status?: string
          sync_type?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          records_fetched?: number
          records_stored?: number
          started_at?: string
          status?: string
          sync_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "linkedin_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "linkedin_connections_safe"
            referencedColumns: ["id"]
          },
        ]
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
      user_milestones: {
        Row: {
          acknowledged: boolean
          context: Json
          earned_at: string
          id: string
          milestone_id: string
          milestone_name: string
          shared: boolean
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          context?: Json
          earned_at?: string
          id?: string
          milestone_id: string
          milestone_name: string
          shared?: boolean
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          context?: Json
          earned_at?: string
          id?: string
          milestone_id?: string
          milestone_name?: string
          shared?: boolean
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      influence_dashboard_view: {
        Row: {
          comment_count: number | null
          comments: number | null
          content_type: string | null
          created_at: string | null
          engagement_rate: number | null
          engagement_score: number | null
          format_type: string | null
          hook: string | null
          id: string | null
          impressions: number | null
          like_count: number | null
          linkedin_post_id: string | null
          media_type: string | null
          metrics_date: string | null
          metrics_source_type: string | null
          post_text: string | null
          post_url: string | null
          published_at: string | null
          reactions: number | null
          repost_count: number | null
          saves: number | null
          shares: number | null
          source_type: string | null
          theme: string | null
          title: string | null
          tone: string | null
          topic_label: string | null
          tracking_status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      linkedin_connections_safe: {
        Row: {
          connected_at: string | null
          created_at: string | null
          display_name: string | null
          handle: string | null
          id: string | null
          last_synced_at: string | null
          linkedin_id: string | null
          profile_name: string | null
          profile_url: string | null
          scopes: string[] | null
          source_status: string | null
          status: string | null
          timezone: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          handle?: string | null
          id?: string | null
          last_synced_at?: string | null
          linkedin_id?: string | null
          profile_name?: string | null
          profile_url?: string | null
          scopes?: string[] | null
          source_status?: string | null
          status?: string | null
          timezone?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          handle?: string | null
          id?: string | null
          last_synced_at?: string | null
          linkedin_id?: string | null
          profile_name?: string | null
          profile_url?: string | null
          scopes?: string[] | null
          source_status?: string | null
          status?: string | null
          timezone?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      unified_content: {
        Row: {
          content_body: string | null
          created_at: string | null
          format_type: string | null
          id: string | null
          source_table: string | null
          status: string | null
          title: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_design_version: {
        Args: { p_created_by?: string; p_new_tokens: Json }
        Returns: string
      }
      rollback_design_version: {
        Args: { p_target_version: number }
        Returns: undefined
      }
      search_vault: {
        Args: { p_limit?: number; p_query: string; p_query_embedding?: string }
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
