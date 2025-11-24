# Sistema de Gestión de Producción de Cajas

Sistema para optimizar el corte de bobinas de cartón y planificar la producción de cajas.

## Medidas Calculadas

Todas las medidas desplegadas fueron calculadas con la fórmula RSC (Regular Slotted Container):
- **Ancho desplegado** = 2L + 2W + 50mm (solapa de pegue)
- **Alto desplegado** = H + W (solapas superiores/inferiores + cuerpo)

| Caja | L×W×H (cm) | Desplegado (mm) | Cajas/fila 1.60m | Cajas/fila 1.30m |
|------|------------|-----------------|------------------|------------------|
| 20×20×10 | 20×20×10 | 850 × 300 | 5 (1.3% desp.) | 4 (2.4% desp.) |
| 20×20×20 | 20×20×20 | 850 × 400 | 3 (21.1% desp.) | 3 (2.4% desp.) |
| 30×20×15 | 30×20×15 | 1050 × 350 | 4 (7.9% desp.) | 3 (14.6% desp.) |
| 30×20×20 | 30×20×20 | 1050 × 400 | 3 (21.1% desp.) | 3 (2.4% desp.) |
| 40×30×20 | 40×30×20 | 1450 × 500 | 3 (1.3% desp.) | 2 (18.7% desp.) |
| 40×30×30 | 40×30×30 | 1450 × 600 | 2 (21.1% desp.) | 2 (2.4% desp.) |
| 50×40×30 | 50×40×30 | 1850 × 700 | 2 (7.9% desp.) | 1 (43.1% desp.) |
| 50×40×40 | 50×40×40 | 1850 × 800 | 1 (47.4% desp.) | 1 (35.0% desp.) |
| 60×40×30 | 60×40×30 | 2050 × 700 | 2 (7.9% desp.) | 1 (43.1% desp.) |
| 60×40×40 | 60×40×40 | 2050 × 800 | 1 (47.4% desp.) | 1 (35.0% desp.) |
| 70×50×50 | 70×50×50 | 2450 × 1000 | 1 (34.2% desp.) | 1 (18.7% desp.) |

## Bobinas

| Bobina | Ancho Total | Refilado | Ancho Útil |
|--------|-------------|----------|------------|
| 1.60m | 1600mm | 80mm (40mm/lado) | 1520mm |
| 1.30m | 1300mm | 70mm (35mm/lado) | 1230mm |

> Nota: El refilado mínimo es 2cm por lado = 4cm total, pero en la bobina 1.30m queda 7cm.

## Desplegar en Vercel

### Opción 1: Desde la interfaz web

1. Subí este proyecto a un repositorio en GitHub
2. Andá a [vercel.com](https://vercel.com)
3. Click en "Add New Project"
4. Importá el repositorio
5. Vercel detectará Next.js automáticamente
6. Click en "Deploy"

### Opción 2: Usando Vercel CLI

```bash
# Instalar Vercel CLI
npm install -g vercel

# Loguearte
vercel login

# Desplegar (desde el directorio del proyecto)
cd cajas-produccion
vercel --prod
```

## Desarrollo Local

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Funcionalidades

1. **Catálogo de Cajas**: Vista de todas las cajas con visualización del desplegado y métricas de aprovechamiento
2. **Orden de Producción**: Agregá cantidades de cada tipo de caja para producir
3. **Optimización**: El sistema calcula automáticamente la mejor bobina para cada caja y muestra los metros lineales necesarios

## Stack Técnico

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Lucide React (iconos)
