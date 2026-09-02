import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDepartments } from '../contexts/DepartmentsContext';
import { getGroups } from '../services/api';
import api from '../services/api';

const STEP_COLORS = {
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  pink:   { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-700',   badge: 'bg-pink-100 text-pink-700' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
};

export default function ValidationChainPage() {
  const { user } = useAuth();
  const { departments } = useDepartments();
  const [groups, setGroups] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [chain, setChain] = useState(null);
  const [allChains, setAllChains] = useState(null);
  const [globalInfo, setGlobalInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const diagramRef = useRef(null);
  const [diagramId] = useState(() => `chain-diag-${Date.now()}`);

  // Load groups when department changes
  useEffect(() => {
    const load = async () => {
      if (selectedDept) {
        const data = await getGroups(selectedDept);
        setGroups(data);
        setSelectedGroup('');
      } else {
        const data = await getGroups();
        setGroups(data);
      }
    };
    load();
  }, [selectedDept]);

  // Load chain data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setChain(null);
      setAllChains(null);
      try {
        if (selectedGroup) {
          const { data } = await api.get('/groups/validation-chain', { params: { group_id: selectedGroup } });
          setChain(data);
        } else if (selectedDept) {
          const { data } = await api.get('/groups/validation-chain', { params: { department: selectedDept } });
          setChain(data);
        } else {
          const { data } = await api.get('/groups/validation-chain');
          setAllChains(data.chains);
          setGlobalInfo(data.global);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedDept, selectedGroup]);

  // Render mermaid diagram for the chain
  const renderDiagram = useCallback(async () => {
    if (!diagramRef.current) return;
    const data = chain || (allChains ? null : null);
    if (!data && !allChains) return;

    let code;
    if (data) {
      // Single chain diagram
      code = buildSingleChainCode(data);
    } else if (allChains) {
      // All chains overview
      code = buildAllChainsCode(allChains, globalInfo);
    } else {
      return;
    }

    try {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: '#dbeafe',
          primaryBorderColor: '#2563eb',
          lineColor: '#94a3b8',
          fontSize: '12px',
        },
        flowchart: { curve: 'basis', padding: 10, nodeSpacing: 30, rankSpacing: 40 },
      });
      const { svg } = await mermaid.render(diagramId, code);
      if (diagramRef.current) {
        diagramRef.current.innerHTML = svg;
      }
    } catch (err) {
      console.error('Mermaid error:', err);
      if (diagramRef.current) {
        diagramRef.current.innerHTML = '<pre class="text-xs text-gray-500 font-mono whitespace-pre-wrap">' + code + '</pre>';
      }
    }
  }, [chain, allChains, globalInfo, diagramId]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Chaîne de validation</h1>
        <p className="text-sm text-gray-400">
          Visualisez qui valide les primes pour chaque département ou groupe
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}
          className="select select-bordered select-sm">
          <option value="">Tous les départements</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}
          className="select select-bordered select-sm" disabled={!selectedDept}>
          <option value="">Tous les groupes</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><span className="loading loading-spinner loading-lg"></span></div>
      ) : allChains && !chain ? (
        /* Overview: all departments */
        <div className="space-y-4">
          {/* Diagram */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Vue d'ensemble</h3>
            <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
              <div ref={diagramRef} className="flex justify-center" />
            </div>
          </div>
          {/* Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allChains.map(c => (
              <ChainCard key={c.department + (c.group_id || '')} data={c} />
            ))}
          </div>
        </div>
      ) : chain ? (
        /* Single department/group */
        <div className="space-y-6">
          {/* Diagram */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-2">
              {chain.department}
              {chain.group_id ? ` — Groupe #${chain.group_id}` : ''}
            </h3>
            <p className="text-sm text-gray-400 mb-4">{chain.employee_count} employé(s) concerné(s)</p>
            <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
              <div ref={diagramRef} className="flex justify-center" />
            </div>
          </div>
          {/* Chain steps */}
          <div className="flex flex-col md:flex-row items-stretch gap-0 md:gap-0">
            {chain.chain.map((step, i) => {
              const colors = STEP_COLORS[step.color] || STEP_COLORS.orange;
              return (
                <div key={step.step} className="flex items-stretch flex-1">
                  <div className={`flex-1 rounded-xl border-2 ${colors.border} ${colors.bg} p-4`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${colors.badge}`}>
                        {i + 1}
                      </div>
                      <div>
                        <p className={`font-semibold text-sm ${colors.text}`}>{step.label}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{step.step}</p>
                      </div>
                    </div>
                    {step.users.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Aucun utilisateur assigné</p>
                    ) : (
                      <div className="space-y-1.5">
                        {step.users.map(u => (
                          <div key={u.id} className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${colors.badge}`}>
                              {u.name?.charAt(0) || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate">{u.name}</p>
                              {u.poste && <p className="text-[10px] text-gray-400 truncate">{u.poste}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {i < chain.chain.length - 1 && (
                    <div className="hidden md:flex items-center justify-center w-8 shrink-0">
                      <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <p>Sélectionnez un département ou un groupe pour voir la chaîne de validation.</p>
        </div>
      )}
    </div>
  );
}


function ChainCard({ data }) {
  const totalUsers = data.chain.reduce((sum, s) => sum + s.users.length, 0);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900 text-sm">{data.department}</h4>
        <span className="text-xs text-gray-400">{data.employee_count} emp.</span>
      </div>
      <div className="flex items-center gap-1">
        {data.chain.map((step, i) => {
          const colors = STEP_COLORS[step.color] || STEP_COLORS.orange;
          return (
            <div key={step.step} className="flex items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${colors.badge}`} title={`${step.label}: ${step.users.length} personne(s)`}>
                {step.users.length}
              </div>
              {i < data.chain.length - 1 && (
                <svg className="w-3 h-3 text-gray-300 mx-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      {totalUsers === 0 && (
        <p className="text-[10px] text-orange-400 mt-2">⚠ Aucun validateur configuré</p>
      )}
    </div>
  );
}


function buildSingleChainCode(data) {
  const lines = ['graph LR'];
  lines.push('    classDef n1Style fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#92400e');
  lines.push('    classDef dirStyle fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#6b21a8');
  lines.push('    classDef dgStyle fill:#fce7f3,stroke:#db2777,stroke-width:2px,color:#9d174d');
  lines.push('    classDef drhStyle fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#065f46');

  const deptLabel = data.department.replace(/"/g, "'");
  lines.push(`    TITLE["${deptLabel}"]`);
  lines.push('    style TITLE fill:#e0f2fe,stroke:#0284c7,stroke-width:2px');

  for (let i = 0; i < data.chain.length; i++) {
    const step = data.chain[i];
    const nodeId = step.step;
    const styleClass = step.color + 'Style';
    const userNames = step.users.map(u => u.name.replace(/"/g, "'")).join(', ') || 'Aucun';
    const label = `${step.label}\\n(${step.users.length})`;
    lines.push(`    ${nodeId}["${label}"]:::${styleClass}`);
  }

  // Edges
  lines.push('    TITLE --> N1');
  lines.push('    N1 --> DIR');
  lines.push('    DIR --> DG');
  lines.push('    DG --> DRH');

  return lines.join('\n');
}


function buildAllChainsCode(chains, globalInfo) {
  const lines = ['graph TD'];
  lines.push('    classDef n1Style fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#92400e');
  lines.push('    classDef dirStyle fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#6b21a8');
  lines.push('    classDef dgStyle fill:#fce7f3,stroke:#db2777,stroke-width:2px,color:#9d174d');
  lines.push('    classDef drhStyle fill:#d1fae5,stroke:#059669,stroke-width:2px,color:#065f46');
  lines.push('    classDef deptStyle fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0369a1');

  // Global DG
  if (globalInfo?.dg) {
    const dgName = globalInfo.dg.name.replace(/"/g, "'");
    lines.push(`    GLOBAL_DG["DG: ${dgName}"]:::dgStyle`);
  }
  // Global DRH
  if (globalInfo?.drh) {
    const drhName = globalInfo.drh.name.replace(/"/g, "'");
    lines.push(`    GLOBAL_DRH["DRH: ${drhName}"]:::drhStyle`);
  }

  chains.forEach((chain, ci) => {
    const deptSafe = chain.department.replace(/"/g, "'").substring(0, 20);
    const deptNodeId = `DEPT_${ci}`;
    lines.push(`    ${deptNodeId}["${deptSafe}"]:::deptStyle`);

    // Find N+1
    const n1Step = chain.chain.find(s => s.step === 'N+1');
    const dirStep = chain.chain.find(s => s.step === 'DIRECTEUR');
    const n1Count = n1Step ? n1Step.users.length : 0;
    const dirCount = dirStep ? dirStep.users.length : 0;

    if (n1Count > 0) {
      const n1Id = `N1_${ci}`;
      lines.push(`    ${n1Id}["N+1 (${n1Count})"]:::n1Style`);
      lines.push(`    ${deptNodeId} --> ${n1Id}`);
    }
    if (dirCount > 0) {
      const dirId = `DIR_${ci}`;
      lines.push(`    ${dirId}["Dir (${dirCount})"]:::dirStyle`);
      if (n1Count > 0) {
        lines.push(`    N1_${ci} --> ${dirId}`);
      } else {
        lines.push(`    ${deptNodeId} --> ${dirId}`);
      }
    }
    // Connect to DG
    if (globalInfo?.dg) {
      const lastDir = dirCount > 0 ? `DIR_${ci}` : (n1Count > 0 ? `N1_${ci}` : deptNodeId);
      lines.push(`    ${lastDir} --> GLOBAL_DG`);
    }
  });

  // DG -> DRH
  if (globalInfo?.dg && globalInfo?.drh) {
    lines.push('    GLOBAL_DG --> GLOBAL_DRH');
  }

  return lines.join('\n');
}
