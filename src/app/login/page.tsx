'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Box, LogIn, UserPlus, Loader2, Mail, Lock, User, Building2, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, signUp } = useAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    companyName: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await signIn(formData.email, formData.password)
        if (error) {
          setError(error.message === 'Invalid login credentials' 
            ? 'Credenciales inválidas. Verificá tu email y contraseña.'
            : error.message)
        } else {
          router.push('/dashboard')
        }
      } else {
        if (!formData.fullName) {
          setError('El nombre es requerido')
          setLoading(false)
          return
        }
        if (formData.password.length < 6) {
          setError('La contraseña debe tener al menos 6 caracteres')
          setLoading(false)
          return
        }
        
        const { error } = await signUp(
          formData.email, 
          formData.password, 
          formData.fullName,
          formData.companyName
        )
        
        if (error) {
          if (error.message.includes('already registered')) {
            setError('Este email ya está registrado. Intentá iniciar sesión.')
          } else {
            setError(error.message)
          }
        } else {
          setSuccess('¡Registro exitoso! Revisá tu email para confirmar tu cuenta.')
          setFormData({ email: '', password: '', fullName: '', companyName: '' })
        }
      }
    } catch (err) {
      setError('Error inesperado. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-600 rounded-2xl mb-4 shadow-lg">
            <Box className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-amber-900">Q Corrugados</h1>
          <p className="text-amber-600 mt-1">Sistema de Gestión de Producción</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-amber-100 p-8">
          {/* Tabs */}
          <div className="flex mb-6 bg-amber-50 rounded-lg p-1">
            <button
              onClick={() => { setIsLogin(true); setError(''); setSuccess('') }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2
                ${isLogin ? 'bg-white shadow text-amber-900' : 'text-amber-600 hover:text-amber-800'}`}
            >
              <LogIn className="w-4 h-4" />
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(''); setSuccess('') }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2
                ${!isLogin ? 'bg-white shadow text-amber-900' : 'text-amber-600 hover:text-amber-800'}`}
            >
              <UserPlus className="w-4 h-4" />
              Registrarse
            </button>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre completo *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      placeholder="Juan Pérez"
                      required={!isLogin}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Empresa (opcional)
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      placeholder="Mi Empresa S.A."
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder="tu@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  placeholder={isLogin ? '••••••••' : 'Mínimo 6 caracteres'}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isLogin ? 'Iniciando...' : 'Registrando...'}
                </>
              ) : (
                <>
                  {isLogin ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
                </>
              )}
            </button>
          </form>

          {/* Info para clientes */}
          {!isLogin && (
            <p className="mt-4 text-xs text-gray-500 text-center">
              Al registrarte podrás realizar pedidos de cajas y consultar el estado de tus órdenes.
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-amber-600 text-sm mt-6">
          © 2024 Q Corrugados
        </p>
      </div>
    </div>
  )
}
