import { NextRequest, NextResponse } from 'next/server'

interface BoxData {
  id: string
  name: string
  l: number
  w: number
  h: number
  unfoldedW: number
  unfoldedH: number
  quantity: number
  isDobleChapeton?: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface OptimizeRequest {
  boxes: BoxData[]
  bobinas: {
    '1.60': { usable: number }
    '1.30': { usable: number }
  }
  apiKey?: string
  mode?: 'analyze' | 'chat' | 'stock_suggestions'
  chatHistory?: ChatMessage[]
  userMessage?: string
  wasteData?: {
    cuts: {
      bobina: string
      wasteWidth: number
      wastePercent: number
      rows: number
      lengthM: number
      slots: { boxName: string; unfoldedW: number; unfoldedH: number }[]
    }[]
    totalWasteM2: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: OptimizeRequest = await request.json()
    const { boxes, bobinas, mode = 'analyze', chatHistory = [], userMessage, wasteData } = body
    
    // Usar API key del body o de variable de entorno
    const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key de Anthropic no configurada' },
        { status: 400 }
      )
    }

    // Construir mensajes según el modo
    let messages: { role: 'user' | 'assistant'; content: string }[] = []
    
    if (mode === 'analyze') {
      // Modo análisis inicial: generar hoja de producción
      const prompt = buildProductionSheetPrompt(boxes, bobinas)
      messages = [{ role: 'user', content: prompt }]
    } else if (mode === 'stock_suggestions') {
      // Modo sugerencias de stock con sobrante
      const prompt = buildStockSuggestionsPrompt(boxes, bobinas, wasteData!)
      messages = [{ role: 'user', content: prompt }]
    } else {
      // Modo chat: continuar conversación
      const systemContext = buildChatContext(boxes, bobinas)
      messages = [
        { role: 'user', content: systemContext },
        ...chatHistory,
        { role: 'user', content: userMessage || '' }
      ]
    }
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages
      })
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: `Error de API: ${error}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    const aiResponse = data.content[0].text

    if (mode === 'analyze') {
      // Parsear la respuesta JSON de la hoja de producción
      try {
        const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/)
        const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse
        const productionSheet = JSON.parse(jsonStr)
        return NextResponse.json({
          type: 'production_sheet',
          ...productionSheet,
          rawResponse: aiResponse
        })
      } catch {
        return NextResponse.json({ 
          type: 'production_sheet',
          analysis: aiResponse,
          productionPlan: [],
          summary: {},
          suggestions: []
        })
      }
    } else if (mode === 'stock_suggestions') {
      // Parsear sugerencias de stock
      try {
        const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/)
        const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse
        const stockSuggestions = JSON.parse(jsonStr)
        return NextResponse.json({
          type: 'stock_suggestions',
          ...stockSuggestions
        })
      } catch {
        return NextResponse.json({ 
          type: 'stock_suggestions',
          analysis: aiResponse,
          stockBoxes: []
        })
      }
    } else {
      // Modo chat: devolver respuesta de texto
      // Intentar parsear si hay JSON en la respuesta
      let parsedData = null
      try {
        const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/)
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[1])
        }
      } catch {
        // No hay JSON válido, es solo texto
      }
      
      return NextResponse.json({
        type: 'chat',
        message: aiResponse,
        parsedData
      })
    }

  } catch (error) {
    console.error('Error en optimize:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

function buildChatContext(boxes: BoxData[], bobinas: { '1.60': { usable: number }, '1.30': { usable: number } }): string {
  const boxList = boxes.map(b => 
    `- ${b.name}: ${b.quantity} unidades, plancha ${b.unfoldedW}×${b.unfoldedH}mm${b.isDobleChapeton ? ' (DOBLE CHAPETÓN)' : ''}`
  ).join('\n')

  return `Eres un asistente experto en producción de cajas de cartón corrugado. Ayudas a optimizar el corte y la producción.

CONTEXTO DE PRODUCCIÓN ACTUAL:
${boxList}

BOBINAS DISPONIBLES:
- Bobina 1.60m: ${bobinas['1.60'].usable}mm útiles
- Bobina 1.30m: ${bobinas['1.30'].usable}mm útiles

REGLAS:
- Largo máximo de plancha: 2080mm
- Máximo 2 largos diferentes por plancha
- Cajas con doble chapetón (2P) usan 2 planchas cada una

Cuando el usuario te pida modificar la hoja de producción, responde con el JSON actualizado usando el formato:
\`\`\`json
{
  "productionPlan": [...],
  "summary": {...},
  "changes": "Descripción de los cambios realizados"
}
\`\`\`

Sé conciso y práctico en tus respuestas.`
}

