import { useEffect, useState } from 'react';
import { getPrimeMax, createPrimeMax, updatePrimeMax, deletePrimeMax, getEmployees, updateEmployee } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MoonIcon, CalendarIcon, CheckIcon, XCircleIcon, LockIcon } from '../components/Icons';
import Modal from '../components/Modal';

const ALL_TYPES = [
  { value: 'mensuel', label: 'Mensuel' },
  { value: 'astreinte', label: 'Astreinte' },
  { value: 'commission', label: 'Commission' },
  { value: 'intervention', label: 'Intervention' },
  { value: 'ponctuelle', label: 'Ponctuelle' },
  { value: 'exceptionnel', label: 'Exceptionnelle' },
];

const ASTR_DEPARTMENTS = ['BBS', 'DO', 'DSI', 'DT'];

const PlafondsPage = () => {
  const { user } = useAuth();
  const [plafonds, setPlafonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [astrEmployees, setAstrEmployees] = useState([]);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateModalDept, setRateModalDept] = useState('');
  const [rateModalValues, setRateModalValues] = useState({});
  const [rateModalInitial, setRateModalInitial] = useState([]);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [mensuelEmployees, setMensuelEmployees] = useState([]);
  const [showMensuelRateModal, setShowMensuelRateModal] = useState(false);
  const [mensuelRateModalDept, setMensuelRateModalDept] = useState('');
  const [mensuelRateModalValues, setMensuelRateModalValues] = useState({});
  const [mensuelRateModalInitial, setMensuelRateModalInitial] = useState([]);

  const fetchPlafonds = async () => {
    try {
      const data = await getPrimeMax();
      setPlafonds(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAstrEmployees = async () => {
    try {
      const all = await getEmployees();
      setAstrEmployees(all.filter(e => ASTR_DEPARTMENTS.includes(e.department)));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllEmployees = async () => {
    try {
      const all = await getEmployees();
      setMensuelEmployees(all);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPrimeMax();
        setPlafonds(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
    fetchAstrEmployees();
    fetchAllEmployees();
  }, []);

  const canEdit = (p) => user?.is_dg || user?.is_drh || p.department === user?.department;

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce plafond ?')) return;
    try {
      await deletePrimeMax(id);
      fetchPlafonds();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  const handleCellSave = async (department, type) => {
    const amount = parseFloat(editValue);
    if (isNaN(amount) || amount <= 0) { setEditingCell(null); return; }
    const existing = plafonds.find(p => p.department === department && p.bonus_type === type);
    try {
      if (existing) {
        await updatePrimeMax(existing.id, { department, bonus_type: type, amount });
      } else {
        await createPrimeMax({ department, bonus_type: type, amount });
      }
      fetchPlafonds();
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
    }
    setEditingCell(null);
  };

  const openCellEdit = (department, type) => {
    const plafond = plafonds.find(p => p.department === department && p.bonus_type === type);
    setEditingCell({ department, type });
    setEditValue(plafond ? parseFloat(plafond.amount).toString() : '');
  };

  const departments = [...new Set(plafonds.map(p => p.department))].sort();

  const openRateModal = (dept) => {
    setRateModalDept(dept);
    const values = {};
    astrEmployees.filter(e => e.department === dept).forEach(e => {
      if (e.astreinte_rate != null) values[e.id] = e.astreinte_rate.toString();
    });
    setRateModalValues(values);
    setRateModalInitial(astrEmployees.filter(e => e.department === dept && e.astreinte_rate != null).map(e => e.id));
    setShowRateModal(true);
  };

  const applyRate = async () => {
    const deptEmps = astrEmployees.filter(e => e.department === rateModalDept);
    await Promise.all(deptEmps.map(e => {
      const val = rateModalValues[e.id];
      if (val !== undefined && val !== '') {
        return updateEmployee(e.id, { astreinte_rate: parseInt(val) });
      }
      if (val !== undefined && val === '' && rateModalInitial.includes(e.id)) {
        return updateEmployee(e.id, { astreinte_rate: null });
      }
      return Promise.resolve();
    }));
    setShowRateModal(false);
    fetchAstrEmployees();
  };

  const openMensuelRateModal = (dept) => {
    setMensuelRateModalDept(dept);
    const values = {};
    mensuelEmployees.filter(e => e.department === dept).forEach(e => {
      if (e.mensuel_rate != null) values[e.id] = e.mensuel_rate.toString();
    });
    setMensuelRateModalValues(values);
    setMensuelRateModalInitial(mensuelEmployees.filter(e => e.department === dept && e.mensuel_rate != null).map(e => e.id));
    setShowMensuelRateModal(true);
  };

  const applyMensuelRate = async () => {
    const deptEmps = mensuelEmployees.filter(e => e.department === mensuelRateModalDept);
    await Promise.all(deptEmps.map(e => {
      const val = mensuelRateModalValues[e.id];
      if (val !== undefined && val !== '') {
        return updateEmployee(e.id, { mensuel_rate: parseInt(val) });
      }
      if (val !== undefined && val === '' && mensuelRateModalInitial.includes(e.id)) {
        return updateEmployee(e.id, { mensuel_rate: null });
      }
      return Promise.resolve();
    }));
    setShowMensuelRateModal(false);
    fetchAllEmployees();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-48"><span className="loading loading-spinner loading-md" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Plafonds des Primes</h1>
        <p className="text-sm text-gray-400">
          {user?.is_dg || user?.is_drh
            ? 'Accès total — cliquer un montant pour le modifier'
            : `Vous ne pouvez modifier que les plafonds de votre département (${user?.department})`}
        </p>
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 flex items-center gap-2 border-b bg-gray-50 text-gray-700 border-gray-200">
            <span className="font-semibold text-sm">Tous les plafonds</span>
            <span className="text-xs font-normal opacity-60">— {departments.length} départements</span>
          </div>
          <table className="table table-sm table-zebra w-full">
            <thead>
              <tr>
                <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Département</th>
                {ALL_TYPES.map(t => (
                  <th key={t.value} className="text-gray-500 font-medium text-xs uppercase tracking-wider">{t.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.map(dept => {
                const canEditDept = user?.is_dg || user?.is_drh || dept === user?.department;
                return (
                  <tr key={dept} className={!canEditDept ? 'opacity-50' : 'hover'}>
                    <td className="font-medium text-gray-900">{dept}</td>
                    {ALL_TYPES.map(type => {
                      const plafond = plafonds.find(p => p.department === dept && p.bonus_type === type.value);
                      const isEditing = editingCell?.department === dept && editingCell?.type === type.value;
                      const key = `${dept}-${type.value}`;
                      return (
                        <td key={key}>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input type="number" value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-20 px-2 py-1 rounded border border-gray-300 text-sm text-center focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCellSave(dept, type.value); if (e.key === 'Escape') setEditingCell(null); }}
                                autoFocus />
                              <button onClick={() => handleCellSave(dept, type.value)} className="text-green-600 hover:text-green-800 text-sm font-bold">✓</button>
                              <button onClick={() => setEditingCell(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1 group">
                              <span onClick={() => { if (canEditDept) openCellEdit(dept, type.value); }}
                                className={`${canEditDept ? 'cursor-pointer hover:bg-violet-50 px-1.5 py-0.5 rounded' : ''} inline-block transition-colors`}>
                                {plafond ? (
                                  <span className="font-medium text-sm">{parseFloat(plafond.amount).toLocaleString('fr-FR')}</span>
                                ) : (
                                  <span className="text-gray-200 italic text-sm">—</span>
                                )}
                              </span>
                              {plafond && canEditDept && (
                                <button className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all" title="Supprimer" onClick={() => handleDelete(plafond.id)}>
                                  <XCircleIcon className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(user?.is_dg || user?.is_drh) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2 flex items-center gap-2 border-b bg-violet-50 text-violet-700 border-violet-200">
              <MoonIcon className="w-4 h-4" />
              <span className="font-semibold text-sm">Astreinte — Taux spéciaux</span>
              <span className="text-xs font-normal opacity-60">— Configurer un taux personnalisé par employé</span>
            </div>
            <table className="table table-sm table-zebra w-full">
              <thead>
                <tr>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Département</th>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Employés avec taux spécial</th>
                  <th className="w-28"></th>
                </tr>
              </thead>
              <tbody>
                {ASTR_DEPARTMENTS.map((dept) => {
                  const deptEmps = astrEmployees.filter(e => e.department === dept);
                  const specials = deptEmps.filter(e => e.astreinte_rate != null);
                  return (
                    <tr key={dept}>
                      <td className="font-medium text-gray-900">{dept}</td>
                      <td className="text-sm text-gray-500">
                        {specials.length === 0
                          ? <span className="text-gray-400 italic">Aucun</span>
                          : specials.map(e => `${e.name} (${e.astreinte_rate.toLocaleString('fr-FR')} Ar)`).join(', ')
                        }
                      </td>
                      <td>
                        <button onClick={() => openRateModal(dept)}
                          className="btn btn-xs bg-violet-600 hover:bg-violet-700 text-white border-0">
                          Configurer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(user?.is_dg || user?.is_drh) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2 flex items-center gap-2 border-b bg-amber-50 text-amber-700 border-amber-200">
              <CalendarIcon className="w-4 h-4" />
              <span className="font-semibold text-sm">Mensuel — Taux spéciaux</span>
              <span className="text-xs font-normal opacity-60">— Configurer un montant personnalisé par employé</span>
            </div>
            <table className="table table-sm table-zebra w-full">
              <thead>
                <tr>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Département</th>
                  <th className="text-gray-500 font-medium text-xs uppercase tracking-wider">Employés avec taux spécial</th>
                  <th className="w-28"></th>
                </tr>
              </thead>
              <tbody>
                {[...new Set(mensuelEmployees.map(e => e.department))].sort().map((dept) => {
                  const deptEmps = mensuelEmployees.filter(e => e.department === dept);
                  const specials = deptEmps.filter(e => e.mensuel_rate != null);
                  return (
                    <tr key={dept}>
                      <td className="font-medium text-gray-900">{dept}</td>
                      <td className="text-sm text-gray-500">
                        {specials.length === 0
                          ? <span className="text-gray-400 italic">Aucun</span>
                          : specials.map(e => `${e.name} (${e.mensuel_rate.toLocaleString('fr-FR')} Ar)`).join(', ')
                        }
                      </td>
                      <td>
                        <button onClick={() => openMensuelRateModal(dept)}
                          className="btn btn-xs bg-amber-600 hover:bg-amber-700 text-white border-0">
                          Configurer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showRateModal} onClose={() => setShowRateModal(false)} title={`Taux spéciaux — ${rateModalDept}`} size="lg">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input type="number" id="bulkRate" placeholder="Taux commun"
              className="w-28 px-2 py-1 rounded border border-gray-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
            <button onClick={() => {
              const v = document.getElementById('bulkRate').value;
              if (!v) return;
              setRateModalValues(prev => {
                const next = { ...prev };
                astrEmployees.filter(e => e.department === rateModalDept).forEach(e => {
                  if (!next[e.id] || next[e.id] === '') next[e.id] = v;
                });
                return next;
              });
              document.getElementById('bulkRate').value = '';
            }} className="btn btn-xs bg-violet-100 text-violet-700 hover:bg-violet-200 border-0">Remplir les vides</button>
            <button onClick={() => {
              setRateModalValues(prev => {
                const next = { ...prev };
                astrEmployees.filter(e => e.department === rateModalDept).forEach(e => { next[e.id] = ''; });
                return next;
              });
            }} className="btn btn-xs btn-ghost text-gray-500">Tout effacer</button>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-1">
            {astrEmployees.filter(e => e.department === rateModalDept).map(emp => {
              const val = rateModalValues[emp.id];
              const hasVal = val !== undefined && val !== '';
              return (
                <div key={emp.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${hasVal ? 'bg-violet-50 border border-violet-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                  <span className="text-sm font-medium flex-1">{emp.name}</span>
                  <input type="number" value={val || ''}
                    onChange={(e) => setRateModalValues(prev => ({ ...prev, [emp.id]: e.target.value }))}
                    placeholder="Défaut"
                    className="w-24 px-2 py-1 rounded border border-gray-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500" />
                  {val === '' && emp.astreinte_rate != null &&
                    <span className="text-xs text-red-400 w-16 text-right">effacé</span>}
                  {hasVal &&
                    <span className="text-xs text-violet-600 w-16 text-right">{parseInt(val).toLocaleString('fr-FR')} Ar</span>}
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button onClick={() => setShowRateModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
            <button onClick={applyRate} className="btn btn-sm bg-violet-600 hover:bg-violet-700 text-white border-0 flex items-center gap-1 shadow-sm hover:shadow">
              <CheckIcon className="w-4 h-4" /> Appliquer
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showMensuelRateModal} onClose={() => setShowMensuelRateModal(false)} title={`Taux spéciaux Mensuel — ${mensuelRateModalDept}`} size="lg">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input type="number" id="bulkMensuelRate" placeholder="Montant commun"
              className="w-28 px-2 py-1 rounded border border-gray-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
            <button onClick={() => {
              const v = document.getElementById('bulkMensuelRate').value;
              if (!v) return;
              setMensuelRateModalValues(prev => {
                const next = { ...prev };
                mensuelEmployees.filter(e => e.department === mensuelRateModalDept).forEach(e => {
                  if (!next[e.id] || next[e.id] === '') next[e.id] = v;
                });
                return next;
              });
              document.getElementById('bulkMensuelRate').value = '';
            }} className="btn btn-xs bg-amber-100 text-amber-700 hover:bg-amber-200 border-0">Remplir les vides</button>
            <button onClick={() => {
              setMensuelRateModalValues(prev => {
                const next = { ...prev };
                mensuelEmployees.filter(e => e.department === mensuelRateModalDept).forEach(e => { next[e.id] = ''; });
                return next;
              });
            }} className="btn btn-xs btn-ghost text-gray-500">Tout effacer</button>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-1">
            {mensuelEmployees.filter(e => e.department === mensuelRateModalDept).map(emp => {
              const val = mensuelRateModalValues[emp.id];
              const hasVal = val !== undefined && val !== '';
              return (
                <div key={emp.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${hasVal ? 'bg-amber-50 border border-amber-200' : 'hover:bg-gray-50 border border-transparent'}`}>
                  <span className="text-sm font-medium flex-1">{emp.name}</span>
                  <input type="number" value={val || ''}
                    onChange={(e) => setMensuelRateModalValues(prev => ({ ...prev, [emp.id]: e.target.value }))}
                    placeholder="Défaut"
                    className="w-24 px-2 py-1 rounded border border-gray-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500" />
                  {val === '' && emp.mensuel_rate != null &&
                    <span className="text-xs text-red-400 w-16 text-right">effacé</span>}
                  {hasVal &&
                    <span className="text-xs text-amber-600 w-16 text-right">{parseInt(val).toLocaleString('fr-FR')} Ar</span>}
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button onClick={() => setShowMensuelRateModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
            <button onClick={applyMensuelRate} className="btn btn-sm bg-amber-600 hover:bg-amber-700 text-white border-0 flex items-center gap-1 shadow-sm hover:shadow">
              <CheckIcon className="w-4 h-4" /> Appliquer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlafondsPage;
