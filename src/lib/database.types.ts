/**
 * Hand-maintained mirror of the Postgres schema in `supabase/schema.sql`.
 *
 * Regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 */

export type PaymentStatus =
  | "not_required"
  | "pending"
  | "paid"
  | "refunded"
  | "failed";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      services: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price: number;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          duration_minutes: number;
          price: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price?: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      staff: {
        Row: {
          id: string;
          name: string;
          bio: string | null;
          avatar_url: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          bio?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          bio?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      staff_services: {
        Row: {
          staff_id: string;
          service_id: string;
        };
        Insert: {
          staff_id: string;
          service_id: string;
        };
        Update: {
          staff_id?: string;
          service_id?: string;
        };
        Relationships: [];
      };
      working_hours: {
        Row: {
          id: string;
          staff_id: string;
          day_of_week: number;
          /** `HH:MM:SS` in shop-local time. */
          start_time: string;
          end_time: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
        };
        Update: {
          id?: string;
          staff_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
        };
        Relationships: [];
      };
      time_off: {
        Row: {
          id: string;
          staff_id: string;
          starts_at: string;
          ends_at: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          starts_at: string;
          ends_at: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          staff_id?: string;
          starts_at?: string;
          ends_at?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      shop_settings: {
        Row: {
          id: boolean;
          currency_code: string;
          address_lines: string[];
          latitude: number | null;
          longitude: number | null;
          map_url: string | null;
          directions_note: string | null;
          deposit_enabled: boolean;
          deposit_amount: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          currency_code?: string;
          address_lines?: string[];
          latitude?: number | null;
          longitude?: number | null;
          map_url?: string | null;
          directions_note?: string | null;
          deposit_enabled?: boolean;
          deposit_amount?: number;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          currency_code?: string;
          address_lines?: string[];
          latitude?: number | null;
          longitude?: number | null;
          map_url?: string | null;
          directions_note?: string | null;
          deposit_enabled?: boolean;
          deposit_amount?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      shop_hours: {
        Row: {
          day_of_week: number;
          is_open: boolean;
          opens: string;
          closes: string;
          updated_at: string;
        };
        Insert: {
          day_of_week: number;
          is_open?: boolean;
          opens?: string;
          closes?: string;
          updated_at?: string;
        };
        Update: {
          day_of_week?: number;
          is_open?: boolean;
          opens?: string;
          closes?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shop_closures: {
        Row: {
          id: string;
          starts_on: string;
          ends_on: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          starts_on: string;
          ends_on: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          starts_on?: string;
          ends_on?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          service_id: string;
          staff_id: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          starts_at: string;
          ends_at: string;
          status: BookingStatus;
          notes: string | null;
          reference_code: string;
          payment_status: PaymentStatus;
          deposit_amount: number | null;
          deposit_currency: string | null;
          stripe_session_id: string | null;
          stripe_payment_intent: string | null;
          hold_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service_id: string;
          staff_id: string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          starts_at: string;
          ends_at: string;
          status?: BookingStatus;
          notes?: string | null;
          reference_code?: string;
          payment_status?: PaymentStatus;
          deposit_amount?: number | null;
          deposit_currency?: string | null;
          stripe_session_id?: string | null;
          stripe_payment_intent?: string | null;
          hold_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          service_id?: string;
          staff_id?: string;
          customer_name?: string;
          customer_email?: string;
          customer_phone?: string;
          starts_at?: string;
          ends_at?: string;
          status?: BookingStatus;
          notes?: string | null;
          reference_code?: string;
          payment_status?: PaymentStatus;
          deposit_amount?: number | null;
          deposit_currency?: string | null;
          stripe_session_id?: string | null;
          stripe_payment_intent?: string | null;
          hold_expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /** True when the caller is on the `admin_users` allowlist. */
      is_staff: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      /** Cancels pending bookings whose payment window lapsed. Returns the count. */
      release_expired_holds: {
        Args: Record<never, never>;
        Returns: number;
      };
    };
    Enums: {
      booking_status: BookingStatus;
      payment_status: PaymentStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}

export type Service = Database["public"]["Tables"]["services"]["Row"];
export type Staff = Database["public"]["Tables"]["staff"]["Row"];
export type StaffService =
  Database["public"]["Tables"]["staff_services"]["Row"];
export type WorkingHours = Database["public"]["Tables"]["working_hours"]["Row"];
export type TimeOff = Database["public"]["Tables"]["time_off"]["Row"];
export type ShopHours = Database["public"]["Tables"]["shop_hours"]["Row"];
export type ShopClosure = Database["public"]["Tables"]["shop_closures"]["Row"];
export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type ShopSettings =
  Database["public"]["Tables"]["shop_settings"]["Row"];
