'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Loader2, Box } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading, isAdmin } = useAuth()

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
