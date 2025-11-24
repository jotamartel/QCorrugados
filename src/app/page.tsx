'use client'

import { useState, useMemo, useCallback } from 'react'
import { Package, Scissors, Calculator, BarChart3, Box, Layers, AlertTriangle, Check } from 'lucide-react'

// Tipos de datos
interface BoxType {
  id: string
  name: string
  l: number // largo cm
  w: number // ancho cm
  h: number // alto cm
  unfoldedW: number // ancho desplegado mm
  unfoldedH: number // alto desplegado mm
}

interface ProductionItem {
  boxId: string
  quantity: number
}

interface OptimizationResult {
  bobina: '1.60' | '1.30'
  bobinaUsable: number
  boxId: string
  boxesPerRow: number
  rowWidthMm: number
  wastePerRowMm: number
  wastePercent: number
  totalRows: number
  totalBoxes: number
  totalLengthM: number
}

// Datos de las cajas con medidas calculadas
// Fórmula RSC: Ancho = 2L + 2W + 50mm, Alto = H + W
const BOX_TYPES: BoxType[] = [
  { id: '20x20x10', name: '20×20×10', l: 20, w: 20, h: 10, unfoldedW: 850, unfoldedH: 300 },
  { id: '20x20x20', name: '20×20×20', l: 20, w: 20, h: 20, unfoldedW: 850, unfoldedH: 400 },
  { id: '30x20x15', name: '30×20×15', l: 30, w: 20, h: 15, unfoldedW: 1050, unfoldedH: 350 },
  { id: '30x20x20', name: '30×20×20', l: 30, w: 20, h: 20, unfoldedW: 1050, unfoldedH: 400 },
  { id: '40x30x20', name: '40×30×20', l: 40, w: 30, h: 20, unfoldedW: 1450, unfoldedH: 500 },
  { id: '40x30x30', name: '40×30×30', l: 40, w: 30, h: 30, unfoldedW: 1450, unfoldedH: 600 },
  { id: '50x40x30', name: '50×40×30', l: 50, w: 40, h: 30, unfoldedW: 1850, unfoldedH: 700 },
  { id: '50x40x40', name: '50×40×40', l: 50, w: 40, h: 40, unfoldedW: 1850, unfoldedH: 800 },
  { id: '60x40x30', name: '60×40×30', l: 60, w: 40, h: 30, unfoldedW: 2050, unfoldedH: 700 },
  { id: '60x40x40', name: '60×40×40', l: 60, w: 40, h: 40, unfoldedW: 2050, unfoldedH: 800 },
  { id: '70x50x50', name: '70×50×50', l: 70, w: 50, h: 50, unfoldedW: 2450, unfoldedH: 1000 },
]

// Bobinas disponibles
const BOBINAS = {
  '1.60': { width: 1600, usable: 1520, name: 'Bobina 1.60m' },
  '1.30': { width: 1300, usable: 1230, name: 'Bobina 1.30m' },
}

// Componente para visualizar caja desplegada
function BoxUnfoldedVisual({ box, scale = 0.15 }: { box: BoxType; scale?: number }) {
  const w = box.unfoldedW * scale
  const h = box.unfoldedH * scale
  
  // Dimensiones de cada sección
  const panelL = box.l * 10 * scale // convertir cm a mm y escalar
  const panelW = box.w * 10 * scale
  const panelH = box.h * 10 * scale
  const solapa = 50 * scale // solapa de pegue 50mm
  const solapaV = (box.w / 2) * 10 * scale // solapas verticales = W/2
  
  return (
    <svg width={w + 10} height={h + 10} className="drop-shadow-md">
      {/* Fondo de cartón */}
      <defs>
        <pattern id={`cardboard-${box.id}`} patternUnits="userSpaceOnUse" width="4" height="4">
          <rect width="4" height="4" fill="#d4a574"/>
          <circle cx="1" cy="1" r="0.5" fill="#c49a6c" opacity="0.5"/>
          <circle cx="3" cy="3" r="0.3" fill="#b8860b" opacity="0.3"/>
        </pattern>
      </defs>
      
      {/* Plancha principal */}
      <rect 
        x="5" y="5" 
        width={w} height={h} 
        fill={`url(#cardboard-${box.id})`}
        stroke="#8b6914"
        strokeWidth="2"
        rx="2"
      />
      
      {/* Líneas de pliegue horizontales */}
      <line x1="5" y1={5 + solapaV} x2={5 + w} y2={5 + solapaV} className="fold-line" />
      <line x1="5" y1={5 + solapaV + panelH} x2={5 + w} y2={5 + solapaV + panelH} className="fold-line" />
      
      {/* Líneas de pliegue verticales */}
      <line x1={5 + panelL} y1="5" x2={5 + panelL} y2={5 + h} className="fold-line" />
      <line x1={5 + panelL + panelW} y1="5" x2={5 + panelL + panelW} y2={5 + h} className="fold-line" />
      <line x1={5 + panelL * 2 + panelW} y1="5" x2={5 + panelL * 2 + panelW} y2={5 + h} className="fold-line" />
      <line x1={5 + panelL * 2 + panelW * 2} y1="5" x2={5 + panelL * 2 + panelW * 2} y2={5 + h} className="fold-line" />
      
      {/* Etiquetas de dimensiones */}
      <text x={w/2 + 5} y={h + 8} fontSize="8" fill="#5e4830" textAnchor="middle" fontWeight="600">
        {box.unfoldedW}mm
      </text>
      <text x={w + 12} y={h/2 + 5} fontSize="8" fill="#5e4830" textAnchor="middle" fontWeight="600" 
            transform={`rotate(90, ${w + 12}, ${h/2 + 5})`}>
        {box.unfoldedH}mm
      </text>
    </svg>
  )
}

