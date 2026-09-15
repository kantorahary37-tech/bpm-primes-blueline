import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { getAllOtherPrimesTypes, createOtherPrimeType, updateOtherPrimeType, deleteOtherPrimeType } from '../services/api'
import { useSystemConfig } from '../contexts/SystemConfigContext'
import { useCurrencies } from '../contexts/CurrenciesContext'
import { useAuth } from '../contexts/AuthContext'

export default function OtherPrimesConfigPage() {
  const { user } = useAuth()
  const { canSeeAmounts } = useSystemConfig()
  const { symbolFor } = useCurrencies()
  const seeAmounts = canSeeAmounts(user)
  const formCurrency = symbolFor(user?.currency)

  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ libelle: '', category: '', amount: '', active: true })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    loadTypes()
  }, [])

  const loadTypes = async () => {
    setLoading(true)
    try {
      const data = await getAllOtherPrimesTypes()
      setTypes(data)
    } catch (err) {
      toast.error('Erreur lors du chargement des types')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({ libelle: '', category: '', amount: '', active: true })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (type) => {
    setForm({
      libelle: type.libelle,
      category: type.category,
      amount: type.amount,
      active: type.active,
    })
    setEditingId(type.id)
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.libelle.trim() || !form.category.trim() || !form.amount) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    setSaving(true)
    try {
      const payload = {
        libelle: form.libelle.trim(),
        category: form.category.trim(),
        amount: parseFloat(form.amount),
        active: form.active,
      }
      if (editingId) {
        await updateOtherPrimeType(editingId, payload)
        toast.success('Type modifié avec succès')
      } else {
        await createOtherPrimeType(payload)
        toast.success('Type ajouté avec succès')
      }
      resetForm()
      await loadTypes()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteOtherPrimeType(id)
      toast.success('Type supprimé')
      setDeletingId(null)
      await loadTypes()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la suppression')
    }
  }

  const handleToggleActive = async (type) => {
    try {
      await updateOtherPrimeType(type.id, { active: !type.active })
      await loadTypes()
    } catch (err) {
      toast.error('Erreur lors de la mise à jour')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Types d'autres primes</h2>
          <p className="text-sm text-gray-400">Gérer les types de primes avec montants fixes pour le formulaire mensuel</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="btn btn-sm bg-amber-600 hover:bg-amber-700 text-white border-0"
        >
          + Ajouter un type
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card-blueline p-4 mb-4 border-l-4 border-l-amber-500 bg-amber-50/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 text-sm">
              {editingId ? 'Modifier le type' : 'Ajouter un type'}
            </h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Libellé *</label>
                <input
                  type="text"
                  value={form.libelle}
                  onChange={(e) => setForm({ ...form, libelle: e.target.value })}
                  placeholder="ex: Prime d'installation"
                  className="w-full px-2 py-1.5 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Catégorie / Variant *</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="ex: wireless, vsat 1.2 m"
                  className="w-full px-2 py-1.5 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Montant fixe ({formCurrency}) *</label>
                <input
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="ex: 10000"
                  className="w-full px-2 py-1.5 rounded border border-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-sm"
                />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="checkbox checkbox-sm checkbox-amber"
                  />
                  <span className="text-sm text-gray-700">Actif</span>
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-sm bg-amber-600 hover:bg-amber-700 text-white border-0 ml-auto"
                >
                  {saving ? <span className="loading loading-spinner loading-xs" /> : editingId ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Types List */}
      {types.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Aucun type configuré. Ajoutez des types d'autres primes.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs">ID</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs">Libellé</th>
                <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs">Catégorie</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600 text-xs">Montant</th>
                <th className="text-center py-2 px-3 font-medium text-gray-600 text-xs">Statut</th>
                <th className="text-right py-2 px-3 font-medium text-gray-600 text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((type) => (
                <tr key={type.id} className={`border-b border-gray-200 ${!type.active ? 'opacity-50' : ''}`}>
                  <td className="py-2 px-3 text-gray-500 text-xs">{type.id}</td>
                  <td className="py-2 px-3 text-gray-900 font-medium">{type.libelle}</td>
                  <td className="py-2 px-3 text-gray-600">
                    <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                      {type.category}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-brand-600">
                    {seeAmounts ? `${parseFloat(type.amount).toLocaleString('fr-FR')} ${formCurrency}` : '••••••'}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <button
                      onClick={() => handleToggleActive(type)}
                      className={`badge badge-sm ${type.active ? 'badge-success' : 'badge-ghost'}`}
                    >
                      {type.active ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEdit(type)}
                        className="btn btn-xs btn-ghost text-blue-600 hover:text-blue-800"
                      >
                        Modifier
                      </button>
                      {deletingId === type.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(type.id)}
                            className="btn btn-xs bg-red-500 hover:bg-red-600 text-white border-0"
                          >
                            Confirmer
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="btn btn-xs btn-ghost"
                          >
                            Annuler
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setDeletingId(type.id)}
                          className="btn btn-xs btn-ghost text-red-500 hover:text-red-700"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
        <p className="text-xs text-blue-700">
          <strong>Note :</strong> Ces types apparaissent dans la liste de sélection « Autres primes » du formulaire de prime mensuelle.
          Le montant est automatiquement appliqué et bloqué lors de la sélection.
          Seuls les types « Actifs » sont visibles dans le formulaire.
        </p>
      </div>
    </div>
  )
}
