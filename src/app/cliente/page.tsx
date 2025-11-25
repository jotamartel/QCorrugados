'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Package, Scissors, Calculator, BarChart3, Box, Layers, AlertTriangle, Check, Combine, Zap, Lightbulb, TrendingUp, ArrowRight, Plus, Trash2, Sparkles, Bot, Settings, X, Loader2, ShoppingCart, ChevronRight, Send, MessageCircle, FileText, Clock, Ruler } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

// Tipos de datos
interface BoxType {
  id: string
  name: string
  l: number
  w: number
  h: number
  unfoldedW: number // largo de la plancha (dirección de la bobina)
  unfoldedH: number // alto de la plancha (ancho de la bobina)
  isCustom?: boolean
  isDobleChapeton?: boolean // true si requiere 2 planchas pegadas
  planchaW?: number // largo de cada plancha individual (para doble chapetón)
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

// Sugerencia de cantidad optimizada
interface QuantitySuggestion {
  boxId: string
  originalQty: number
  suggestedQty: number
  difference: number
  differencePercent: number
  reason: string
  bobina: '1.60' | '1.30'
  boxesPerRow: number
  rows: number
  wastePercent: number
  metersNeeded: number
  isMinimum: boolean // true si cumple el mínimo solicitado
}

// Respuesta de la IA - Hoja de producción
interface AIProductionPlan {
  pasada: number
  bobina: string
  largosCorte: number[]
  filas: {
    caja: string
    altoDesp: number
    largoDesp: number
    cantidad: number
    filasEnBobina: number
  }[]
  altosUsados: number
  sobrante: number
  desperdicio: string
  metrosLineales: number
  notas?: string
}

interface AIResponse {
  type?: string
  analysis: string
  productionPlan?: AIProductionPlan[]
  summary?: {
    totalPasadas: number
    totalMetros160: number
    totalMetros130: number
    desperdicioPromedio: string
    tiempoEstimado: string
  }
  suggestions?: {
    tipo?: string
    type?: string
    mensaje?: string
    message?: string
    impacto?: string
    impact?: string
  }[]
  wasteBoxes?: {
    name: string
    dimensions: string
    unfoldedH: number
    cantidad?: number
    reason: string
    possibleUses: string[]
  }[]
  // Campos legacy para compatibilidad
  bestCombinations?: {
    bobina: string
    boxes: { name: string; count: number }[]
    totalHeight: number
    wastePercent: number
    reason: string
  }[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// Respuesta de sugerencias de stock
interface StockBox {
  name: string
  dimensions: string
  unfoldedW: number
  unfoldedH: number
  areaM2PerBox: number
  quantity: number
  totalM2: number
  fitsInWaste: boolean
  sourceWaste: string
  reason: string
  priority: string
}

interface StockSuggestionsResponse {
  analysis: string
  totalWasteM2: number
  stockBoxes: StockBox[]
  summary: {
    totalStockBoxes: number
    totalStockM2: number
    wasteUtilization: string
    boxTypes: number
  }
  additionalNotes?: string
}

// Datos de las cajas con medidas calculadas
const DEFAULT_BOX_TYPES: BoxType[] = [
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
  // Doble chapetón: 2 planchas de 1250x1000mm c/u
  { id: '70x50x50', name: '70×50×50 (2P)', l: 70, w: 50, h: 50, unfoldedW: 1250, unfoldedH: 1000, isDobleChapeton: true, planchaW: 1250 },
]

const BOBINAS = {
  '1.60': { width: 1600, usable: 1520, name: 'Bobina 1.60m' },
  '1.30': { width: 1300, usable: 1230, name: 'Bobina 1.30m' },
}

const COLORS = [
  '#d4a574', '#8b6914', '#cd853f', '#daa520', '#a0522d',
  '#bc8f8f', '#d2691e', '#b8860b', '#c49a6c', '#f4a460'
]

// Límite máximo de largo de plancha
const MAX_PLANCHA_LENGTH = 2080
const CHAPETON_OVERLAP = 25 // mm de solapamiento para pegado en doble chapetón

// Función para calcular medidas desplegadas RSC (desde cm)
function calculateUnfolded(l: number, w: number, h: number): { unfoldedW: number; unfoldedH: number } {
  // Fórmula RSC (Regular Slotted Container):
  // Ancho desplegado = 2L + 2W + 50mm (solapa pegue)
  // Alto desplegado = H + W (solapas + cuerpo)
  const unfoldedW = (2 * l + 2 * w) * 10 + 50 // convertir cm a mm y agregar solapa
  const unfoldedH = (h + w) * 10 // convertir cm a mm
  return { unfoldedW, unfoldedH }
}

// Función para calcular medidas desplegadas RSC (desde mm)
function calculateUnfoldedFromMM(l: number, w: number, h: number): { unfoldedW: number; unfoldedH: number } {
  // Fórmula RSC (Regular Slotted Container):
  // Ancho desplegado = 2L + 2W + 50mm (solapa pegue)
  // Alto desplegado = H + W (solapas + cuerpo)
  const unfoldedW = 2 * l + 2 * w + 50 // ya en mm, agregar solapa
  const unfoldedH = h + w // ya en mm
  return { unfoldedW, unfoldedH }
}

// Función para calcular doble chapetón
function calculateDobleChapeton(unfoldedW: number, unfoldedH: number): {
  needsDobleChapeton: boolean
  planchaW: number
  planchaH: number
  planchasPerBox: number
} {
  if (unfoldedW <= MAX_PLANCHA_LENGTH) {
    return {
      needsDobleChapeton: false,
      planchaW: unfoldedW,
      planchaH: unfoldedH,
      planchasPerBox: 1
    }
  }
  
  // Doble chapetón: dividir en 2 planchas con solapamiento
  // Cada plancha = (largo_total / 2) + solapamiento
  const planchaW = Math.ceil(unfoldedW / 2) + CHAPETON_OVERLAP
  
  return {
    needsDobleChapeton: true,
    planchaW,
    planchaH: unfoldedH,
    planchasPerBox: 2
  }
}

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

// Función para calcular sugerencias de cantidades optimizadas
function calculateQuantitySuggestions(
  production: ProductionItem[],
  boxTypes: BoxType[]
): QuantitySuggestion[] {
  const suggestions: QuantitySuggestion[] = []
  
  for (const item of production) {
    const box = boxTypes.find(b => b.id === item.boxId)
    if (!box) continue
    
    const originalQty = item.quantity
    const minAcceptable = Math.ceil(originalQty * 0.95) // -5% máximo
    
    // Evaluar para cada bobina
    for (const [bobinaKey, bobina] of Object.entries(BOBINAS)) {
      const boxesPerRow = Math.floor(bobina.usable / box.unfoldedH)
      if (boxesPerRow === 0) continue
      
      const wastePercent = ((bobina.usable - (boxesPerRow * box.unfoldedH)) / bobina.usable) * 100
      
      // Calcular filas necesarias para el pedido original
      const rowsForOriginal = Math.ceil(originalQty / boxesPerRow)
      const qtyWithOriginalRows = rowsForOriginal * boxesPerRow
      
      // Generar sugerencias: fila actual, +1 fila, -1 fila (si cumple mínimo)
      const rowOptions = [
        rowsForOriginal - 1,
        rowsForOriginal,
        rowsForOriginal + 1,
      ].filter(r => r > 0)
      
      for (const rows of rowOptions) {
        const suggestedQty = rows * boxesPerRow
        const difference = suggestedQty - originalQty
        const differencePercent = (difference / originalQty) * 100
        
        // Solo incluir si cumple el mínimo solicitado O está dentro del -5%
        const isMinimum = suggestedQty >= originalQty
        const isWithinTolerance = suggestedQty >= minAcceptable
        
        if (!isWithinTolerance) continue
        
        // Determinar la razón de la sugerencia
        let reason = ''
        if (suggestedQty === qtyWithOriginalRows && difference === 0) {
          reason = 'Cantidad exacta óptima'
        } else if (suggestedQty > originalQty) {
          reason = `+${difference} para completar fila (0% desperdicio de material)`
        } else if (suggestedQty < originalQty) {
          reason = `${difference} menos para fila completa (ahorro de material)`
        } else {
          reason = 'Cantidad ajustada a filas completas'
        }
        
        suggestions.push({
          boxId: item.boxId,
          originalQty,
          suggestedQty,
          difference,
          differencePercent,
          reason,
          bobina: bobinaKey as '1.60' | '1.30',
          boxesPerRow,
          rows,
          wastePercent,
          metersNeeded: (rows * box.unfoldedW) / 1000,
          isMinimum
        })
      }
    }
  }
  
  // Ordenar: primero las que cumplen mínimo, luego por menor desperdicio
  return suggestions.sort((a, b) => {
    // Primero priorizar las que cumplen el mínimo
    if (a.isMinimum && !b.isMinimum) return -1
    if (!a.isMinimum && b.isMinimum) return 1
    // Luego por menor desperdicio
    if (a.wastePercent !== b.wastePercent) return a.wastePercent - b.wastePercent
    // Luego por menor diferencia con el original
    return Math.abs(a.differencePercent) - Math.abs(b.differencePercent)
  })
}

// Función para obtener la mejor sugerencia por caja
function getBestSuggestionPerBox(
  suggestions: QuantitySuggestion[]
): Map<string, QuantitySuggestion[]> {
  const byBox = new Map<string, QuantitySuggestion[]>()
  
  for (const sug of suggestions) {
    const existing = byBox.get(sug.boxId) || []
    // Evitar duplicados exactos
    const isDuplicate = existing.some(
      e => e.suggestedQty === sug.suggestedQty && e.bobina === sug.bobina
    )
    if (!isDuplicate) {
      existing.push(sug)
      byBox.set(sug.boxId, existing)
    }
  }
  
  // Limitar a las 4 mejores sugerencias por caja
  const boxIds = Array.from(byBox.keys())
  for (const boxId of boxIds) {
    const sugs = byBox.get(boxId) || []
    byBox.set(boxId, sugs.slice(0, 4))
  }
  
  return byBox
}

// Algoritmo de optimización combinada
function findBestCombinations(
  production: ProductionItem[],
  bobinaKey: '1.60' | '1.30',
  boxTypes: BoxType[]
): CombinedCut[] {
  const bobina = BOBINAS[bobinaKey]
  const results: CombinedCut[] = []
  
  const pending = new Map<string, number>()
  production.forEach(p => pending.set(p.boxId, p.quantity))
  
  const getBoxesWithPending = () => {
    return boxTypes.filter(b => (pending.get(b.id) || 0) > 0)
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
  const { user } = useAuth()
  const [production, setProduction] = useState<ProductionItem[]>([])
  const [viewMode, setViewMode] = useState<'catalog' | 'production' | 'optimization' | 'combined' | 'suggestions' | 'ai'>('catalog')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [selectedBobina, setSelectedBobina] = useState<'1.60' | '1.30' | 'auto'>('auto')
  
  // Cajas personalizadas
  const [customBoxes, setCustomBoxes] = useState<BoxType[]>([])
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customForm, setCustomForm] = useState({ l: '', w: '', h: '', quantity: '' })
  const [loadingCustomBoxes, setLoadingCustomBoxes] = useState(false)
  const [savingBox, setSavingBox] = useState(false)
  
  // IA
  const [apiKey, setApiKey] = useState('')
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  
  // Sugerencias de stock
  const [stockSuggestions, setStockSuggestions] = useState<StockSuggestionsResponse | null>(null)
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  
  // Combinar cajas default + custom
  const BOX_TYPES = useMemo(() => [...DEFAULT_BOX_TYPES, ...customBoxes], [customBoxes])

  // Cargar cajas personalizadas del usuario desde Supabase
  useEffect(() => {
    const loadCustomBoxes = async () => {
      if (!user) {
        setCustomBoxes([])
        return
      }
      
      setLoadingCustomBoxes(true)
      try {
        const { data, error } = await supabase
          .from('box_catalog')
          .select('*')
          .eq('created_by', user.id)
          .eq('is_standard', false)
          .eq('active', true)
        
        if (error) {
          console.error('Error loading custom boxes:', error)
          return
        }
        
        if (data) {
          const boxes: BoxType[] = data.map(box => ({
            id: box.id,
            name: box.name,
            l: box.l_mm,
            w: box.w_mm,
            h: box.h_mm,
            unfoldedW: box.unfolded_w,
            unfoldedH: box.unfolded_h,
            isCustom: true,
            isDobleChapeton: box.is_doble_chapeton,
            planchaW: box.plancha_w
          }))
          setCustomBoxes(boxes)
        }
      } catch (err) {
        console.error('Error loading custom boxes:', err)
      } finally {
        setLoadingCustomBoxes(false)
      }
    }
    
    loadCustomBoxes()
  }, [user])

  // Agregar caja personalizada
  const addCustomBox = async () => {
    const l = parseInt(customForm.l)
    const w = parseInt(customForm.w)
    const h = parseInt(customForm.h)
    const qty = parseInt(customForm.quantity) || 0
    
    if (l > 0 && w > 0 && h > 0) {
      const { unfoldedW, unfoldedH } = calculateUnfoldedFromMM(l, w, h)
      const chapeton = calculateDobleChapeton(unfoldedW, unfoldedH)
      
      const boxName = chapeton.needsDobleChapeton ? `${l}×${w}×${h}mm (2P)` : `${l}×${w}×${h}mm`
      
      // Si el usuario está logueado, guardar en Supabase
      if (user) {
        setSavingBox(true)
        try {
          const { data, error } = await supabase
            .from('box_catalog')
            .insert({
              name: boxName,
              l_mm: l,
              w_mm: w,
              h_mm: h,
              unfolded_w: chapeton.planchaW,
              unfolded_h: unfoldedH,
              is_doble_chapeton: chapeton.needsDobleChapeton,
              plancha_w: chapeton.needsDobleChapeton ? chapeton.planchaW : null,
              is_standard: false,
              created_by: user.id,
              active: true
            })
            .select()
            .single()
          
          if (error) {
            console.error('Error saving box:', error)
            alert('Error al guardar la caja. Intentá de nuevo.')
            return
          }
          
          if (data) {
            const newBox: BoxType = {
              id: data.id,
              name: boxName,
              l, w, h,
              unfoldedW: chapeton.planchaW,
              unfoldedH,
              isCustom: true,
              isDobleChapeton: chapeton.needsDobleChapeton,
              planchaW: chapeton.planchaW
            }
            setCustomBoxes(prev => [...prev, newBox])
            
            // Si hay cantidad, agregar a producción
            if (qty > 0) {
              setProduction(prev => [...prev, { boxId: data.id, quantity: qty }])
            }
          }
        } catch (err) {
          console.error('Error saving box:', err)
          alert('Error al guardar la caja.')
        } finally {
          setSavingBox(false)
        }
      } else {
        // Usuario no logueado: guardar solo en memoria local
        const id = `custom-${l}x${w}x${h}-${Date.now()}`
        const newBox: BoxType = {
          id,
          name: boxName,
          l, w, h,
          unfoldedW: chapeton.planchaW,
          unfoldedH,
          isCustom: true,
          isDobleChapeton: chapeton.needsDobleChapeton,
          planchaW: chapeton.planchaW
        }
        setCustomBoxes(prev => [...prev, newBox])
        
        if (qty > 0) {
          setProduction(prev => [...prev, { boxId: id, quantity: qty }])
        }
      }
      
      setCustomForm({ l: '', w: '', h: '', quantity: '' })
      setShowCustomForm(false)
    }
  }
  
  // Eliminar caja personalizada
  const removeCustomBox = async (boxId: string) => {
    // Si el usuario está logueado, eliminar de Supabase
    if (user) {
      try {
        const { error } = await supabase
          .from('box_catalog')
          .update({ active: false })
          .eq('id', boxId)
          .eq('created_by', user.id)
        
        if (error) {
          console.error('Error deleting box:', error)
          return
        }
      } catch (err) {
        console.error('Error deleting box:', err)
        return
      }
    }
    
    setCustomBoxes(prev => prev.filter(b => b.id !== boxId))
    setProduction(prev => prev.filter(p => p.boxId !== boxId))
  }
  
  // Consultar IA
  const consultAI = async () => {
    if (!apiKey) {
      setShowApiKeyModal(true)
      return
    }
    
    setAiLoading(true)
    setAiError(null)
    setAiResponse(null)
    setChatMessages([]) // Limpiar chat al nuevo análisis
    
    try {
      const boxesData = production.map(item => {
        const box = BOX_TYPES.find(b => b.id === item.boxId)!
        return {
          id: box.id,
          name: box.name,
          l: box.l,
          w: box.w,
          h: box.h,
          unfoldedW: box.unfoldedW,
          unfoldedH: box.unfoldedH,
          quantity: item.quantity,
          isDobleChapeton: box.isDobleChapeton
        }
      })
      
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxes: boxesData,
          bobinas: BOBINAS,
          apiKey,
          mode: 'analyze'
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al consultar IA')
      }
      
      const data = await response.json()
      setAiResponse(data)
      setViewMode('ai')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setAiLoading(false)
    }
  }
  
  // Enviar mensaje de chat
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !apiKey || chatLoading) return
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date()
    }
    
