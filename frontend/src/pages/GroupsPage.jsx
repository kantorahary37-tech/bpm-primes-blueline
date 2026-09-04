import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments } from '../contexts/DepartmentsContext';
import Modal from '../components/Modal';
import {
  getGroups, getAllGroups, createGroup, updateGroup, deleteGroup,
  getDirectorAssignments, assignDirectorToGroup, unassignDirectorFromGroup,
  getAllDirectorScopes,
  assignEmployeeToGroup, changeEmployeeDepartment,
} from '../services/api';
import { getEmployees, getUsers } from '../services/api';
import {
  PlusIcon, EditIcon, TrashIcon, CheckIcon, XCircleIcon,
  UsersIcon, ChevronDownIcon, SearchIcon,
} from '../components/Icons';

// ═══════════════════════════════════════════════════════════════════════════
// GroupsPage
// ═══════════════════════════════════════════════════════════════════════════
export default function GroupsPage() {
  const { user } = useAuth();
  const { departments } = useDepartments();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('groups');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [filterDept, setFilterDept] = useState(
    (user && (user.is_directeur || user.is_validator_n1) && !user.is_admin && !user.is_dg && !user.is_drh)
      ? user.department
      : ''
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAllGroups(filterDept || undefined);
      setGroups(data);
    } catch {
      toast.error('Erreur lors du chargement des équipes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterDept]);

  const isDirectorOrN1 = (user?.is_directeur || user?.is_validator_n1) && !user?.is_admin && !user?.is_dg && !user?.is_drh;
  const visibleDepts = isDirectorOrN1
    ? departments.filter(d => d.name === user?.department)
    : departments;

  useEffect(() => {
    if (isDirectorOrN1 && user?.department) {
      setFilterDept(user.department);
    }
  }, [isDirectorOrN1, user?.department]);

  const canManageDirectors = user?.is_admin || (user?.is_directeur && !user?.is_validator_n1 && !user?.is_dg && !user?.is_drh);
  const tabs = [
    { key: 'groups', label: 'Équipes', icon: UsersIcon },
    { key: 'employees', label: 'Assignation employés', icon: UsersIcon },
    ...(canManageDirectors ? [
      { key: 'directors', label: 'Directeurs ↔ Équipes', icon: UsersIcon },
      { key: 'scope', label: 'Vue directeur', icon: UsersIcon },
    ] : []),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Équipes / Sous-départements</h1>
          <p className="text-sm text-gray-400">
            Gérer les équipes, assigner les employés et les directeurs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="select select-bordered select-sm"
          >
            <option value="">Tous les départements</option>
            {visibleDepts.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
          {(user?.is_admin || user?.is_directeur || user?.is_validator_n1) && (
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm flex items-center gap-1.5">
              <PlusIcon className="w-4 h-4" />
              Nouvelle équipe
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'groups' && (
        <GroupsList groups={groups} loading={loading} departments={departments} onRefresh={load}
          onEdit={setEditingGroup} user={user} />
      )}
      {activeTab === 'employees' && (
        <EmployeeGroupAssignment groups={groups} departments={departments} onRefresh={load} />
      )}
      {activeTab === 'directors' && (
        <DirectorGroupAssignment groups={groups} departments={departments} onRefresh={load} />
      )}
      {activeTab === 'scope' && (
        <DirectorScopeView groups={groups} />
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <GroupCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); load(); }}
          departments={visibleDepts}
        />
      )}
      {editingGroup && (
        <GroupEditModal
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={() => { setEditingGroup(null); load(); }}
        />
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// GroupsList
// ═══════════════════════════════════════════════════════════════════════════
function GroupsList({ groups, loading, departments, onRefresh, onEdit, user }) {
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async (group) => {
    if (!confirm(`Supprimer l'équipe "${group.name}" ? Les employés seront désassignés.`)) return;
    setDeleting(group.id);
    try {
      await deleteGroup(group.id);
      toast.success('Équipe supprimée');
      onRefresh();
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  // Group by department
  const grouped = {};
  groups.forEach(g => {
    if (!grouped[g.department]) grouped[g.department] = [];
    grouped[g.department].push(g);
  });

  return (
    <div className="space-y-6">
      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <UsersIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Aucune équipe trouvée. Créez une équipe ou synchronisez depuis LDAP.</p>
        </div>
      )}
      {Object.entries(grouped).map(([dept, deptGroups]) => (
        <div key={dept} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-800 text-sm">{dept}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {deptGroups.map(g => (
              <div key={g.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                    {g.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{g.name}</p>
                    <p className="text-xs text-gray-400">
                      {g.employee_count || 0} employé(s) · {g.director_count || 0} directeur(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!g.active && (
                    <span className="badge badge-ghost badge-sm text-gray-400">Inactif</span>
                  )}
                  {(user?.is_admin || ((user?.is_directeur || user?.is_validator_n1) && g.department === user?.department)) && (
                    <>
                      <button onClick={() => onEdit(g)} className="btn btn-ghost btn-xs text-gray-400 hover:text-blue-600">
                        <EditIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(g)} disabled={deleting === g.id}
                        className="btn btn-ghost btn-xs text-gray-400 hover:text-red-600">
                        {deleting === g.id ? <span className="loading loading-spinner loading-xs"></span> : <TrashIcon className="w-4 h-4" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// EmployeeGroupAssignment
// ═══════════════════════════════════════════════════════════════════════════
function EmployeeGroupAssignment({ groups, departments, onRefresh }) {
  const { user } = useAuth();
  const isDirN1 = (user?.is_directeur || user?.is_validator_n1) && !user?.is_admin && !user?.is_dg && !user?.is_drh;
  const visibleDepts = isDirN1 ? departments.filter(d => d.name === user?.department) : departments;
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState(null);

  useEffect(() => {
    if (isDirN1 && user?.department && !filterDept) {
      setFilterDept(user.department);
    }
  }, [isDirN1, user?.department]);

  useEffect(() => {
    const loadEmp = async () => {
      setLoading(true);
      try {
        const data = await getEmployees(filterDept || undefined);
        setEmployees(data);
      } catch {
        toast.error('Erreur chargement employés');
      } finally {
        setLoading(false);
      }
    };
    loadEmp();
  }, [filterDept]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
      if (filterGroup) {
        const gid = parseInt(filterGroup);
        if (filterGroup === 'none') {
          if (e.group_id) return false;
        } else if (e.group_id !== gid) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return e.name.toLowerCase().includes(q) || e.matricule.toLowerCase().includes(q);
      }
      return true;
    });
  }, [employees, filterGroup, search]);

  const handleAssign = async (empId, groupId) => {
    setAssigning(empId);
    try {
      await assignEmployeeToGroup(empId, groupId || null);
      setEmployees(prev => prev.map(e =>
        e.id === empId ? { ...e, group_id: groupId || null } : e
      ));
      toast.success(groupId ? "Employé assigné à l'équipe" : 'Assignation retirée');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setAssigning(null);
    }
  };

  const handleDeptChange = async (empId, newDept) => {
    setAssigning(empId);
    try {
      await changeEmployeeDepartment(empId, newDept);
      // Re-fetch employees to get updated data
      const data = await getEmployees(filterDept || undefined);
      setEmployees(data);
      toast.success('Département changé');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setAssigning(null);
    }
  };

  const deptGroups = isDirN1
    ? groups
    : (filterDept ? groups.filter(g => g.department === filterDept) : groups);

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
          className="select select-bordered select-sm">
          <option value="">Tous les départements</option>
          {visibleDepts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
          className="select select-bordered select-sm">
          <option value="">Toutes les équipes</option>
          <option value="none">Sans équipe</option>
          {deptGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.department})</option>)}
        </select>
        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Rechercher..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="input input-bordered input-sm pl-9 w-60"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="table table-sm w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500">Matricule</th>
              <th className="text-left text-xs font-semibold text-gray-500">Nom</th>
              <th className="text-left text-xs font-semibold text-gray-500">Département</th>
              <th className="text-left text-xs font-semibold text-gray-500">Équipe actuelle</th>
              <th className="text-left text-xs font-semibold text-gray-500">Assigner</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-4"><span className="loading loading-spinner loading-sm"></span></td></tr>
            ) : filteredEmployees.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-4 text-gray-400">Aucun employé trouvé</td></tr>
            ) : filteredEmployees.map(emp => {
              const empGroup = groups.find(g => g.id === emp.group_id);
              const empDeptGroups = isDirN1 ? groups : groups.filter(g => g.department === emp.department);
              return (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="font-mono text-xs">{emp.matricule}</td>
                  <td className="text-sm font-medium">{emp.name}</td>
                  <td>
                    <select
                      value={emp.department || ''}
                      onChange={(e) => handleDeptChange(emp.id, e.target.value)}
                      disabled={assigning === emp.id}
                      className="select select-bordered select-xs"
                    >
                      {visibleDepts.map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {empGroup ? (
                      <span className="badge badge-primary badge-sm">{empGroup.name}</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={emp.group_id || ''}
                      onChange={(e) => handleAssign(emp.id, e.target.value ? parseInt(e.target.value) : null)}
                      disabled={assigning === emp.id}
                      className="select select-bordered select-xs"
                    >
                      <option value="">Aucun</option>
                      {empDeptGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// DirectorGroupAssignment
// ═══════════════════════════════════════════════════════════════════════════
function DirectorGroupAssignment({ groups, departments, onRefresh }) {
  const { user } = useAuth();
  const isDirN1 = (user?.is_directeur || user?.is_validator_n1) && !user?.is_admin && !user?.is_dg && !user?.is_drh;
  const visibleDepts = isDirN1 ? departments.filter(d => d.name === user?.department) : departments;
  const [directors, setDirectors] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDirector, setSelectedDirector] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (isDirN1 && user?.department && !filterDept) {
      setFilterDept(user.department);
    }
  }, [isDirN1, user?.department]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [users, asgns] = await Promise.all([
          getUsers(),
          getDirectorAssignments(filterDept || undefined),
        ]);
        setDirectors(users.filter(u => u.is_directeur && !u.is_admin));
        setAssignments(asgns);
      } catch {
        toast.error('Erreur chargement');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filterDept]);

  const handleAssign = async () => {
    if (!selectedDirector || !selectedGroup) {
      toast.error('Sélectionnez un directeur et une équipe');
      return;
    }
    setAssigning(true);
    try {
      await assignDirectorToGroup(parseInt(selectedDirector), parseInt(selectedGroup));
      toast.success("Directeur assigné à l'équipe");
      const asgns = await getDirectorAssignments(filterDept || undefined);
      setAssignments(asgns);
      setSelectedDirector('');
      setSelectedGroup('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (directorId, groupId) => {
    try {
      await unassignDirectorFromGroup(directorId, groupId);
      toast.success('Assignation retirée');
      setAssignments(prev => prev.filter(a => !(a.director_id === directorId && a.group_id === groupId)));
    } catch {
      toast.error('Erreur');
    }
  };

  // Group assignments by director
  const byDirector = {};
  assignments.forEach(a => {
    if (!byDirector[a.director_id]) byDirector[a.director_id] = { name: a.director_name, groups: [] };
    byDirector[a.director_id].groups.push(a);
  });

  return (
    <div>
      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
          className="select select-bordered select-sm">
          <option value="">Tous les départements</option>
          {visibleDepts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
      </div>

      {/* Assignment form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h3 className="font-semibold text-gray-800 text-sm mb-3">Assigner un directeur à une équipe</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 mb-1 block">Directeur</label>
            <select value={selectedDirector} onChange={(e) => setSelectedDirector(e.target.value)}
              className="select select-bordered select-sm w-full">
              <option value="">Choisir un directeur...</option>
              {directors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.department || '—'})</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 mb-1 block">Équipe</label>
            <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}
              className="select select-bordered select-sm w-full">
              <option value="">Choisir une équipe...</option>
              {groups.filter(g => g.active).map(g => (
                <option key={g.id} value={g.id}>{g.name} ({g.department})</option>
              ))}
            </select>
          </div>
          <button onClick={handleAssign} disabled={assigning || !selectedDirector || !selectedGroup}
            className="btn btn-primary btn-sm flex items-center gap-1.5">
            {assigning ? <span className="loading loading-spinner loading-xs"></span> : <PlusIcon className="w-4 h-4" />}
            Assigner
          </button>
        </div>
      </div>

      {/* Current assignments */}
      {loading ? (
        <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>
      ) : Object.keys(byDirector).length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>Aucune assignation directeur ↔ équipe trouvée.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byDirector).map(([dirId, info]) => (
            <div key={dirId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-purple-50 border-b border-gray-200 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-semibold text-sm">
                  {info.name?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-semibold text-purple-900 text-sm">{info.name}</p>
                  <p className="text-xs text-purple-500">{info.groups.length} équipe(s) assignée(s)</p>
                </div>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {info.groups.map(a => (
                  <div key={a.group_id} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5">
                    <span className="text-sm font-medium text-blue-800">{a.group_name}</span>
                    <span className="text-xs text-blue-400">({a.department})</span>
                    <button onClick={() => handleUnassign(a.director_id, a.group_id)}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      <XCircleIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// DirectorScopeView — visual map of what each director can validate
// ═══════════════════════════════════════════════════════════════════════════
let mermaidIdCounter = 0;

function DirectorScopeView({ groups }) {
  const [scopes, setScopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const diagramRef = useRef(null);
  const [diagramId] = useState(() => `mermaid-diag-${++mermaidIdCounter}`);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getAllDirectorScopes();
        setScopes(data);
      } catch {
        toast.error('Erreur chargement');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Build the mermaid definition and render it
  const renderDiagram = useCallback(async () => {
    if (!diagramRef.current || scopes.length === 0) return;

    const lines = ['graph LR'];

    scopes.forEach((scope, si) => {
      const dirNode = `DIR_${si}`;
      lines.push(`    ${dirNode}["👤 ${scope.director_name}"]`);
      lines.push(`    style ${dirNode} fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#6b21a8`);

      scope.groups.forEach((g, gi) => {
        const groupNode = `GRP_${si}_${gi}`;
        lines.push(`    ${groupNode}["📁 ${g.group_name}<br/>${g.department}<br/>${g.employee_count} employé(s)"]`);
        lines.push(`    ${dirNode} -->|valide| ${groupNode}`);
        lines.push(`    style ${groupNode} fill:#dbeafe,stroke:#2563eb,stroke-width:1px,color:#1e40af`);
      });

      if (scope.groups.length === 0) {
        const emptyNode = `EMPTY_${si}`;
        lines.push(`    ${emptyNode}["⚠️ Aucune équipe assignée"]`);
        lines.push(`    ${dirNode} --> ${emptyNode}`);
        lines.push(`    style ${emptyNode} fill:#fef3c7,stroke:#d97706,stroke-width:1px,color:#92400e`);
      }
    });

    const code = lines.join('\n');
    try {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: '#dbeafe',
          primaryBorderColor: '#2563eb',
          lineColor: '#94a3b8',
          fontSize: '13px',
        },
        flowchart: { curve: 'basis', padding: 15 },
      });
      const { svg } = await mermaid.render(diagramId, code);
      if (diagramRef.current) {
        diagramRef.current.innerHTML = svg;
      }
    } catch (err) {
      console.error('Mermaid render error:', err);
      if (diagramRef.current) {
        diagramRef.current.innerHTML = `<pre class="text-xs text-gray-600 font-mono">${code}</pre>`;
      }
    }
  }, [scopes, diagramId]);

  useEffect(() => {
    if (!loading && scopes.length > 0) {
      renderDiagram();
    }
  }, [loading, scopes, renderDiagram]);

  if (loading) {
    return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>;
  }

  if (scopes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>Aucun directeur trouvé. Configurez les directeurs et assignez-leur des équipes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Text summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scopes.map(scope => (
          <div key={scope.director_id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                {scope.director_name?.charAt(0) || '?'}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{scope.director_name}</p>
                <p className="text-xs text-gray-400">{scope.total_employees} employé(s) sous sa responsabilité</p>
              </div>
            </div>
            <div className="space-y-2">
              {scope.groups.length === 0 ? (
                <p className="text-sm text-orange-500">⚠️ Aucune équipe assignée</p>
              ) : scope.groups.map((g, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{g.group_name}</p>
                    <p className="text-xs text-gray-400">{g.department}</p>
                  </div>
                  <span className="badge badge-primary badge-sm">{g.employee_count} emp.</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mermaid diagram rendered as SVG */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-4">📐 Diagramme de validation — Vue Directeur</h3>
        <div className="bg-gray-50 rounded-lg p-6 overflow-x-auto">
          <div ref={diagramRef} className="flex justify-center" />
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// GroupCreateModal
// ═══════════════════════════════════════════════════════════════════════════
function GroupCreateModal({ onClose, onCreated, departments }) {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !department) {
      toast.error('Nom et département requis');
      return;
    }
    setSaving(true);
    try {
      await createGroup({ name: name.trim(), department, active: true });
      toast.success('Équipe créée');
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Nouvelle équipe" size="sm">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Nom de l'équipe</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="input input-bordered w-full" placeholder="Ex: Bureau commercial" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Département</label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)}
            className="select select-bordered w-full">
            <option value="">Choisir un département...</option>
            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? <span className="loading loading-spinner loading-xs"></span> : 'Créer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// GroupEditModal
// ═══════════════════════════════════════════════════════════════════════════
function GroupEditModal({ group, onClose, onSaved }) {
  const [name, setName] = useState(group.name);
  const [active, setActive] = useState(group.active);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    setSaving(true);
    try {
      await updateGroup(group.id, { name: name.trim(), active });
      toast.success('Équipe mise à jour');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Modifier "${group.name}"`} size="sm">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Nom de l'équipe</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="input input-bordered w-full" />
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
              className="checkbox checkbox-sm" />
            <span className="text-sm text-gray-700">Actif</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? <span className="loading loading-spinner loading-xs"></span> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
