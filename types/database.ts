export type UserRole = 'admin' | 'manager' | 'sales_rep' | 'inventory_manager' | 'finance';

export type CustomerType = 
  | 'end_user'
  | 'salon'
  | 'pharmacy'
  | 'clinic'
  | 'wholesale'
  | 'sale'
  | 'gift'
  | 'other';

export type CustomerClassification =
  | 'customer'
  | 'cold_lead'
  | 'personal'
  | 'salon'
  | 'home_based'
  | 'pharmacy'
  | 'no_response'
  | 'not_interested'
  | 'doctor_lead'
  | 'repeat_caller'
  | 'social_media'
  | 'unclassified'
  | 'needs_review'
  | 'other';

export type LeadSource =
  | 'sales'
  | 'social_media'
  | 'doctor'
  | 'google_maps'
  | 'whatsapp'
  | 'crm_legacy'
  | 'phone'
  | 'commercial'
  | 'unverified'
  | 'unknown';

export type CallOutcome =
  | 'answered'
  | 'no_answer'
  | 'busy'
  | 'wrong_number'
  | 'not_interested'
  | 'callback_requested'
  | 'order_placed'
  | 'whatsapp_sent';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export type PaymentMethod =
  | 'cash_on_delivery'
  | 'bank_transfer'
  | 'cliq'
  | 'installment';

export type PaymentStatus =
  | 'pending'
  | 'partial'
  | 'paid'
  | 'refunded';

export interface Profile {
  id: string;
  full_name_ar: string;
  full_name_en?: string;
  phone?: string;
  email?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar?: string;
  display_order: number;
}

export interface Product {
  id: string;
  category_id: string;
  sku: string;
  name_ar: string;
  name_en: string;
  retail_price: number;
  sale_price?: number;
  cost_price: number;
  slug: string;
  description_ar?: string;
  image_url?: string;
  is_active: boolean;
  inventory?: {
    quantity_on_hand: number;
    quantity_reserved: number;
    reorder_level: number;
  };
}

export interface Customer {
  id: string;
  legacy_id?: number;
  name: string;
  phone: string;
  customer_type: CustomerType;
  classification: CustomerClassification;
  lead_source: LeadSource;
  address?: string;
  city?: string;
  rep_name_raw?: string;
  assigned_rep_id?: string;
  notes?: string;
  last_contact_date?: string;
  next_call_date?: string;
  order_date?: string;
  legacy_product_text?: string;
  created_at: string;
}

export interface CallLog {
  id: string;
  customer_id: string;
  rep_id?: string;
  called_at: string;
  outcome: CallOutcome;
  notes?: string;
  next_call_date?: string;
  google_calendar_event_id?: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  rep_id?: string;
  rep_name?: string;
  source: string;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  delivery_address?: string;
  delivery_city?: string;
  notes?: string;
  raw_whatsapp_text?: string;
  order_date: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  product_name_raw: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}
