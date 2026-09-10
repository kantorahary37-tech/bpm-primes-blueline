import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getServices, createService, renameService, deleteService, assignEmployees, unassignEmployee, getEmployees } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments } from '../contexts/DepartmentsContext';
import { ArrowLeftIcon, PlusIcon, TrashIcon, EditIcon, CheckIcon, XCircleIcon, ChevronDownIcon, SearchIcon } from '../components/Icons';

const ChevronRightIcon = (p) => <svg {...p} className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>;

const CAN_MANAGE = ['is_admin', 'is_dg', 'is_drh', 'is_directeur', 'is_validator_n1'];
const FULL_SCOPE = ['is_admin', 'is_dg', 'is_drh'];

const ServicesPage = () => {
  const { user } = useAuth();
  const { departments } = useDepartments();
  const [services, setServices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [dept, setDept] = useState('');
  const [expanded, setExpanded] = useState({});
  const [assignSel, setAssignSel] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [assignSearch, setAssignSearch] = useState({});

  const isFullScope = FULL_SCOPE.some(r => user?.[r]);
  const visibleDepts = useMemo(() =>
    departments.map(d => d.name).filter(d => isFullScope || d === user?.department),
    [departments, isFullScope, user?.department]
  );

  const load = async () => {
    try {
      const [s, e] = await Promise.all([getServices(), getEmployees()]);
      setServices(s);
      setEmployees(e);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!dept && visibleDepts.length) setDept(user?.department && visibleDepts.includes(user.department) ? user.department : visibleDepts[0]);
  }, [visibleDepts, dept, user?.department]);

  const canManage = CAN_MANAGE.some(r => user?.[r]);

  const groupsByDept = useMemo(() => {
    const groups = {};
    for (const s of services) {
      if (!groups[s.department]) groups[s.department] = [];
      groups[s.department].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [services]);

  const membersOf = (group) =>
    employees.filter(e => e.department === group.department && (e.service ?? null) === group.name);

  const availableFor = (group) =>
    employees.filter(e => e.department === group.department && !e.service);

  const filteredAvailable = (group, q) => {
    const base = availableFor(group);
    const term = (q || '').trim().toLowerCase();
    if (!term) return base;
    return base.filter(emp =>
      (emp.name || '').toLowerCase().includes(term) ||
      (emp.matricule || '').toLowerCase().includes(term)
    );
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !dept) return;
    try {
      await createService({ name: name.trim(), department: dept });
      toast.success(`Service « ${name.trim()} » créé.`);
      setName('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const handleDelete = async (group) => {
    if (!confirm(`Supprimer le service « ${group.name} » ? Les employés affectés ne seront plus assignés.`)) return;
    try {
      await deleteService(group.id);
      toast.success(`Service « ${group.name} » supprimé.`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  const handleRename = async (group) => {
    if (!renameValue.trim()) return;
    try {
      await renameService(group.id, renameValue.trim());
      toast.success('Service renommé.');
      setRenaming(null);
      setRenameValue('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors du renommage');
    }
  };

  const handleAssign = async (group) => {
    const ids = assignSel[group.id] || [];
    if (!ids.length) return;
    try {
      await assignEmployees(group.id, ids);
      toast.success(`${ids.length} employé(s) affecté(s).`);
      setAssignSel({ ...assignSel, [group.id]: [] });
      setAssignSearch({ ...assignSearch, [group.id]: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erreur lors de l'affectation");
    }
  };

  const handleUnassign = async (group, empId) => {
    try {
      await unassignEmployee(group.id, empId);
      toast.success('Employé retiré du service.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors du retrait');
    }
  };

  const toggleGroup = (group) => {
    const next = !expanded[group.id];
    setExpanded({ ...expanded, [group.id]: next });
  };

  if (loading) {
    return <div className="flex justify-center items-center h-48"><span className="loading loading-spinner loading-md" /></div>;
  }

  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
        <p className="text-sm text-gray-600">Vous n'avez pas les droits pour gérer les services.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link to="/" className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Services des employés</h1>
          <p className="text-sm text-gray-400">
            Affectez chaque employé d'un département à un service pour faciliter la validation des primes.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5">
        <div className="px-4 py-3 border-b bg-gray-50 border-gray-200">
          <span className="font-semibold text-sm text-gray-700 flex items-center gap-2"><PlusIcon className="w-4 h-4" /> Créer un service</span>
        </div>
        <form onSubmit={handleCreate} className="p-4 flex flex-wrap items-end gap-3">
          <label className="form-control w-64">
            <span className="label-text text-xs text-gray-500 mb-1">Nom du service</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Agences, Back-office..."
              className="input input-bordered input-sm w-full"
            />
          </label>
          <label className="form-control w-64">
            <span className="label-text text-xs text-gray-500 mb-1">Département</span>
<select value={dept} onChange={(e) => setDept(e.target.value)} className="select select-bordered select-sm w-full">
              {visibleDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!name.trim() || !dept} className="btn btn-sm btn-primary">
            Créer le service
          </button>
        </form>
      </div>

      {groupsByDept.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">Aucun service pour le moment.</div>
      ) : (
        <div className="space-y-4">
          {groupsByDept.map(([department, groups]) => (
            <div key={department} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{department}</span>
                <span className="text-xs text-gray-400">— {groups.length} service{groups.length > 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {groups.map(group => {
                  const isOpen = !!expanded[group.id];
                  const members = membersOf(group);
                  const available = availableFor(group);
                  const sel = assignSel[group.id] || [];
                  return (
                    <div key={group.id}>
                      <div className="px-4 py-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group)}
                          className="flex items-center gap-2 font-medium text-gray-900 hover:text-blue-700"
                        >
                          {isOpen ? <ChevronDownIcon className="w-4 h-4 text-gray-400" /> : <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
                          {group.name}
                        </button>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{group.employee_count} employé{group.employee_count > 1 ? 's' : ''}</span>
                        {renaming === group.id ? (
                          <div className="flex items-center gap-1 ml-2">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              className="input input-bordered input-xs w-40"
                              autoFocus
                            />
                            <button onClick={() => handleRename(group)} className="btn btn-xs btn-primary"><CheckIcon className="w-3 h-3" /></button>
                            <button onClick={() => { setRenaming(null); setRenameValue(''); }} className="btn btn-xs"><XCircleIcon className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <div className="ml-auto flex items-center gap-1">
                            <button
                              onClick={() => { setRenaming(group.id); setRenameValue(group.name); }}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Renommer"
                            >
                              <EditIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(group)}
                              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Supprimer"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      {isOpen && (
                        <div className="px-4 pb-4 bg-gray-50/50">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 mt-1">Membres</p>
                          {members.length === 0 ? (
                            <p className="text-xs text-gray-400 mb-3">Aucun employé affecté.</p>
                          ) : (
                            <ul className="mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {members.map(emp => (
                                <li key={emp.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-800 truncate">{emp.name}</p>
                                    <p className="text-[11px] text-gray-400 font-mono">{emp.matricule}{emp.poste ? ` · ${emp.poste}` : ''}</p>
                                  </div>
                                  <button
                                    onClick={() => handleUnassign(group, emp.id)}
                                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Retirer du service"
                                  >
                                    <XCircleIcon className="w-4 h-4" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="border-t border-gray-200 pt-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Affecter des employés</p>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="relative flex-1 max-w-md">
                                <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                <input
                                  type="text"
                                  value={assignSearch[group.id] || ''}
                                  onChange={(e) => setAssignSearch({ ...assignSearch, [group.id]: e.target.value })}
                                  placeholder="Rechercher par matricule ou nom..."
                                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                                />
                              </div>
                              <button
                                onClick={() => handleAssign(group)}
                                disabled={sel.length === 0}
                                className="btn btn-xs btn-primary"
                              >
                                Affecter ({sel.length})
                              </button>
                            </div>

                            {(() => {
                              const candidates = filteredAvailable(group, assignSearch[group.id] || '');
                              const searching = (assignSearch[group.id] || '').trim().length > 0;
                              if (candidates.length === 0) {
                                return (
                                  <p className="text-xs text-gray-400">
                                    {searching ? 'Aucun employé trouvé dans ce département pour cette recherche.' : 'Aucun employé disponible à affecter.'}
                                  </p>
                                );
                              }
                              return (
                                <div className="flex flex-wrap gap-2">
                                  {candidates.map(emp => (
                                    <label
                                      key={`avail-${emp.id}`}
                                      className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer hover:border-blue-300"
                                      title={`${emp.matricule}${emp.poste ? ` – ${emp.poste}` : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        className="checkbox checkbox-xs rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600"
                                        checked={sel.includes(emp.id)}
                                        onChange={(ev) => {
                                          const next = ev.target.checked ? [...sel, emp.id] : sel.filter(x => x !== emp.id);
                                          setAssignSel({ ...assignSel, [group.id]: next });
                                        }}
                                      />
                                      <span className="text-gray-700 truncate max-w-[150px]">{emp.name}</span>
                                      <span className="text-[10px] font-mono text-gray-400">{emp.matricule}{emp.poste ? ` · ${emp.poste}` : ''}</span>
                                    </label>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>

                          <div className="border-t border-gray-200 pt-3">
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServicesPage;