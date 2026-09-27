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
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service_location: string | null
          service_request_id: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_location?: string | null
          service_request_id: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_location?: string | null
          service_request_id?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          phone: string
          preferred_contact_method: Database["public"]["Enums"]["contact_method"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          phone: string
          preferred_contact_method?: Database["public"]["Enums"]["contact_method"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          phone?: string
          preferred_contact_method?: Database["public"]["Enums"]["contact_method"]
          updated_at?: string
        }
        Relationships: []
      }
      mileage_records: {
        Row: {
          created_at: string
          id: string
          mileage: number
          recorded_at: string
          service_request_id: string | null
          source: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mileage: number
          recorded_at?: string
          service_request_id?: string | null
          source?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mileage?: number
          recorded_at?: string
          service_request_id?: string | null
          source?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mileage_records_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mileage_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          item_type: Database["public"]["Enums"]["quote_item_type"]
          line_total: number
          position: number
          quantity: number
          quote_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          item_type: Database["public"]["Enums"]["quote_item_type"]
          line_total?: number
          position?: number
          quantity?: number
          quote_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_type?: Database["public"]["Enums"]["quote_item_type"]
          line_total?: number
          position?: number
          quantity?: number
          quote_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          created_at: string
          customer_notes: string | null
          declined_at: string | null
          discount_total: number
          estimated_total: number
          expiration_date: string | null
          fees_total: number
          id: string
          internal_notes: string | null
          labor_subtotal: number
          parts_subtotal: number
          public_token: string
          sent_at: string | null
          service_request_id: string
          status: Database["public"]["Enums"]["quote_status"]
          tax_total: number
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          customer_notes?: string | null
          declined_at?: string | null
          discount_total?: number
          estimated_total?: number
          expiration_date?: string | null
          fees_total?: number
          id?: string
          internal_notes?: string | null
          labor_subtotal?: number
          parts_subtotal?: number
          public_token?: string
          sent_at?: string | null
          service_request_id: string
          status?: Database["public"]["Enums"]["quote_status"]
          tax_total?: number
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          customer_notes?: string | null
          declined_at?: string | null
          discount_total?: number
          estimated_total?: number
          expiration_date?: string | null
          fees_total?: number
          id?: string
          internal_notes?: string | null
          labor_subtotal?: number
          parts_subtotal?: number
          public_token?: string
          sent_at?: string | null
          service_request_id?: string
          status?: Database["public"]["Enums"]["quote_status"]
          tax_total?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachments: {
        Row: {
          created_at: string
          file_type: string | null
          id: string
          service_request_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_type?: string | null
          id?: string
          service_request_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          file_type?: string | null
          id?: string
          service_request_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          created_at: string
          customer_id: string
          details: Json
          id: string
          mileage: number | null
          notes: string | null
          request_number: string
          service_category: string
          service_location_type: string
          service_subcategory: string | null
          services: Json
          status: Database["public"]["Enums"]["request_status"]
          symptoms: string[]
          updated_at: string
          vehicle_id: string
          zip_code: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          details?: Json
          id?: string
          mileage?: number | null
          notes?: string | null
          request_number?: string
          service_category: string
          service_location_type?: string
          service_subcategory?: string | null
          services?: Json
          status?: Database["public"]["Enums"]["request_status"]
          symptoms?: string[]
          updated_at?: string
          vehicle_id: string
          zip_code: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          details?: Json
          id?: string
          mileage?: number | null
          notes?: string | null
          request_number?: string
          service_category?: string
          service_location_type?: string
          service_subcategory?: string | null
          services?: Json
          status?: Database["public"]["Enums"]["request_status"]
          symptoms?: string[]
          updated_at?: string
          vehicle_id?: string
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          body_type: string | null
          created_at: string
          customer_id: string
          cylinder_count: number | null
          drivetrain: Database["public"]["Enums"]["drivetrain_type"]
          drivetrain_source:
            | Database["public"]["Enums"]["vehicle_data_source"]
            | null
          engine_code: string | null
          engine_displacement: number | null
          engine_source:
            | Database["public"]["Enums"]["vehicle_data_source"]
            | null
          fuel_type: string | null
          id: string
          is_hybrid: boolean | null
          make: string | null
          mileage: number | null
          model: string | null
          trim: string | null
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          body_type?: string | null
          created_at?: string
          customer_id: string
          cylinder_count?: number | null
          drivetrain?: Database["public"]["Enums"]["drivetrain_type"]
          drivetrain_source?:
            | Database["public"]["Enums"]["vehicle_data_source"]
            | null
          engine_code?: string | null
          engine_displacement?: number | null
          engine_source?:
            | Database["public"]["Enums"]["vehicle_data_source"]
            | null
          fuel_type?: string | null
          id?: string
          is_hybrid?: boolean | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          trim?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          body_type?: string | null
          created_at?: string
          customer_id?: string
          cylinder_count?: number | null
          drivetrain?: Database["public"]["Enums"]["drivetrain_type"]
          drivetrain_source?:
            | Database["public"]["Enums"]["vehicle_data_source"]
            | null
          engine_code?: string | null
          engine_displacement?: number | null
          engine_source?:
            | Database["public"]["Enums"]["vehicle_data_source"]
            | null
          fuel_type?: string | null
          id?: string
          is_hybrid?: boolean | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          trim?: string | null
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
      appointment_status: "pending" | "scheduled" | "completed" | "cancelled"
      contact_method: "text" | "call" | "email" | "both"
      drivetrain_type: "fwd" | "rwd" | "awd" | "4wd" | "unknown"
      quote_item_type: "labor" | "part" | "fee" | "discount"
      quote_status: "draft" | "sent" | "accepted" | "declined" | "expired"
      request_status:
        | "new"
        | "reviewing"
        | "quoted"
        | "accepted"
        | "declined"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      vehicle_data_source: "vin" | "customer"
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
    Enums: {
      app_role: ["admin"],
      appointment_status: ["pending", "scheduled", "completed", "cancelled"],
      contact_method: ["text", "call", "email", "both"],
      drivetrain_type: ["fwd", "rwd", "awd", "4wd", "unknown"],
      quote_item_type: ["labor", "part", "fee", "discount"],
      quote_status: ["draft", "sent", "accepted", "declined", "expired"],
      request_status: [
        "new",
        "reviewing",
        "quoted",
        "accepted",
        "declined",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      vehicle_data_source: ["vin", "customer"],
    },
  },
} as const