// Componente para visualizar la bobina con cortes
function BobinaVisual({ result, box }: { result: OptimizationResult; box: BoxType }) {
  const bobina = BOBINAS[result.bobina]
  const scale = 0.08
  const bobinaH = bobina.usable * scale
  const rowW = box.unfoldedW * scale
  const boxH = box.unfoldedH * scale
  const visibleRows = Math.min(result.totalRows, 5) // Mostrar máximo 5 filas
  
  return (
    <div className="bg-white/50 p-4 rounded border-2 border-dashed border-amber-700/30">
      <div className="text-xs font-semibold mb-2 text-amber-900">
        Vista de corte en {bobina.name} ({bobina.usable}mm útiles)
      </div>
      <svg width={rowW + 60} height={bobinaH + 30}>
        {/* Bobina completa */}
        <rect x="40" y="10" width={rowW} height={bobinaH} fill="#f5f0e8" stroke="#8b6914" strokeWidth="1"/>
        
        {/* Área de refilado superior */}
        <rect x="40" y="10" width={rowW} height={20 * scale} fill="#e74c3c" opacity="0.2"/>
        
        {/* Cajas en la bobina */}
        {Array.from({ length: result.boxesPerRow }).map((_, i) => (
          <g key={i}>
            <rect 
              x="40" 
              y={10 + 20 * scale + (i * boxH)} 
              width={rowW} 
              height={boxH - 2} 
              fill="#d4a574"
              stroke="#8b6914"
              strokeWidth="1"
            />
            <text 
              x={40 + rowW / 2} 
              y={10 + 20 * scale + (i * boxH) + boxH / 2 + 3} 
              fontSize="8" 
              fill="#5e4830" 
              textAnchor="middle"
            >
              Caja {i + 1}
            </text>
          </g>
        ))}
        
        {/* Área de desperdicio */}
        <rect 
          x="40" 
          y={10 + 20 * scale + (result.boxesPerRow * boxH)} 
          width={rowW} 
          height={bobinaH - 20 * scale - (result.boxesPerRow * boxH)} 
          fill="#e74c3c" 
          opacity="0.3"
        />
        
        {/* Etiqueta de desperdicio */}
        <text x="30" y={bobinaH / 2 + 10} fontSize="8" fill="#c0392b" textAnchor="end" fontWeight="600">
          Desp: {result.wastePercent.toFixed(1)}%
        </text>
        
        {/* Indicador de ancho */}
        <text x={40 + rowW / 2} y={bobinaH + 25} fontSize="8" fill="#5e4830" textAnchor="middle">
          {result.boxesPerRow} cajas × {box.unfoldedH}mm = {result.rowWidthMm}mm
        </text>
      </svg>
    </div>
  )
}

