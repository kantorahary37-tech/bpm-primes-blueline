import { useEffect, useState } from 'react';
import { getCommissionConfig, createCommissionConfig, updateCommissionConfig, deleteCommissionConfig } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import { PlusIcon, CheckIcon, XCircleIcon } from '../components/Icons';

const EMPTY_FORM = { product_name: '', rate: '', objectif: '', group_name: '', active: true };

const CommissionConfigPage = () => {
  const { user } = useAuth();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // config en cours d'édition (ou null = création)
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canEdit = user?.is_admin || user?.is_dg || user?.is_drh;

  const fetchConfigs = async () => {
    try {
      const data = await getCommissionConfig(true);
      setConfigs(data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Erreur lors du chargement du barème.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (config) => {
    setEditing(config);
    setForm({
      product_name: config.product_name,
      rate: parseFloat(config.rate).toString(),
      objectif: config.objectif != null ? config.objectif.toString() : '',
      group_name: config.group_name || '',
      active: config.active,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.product_name?.trim()) { setError('Le nom du produit est obligatoire.'); return; }
    const rate = parseFloat(form.rate);
    if (isNaN(rate) || rate < 0) { setError('Le taux (Ar/vente) doit être un nombre positif.'); return; }
    const objectif = parseInt(form.objectif) || 0;
    if (objectif < 0) { setError("L'objectif doit être un entier positif."); return; }

    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateCommissionConfig(editing.id, {
          product_name: form.product_name.trim(),
          rate,
          objectif,
          group_name: form.group_name?.trim() || '',
          active: form.active,
        });
      } else {
        await createCommissionConfig({
          product_name: form.product_name.trim(),
          rate,
          objectif,
          group_name: form.group_name?.trim() || '',
          active: form.active,
        });
      }
      setShowModal(false);
      fetchConfigs();
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (config) => {
    try {
      await updateCommissionConfig(config.id, { active: !config.active });
      fetchConfigs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la modification.');
    }
  };

  const handleDelete = async (config) => {
    if (!confirm(`Supprimer "${config.product_name}" du barème ?`)) return;
    try {
      await deleteCommissionConfig(config.id);
      fetchConfigs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la suppression.');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-48"><span className="loading loading-spinner loading-md" /></div>;
  }

  const groups = {};
  configs.forEach(c => {
    const g = c.group_name || 'Sans groupe';
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Barème des Commissions</h1>
          <p className="text-sm text-gray-400">
            Produits, taux (Ar/vente) et objectifs utilisés pour le calcul des primes commission (import CSV 4D)
          </p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0 flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> Ajouter un produit
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3">{error}</div>}

      {configs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <p className="text-gray-500">Aucun produit dans le barème.</p>
          {canEdit && (
            <button onClick={openCreate} className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0 mt-3">
              Ajouter le premier produit
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2 flex items-center gap-2 border-b bg-amber-50 text-amber-800 border-amber-200">
                <span className="font-semibold text-sm">{group}</span>
                <span className="text-xs font-normal opacity-60">— {items.length} produit(s)</span>
              </div>
              <table className="table table-sm table-zebra w-full">
                <thead>
                  <tr>
                    <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Produit</th>
                    <th className="text-gray-500 font-medium text-xs uppercase tracking-wider text-right">Taux (Ar/vente)</th>
                    <th className="text-gray-500 font-medium text-xs uppercase tracking-wider text-center">Objectif</th>
                    <th className="text-gray-500 font-medium text-xs uppercase tracking-wider text-center">Actif</th>
                    <th className="w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(c => (
                    <tr key={c.id} className={!c.active ? 'opacity-50' : ''}>
                      <td className="font-medium text-gray-900">{c.product_name}</td>
                      <td className="text-right font-medium text-sm">{parseFloat(c.rate).toLocaleString('fr-FR')}</td>
                      <td className="text-center text-sm text-gray-600">{c.objectif}</td>
                      <td className="text-center">
                        {canEdit ? (
                          <button onClick={() => toggleActive(c)} title={c.active ? 'Désactiver' : 'Activer'}
                            className={`badge badge-sm border-0 cursor-pointer ${c.active ? 'badge-success' : 'badge-ghost text-gray-400'}`}>
                            {c.active ? 'Oui' : 'Non'}
                          </button>
                        ) : (
                          <span className={`badge badge-sm ${c.active ? 'badge-success' : 'badge-ghost text-gray-400'}`}>
                            {c.active ? 'Oui' : 'Non'}
                          </span>
                        )}
                      </td>
                      <td>
                        {canEdit && (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-brand-600 text-sm">Modifier</button>
                            <button onClick={() => handleDelete(c)} className="text-gray-300 hover:text-red-500 transition-colors" title="Supprimer">
                              <XCircleIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Modifier le produit' : 'Ajouter un produit'} size="md">
        <div className="space-y-3">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-base-content/70 mb-0.5">Nom du produit (doit correspondre aux colonnes du CSV)</label>
            <input type="text" value={form.product_name}
              onChange={(e) => setForm({ ...form, product_name: e.target.value })}
              placeholder="Ex : Unlimited 30"
              className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Taux (Ar/vente)</label>
              <input type="number" min="0" value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                placeholder="Ex : 40000"
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Objectif (ventes pour doubler)</label>
              <input type="number" min="0" value={form.objectif}
                onChange={(e) => setForm({ ...form, objectif: e.target.value })}
                placeholder="Ex : 4"
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-base-content/70 mb-0.5">Groupe (même objectif partagé)</label>
            <input type="text" value={form.group_name}
              onChange={(e) => setForm({ ...form, group_name: e.target.value })}
              placeholder="Ex : Unlimited"
              className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer pt-1">
            <input type="checkbox" checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="checkbox checkbox-sm border-base-300 rounded [--chkbg:theme(colors.brand.600)] checked:border-brand-600" />
            <span className="text-sm text-base-content/70">Produit actif (utilisé dans le calcul des commissions)</span>
          </label>
          <div className="flex gap-3 justify-end pt-2 border-t border-base-100">
            <button onClick={() => setShowModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
            <button onClick={handleSave} disabled={saving}
              className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0 flex items-center gap-1">
              <CheckIcon className="w-4 h-4" /> {saving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CommissionConfigPage;
