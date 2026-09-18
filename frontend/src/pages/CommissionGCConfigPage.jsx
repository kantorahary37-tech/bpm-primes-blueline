import { useEffect, useState } from 'react';
import { getCommissionGCConfig, createCommissionGCConfig, updateCommissionGCConfig, deleteCommissionGCConfig } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import { PlusIcon, CheckIcon, XCircleIcon } from '../components/Icons';

const EMPTY_FORM = {
  mrc_objective: '',
  fms_objective: '',
  commission_at_100: '',
  max_commission: '1 000 000',
  active: true,
};

const parseAr = (val) => {
  if (val === undefined || val === null) return NaN;
  const cleaned = String(val).replace(/[^\d.,-]/g, '').replace(/,/g, '.');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
  return parseFloat(cleaned);
};

const fmtArInput = (val) => {
  const num = parseAr(val);
  if (isNaN(num)) return String(val ?? '');
  const formatted = num.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  return formatted.replace(/[\u202f\u00a0]/g, ' ');
};

const CommissionGCConfigPage = () => {
  const { user } = useAuth();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Édition permise pour Admin, DG, DRH et Directeur de la Direction Commerciale
  const canEdit = user?.is_admin || user?.is_dg || user?.is_drh || (
    user?.is_directeur && user?.department === 'Direction Commerciale'
  );
  const fmtAr = (n) => (parseFloat(n) || 0).toLocaleString('fr-FR');

  const fetchConfigs = async () => {
    try {
      const data = await getCommissionGCConfig(true);
      setConfigs(data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Erreur lors du chargement des configurations.');
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

  const handleAmountChange = (key) => (e) => setForm({ ...form, [key]: fmtArInput(e.target.value) });

  const openEdit = (config) => {
    setEditing(config);
    setForm({
      mrc_objective: fmtArInput(config.mrc_objective),
      fms_objective: fmtArInput(config.fms_objective),
      commission_at_100: fmtArInput(config.commission_at_100),
      max_commission: fmtArInput(config.max_commission ?? 1000000),
      active: config.active,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    const mrc = parseAr(form.mrc_objective);
    const fms = parseAr(form.fms_objective);
    const at100 = parseAr(form.commission_at_100);
    const max = parseAr(form.max_commission);
    if (isNaN(mrc) || mrc <= 0) { setError('L\'objectif MRC doit être un nombre positif.'); return; }
    if (isNaN(fms) || fms <= 0) { setError('L\'objectif FMS doit être un nombre positif.'); return; }
    if (isNaN(at100) || at100 <= 0) { setError('La commission à 100% doit être un nombre positif.'); return; }
    if (isNaN(max) || max <= 0) { setError('Le plafond max doit être un nombre positif.'); return; }

    const payload = {
      mrc_objective: mrc,
      fms_objective: fms,
      commission_at_100: at100,
      max_commission: max,
      active: form.active,
    };

    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateCommissionGCConfig(editing.id, payload);
      } else {
        await createCommissionGCConfig(payload);
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
      await updateCommissionGCConfig(config.id, { active: !config.active });
      fetchConfigs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la modification.');
    }
  };

  const handleDelete = async (config) => {
    if (!confirm('Supprimer cette configuration ?')) return;
    try {
      await deleteCommissionGCConfig(config.id);
      fetchConfigs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la suppression.');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-48"><span className="loading loading-spinner loading-md" /></div>;
  }

  const sorted = [...configs].sort((a, b) => b.id - a.id);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Prime Commission Entreprise / Grand Compte
            <span className="relative inline-block group/calcmode">
              <span className="flex items-center justify-center w-5 h-5 rounded-full border border-brand-600 text-brand-600 text-[11px] font-semibold cursor-help">i</span>
              <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-7 z-30 w-80 max-w-[85vw] opacity-0 invisible group-hover/calcmode:opacity-100 group-hover/calcmode:visible transition-opacity">
                <span className="block rounded-xl border border-base-300 bg-base-100 shadow-xl p-3.5 text-[11px] text-base-content/70 text-left space-y-1.5">
                  <p className="font-medium text-base-content/90">Mode de calcul de la commission</p>
                  <p>• MRC% = MRC réalisé ÷ objectif MRC</p>
                  <p>• FMS% = (FMS réalisé ÷ 12) ÷ objectif FMS</p>
                  <p>• Commission = commission@100% × (MRC% + FMS%)</p>
                  <p>• Total plafonné à max_commission (arrondi à 2 déc.)</p>
                  <p>• Les objectifs sont globaux, sans période</p>
                </span>
              </span>
            </span>
          </h1>
          <p className="text-sm text-gray-400">
            Objectifs MRC / FMS et commission versée à 100% de l'objectif — utilisés lors de l'import CSV grand compte
          </p>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="btn bg-brand-600 hover:bg-brand-700 text-white border-0 flex items-center gap-2">
            <PlusIcon className="w-4 h-4" /> Ajouter une configuration
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-3 mb-3">{error}</div>}

      {!canEdit && (
        <div className="bg-base-100 border border-base-200 rounded-lg px-4 py-3 text-sm text-base-content/60 mb-3">
          Vous êtes en lecture seule.
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center">
          <p className="text-gray-500">Aucune configuration grand compte. Le calcul nécessite objectifs (MRC, FMS) et commission@100%.</p>
          {canEdit && (
            <button onClick={openCreate} className="btn btn-sm bg-brand-600 hover:bg-brand-700 text-white border-0 mt-3">
              Ajouter la première configuration
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((c) => (
            <div key={c.id} className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${!c.active ? 'opacity-70' : ''}`}>
              <div className="px-4 py-2 flex items-center justify-between gap-2 border-b bg-base-100/60">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Configuration globale (sans période)</span>
                  {canEdit && (
                    <button onClick={() => toggleActive(c)} title={c.active ? 'Désactiver' : 'Activer'}
                      className={`badge badge-sm border-0 cursor-pointer ${c.active ? 'badge-success' : 'badge-ghost text-gray-400'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </button>
                  )}
                  {!c.active && <span className="badge badge-ghost badge-sm text-gray-400">Inactive</span>}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-brand-600 text-sm">Modifier</button>
                    <button onClick={() => handleDelete(c)} className="text-gray-300 hover:text-red-500 transition-colors" title="Supprimer">
                      <XCircleIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-4 py-3">
                <div>
                  <p className="text-xs text-gray-400">Objectif MRC (Ar)</p>
                  <p className="font-semibold text-gray-900">{fmtAr(c.mrc_objective)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Objectif FMS (Ar)</p>
                  <p className="font-semibold text-gray-900">{fmtAr(c.fms_objective)}</p>
                  <p className="text-[10px] text-gray-400">réalisé ÷ 12 avant comparaison</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Commission à 100% (Ar)</p>
                  <p className="font-semibold text-brand-600">{fmtAr(c.commission_at_100)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Plafond max (Ar)</p>
                  <p className="font-semibold text-gray-900">{fmtAr(c.max_commission)}</p>
                </div>
                <div className="md:text-right">
                  <p className="text-xs text-gray-400">Formules</p>
                  <p className="text-[11px] text-gray-600">MRC % = réalisé / objectif</p>
                  <p className="text-[11px] text-gray-600">FMS % = (÷12) / objectif</p>
                </div>
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
            <p className="font-medium mb-0.5">Utilisation</p>
            <p>La configuration active est utilisée pour <strong>toutes</strong> les périodes de calcul — il n'y a pas de période dans cette configuration.</p>
          </div>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Modifier la configuration' : 'Ajouter une configuration'} size="md">
        <div className="space-y-3">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Objectif MRC (Ar)</label>
              <input type="text" inputMode="numeric" value={form.mrc_objective}
                onChange={handleAmountChange('mrc_objective')}
                placeholder="Ex : 5 000 000"
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Objectif FMS (Ar)</label>
              <input type="text" inputMode="numeric" value={form.fms_objective}
                onChange={handleAmountChange('fms_objective')}
                placeholder="Ex : 5 000 000"
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Commission à 100% (Ar)</label>
              <input type="text" inputMode="numeric" value={form.commission_at_100}
                onChange={handleAmountChange('commission_at_100')}
                placeholder="Ex : 1 000 000"
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-base-content/70 mb-0.5">Plafond max (Ar)</label>
              <input type="text" inputMode="numeric" value={form.max_commission}
                onChange={handleAmountChange('max_commission')}
                placeholder="Ex : 1 000 000"
                className="w-full px-3 py-2 rounded-lg border border-base-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
            </div>
          </div>
          <div className="rounded-lg bg-base-100 border border-base-200 px-3 py-2 text-[11px] text-base-content/60">
            <p className="font-medium text-base-content/80 mb-0.5">Règles appliquées (fichier « Mode de calcul commision Grand compte.xlsx »)</p>
            <p>MRC % = MRC réalisé ÷ objectif MRC</p>
            <p>FMS % = (FMS réalisé ÷ 12) ÷ objectif FMS</p>
            <p>Commission = commission@100% × % ; le total est plafonné à max_commission.</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer pt-1">
            <input type="checkbox" checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="checkbox checkbox-sm border-base-300 rounded [--chkbg:theme(colors.brand.600)] checked:border-brand-600" />
            <span className="text-sm text-base-content/70">Configuration active (utilisée dans le calcul)</span>
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

export default CommissionGCConfigPage;