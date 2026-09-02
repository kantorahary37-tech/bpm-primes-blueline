import { useEffect, useState, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { getEmployees, getBonuses, createEmployee, updateEmployee, getUsers, adminLdapSyncEmployees, getCurrencies, createCurrency, deleteCurrency } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import { useDepartments } from '../contexts/DepartmentsContext';
import { useCurrencies } from '../contexts/CurrenciesContext';
import { Link } from 'react-router-dom';
import { PlusIcon, EyeIcon, CalendarIcon, MoonIcon, ChartIcon, ClipboardIcon, XMarkIcon, DownloadIcon, SearchIcon } from '../components/Icons';
import Modal from '../components/Modal';

const typeIcons = {
  mensuel: CalendarIcon,
  astreinte: MoonIcon,
  commission: ChartIcon,
};

const typeLabels = {
  mensuel: 'Mensuelle',
  astreinte: 'Astreinte',
  commission: 'Commission',
};

const statusLabel = (bonus) => {
  if (!bonus) return '';
  if (bonus.status === 'En attente Directeur') return `En attente Directeur ${bonus.employee?.department || ''}`;
  return bonus.status;
};

const getBadgeClass = (status) => {
  const map = {
    'Initialisé': 'bg-orange-100 text-orange-700',
    'En attente Directeur': 'bg-purple-100 text-purple-700',
    'En attente DG': 'bg-amber-100 text-amber-700',
    'Prime validée': 'bg-emerald-100 text-emerald-700',
    'Prime rejetée': 'bg-red-100 text-red-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
};

const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({length: 5}, (_, i) => currentYear - 2 + i);

const EXPORT_EMPLOYEE_COLUMNS = ["Matricule", "Nom", "Departement", "Manager", "Devise", "DateCreation"];
const EXPORT_EMP_BONUS_COLUMNS = ["Matricule", "Nom", "Departement", "TypePrime", "DateDebut", "DateFin", "Montant", "Statut", "DejaRejete", "CreePar", "DateCreation"];

const Employees = () => {
  const { user } = useAuth();
  const { canSeeAmounts } = useSystemConfig();
  const seeAmounts = canSeeAmounts(user);
  const { departments } = useDepartments();
  const deptNames = departments.map(d => d.name);
  const { currencies, refresh: refreshCurrencies, symbolFor } = useCurrencies();
  const currencyOptions = currencies.map(c => ({ value: c.code, label: c.label ? `${c.label} (${c.symbol || c.code})` : (c.symbol || c.code) }));
  const canManageCurrencies = user?.is_admin || user?.is_dg || user?.is_drh;
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ matricule: '', name: '', department: deptNames[0] || '', manager_id: '', currency: 'Ar' });
  const [managers, setManagers] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [empBonuses, setEmpBonuses] = useState([]);
  const [bonusesLoading, setBonusesLoading] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [bonusTypeFilter, setBonusTypeFilter] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [bonusStatusFilter, setBonusStatusFilter] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportColumns, setExportColumns] = useState(EXPORT_EMPLOYEE_COLUMNS);
  const [showEmpBonusExportModal, setShowEmpBonusExportModal] = useState(false);
  const [empBonusExportColumns, setEmpBonusExportColumns] = useState(EXPORT_EMP_BONUS_COLUMNS);
  const [syncing, setSyncing] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [editForm, setEditForm] = useState({ currency: 'Ar', astreinte_rate: '', mensuel_rate: '' });
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [currencyForm, setCurrencyForm] = useState({ code: '', symbol: '', label: '' });
  const [allCurrencies, setAllCurrencies] = useState([]);
  const [currencySaving, setCurrencySaving] = useState(false);

  const initRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (!initRef.current && user.department && !departmentFilter) {
      initRef.current = true;
      setDepartmentFilter(user.department);
      return;
    }
    initRef.current = true;
    const fetchData = async () => {
      try {
        const [emps, users] = await Promise.all([
          departmentFilter ? getEmployees(departmentFilter) : getEmployees(),
          getUsers(),
        ]);
        setEmployees(emps);
        setManagers(Array.isArray(users) ? users : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [departmentFilter, user]);

  const handleLdapSync = async () => {
    setSyncing(true);
    try {
      const result = await adminLdapSyncEmployees();
      if (result.success) {
        const emps = departmentFilter ? await getEmployees(departmentFilter) : await getEmployees();
        setEmployees(emps);
        toast.success('Synchronisation LDAP des employés terminée');
      } else {
        toast.error('Erreur lors de la synchronisation LDAP');
      }
    } catch {
      toast.error('Erreur de connexion lors de la synchronisation');
    } finally {
      setSyncing(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(emp =>
      (emp.name || '').toLowerCase().includes(q) ||
      (emp.matricule || '').toLowerCase().includes(q)
    );
  }, [employees, searchQuery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await createEmployee({ ...form, manager_id: parseInt(form.manager_id) });
      setShowForm(false);
      setForm({ matricule: '', name: '', department: deptNames[0] || '', manager_id: '', currency: 'Ar' });
      const emps = await getEmployees();
      setEmployees(emps);
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const loadEmployeeBonuses = async (emp) => {
    setSelectedEmp(emp);
    setBonusTypeFilter('');
    setFilterMonth('');
    setFilterYear('');
    setBonusStatusFilter('');
    if (!user?.is_admin && !user?.is_dg && !user?.is_drh && user?.department && emp.department !== user.department) {
      setEmpBonuses([]);
      setBonusesLoading(false);
      return;
    }
    setBonusesLoading(true);
    try {
      const data = await getBonuses(null, emp.id);
      setEmpBonuses(data);
    } catch (err) {
      console.error(err);
    } finally {
      setBonusesLoading(false);
    }
  };

  const saveEmployeeProfile = async () => {
    if (!editEmp) return;
    try {
      await updateEmployee(editEmp.id, {
        currency: editForm.currency,
        astreinte_rate: editForm.astreinte_rate !== '' ? parseInt(editForm.astreinte_rate) : null,
        mensuel_rate: editForm.mensuel_rate !== '' ? parseInt(editForm.mensuel_rate) : null,
      });
      const emps = departmentFilter ? await getEmployees(departmentFilter) : await getEmployees();
      setEmployees(emps);
      setSelectedEmp((prev) => prev && prev.id === editEmp.id ? { ...prev, ...editForm } : prev);
      setEditEmp(null);
      toast.success('Profil mis à jour');
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors de la mise à jour');
    }
  };

  const openCurrencyModal = async () => {
    setShowCurrencyModal(true);
    setCurrencyForm({ code: '', symbol: '', label: '' });
    try {
      const all = await getCurrencies(false);
      setAllCurrencies(Array.isArray(all) ? all : []);
    } catch (err) {
      setAllCurrencies(currencies || []);
    }
  };

  const addNewCurrency = async () => {
    const code = currencyForm.code?.trim();
    if (!code) { toast.error('Le code de la devise est obligatoire'); return; }
    setCurrencySaving(true);
    try {
      await createCurrency({ ...currencyForm, code });
      toast.success(`Devise ${code.toUpperCase()} ajoutée`);
      await refreshCurrencies();
      setCurrencyForm({ code: '', symbol: '', label: '' });
      const all = await getCurrencies(false);
      setAllCurrencies(Array.isArray(all) ? all : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de l\'ajout de la devise');
    } finally {
      setCurrencySaving(false);
    }
  };

  const deleteExistingCurrency = async (code) => {
    if (!window.confirm(`Supprimer la devise « ${code} » ?`)) return;
    try {
      await deleteCurrency(code);
      toast.success(`Devise ${code} supprimée`);
      await refreshCurrencies();
      const all = await getCurrencies(false);
      setAllCurrencies(Array.isArray(all) ? all : []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><span className="loading loading-spinner loading-lg" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Employés</h1>
        <div className="flex items-center gap-2">
        {user?.is_admin && (
          <button onClick={handleLdapSync} disabled={syncing} className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 btn-sm flex items-center gap-1.5">
            {syncing ? <span className="loading loading-spinner loading-xs"></span> : null}
            Sync LDAP
          </button>
        )}
        <button onClick={() => setShowForm(true)} className="btn bg-blue-600 hover:bg-blue-700 text-white border-0 btn-sm flex items-center gap-1.5">
          <PlusIcon className="w-4 h-4" /> Nouvel employé
        </button>
        {canManageCurrencies && (
          <button onClick={openCurrencyModal} className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 btn-sm flex items-center gap-1.5" title="Ajouter ou supprimer des devises">
            Gérer les devises
          </button>
        )}
        <button onClick={() => {
          setExportColumns(EXPORT_EMPLOYEE_COLUMNS)
          setShowExportModal(true)
        }} className="btn bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 btn-sm flex items-center gap-1.5" title="Exporter les employés">
          <DownloadIcon className="w-4 h-4" /> Exporter
        </button>
        </div>
      </div>

      {showForm && (
        <div className="card bg-white border border-gray-200 shadow-sm mb-6">
          <div className="card-body p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Nouvel employé</h3>
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
              <div className="form-control">
                <label className="label"><span className="label-text">Matricule</span></label>
                <input type="text" className="input input-bordered input-sm w-32" value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} required />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Nom</span></label>
                <input type="text" className="input input-bordered input-sm w-48" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Département</span></label>
                <select className="select select-bordered select-sm w-44" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required>
                  {deptNames.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Manager</span></label>
                <select className="select select-bordered select-sm w-44" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })} required>
                  <option value="">Sélectionner...</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Devise</span></label>
                <select className="select select-bordered select-sm w-36" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} required>
                  {currencyOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Créer</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        {user?.is_admin || user?.is_dg || user?.is_drh ? (
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
            <option value="">Tous les départements</option>
            {user?.department && <option value={user.department}>Mon département ({user.department})</option>}
            {deptNames.filter(d => d !== user?.department).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-gray-600">Département : <strong>{user?.department}</strong></span>
        )}
        <span className="text-xs text-gray-400">{filteredEmployees.length} employé(s)</span>
        <div className="relative ml-auto">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher nom / matricule..."
            className="w-64 pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="space-y-6 mb-6">
        {filteredEmployees.length === 0 ? (
          <div className="text-center text-gray-400 py-12">Aucun employé</div>
        ) : (
          (() => {
            const grouped = {};
            filteredEmployees.forEach(emp => {
              if (!grouped[emp.department]) grouped[emp.department] = [];
              grouped[emp.department].push(emp);
            });
            return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([dept, emps]) => (
              <div key={dept}>
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-t-xl border border-gray-200 border-b-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{dept}</span>
                  <span className="text-[10px] font-medium text-gray-400 bg-white px-1.5 py-0.5 rounded-full">{emps.length}</span>
                </div>
                <div className="space-y-1 p-2 bg-white rounded-b-xl border border-gray-200">
                  {emps.map((emp) => {
                    const mgr = managers.find((m) => m.id === emp.manager_id);
                    return (
                      <button key={emp.id} onClick={() => loadEmployeeBonuses(emp)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                          selectedEmp?.id === emp.id
                            ? 'border-blue-400 bg-blue-50 shadow-sm'
                            : 'border-transparent hover:border-blue-200 hover:bg-gray-50'
                        }`}>
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-xs shrink-0">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{emp.name}</p>
                          <p className="text-[11px] text-gray-400">{emp.matricule}</p>
                        </div>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${emp.currency === 'EUR' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                          {symbolFor(emp.currency)}
                        </span>
                        <div className="text-right text-[11px]">
                          <div className="text-gray-400">Manager</div>
                          <div className="font-medium text-gray-700">{mgr?.name || 'N/A'}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ));
          })()
        )}
      </div>

      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]" onClick={() => setSelectedEmp(null)}>
          <div className="fixed inset-0 bg-black/40" />
          <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-xl max-h-[78vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <ClipboardIcon className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900 text-sm">Primes de {selectedEmp.name}</h3>
              </div>
              <div className="flex items-center gap-1">
                {(user?.is_admin || user?.is_dg || user?.is_drh) && selectedEmp && (
                  <button onClick={() => {
                    setEditEmp(selectedEmp);
                    setEditForm({
                      currency: selectedEmp.currency || 'Ar',
                      astreinte_rate: selectedEmp.astreinte_rate != null ? String(selectedEmp.astreinte_rate) : '',
                      mensuel_rate: selectedEmp.mensuel_rate != null ? String(selectedEmp.mensuel_rate) : '',
                    });
                  }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600" title="Modifier le profil (devise)">
                    Modifier profil
                  </button>
                )}
                <button onClick={() => {
                  setEmpBonusExportColumns(EXPORT_EMP_BONUS_COLUMNS)
                  setShowEmpBonusExportModal(true)
                }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Exporter">
                  <DownloadIcon className="w-4 h-4" />
                </button>
                <button onClick={() => setSelectedEmp(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <>
              {!bonusesLoading && empBonuses.length > 0 && (
                <div className="px-4 pt-3 pb-2.5 border-b border-gray-100 space-y-2 shrink-0">
                  <select value={bonusTypeFilter} onChange={(e) => setBonusTypeFilter(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                    <option value="">Tous les types</option>
                    <option value="mensuel">Mensuelle</option>
                    <option value="astreinte">Astreinte</option>
                    <option value="commission">Commission</option>
                  </select>
                  <div className="flex gap-2">
                    <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                      <option value="">Mois</option>
                      {MONTHS.map((name, i) => (
                        <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{name}</option>
                      ))}
                    </select>
                    <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                      <option value="">Année</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={bonusStatusFilter} onChange={(e) => setBonusStatusFilter(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500">
                      <option value="">Tous les statuts</option>
                      <option value="Initialisé">Initialisé</option>
                      <option value="En attente Directeur">En attente Directeur</option>
                      <option value="En attente DG">En attente DG</option>
                      <option value="Prime validée">Validée</option>
                      <option value="Prime rejetée">Rejetée</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto">
                {bonusesLoading ? (
                  <div className="flex justify-center py-8"><span className="loading loading-spinner loading-sm" /></div>
                  ) : !user?.is_admin && !user?.is_dg && !user?.is_drh && selectedEmp.department !== user?.department ? (
                  <p className="text-center text-gray-400 py-6 text-sm">Vous ne pouvez voir que les primes des employés de votre département</p>
                ) : empBonuses.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">Aucune prime pour cet employé</p>
                ) : (
                  (() => {
                    const filtered = empBonuses.filter(b => {
                      if (bonusTypeFilter && b.bonus_type !== bonusTypeFilter) return false
                      if (filterYear) {
                        const ym = b.start_date ? b.start_date.slice(0, 4) : ''
                        if (filterMonth) {
                          const full = b.start_date ? b.start_date.slice(0, 7) : ''
                          if (full !== `${filterYear}-${filterMonth}`) return false
                        } else if (ym !== filterYear) return false
                      }
                      if (bonusStatusFilter === 'Prime rejetée') { if (!b.was_rejected) return false; }
                      else if (bonusStatusFilter && b.status !== bonusStatusFilter) return false
                      return true
                    })
                    if (filtered.length === 0) {
                      return <p className="text-center text-gray-400 py-6 text-sm">Aucune prime ne correspond aux filtres</p>
                    }
                    const groups = {}
                    filtered.forEach(b => {
                      const ym = b.start_date ? b.start_date.slice(0, 7) : 'inconnu'
                      if (!groups[ym]) groups[ym] = []
                      groups[ym].push(b)
                    })
                    const sortedMonths = Object.keys(groups).sort().reverse()
                    return sortedMonths.flatMap(ym => {
                      const [y, m] = ym.split('-')
                      const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                      return [
                        <div key={ym} className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{monthName}</div>,
                        ...groups[ym].map(bonus => (
                          <Link key={bonus.id} to={`/bonuses/${bonus.id}`}
                            className="flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 transition-all">
                            <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 text-[11px] font-bold">
                              {bonus.bonus_type === 'mensuel' ? 'M' : bonus.bonus_type === 'astreinte' ? 'A' : bonus.bonus_type === 'commission' ? 'C' : '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{typeLabels[bonus.bonus_type] || bonus.bonus_type}</p>
                              <p className="text-[11px] text-gray-400">{bonus.start_date && bonus.end_date ? `${formatDate(bonus.start_date)} → ${formatDate(bonus.end_date)}` : '—'}</p>
                            </div>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${getBadgeClass(bonus.status)} ${bonus.was_rejected ? 'ring-1 ring-red-400' : ''}`}>
                              {statusLabel(bonus)}
                            </span>
                            <span className="text-xs font-semibold text-blue-600 shrink-0">{seeAmounts ? `${bonus.total_amount} ${symbolFor(selectedEmp.currency)}` : '••••••'}</span>
                          </Link>
                        )),
                        <div key={`${ym}-sep`} className="border-b border-gray-50 mx-3 last:border-0" />
                      ]
                    })
                  })()
                )}
              </div>
            </>
          </div>
        </div>
      )}

      <Modal open={!!editEmp} onClose={() => setEditEmp(null)} title={`Profil — ${editEmp?.name || ''}`} size="sm">
        <div className="space-y-4">
          <div className="form-control">
            <label className="label"><span className="label-text">Devise / Profil de l'employé</span></label>
            <select className="select select-bordered w-full" value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}>
              {currencyOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <span className="text-[11px] text-gray-400 mt-1">Ar = Ariary par défaut, EUR = Euro pour les employés étrangers, ou toute devise définie par l'admin / le DG / la DRH.</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label"><span className="label-text">Taux astreinte ({editForm.currency || 'Ar'})</span></label>
              <input type="number" className="input input-bordered input-sm" value={editForm.astreinte_rate}
                onChange={(e) => setEditForm({ ...editForm, astreinte_rate: e.target.value })} placeholder="Défaut" />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Prime mensuelle ({editForm.currency || 'Ar'})</span></label>
              <input type="number" className="input input-bordered input-sm" value={editForm.mensuel_rate}
                onChange={(e) => setEditForm({ ...editForm, mensuel_rate: e.target.value })} placeholder="Défaut" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={() => setEditEmp(null)} className="btn btn-sm btn-ghost">Annuler</button>
            <button onClick={saveEmployeeProfile} className="btn btn-sm bg-indigo-600 hover:bg-indigo-700 text-white border-0">Enregistrer</button>
          </div>
        </div>
      </Modal>

      <Modal open={showCurrencyModal} onClose={() => setShowCurrencyModal(false)} title="Gérer les devises" size="sm">
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">Ajouter une devise</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="form-control">
                <label className="label"><span className="label-text text-[11px]">Code</span></label>
                <input className="input input-bordered input-sm" placeholder="USD" value={currencyForm.code}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, code: e.target.value.toUpperCase() })} />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text text-[11px]">Symbole</span></label>
                <input className="input input-bordered input-sm" placeholder="$" value={currencyForm.symbol}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })} />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text text-[11px]">Libellé</span></label>
                <input className="input input-bordered input-sm" placeholder="Dollar" value={currencyForm.label}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, label: e.target.value })} />
              </div>
            </div>
            <button onClick={addNewCurrency} disabled={currencySaving} className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0 w-full">
              {currencySaving ? <span className="loading loading-spinner loading-xs"></span> : '+'} Ajouter la devise
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Devises existantes</p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {allCurrencies.map((c) => (
                <div key={c.code} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-gray-800">{c.code}</span>
                    <span className="text-gray-400 text-xs">({c.symbol || c.code})</span>
                    {c.label && <span className="text-gray-500 text-xs">{c.label}</span>}
                    {c.is_system && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Système</span>}
                    {!c.active && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  <button onClick={() => deleteExistingCurrency(c.code)} disabled={c.is_system}
                    title={c.is_system ? 'Devise système, non supprimable' : 'Supprimer'}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {allCurrencies.length === 0 && <p className="text-xs text-gray-400">Aucune devise définie.</p>}
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title="Exporter les employés" size="sm">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Colonnes à inclure :</p>
            <div className="flex gap-3">
              <button onClick={() => setExportColumns([...EXPORT_EMPLOYEE_COLUMNS])} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Tout</button>
              <button onClick={() => setExportColumns([])} className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">Aucun</button>
            </div>
          </div>
          <div className="space-y-2">
            {EXPORT_EMPLOYEE_COLUMNS.map(col => {
              const selected = exportColumns.includes(col)
              return (
                <label key={col} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  selected ? 'border-blue-300 bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" checked={selected} onChange={() => {
                    setExportColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
                  }} className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600" />
                  <span className={`text-sm ${selected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{col}</span>
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{exportColumns.length} / {EXPORT_EMPLOYEE_COLUMNS.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setShowExportModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                const p = new URLSearchParams()
                if (departmentFilter) p.set('department', departmentFilter)
                p.set('columns', exportColumns.join(','))
                const token = localStorage.getItem('token')
                fetch(`/api/v1/employees/export?${p.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.blob())
                  .then(blob => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `export_employes_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                    setShowExportModal(false)
                  })
              }} className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Exporter</button>
            </div>
          </div>
        </div>
      </Modal>
      <Modal open={showEmpBonusExportModal} onClose={() => setShowEmpBonusExportModal(false)} title="Exporter les primes" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Colonnes à inclure :</p>
            <div className="flex gap-3">
              <button onClick={() => setEmpBonusExportColumns([...EXPORT_EMP_BONUS_COLUMNS])} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Tout</button>
              <button onClick={() => setEmpBonusExportColumns([])} className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">Aucun</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_EMP_BONUS_COLUMNS.map(col => {
              const selected = empBonusExportColumns.includes(col)
              return (
                <label key={col} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                  selected ? 'border-blue-300 bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" checked={selected} onChange={() => {
                    setEmpBonusExportColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
                  }} className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600" />
                  <span className={`text-sm ${selected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{col}</span>
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">{empBonusExportColumns.length} / {EXPORT_EMP_BONUS_COLUMNS.length}</span>
            <div className="flex gap-2">
              <button onClick={() => setShowEmpBonusExportModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                const p = new URLSearchParams({ employee_id: selectedEmp.id })
                if (bonusTypeFilter) p.set('bonus_type', bonusTypeFilter)
                if (bonusStatusFilter === 'Prime rejetée') p.set('was_rejected', 'true')
                else if (bonusStatusFilter) p.set('status', bonusStatusFilter)
                if (filterYear) {
                  if (filterMonth) {
                    const lastDay = new Date(parseInt(filterYear), parseInt(filterMonth), 0).getDate()
                    p.set('start_date', `${filterYear}-${filterMonth}-01`)
                    p.set('end_date', `${filterYear}-${filterMonth}-${String(lastDay).padStart(2, '0')}`)
                  } else {
                    p.set('start_date', `${filterYear}-01-01`)
                    p.set('end_date', `${filterYear}-12-31`)
                  }
                }
                p.set('columns', empBonusExportColumns.join(','))
                const token = localStorage.getItem('token')
                fetch(`/api/v1/bonuses/export?${p.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.blob())
                  .then(blob => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `export_${selectedEmp.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                    setShowEmpBonusExportModal(false)
                  })
              }} className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Exporter</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Employees;
