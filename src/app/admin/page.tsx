'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { 
  supabase, 
  BoxCatalog, 
  Order, 
  OrderItem,
  Profile,
  ClientBox,
  ClientAnalytics,
  OrderStatus,
  ORDER_STATUS_LABELS, 
  ORDER_STATUS_COLORS,
  formatDate,
  formatDateTime
} from '@/lib/supabase'
import { 
  Box, LogOut, Users, ShoppingCart, BarChart3, Package, Settings,
  Calendar, Loader2, Check, X, ChevronRight, ChevronDown, Search,
  AlertCircle, User, Building2, Phone, Mail, Clock, TrendingUp,
  FileText, Eye, Edit, Trash2, Plus, RefreshCw, Factory, Layers
} from 'lucide-react'

type ViewMode = 'orders' | 'clients' | 'analytics' | 'catalog' | 'production'

const STATUS_FLOW: OrderStatus[] = ['pending', 'approved', 'in_production', 'ready', 'delivered']

export default function AdminPanel() {
  const router = useRouter()
  const { user, profile, loading: authLoading, signOut, isAdmin } = useAuth()
  
  const [viewMode, setViewMode] = useState<ViewMode>('orders')
  const [orders, setOrders] = useState<Order[]>([])
  const [clients, setClients] = useState<Profile[]>([])
  const [boxes, setBoxes] = useState<BoxCatalog[]>([])
  const [analytics, setAnalytics] = useState<ClientAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filtros
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  
  // Orden expandida
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({})
  
  // Cliente expandido
  const [expandedClient, setExpandedClient] = useState<string | null>(null)
  const [clientBoxes, setClientBoxes] = useState<Record<string, ClientBox[]>>({})
  const [clientOrders, setClientOrders] = useState<Record<string, Order[]>>({})

  // Verificar acceso admin
  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login')
      } else if (profile && !isAdmin) {
        router.push('/cliente')
      }
    }
  }, [user, profile, authLoading, isAdmin, router])

  useEffect(() => {
    if (user && isAdmin) {
      fetchData()
    }
  }, [user, isAdmin])

  const fetchData = async () => {
    setLoading(true)
    
    // Cargar órdenes con info de cliente
    const { data: orderData } = await supabase
      .from('orders')
      .select(`
        *,
        client:profiles!orders_client_id_fkey(full_name, company_name, email, phone)
      `)
      .order('created_at', { ascending: false })
    
    if (orderData) {
      const mappedOrders = orderData.map(o => ({
        ...o,
        client_name: o.client?.full_name,
        company_name: o.client?.company_name,
        client_email: o.client?.email,
        client_phone: o.client?.phone
      }))
      setOrders(mappedOrders)
    }

    // Cargar clientes
    const { data: clientData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .order('created_at', { ascending: false })
    
    if (clientData) setClients(clientData)

    // Cargar catálogo
    const { data: boxData } = await supabase
      .from('box_catalog')
      .select('*')
      .order('name')
    
    if (boxData) setBoxes(boxData)

    // Cargar analytics
    const { data: analyticsData } = await supabase
      .from('client_analytics')
      .select('*')
    
    if (analyticsData) setAnalytics(analyticsData)
    
    setLoading(false)
  }

  const fetchOrderItems = async (orderId: string) => {
    const { data } = await supabase
      .from('order_items')
      .select('*, box:box_catalog(*)')
      .eq('order_id', orderId)
    
    if (data) {
      setOrderItems(prev => ({ ...prev, [orderId]: data }))
    }
  }

  const fetchClientDetails = async (clientId: string) => {
    // Cajas del cliente
    const { data: boxesData } = await supabase
      .from('client_boxes')
      .select('*, box:box_catalog(*)')
      .eq('client_id', clientId)
      .order('order_count', { ascending: false })
    
    if (boxesData) {
      setClientBoxes(prev => ({ ...prev, [clientId]: boxesData }))
    }

    // Órdenes del cliente
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (ordersData) {
      setClientOrders(prev => ({ ...prev, [clientId]: ordersData }))
    }
  }

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    const updates: Record<string, unknown> = { status: newStatus }
    
    if (newStatus === 'approved') {
      updates.approved_by = user!.id
      updates.approved_date = new Date().toISOString().split('T')[0]
    }
    if (newStatus === 'delivered') {
      updates.delivery_date = new Date().toISOString().split('T')[0]
    }

    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)

    if (!error) {
      fetchData()
    }
  }

  const toggleOrderExpand = (orderId: string) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null)
    } else {
      setExpandedOrder(orderId)
      if (!orderItems[orderId]) {
        fetchOrderItems(orderId)
      }
    }
  }

  const toggleClientExpand = (clientId: string) => {
    if (expandedClient === clientId) {
      setExpandedClient(null)
    } else {
      setExpandedClient(clientId)
      if (!clientBoxes[clientId]) {
        fetchClientDetails(clientId)
      }
    }
  }

  // Filtrar órdenes
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        return (
          order.order_number.toString().includes(search) ||
          order.client_name?.toLowerCase().includes(search) ||
          order.company_name?.toLowerCase().includes(search) ||
          order.client_email?.toLowerCase().includes(search)
        )
      }
      return true
    })
  }, [orders, statusFilter, searchTerm])

  // Estadísticas rápidas
  const stats = useMemo(() => {
    const pending = orders.filter(o => o.status === 'pending').length
    const inProduction = orders.filter(o => o.status === 'in_production').length
    const thisMonth = orders.filter(o => {
      const orderDate = new Date(o.created_at)
      const now = new Date()
      return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear()
    }).length
    const totalBoxes = orders.reduce((sum, o) => sum + o.total_boxes, 0)
    
    return { pending, inProduction, thisMonth, totalBoxes }
  }, [orders])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
              <Box className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold">Q Corrugados</h1>
              <p className="text-xs text-gray-400">Panel Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setViewMode('orders')}
            className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-3 transition-colors
              ${viewMode === 'orders' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <ShoppingCart className="w-5 h-5" />
            Órdenes
            {stats.pending > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {stats.pending}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setViewMode('clients')}
            className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-3 transition-colors
              ${viewMode === 'clients' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <Users className="w-5 h-5" />
            Clientes
            <span className="ml-auto text-gray-500 text-sm">{clients.length}</span>
          </button>
          
          <button
            onClick={() => setViewMode('analytics')}
            className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-3 transition-colors
              ${viewMode === 'analytics' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <BarChart3 className="w-5 h-5" />
            Análisis
          </button>
          
          <button
            onClick={() => setViewMode('catalog')}
            className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-3 transition-colors
              ${viewMode === 'catalog' ? 'bg-amber-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <Package className="w-5 h-5" />
            Catálogo
          </button>
          
          <button
            onClick={() => router.push('/')}
            className="w-full px-3 py-2 rounded-lg text-left flex items-center gap-3 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <Factory className="w-5 h-5" />
            Producción
          </button>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs text-gray-400">Administrador</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-200" />
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">En Producción</p>
                <p className="text-2xl font-bold text-purple-600">{stats.inProduction}</p>
              </div>
              <Factory className="w-8 h-8 text-purple-200" />
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Este mes</p>
                <p className="text-2xl font-bold text-blue-600">{stats.thisMonth}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-200" />
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Cajas</p>
                <p className="text-2xl font-bold text-green-600">{stats.totalBoxes.toLocaleString()}</p>
              </div>
              <Package className="w-8 h-8 text-green-200" />
            </div>
          </div>
        </div>

        {/* === ÓRDENES === */}
        {viewMode === 'orders' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Gestión de Órdenes</h2>
              <button
                onClick={fetchData}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por #orden, cliente, empresa..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OrderStatus | 'all')}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Todos los estados</option>
                {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Lista de órdenes */}
            <div className="space-y-3">
              {filteredOrders.map(order => (
                <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    onClick={() => toggleOrderExpand(order.id)}
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="font-bold text-lg text-gray-900">
                        #{order.order_number}
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">
                          {order.client_name || 'Sin nombre'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {order.company_name || order.client_email}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-medium">{order.total_boxes} cajas</div>
                        <div className="text-sm text-gray-500">
                          Entrega: {formatDate(order.requested_date)}
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expandedOrder === order.id ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  
                  {expandedOrder === order.id && (
                    <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
                      <div className="grid grid-cols-3 gap-6 mb-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-500 mb-2">Info del Cliente</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-gray-400" />
                              {order.client_email}
                            </div>
                            {order.client_phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4 text-gray-400" />
                                {order.client_phone}
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500 mb-2">Fechas</h4>
                          <div className="space-y-1 text-sm">
                            <div>Creada: {formatDateTime(order.created_at)}</div>
                            <div>Solicitada: {formatDate(order.requested_date)}</div>
                            {order.approved_date && <div>Aprobada: {formatDate(order.approved_date)}</div>}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-500 mb-2">Totales</h4>
                          <div className="space-y-1 text-sm">
                            <div>{order.total_boxes} cajas</div>
                            <div>{order.total_planchas} planchas</div>
                          </div>
                        </div>
                      </div>

                      {order.notes && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <span className="text-sm font-medium text-yellow-800">Nota del cliente: </span>
                          <span className="text-sm text-yellow-700">{order.notes}</span>
                        </div>
                      )}

                      {/* Items */}
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-500 mb-2">Items del pedido</h4>
                        {orderItems[order.id] ? (
                          <div className="bg-white rounded-lg border border-gray-200 divide-y">
                            {orderItems[order.id].map(item => (
                              <div key={item.id} className="px-3 py-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4 text-amber-600" />
                                  <span className="font-medium">{item.box?.name}</span>
                                  {item.box?.is_doble_chapeton && (
                                    <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <Layers className="w-3 h-3" />
                                      2P
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-600">
                                  {item.quantity} unidades
                                  {item.box?.is_doble_chapeton && (
                                    <span className="text-blue-600 text-sm ml-2">({item.quantity * 2} planchas)</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Cargando items...
                          </div>
                        )}
                      </div>

                      {/* Acciones de estado */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 mr-2">Cambiar estado:</span>
                        {STATUS_FLOW.map((status, index) => {
                          const currentIndex = STATUS_FLOW.indexOf(order.status)
                          const isNext = index === currentIndex + 1
                          const isCurrent = status === order.status
                          
                          return (
                            <button
                              key={status}
                              onClick={() => updateOrderStatus(order.id, status)}
                              disabled={!isNext && !isCurrent}
                              className={`px-3 py-1 rounded text-sm font-medium transition-colors
                                ${isCurrent 
                                  ? ORDER_STATUS_COLORS[status] + ' ring-2 ring-offset-1 ring-gray-400'
                                  : isNext
                                    ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                              {ORDER_STATUS_LABELS[status]}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => updateOrderStatus(order.id, 'cancelled')}
                          className="px-3 py-1 rounded text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 ml-auto"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === CLIENTES === */}
        {viewMode === 'clients' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Gestión de Clientes</h2>
            
            <div className="space-y-3">
              {clients.map(client => (
                <div key={client.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    onClick={() => toggleClientExpand(client.id)}
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-gray-500" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {client.full_name || 'Sin nombre'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {client.company_name || client.email}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-500">
                        {client.phone || 'Sin teléfono'}
                      </div>
                      <div className="text-sm text-gray-400">
                        Desde {formatDate(client.created_at)}
                      </div>
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expandedClient === client.id ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  
                  {expandedClient === client.id && (
                    <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
                      <div className="grid grid-cols-2 gap-6">
                        {/* Info de contacto */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-500 mb-2">Información de Contacto</h4>
                          <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-gray-400" />
                              {client.email}
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-gray-400" />
                              {client.phone || '-'}
                            </div>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-gray-400" />
                              {client.company_name || '-'}
                            </div>
                            <div>
                              <span className="text-gray-500">Dirección: </span>
                              {client.address ? `${client.address}, ${client.city}` : '-'}
                            </div>
                          </div>
                        </div>

                        {/* Cajas frecuentes */}
                        <div>
                          <h4 className="text-sm font-medium text-gray-500 mb-2">Cajas Más Pedidas</h4>
                          {clientBoxes[client.id] ? (
                            clientBoxes[client.id].length > 0 ? (
                              <div className="bg-white rounded-lg border border-gray-200 divide-y">
                                {clientBoxes[client.id].slice(0, 5).map(cb => (
                                  <div key={cb.id} className="px-3 py-2 flex items-center justify-between">
                                    <span className="font-medium">{cb.box?.name}</span>
                                    <span className="text-sm text-gray-500">{cb.order_count} pedidos</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">Sin historial de cajas</p>
                            )
                          ) : (
                            <div className="flex items-center gap-2 text-gray-500">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Cargando...
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Últimas órdenes */}
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-500 mb-2">Últimas Órdenes</h4>
                        {clientOrders[client.id] ? (
                          clientOrders[client.id].length > 0 ? (
                            <div className="bg-white rounded-lg border border-gray-200 divide-y">
                              {clientOrders[client.id].map(order => (
                                <div key={order.id} className="px-3 py-2 flex items-center justify-between">
                                  <div>
                                    <span className="font-medium">#{order.order_number}</span>
                                    <span className="text-sm text-gray-500 ml-2">{formatDate(order.created_at)}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">{order.total_boxes} cajas</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${ORDER_STATUS_COLORS[order.status]}`}>
                                      {ORDER_STATUS_LABELS[order.status]}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">Sin órdenes</p>
                          )
                        ) : (
                          <div className="flex items-center gap-2 text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Cargando...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === ANALYTICS === */}
        {viewMode === 'analytics' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Análisis de Clientes</h2>
            
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Cliente</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Empresa</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Órdenes</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Cajas Totales</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Última Orden</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Frecuencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {analytics.map(client => (
                    <tr key={client.client_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{client.full_name || '-'}</div>
                        <div className="text-sm text-gray-500">{client.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{client.company_name || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">{client.total_orders}</td>
                      <td className="px-4 py-3 text-right">{client.total_boxes_ordered?.toLocaleString() || 0}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-500">
                        {client.last_order_date ? formatDate(client.last_order_date) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {client.avg_days_between_orders ? (
                          <span className="text-green-600">
                            cada {client.avg_days_between_orders} días
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* === CATÁLOGO === */}
        {viewMode === 'catalog' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Catálogo de Cajas</h2>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              {boxes.map(box => (
                <div key={box.id} className={`bg-white rounded-xl border-2 p-4 ${box.is_doble_chapeton ? 'border-blue-300' : 'border-gray-200'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{box.name}</h3>
                      <p className="text-sm text-gray-500">
                        {box.l_mm}×{box.w_mm}×{box.h_mm} mm
                      </p>
                    </div>
                    {box.is_doble_chapeton && (
                      <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        2P
                      </span>
                    )}
                  </div>
                  
                  <div className="text-sm text-gray-600 mt-2">
                    <div>Desplegado: {box.unfolded_w} × {box.unfolded_h} mm</div>
                    {box.is_doble_chapeton && (
                      <div className="text-blue-600">2 planchas por caja</div>
                    )}
                  </div>
                  
                  <div className="mt-3 flex gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${box.is_standard ? 'bg-gray-100 text-gray-600' : 'bg-purple-100 text-purple-600'}`}>
                      {box.is_standard ? 'Estándar' : 'Personalizada'}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${box.active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {box.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
