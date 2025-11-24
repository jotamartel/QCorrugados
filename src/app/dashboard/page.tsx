'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Loader2, Box, AlertCircle, RefreshCw } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading, isAdmin, signOut } = useAuth()
  const [timeout, setTimeout_] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Timeout de 5 segundos
    const timer = setTimeout(() => {
      if (!profile && user) {
        setTimeout_(true)
        setError('No se pudo cargar tu perfil. Puede que no exista en la base de datos.')
      }
    }, 5000)

    return () => clearTimeout(timer)
  }, [profile, user])

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login')
      } else if (profile) {
        // Redirigir según el rol
        if (isAdmin) {
          router.push('/admin')
        } else {
          router.push('/cliente')
        }
      }
    }
  }, [user, profile, loading, isAdmin, router])

  const handleRetry = () => {
    window.location.reload()
  }

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  if (timeout) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error al cargar</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500 mb-6">
            Usuario: {user?.email}
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 px-4 rounded-lg font-medium flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium"
            >
              Cerrar sesión
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Si el problema persiste, contacta al administrador para verificar que tu perfil exista en la base de datos.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-600 rounded-2xl mb-4 shadow-lg animate-pulse">
          <Box className="w-8 h-8 text-white" />
        </div>
        <div className="flex items-center justify-center gap-2 text-amber-800">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Cargando...</span>
        </div>
      </div>
    </div>
  )
}
