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
    PostgrestVersion: "14.5"
  }
  real31_intranet: {
    Tables: {
      activity_log: {
        Row: {
          action_code: string
          actor_user_id: string
          id: number
          occurred_at: string
          payload: Json | null
          resource_id: string
          resource_type: string
        }
        Insert: {
          action_code: string
          actor_user_id: string
          id?: number
          occurred_at?: string
          payload?: Json | null
          resource_id: string
          resource_type: string
        }
        Update: {
          action_code?: string
          actor_user_id?: string
          id?: number
          occurred_at?: string
          payload?: Json | null
          resource_id?: string
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          id: number
          ip_address: unknown
          metadata: Json | null
          occurred_at: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id?: string | null
          id?: number
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          id?: number
          ip_address?: unknown
          metadata?: Json | null
          occurred_at?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinet_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      copros: {
        Row: {
          adresse: string | null
          archived_at: string | null
          code: string
          code_postal: string | null
          created_at: string
          date_prise_gestion: string | null
          exercice_debut_jour: number | null
          exercice_debut_mois: number | null
          gestionnaire_initials: string | null
          id: string
          lat: number | null
          lng: number | null
          lots_principaux: number | null
          nom: string
          source: string
          source_id: string | null
          statut: string
          synced_at: string | null
          tantiemes: number | null
          updated_at: string
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          archived_at?: string | null
          code: string
          code_postal?: string | null
          created_at?: string
          date_prise_gestion?: string | null
          exercice_debut_jour?: number | null
          exercice_debut_mois?: number | null
          gestionnaire_initials?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          lots_principaux?: number | null
          nom: string
          source: string
          source_id?: string | null
          statut?: string
          synced_at?: string | null
          tantiemes?: number | null
          updated_at?: string
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          archived_at?: string | null
          code?: string
          code_postal?: string | null
          created_at?: string
          date_prise_gestion?: string | null
          exercice_debut_jour?: number | null
          exercice_debut_mois?: number | null
          gestionnaire_initials?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          lots_principaux?: number | null
          nom?: string
          source?: string
          source_id?: string | null
          statut?: string
          synced_at?: string | null
          tantiemes?: number | null
          updated_at?: string
          ville?: string | null
        }
        Relationships: []
      }
      evenements: {
        Row: {
          archived_at: string | null
          copro_id: string
          created_at: string
          date_evenement: string
          id: string
          lieu: string | null
          notes: string | null
          source: string
          source_id: string | null
          statut: string
          synced_at: string | null
          titre: string | null
          type: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          copro_id: string
          created_at?: string
          date_evenement: string
          id?: string
          lieu?: string | null
          notes?: string | null
          source: string
          source_id?: string | null
          statut?: string
          synced_at?: string | null
          titre?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          copro_id?: string
          created_at?: string
          date_evenement?: string
          id?: string
          lieu?: string | null
          notes?: string | null
          source?: string
          source_id?: string | null
          statut?: string
          synced_at?: string | null
          titre?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evenements_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copros"
            referencedColumns: ["id"]
          },
        ]
      }
      item_odj: {
        Row: {
          created_at: string
          evenement_id: string
          id: string
          libelle: string
          ordre: number
          regle_majorite: string | null
        }
        Insert: {
          created_at?: string
          evenement_id: string
          id?: string
          libelle: string
          ordre: number
          regle_majorite?: string | null
        }
        Update: {
          created_at?: string
          evenement_id?: string
          id?: string
          libelle?: string
          ordre?: number
          regle_majorite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_odj_evenement_id_fkey"
            columns: ["evenement_id"]
            isOneToOne: false
            referencedRelation: "evenements"
            referencedColumns: ["id"]
          },
        ]
      }
      jalons: {
        Row: {
          cible_date: string
          commentaire: string | null
          created_at: string
          evenement_id: string
          id: string
          marque_at: string | null
          marque_par_user_id: string | null
          realise_date: string | null
          statut: string
          type: string
          updated_at: string
        }
        Insert: {
          cible_date: string
          commentaire?: string | null
          created_at?: string
          evenement_id: string
          id?: string
          marque_at?: string | null
          marque_par_user_id?: string | null
          realise_date?: string | null
          statut?: string
          type: string
          updated_at?: string
        }
        Update: {
          cible_date?: string
          commentaire?: string | null
          created_at?: string
          evenement_id?: string
          id?: string
          marque_at?: string | null
          marque_par_user_id?: string | null
          realise_date?: string | null
          statut?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jalons_evenement_id_fkey"
            columns: ["evenement_id"]
            isOneToOne: false
            referencedRelation: "evenements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jalons_marque_par_user_id_fkey"
            columns: ["marque_par_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          ended_at: string | null
          error: string | null
          id: number
          job_name: string
          metadata: Json | null
          started_at: string
          status: string
        }
        Insert: {
          ended_at?: string | null
          error?: string | null
          id?: number
          job_name: string
          metadata?: Json | null
          started_at?: string
          status: string
        }
        Update: {
          ended_at?: string | null
          error?: string | null
          id?: number
          job_name?: string
          metadata?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      membres_cs: {
        Row: {
          copro_id: string
          created_at: string
          date_debut_mandat: string | null
          date_fin_mandat: string | null
          email: string | null
          id: string
          is_active: boolean
          nom: string
          role: string
          telephone: string | null
          updated_at: string
        }
        Insert: {
          copro_id: string
          created_at?: string
          date_debut_mandat?: string | null
          date_fin_mandat?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          nom: string
          role?: string
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          copro_id?: string
          created_at?: string
          date_debut_mandat?: string | null
          date_fin_mandat?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          nom?: string
          role?: string
          telephone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membres_cs_copro_id_fkey"
            columns: ["copro_id"]
            isOneToOne: false
            referencedRelation: "copros"
            referencedColumns: ["id"]
          },
        ]
      }
      presence_pre_ag: {
        Row: {
          evenement_id: string
          id: string
          pouvoirs_recus: number
          presents_prevus: number
          total_lots: number | null
          updated_at: string
          votes_correspondance_recus: number
        }
        Insert: {
          evenement_id: string
          id?: string
          pouvoirs_recus?: number
          presents_prevus?: number
          total_lots?: number | null
          updated_at?: string
          votes_correspondance_recus?: number
        }
        Update: {
          evenement_id?: string
          id?: string
          pouvoirs_recus?: number
          presents_prevus?: number
          total_lots?: number | null
          updated_at?: string
          votes_correspondance_recus?: number
        }
        Relationships: [
          {
            foreignKeyName: "presence_pre_ag_evenement_id_fkey"
            columns: ["evenement_id"]
            isOneToOne: true
            referencedRelation: "evenements"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string
          email: string
          gestionnaire_initials: string | null
          id: string
          is_active: boolean
          reports_to_user_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email: string
          gestionnaire_initials?: string | null
          id?: string
          is_active?: boolean
          reports_to_user_id?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          gestionnaire_initials?: string | null
          id?: string
          is_active?: boolean
          reports_to_user_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_reports_to_user_id_fkey"
            columns: ["reports_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  real31_intranet: {
    Enums: {},
  },
} as const