    setChatMessages(prev => [...prev, userMessage])
    setChatInput('')
    setChatLoading(true)
    
    try {
      const boxesData = production.map(item => {
        const box = BOX_TYPES.find(b => b.id === item.boxId)!
        return {
          id: box.id,
          name: box.name,
          l: box.l,
          w: box.w,
          h: box.h,
          unfoldedW: box.unfoldedW,
          unfoldedH: box.unfoldedH,
          quantity: item.quantity,
          isDobleChapeton: box.isDobleChapeton
        }
      })
      
      // Construir historial de chat para la API
      const chatHistory = chatMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
      
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxes: boxesData,
          bobinas: BOBINAS,
          apiKey,
          mode: 'chat',
          chatHistory,
          userMessage: userMessage.content
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al enviar mensaje')
      }
      
      const data = await response.json()
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date()
      }
      
      setChatMessages(prev => [...prev, assistantMessage])
      
      // Si la respuesta incluye un plan actualizado, actualizar
      if (data.parsedData?.productionPlan) {
        setAiResponse(prev => prev ? {
          ...prev,
          productionPlan: data.parsedData.productionPlan,
          summary: data.parsedData.summary || prev.summary
        } : prev)
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Error desconocido'}`,
        timestamp: new Date()
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setChatLoading(false)
    }
  }
  
  // Analizar sobrante para sugerencias de stock
  const analyzeWasteForStock = async () => {
    if (!apiKey) {
      setShowApiKeyModal(true)
      return
    }
    
    if (combinedOptimization.best.length === 0) return
    
    setStockLoading(true)
    setStockError(null)
    setStockSuggestions(null)
    
    try {
      const boxesData = production.map(item => {
        const box = BOX_TYPES.find(b => b.id === item.boxId)!
        return {
          id: box.id,
          name: box.name,
          l: box.l,
          w: box.w,
          h: box.h,
          unfoldedW: box.unfoldedW,
          unfoldedH: box.unfoldedH,
          quantity: item.quantity,
          isDobleChapeton: box.isDobleChapeton
        }
      })
      
      // Calcular datos del sobrante
      const wasteData = {
        cuts: combinedOptimization.best.map((cut, idx) => ({
          bobina: cut.bobina,
          wasteWidth: cut.wasteWidth,
          wastePercent: cut.wastePercent,
          rows: cut.rows,
          lengthM: cut.lengthM,
          slots: cut.slots.map(s => ({
            boxName: s.boxName,
            unfoldedW: s.unfoldedW,
            unfoldedH: s.unfoldedH
          }))
        })),
        totalWasteM2: combinedOptimization.best.reduce((sum, cut) => {
          // Área de desperdicio = sobrante_ancho × largo_total
          return sum + (cut.wasteWidth * cut.lengthM * 1000) / 1000000
        }, 0)
      }
      
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boxes: boxesData,
          bobinas: BOBINAS,
          apiKey,
          mode: 'stock_suggestions',
          wasteData
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al analizar sobrante')
      }
      
      const data = await response.json()
      setStockSuggestions(data)
    } catch (err) {
      setStockError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setStockLoading(false)
    }
  }
  
  // Agregar caja de stock sugerida a producción
  const addStockBoxToProduction = (stockBox: StockBox) => {
    // Buscar si ya existe en el catálogo
    const existingBox = BOX_TYPES.find(b => b.name === stockBox.name || b.name.startsWith(stockBox.name.split('×')[0]))
    
    if (existingBox) {
      // Agregar cantidad a producción existente
      setProduction(prev => {
        const existing = prev.find(p => p.boxId === existingBox.id)
        if (existing) {
          return prev.map(p => p.boxId === existingBox.id 
            ? { ...p, quantity: p.quantity + stockBox.quantity }
            : p
          )
        }
        return [...prev, { boxId: existingBox.id, quantity: stockBox.quantity }]
      })
    } else {
      // Crear caja personalizada
      const id = `stock-${stockBox.name.replace(/[×x]/g, '-')}-${Date.now()}`
      const newBox: BoxType = {
        id,
        name: `${stockBox.name} (Stock)`,
        l: stockBox.unfoldedW / 10, // Aproximación
        w: stockBox.unfoldedH / 20,
        h: stockBox.unfoldedH / 20,
        unfoldedW: stockBox.unfoldedW,
        unfoldedH: stockBox.unfoldedH,
        isCustom: true
      }
      setCustomBoxes(prev => [...prev, newBox])
      setProduction(prev => [...prev, { boxId: id, quantity: stockBox.quantity }])
    }
  }
  
  // Agregar caja sugerida por IA a custom boxes
  const addAISuggestedBox = (dimensions: string, unfoldedH: number) => {
    const parts = dimensions.toLowerCase().replace(/\s/g, '').split('x')
    if (parts.length === 3) {
      const l = parseInt(parts[0])
      const w = parseInt(parts[1])
      const h = parseInt(parts[2])
      if (l > 0 && w > 0 && h > 0) {
        const { unfoldedW } = calculateUnfolded(l, w, h)
        const id = `ai-${l}x${w}x${h}-${Date.now()}`
        const newBox: BoxType = {
          id,
          name: `${l}×${w}×${h} (IA)`,
          l, w, h,
          unfoldedW,
          unfoldedH: unfoldedH || (h + w) * 10,
          isCustom: true
        }
        setCustomBoxes(prev => [...prev, newBox])
      }
    }
  }

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
      const planchasPerBox = box.isDobleChapeton ? 2 : 1
      
      for (const [key, bobina] of Object.entries(BOBINAS)) {
        const bobinaKey = key as '1.60' | '1.30'
        const boxesPerRow = Math.floor(bobina.usable / box.unfoldedH)
        
        if (boxesPerRow > 0) {
          const rowWidthMm = boxesPerRow * box.unfoldedH
          const wastePerRowMm = bobina.usable - rowWidthMm
          const wastePercent = (wastePerRowMm / bobina.usable) * 100
          // Para doble chapetón: cada caja necesita 2 planchas, así que el total de filas se multiplica
          const totalRows = Math.ceil((item.quantity * planchasPerBox) / boxesPerRow)
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
  }, [production, BOX_TYPES])

  // Optimización combinada
  const combinedOptimization = useMemo(() => {
    if (production.length === 0) return { '1.60': [], '1.30': [], best: [] }
    
    const result160 = findBestCombinations(production, '1.60', BOX_TYPES)
    const result130 = findBestCombinations(production, '1.30', BOX_TYPES)
    
    const totalWaste160 = result160.reduce((sum, c) => sum + c.wastePercent * c.rows, 0)
    const totalWaste130 = result130.reduce((sum, c) => sum + c.wastePercent * c.rows, 0)
    
    const best = selectedBobina === 'auto' 
      ? (totalWaste160 <= totalWaste130 ? result160 : result130)
      : selectedBobina === '1.60' ? result160 : result130
    
    return { '1.60': result160, '1.30': result130, best }
  }, [production, selectedBobina, BOX_TYPES])

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

  // Sugerencias de cantidades optimizadas
  const quantitySuggestions = useMemo(() => {
    if (production.length === 0) return new Map<string, QuantitySuggestion[]>()
    const allSuggestions = calculateQuantitySuggestions(production, BOX_TYPES)
    return getBestSuggestionPerBox(allSuggestions)
  }, [production, BOX_TYPES])

  // Aplicar sugerencia
  const applySuggestion = (suggestion: QuantitySuggestion) => {
    updateQuantity(suggestion.boxId, suggestion.suggestedQty)
  }

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
            { id: 'suggestions', label: 'SUGERENCIAS', icon: Lightbulb },
            { id: 'optimization', label: 'SIMPLE', icon: BarChart3 },
            { id: 'combined', label: 'COMBINADO', icon: Combine },
            { id: 'ai', label: 'IA', icon: Sparkles },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id as typeof viewMode)}
              className={`btn-industrial px-3 md:px-6 py-2 md:py-3 flex items-center gap-1 md:gap-2 text-xs md:text-base ${
                viewMode === tab.id ? 'bg-amber-700' : ''
              } ${tab.id === 'suggestions' ? 'bg-yellow-600 hover:bg-yellow-500' : ''} ${tab.id === 'ai' ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500' : ''}`}
            >
              <tab.icon className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.slice(0, 4)}</span>
              {tab.id === 'combined' && (
                <span className="bg-green-500 text-white text-[10px] px-1 py-0.5 rounded hidden md:inline">2 cortes</span>
              )}
              {tab.id === 'suggestions' && production.length > 0 && (
                <span className="bg-white text-yellow-700 text-[10px] px-1 py-0.5 rounded hidden md:inline">IA</span>
              )}
              {tab.id === 'ai' && (
                <span className="bg-white text-purple-700 text-[10px] px-1 py-0.5 rounded hidden md:inline">Claude</span>
              )}
            </button>
          ))}
          
          {/* Botón configurar API */}
          <button
            onClick={() => setShowApiKeyModal(true)}
            className="btn-industrial px-3 py-2 flex items-center gap-1 bg-gray-600 hover:bg-gray-500 text-xs"
            title="Configurar API Key"
          >
            <Settings className="w-3 h-3" />
          </button>
        </nav>
      </header>

      {/* Modal API Key */}
      {showApiKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-amber-900 flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Configurar API de Claude
              </h3>
              <button onClick={() => setShowApiKeyModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Ingresá tu API Key de Anthropic para usar las sugerencias de IA. 
              Podés obtenerla en <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline">console.anthropic.com</a>
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api..."
              className="w-full border-2 border-gray-300 rounded px-3 py-2 mb-4 font-mono text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowApiKeyModal(false)
                  if (production.length > 0) consultAI()
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2 bg-red-100 px-3 py-1 rounded">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <div className="text-xs text-red-700">
            <span className="font-semibold">Largo máx:</span> 2080mm
          </div>
        </div>
      </div>

      {/* Panel de Resumen de Producción - Sticky */}
      {production.length > 0 && (
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl p-4 mb-6 shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-lg p-2">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg tracking-wider">RESUMEN DE PRODUCCIÓN</h3>
                <p className="text-green-100 text-sm">{production.length} tipo(s) de caja en cola</p>
              </div>
            </div>
            
            <div className="flex gap-6 flex-wrap">
              {/* Total Cajas */}
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {production.reduce((sum, p) => sum + p.quantity, 0).toLocaleString()}
                </div>
                <div className="text-xs text-green-100">Cajas</div>
              </div>
              
              {/* Total Planchas */}
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {production.reduce((sum, p) => {
                    const box = BOX_TYPES.find(b => b.id === p.boxId)
                    if (!box) return sum
                    const multiplier = box.isDobleChapeton ? 2 : 1
                    return sum + (p.quantity * multiplier)
                  }, 0).toLocaleString()}
                </div>
                <div className="text-xs text-green-100">Planchas</div>
              </div>

              {/* Metros lineales estimados */}
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {(production.reduce((sum, p) => {
                    const box = BOX_TYPES.find(b => b.id === p.boxId)
                    if (!box) return sum
                    const multiplier = box.isDobleChapeton ? 2 : 1
                    return sum + (p.quantity * multiplier * box.unfoldedW / 1000)
                  }, 0)).toFixed(1)}m
                </div>
                <div className="text-xs text-green-100">Largo bobina</div>
              </div>
            </div>

            <button
              onClick={() => setViewMode('production')}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              Ver detalle
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Desglose rápido */}
          <div className="mt-3 pt-3 border-t border-white/20 flex flex-wrap gap-2">
            {production.map(p => {
              const box = BOX_TYPES.find(b => b.id === p.boxId)
              if (!box) return null
              return (
                <div key={p.boxId} className="bg-white/10 rounded-lg px-3 py-1.5 text-sm flex items-center gap-2">
                  <span className="font-medium">{box.name}</span>
                  <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
                    {p.quantity.toLocaleString()}
                  </span>
                  {box.isDobleChapeton && (
                    <span className="bg-blue-400/50 px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      2P
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Vista: Catálogo */}
      {viewMode === 'catalog' && (
        <section>
          <h2 className="font-display text-xl md:text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <Box className="w-5 h-5" />
            CATÁLOGO DE CAJAS
          </h2>
          
          {/* Formulario caja personalizada */}
          <div className="mb-6">
            {!showCustomForm ? (
              <button
                onClick={() => setShowCustomForm(true)}
                className="w-full border-2 border-dashed border-purple-400 bg-purple-50 hover:bg-purple-100 p-4 rounded-lg flex items-center justify-center gap-2 text-purple-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span className="font-display tracking-wider">AGREGAR CAJA PERSONALIZADA</span>
              </button>
            ) : (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-lg text-purple-800 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Nueva Caja Personalizada
                  </h3>
                  <button onClick={() => setShowCustomForm(false)} className="text-gray-500 hover:text-gray-700">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-purple-600 font-semibold">LARGO (mm)</label>
                    <input
                      type="number"
                      value={customForm.l}
                      onChange={(e) => setCustomForm(prev => ({ ...prev, l: e.target.value }))}
                      placeholder="L"
                      className="w-full border-2 border-purple-300 rounded px-3 py-2 mt-1"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-purple-600 font-semibold">ANCHO (mm)</label>
                    <input
                      type="number"
                      value={customForm.w}
                      onChange={(e) => setCustomForm(prev => ({ ...prev, w: e.target.value }))}
                      placeholder="W"
                      className="w-full border-2 border-purple-300 rounded px-3 py-2 mt-1"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-purple-600 font-semibold">ALTO (mm)</label>
                    <input
                      type="number"
                      value={customForm.h}
                      onChange={(e) => setCustomForm(prev => ({ ...prev, h: e.target.value }))}
                      placeholder="H"
                      className="w-full border-2 border-purple-300 rounded px-3 py-2 mt-1"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-purple-600 font-semibold">CANTIDAD</label>
                    <input
                      type="number"
                      value={customForm.quantity}
                      onChange={(e) => setCustomForm(prev => ({ ...prev, quantity: e.target.value }))}
                      placeholder="Opc."
                      className="w-full border-2 border-purple-300 rounded px-3 py-2 mt-1"
                      min="0"
                    />
                  </div>
                </div>
                
                {/* Preview de medidas calculadas */}
                {customForm.l && customForm.w && customForm.h && (() => {
                  const unfoldedW = 2 * parseInt(customForm.l) + 2 * parseInt(customForm.w) + 50
                  const unfoldedH = parseInt(customForm.h) + parseInt(customForm.w)
                  const chapeton = calculateDobleChapeton(unfoldedW, unfoldedH)
                  const exceedsWidth160 = unfoldedH > 1520
                  const exceedsWidth130 = unfoldedH > 1230
                  
                  return (
                    <div className="space-y-2 mb-3">
                      {/* Medidas originales */}
                      <div className="bg-white/50 rounded p-2 text-sm">
                        <span className="text-purple-600">Desplegado RSC total: </span>
                        <strong>{unfoldedW} × {unfoldedH} mm</strong>
                      </div>
                      
                      {/* Doble chapetón */}
                      {chapeton.needsDobleChapeton && (
                        <div className="bg-blue-100 border-2 border-blue-400 rounded p-3 text-sm">
                          <div className="flex items-center gap-2 text-blue-800 font-semibold mb-2">
                            <Layers className="w-4 h-4" />
                            DOBLE CHAPETÓN
                          </div>
                          <div className="text-blue-700 text-xs space-y-1">
                            <p>El largo ({unfoldedW}mm) excede el límite de 2080mm.</p>
                            <p className="font-semibold">Se usarán 2 planchas pegadas:</p>
                            <div className="bg-white/50 rounded p-2 mt-1">
                              <span className="font-bold text-blue-900">2 × ({chapeton.planchaW} × {chapeton.planchaH} mm)</span>
                              <span className="text-blue-600 ml-2">c/u</span>
                            </div>
                            <p className="text-xs text-blue-500 mt-1">
                              Incluye {CHAPETON_OVERLAP}mm de solapamiento para pegado
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Plancha única */}
                      {!chapeton.needsDobleChapeton && (
                        <div className="bg-green-50 border border-green-300 rounded p-2 text-sm">
                          <span className="text-green-700">Plancha única: </span>
                          <strong className="text-green-800">{chapeton.planchaW} × {chapeton.planchaH} mm</strong>
                        </div>
                      )}
                      
                      {/* Advertencia de ancho */}
                      {exceedsWidth160 && !exceedsWidth130 && (
                        <div className="bg-amber-100 border border-amber-300 rounded p-2 text-xs text-amber-700 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span>
                            Solo cabe en bobina 1.30m ({unfoldedH}mm &gt; 1520mm útiles de 1.60m)
                          </span>
                        </div>
                      )}
                      
                      {exceedsWidth160 && exceedsWidth130 && (
                        <div className="bg-red-100 border border-red-300 rounded p-2 text-xs text-red-700 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span>
                            <strong>⚠️ Excede ancho de bobinas:</strong> El alto desplegado ({unfoldedH}mm) supera ambas bobinas. 
                            Reducí H o W.
                          </span>
                        </div>
                      )}
                      
                      {/* Estado OK */}
                      {!exceedsWidth160 && !chapeton.needsDobleChapeton && (
                        <div className="bg-green-100 border border-green-300 rounded p-2 text-xs text-green-700 flex items-center gap-2">
                          <Check className="w-4 h-4 flex-shrink-0" />
                          <span>✓ Compatible con ambas bobinas - plancha única</span>
                        </div>
                      )}
                      
                      {!exceedsWidth160 && chapeton.needsDobleChapeton && (
                        <div className="bg-blue-100 border border-blue-300 rounded p-2 text-xs text-blue-700 flex items-center gap-2">
                          <Check className="w-4 h-4 flex-shrink-0" />
                          <span>✓ Compatible con ambas bobinas - doble chapetón (2 planchas por caja)</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
                
                <button
                  onClick={addCustomBox}
                  disabled={!customForm.l || !customForm.w || !customForm.h || savingBox ||
                    (parseInt(customForm.h || '0') + parseInt(customForm.w || '0')) > 1520}
                  className="w-full bg-purple-600 text-white py-2 rounded font-display tracking-wider hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingBox ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      GUARDANDO...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      AGREGAR AL CATÁLOGO
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          
          {/* Cajas personalizadas existentes */}
          {loadingCustomBoxes ? (
            <div className="mb-6 bg-purple-50 border-2 border-purple-200 p-4 rounded-lg text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
              <p className="text-purple-600 text-sm">Cargando cajas personalizadas...</p>
            </div>
          ) : customBoxes.length > 0 && (
            <div className="mb-6">
              <h3 className="font-display text-lg text-purple-700 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                CAJAS PERSONALIZADAS ({customBoxes.length})
                {user && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Sincronizado</span>}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {customBoxes.map(box => {
                  const qty = quantities[box.id] || 0
                  const inProduction = production.find(p => p.boxId === box.id)
                  const fit160 = Math.floor(BOBINAS['1.60'].usable / box.unfoldedH)
                  const fit130 = Math.floor(BOBINAS['1.30'].usable / box.unfoldedH)
                  const waste160 = ((BOBINAS['1.60'].usable - (fit160 * box.unfoldedH)) / BOBINAS['1.60'].usable * 100).toFixed(1)
                  const waste130 = ((BOBINAS['1.30'].usable - (fit130 * box.unfoldedH)) / BOBINAS['1.30'].usable * 100).toFixed(1)
                  
                  return (
                    <div 
                      key={box.id}
                      className={`bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 p-3 transition-all ${inProduction ? 'ring-2 ring-green-500/50' : ''} ${box.isDobleChapeton ? 'border-blue-400' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-display text-lg text-purple-800">{box.name}</h3>
                          <p className="text-xs text-purple-600">
                            {box.isDobleChapeton ? (
                              <span className="text-blue-600">2 × ({box.unfoldedW} × {box.unfoldedH} mm)</span>
                            ) : (
                              <span>{box.unfoldedW} × {box.unfoldedH} mm</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {box.isDobleChapeton && (
                            <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                              2P
                            </span>
                          )}
                          {inProduction && (
                            <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded">
                              {inProduction.quantity}
                            </span>
                          )}
                          <button
                            onClick={() => removeCustomBox(box.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Eliminar caja"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {box.isDobleChapeton && (
                        <div className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded mb-2 text-center">
                          <Layers className="w-3 h-3 inline mr-1" />
                          Doble Chapetón - 2 planchas/caja
                        </div>
                      )}
                      
                      <div className="flex justify-center mb-2">
                        <BoxUnfoldedVisual box={box} scale={0.1} />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1 text-xs mb-2">
                        <div className={`p-1.5 rounded ${parseFloat(waste160) < parseFloat(waste130) ? 'bg-green-100' : 'bg-white/50'}`}>
                          <div className="font-semibold">1.60m</div>
                          <div>{fit160}/fila • {waste160}%</div>
                        </div>
                        <div className={`p-1.5 rounded ${parseFloat(waste130) < parseFloat(waste160) ? 'bg-green-100' : 'bg-white/50'}`}>
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
                          className="input-industrial flex-1 px-2 py-1.5 text-sm w-20 border-purple-300"
                        />
                        <button
                          onClick={() => {
                            addToProduction(box.id, qty)
                            setCatalogQty(box.id, 0)
                          }}
                          className="bg-purple-600 text-white px-3 py-1.5 text-xs rounded hover:bg-purple-500"
                          disabled={qty <= 0}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          {/* Título cajas estándar */}
          <h3 className="font-display text-lg text-amber-700 mb-3 flex items-center gap-2">
            <Box className="w-4 h-4" />
            CAJAS ESTÁNDAR ({DEFAULT_BOX_TYPES.length})
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {DEFAULT_BOX_TYPES.map(box => {
              const qty = quantities[box.id] || 0
              const inProduction = production.find(p => p.boxId === box.id)
              const fit160 = Math.floor(BOBINAS['1.60'].usable / box.unfoldedH)
              const fit130 = Math.floor(BOBINAS['1.30'].usable / box.unfoldedH)
              const waste160 = ((BOBINAS['1.60'].usable - (fit160 * box.unfoldedH)) / BOBINAS['1.60'].usable * 100).toFixed(1)
              const waste130 = ((BOBINAS['1.30'].usable - (fit130 * box.unfoldedH)) / BOBINAS['1.30'].usable * 100).toFixed(1)
              
              return (
                <div 
                  key={box.id}
                  className={`bg-white/80 border-2 p-3 transition-all border-amber-700/20 ${inProduction ? 'ring-2 ring-green-500/50' : ''} ${box.isDobleChapeton ? 'border-blue-400 bg-blue-50/50' : ''}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-display text-lg text-amber-900">{box.name}</h3>
                      <p className="text-xs text-amber-600">
                        {box.isDobleChapeton ? (
                          <span className="text-blue-600">2 × ({box.unfoldedW} × {box.unfoldedH} mm)</span>
                        ) : (
                          <span>{box.unfoldedW} × {box.unfoldedH} mm</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {box.isDobleChapeton && (
                        <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                          2P
                        </span>
                      )}
                      {inProduction && (
                        <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded">
                          {inProduction.quantity}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {box.isDobleChapeton && (
                    <div className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded mb-2 text-center">
                      <Layers className="w-3 h-3 inline mr-1" />
                      Doble Chapetón
                    </div>
                  )}
                  
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

      {/* Vista: Sugerencias */}
      {viewMode === 'suggestions' && (
        <section>
          <h2 className="font-display text-xl md:text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            SUGERENCIAS DE CANTIDAD
            <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded ml-2">Optimización inteligente</span>
          </h2>
          
          {production.length === 0 ? (
            <div className="bg-white/60 border-2 border-dashed border-amber-700/30 p-8 text-center">
              <Lightbulb className="w-12 h-12 mx-auto text-amber-300 mb-4" />
              <p className="text-amber-700">No hay producción para optimizar</p>
              <p className="text-sm text-amber-500">Agregá cajas desde el catálogo</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Explicación */}
              <div className="bg-yellow-50 border-2 border-yellow-300 p-4 rounded">
                <div className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold text-yellow-800 mb-1">¿Cómo funcionan las sugerencias?</p>
                    <p className="text-yellow-700">
                      Analizamos las cantidades solicitadas y sugerimos ajustes para completar filas completas 
                      en la bobina, minimizando el desperdicio. Las sugerencias son:
                    </p>
                    <ul className="mt-2 space-y-1 text-yellow-700">
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <strong>Verde:</strong> Cumple o supera la cantidad mínima solicitada
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                        <strong>Amarillo:</strong> Hasta -5% del pedido (ahorra material)
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Sugerencias por caja */}
              {production.map(item => {
                const box = BOX_TYPES.find(b => b.id === item.boxId)
                if (!box) return null
                
                const suggestions = quantitySuggestions.get(item.boxId) || []
                
                return (
                  <div key={item.boxId} className="bg-white/80 border-2 border-amber-700/30 p-4">
                    <div className="flex items-center gap-4 mb-4 flex-wrap">
                      <div className="hidden sm:block">
                        <BoxUnfoldedVisual box={box} scale={0.08} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-display text-xl text-amber-900">{box.name}</h3>
                        <p className="text-sm text-amber-600">
                          Pedido actual: <strong>{item.quantity} unidades</strong>
                        </p>
                        <p className="text-xs text-gray-500">
                          Desplegado: {box.unfoldedW} × {box.unfoldedH} mm
                        </p>
                      </div>
                    </div>
                    
                    {suggestions.length === 0 ? (
                      <div className="text-sm text-gray-500 italic">
                        No hay sugerencias alternativas para esta cantidad.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-amber-700 mb-2">
                          OPCIONES DE CANTIDAD:
                        </div>
                        <div className="grid gap-2">
                          {suggestions.map((sug, idx) => (
                            <div 
                              key={idx}
                              className={`p-3 rounded border-2 transition-all ${
                                sug.isMinimum 
                                  ? 'border-green-300 bg-green-50 hover:border-green-500' 
                                  : 'border-amber-300 bg-amber-50 hover:border-amber-500'
                              }`}
                            >
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-3">
                                  <div className={`w-3 h-3 rounded-full ${sug.isMinimum ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                                  <div>
                                    <div className="font-bold text-lg">
                                      {sug.suggestedQty} unidades
                                      {sug.difference !== 0 && (
                                        <span className={`ml-2 text-sm font-normal ${
                                          sug.difference > 0 ? 'text-green-600' : 'text-amber-600'
                                        }`}>
                                          ({sug.difference > 0 ? '+' : ''}{sug.difference})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-600">{sug.reason}</div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                  <div className="text-right text-xs">
                                    <div className="text-gray-600">Bobina {sug.bobina}m</div>
                                    <div><strong>{sug.boxesPerRow}</strong> cajas/fila × <strong>{sug.rows}</strong> filas</div>
                                    <div className={sug.wastePercent < 10 ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                                      {sug.wastePercent.toFixed(1)}% desperdicio
                                    </div>
                                    <div className="text-gray-500">{sug.metersNeeded.toFixed(2)}m lineales</div>
                                  </div>
                                  
                                  <button
                                    onClick={() => applySuggestion(sug)}
                                    className={`px-4 py-2 rounded font-display tracking-wider text-sm flex items-center gap-1 ${
                                      sug.isMinimum
                                        ? 'bg-green-600 text-white hover:bg-green-500'
                                        : 'bg-amber-600 text-white hover:bg-amber-500'
                                    }`}
                                  >
                                    APLICAR
                                    <ArrowRight className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              
              {/* Resumen de optimización potencial */}
              <div className="bg-gradient-to-br from-yellow-500 to-yellow-700 text-white p-4 rounded">
                <div className="font-display text-lg tracking-wider mb-2 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  CONSEJO
                </div>
                <p className="text-sm text-yellow-100">
                  Ajustar las cantidades a filas completas puede ahorrar hasta un 20% de material. 
                  Las sugerencias en <strong>verde</strong> cumplen con tu pedido mínimo, 
                  las <strong>amarillas</strong> sacrifican hasta un 5% de cantidad por mayor eficiencia.
                </p>
              </div>
              
              {/* Botón para ir a optimización */}
              <div className="flex gap-3 justify-center mt-4">
                <button 
                  onClick={() => setViewMode('optimization')} 
                  className="btn-industrial px-6 py-2 flex items-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  VER OPTIMIZACIÓN SIMPLE
                </button>
                <button 
                  onClick={() => setViewMode('combined')} 
                  className="btn-industrial bg-green-600 px-6 py-2 flex items-center gap-2"
                >
                  <Combine className="w-4 h-4" />
                  VER COMBINADO
                </button>
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
              
              {/* Sección de sugerencias de stock con IA */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 p-4 rounded-lg">
                <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <h3 className="font-display text-lg text-purple-800 flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      SUGERENCIAS DE STOCK CON SOBRANTE
                    </h3>
                    <p className="text-sm text-purple-600">
                      Analiza el material sobrante y sugiere cajas estándar para stockear (máx. 2000 m² por tipo)
                    </p>
                  </div>
                  <button
                    onClick={analyzeWasteForStock}
                    disabled={stockLoading || !apiKey}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-5 py-2.5 rounded-lg font-display tracking-wider hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 flex items-center gap-2"
                  >
                    {stockLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analizando...
                      </>
                    ) : (
                      <>
                        <Bot className="w-5 h-5" />
                        ANALIZAR SOBRANTE
                      </>
                    )}
                  </button>
                </div>
                
                {!apiKey && (
                  <div className="bg-amber-100 text-amber-700 px-3 py-2 rounded text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Configurá tu API Key para usar esta función
                    <button onClick={() => setShowApiKeyModal(true)} className="underline ml-1">Configurar</button>
                  </div>
                )}
                
                {stockError && (
                  <div className="bg-red-50 border border-red-300 p-3 rounded text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {stockError}
                  </div>
                )}
                
                {stockSuggestions && (
                  <div className="space-y-4">
                    {/* Análisis */}
                    <div className="bg-white rounded-lg p-3">
                      <p className="text-gray-700 text-sm">{stockSuggestions.analysis}</p>
                    </div>
                    
                    {/* Resumen */}
                    {stockSuggestions.summary && (
                      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-3 rounded-lg">
                        <div className="grid grid-cols-4 gap-3 text-center">
                          <div>
                            <div className="text-xl font-bold">{stockSuggestions.summary.boxTypes || 0}</div>
                            <div className="text-xs text-green-100">Tipos</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold">{stockSuggestions.summary.totalStockBoxes?.toLocaleString() || 0}</div>
                            <div className="text-xs text-green-100">Cajas</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold">{stockSuggestions.summary.totalStockM2?.toFixed(1) || 0} m²</div>
                            <div className="text-xs text-green-100">Material</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold">{stockSuggestions.summary.wasteUtilization || '-'}</div>
                            <div className="text-xs text-green-100">Aprovechado</div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Lista de cajas sugeridas */}
                    {stockSuggestions.stockBoxes && stockSuggestions.stockBoxes.length > 0 ? (
                      <div className="space-y-2">
                        <h4 className="font-display text-sm text-purple-800">CAJAS SUGERIDAS PARA STOCK:</h4>
                        <div className="grid gap-2 md:grid-cols-2">
                          {stockSuggestions.stockBoxes.map((box, idx) => (
                            <div 
                              key={idx} 
                              className={`bg-white border-2 rounded-lg p-3 ${
                                box.priority === 'alta' ? 'border-green-400' : 
                                box.priority === 'media' ? 'border-yellow-400' : 'border-gray-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-purple-800">{box.name}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      box.priority === 'alta' ? 'bg-green-100 text-green-700' :
                                      box.priority === 'media' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {box.priority}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500 mb-1">
                                    Plancha: {box.unfoldedW}×{box.unfoldedH}mm
                                  </div>
                                  <div className="text-sm">
                                    <span className="font-semibold text-green-700">{box.quantity.toLocaleString()} unidades</span>
                                    <span className="text-gray-500 ml-2">({box.totalM2?.toFixed(1) || '?'} m²)</span>
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1">{box.reason}</p>
                                  <p className="text-xs text-purple-500 mt-1">{box.sourceWaste}</p>
                                </div>
                                <button
                                  onClick={() => addStockBoxToProduction(box)}
                                  className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 flex-shrink-0"
                                >
                                  <Plus className="w-3 h-3" />
                                  Agregar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-purple-600 py-4">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No hay sugerencias de stock disponibles</p>
                      </div>
                    )}
                    
                    {stockSuggestions.additionalNotes && (
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-700">
                        <Lightbulb className="w-4 h-4 inline mr-2" />
                        {stockSuggestions.additionalNotes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
      
      {/* Vista: IA */}
      {viewMode === 'ai' && (
        <section>
          <h2 className="font-display text-xl md:text-2xl tracking-wider text-amber-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            ASISTENTE IA
            <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs px-2 py-0.5 rounded">Claude</span>
          </h2>
          
          {production.length === 0 ? (
            <div className="bg-white/60 border-2 border-dashed border-purple-300 p-8 text-center">
              <Bot className="w-12 h-12 mx-auto text-purple-300 mb-4" />
              <p className="text-purple-700">No hay producción para analizar</p>
              <p className="text-sm text-purple-500">Agregá cajas desde el catálogo</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Botón consultar IA */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 p-6 rounded-lg">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="font-display text-lg text-purple-800 mb-1">
                      {aiResponse ? 'Regenerar Hoja de Producción' : 'Generar Hoja de Producción'}
                    </h3>
                    <p className="text-sm text-purple-600">
                      Claude analizará tu producción y generará una hoja de producción optimizada con pasadas y combinaciones.
                    </p>
                  </div>
                  <button
                    onClick={consultAI}
                    disabled={aiLoading || !apiKey}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-lg font-display tracking-wider hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 flex items-center gap-2"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analizando...
                      </>
                    ) : (
                      <>
                        <FileText className="w-5 h-5" />
                        {aiResponse ? 'REGENERAR' : 'GENERAR HOJA'}
                      </>
                    )}
                  </button>
                </div>
                
                {!apiKey && (
                  <div className="mt-4 bg-amber-100 text-amber-700 px-3 py-2 rounded text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Configurá tu API Key de Anthropic para usar esta función
                    <button onClick={() => setShowApiKeyModal(true)} className="underline ml-1">Configurar</button>
                  </div>
                )}
              </div>
              
              {/* Error */}
              {aiError && (
                <div className="bg-red-50 border-2 border-red-300 p-4 rounded-lg text-red-700">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <AlertTriangle className="w-4 h-4" />
                    Error
                  </div>
                  <p className="text-sm">{aiError}</p>
                </div>
              )}
              
              {/* Respuesta de IA - Hoja de Producción */}
              {aiResponse && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Columna izquierda: Hoja de Producción */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Análisis */}
                    <div className="bg-white border-2 border-purple-200 p-4 rounded-lg">
                      <h3 className="font-display text-lg text-purple-800 mb-2 flex items-center gap-2">
                        <Bot className="w-5 h-5" />
                        Análisis
                      </h3>
                      <p className="text-gray-700">{aiResponse.analysis}</p>
                    </div>
                    
                    {/* Resumen de producción */}
                    {aiResponse.summary && (
                      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 rounded-lg">
                        <h3 className="font-display text-lg mb-3 flex items-center gap-2">
                          <BarChart3 className="w-5 h-5" />
                          RESUMEN DE PRODUCCIÓN
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold">{aiResponse.summary.totalPasadas || '-'}</div>
                            <div className="text-xs text-green-100">Pasadas</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold">{aiResponse.summary.totalMetros160?.toFixed(1) || '0'}m</div>
                            <div className="text-xs text-green-100">Bobina 1.60</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold">{aiResponse.summary.totalMetros130?.toFixed(1) || '0'}m</div>
                            <div className="text-xs text-green-100">Bobina 1.30</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold">{aiResponse.summary.desperdicioPromedio || '-'}</div>
                            <div className="text-xs text-green-100">Desperdicio</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold flex items-center justify-center gap-1">
                              <Clock className="w-4 h-4" />
                              {aiResponse.summary.tiempoEstimado || '-'}
                            </div>
                            <div className="text-xs text-green-100">Estimado</div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Plan de producción - Pasadas */}
                    {aiResponse.productionPlan && aiResponse.productionPlan.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-display text-lg text-amber-900 flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          HOJA DE PRODUCCIÓN
                        </h3>
                        {aiResponse.productionPlan.map((pasada, idx) => (
                          <div key={idx} className="bg-white border-2 border-amber-200 rounded-lg overflow-hidden">
                            {/* Header de pasada */}
                            <div className="bg-gradient-to-r from-amber-100 to-orange-100 px-4 py-2 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="bg-amber-600 text-white text-sm px-3 py-1 rounded font-bold">
                                  PASADA {pasada.pasada}
                                </span>
                                <span className={`text-sm px-2 py-0.5 rounded ${pasada.bobina === '1.60' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                  Bobina {pasada.bobina}m
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span className="text-gray-600">
                                  <Ruler className="w-4 h-4 inline mr-1" />
                                  {pasada.metrosLineales?.toFixed(1) || '?'}m
                                </span>
                                <span className={`font-semibold ${parseFloat(pasada.desperdicio) < 10 ? 'text-green-600' : 'text-amber-600'}`}>
                                  {pasada.desperdicio} desp.
                                </span>
                              </div>
                            </div>
                            
                            {/* Contenido de pasada */}
                            <div className="p-4">
                              {/* Largos de corte */}
                              <div className="mb-3 flex items-center gap-2 text-sm">
                                <Scissors className="w-4 h-4 text-amber-600" />
                                <span className="text-gray-600">Largos de corte:</span>
                                {pasada.largosCorte?.map((largo, i) => (
                                  <span key={i} className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">
                                    {largo}mm
                                  </span>
                                ))}
                              </div>
                              
                              {/* Tabla de filas */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-gray-50 text-left">
                                      <th className="px-3 py-2">Caja</th>
                                      <th className="px-3 py-2 text-center">Alto Desp.</th>
                                      <th className="px-3 py-2 text-center">Largo Desp.</th>
                                      <th className="px-3 py-2 text-center">Cantidad</th>
                                      <th className="px-3 py-2 text-center">Filas</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pasada.filas?.map((fila, i) => (
                                      <tr key={i} className="border-t">
                                        <td className="px-3 py-2 font-medium">{fila.caja}</td>
                                        <td className="px-3 py-2 text-center text-gray-600">{fila.altoDesp}mm</td>
                                        <td className="px-3 py-2 text-center text-gray-600">{fila.largoDesp}mm</td>
                                        <td className="px-3 py-2 text-center">
                                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-semibold">
                                            {fila.cantidad}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-center text-gray-600">{fila.filasEnBobina}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              
                              {/* Footer de pasada */}
                              <div className="mt-3 pt-3 border-t flex items-center justify-between text-sm">
                                <span className="text-gray-600">
                                  Alto usado: <strong>{pasada.altosUsados}mm</strong> | 
                                  Sobrante: <span className={pasada.sobrante > 100 ? 'text-amber-600' : 'text-green-600'}>{pasada.sobrante}mm</span>
                                </span>
                                {pasada.notas && (
                                  <span className="text-purple-600 italic text-xs">{pasada.notas}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Sugerencias */}
                    {aiResponse.suggestions && aiResponse.suggestions.length > 0 && (
                      <div className="bg-white border-2 border-yellow-200 p-4 rounded-lg">
                        <h3 className="font-display text-lg text-yellow-800 mb-3 flex items-center gap-2">
                          <Lightbulb className="w-5 h-5" />
                          Sugerencias de Optimización
                        </h3>
                        <div className="space-y-2">
                          {aiResponse.suggestions.map((sug, idx) => (
                            <div key={idx} className="bg-yellow-50 p-3 rounded flex items-start gap-3">
                              <TrendingUp className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-sm text-gray-700">{sug.mensaje || sug.message}</p>
                                <p className="text-xs text-yellow-600 mt-1 font-semibold">{sug.impacto || sug.impact}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Cajas para sobrante */}
                    {aiResponse.wasteBoxes && aiResponse.wasteBoxes.length > 0 && (
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-300 p-4 rounded-lg">
                        <h3 className="font-display text-lg text-purple-800 mb-3 flex items-center gap-2">
                          <Sparkles className="w-5 h-5" />
                          Cajas Sugeridas para el Sobrante
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {aiResponse.wasteBoxes.map((box, idx) => (
                            <div key={idx} className="bg-white p-3 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <h4 className="font-semibold text-purple-800">{box.name}</h4>
                                  <p className="text-xs text-gray-600">{box.dimensions}mm</p>
                                  {box.cantidad && (
                                    <p className="text-xs text-green-600">Cantidad sugerida: {box.cantidad}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => addAISuggestedBox(box.dimensions, box.unfoldedH)}
                                  className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-500 flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  Agregar
                                </button>
                              </div>
                              <p className="text-xs text-gray-600 mb-2">{box.reason}</p>
                              <div className="flex flex-wrap gap-1">
                                {box.possibleUses?.map((use, i) => (
                                  <span key={i} className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded">
                                    {use}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Columna derecha: Chat */}
                  <div className="lg:col-span-1">
                    <div className="bg-white border-2 border-purple-200 rounded-lg h-[600px] flex flex-col sticky top-4">
                      {/* Header del chat */}
                      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-3 rounded-t-lg flex items-center gap-2">
                        <MessageCircle className="w-5 h-5" />
                        <span className="font-display tracking-wider">CHAT CON CLAUDE</span>
                      </div>
                      
                      {/* Mensajes */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {chatMessages.length === 0 ? (
                          <div className="text-center text-gray-400 py-8">
                            <Bot className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Preguntame cómo mejorar la hoja de producción</p>
                            <div className="mt-4 space-y-2">
                              <button 
                                onClick={() => setChatInput('¿Cómo puedo reducir el desperdicio?')}
                                className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full hover:bg-purple-100"
                              >
                                ¿Cómo reducir desperdicio?
                              </button>
                              <button 
                                onClick={() => setChatInput('¿Puedo combinar de otra forma las cajas?')}
                                className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full hover:bg-purple-100"
                              >
                                Otras combinaciones
                              </button>
                              <button 
                                onClick={() => setChatInput('Quiero priorizar la bobina de 1.60m')}
                                className="text-xs bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full hover:bg-purple-100"
                              >
                                Priorizar bobina 1.60
                              </button>
                            </div>
                          </div>
                        ) : (
                          chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                                msg.role === 'user' 
                                  ? 'bg-purple-600 text-white' 
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-purple-200' : 'text-gray-400'}`}>
                                  {msg.timestamp.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                        {chatLoading && (
                          <div className="flex justify-start">
                            <div className="bg-gray-100 rounded-lg px-4 py-2 flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                              <span className="text-sm text-gray-600">Pensando...</span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Input del chat */}
                      <div className="border-t p-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                            placeholder="Escribí tu mensaje..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-400"
                            disabled={chatLoading}
                          />
                          <button
                            onClick={sendChatMessage}
                            disabled={!chatInput.trim() || chatLoading}
                            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Producción actual para referencia */}
              {!aiResponse && (
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-600 mb-2">Producción a analizar:</h4>
                  <div className="flex flex-wrap gap-2">
                    {production.map(item => {
                      const box = BOX_TYPES.find(b => b.id === item.boxId)
                      return box ? (
                        <span key={item.boxId} className="bg-white border px-2 py-1 rounded text-sm">
                          {item.quantity.toLocaleString()}× {box.name}
                          {box.isDobleChapeton && <span className="ml-1 text-xs text-blue-600">(2P)</span>}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )}
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
