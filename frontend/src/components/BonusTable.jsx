import { useMemo } from 'react';
import { EyeIcon, CheckIcon, EditIcon } from './Icons';

// Moyenne pondérée des notes /10 par coefficient pour une section (même logique que la vue cartes)
const weightedAvg = (items) => {
  if (!Array.isArray(items) || items.length === 0) return { note: null, totalCoeff: 0 };
  let weightedSum = 0, totalCoeff = 0;
  for (const i of items) {
    if (!i || typeof i !== 'object') continue;
    const n = parseFloat(i.note ?? i.evaluation);
    const c = parseFloat(i.coeff ?? i.objective) || 0;
    if (!Number.isNaN(n) && c > 0) { weightedSum += n * c; totalCoeff += c; }
  }
  return { note: totalCoeff > 0 ? weightedSum / totalCoeff : null, totalCoeff };
};

const formatAr = (n, seeAmounts) => {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return seeAmounts ? `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ar` : '••••••';
};

const formatNote = (bonus) => {
  if (bonus.bonus_type !== 'mensuel') return '—';
  const q = weightedAvg(bonus.details?.quantitative);
  const l = weightedAvg(bonus.details?.qualitative);
  const totalCoeff = q.totalCoeff + l.totalCoeff;
  if (totalCoeff <= 0) return '—';
  const globalNote = ((q.note ?? 0) * q.totalCoeff + (l.note ?? 0) * l.totalCoeff) / totalCoeff;
  return Number(globalNote).toFixed(2);
};

const noteColor = (v) => {
  if (v === '—') return '';
  const n = parseFloat(v);
  if (n >= 7.5) return 'text-emerald-600';
  if (n >= 5) return 'text-amber-600';
  return 'text-red-500';
};

// Libellés et styles des types de prime
const TYPE_LABELS = {
  mensuel: 'Mensuelle',
  astreinte: 'Astreinte',
  commission: 'Commission',
};

const typeBadgeClass = (t) => {
  switch (t) {
    case 'mensuel': return 'bg-blue-100 text-blue-700';
    case 'astreinte': return 'bg-purple-100 text-purple-700';
    case 'commission': return 'bg-emerald-100 text-emerald-700';
    default: return 'bg-gray-100 text-gray-600';
  }
};

// Colonnes dynamiques spécifiques au type « astreinte »
const weeklyCount = (b) => (Array.isArray(b.details?.disponibilites) ? b.details.disponibilites.length : 0);

const TYPE_COLUMNS = {
  astreinte: [
    {
      key: 'semaines',
      label: 'Semaines',
      align: 'center',
      render: (b) => {
        const n = weeklyCount(b);
        return n > 0 ? `${n}/5` : '—';
      },
      sortValue: (b) => {
        const n = weeklyCount(b);
        return n > 0 ? n : null;
      },
    },
    {
      key: 'forfaitSemaine',
      label: 'Forfait / semaine',
      align: 'right',
      isAmount: true,
      value: (b) => {
        const fm = parseFloat(b.details?.weekly_max);
        const n = weeklyCount(b);
        return fm && n > 0 ? fm * n : null;
      },
      sortValue: (b) => {
        const fm = parseFloat(b.details?.weekly_max);
        const n = weeklyCount(b);
        return fm && n > 0 ? fm * n : null;
      },
    },
    {
      key: 'nbInterventions',
      label: 'Nb interventions',
      align: 'center',
      value: (b) => (Array.isArray(b.details?.interventions) ? b.details.interventions.length : null),
      sortValue: (b) => (Array.isArray(b.details?.interventions) ? b.details.interventions.length : null),
    },
    {
      key: 'montantIntervention',
      label: 'Montant intervention',
      align: 'right',
      isAmount: true,
      value: (b) => parseFloat(b.details?.total_interv) ?? null,
      sortValue: (b) => parseFloat(b.details?.total_interv) ?? null,
    },
  ],
};

const ChevronUp = () => (
  <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);
