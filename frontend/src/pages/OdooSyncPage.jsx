import { useState, useEffect } from 'react';
import toast from '../utils/toast';
import { compareOdooEmployees, archiveEmployeesFromOdoo } from '../services/api';
import {
  BuildingIcon, UsersIcon, ArchiveIcon, ClockIcon, CheckIcon,
  ExclamationIcon, SearchIcon,
} from '../components/Icons';
import { useConfirm } from '../components/ConfirmModal';

const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : '—';

function StatCard({ label, value, hint, color = 'blue', Icon }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-base-200 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tones[color]}`}>
          <Icon className="w-4 h-4" />
        </span>
        <p className="text-[11px] text-gray-400">{label}</p>
      </div>
      <p className="text-xl font-bold text-gray-900 mt-1.5">{value}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function EmployeeList({ items, selected, onToggle, onToggleAll, selectable }) {
  if (!items.length) {
    return <p className="text-sm text-gray-400 px-6 py-6 text-center">Aucun employé.</p>;
  }
  return (
    <div className="divide-y divide-base-200">
      {selectable && (
        <label className="flex items-center gap-3 px-6 py-2.5 bg-gray-50 cursor-pointer text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={selected.size === items.length && items.length > 0}
            onChange={(e) => onToggleAll(e.target.checked, items)}
          />
          <span className="text-gray-600">
            Tout sélectionner ({selected.size}/{items.length})
          </span>
        </label>
      )}
      {items.map((e) => (
        <div key={e.id} className="flex items-center gap-3 px-6 py-2.5">
          {selectable && (
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={selected.has(e.id)}
              onChange={() => onToggle(e.id)}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
            <p className="text-[11px] text-gray-400">
              <span className="font-mono">{e.matricule}</span> · {e.dept || '—'}
            </p>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <p className="text-[11px] text-gray-500 truncate max-w-[240px]">{e.odoo_name || ''}</p>
            <p className="text-[11px] text-gray-400 truncate max-w-[240px]">{e.odoo_department || ''}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OdooSyncPage() {
  const { confirm, confirmElement } = useConfirm();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [reason, setReason] = useState('Archivé dans Odoo');
  const [archiving, setArchiving] = useState(false);

  const applyReport = (data) => {
    setReport(data);
    setSelected(new Set((data.to_archive || []).map((e) => e.id)));
  };

  const fetchReport = async () => {
    try {
      applyReport(await compareOdooEmployees());
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Erreur lors de la comparaison avec Odoo');
    }
  };

  useEffect(() => {
    let cancelled = false;
    compareOdooEmployees()
      .then((data) => { if (!cancelled) applyReport(data); })
      .catch((err) => {
        if (!cancelled) toast.error(err.response?.data?.detail || 'Erreur lors de la comparaison avec Odoo');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = async () => {
    setComparing(true);
    await fetchReport();
    setComparing(false);
  };

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (checked, items) =>
    setSelected(checked ? new Set(items.map((e) => e.id)) : new Set());

  const handleArchive = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await confirm({
      title: 'Archiver dans l\'application',
      message: `Archiver ${ids.length} employé(s) signalé(s) comme archivés dans Odoo ?`,
      details: [
        'Ils seront masqués de toutes les listes de l\'application.',
        'Restauration possible par un admin depuis la page Archive → Employés.',
        `Motif : ${reason || 'Archivé dans Odoo'}`,
      ],
      confirmText: 'Archiver',
      tone: 'danger',
    });
    if (!ok) return;

    setArchiving(true);
    try {
      const result = await archiveEmployeesFromOdoo(ids, reason);
      toast.success(`${result.count} employé(s) archivé(s) dans l'application`);
      await fetchReport();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de l\'archivage');
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const toArchive = report?.to_archive || [];
  const toRestore = report?.to_restore || [];
  const missing = report?.missing_in_odoo || [];
  const consistent = report?.already_archived || [];

  return (
    <div className="space-y-6">
      {confirmElement}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BuildingIcon className="w-5 h-5 text-blue-600" />
            Comparaison Odoo ⇄ application
          </h1>
          <p className="text-sm text-gray-400">
            État d'archivage des employés : Odoo (<span className="font-mono">hr.employee.active</span>) comparé à
            l'application (<span className="font-mono">employee.is_archived</span>), rapprochés par matricule.
          </p>
        </div>
        <button className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0 gap-1.5" onClick={handleRefresh} disabled={comparing}>
          {comparing ? <span className="loading loading-spinner loading-xs" /> : <SearchIcon className="w-4 h-4" />}
          Comparer à nouveau
        </button>
      </div>

      {report?.error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <ExclamationIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Odoo inaccessible</p>
            <p className="text-xs mt-0.5">{report.error}</p>
            <p className="text-xs mt-1">
              Vérifiez les paramètres dans{' '}
              <span className="font-medium">Configuration → Paramètres système → Odoo (RH)</span>.
            </p>
          </div>
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Employés Odoo actifs" value={report?.odoo?.active ?? '—'} color="emerald" Icon={UsersIcon} />
        <StatCard label="Employés Odoo archivés" value={report?.odoo?.archived ?? '—'} color="gray" Icon={ArchiveIcon} />
        <StatCard label="Correspondances" value={report?.matched ?? '—'} hint={`sur ${report?.app?.total ?? '—'} employés de l'application`} color="blue" Icon={CheckIcon} />
        <StatCard
          label="À archiver ici"
          value={toArchive.length}
          color={toArchive.length ? 'red' : 'emerald'}
          Icon={toArchive.length ? ExclamationIcon : CheckIcon}
        />
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <ClockIcon className="w-3.5 h-3.5" />
        Comparaison effectuée le {formatDateTime(report?.compared_at)}
        {report?.odoo?.url ? ` · ${report.odoo.url} (${report.odoo.db})` : ''}
      </p>

      {/* À archiver */}
      <div className="bg-white rounded-2xl border border-base-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-base-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <ExclamationIcon className="w-4 h-4 text-red-500" />
            Archivés dans Odoo, encore actifs ici
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${toArchive.length ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {toArchive.length}
            </span>
          </h2>
          {toArchive.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input input-bordered input-sm w-56"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motif d'archivage"
                title="Motif enregistré sur chaque employé"
              />
              <button
                className="btn btn-sm bg-red-600 hover:bg-red-700 text-white border-0 gap-1.5"
                onClick={handleArchive}
                disabled={!selected.size || archiving}
              >
                {archiving ? <span className="loading loading-spinner loading-xs" /> : <ArchiveIcon className="w-4 h-4" />}
                Archiver ({selected.size})
              </button>
            </div>
          )}
        </div>
        {toArchive.length === 0 ? (
          <div className="text-center py-10">
            <CheckIcon className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 font-medium">Aucun écart : rien à archiver</p>
            <p className="text-xs text-gray-400 mt-1">
              Tous les employés archivés dans Odoo le sont déjà dans l'application.
            </p>
          </div>
        ) : (
          <EmployeeList
            items={toArchive}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            selectable
          />
        )}
      </div>

      {/* Informations complémentaires */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-base-200">
          <div className="px-6 py-4 border-b border-base-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <ExclamationIcon className="w-4 h-4 text-amber-500" />
              Archivés ici, actifs dans Odoo
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">{toRestore.length}</span>
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              À vérifier : restauration manuelle depuis Archive → Employés si l'employé est de retour.
            </p>
          </div>
          <EmployeeList items={toRestore} selected={selected} />
        </div>

        <div className="bg-white rounded-2xl border border-base-200">
          <div className="px-6 py-4 border-b border-base-200">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <BuildingIcon className="w-4 h-4 text-gray-400" />
              Dans l'application mais absent d'Odoo
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">{missing.length}</span>
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Matricule sans correspondance dans <span className="font-mono">hr.employee</span> ({consistent.length} archivé(s) des deux côtés).
            </p>
          </div>
          <EmployeeList items={missing} selected={selected} />
        </div>
      </div>
    </div>
  );
}