// Componente principal
export default function CajasProduccion() {
  const [production, setProduction] = useState<ProductionItem[]>([])
  const [selectedBox, setSelectedBox] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'catalog' | 'production' | 'optimization'>('catalog')
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  // Actualizar cantidad en input del catálogo
  const setCatalogQty = useCallback((boxId: string, qty: number) => {
    setQuantities(prev => ({ ...prev, [boxId]: qty }))
  }, [])

  // Agregar cantidad a producción
  const addToProduction = (boxId: string, qty: number) => {
    if (qty <= 0) return
    setProduction(prev => {
      const existing = prev.find(p => p.boxId === boxId)
      if (existing) {
        return prev.map(p => p.boxId === boxId ? { ...p, quantity: p.quantity + qty } : p)
      }
      return [...prev, { boxId, quantity: qty }]
    })
  }

  // Actualizar cantidad
  const updateQuantity = (boxId: string, qty: number) => {
    if (qty <= 0) {
      setProduction(prev => prev.filter(p => p.boxId !== boxId))
    } else {
      setProduction(prev => prev.map(p => p.boxId === boxId ? { ...p, quantity: qty } : p))
    }
  }

  // Calcular optimización
  const optimization = useMemo(() => {
    return production.map(item => {
      const box = BOX_TYPES.find(b => b.id === item.boxId)!
      
      // Calcular para cada bobina
      const results: OptimizationResult[] = []
      
      for (const [key, bobina] of Object.entries(BOBINAS)) {
        const bobinaKey = key as '1.60' | '1.30'
        // Cuántas cajas caben en el ancho de la bobina (el alto de la caja desplegada va en el ancho de la bobina)
        const boxesPerRow = Math.floor(bobina.usable / box.unfoldedH)
        
        if (boxesPerRow > 0) {
          const rowWidthMm = boxesPerRow * box.unfoldedH
          const wastePerRowMm = bobina.usable - rowWidthMm
          const wastePercent = (wastePerRowMm / bobina.usable) * 100
          
          const totalRows = Math.ceil(item.quantity / boxesPerRow)
          const totalLengthM = (totalRows * box.unfoldedW) / 1000
          
          results.push({
            bobina: bobinaKey,
            bobinaUsable: bobina.usable,
            boxId: item.boxId,
            boxesPerRow,
            rowWidthMm,
            wastePerRowMm,
            wastePercent,
            totalRows,
            totalBoxes: item.quantity,
            totalLengthM,
          })
        }
      }
      
      // Ordenar por menor desperdicio
      return results.sort((a, b) => a.wastePercent - b.wastePercent)
    })
  }, [production])

  // Mejor opción por caja
  const bestOptions = useMemo(() => {
    return optimization.map(opts => opts[0]).filter(Boolean)
  }, [optimization])

  // Totales
  const totals = useMemo(() => {
    const byBobina: Record<string, { length: number; boxes: number }> = {
      '1.60': { length: 0, boxes: 0 },
      '1.30': { length: 0, boxes: 0 },
    }
    
    bestOptions.forEach(opt => {
      if (opt) {
        byBobina[opt.bobina].length += opt.totalLengthM
        byBobina[opt.bobina].boxes += opt.totalBoxes
      }
    })
    
    return byBobina
  }, [bestOptions])

  return (
    <div className="min-h-screen p-6">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 bg-amber-900 flex items-center justify-center">
            <Package className="w-8 h-8 text-amber-100" />
          </div>
          <div>
            <h1 className="font-display text-4xl tracking-wider text-amber-900">
              GESTIÓN DE PRODUCCIÓN
            </h1>
            <p className="text-sm text-amber-700">Sistema de optimización de corte de cajas de cartón</p>
          </div>
        </div>
        
        {/* Navegación */}
        <nav className="flex gap-2 mt-4">
          {[
            { id: 'catalog', label: 'CATÁLOGO', icon: Box },
            { id: 'production', label: 'PRODUCCIÓN', icon: Layers },
            { id: 'optimization', label: 'OPTIMIZACIÓN', icon: BarChart3 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id as typeof viewMode)}
              className={`btn-industrial px-6 py-3 flex items-center gap-2 ${
                viewMode === tab.id ? 'bg-amber-700' : ''
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Info de bobinas */}
      <div className="bg-white/60 border-2 border-amber-700/30 p-4 mb-6 flex gap-8">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-amber-700" />
          <div>
            <div className="text-xs text-amber-600">BOBINA 1.60m</div>
            <div className="font-semibold">1520mm útiles</div>
            <div className="text-xs text-gray-500">Refilado: 40mm (2cm/lado)</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-amber-700" />
          <div>
            <div className="text-xs text-amber-600">BOBINA 1.30m</div>
            <div className="font-semibold">1230mm útiles</div>
            <div className="text-xs text-gray-500">Refilado: 70mm (2cm/lado)</div>
          </div>
        </div>
      </div>

      {/* Vista: Catálogo */}
      {viewMode === 'catalog' && (
        <section>
          <h2 className="font-display text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <Box className="w-6 h-6" />
            CATÁLOGO DE CAJAS
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {BOX_TYPES.map(box => {
              const qty = quantities[box.id] || 0
              const inProduction = production.find(p => p.boxId === box.id)
              
              // Calcular aprovechamiento en cada bobina
              const fit160 = Math.floor(BOBINAS['1.60'].usable / box.unfoldedH)
              const fit130 = Math.floor(BOBINAS['1.30'].usable / box.unfoldedH)
              const waste160 = ((BOBINAS['1.60'].usable - (fit160 * box.unfoldedH)) / BOBINAS['1.60'].usable * 100).toFixed(1)
              const waste130 = ((BOBINAS['1.30'].usable - (fit130 * box.unfoldedH)) / BOBINAS['1.30'].usable * 100).toFixed(1)
              
              return (
                <div 
                  key={box.id}
                  className={`bg-white/80 border-2 p-4 transition-all ${
                    selectedBox === box.id ? 'border-amber-600 shadow-lg' : 'border-amber-700/20'
                  } ${inProduction ? 'ring-2 ring-green-500/50' : ''}`}
                  onClick={() => setSelectedBox(selectedBox === box.id ? null : box.id)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-display text-xl text-amber-900">{box.name}</h3>
                      <p className="text-xs text-amber-600">
                        Desplegado: {box.unfoldedW} × {box.unfoldedH} mm
                      </p>
                    </div>
                    {inProduction && (
                      <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                        {inProduction.quantity} uds
                      </span>
                    )}
                  </div>
                  
                  {/* Visual de la caja desplegada */}
                  <div className="flex justify-center mb-3">
                    <BoxUnfoldedVisual box={box} scale={0.12} />
                  </div>
                  
                  {/* Info de aprovechamiento */}
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div className={`p-2 rounded ${parseFloat(waste160) < parseFloat(waste130) ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <div className="font-semibold">Bobina 1.60</div>
                      <div>{fit160} cajas/fila</div>
                      <div className={parseFloat(waste160) < 10 ? 'text-green-600' : 'text-amber-600'}>
                        {waste160}% desperdicio
                      </div>
                    </div>
                    <div className={`p-2 rounded ${parseFloat(waste130) < parseFloat(waste160) ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <div className="font-semibold">Bobina 1.30</div>
                      <div>{fit130} cajas/fila</div>
                      <div className={parseFloat(waste130) < 10 ? 'text-green-600' : 'text-amber-600'}>
                        {waste130}% desperdicio
                      </div>
                    </div>
                  </div>
                  
                  {/* Input de cantidad */}
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={qty || ''}
                      onChange={(e) => setCatalogQty(box.id, parseInt(e.target.value) || 0)}
                      placeholder="Cantidad"
                      className="input-industrial flex-1 px-3 py-2 text-sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        addToProduction(box.id, qty)
                        setCatalogQty(box.id, 0)
                      }}
                      className="btn-industrial px-4 py-2 text-sm"
                      disabled={qty <= 0}
                    >
                      AGREGAR
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Vista: Producción */}
      {viewMode === 'production' && (
        <section>
          <h2 className="font-display text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <Layers className="w-6 h-6" />
            ORDEN DE PRODUCCIÓN
          </h2>
          
          {production.length === 0 ? (
            <div className="bg-white/60 border-2 border-dashed border-amber-700/30 p-12 text-center">
              <Package className="w-16 h-16 mx-auto text-amber-300 mb-4" />
              <p className="text-amber-700">No hay cajas en la orden de producción</p>
              <p className="text-sm text-amber-500">Agregá cajas desde el catálogo</p>
            </div>
          ) : (
            <div className="space-y-4">
              {production.map(item => {
                const box = BOX_TYPES.find(b => b.id === item.boxId)!
                
                return (
                  <div key={item.boxId} className="bg-white/80 border-2 border-amber-700/30 p-4">
                    <div className="flex items-center gap-6">
                      <BoxUnfoldedVisual box={box} scale={0.1} />
                      
                      <div className="flex-1">
                        <h3 className="font-display text-xl text-amber-900">{box.name}</h3>
                        <p className="text-xs text-amber-600">
                          {box.unfoldedW} × {box.unfoldedH} mm desplegado
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateQuantity(item.boxId, item.quantity - 10)}
                          className="w-8 h-8 bg-amber-100 hover:bg-amber-200 flex items-center justify-center font-bold"
                        >
                          -10
                        </button>
                        <button
                          onClick={() => updateQuantity(item.boxId, item.quantity - 1)}
                          className="w-8 h-8 bg-amber-100 hover:bg-amber-200 flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.boxId, parseInt(e.target.value) || 0)}
                          className="input-industrial w-24 px-3 py-2 text-center text-lg font-bold"
                        />
                        <button
                          onClick={() => updateQuantity(item.boxId, item.quantity + 1)}
                          className="w-8 h-8 bg-amber-100 hover:bg-amber-200 flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                        <button
                          onClick={() => updateQuantity(item.boxId, item.quantity + 10)}
                          className="w-8 h-8 bg-amber-100 hover:bg-amber-200 flex items-center justify-center font-bold"
                        >
                          +10
                        </button>
                      </div>
                      
                      <button
                        onClick={() => updateQuantity(item.boxId, 0)}
                        className="text-red-600 hover:text-red-800 p-2"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
              
              {/* Resumen */}
              <div className="bg-amber-900 text-amber-100 p-4 mt-6">
                <div className="font-display text-lg tracking-wider mb-2">RESUMEN DE PRODUCCIÓN</div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-2xl font-bold">{production.length}</div>
                    <div className="text-xs text-amber-300">Tipos de caja</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {production.reduce((sum, p) => sum + p.quantity, 0)}
                    </div>
                    <div className="text-xs text-amber-300">Cajas totales</div>
                  </div>
                  <div>
                    <button 
                      onClick={() => setViewMode('optimization')}
                      className="bg-amber-100 text-amber-900 px-6 py-2 font-display tracking-wider hover:bg-white transition-colors"
                    >
                      VER OPTIMIZACIÓN →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Vista: Optimización */}
      {viewMode === 'optimization' && (
        <section>
          <h2 className="font-display text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            OPTIMIZACIÓN DE CORTE
          </h2>
          
          {production.length === 0 ? (
            <div className="bg-white/60 border-2 border-dashed border-amber-700/30 p-12 text-center">
              <Calculator className="w-16 h-16 mx-auto text-amber-300 mb-4" />
              <p className="text-amber-700">No hay producción para optimizar</p>
              <p className="text-sm text-amber-500">Agregá cajas desde el catálogo primero</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumen de bobinas necesarias */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-amber-600 to-amber-800 text-white p-6">
                  <div className="text-xs text-amber-200 mb-1">BOBINA 1.60m</div>
                  <div className="font-display text-4xl">{totals['1.60'].length.toFixed(1)}m</div>
                  <div className="text-sm text-amber-200">{totals['1.60'].boxes} cajas</div>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-amber-700 text-white p-6">
                  <div className="text-xs text-amber-200 mb-1">BOBINA 1.30m</div>
                  <div className="font-display text-4xl">{totals['1.30'].length.toFixed(1)}m</div>
                  <div className="text-sm text-amber-200">{totals['1.30'].boxes} cajas</div>
                </div>
              </div>
              
              {/* Detalle por caja */}
              {optimization.map((opts, idx) => {
                if (opts.length === 0) return null
                const best = opts[0]
                const box = BOX_TYPES.find(b => b.id === best.boxId)!
                const item = production[idx]
                
                return (
                  <div key={best.boxId} className="bg-white/80 border-2 border-amber-700/30">
                    <div className="p-4 border-b border-amber-700/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <h3 className="font-display text-xl text-amber-900">
                            {box.name}
                          </h3>
                          <span className="text-sm text-amber-600">
                            {item.quantity} unidades
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {best.wastePercent < 10 ? (
                            <span className="bg-green-100 text-green-700 px-3 py-1 text-sm flex items-center gap-1">
                              <Check className="w-4 h-4" />
                              Óptimo
                            </span>
                          ) : best.wastePercent < 20 ? (
                            <span className="bg-amber-100 text-amber-700 px-3 py-1 text-sm">
                              Aceptable
                            </span>
                          ) : (
                            <span className="bg-red-100 text-red-700 px-3 py-1 text-sm flex items-center gap-1">
                              <AlertTriangle className="w-4 h-4" />
                              Alto desperdicio
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 grid md:grid-cols-2 gap-6">
                      {/* Mejor opción */}
                      <div>
                        <div className="text-xs font-semibold text-green-700 mb-2">
                          ✓ MEJOR OPCIÓN: {BOBINAS[best.bobina].name}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-xs text-amber-600">Cajas por fila</div>
                            <div className="font-bold text-lg">{best.boxesPerRow}</div>
                          </div>
                          <div>
                            <div className="text-xs text-amber-600">Filas necesarias</div>
                            <div className="font-bold text-lg">{best.totalRows}</div>
                          </div>
                          <div>
                            <div className="text-xs text-amber-600">Metros lineales</div>
                            <div className="font-bold text-lg">{best.totalLengthM.toFixed(2)}m</div>
                          </div>
                          <div>
                            <div className="text-xs text-amber-600">Desperdicio</div>
                            <div className={`font-bold text-lg ${best.wastePercent < 10 ? 'text-green-600' : 'text-amber-600'}`}>
                              {best.wastePercent.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Visual */}
                      <BobinaVisual result={best} box={box} />
                    </div>
                    
                    {/* Alternativa */}
                    {opts.length > 1 && (
                      <div className="p-4 bg-gray-50 border-t border-amber-700/20">
                        <details className="cursor-pointer">
                          <summary className="text-xs text-amber-700 font-semibold">
                            Ver alternativa ({BOBINAS[opts[1].bobina].name})
                          </summary>
                          <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-xs text-amber-600">Cajas/fila</div>
                              <div className="font-bold">{opts[1].boxesPerRow}</div>
                            </div>
                            <div>
                              <div className="text-xs text-amber-600">Filas</div>
                              <div className="font-bold">{opts[1].totalRows}</div>
                            </div>
                            <div>
                              <div className="text-xs text-amber-600">Metros</div>
                              <div className="font-bold">{opts[1].totalLengthM.toFixed(2)}m</div>
                            </div>
                            <div>
                              <div className="text-xs text-amber-600">Desperdicio</div>
                              <div className="font-bold text-amber-600">{opts[1].wastePercent.toFixed(1)}%</div>
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                )
              })}
              
              {/* Plan de producción */}
              <div className="bg-amber-900 text-amber-100 p-6">
                <h3 className="font-display text-xl tracking-wider mb-4">
                  PLAN DE PRODUCCIÓN OPTIMIZADO
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs text-amber-300 mb-2">RESUMEN DE MATERIALES</div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-amber-700">
                          <th className="text-left py-2">Bobina</th>
                          <th className="text-right py-2">Metros</th>
                          <th className="text-right py-2">Cajas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {totals['1.60'].length > 0 && (
                          <tr className="border-b border-amber-800">
                            <td className="py-2">1.60m (1520mm útil)</td>
                            <td className="text-right font-bold">{totals['1.60'].length.toFixed(1)}m</td>
                            <td className="text-right">{totals['1.60'].boxes}</td>
                          </tr>
                        )}
                        {totals['1.30'].length > 0 && (
                          <tr className="border-b border-amber-800">
                            <td className="py-2">1.30m (1230mm útil)</td>
                            <td className="text-right font-bold">{totals['1.30'].length.toFixed(1)}m</td>
                            <td className="text-right">{totals['1.30'].boxes}</td>
                          </tr>
                        )}
                        <tr className="font-bold">
                          <td className="py-2">TOTAL</td>
                          <td className="text-right">
                            {(totals['1.60'].length + totals['1.30'].length).toFixed(1)}m
                          </td>
                          <td className="text-right">
                            {totals['1.60'].boxes + totals['1.30'].boxes}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  <div>
                    <div className="text-xs text-amber-300 mb-2">SECUENCIA DE CORTE</div>
                    <div className="space-y-2">
                      {bestOptions.map((opt, idx) => {
                        if (!opt) return null
                        const box = BOX_TYPES.find(b => b.id === opt.boxId)!
                        return (
                          <div key={opt.boxId} className="flex items-center gap-3 text-sm">
                            <span className="w-6 h-6 bg-amber-700 flex items-center justify-center text-xs font-bold">
                              {idx + 1}
                            </span>
                            <span className="flex-1">{box.name}</span>
                            <span className="text-amber-300">
                              {opt.totalBoxes} uds → {BOBINAS[opt.bobina].name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
      
      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-amber-700/20 text-center text-xs text-amber-600">
        Sistema de Gestión de Producción de Cajas • Bobinas 1.60m y 1.30m • Refilado 2cm/lado
      </footer>
    </div>
  )
}
