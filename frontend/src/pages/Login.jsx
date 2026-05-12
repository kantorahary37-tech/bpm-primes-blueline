import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch {
      setError('Email ou mot de passe incorrect')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100 p-4">
      <div className="w-full max-w-md animate-fadeIn">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-brand-200">
            B
          </div>
          <h1 className="text-2xl font-bold text-base-content">BPM Primes</h1>
          <p className="text-sm text-base-content/50 mt-1">Connectez-vous à votre espace</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-base-300/50 p-8">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
              <span>⚠️</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-base-300 bg-white text-base-content placeholder-base-content/30 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                placeholder="vous@blueline.mg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-1.5">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-base-300 bg-white text-base-content placeholder-base-content/30 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base-content/30 hover:text-base-content/60"
                >
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors shadow-lg shadow-brand-200"
            >
              Se connecter
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center text-sm">
            <Link to="/forgot-password" className="text-brand-600 hover:text-brand-700 font-medium">
              Mot de passe oublié ?
            </Link>
            <p className="text-base-content/40">
              Pas encore de compte ?{' '}
              <Link to="/signup" className="text-brand-600 hover:text-brand-700 font-medium">S'inscrire</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