function buildProductionSheetPrompt(boxes: BoxData[], bobinas: { '1.60': { usable: number }, '1.30': { usable: number } }): string {
  const boxList = boxes.map(b => 
    `- ${b.name}: ${b.quantity} unidades, plancha ${b.unfoldedW}×${b.unfoldedH}mm (L${b.l}×W${b.w}×H${b.h}mm)${b.isDobleChapeton ? ' [DOBLE CHAPETÓN - 2 planchas/caja]' : ''}`
  ).join('\n')

  const totalPlanchas = boxes.reduce((sum, b) => {
    const mult = b.isDobleChapeton ? 2 : 1
    return sum + (b.quantity * mult)
  }, 0)

  return `Eres un experto en producción de cajas de cartón corrugado. Genera una HOJA DE PRODUCCIÓN optimizada.

PEDIDO DE PRODUCCIÓN:
${boxList}

Total de planchas a producir: ${totalPlanchas}

BOBINAS DISPONIBLES:
- Bobina 1.60m: ${bobinas['1.60'].usable}mm de ancho útil
- Bobina 1.30m: ${bobinas['1.30'].usable}mm de ancho útil

LÍMITES DE MÁQUINA:
- Largo máximo de plancha: 2080mm
- Máximo 2 largos de corte diferentes por plancha (pasada)

INSTRUCCIONES:
1. Agrupa las cajas en "pasadas" o "tiradas" de producción
2. Cada pasada puede combinar diferentes tipos de cajas si sus altos suman ≤ ancho útil de bobina
3. Máximo 2 largos diferentes de corte por pasada
4. Optimiza para minimizar desperdicio y cambios de configuración

RESPONDE EN JSON:
\`\`\`json
{
  "analysis": "Resumen breve del análisis de producción",
  "productionPlan": [
    {
      "pasada": 1,
      "bobina": "1.60",
      "largosCorte": [850, 1050],
      "filas": [
        {"caja": "20×20×10", "altoDesp": 300, "largoDesp": 850, "cantidad": 150, "filasEnBobina": 5},
        {"caja": "30×20×15", "altoDesp": 350, "largoDesp": 1050, "cantidad": 100, "filasEnBobina": 4}
      ],
      "altosUsados": 650,
      "sobrante": 870,
      "desperdicio": "5.3%",
      "metrosLineales": 42.5,
      "notas": "Combina bien, poco desperdicio"
    }
  ],
  "summary": {
    "totalPasadas": 3,
    "totalMetros160": 125.5,
    "totalMetros130": 45.2,
    "desperdicioPromedio": "4.8%",
    "tiempoEstimado": "4 horas"
  },
  "suggestions": [
    {
      "tipo": "optimizacion",
      "mensaje": "Sugerencia de mejora",
      "impacto": "-2% desperdicio"
    }
  ],
  "wasteBoxes": [
    {
      "name": "Porta-lapiceros",
      "dimensions": "80x80x100",
      "unfoldedH": 180,
      "cantidad": 50,
      "reason": "Aprovecha sobrante de 200mm",
      "possibleUses": ["oficina", "regalo"]
    }
  ]
}
\`\`\`

IMPORTANTE:
- Sé preciso con los cálculos de metros lineales
- Los largos de corte deben ser ≤ 2080mm
- Sugiere cajas pequeñas para aprovechar sobrantes significativos (>100mm)`
}

interface WasteData {
  cuts: {
    bobina: string
    wasteWidth: number
    wastePercent: number
    rows: number
    lengthM: number
    slots: { boxName: string; unfoldedW: number; unfoldedH: number }[]
  }[]
  totalWasteM2: number
}

