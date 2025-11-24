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
}

interface OptimizeRequest {
  boxes: BoxData[]
  bobinas: {
    '1.60': { usable: number }
    '1.30': { usable: number }
  }
  apiKey?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: OptimizeRequest = await request.json()
    const { boxes, bobinas } = body
    
    // Usar API key del body o de variable de entorno
    const apiKey = body.apiKey || process.env.ANTHROPIC_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key de Anthropic no configurada' },
        { status: 400 }
      )
    }

    // Construir el prompt para Claude
    const prompt = buildOptimizationPrompt(boxes, bobinas)
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
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

    // Parsear la respuesta JSON de Claude
    try {
      const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/)
      const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse
      const suggestions = JSON.parse(jsonStr)
      return NextResponse.json(suggestions)
    } catch {
      // Si no es JSON válido, devolver como texto
      return NextResponse.json({ 
        analysis: aiResponse,
        suggestions: [],
        wasteBoxes: []
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

function buildOptimizationPrompt(boxes: BoxData[], bobinas: { '1.60': { usable: number }, '1.30': { usable: number } }): string {
  const boxList = boxes.map(b => 
    `- ${b.name}: ${b.quantity} unidades, desplegado ${b.unfoldedW}×${b.unfoldedH}mm (L${b.l}×W${b.w}×H${b.h}cm)`
  ).join('\n')

  return `Eres un experto en optimización de corte de cartón corrugado para fabricación de cajas.

DATOS DE PRODUCCIÓN:
${boxList}

BOBINAS DISPONIBLES:
- Bobina 1.60m: ${bobinas['1.60'].usable}mm de ancho útil
- Bobina 1.30m: ${bobinas['1.30'].usable}mm de ancho útil

REGLAS:
1. Las cajas se cortan de planchas desplegadas
2. El "alto desplegado" (unfoldedH) va en el ANCHO de la bobina
3. El "ancho desplegado" (unfoldedW) va en el LARGO de la bobina (dirección de desenrollado)
4. La máquina permite hasta 2 largos de corte diferentes por plancha
5. Se pueden combinar diferentes tipos de cajas si sus altos desplegados suman ≤ ancho útil de la bobina

ANALIZA Y RESPONDE EN JSON:
{
  "analysis": "Resumen breve del análisis",
  "bestCombinations": [
    {
      "bobina": "1.60" o "1.30",
      "boxes": [{"name": "20×20×10", "count": 3}, {"name": "30×20×15", "count": 1}],
      "totalHeight": número en mm,
      "wastePercent": porcentaje de desperdicio,
      "reason": "Por qué esta combinación es óptima"
    }
  ],
  "suggestions": [
    {
      "type": "quantity_adjustment" | "combination" | "efficiency_tip",
      "message": "Descripción de la sugerencia",
      "impact": "Impacto estimado (ej: -15% desperdicio)"
    }
  ],
  "wasteBoxes": [
    {
      "name": "Caja sugerida con sobrante",
      "dimensions": "LxWxH en cm",
      "unfoldedH": número en mm,
      "reason": "Por qué esta caja aprovecharía el sobrante",
      "possibleUses": ["uso 1", "uso 2"]
    }
  ]
}

Sé específico con los números y práctico con las sugerencias. Si hay sobrantes significativos (>100mm), sugiere cajas pequeñas que podrían fabricarse con ese material (porta lapiceros, organizadores, cajas de regalo pequeñas, etc).`
}
