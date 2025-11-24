'use client'

import { useState, useMemo, useCallback } from 'react'
import { Package, Scissors, Calculator, BarChart3, Box, Layers, AlertTriangle, Check, Combine, Zap } from 'lucide-react'

// Tipos de datos
interface BoxType {
  id: string
  name: string
  l: number
  w: number
  h: number
  unfoldedW: number // largo de la plancha (dirección de la bobina)
  unfoldedH: number // alto de la plancha (ancho de la bobina)
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

// Combinación de cajas en una plancha
interface CombinedCut {
  bobina: '1.60' | '1.30'
  bobinaUsable: number
  slots: {
    boxId: string
    boxName: string
    unfoldedH: number
    unfoldedW: number
    count: number
  }[]
  cutLengths: number[]
  totalWidthUsed: number
  wasteWidth: number
  wastePercent: number
  rows: number
  lengthM: number
}

// Datos de las cajas con medidas calculadas
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

const BOBINAS = {
  '1.60': { width: 1600, usable: 1520, name: 'Bobina 1.60m' },
  '1.30': { width: 1300, usable: 1230, name: 'Bobina 1.30m' },
}

const COLORS = [
  '#d4a574', '#8b6914', '#cd853f', '#daa520', '#a0522d',
  '#bc8f8f', '#d2691e', '#b8860b', '#c49a6c', '#f4a460'
]

// Componente para visualizar caja desplegada
function BoxUnfoldedVisual({ box, scale = 0.15, color }: { box: BoxType; scale?: number; color?: string }) {
  const w = box.unfoldedW * scale
  const h = box.unfoldedH * scale
  const panelL = box.l * 10 * scale
  const panelW = box.w * 10 * scale
  const panelH = box.h * 10 * scale
  const solapaV = (box.w / 2) * 10 * scale
  
  return (
    <svg width={w + 10} height={h + 10} className="drop-shadow-md">
      <defs>
        <pattern id={`cardboard-${box.id}-${color || 'default'}`} patternUnits="userSpaceOnUse" width="4" height="4">
          <rect width="4" height="4" fill={color || "#d4a574"}/>
          <circle cx="1" cy="1" r="0.5" fill="#c49a6c" opacity="0.5"/>
          <circle cx="3" cy="3" r="0.3" fill="#b8860b" opacity="0.3"/>
        </pattern>
      </defs>
      <rect x="5" y="5" width={w} height={h} fill={`url(#cardboard-${box.id}-${color || 'default'})`} stroke="#8b6914" strokeWidth="2" rx="2"/>
      <line x1="5" y1={5 + solapaV} x2={5 + w} y2={5 + solapaV} className="fold-line" />
      <line x1="5" y1={5 + solapaV + panelH} x2={5 + w} y2={5 + solapaV + panelH} className="fold-line" />
      <line x1={5 + panelL} y1="5" x2={5 + panelL} y2={5 + h} className="fold-line" />
      <line x1={5 + panelL + panelW} y1="5" x2={5 + panelL + panelW} y2={5 + h} className="fold-line" />
      <line x1={5 + panelL * 2 + panelW} y1="5" x2={5 + panelL * 2 + panelW} y2={5 + h} className="fold-line" />
      <line x1={5 + panelL * 2 + panelW * 2} y1="5" x2={5 + panelL * 2 + panelW * 2} y2={5 + h} className="fold-line" />
      <text x={w/2 + 5} y={h + 8} fontSize="8" fill="#5e4830" textAnchor="middle" fontWeight="600">
        {box.unfoldedW}mm
      </text>
    </svg>
  )
}

// Componente para visualizar combinación en la bobina
function CombinedCutVisual({ cut }: { cut: CombinedCut }) {
  const bobina = BOBINAS[cut.bobina]
  const scale = 0.06
  const bobinaH = bobina.usable * scale
  const maxCutLength = Math.max(...cut.cutLengths)
  const rowW = maxCutLength * scale
  
  let currentY = 10 + (20 * scale)
  
  return (
    <div className="bg-gray-50 p-3 rounded border border-amber-200">
      <div className="text-xs font-semibold mb-2 text-amber-900">
        Vista de corte - {bobina.name}
      </div>
      <div className="flex gap-4 items-start">
        <svg width={rowW + 70} height={bobinaH + 35}>
          <rect x="50" y="10" width={rowW} height={bobinaH} fill="#f5f0e8" stroke="#8b6914" strokeWidth="1"/>
          <rect x="50" y="10" width={rowW} height={20 * scale} fill="#e74c3c" opacity="0.2"/>
          
          {cut.slots.map((slot, idx) => {
            const boxH = slot.unfoldedH * scale
            const boxW = slot.unfoldedW * scale
            const y = currentY
            const elements = []
            
            for (let i = 0; i < slot.count; i++) {
              elements.push(
                <g key={`${idx}-${i}`}>
                  <rect 
                    x="50" 
                    y={y + (i * boxH)} 
                    width={boxW} 
                    height={boxH - 1} 
                    fill={COLORS[idx % COLORS.length]}
                    stroke="#5e4830"
                    strokeWidth="0.5"
                  />
                  <text 
                    x={50 + boxW / 2} 
                    y={y + (i * boxH) + boxH / 2 + 2} 
                    fontSize="6" 
                    fill="#2d2a26" 
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {slot.boxName}
                  </text>
                </g>
              )
            }
            currentY += boxH * slot.count
            return elements
          })}
          
          {cut.wasteWidth > 0 && (
            <rect 
              x="50" 
              y={10 + (20 * scale) + (cut.totalWidthUsed * scale)} 
              width={rowW} 
              height={cut.wasteWidth * scale} 
              fill="#e74c3c" 
              opacity="0.25"
            />
          )}
          
          <text x="45" y={bobinaH / 2 + 10} fontSize="7" fill="#5e4830" textAnchor="end" fontWeight="600">
            {bobina.usable}mm
          </text>
          
          {cut.cutLengths.length > 1 && cut.cutLengths[0] !== cut.cutLengths[1] && (
            <line 
              x1={50 + Math.min(...cut.cutLengths) * scale} 
              y1="10" 
              x2={50 + Math.min(...cut.cutLengths) * scale} 
              y2={bobinaH + 10} 
              stroke="#c0392b" 
              strokeWidth="1.5" 
              strokeDasharray="3 2"
            />
          )}
          
          <text x={50 + rowW / 2} y={bobinaH + 25} fontSize="7" fill="#5e4830" textAnchor="middle">
            {cut.cutLengths.length > 1 && cut.cutLengths[0] !== cut.cutLengths[1] 
              ? `Cortes: ${cut.cutLengths.join(' y ')}mm` 
              : `Largo: ${maxCutLength}mm`}
          </text>
        </svg>
        
        <div className="text-xs space-y-1 min-w-[120px]">
          {cut.slots.map((slot, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
              <span className="font-medium">{slot.count}×</span>
              <span>{slot.boxName}</span>
            </div>
          ))}
          <div className="pt-1 border-t border-gray-200 mt-1">
            <div className={`font-semibold ${cut.wastePercent < 10 ? 'text-green-600' : cut.wastePercent < 20 ? 'text-amber-600' : 'text-red-600'}`}>
              {cut.wastePercent.toFixed(1)}% desp.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Algoritmo de optimización combinada
function findBestCombinations(
  production: ProductionItem[],
  bobinaKey: '1.60' | '1.30'
): CombinedCut[] {
  const bobina = BOBINAS[bobinaKey]
  const results: CombinedCut[] = []
  
  const pending = new Map<string, number>()
  production.forEach(p => pending.set(p.boxId, p.quantity))
  
  const getBoxesWithPending = () => {
    return BOX_TYPES.filter(b => (pending.get(b.id) || 0) > 0)
  }
  
  function generateCombinations(
    boxes: BoxType[], 
    maxWidth: number,
    pendingMap: Map<string, number>
  ): { box: BoxType; count: number }[][] {
    const results: { box: BoxType; count: number }[][] = []
    const sorted = [...boxes].sort((a, b) => b.unfoldedH - a.unfoldedH)
    
    function backtrack(
      index: number,
      current: { box: BoxType; count: number }[],
      usedWidth: number
    ) {
      if (usedWidth <= maxWidth && current.length > 0) {
        results.push([...current])
      }
      if (index >= sorted.length || usedWidth >= maxWidth) return
      
      for (let i = index; i < sorted.length; i++) {
        const box = sorted[i]
        const available = pendingMap.get(box.id) || 0
        if (available === 0) continue
        
        const maxCount = Math.min(
          Math.floor((maxWidth - usedWidth) / box.unfoldedH),
          available
        )
        
        for (let count = maxCount; count >= 1; count--) {
          current.push({ box, count })
          backtrack(i + 1, current, usedWidth + box.unfoldedH * count)
          current.pop()
        }
      }
    }
    
    backtrack(0, [], 0)
    return results
  }
  
  const findBestFit = (boxes: BoxType[]): CombinedCut | null => {
    if (boxes.length === 0) return null
    
    let bestCombination: CombinedCut | null = null
    let bestScore = -Infinity
    
    const byLength = new Map<number, BoxType[]>()
    boxes.forEach(b => {
      const group = byLength.get(b.unfoldedW) || []
      group.push(b)
      byLength.set(b.unfoldedW, group)
    })
    
    const lengths = Array.from(byLength.keys()).sort((a, b) => a - b)
    
    for (let i = 0; i < lengths.length; i++) {
      for (let j = i; j < Math.min(lengths.length, i + 2); j++) {
        const selectedLengths = i === j ? [lengths[i]] : [lengths[i], lengths[j]]
        const availableBoxes = selectedLengths.flatMap(l => byLength.get(l) || [])
        
        const combinations = generateCombinations(availableBoxes, bobina.usable, pending)
        
        for (const combo of combinations) {
          const uniqueLengths = Array.from(new Set(combo.map(c => c.box.unfoldedW)))
          if (uniqueLengths.length > 2) continue
          
          const totalWidth = combo.reduce((sum, c) => sum + c.box.unfoldedH * c.count, 0)
          const waste = bobina.usable - totalWidth
          const wastePercent = (waste / bobina.usable) * 100
          
          if (waste < 0) continue
          
          let minRows = Infinity
          for (const c of combo) {
            const available = pending.get(c.box.id) || 0
            const rowsNeeded = Math.ceil(available / c.count)
            minRows = Math.min(minRows, rowsNeeded)
          }
          
          if (minRows <= 0 || minRows === Infinity) continue
          
          const totalBoxes = combo.reduce((sum, c) => sum + c.count * minRows, 0)
          const score = (100 - wastePercent) * totalBoxes
          
          if (score > bestScore) {
            bestScore = score
            const cutLengths = Array.from(new Set(combo.map(c => c.box.unfoldedW))).sort((a, b) => b - a)
            
            bestCombination = {
              bobina: bobinaKey,
              bobinaUsable: bobina.usable,
              slots: combo.map(c => ({
                boxId: c.box.id,
                boxName: c.box.name,
                unfoldedH: c.box.unfoldedH,
                unfoldedW: c.box.unfoldedW,
                count: c.count
              })),
              cutLengths,
              totalWidthUsed: totalWidth,
              wasteWidth: waste,
              wastePercent,
              rows: minRows,
              lengthM: (minRows * Math.max(...cutLengths)) / 1000
            }
          }
        }
      }
    }
    
    return bestCombination
  }
  
  let iterations = 0
  const maxIterations = 50
  
  while (iterations < maxIterations) {
    const boxes = getBoxesWithPending()
    if (boxes.length === 0) break
    
    const best = findBestFit(boxes)
    if (!best) break
    
    for (const slot of best.slots) {
      const current = pending.get(slot.boxId) || 0
      const produced = slot.count * best.rows
      pending.set(slot.boxId, Math.max(0, current - produced))
    }
    
    results.push(best)
    iterations++
  }
  
  return results
}

// Componente principal
export default function CajasProduccion() {
  const [production, setProduction] = useState<ProductionItem[]>([])
  const [viewMode, setViewMode] = useState<'catalog' | 'production' | 'optimization' | 'combined'>('catalog')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [selectedBobina, setSelectedBobina] = useState<'1.60' | '1.30' | 'auto'>('auto')

  const setCatalogQty = useCallback((boxId: string, qty: number) => {
    setQuantities(prev => ({ ...prev, [boxId]: qty }))
  }, [])

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

  const updateQuantity = (boxId: string, qty: number) => {
    if (qty <= 0) {
      setProduction(prev => prev.filter(p => p.boxId !== boxId))
    } else {
      setProduction(prev => prev.map(p => p.boxId === boxId ? { ...p, quantity: qty } : p))
    }
  }

  // Optimización simple
  const simpleOptimization = useMemo(() => {
    return production.map(item => {
      const box = BOX_TYPES.find(b => b.id === item.boxId)!
      const results: OptimizationResult[] = []
      
      for (const [key, bobina] of Object.entries(BOBINAS)) {
        const bobinaKey = key as '1.60' | '1.30'
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
      return results.sort((a, b) => a.wastePercent - b.wastePercent)
    })
  }, [production])

  // Optimización combinada
  const combinedOptimization = useMemo(() => {
    if (production.length === 0) return { '1.60': [], '1.30': [], best: [] }
    
    const result160 = findBestCombinations(production, '1.60')
    const result130 = findBestCombinations(production, '1.30')
    
    const totalWaste160 = result160.reduce((sum, c) => sum + c.wastePercent * c.rows, 0)
    const totalWaste130 = result130.reduce((sum, c) => sum + c.wastePercent * c.rows, 0)
    
    const best = selectedBobina === 'auto' 
      ? (totalWaste160 <= totalWaste130 ? result160 : result130)
      : selectedBobina === '1.60' ? result160 : result130
    
    return { '1.60': result160, '1.30': result130, best }
  }, [production, selectedBobina])

  // Totales simple
  const simpleTotals = useMemo(() => {
    const bestOptions = simpleOptimization.map(opts => opts[0]).filter(Boolean)
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
  }, [simpleOptimization])

  // Totales combinado
  const combinedTotals = useMemo(() => {
    const cuts = combinedOptimization.best
    let totalLength = 0
    let totalBoxes = 0
    let totalWasteWeighted = 0
    let totalRows = 0
    
    cuts.forEach(cut => {
      totalLength += cut.lengthM
      totalRows += cut.rows
      totalWasteWeighted += cut.wastePercent * cut.rows
      cut.slots.forEach(s => {
        totalBoxes += s.count * cut.rows
      })
    })
    
    return {
      length: totalLength,
      boxes: totalBoxes,
      avgWaste: totalRows > 0 ? totalWasteWeighted / totalRows : 0,
      cuts: cuts.length
    }
  }, [combinedOptimization])

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-900 flex items-center justify-center">
            <Package className="w-6 h-6 md:w-8 md:h-8 text-amber-100" />
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-4xl tracking-wider text-amber-900">
              GESTIÓN DE PRODUCCIÓN
            </h1>
            <p className="text-xs md:text-sm text-amber-700">Optimización de corte de cajas de cartón</p>
          </div>
        </div>
        
        <nav className="flex gap-1 md:gap-2 mt-4 flex-wrap">
          {[
            { id: 'catalog', label: 'CATÁLOGO', icon: Box },
            { id: 'production', label: 'PRODUCCIÓN', icon: Layers },
            { id: 'optimization', label: 'SIMPLE', icon: BarChart3 },
            { id: 'combined', label: 'COMBINADO', icon: Combine },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id as typeof viewMode)}
              className={`btn-industrial px-3 md:px-6 py-2 md:py-3 flex items-center gap-1 md:gap-2 text-xs md:text-base ${
                viewMode === tab.id ? 'bg-amber-700' : ''
              }`}
            >
              <tab.icon className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.slice(0, 4)}</span>
              {tab.id === 'combined' && (
                <span className="bg-green-500 text-white text-[10px] px-1 py-0.5 rounded hidden md:inline">2 cortes</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Info de bobinas */}
      <div className="bg-white/60 border-2 border-amber-700/30 p-3 md:p-4 mb-4 md:mb-6 flex gap-4 md:gap-8 flex-wrap">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-amber-700" />
          <div>
            <div className="text-xs text-amber-600">BOBINA 1.60m</div>
            <div className="font-semibold text-sm">1520mm útiles</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-amber-700" />
          <div>
            <div className="text-xs text-amber-600">BOBINA 1.30m</div>
            <div className="font-semibold text-sm">1230mm útiles</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto bg-amber-100 px-3 py-1 rounded">
          <Zap className="w-4 h-4 text-amber-700" />
          <div className="text-xs">
            <span className="font-semibold">2 cortes de largo</span> por plancha
          </div>
        </div>
      </div>

      {/* Vista: Catálogo */}
      {viewMode === 'catalog' && (
        <section>
          <h2 className="font-display text-xl md:text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <Box className="w-5 h-5" />
            CATÁLOGO DE CAJAS
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {BOX_TYPES.map(box => {
              const qty = quantities[box.id] || 0
              const inProduction = production.find(p => p.boxId === box.id)
              const fit160 = Math.floor(BOBINAS['1.60'].usable / box.unfoldedH)
              const fit130 = Math.floor(BOBINAS['1.30'].usable / box.unfoldedH)
              const waste160 = ((BOBINAS['1.60'].usable - (fit160 * box.unfoldedH)) / BOBINAS['1.60'].usable * 100).toFixed(1)
              const waste130 = ((BOBINAS['1.30'].usable - (fit130 * box.unfoldedH)) / BOBINAS['1.30'].usable * 100).toFixed(1)
              
              return (
                <div 
                  key={box.id}
                  className={`bg-white/80 border-2 p-3 transition-all border-amber-700/20 ${inProduction ? 'ring-2 ring-green-500/50' : ''}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-display text-lg text-amber-900">{box.name}</h3>
                      <p className="text-xs text-amber-600">
                        {box.unfoldedW} × {box.unfoldedH} mm
                      </p>
                    </div>
                    {inProduction && (
                      <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded">
                        {inProduction.quantity}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex justify-center mb-2">
                    <BoxUnfoldedVisual box={box} scale={0.1} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1 text-xs mb-2">
                    <div className={`p-1.5 rounded ${parseFloat(waste160) < parseFloat(waste130) ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <div className="font-semibold">1.60m</div>
                      <div>{fit160}/fila • {waste160}%</div>
                    </div>
                    <div className={`p-1.5 rounded ${parseFloat(waste130) < parseFloat(waste160) ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <div className="font-semibold">1.30m</div>
                      <div>{fit130}/fila • {waste130}%</div>
                    </div>
                  </div>
                  
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min="0"
                      value={qty || ''}
                      onChange={(e) => setCatalogQty(box.id, parseInt(e.target.value) || 0)}
                      placeholder="Cant."
                      className="input-industrial flex-1 px-2 py-1.5 text-sm w-20"
                    />
                    <button
                      onClick={() => {
                        addToProduction(box.id, qty)
                        setCatalogQty(box.id, 0)
                      }}
                      className="btn-industrial px-3 py-1.5 text-xs"
                      disabled={qty <= 0}
                    >
                      +
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
          <h2 className="font-display text-xl md:text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5" />
            ORDEN DE PRODUCCIÓN
          </h2>
          
          {production.length === 0 ? (
            <div className="bg-white/60 border-2 border-dashed border-amber-700/30 p-8 md:p-12 text-center">
              <Package className="w-12 h-12 md:w-16 md:h-16 mx-auto text-amber-300 mb-4" />
              <p className="text-amber-700">No hay cajas en la orden</p>
              <p className="text-sm text-amber-500">Agregá desde el catálogo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {production.map(item => {
                const box = BOX_TYPES.find(b => b.id === item.boxId)!
                return (
                  <div key={item.boxId} className="bg-white/80 border-2 border-amber-700/30 p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="hidden sm:block">
                        <BoxUnfoldedVisual box={box} scale={0.08} />
                      </div>
                      <div className="flex-1 min-w-[100px]">
                        <h3 className="font-display text-lg text-amber-900">{box.name}</h3>
                        <p className="text-xs text-amber-600">{box.unfoldedW}×{box.unfoldedH}mm</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQuantity(item.boxId, item.quantity - 10)} className="w-7 h-7 bg-amber-100 hover:bg-amber-200 flex items-center justify-center font-bold text-xs rounded">-10</button>
                        <button onClick={() => updateQuantity(item.boxId, item.quantity - 1)} className="w-7 h-7 bg-amber-100 hover:bg-amber-200 flex items-center justify-center font-bold rounded">-</button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.boxId, parseInt(e.target.value) || 0)}
                          className="input-industrial w-16 md:w-20 px-2 py-1 text-center font-bold"
                        />
                        <button onClick={() => updateQuantity(item.boxId, item.quantity + 1)} className="w-7 h-7 bg-amber-100 hover:bg-amber-200 flex items-center justify-center font-bold rounded">+</button>
                        <button onClick={() => updateQuantity(item.boxId, item.quantity + 10)} className="w-7 h-7 bg-amber-100 hover:bg-amber-200 flex items-center justify-center font-bold text-xs rounded">+10</button>
                      </div>
                      <button onClick={() => updateQuantity(item.boxId, 0)} className="text-red-600 hover:text-red-800 p-1 font-bold">✕</button>
                    </div>
                  </div>
                )
              })}
              
              <div className="bg-amber-900 text-amber-100 p-4 mt-4">
                <div className="font-display text-lg tracking-wider mb-2">RESUMEN</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="text-2xl font-bold">{production.length}</div>
                    <div className="text-xs text-amber-300">Tipos</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{production.reduce((sum, p) => sum + p.quantity, 0)}</div>
                    <div className="text-xs text-amber-300">Cajas</div>
                  </div>
                  <div>
                    <button onClick={() => setViewMode('optimization')} className="bg-amber-100 text-amber-900 px-3 py-1.5 font-display tracking-wider hover:bg-white text-sm w-full">
                      SIMPLE →
                    </button>
                  </div>
                  <div>
                    <button onClick={() => setViewMode('combined')} className="bg-green-500 text-white px-3 py-1.5 font-display tracking-wider hover:bg-green-400 text-sm flex items-center gap-1 justify-center w-full">
                      <Combine className="w-4 h-4" />
                      COMBINADO →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Vista: Optimización Simple */}
      {viewMode === 'optimization' && (
        <section>
          <h2 className="font-display text-xl md:text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            OPTIMIZACIÓN SIMPLE
          </h2>
          
          {production.length === 0 ? (
            <div className="bg-white/60 border-2 border-dashed border-amber-700/30 p-8 text-center">
              <Calculator className="w-12 h-12 mx-auto text-amber-300 mb-4" />
              <p className="text-amber-700">No hay producción</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-amber-600 to-amber-800 text-white p-4">
                  <div className="text-xs text-amber-200">BOBINA 1.60m</div>
                  <div className="font-display text-2xl md:text-3xl">{simpleTotals['1.60'].length.toFixed(1)}m</div>
                  <div className="text-sm text-amber-200">{simpleTotals['1.60'].boxes} cajas</div>
                </div>
                <div className="bg-gradient-to-br from-amber-500 to-amber-700 text-white p-4">
                  <div className="text-xs text-amber-200">BOBINA 1.30m</div>
                  <div className="font-display text-2xl md:text-3xl">{simpleTotals['1.30'].length.toFixed(1)}m</div>
                  <div className="text-sm text-amber-200">{simpleTotals['1.30'].boxes} cajas</div>
                </div>
              </div>
              
              {simpleOptimization.map((opts, idx) => {
                if (opts.length === 0) return null
                const best = opts[0]
                const box = BOX_TYPES.find(b => b.id === best.boxId)!
                const item = production[idx]
                
                return (
                  <div key={best.boxId} className="bg-white/80 border-2 border-amber-700/30 p-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg text-amber-900">{box.name}</h3>
                        <span className="text-sm text-amber-600">{item.quantity} uds</span>
                      </div>
                      <span className={`px-2 py-0.5 text-xs ${best.wastePercent < 10 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {best.wastePercent.toFixed(1)}% desp.
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                      <div><span className="text-xs text-amber-600">Bobina</span><div className="font-bold">{best.bobina}m</div></div>
                      <div><span className="text-xs text-amber-600">Cajas/fila</span><div className="font-bold">{best.boxesPerRow}</div></div>
                      <div><span className="text-xs text-amber-600">Filas</span><div className="font-bold">{best.totalRows}</div></div>
                      <div><span className="text-xs text-amber-600">Metros</span><div className="font-bold">{best.totalLengthM.toFixed(2)}m</div></div>
                      <div><span className="text-xs text-amber-600">Largo</span><div className="font-bold">{box.unfoldedW}mm</div></div>
                    </div>
                  </div>
                )
              })}
              
              <div className="text-center">
                <button onClick={() => setViewMode('combined')} className="btn-industrial bg-green-600 px-6 py-2 flex items-center gap-2 mx-auto">
                  <Combine className="w-4 h-4" />
                  VER COMBINADO
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Vista: Optimización Combinada */}
      {viewMode === 'combined' && (
        <section>
          <h2 className="font-display text-xl md:text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <Combine className="w-5 h-5" />
            OPTIMIZACIÓN COMBINADA
            <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded">2 cortes</span>
          </h2>
          
          {production.length === 0 ? (
            <div className="bg-white/60 border-2 border-dashed border-amber-700/30 p-8 text-center">
              <Combine className="w-12 h-12 mx-auto text-amber-300 mb-4" />
              <p className="text-amber-700">No hay producción</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selector de bobina */}
              <div className="bg-white/60 border-2 border-amber-700/30 p-3 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-amber-900 text-sm">Bobina:</span>
                {(['auto', '1.60', '1.30'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setSelectedBobina(opt)}
                    className={`px-3 py-1 border-2 text-sm transition-all ${
                      selectedBobina === opt 
                        ? 'border-amber-600 bg-amber-100' 
                        : 'border-amber-300 hover:border-amber-500'
                    }`}
                  >
                    {opt === 'auto' ? 'Auto' : `${opt}m`}
                  </button>
                ))}
              </div>

              {/* Resumen */}
              <div className="bg-gradient-to-br from-green-600 to-green-800 text-white p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-green-200">PLANCHAS</div>
                    <div className="font-display text-2xl md:text-3xl">{combinedTotals.cuts}</div>
                  </div>
                  <div>
                    <div className="text-xs text-green-200">METROS</div>
                    <div className="font-display text-2xl md:text-3xl">{combinedTotals.length.toFixed(1)}m</div>
                  </div>
                  <div>
                    <div className="text-xs text-green-200">CAJAS</div>
                    <div className="font-display text-2xl md:text-3xl">{combinedTotals.boxes}</div>
                  </div>
                  <div>
                    <div className="text-xs text-green-200">DESP. PROM.</div>
                    <div className="font-display text-2xl md:text-3xl">{combinedTotals.avgWaste.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
              
              {/* Detalle de cada combinación */}
              <div className="space-y-3">
                <h3 className="font-display text-lg text-amber-900">PLAN DE CORTES</h3>
                
                {combinedOptimization.best.map((cut, idx) => (
                  <div key={idx} className="bg-white/80 border-2 border-amber-700/30 p-3">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 bg-amber-900 text-amber-100 flex items-center justify-center font-display">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-amber-900 text-sm">
                            Plancha #{idx + 1} • {cut.bobina}m
                          </div>
                          <div className="text-xs text-amber-600">
                            {cut.slots.length} tipo{cut.slots.length > 1 ? 's' : ''} • 
                            {cut.cutLengths.length > 1 && cut.cutLengths[0] !== cut.cutLengths[1] ? ' 2 largos' : ' 1 largo'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{cut.rows} filas</div>
                        <div className="text-xs text-amber-600">{cut.lengthM.toFixed(2)}m</div>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-3">
                      <CombinedCutVisual cut={cut} />
                      
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-amber-900">Producción:</div>
                        {cut.slots.map((slot, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-2 bg-gray-50 p-2 rounded text-sm">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[sIdx % COLORS.length] }}></div>
                            <div className="flex-1">
                              <span className="font-semibold">{slot.boxName}</span>
                              <span className="text-gray-500 text-xs ml-1">({slot.unfoldedW}×{slot.unfoldedH})</span>
                            </div>
                            <div className="font-bold">
                              {slot.count} × {cut.rows} = {slot.count * cut.rows}
                            </div>
                          </div>
                        ))}
                        
                        <div className="border-t pt-2 mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-amber-600">Corte{cut.cutLengths.length > 1 ? 's' : ''}:</span>
                            <div className="font-bold">{Array.from(new Set(cut.cutLengths)).join(' / ')}mm</div>
                          </div>
                          <div>
                            <span className="text-amber-600">Uso ancho:</span>
                            <div className="font-bold">{cut.totalWidthUsed} / {cut.bobinaUsable}mm</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Comparación */}
              <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded">
                <div className="font-display text-lg text-amber-900 mb-2">VS MÉTODO SIMPLE</div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div></div>
                  <div className="text-center font-semibold">Simple</div>
                  <div className="text-center font-semibold text-green-700">Combinado</div>
                  
                  <div className="text-amber-700">Metros</div>
                  <div className="text-center">{(simpleTotals['1.60'].length + simpleTotals['1.30'].length).toFixed(1)}m</div>
                  <div className="text-center font-bold text-green-700">{combinedTotals.length.toFixed(1)}m</div>
                  
                  <div className="text-amber-700">Cambios</div>
                  <div className="text-center">{production.length}</div>
                  <div className="text-center font-bold text-green-700">{combinedTotals.cuts}</div>
                </div>
                
                {combinedTotals.length < (simpleTotals['1.60'].length + simpleTotals['1.30'].length) && (
                  <div className="mt-2 text-center text-green-700 font-semibold">
                    ¡Ahorrás {((simpleTotals['1.60'].length + simpleTotals['1.30'].length) - combinedTotals.length).toFixed(1)}m de material!
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
      
      <footer className="mt-8 pt-4 border-t border-amber-700/20 text-center text-xs text-amber-600">
        Sistema de Producción de Cajas • 2 cortes de largo por plancha
      </footer>
    </div>
  )
}
