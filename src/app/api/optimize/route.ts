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
  mode?: 'analyze' | 'chat'
  chatHistory?: ChatMessage[]
  userMessage?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: OptimizeRequest = await request.json()
    const { boxes, bobinas, mode = 'analyze', chatHistory = [], userMessage } = body
    
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
