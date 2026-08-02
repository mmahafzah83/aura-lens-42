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
      _probe_resp: {
        Row: {
          content: string | null
          id: number | null
          status: number | null
          ts: string | null
        }
        Insert: {
          content?: string | null
          id?: number | null
          status?: number | null
          ts?: string | null
        }
        Update: {
          content?: string | null
          id?: number | null
          status?: number | null
          ts?: string | null
        }
        Relationships: []
      }
      admin_action_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json | null
          id: string
          result: string | null
          target_ref: string | null
          target_user_id: string | null
          task: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          result?: string | null
          target_ref?: string | null
          target_user_id?: string | null
          task?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          result?: string | null
          target_ref?: string | null
          target_user_id?: string | null
          task?: string | null
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      agent_findings: {
        Row: {
          created_at: string
          dropped_themes: string[]
          entry_id: string | null
          error_detail: string | null
          id: string
          implication: string | null
          perplexity_raw: Json | null
          relevance_score: number | null
          source: string | null
          status: string
          themes: string[]
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dropped_themes?: string[]
          entry_id?: string | null
          error_detail?: string | null
          id?: string
          implication?: string | null
          perplexity_raw?: Json | null
          relevance_score?: number | null
          source?: string | null
          status?: string
          themes?: string[]
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          dropped_themes?: string[]
          entry_id?: string | null
          error_detail?: string | null
          id?: string
          implication?: string | null
          perplexity_raw?: Json | null
          relevance_score?: number | null
          source?: string | null
          status?: string
          themes?: string[]
          title?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          created_at: string
          est_cost_usd: number | null
          function_name: string
          id: string
          input_tokens: number | null
          metadata: Json | null
          model: string | null
          output_tokens: number | null
          provider: string
          success: boolean | null
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          est_cost_usd?: number | null
          function_name: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          provider: string
          success?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          est_cost_usd?: number | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          provider?: string
          success?: boolean | null
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      api_health_checks: {
        Row: {
          checked: number
          created_at: string
          failed: number
          id: string
          results: Json
          run_at: string
        }
        Insert: {
          checked?: number
          created_at?: string
          failed?: number
          id?: string
          results?: Json
          run_at?: string
        }
        Update: {
          checked?: number
          created_at?: string
          failed?: number
          id?: string
          results?: Json
          run_at?: string
        }
        Relationships: []
      }
      audience_demographics: {
        Row: {
          category: string
          id: string
          imported_at: string | null
          percentage: string
          percentage_numeric: number | null
          period_end: string | null
          period_start: string | null
          source_type: string | null
          upload_batch_id: string | null
          user_id: string
          value: string
        }
        Insert: {
          category: string
          id?: string
          imported_at?: string | null
          percentage: string
          percentage_numeric?: number | null
          period_end?: string | null
          period_start?: string | null
          source_type?: string | null
          upload_batch_id?: string | null
          user_id: string
          value: string
        }
        Update: {
          category?: string
          id?: string
          imported_at?: string | null
          percentage?: string
          percentage_numeric?: number | null
          period_end?: string | null
          period_start?: string | null
          source_type?: string | null
          upload_batch_id?: string | null
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      audience_insights: {
        Row: {
          audience_gaps: string[] | null
          audience_strengths: string[] | null
          demographics_hash: string | null
          generated_at: string
          id: string
          insight_body: string
          insight_headline: string
          next_action: string | null
          user_id: string
        }
        Insert: {
          audience_gaps?: string[] | null
          audience_strengths?: string[] | null
          demographics_hash?: string | null
          generated_at?: string
          id?: string
          insight_body: string
          insight_headline: string
          next_action?: string | null
          user_id: string
        }
        Update: {
          audience_gaps?: string[] | null
          audience_strengths?: string[] | null
          demographics_hash?: string | null
          generated_at?: string
          id?: string
          insight_body?: string
          insight_headline?: string
          next_action?: string | null
          user_id?: string
        }
        Relationships: []
      }
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
          is_primary: boolean
          language: string
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
          is_primary?: boolean
          language?: string
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
          is_primary?: boolean
          language?: string
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
      contact_messages: {
        Row: {
          created_at: string
          delivered: boolean
          email: string
          id: string
          ip_hash: string | null
          message: string
          name: string
          topic: string
        }
        Insert: {
          created_at?: string
          delivered?: boolean
          email: string
          id?: string
          ip_hash?: string | null
          message: string
          name: string
          topic: string
        }
        Update: {
          created_at?: string
          delivered?: boolean
          email?: string
          id?: string
          ip_hash?: string | null
          message?: string
          name?: string
          topic?: string
        }
        Relationships: []
      }
      content_gate_results: {
        Row: {
          assertions: Json | null
          created_at: string
          function_name: string | null
          id: string
          judge_model: string | null
          language: string | null
          overall_score: number | null
          pass: boolean | null
          post_id: string | null
          skip_reason: string | null
          skipped: boolean
          user_id: string | null
          weaknesses: Json | null
        }
        Insert: {
          assertions?: Json | null
          created_at?: string
          function_name?: string | null
          id?: string
          judge_model?: string | null
          language?: string | null
          overall_score?: number | null
          pass?: boolean | null
          post_id?: string | null
          skip_reason?: string | null
          skipped?: boolean
          user_id?: string | null
          weaknesses?: Json | null
        }
        Update: {
          assertions?: Json | null
          created_at?: string
          function_name?: string | null
          id?: string
          judge_model?: string | null
          language?: string | null
          overall_score?: number | null
          pass?: boolean | null
          post_id?: string | null
          skip_reason?: string | null
          skipped?: boolean
          user_id?: string | null
          weaknesses?: Json | null
        }
        Relationships: []
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
      daily_brief_snapshots: {
        Row: {
          audit: Json
          brief_date: string
          created_at: string
          id: string
          is_sent: boolean
          payload: Json
          rendered_html: string | null
          run_reason: string | null
          run_seq: number
        }
        Insert: {
          audit?: Json
          brief_date: string
          created_at?: string
          id?: string
          is_sent?: boolean
          payload?: Json
          rendered_html?: string | null
          run_reason?: string | null
          run_seq: number
        }
        Update: {
          audit?: Json
          brief_date?: string
          created_at?: string
          id?: string
          is_sent?: boolean
          payload?: Json
          rendered_html?: string | null
          run_reason?: string | null
          run_seq?: number
        }
        Relationships: []
      }
      decisions: {
        Row: {
          actual_value: number | null
          baseline_value: number | null
          created_at: string
          decided_on: string
          decision: string
          expected_outcome: string | null
          expected_value: number | null
          id: string
          metric_key: string | null
          rationale: string | null
          review_note: string | null
          review_on: string | null
          reviewed_on: string | null
          status: string
          title: string
        }
        Insert: {
          actual_value?: number | null
          baseline_value?: number | null
          created_at?: string
          decided_on?: string
          decision: string
          expected_outcome?: string | null
          expected_value?: number | null
          id?: string
          metric_key?: string | null
          rationale?: string | null
          review_note?: string | null
          review_on?: string | null
          reviewed_on?: string | null
          status?: string
          title: string
        }
        Update: {
          actual_value?: number | null
          baseline_value?: number | null
          created_at?: string
          decided_on?: string
          decision?: string
          expected_outcome?: string | null
          expected_value?: number | null
          id?: string
          metric_key?: string | null
          rationale?: string | null
          review_note?: string | null
          review_on?: string | null
          reviewed_on?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      deck_events: {
        Row: {
          created_at: string
          deck_id: string | null
          duration_ms: number | null
          event: string
          fit_steps: number | null
          id: string
          invariant_failures: string[] | null
          lang: string | null
          length: number | null
          signal_id: string | null
          theme: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id?: string | null
          duration_ms?: number | null
          event: string
          fit_steps?: number | null
          id?: string
          invariant_failures?: string[] | null
          lang?: string | null
          length?: number | null
          signal_id?: string | null
          theme?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string | null
          duration_ms?: number | null
          event?: string
          fit_steps?: number | null
          id?: string
          invariant_failures?: string[] | null
          lang?: string | null
          length?: number | null
          signal_id?: string | null
          theme?: string | null
          user_id?: string
        }
        Relationships: []
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
          audit_method: string | null
          audit_results: Json | null
          aura_card_ready_at: string | null
          avatar_url: string | null
          brand_assessment_answers: Json | null
          brand_assessment_completed_at: string | null
          brand_assessment_results: Json | null
          brand_pillars: string[]
          completed: boolean
          content_language: string
          core_practice: string | null
          country: string | null
          country_code: string | null
          created_at: string
          firm: string | null
          first_name: string | null
          generated_skills: Json
          id: string
          identity_intelligence: Json
          is_admin: boolean
          last_active_at: string | null
          last_name: string | null
          last_visit_at: string | null
          leadership_style: string | null
          level: string | null
          lifecycle_opt_out: boolean
          linkedin_handle: string | null
          linkedin_url: string | null
          north_star_goal: string | null
          notification_prefs: Json | null
          onboarding_completed: boolean
          onboarding_step: number | null
          phone_verified: boolean | null
          phone_whatsapp: string | null
          primary_strength: string | null
          sector_focus: string | null
          shared_learning_consent: boolean
          signature_presets: Json
          skill_ratings: Json
          target_register: string | null
          theme_preference: string | null
          ui_dismissals: Json
          user_id: string
          years_experience: string | null
        }
        Insert: {
          audit_completed_at?: string | null
          audit_interpretation?: string | null
          audit_method?: string | null
          audit_results?: Json | null
          aura_card_ready_at?: string | null
          avatar_url?: string | null
          brand_assessment_answers?: Json | null
          brand_assessment_completed_at?: string | null
          brand_assessment_results?: Json | null
          brand_pillars?: string[]
          completed?: boolean
          content_language?: string
          core_practice?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          firm?: string | null
          first_name?: string | null
          generated_skills?: Json
          id?: string
          identity_intelligence?: Json
          is_admin?: boolean
          last_active_at?: string | null
          last_name?: string | null
          last_visit_at?: string | null
          leadership_style?: string | null
          level?: string | null
          lifecycle_opt_out?: boolean
          linkedin_handle?: string | null
          linkedin_url?: string | null
          north_star_goal?: string | null
          notification_prefs?: Json | null
          onboarding_completed?: boolean
          onboarding_step?: number | null
          phone_verified?: boolean | null
          phone_whatsapp?: string | null
          primary_strength?: string | null
          sector_focus?: string | null
          shared_learning_consent?: boolean
          signature_presets?: Json
          skill_ratings?: Json
          target_register?: string | null
          theme_preference?: string | null
          ui_dismissals?: Json
          user_id: string
          years_experience?: string | null
        }
        Update: {
          audit_completed_at?: string | null
          audit_interpretation?: string | null
          audit_method?: string | null
          audit_results?: Json | null
          aura_card_ready_at?: string | null
          avatar_url?: string | null
          brand_assessment_answers?: Json | null
          brand_assessment_completed_at?: string | null
          brand_assessment_results?: Json | null
          brand_pillars?: string[]
          completed?: boolean
          content_language?: string
          core_practice?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          firm?: string | null
          first_name?: string | null
          generated_skills?: Json
          id?: string
          identity_intelligence?: Json
          is_admin?: boolean
          last_active_at?: string | null
          last_name?: string | null
          last_visit_at?: string | null
          leadership_style?: string | null
          level?: string | null
          lifecycle_opt_out?: boolean
          linkedin_handle?: string | null
          linkedin_url?: string | null
          north_star_goal?: string | null
          notification_prefs?: Json | null
          onboarding_completed?: boolean
          onboarding_step?: number | null
          phone_verified?: boolean | null
          phone_whatsapp?: string | null
          primary_strength?: string | null
          sector_focus?: string | null
          shared_learning_consent?: boolean
          signature_presets?: Json
          skill_ratings?: Json
          target_register?: string | null
          theme_preference?: string | null
          ui_dismissals?: Json
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
      document_jobs: {
        Row: {
          attempts: number
          created_at: string
          cursor: number
          document_id: string
          error_detail: string | null
          failure_code: string | null
          id: string
          last_heartbeat: string
          peak_memory_mb: number | null
          slice_size: number
          stage: string
          total: number | null
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          cursor?: number
          document_id: string
          error_detail?: string | null
          failure_code?: string | null
          id?: string
          last_heartbeat?: string
          peak_memory_mb?: number | null
          slice_size?: number
          stage?: string
          total?: number | null
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          cursor?: number
          document_id?: string
          error_detail?: string | null
          failure_code?: string | null
          id?: string
          last_heartbeat?: string
          peak_memory_mb?: number | null
          slice_size?: number
          stage?: string
          total?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          attempt_count: number
          created_at: string
          display_title: string | null
          error_message: string | null
          extraction_method: string | null
          file_size: number | null
          file_type: string
          file_url: string
          filename: string
          id: string
          page_count: number | null
          pages_read: number | null
          pages_total: number | null
          processing_started_at: string | null
          status: string
          summary: string | null
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          display_title?: string | null
          error_message?: string | null
          extraction_method?: string | null
          file_size?: number | null
          file_type: string
          file_url: string
          filename: string
          id?: string
          page_count?: number | null
          pages_read?: number | null
          pages_total?: number | null
          processing_started_at?: string | null
          status?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          display_title?: string | null
          error_message?: string | null
          extraction_method?: string | null
          file_size?: number | null
          file_type?: string
          file_url?: string
          filename?: string
          id?: string
          page_count?: number | null
          pages_read?: number | null
          pages_total?: number | null
          processing_started_at?: string | null
          status?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      draft_edits: {
        Row: {
          created_at: string
          first_line_changed: boolean | null
          id: string
          language: string | null
          levenshtein_distance: number | null
          numbers_added: number | null
          numbers_removed: number | null
          post_id: string | null
          published_chars: number | null
          published_text: string | null
          served_chars: number | null
          served_text: string | null
          similarity_ratio: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          first_line_changed?: boolean | null
          id?: string
          language?: string | null
          levenshtein_distance?: number | null
          numbers_added?: number | null
          numbers_removed?: number | null
          post_id?: string | null
          published_chars?: number | null
          published_text?: string | null
          served_chars?: number | null
          served_text?: string | null
          similarity_ratio?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          first_line_changed?: boolean | null
          id?: string
          language?: string | null
          levenshtein_distance?: number | null
          numbers_added?: number | null
          numbers_removed?: number | null
          post_id?: string | null
          published_chars?: number | null
          published_text?: string | null
          served_chars?: number | null
          served_text?: string | null
          similarity_ratio?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ef_error_log: {
        Row: {
          context: Json | null
          created_at: string
          error_message: string | null
          function_name: string
          id: string
          severity: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_message?: string | null
          function_name: string
          id?: string
          severity?: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_message?: string | null
          function_name?: string
          id?: string
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ef_event_log_retired_20260724: {
        Row: {
          context: Json | null
          created_at: string
          error_message: string | null
          function_name: string | null
          id: string
          severity: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_message?: string | null
          function_name?: string | null
          id?: string
          severity?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_message?: string | null
          function_name?: string | null
          id?: string
          severity?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      entries: {
        Row: {
          account_name: string | null
          content: string
          created_at: string
          embedding: string | null
          extract_attempts: number
          framework_tag: string | null
          has_strategic_insight: boolean
          id: string
          image_url: string | null
          pinned: boolean
          skill_pillar: string | null
          source_type: string
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
          extract_attempts?: number
          framework_tag?: string | null
          has_strategic_insight?: boolean
          id?: string
          image_url?: string | null
          pinned?: boolean
          skill_pillar?: string | null
          source_type?: string
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
          extract_attempts?: number
          framework_tag?: string | null
          has_strategic_insight?: boolean
          id?: string
          image_url?: string | null
          pinned?: boolean
          skill_pillar?: string | null
          source_type?: string
          summary?: string | null
          title?: string | null
          tsv?: unknown
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      eval_metrics: {
        Row: {
          context: Json
          created_at: string
          id: string
          measured_at: string
          metric: string
          user_id: string | null
          value: number
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          measured_at?: string
          metric: string
          user_id?: string | null
          value: number
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          measured_at?: string
          metric?: string
          user_id?: string | null
          value?: number
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
      evidence_jobs: {
        Row: {
          created_at: string
          cursor: number
          error_detail: string | null
          fragments_written: number
          id: string
          last_heartbeat: string
          source_registry_id: string
          status: string
          total: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          cursor?: number
          error_detail?: string | null
          fragments_written?: number
          id?: string
          last_heartbeat?: string
          source_registry_id: string
          status?: string
          total?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          cursor?: number
          error_detail?: string | null
          fragments_written?: number
          id?: string
          last_heartbeat?: string
          source_registry_id?: string
          status?: string
          total?: number | null
          user_id?: string
        }
        Relationships: []
      }
      external_costs: {
        Row: {
          amount_usd: number
          created_at: string | null
          cycle: string
          id: string
          last_verified: string | null
          name: string
          notes: string | null
          renews_on: string | null
          status: string
        }
        Insert: {
          amount_usd?: number
          created_at?: string | null
          cycle?: string
          id?: string
          last_verified?: string | null
          name: string
          notes?: string | null
          renews_on?: string | null
          status?: string
        }
        Update: {
          amount_usd?: number
          created_at?: string | null
          cycle?: string
          id?: string
          last_verified?: string | null
          name?: string
          notes?: string | null
          renews_on?: string | null
          status?: string
        }
        Relationships: []
      }
      facet_states: {
        Row: {
          created_at: string
          facet: string
          id: string
          inputs: Json
          last_reinforced_at: string | null
          uncertainty: number
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          facet: string
          id?: string
          inputs?: Json
          last_reinforced_at?: string | null
          uncertainty?: number
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          created_at?: string
          facet?: string
          id?: string
          inputs?: Json
          last_reinforced_at?: string | null
          uncertainty?: number
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
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
      funnel_daily_ratio: {
        Row: {
          created_at: string
          day: string
          opens_users: number
          ratio: number
          signals_users: number
        }
        Insert: {
          created_at?: string
          day: string
          opens_users?: number
          ratio?: number
          signals_users?: number
        }
        Update: {
          created_at?: string
          day?: string
          opens_users?: number
          ratio?: number
          signals_users?: number
        }
        Relationships: []
      }
      guide_articles: {
        Row: {
          answer_en: string
          category: string
          created_at: string
          formula_note_en: string | null
          id: string
          question_en: string | null
          related_terms: string[]
          slug: string
          sort_order: number
          surfaces: string[]
          tab: string
          updated_at: string
        }
        Insert: {
          answer_en: string
          category: string
          created_at?: string
          formula_note_en?: string | null
          id?: string
          question_en?: string | null
          related_terms?: string[]
          slug: string
          sort_order?: number
          surfaces?: string[]
          tab: string
          updated_at?: string
        }
        Update: {
          answer_en?: string
          category?: string
          created_at?: string
          formula_note_en?: string | null
          id?: string
          question_en?: string | null
          related_terms?: string[]
          slug?: string
          sort_order?: number
          surfaces?: string[]
          tab?: string
          updated_at?: string
        }
        Relationships: []
      }
      guide_slug_misses: {
        Row: {
          count: number
          first_seen: string
          last_seen: string
          slug: string
          surface: string
        }
        Insert: {
          count?: number
          first_seen?: string
          last_seen?: string
          slug: string
          surface: string
        }
        Update: {
          count?: number
          first_seen?: string
          last_seen?: string
          slug?: string
          surface?: string
        }
        Relationships: []
      }
      health_findings: {
        Row: {
          code: string
          created_at: string
          detail: string
          first_seen: string
          id: string
          last_seen: string
          resolved_at: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          detail: string
          first_seen?: string
          id?: string
          last_seen?: string
          resolved_at?: string | null
          severity: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          detail?: string
          first_seen?: string
          id?: string
          last_seen?: string
          resolved_at?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      home_address: {
        Row: {
          address_date: string
          address_md: string
          facts: Json
          generated_at: string
          id: string
          lens: string
          lens_reason: string
          model: string | null
          moves: Json
          quality: Json
          user_id: string
        }
        Insert: {
          address_date: string
          address_md: string
          facts?: Json
          generated_at?: string
          id?: string
          lens: string
          lens_reason: string
          model?: string | null
          moves?: Json
          quality?: Json
          user_id: string
        }
        Update: {
          address_date?: string
          address_md?: string
          facts?: Json
          generated_at?: string
          id?: string
          lens?: string
          lens_reason?: string
          model?: string | null
          moves?: Json
          quality?: Json
          user_id?: string
        }
        Relationships: []
      }
      impact_narratives: {
        Row: {
          content_insight: string
          data_hash: string | null
          footprint_insight: string
          generated_at: string | null
          hero_narrative: string
          id: string
          one_action: string
          post_insight: string
          user_id: string
        }
        Insert: {
          content_insight: string
          data_hash?: string | null
          footprint_insight: string
          generated_at?: string | null
          hero_narrative: string
          id?: string
          one_action: string
          post_insight: string
          user_id: string
        }
        Update: {
          content_insight?: string
          data_hash?: string | null
          footprint_insight?: string
          generated_at?: string | null
          hero_narrative?: string
          id?: string
          one_action?: string
          post_insight?: string
          user_id?: string
        }
        Relationships: []
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
      imprint_snapshots: {
        Row: {
          components: Json
          created_at: string
          facet_vector: Json
          formula_version: number
          id: string
          imprint: number
          tier: string | null
          user_id: string
        }
        Insert: {
          components?: Json
          created_at?: string
          facet_vector?: Json
          formula_version?: number
          id?: string
          imprint: number
          tier?: string | null
          user_id: string
        }
        Update: {
          components?: Json
          created_at?: string
          facet_vector?: Json
          formula_version?: number
          id?: string
          imprint?: number
          tier?: string | null
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
          followers: number | null
          format_breakdown: Json
          id: string
          impressions: number
          members_reached: number | null
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
          total_impressions_annual: number | null
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
          followers?: number | null
          format_breakdown?: Json
          id?: string
          impressions?: number
          members_reached?: number | null
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
          total_impressions_annual?: number | null
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
          followers?: number | null
          format_breakdown?: Json
          id?: string
          impressions?: number
          members_reached?: number | null
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
          total_impressions_annual?: number | null
          user_id?: string
        }
        Relationships: []
      }
      job_queue: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          scheduled_for: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          scheduled_for?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          scheduled_for?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      known_issues: {
        Row: {
          area: string | null
          created_at: string
          detail: string | null
          detected_at: string
          id: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
          trigger_note: string | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          detail?: string | null
          detected_at?: string
          id?: string
          resolved_at?: string | null
          severity: string
          status?: string
          title: string
          trigger_note?: string | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          created_at?: string
          detail?: string | null
          detected_at?: string
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          trigger_note?: string | null
          updated_at?: string
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
      lifecycle_email_log: {
        Row: {
          id: string
          message_key: string
          sent_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_key: string
          sent_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_key?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
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
          claim_token_hash: string | null
          connected_at: string | null
          created_at: string | null
          display_name: string | null
          followers_total: number | null
          followers_total_at: string | null
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
          claim_token_hash?: string | null
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          followers_total?: number | null
          followers_total_at?: string | null
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
          claim_token_hash?: string | null
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          followers_total?: number | null
          followers_total_at?: string | null
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
          followers_gained: number
          id: string
          impressions: number
          link_clicks: number
          members_reached: number
          post_id: string
          profile_views: number
          reactions: number
          saves: number
          sends: number
          shares: number
          snapshot_date: string
          source_type: string
          user_id: string
        }
        Insert: {
          comments?: number
          created_at?: string
          engagement_rate?: number
          followers_gained?: number
          id?: string
          impressions?: number
          link_clicks?: number
          members_reached?: number
          post_id: string
          profile_views?: number
          reactions?: number
          saves?: number
          sends?: number
          shares?: number
          snapshot_date?: string
          source_type?: string
          user_id: string
        }
        Update: {
          comments?: number
          created_at?: string
          engagement_rate?: number
          followers_gained?: number
          id?: string
          impressions?: number
          link_clicks?: number
          members_reached?: number
          post_id?: string
          profile_views?: number
          reactions?: number
          saves?: number
          sends?: number
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
          {
            foreignKeyName: "linkedin_post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "post_provenance"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_posts: {
        Row: {
          acquisition: string
          authorship: string
          carousel_structure_type: string | null
          claimed_at: string | null
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
          original_generated_text: string | null
          post_text: string | null
          post_url: string | null
          publish_attempted_at: string | null
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
          acquisition?: string
          authorship?: string
          carousel_structure_type?: string | null
          claimed_at?: string | null
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
          original_generated_text?: string | null
          post_text?: string | null
          post_url?: string | null
          publish_attempted_at?: string | null
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
          acquisition?: string
          authorship?: string
          carousel_structure_type?: string | null
          claimed_at?: string | null
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
          original_generated_text?: string | null
          post_text?: string | null
          post_url?: string | null
          publish_attempted_at?: string | null
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
      metric_targets: {
        Row: {
          baseline_on: string | null
          baseline_value: number | null
          created_at: string
          id: string
          metric_key: string
          rationale: string
          review_note: string | null
          reviewed_on: string | null
          set_on: string
          status: string
          target_by: string
          target_value: number
        }
        Insert: {
          baseline_on?: string | null
          baseline_value?: number | null
          created_at?: string
          id?: string
          metric_key: string
          rationale: string
          review_note?: string | null
          reviewed_on?: string | null
          set_on?: string
          status?: string
          target_by: string
          target_value: number
        }
        Update: {
          baseline_on?: string | null
          baseline_value?: number | null
          created_at?: string
          id?: string
          metric_key?: string
          rationale?: string
          review_note?: string | null
          reviewed_on?: string | null
          set_on?: string
          status?: string
          target_by?: string
          target_value?: number
        }
        Relationships: []
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
      onboarding_article_log: {
        Row: {
          core_practice: string | null
          created_at: string
          id: string
          outcome: string
          sector_focus: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          core_practice?: string | null
          created_at?: string
          id?: string
          outcome: string
          sector_focus?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          core_practice?: string | null
          created_at?: string
          id?: string
          outcome?: string
          sector_focus?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ops_alerts: {
        Row: {
          action: string | null
          body: string | null
          created_at: string
          emailed: boolean
          id: string
          impact: string | null
          last_emailed: string | null
          last_seen: string | null
          occurrences: number
          resolved_at: string | null
          severity: string | null
          source: string | null
          status: string
          subject: string | null
          what: string | null
        }
        Insert: {
          action?: string | null
          body?: string | null
          created_at?: string
          emailed?: boolean
          id?: string
          impact?: string | null
          last_emailed?: string | null
          last_seen?: string | null
          occurrences?: number
          resolved_at?: string | null
          severity?: string | null
          source?: string | null
          status?: string
          subject?: string | null
          what?: string | null
        }
        Update: {
          action?: string | null
          body?: string | null
          created_at?: string
          emailed?: boolean
          id?: string
          impact?: string | null
          last_emailed?: string | null
          last_seen?: string | null
          occurrences?: number
          resolved_at?: string | null
          severity?: string | null
          source?: string | null
          status?: string
          subject?: string | null
          what?: string | null
        }
        Relationships: []
      }
      output_leak_log: {
        Row: {
          created_at: string
          first_lines: string | null
          function_name: string | null
          id: string
          language: string | null
          leak_stage: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          first_lines?: string | null
          function_name?: string | null
          id?: string
          language?: string | null
          leak_stage?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          first_lines?: string | null
          function_name?: string | null
          id?: string
          language?: string | null
          leak_stage?: string | null
          user_id?: string | null
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
      product_events: {
        Row: {
          event: string
          id: string
          occurred_at: string
          props: Json
          session_id: string | null
          user_id: string
        }
        Insert: {
          event: string
          id?: string
          occurred_at?: string
          props?: Json
          session_id?: string | null
          user_id: string
        }
        Update: {
          event?: string
          id?: string
          occurred_at?: string
          props?: Json
          session_id?: string | null
          user_id?: string
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
      qa_runs: {
        Row: {
          check_key: string
          detail: string | null
          id: string
          run_at: string
          status: string
          value_json: Json
        }
        Insert: {
          check_key: string
          detail?: string | null
          id?: string
          run_at?: string
          status: string
          value_json?: Json
        }
        Update: {
          check_key?: string
          detail?: string | null
          id?: string
          run_at?: string
          status?: string
          value_json?: Json
        }
        Relationships: []
      }
      recommended_moves_retired_20260718: {
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
      register_options: {
        Row: {
          created_at: string
          id: string
          label: string
          language: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          language?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          language?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      report_snapshots: {
        Row: {
          created_at: string
          created_by: string
          data: Json
          id: string
          is_current: boolean
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          data: Json
          id?: string
          is_current?: boolean
          user_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          data?: Json
          id?: string
          is_current?: boolean
          user_id?: string
          version?: number
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
      ship_markers: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          shipped_on: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          shipped_on: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          shipped_on?: string
          title?: string
        }
        Relationships: []
      }
      signal_engagements: {
        Row: {
          created_at: string
          last_opened_at: string
          open_count: number
          signal_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_opened_at?: string
          open_count?: number
          signal_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_opened_at?: string
          open_count?: number
          signal_id?: string
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
      signature_events: {
        Row: {
          action: string
          created_at: string
          family: string | null
          id: string
          lang: string | null
          payload: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          family?: string | null
          id?: string
          lang?: string | null
          payload?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          family?: string | null
          id?: string
          lang?: string | null
          payload?: Json | null
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
      source_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          processed_at: string | null
          source_id: string
          source_table: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          source_id: string
          source_table: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          source_id?: string
          source_table?: string
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
          signal_status: string | null
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
          signal_status?: string | null
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
          signal_status?: string | null
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
          base_confidence: number | null
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
          last_evidence_at: string | null
          lifecycle_tier: string | null
          momentum: number | null
          priority_score: number
          signal_title: string
          signal_velocity: number | null
          skill_pillars: string[]
          status: string
          strategic_implications: string
          strength_score: number | null
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
          base_confidence?: number | null
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
          last_evidence_at?: string | null
          lifecycle_tier?: string | null
          momentum?: number | null
          priority_score?: number
          signal_title: string
          signal_velocity?: number | null
          skill_pillars?: string[]
          status?: string
          strategic_implications: string
          strength_score?: number | null
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
          base_confidence?: number | null
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
          last_evidence_at?: string | null
          lifecycle_tier?: string | null
          momentum?: number | null
          priority_score?: number
          signal_title?: string
          signal_velocity?: number | null
          skill_pillars?: string[]
          status?: string
          strategic_implications?: string
          strength_score?: number | null
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
      user_widget_layout: {
        Row: {
          layout: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          layout?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          layout?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_missions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          mission_type: string
          points: number | null
          status: string | null
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          mission_type: string
          points?: number | null
          status?: string | null
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          mission_type?: string
          points?: number | null
          status?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_links: {
        Row: {
          bound_at: string | null
          created_at: string
          id: string
          last_message_at: string | null
          pair_token: string | null
          phone_e164: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bound_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          pair_token?: string | null
          phone_e164?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bound_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          pair_token?: string | null
          phone_e164?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          entry_id: string | null
          from_phone: string | null
          id: string
          kind: string | null
          result: string | null
          user_id: string | null
          wa_message_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entry_id?: string | null
          from_phone?: string | null
          id?: string
          kind?: string | null
          result?: string | null
          user_id?: string | null
          wa_message_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entry_id?: string | null
          from_phone?: string | null
          id?: string
          kind?: string | null
          result?: string | null
          user_id?: string | null
          wa_message_id?: string
        }
        Relationships: []
      }
      widget_slot_votes: {
        Row: {
          created_at: string
          id: string
          slot_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          slot_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          slot_key?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      cockpit_assertions: {
        Row: {
          claim: string | null
          detail: string | null
          ok: boolean | null
          status: string | null
        }
        Relationships: []
      }
      cockpit_members: {
        Row: {
          active_7d: boolean | null
          captures: number | null
          day_n: number | null
          first_name: string | null
          joined_on: string | null
          last_capture: string | null
          lifecycle_emails: number | null
          posts_through_aura: number | null
          signals: number | null
          state: string | null
          user_id: string | null
        }
        Relationships: []
      }
      cockpit_pulse: {
        Row: {
          active_7d: number | null
          as_of: string | null
          captures_7d: number | null
          captures_total: number | null
          cold: number | null
          drawer: number | null
          emails_7d: number | null
          faults_48h: number | null
          health_open: number | null
          members: number | null
          posts_through_aura: number | null
          posts_total: number | null
          shipping: number | null
          started: number | null
        }
        Relationships: []
      }
      daily_brief_latest: {
        Row: {
          audit: Json | null
          brief_date: string | null
          created_at: string | null
          id: string | null
          is_sent: boolean | null
          payload: Json | null
          rendered_html: string | null
          run_reason: string | null
          run_seq: number | null
        }
        Relationships: []
      }
      ef_faults: {
        Row: {
          context: Json | null
          created_at: string | null
          error_message: string | null
          function_name: string | null
          id: string | null
          severity: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          error_message?: string | null
          function_name?: string | null
          id?: string | null
          severity?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          error_message?: string | null
          function_name?: string | null
          id?: string | null
          severity?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      influence_timeline: {
        Row: {
          comments: number | null
          engagement_rate: number | null
          follower_growth: number | null
          followers: number | null
          impressions: number | null
          members_reached: number | null
          reactions: number | null
          shares: number | null
          snapshot_date: string | null
          source_type: string | null
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
      post_provenance: {
        Row: {
          acquisition: string | null
          authorship: string | null
          carousel_structure_type: string | null
          claimed_at: string | null
          comment_count: number | null
          content_engine_output_type: string | null
          content_type: string | null
          created_at: string | null
          cta_style: string | null
          engagement_score: number | null
          enriched_by: string[] | null
          format_type: string | null
          framework_type: string | null
          hook: string | null
          hook_style: string | null
          id: string | null
          like_count: number | null
          linkedin_post_id: string | null
          linkedin_url: string | null
          media_type: string | null
          original_generated_text: string | null
          post_text: string | null
          post_url: string | null
          provenance: string | null
          publish_attempted_at: string | null
          published_at: string | null
          published_confirmed_at: string | null
          quality_score: Json | null
          rejection_reason: string | null
          repost_count: number | null
          source_metadata: Json | null
          source_signal_id: string | null
          source_trust: number | null
          source_type: string | null
          synced_at: string | null
          theme: string | null
          title: string | null
          tone: string | null
          topic_label: string | null
          tracking_status: string | null
          user_id: string | null
          visual_strategy_type: string | null
          visual_style: string | null
        }
        Insert: {
          acquisition?: string | null
          authorship?: string | null
          carousel_structure_type?: string | null
          claimed_at?: string | null
          comment_count?: number | null
          content_engine_output_type?: string | null
          content_type?: string | null
          created_at?: string | null
          cta_style?: string | null
          engagement_score?: number | null
          enriched_by?: string[] | null
          format_type?: string | null
          framework_type?: string | null
          hook?: string | null
          hook_style?: string | null
          id?: string | null
          like_count?: number | null
          linkedin_post_id?: string | null
          linkedin_url?: string | null
          media_type?: string | null
          original_generated_text?: string | null
          post_text?: string | null
          post_url?: string | null
          provenance?: never
          publish_attempted_at?: string | null
          published_at?: string | null
          published_confirmed_at?: string | null
          quality_score?: Json | null
          rejection_reason?: string | null
          repost_count?: number | null
          source_metadata?: Json | null
          source_signal_id?: string | null
          source_trust?: number | null
          source_type?: string | null
          synced_at?: string | null
          theme?: string | null
          title?: string | null
          tone?: string | null
          topic_label?: string | null
          tracking_status?: string | null
          user_id?: string | null
          visual_strategy_type?: string | null
          visual_style?: string | null
        }
        Update: {
          acquisition?: string | null
          authorship?: string | null
          carousel_structure_type?: string | null
          claimed_at?: string | null
          comment_count?: number | null
          content_engine_output_type?: string | null
          content_type?: string | null
          created_at?: string | null
          cta_style?: string | null
          engagement_score?: number | null
          enriched_by?: string[] | null
          format_type?: string | null
          framework_type?: string | null
          hook?: string | null
          hook_style?: string | null
          id?: string | null
          like_count?: number | null
          linkedin_post_id?: string | null
          linkedin_url?: string | null
          media_type?: string | null
          original_generated_text?: string | null
          post_text?: string | null
          post_url?: string | null
          provenance?: never
          publish_attempted_at?: string | null
          published_at?: string | null
          published_confirmed_at?: string | null
          quality_score?: Json | null
          rejection_reason?: string | null
          repost_count?: number | null
          source_metadata?: Json | null
          source_signal_id?: string | null
          source_trust?: number | null
          source_type?: string | null
          synced_at?: string | null
          theme?: string | null
          title?: string | null
          tone?: string | null
          topic_label?: string | null
          tracking_status?: string | null
          user_id?: string | null
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
      admin_cohorts: {
        Args: never
        Returns: {
          captured: number
          cohort_week: string
          got_signal: number
          has_draft: number
          linkedin_live: number
          opened_writer: number
          published: number
          size: number
        }[]
      }
      admin_cron_failures_24h: {
        Args: never
        Returns: {
          failed: number
          jobname: string
          last_fail: string
        }[]
      }
      admin_economics_denominators: {
        Args: never
        Returns: {
          active_users: number
          published_posts: number
          signals_delivered: number
        }[]
      }
      admin_list_crons: {
        Args: never
        Returns: {
          active: boolean
          jobid: number
          jobname: string
          last_msg: string
          last_start: string
          last_status: string
          schedule: string
        }[]
      }
      admin_run_cron: { Args: { p_jobid: number }; Returns: string }
      admin_spend_by_function: {
        Args: { p_months_back?: number }
        Returns: {
          calls: number
          function_name: string
          spend: number
        }[]
      }
      admin_spend_daily: {
        Args: { p_days?: number }
        Returns: {
          day: string
          spend: number
        }[]
      }
      admin_stage_timeline: {
        Args: { p_days?: number }
        Returns: {
          captured: number
          day: string
          finished_setup: number
          got_signal: number
          has_draft: number
          linkedin_live: number
          opened_writer: number
          published: number
          signed_up: number
        }[]
      }
      brief_history: {
        Args: { days?: number }
        Returns: {
          brief_date: string
          funnel: Json
          runs: number
          sent: boolean
        }[]
      }
      bump_signal_engagement: {
        Args: { p_signal_id: string }
        Returns: undefined
      }
      check_invite_token: { Args: { p_token: string }; Returns: Json }
      claim_job: {
        Args: { p_job_type: string; p_worker: string }
        Returns: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          scheduled_for: string
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "job_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_job: {
        Args: { p_error?: string; p_id: string; p_success: boolean }
        Returns: undefined
      }
      decisions_due: {
        Args: { p_on?: string }
        Returns: {
          baseline_value: number
          days_overdue: number
          decided_on: string
          decision: string
          expected_outcome: string
          expected_value: number
          id: string
          metric_key: string
          review_on: string
          title: string
        }[]
      }
      delete_account: { Args: { p_user_id: string }; Returns: undefined }
      email_crons_ran_without_sends: {
        Args: { p_hours?: number }
        Returns: {
          crons_ran: number
          ran_jobs: string[]
          rows_added: number
        }[]
      }
      enqueue_voice_distill_jobs: { Args: never; Returns: number }
      founder_brief_data: { Args: never; Returns: Json }
      founder_brief_user_ids: {
        Args: never
        Returns: {
          created_at: string
          email: string
          last_sign_in_at: string
          user_id: string
        }[]
      }
      founder_brief_verify: { Args: never; Returns: Json }
      founder_uuid: { Args: never; Returns: string }
      founding_seats: {
        Args: never
        Returns: {
          cap: number
          claimed: number
        }[]
      }
      home_record_themes: {
        Args: { p_from: string; p_to: string; p_uid?: string }
        Returns: {
          created_at: string
          id: string
          title: string
        }[]
      }
      home_record_timeline: { Args: { p_uid?: string }; Returns: Json }
      is_current_user_admin: { Args: never; Returns: boolean }
      momentum_funnel: {
        Args: never
        Returns: {
          captures: number
          published: number
          published_live: number
          published_sent_from_aura: number
          published_through_aura: number
          signals: number
          used_in_signal: number
        }[]
      }
      ops_cron_status: {
        Args: { p_hours?: number }
        Returns: {
          active: boolean
          failed_24h: number
          jobid: number
          jobname: string
          last_end: string
          last_status: string
          schedule: string
          succeeded_24h: number
        }[]
      }
      ops_health_findings_summary: {
        Args: { p_hours?: number }
        Returns: {
          newest_at: string
          newest_title: string
          open_count: number
        }[]
      }
      pending_capture_entries: {
        Args: {
          p_limit?: number
          p_max_attempts?: number
          p_min_age_minutes?: number
        }
        Returns: {
          extract_attempts: number
          id: string
          user_id: string
        }[]
      }
      publish_invariants: { Args: never; Returns: Json }
      qa_cron_success_jobs: {
        Args: { p_hours: number }
        Returns: {
          jobname: string
          last_end: string
          runs: number
        }[]
      }
      recent_cron_http_failures: {
        Args: { p_minutes?: number }
        Returns: {
          failures: number
          sample_error: string
          status_code: number
        }[]
      }
      reconcile_signal_counts: {
        Args: never
        Returns: {
          dead_ids_pruned: number
          signals_checked: number
          signals_fixed: number
        }[]
      }
      record_brief_run: {
        Args: {
          p_audit: Json
          p_brief_date: string
          p_is_sent: boolean
          p_payload: Json
          p_rendered_html: string
          p_run_reason: string
        }
        Returns: {
          id: string
          run_seq: number
        }[]
      }
      record_guide_miss: {
        Args: { _slug: string; _surface: string }
        Returns: undefined
      }
      report_invariants: { Args: never; Returns: Json }
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
      whatsapp_mint_pair_token: {
        Args: never
        Returns: {
          pair_token: string
          status: string
          token_expires_at: string
        }[]
      }
      widget_slot_tally: {
        Args: never
        Returns: {
          eligible_members: number
          slot_key: string
          vote_count: number
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