const ChevronDown = () => (
  <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const BonusTable = ({
  bonuses,
  getValidStep,
  canSelect,
  selectedBonuses,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  seeAmounts,
  initiatorMap,
  onView,
  onValidate,
  onEdit,
  badgeClass,
  statusLabel,
  sortBy,
  sortDir,
  onSort,
}) => {

  // Colonnes communes (ordre imposé)
  const typeCols = useMemo(() => {
    const presentTypes = [...new Set(bonuses.map((b) => b.bonus_type).filter(Boolean))];
    return presentTypes.flatMap((t) => TYPE_COLUMNS[t] || []);
  }, [bonuses]);

  const columns = useMemo(() => {
    const columns = [
      { key: 'select', label: '', sortable: false, align: 'center' },
      { key: 'matricule', label: 'Matricule', sortable: true, sortValue: (b) => b.employee?.matricule ?? '' },
      { key: 'name', label: 'Nom et Prénom', sortable: true, sortValue: (b) => b.employee?.name ?? '' },
      { key: 'note', label: 'Moyenne note', sortable: true, align: 'center', sortValue: (b) => { const n = formatNote(b); return n === '—' ? null : parseFloat(n); } },
      { key: 'bonus_type', label: 'Type de prime', sortable: true, align: 'center', sortValue: (b) => b.bonus_type ?? '' },
      ...typeCols,
      { key: 'amount', label: 'Montant', sortable: true, align: 'right', sortValue: (b) => parseFloat(b.total_amount) ?? 0 },
      { key: 'creator', label: 'Créateur', sortable: true, sortValue: (b) => initiatorMap.get(b.created_by_id) ?? '' },
      { key: 'department', label: 'Département', sortable: true, sortValue: (b) => b.employee?.department ?? '' },
      { key: 'actions', label: 'Actions', sortable: false, align: 'center' },
    ];

    return columns;
  }, [typeCols, initiatorMap]);

  const handleSort = (key) => {
    if (!key || !onSort) return;
    onSort(key);
  };

  const selectableCount = bonuses.filter((b) => canSelect(b)).length;
  const allSelectableSelected = selectableCount > 0 &&
    bonuses.every((b) => !canSelect(b) || selectedBonuses.has(b.id));

  const renderSortableHeader = (col) => (
    <button
      type="button"
      onClick={() => handleSort(col.key)}
      className={`inline-flex items-center gap-0.5 font-semibold uppercase tracking-wider transition-colors ${
        sortBy === col.key ? 'text-blue-700' : 'text-gray-500 hover:text-gray-800'
      }`}
      aria-sort={sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {col.label}
      {sortBy === col.key && (sortDir === 'asc' ? <ChevronUp /> : <ChevronDown />)}
    </button>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-max">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/70">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={col.sortable && sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={`px-4 py-3 whitespace-nowrap ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {col.key === 'select' ? (
                  <span className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600"
                      checked={allSelectableSelected}
                      disabled={selectableCount === 0}
                      onChange={(e) => (e.target.checked ? onSelectAll?.() : onClearSelection?.())}
                      title="Tout sélectionner"
                    />
                  </span>
                ) : col.key === 'actions' ? (
                  <span className={`text-xs font-semibold uppercase tracking-wider text-gray-500 ${col.align === 'center' ? '' : ''}`}>Actions</span>
                ) : (
                  col.sortable ? renderSortableHeader(col) : (
                    <span className="font-semibold uppercase tracking-wider text-gray-500">{col.label}</span>
                  )
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bonuses.map((bonus) => {
            const step = getValidStep(bonus);
            const selected = selectedBonuses.has(bonus.id);
            const note = formatNote(bonus);
            const selectable = canSelect(bonus);
            const creator = initiatorMap.get(bonus.created_by_id) || '';
            return (
              <tr
                key={bonus.id}
                onClick={() => onView(bonus.id)}
                className={`cursor-pointer border-b border-gray-100 transition-colors ${
                  selected ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600"
                    checked={selected}
                    disabled={!selectable}
                    onChange={() => onToggleSelect(bonus.id)}
                    title={!selectable ? "Seules les primes validées peuvent être sélectionnées" : ''}
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-700">{bonus.employee?.matricule || 'N/A'}</td>
                <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                  {bonus.employee?.name || 'N/A'}
                  <span className={`ml-2 text-[9px] font-medium px-1.5 py-0.5 rounded-full align-middle ${badgeClass(bonus.status)} ${bonus.was_rejected ? 'ring-1 ring-red-400' : ''}`}>
                    {statusLabel(bonus)}
                  </span>
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-center font-medium tabular-nums ${noteColor(note)}`}>
                  {note === '—' ? <span className="text-gray-300">—</span> : `${note}/10`}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-center">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${typeBadgeClass(bonus.bonus_type)}`}>
                    {TYPE_LABELS[bonus.bonus_type] || bonus.bonus_type || '—'}
                  </span>
                </td>
                {typeCols.map((col) => {
                  const display = col.render
                    ? col.render(bonus)
                    : (() => {
                        const raw = col.value(bonus);
                        if (raw == null) return '—';
                        return col.isAmount ? formatAr(raw, seeAmounts) : raw;
                      })();
                  return (
                    <td key={col.key} className={`px-4 py-3 whitespace-nowrap text-gray-700 tabular-nums ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}>
                      {display}
                    </td>
                  );
                })}
                <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-blue-600 tabular-nums">
                  {formatAr(bonus.total_amount, seeAmounts)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600" title={creator}>{creator || '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">{bonus.employee?.department || 'N/A'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onView(bonus.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Voir le détail">
                      <EyeIcon className="w-4 h-4" />
                    </button>
                    {step && !bonus.was_rejected && (
                      <button onClick={() => onValidate(bonus.id, step)} className="p-1.5 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600" title="Valider">
                        <CheckIcon className="w-4 h-4" />
                      </button>
                    )}
                    {step && bonus.was_rejected && (
                      <button onClick={() => onEdit(bonus.id)} className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600" title="Modifier">
                        <EditIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default BonusTable;