function buildStockSuggestionsPrompt(
  boxes: BoxData[], 
  bobinas: { '1.60': { usable: number }, '1.30': { usable: number } },
  wasteData: WasteData
): string {
  const currentProduction = boxes.map(b => 
    `- ${b.name}: ${b.quantity} unidades (plancha ${b.unfoldedW}×${b.unfoldedH}mm)`
  ).join('\n')

  const wasteDetails = wasteData.cuts.map((cut, idx) => 
    `Corte #${idx + 1} (Bobina ${cut.bobina}m): 
     - Sobrante ancho: ${cut.wasteWidth}mm
     - Filas: ${cut.rows}
     - Metros lineales: ${cut.lengthM.toFixed(2)}m
     - Cajas producidas: ${cut.slots.map(s => s.boxName).join(', ')}`
  ).join('\n')

  // Cajas estándar disponibles para sugerir
  const standardBoxes = [
    { name: '20×20×10', l: 20, w: 20, h: 10, unfoldedW: 850, unfoldedH: 300 },
    { name: '20×20×20', l: 20, w: 20, h: 20, unfoldedW: 850, unfoldedH: 400 },
    { name: '30×20×15', l: 30, w: 20, h: 15, unfoldedW: 1050, unfoldedH: 350 },
    { name: '30×20×20', l: 30, w: 20, h: 20, unfoldedW: 1050, unfoldedH: 400 },
    { name: '40×30×20', l: 40, w: 30, h: 20, unfoldedW: 1450, unfoldedH: 500 },
    { name: '40×30×30', l: 40, w: 30, h: 30, unfoldedW: 1450, unfoldedH: 600 },
    { name: '50×35×35', l: 50, w: 35, h: 35, unfoldedW: 1750, unfoldedH: 700 },
    { name: '50×40×40', l: 50, w: 40, h: 40, unfoldedW: 1850, unfoldedH: 800 },
    { name: '55×45×36', l: 55, w: 45, h: 36, unfoldedW: 2050, unfoldedH: 810 },
    { name: '60×40×40', l: 60, w: 40, h: 40, unfoldedW: 2050, unfoldedH: 800 },
    { name: '70×50×50', l: 70, w: 50, h: 50, unfoldedW: 2450, unfoldedH: 1000, dobleChapeton: true }
  ]

  const standardBoxList = standardBoxes.map(b => 
    `- ${b.name}: plancha ${b.unfoldedW}×${b.unfoldedH}mm${b.dobleChapeton ? ' (doble chapetón)' : ''}`
  ).join('\n')

  return `Eres un experto en optimización de producción de cajas de cartón corrugado. 
Tu tarea es analizar el SOBRANTE de una producción combinada y sugerir qué CAJAS ESTÁNDAR podrían fabricarse para STOCK.

PRODUCCIÓN ACTUAL:
${currentProduction}

DETALLE DE SOBRANTES POR CORTE:
${wasteDetails}

MATERIAL SOBRANTE TOTAL ESTIMADO: ${wasteData.totalWasteM2.toFixed(2)} m²

CATÁLOGO DE CAJAS ESTÁNDAR DISPONIBLES:
${standardBoxList}

BOBINAS DISPONIBLES:
- Bobina 1.60m: ${bobinas['1.60'].usable}mm útiles
- Bobina 1.30m: ${bobinas['1.30'].usable}mm útiles

REGLAS IMPORTANTES:
1. El largo máximo de plancha es 2080mm
2. El alto de la caja desplegada (unfoldedH) debe caber en el sobrante de ancho de la bobina
3. LÍMITE DE STOCK: Máximo 2000 m² de material POR TIPO de caja sugerida
4. Prioriza cajas pequeñas que quepan mejor en los sobrantes
5. Calcula cuántas unidades se pueden hacer con el sobrante disponible

FÓRMULAS:
- Área por caja = (unfoldedW × unfoldedH) / 1,000,000 m²
- Cantidad máxima por tipo = min(cajas_posibles_con_sobrante, 2000 / area_por_caja)

RESPONDE EN JSON:
\`\`\`json
{
  "analysis": "Resumen del análisis del sobrante y oportunidades de stock",
  "totalWasteM2": número,
  "stockBoxes": [
    {
      "name": "20×20×10",
      "dimensions": "200x200x100mm", 
      "unfoldedW": 850,
      "unfoldedH": 300,
      "areaM2PerBox": 0.255,
      "quantity": 500,
      "totalM2": 127.5,
      "fitsInWaste": true,
      "sourceWaste": "Corte #1 - sobrante 320mm",
      "reason": "Cabe perfectamente en el sobrante de 320mm del corte #1",
      "priority": "alta"
    }
  ],
  "summary": {
    "totalStockBoxes": 1500,
    "totalStockM2": 450.5,
    "wasteUtilization": "85%",
    "boxTypes": 3
  },
  "additionalNotes": "Notas adicionales sobre la optimización"
}
\`\`\`

IMPORTANTE:
- Solo sugiere cajas cuyo unfoldedH quepa en algún sobrante de ancho
- Prioriza las cajas más pequeñas que mejor aprovechen el sobrante
- Respeta el límite de 2000 m² por tipo de caja
- Si no hay sobrante aprovechable, indícalo claramente`
}
