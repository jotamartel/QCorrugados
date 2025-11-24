'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { 
  supabase, 
  BoxCatalog, 
  Order, 
  OrderItem,
  ORDER_STATUS_LABELS, 
  ORDER_STATUS_COLORS,
  getMinDeliveryDate,
  formatDate,
  formatDateTime
} from '@/lib/supabase'
import { 
  Box, LogOut, Plus, ShoppingCart, History, Package, 
  Calendar, Loader2, Check, X, ChevronRight, Trash2,
  AlertCircle, User, Building2, Phone, Mail, Layers
} from 'lucide-react'

type ViewMode = 'orders' | 'new-order' | 'profile'

interface CartItem {
  box: BoxCatalog
  quantity: number
}

export default function ClientPortal() {
  const router = useRouter()
  const { user, profile, loading: authLoading, signOut, refreshProfile } = useAuth()
  
  const [viewMode, setViewMode] = useState<ViewMode>('orders')
  const [boxes, setBoxes] = useState<BoxCatalog[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  
  // Carrito
  const [cart, setCart] = useState<CartItem[]>([])
  const [deliveryDate, setDeliveryDate] = useState(getMinDeliveryDate())
  const [orderNotes, setOrderNotes] = useState('')
  
  // Perfil
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    company_name: '',
    phone: '',
    address: '',
    city: ''
  })
  const [savingProfile, setSavingProfile] = useState(false)

  // Orden expandida
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({})

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        company_name: profile.company_name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        city: profile.city || ''
      })
    }
  }, [profile])

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user])

  const fetchData = async () => {
    setLoading(true)
    
    // Cargar catálogo de cajas
    const { data: boxData } = await supabase
      .from('box_catalog')
      .select('*')
      .eq('active', true)
      .order('name')
    
    if (boxData) setBoxes(boxData)

    // Cargar órdenes del cliente
    const { data: orderData } = await supabase
      .from('orders')
      .select('*')
      .eq('client_id', user!.id)
      .order('created_at', { ascending: false })
    
    if (orderData) setOrders(orderData)
    
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

  const addToCart = (box: BoxCatalog) => {
    const existing = cart.find(item => item.box.id === box.id)
    if (existing) {
      setCart(cart.map(item => 
        item.box.id === box.id 
          ? { ...item, quantity: item.quantity + 100 }
          : item
      ))
    } else {
      setCart([...cart, { box, quantity: 100 }])
    }
  }

  const updateCartQuantity = (boxId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.box.id !== boxId))
    } else {
      setCart(cart.map(item => 
        item.box.id === boxId ? { ...item, quantity } : item
      ))
    }
  }

  const removeFromCart = (boxId: string) => {
    setCart(cart.filter(item => item.box.id !== boxId))
  }

  const submitOrder = async () => {
    if (cart.length === 0) return
    
    setSubmitting(true)
    
    try {
      // Crear orden
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          client_id: user!.id,
          requested_date: deliveryDate,
          notes: orderNotes || null,
          created_by: user!.id
        })
        .select()
        .single()

      if (orderError) throw orderError

      // Crear items de la orden
      const items = cart.map(item => ({
        order_id: order.id,
        box_id: item.box.id,
        quantity: item.quantity
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(items)

      if (itemsError) throw itemsError

      // Limpiar y refrescar
      setCart([])
      setOrderNotes('')
      setDeliveryDate(getMinDeliveryDate())
      setViewMode('orders')
      fetchData()
      
      alert('¡Orden enviada correctamente! Te contactaremos pronto.')
    } catch (error) {
      console.error('Error:', error)
      alert('Error al enviar la orden. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    
    const { error } = await supabase
      .from('profiles')
      .update(profileForm)
      .eq('id', user!.id)

    if (!error) {
      await refreshProfile()
      alert('Perfil actualizado correctamente')
    } else {
      alert('Error al guardar el perfil')
    }
    
    setSavingProfile(false)
  }

  const totalBoxes = cart.reduce((sum, item) => sum + item.quantity, 0)
  const totalPlanchas = cart.reduce((sum, item) => {
    const multiplier = item.box.is_doble_chapeton ? 2 : 1
    return sum + (item.quantity * multiplier)
  }, 0)

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
              <Box className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Q Corrugados</h1>
              <p className="text-xs text-gray-500">Portal de Cliente</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 hidden sm:block">
              {profile?.full_name || profile?.email}
            </span>
            <button
              onClick={() => signOut()}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('orders')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2
                ${viewMode === 'orders' 
                  ? 'border-amber-600 text-amber-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            >
              <History className="w-4 h-4" />
              Mis Órdenes
            </button>
            <button
              onClick={() => setViewMode('new-order')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2
                ${viewMode === 'new-order' 
                  ? 'border-amber-600 text-amber-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            >
              <Plus className="w-4 h-4" />
              Nueva Orden
              {cart.length > 0 && (
                <span className="bg-amber-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {cart.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('profile')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2
                ${viewMode === 'profile' 
                  ? 'border-amber-600 text-amber-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'}`}
            >
              <User className="w-4 h-4" />
              Mi Perfil
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        
        {/* === MIS ÓRDENES === */}
        {viewMode === 'orders' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Historial de Órdenes</h2>
            
            {orders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No tenés órdenes todavía</p>
                <button
                  onClick={() => setViewMode('new-order')}
                  className="mt-4 text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Crear primera orden
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => toggleOrderExpand(order.id)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-left">
                          <div className="font-semibold text-gray-900">
                            Orden #{order.order_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatDateTime(order.created_at)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                          <div className="text-sm text-gray-600">{order.total_boxes} cajas</div>
                          <div className="text-xs text-gray-400">{order.total_planchas} planchas</div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                        <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expandedOrder === order.id ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                    
                    {expandedOrder === order.id && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                        <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                          <div>
                            <span className="text-gray-500">Fecha solicitada:</span>
                            <span className="ml-2 font-medium">{formatDate(order.requested_date)}</span>
                          </div>
                          {order.approved_date && (
                            <div>
                              <span className="text-gray-500">Fecha confirmada:</span>
                              <span className="ml-2 font-medium">{formatDate(order.approved_date)}</span>
                            </div>
                          )}
                        </div>
                        
                        {order.notes && (
                          <div className="text-sm mb-3">
                            <span className="text-gray-500">Notas:</span>
                            <span className="ml-2">{order.notes}</span>
                          </div>
                        )}
                        
                        <div className="text-sm font-medium text-gray-700 mb-2">Items:</div>
                        {orderItems[order.id] ? (
                          <div className="space-y-2">
                            {orderItems[order.id].map(item => (
                              <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4 text-amber-600" />
                                  <span className="font-medium">{item.box?.name}</span>
                                  {item.box?.is_doble_chapeton && (
                                    <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded">2P</span>
                                  )}
                                </div>
                                <span className="text-gray-600">{item.quantity} unidades</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Cargando...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === NUEVA ORDEN === */}
        {viewMode === 'new-order' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Catálogo */}
            <div className="lg:col-span-2">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Catálogo de Cajas</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {boxes.map(box => {
                  const inCart = cart.find(item => item.box.id === box.id)
                  
                  return (
                    <div 
                      key={box.id}
                      className={`bg-white rounded-xl border-2 p-4 transition-all
                        ${inCart ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">{box.name}</h3>
                          <p className="text-xs text-gray-500">
                            {box.is_doble_chapeton ? (
                              <span className="text-blue-600">2 × ({box.unfolded_w} × {box.unfolded_h} mm)</span>
                            ) : (
                              <span>{box.unfolded_w} × {box.unfolded_h} mm</span>
                            )}
                          </p>
                        </div>
                        {box.is_doble_chapeton && (
                          <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded font-semibold flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            2P
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-3">
                        <span className="font-medium">{box.l_mm}×{box.w_mm}×{box.h_mm}</span> mm (L×W×H)
                      </div>
                      
                      {inCart ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={inCart.quantity}
                            onChange={(e) => updateCartQuantity(box.id, parseInt(e.target.value) || 0)}
                            className="flex-1 px-3 py-1.5 border border-amber-300 rounded-lg text-center"
                            min="1"
                            step="10"
                          />
                          <button
                            onClick={() => removeFromCart(box.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(box)}
                          className="w-full bg-amber-600 hover:bg-amber-700 text-white py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1"
                        >
                          <Plus className="w-4 h-4" />
                          Agregar
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Carrito */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-24">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Tu Pedido
                </h3>
                
                {cart.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    Agregá cajas del catálogo
                  </p>
                ) : (
                  <>
                    <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                      {cart.map(item => (
                        <div key={item.box.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <div>
                            <div className="font-medium text-sm">{item.box.name}</div>
                            <div className="text-xs text-gray-500">{item.quantity} unidades</div>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.box.id)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    <div className="border-t border-gray-200 pt-3 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total cajas:</span>
                        <span className="font-semibold">{totalBoxes}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total planchas:</span>
                        <span className="font-semibold">{totalPlanchas}</span>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        Fecha de entrega deseada
                      </label>
                      <input
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        min={getMinDeliveryDate()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Mínimo 7 días de anticipación
                      </p>
                    </div>
                    
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notas (opcional)
                      </label>
                      <textarea
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        rows={2}
                        placeholder="Instrucciones especiales..."
                      />
                    </div>
                    
                    <button
                      onClick={submitOrder}
                      disabled={submitting}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5" />
                          Enviar Pedido
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* === MI PERFIL === */}
        {viewMode === 'profile' && (
          <div className="max-w-xl mx-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Mi Perfil</h2>
            
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <User className="w-4 h-4 inline mr-1" />
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Empresa
                  </label>
                  <input
                    type="text"
                    value={profileForm.company_name}
                    onChange={(e) => setProfileForm({ ...profileForm, company_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email
                  </label>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="+54 11 1234-5678"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dirección
                  </label>
                  <input
                    type="text"
                    value={profileForm.address}
                    onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Calle 123"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={profileForm.city}
                    onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Buenos Aires"
                  />
                </div>
                
                <button
                  onClick={saveProfile}
                  disabled={savingProfile}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
