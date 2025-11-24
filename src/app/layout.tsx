import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gestión de Producción de Cajas',
  description: 'Sistema de optimización de corte de bobinas para cajas de cartón',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
