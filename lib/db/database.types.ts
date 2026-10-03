/**
 * HAND-WRITTEN from supabase/migrations/*.sql. Will be replaced by generated
 * types (`pnpm db:types`) once the Supabase project exists:
 *   supabase gen types typescript --linked > lib/db/database.types.ts
 * The shape below mirrors what `supabase gen types typescript` emits, so the
 * swap should be a no-op for callers. Keep it in sync with the migrations
 * until then; the SQL is the source of truth.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      agent_events: {
        Row: {
          actor: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          input: Json | null;
          latency_ms: number | null;
          model: string | null;
          org_id: string;
          output: Json | null;
          prompt_version: string | null;
          tokens_in: number | null;
          tokens_out: number | null;
          type: string;
        };
        Insert: {
          actor: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          input?: Json | null;
          latency_ms?: number | null;
          model?: string | null;
          org_id: string;
          output?: Json | null;
          prompt_version?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          type: string;
        };
        Update: {
          actor?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          input?: Json | null;
          latency_ms?: number | null;
          model?: string | null;
          org_id?: string;
          output?: Json | null;
          prompt_version?: string | null;
          tokens_in?: number | null;
          tokens_out?: number | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agent_events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      cadences: {
        Row: {
          created_at: string;
          id: string;
          invoice_id: string;
          next_run_at: string | null;
          org_id: string;
          pause_reason: string | null;
          paused_until: string | null;
          status: Database["public"]["Enums"]["cadence_status"];
          step: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invoice_id: string;
          next_run_at?: string | null;
          org_id: string;
          pause_reason?: string | null;
          paused_until?: string | null;
          status?: Database["public"]["Enums"]["cadence_status"];
          step?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invoice_id?: string;
          next_run_at?: string | null;
          org_id?: string;
          pause_reason?: string | null;
          paused_until?: string | null;
          status?: Database["public"]["Enums"]["cadence_status"];
          step?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cadences_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoice_overview";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "cadences_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "cadences_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          company: string | null;
          contact_flag: string;
          created_at: string;
          do_not_contact: boolean;
          email: string;
          id: string;
          name: string;
          notes: string | null;
          org_id: string;
          risk_score: number;
          updated_at: string;
        };
        Insert: {
          company?: string | null;
          contact_flag?: string;
          created_at?: string;
          do_not_contact?: boolean;
          email: string;
          id?: string;
          name: string;
          notes?: string | null;
          org_id: string;
          risk_score?: number;
          updated_at?: string;
        };
        Update: {
          company?: string | null;
          contact_flag?: string;
          created_at?: string;
          do_not_contact?: boolean;
          email?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          org_id?: string;
          risk_score?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount_cents: number;
          created_at: string;
          currency: string;
          customer_id: string;
          due_at: string;
          external_id: string | null;
          id: string;
          issued_at: string;
          number: string;
          org_id: string;
          paid_at: string | null;
          source: string;
          status: Database["public"]["Enums"]["invoice_status"];
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          currency?: string;
          customer_id: string;
          due_at: string;
          external_id?: string | null;
          id?: string;
          issued_at: string;
          number: string;
          org_id: string;
          paid_at?: string | null;
          source?: string;
          status?: Database["public"]["Enums"]["invoice_status"];
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          due_at?: string;
          external_id?: string | null;
          id?: string;
          issued_at?: string;
          number?: string;
          org_id?: string;
          paid_at?: string | null;
          source?: string;
          status?: Database["public"]["Enums"]["invoice_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_org_id_fkey";
            columns: ["customer_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "invoices_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          org_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          org_id: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          autonomy: Database["public"]["Enums"]["autonomy"];
          created_at: string;
          id: string;
          name: string;
          plan: Database["public"]["Enums"]["plan"];
          slug: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          timezone: string;
          updated_at: string;
          voice: Json;
        };
        Insert: {
          autonomy?: Database["public"]["Enums"]["autonomy"];
          created_at?: string;
          id?: string;
          name: string;
          plan?: Database["public"]["Enums"]["plan"];
          slug: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          timezone?: string;
          updated_at?: string;
          voice?: Json;
        };
        Update: {
          autonomy?: Database["public"]["Enums"]["autonomy"];
          created_at?: string;
          id?: string;
          name?: string;
          plan?: Database["public"]["Enums"]["plan"];
          slug?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          timezone?: string;
          updated_at?: string;
          voice?: Json;
        };
        Relationships: [];
      };
      outbox: {
        Row: {
          created_at: string;
          html: string | null;
          id: string;
          org_id: string;
          provider: string;
          status: string;
          subject: string;
          text: string;
          to_email: string;
          touch_id: string;
        };
        Insert: {
          created_at?: string;
          html?: string | null;
          id?: string;
          org_id: string;
          provider?: string;
          status?: string;
          subject: string;
          text: string;
          to_email: string;
          touch_id: string;
        };
        Update: {
          created_at?: string;
          html?: string | null;
          id?: string;
          org_id?: string;
          provider?: string;
          status?: string;
          subject?: string;
          text?: string;
          to_email?: string;
          touch_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outbox_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outbox_touch_id_org_id_fkey";
            columns: ["touch_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "touches";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      replies: {
        Row: {
          classification: Json | null;
          created_at: string;
          from_email: string;
          handled: boolean;
          handled_at: string | null;
          id: string;
          intent: Database["public"]["Enums"]["reply_intent"] | null;
          invoice_id: string;
          org_id: string;
          raw_text: string;
          received_at: string;
          simulated: boolean;
          touch_id: string | null;
        };
        Insert: {
          classification?: Json | null;
          created_at?: string;
          from_email: string;
          handled?: boolean;
          handled_at?: string | null;
          id?: string;
          intent?: Database["public"]["Enums"]["reply_intent"] | null;
          invoice_id: string;
          org_id: string;
          raw_text: string;
          received_at?: string;
          simulated?: boolean;
          touch_id?: string | null;
        };
        Update: {
          classification?: Json | null;
          created_at?: string;
          from_email?: string;
          handled?: boolean;
          handled_at?: string | null;
          id?: string;
          intent?: Database["public"]["Enums"]["reply_intent"] | null;
          invoice_id?: string;
          org_id?: string;
          raw_text?: string;
          received_at?: string;
          simulated?: boolean;
          touch_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "replies_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoice_overview";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "replies_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "replies_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "replies_touch_id_org_id_fkey";
            columns: ["touch_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "touches";
            referencedColumns: ["id", "org_id"];
          },
        ];
      };
      touches: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          body: string;
          cadence_id: string | null;
          confidence: number;
          created_at: string;
          id: string;
          invoice_id: string;
          org_id: string;
          provider_message_id: string | null;
          rationale: string | null;
          reject_reason: string | null;
          sent_at: string | null;
          snoozed_until: string | null;
          status: Database["public"]["Enums"]["touch_status"];
          step: number;
          subject: string;
          tone: Database["public"]["Enums"]["touch_tone"];
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          body: string;
          cadence_id?: string | null;
          confidence?: number;
          created_at?: string;
          id?: string;
          invoice_id: string;
          org_id: string;
          provider_message_id?: string | null;
          rationale?: string | null;
          reject_reason?: string | null;
          sent_at?: string | null;
          snoozed_until?: string | null;
          status?: Database["public"]["Enums"]["touch_status"];
          step: number;
          subject: string;
          tone: Database["public"]["Enums"]["touch_tone"];
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          body?: string;
          cadence_id?: string | null;
          confidence?: number;
          created_at?: string;
          id?: string;
          invoice_id?: string;
          org_id?: string;
          provider_message_id?: string | null;
          rationale?: string | null;
          reject_reason?: string | null;
          sent_at?: string | null;
          snoozed_until?: string | null;
          status?: Database["public"]["Enums"]["touch_status"];
          step?: number;
          subject?: string;
          tone?: Database["public"]["Enums"]["touch_tone"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "touches_cadence_id_org_id_fkey";
            columns: ["cadence_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "cadences";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "touches_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoice_overview";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "touches_invoice_id_org_id_fkey";
            columns: ["invoice_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "touches_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      invoice_overview: {
        Row: {
          amount_cents: number | null;
          cadence_id: string | null;
          cadence_status: Database["public"]["Enums"]["cadence_status"] | null;
          cadence_step: number | null;
          created_at: string | null;
          currency: string | null;
          customer_do_not_contact: boolean | null;
          customer_email: string | null;
          customer_id: string | null;
          customer_name: string | null;
          due_at: string | null;
          external_id: string | null;
          id: string | null;
          is_overdue: boolean | null;
          issued_at: string | null;
          last_touch_at: string | null;
          next_run_at: string | null;
          number: string | null;
          org_id: string | null;
          paid_at: string | null;
          paused_until: string | null;
          sent_touch_count: number | null;
          source: string | null;
          status: Database["public"]["Enums"]["invoice_status"] | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_org_id_fkey";
            columns: ["customer_id", "org_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id", "org_id"];
          },
          {
            foreignKeyName: "invoices_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      current_org_ids: { Args: never; Returns: string[] };
      is_org_member: { Args: { org: string }; Returns: boolean };
      is_org_owner: { Args: { org: string }; Returns: boolean };
    };
    Enums: {
      autonomy: "manual" | "auto_step1" | "auto_all_low_risk";
      cadence_status: "active" | "paused" | "stopped" | "completed";
      invoice_status:
        | "open"
        | "pending_verification"
        | "paid"
        | "disputed"
        | "written_off"
        | "paused";
      plan: "free" | "pro";
      reply_intent:
        | "paid"
        | "promise_to_pay"
        | "dispute"
        | "question"
        | "wrong_contact"
        | "out_of_office"
        | "unsubscribe"
        | "other";
      touch_status:
        | "draft"
        | "approved"
        | "snoozed"
        | "rejected"
        | "cancelled"
        | "sent"
        | "failed";
      touch_tone: "friendly" | "firm" | "formal" | "final" | "check_in" | "reply";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      autonomy: ["manual", "auto_step1", "auto_all_low_risk"],
      cadence_status: ["active", "paused", "stopped", "completed"],
      invoice_status: [
        "open",
        "pending_verification",
        "paid",
        "disputed",
        "written_off",
        "paused",
      ],
      plan: ["free", "pro"],
      reply_intent: [
        "paid",
        "promise_to_pay",
        "dispute",
        "question",
        "wrong_contact",
        "out_of_office",
        "unsubscribe",
        "other",
      ],
      touch_status: [
        "draft",
        "approved",
        "snoozed",
        "rejected",
        "cancelled",
        "sent",
        "failed",
      ],
      touch_tone: ["friendly", "firm", "formal", "final", "check_in", "reply"],
    },
  },
} as const;
