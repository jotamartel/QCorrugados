import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Tipos de la base de datos
export type UserRole = 'admin' | 'client'
export type OrderStatus = 'pending' | 'approved' | 'in_production' | 'ready' | 'delivered' | 'cancelled'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  role: UserRole
  company_name: string | null
  address: string | null
  city: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface BoxCatalog {
  id: string
  name: string
  l_mm: number
  w_mm: number
  h_mm: number
  unfolded_w: number
  unfolded_h: number
  is_doble_chapeton: boolean
  plancha_w: number | null
  is_standard: boolean
  created_by: string | null
  created_at: string
  active: boolean
}

export interface ClientBox {
  id: string
  client_id: string
  box_id: string
  nickname: string | null
  typical_quantity: number
  notes: string | null
  last_ordered_at: string | null
  order_count: number
  created_at: string
  box?: BoxCatalog
}

export interface Order {
  id: string
  order_number: number
  client_id: string
  status: OrderStatus
  requested_date: string
  approved_date: string | null
  delivery_date: string | null
  notes: string | null
  admin_notes: string | null
  total_boxes: number
  total_planchas: number
  created_at: string
  updated_at: string
  created_by: string | null
  approved_by: string | null
  // Joined fields
  client_name?: string
  company_name?: string
  client_email?: string
  client_phone?: string
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  box_id: string
  quantity: number
  notes: string | null
  created_at: string
  box?: BoxCatalog
}

export interface OrderHistory {
  id: string
  order_id: string
  changed_by: string | null
  old_status: OrderStatus | null
  new_status: OrderStatus | null
  notes: string | null
  created_at: string
}

export interface ClientAnalytics {
  client_id: string
  full_name: string | null
  company_name: string | null
  email: string
  total_orders: number
  total_boxes_ordered: number
  last_order_date: string | null
  first_order_date: string | null
  avg_days_between_orders: number | null
}

// Helpers de estado de orden
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  in_production: 'En Producción',
  ready: 'Lista',
  delivered: 'Entregada',
  cancelled: 'Cancelada'
}

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  in_production: 'bg-purple-100 text-purple-800',
  ready: 'bg-green-100 text-green-800',
  delivered: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800'
}

// Función para calcular fecha mínima de entrega (1 semana)
export function getMinDeliveryDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date.toISOString().split('T')[0]
}

// Función para formatear fecha
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

// Función para formatear fecha con hora
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
