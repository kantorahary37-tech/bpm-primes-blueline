import Mermaid from '../components/Mermaid';

const TYPE_LABELS = {
  mensuel: 'Prime mensuelle',
  astreinte: 'Prime astreinte',
  commission: 'Commission GP (Grand Public)',
  commission_gc: 'Commission GC (Grand Compte)',
  ponctuelle: 'Prime ponctuelle',
  exceptionnel: 'Prime exceptionnelle',
  intervention: "Prime d'intervention",
};

const STATUS_STYLES = {
  'Initialisé': { label: 'Initialisé', color: '#f59e0b' },
  'En attente N+2': { label: 'En attente N+2', color: '#3b82f6' },
  'En attente Directeur': { label: 'En attente Directeur', color: '#8b5cf6' },
  'En attente DG': { label: 'En attente DG', color: '#f97316' },
  'Prime validée': { label: 'Prime validée', color: '#10b981' },
  'Prime rejetée': { label: 'Prime rejetée', color: '#ef4444' },
};

const MASTER_FLOW = `flowchart TD
  A["🟡 Initialisé"] -->|"N+1 · Valider"| B["🟣 En attente Directeur"]
  A -->|"N+1 · Valider (avec N+2)"| N2["🔵 En attente N+2"]
  N2 -->|"N+2 · Valider"| B
  B -->|"Directeur · Valider"| C["🟠 En attente DG"]
  C -->|"DG · Valider"| D["🟢 Prime validée"]
  D -->|"DRH · Traitement / Paiement"| E["✅ Payée / Traitée"]
  A -.->|"Rejeter (n'importe quelle étape)"| R["🔴 Rejet → retour Initialisé"]
  B -.-> R
  C -.-> R
  N2 -.-> R
  D -.->|"DG modifie la prime"| C
  D -.->|"Directeur modifie la prime"| B
  B -.->|"N+1 modifie la prime"| A

  style A fill:#fef3c7,stroke:#f59e0b,color:#78350f
  style N2 fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
  style B fill:#f3e8ff,stroke:#8b5cf6,color:#4c1d95
  style C fill:#ffedd5,stroke:#f97316,color:#7c2d12
  style D fill:#d1fae5,stroke:#10b981,color:#064e3b
  style E fill:#ecfdf5,stroke:#059669,color:#064e3b
  style R fill:#fee2e2,stroke:#ef4444,color:#7f1d1d`;

const STANDARD_FLOW = `flowchart TD
  A["🟡 Initialisé"] -->|"N+1 · Valider"| B["🟣 En attente Directeur"]
  B -->|"Directeur · Valider"| C["🟠 En attente DG"]
  C -->|"DG · Valider"| D["🟢 Prime validée"]
  D -->|"DRH · Traitement / Paiement"| E["✅ Payée / Traitée"]

  style A fill:#fef3c7,stroke:#f59e0b,color:#78350f
  style B fill:#f3e8ff,stroke:#8b5cf6,color:#4c1d95
  style C fill:#ffedd5,stroke:#f97316,color:#7c2d12
  style D fill:#d1fae5,stroke:#10b981,color:#064e3b
  style E fill:#ecfdf5,stroke:#059669,color:#064e3b`;

const N2_FLOW = `flowchart TD
  A["🟡 Initialisé"] -->|"N+1 · Valider"| N["🔵 En attente N+2"]
  N -->|"N+2 · Valider"| B["🟣 En attente Directeur"]
  B -->|"Directeur · Valider"| C["🟠 En attente DG"]
  C -->|"DG · Valider"| D["🟢 Prime validée"]
  D -->|"DRH · Traitement / Paiement"| E["✅ Payée / Traitée"]
  A -->|"N+2 · Valider directement"| B

  style A fill:#fef3c7,stroke:#f59e0b,color:#78350f
  style N fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
  style B fill:#f3e8ff,stroke:#8b5cf6,color:#4c1d95
  style C fill:#ffedd5,stroke:#f97316,color:#7c2d12
  style D fill:#d1fae5,stroke:#10b981,color:#064e3b
  style E fill:#ecfdf5,stroke:#059669,color:#064e3b`;

const MODIFICATION_FLOW = `flowchart LR
  D["🟢 Prime validée"] -->|"DG modifie"| C["🟠 En attente DG"]
  D -->|"Directeur modifie"| B["🟣 En attente Directeur"]
  D -->|"DRH / Autre modifie"| A["🟡 Initialisé"]
  C -->|"DG modifie"| C
  B -->|"Directeur modifie"| B
  A -->|"N+1 / N+2 modifie"| A

  style A fill:#fef3c7,stroke:#f59e0b,color:#78350f
  style B fill:#f3e8ff,stroke:#8b5cf6,color:#4c1d95
  style C fill:#ffedd5,stroke:#f97316,color:#7c2d12
  style D fill:#d1fae5,stroke:#10b981,color:#064e3b`;

const REJECTION_FLOW = `flowchart TD
  A["🟡 Initialisé"] -->|"N+1 · Rejeter"| R>"🔴 Rejet"]
  N["🔵 En attente N+2"] -->|"N+2 · Rejeter"| R
  B["🟣 En attente Directeur"] -->|"Directeur · Rejeter"| R
  C["🟠 En attente DG"] -->|"DG · Rejeter"| R
  R -->|"Statut → Initialisé · was_rejected = true"| A

  style A fill:#fef3c7,stroke:#f59e0b,color:#78350f
  style N fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
  style B fill:#f3e8ff,stroke:#8b5cf6,color:#4c1d95
  style C fill:#ffedd5,stroke:#f97316,color:#7c2d12
  style R fill:#fee2e2,stroke:#ef4444,color:#7f1d1d`;

const SchedulerFlow = ({ bonusType }) => (
  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <h3 className="font-semibold text-gray-900 text-sm">{TYPE_LABELS[bonusType]}</h3>
      <span className="text-xs text-gray-400">{bonusType}</span>
    </div>
    <div className="p-4">
      <Mermaid chart={STANDARD_FLOW} />
    </div>
    <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
      {bonusType === 'mensuel'
        ? 'Peut activer la validation N+2 (option « passer par un N+2 ») lors de la création.'
        : null}
      {bonusType === 'commission'
        ? 'Import CSV 4D → primes créées à l’état Initialisé → entre dans le flux standard.'
        : null}
      {bonusType === 'commission_gc'
        ? 'Import CSV Grand Compte → primes créées à l’état Initialisé → entre dans le flux standard.'
        : null}
      {bonusType === 'astreinte'
        ? 'Taux journalier × jours d’astreinte → entre dans le flux standard.'
        : null}
    </div>
  </div>
);

function FlowCard({ title, subtitle, chart, legend }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4">
        <Mermaid chart={chart} />
      </div>
      {legend && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">{legend}</div>
      )}
    </div>
  );
}

const StatusLegend = () => (
  <div className="flex flex-wrap gap-2.5 items-center">
    {Object.values(STATUS_STYLES).map((s) => (
      <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
        {s.label}
      </span>
    ))}
  </div>
);

export default function BonusFlowsPage() {
  const availableTypes = Object.keys(TYPE_LABELS);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flux de validation des primes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Visualisation des flux de validation disponibles pour tous les types de primes.
          </p>
        </div>
        <StatusLegend />
      </div>

      <FlowCard
        title="Vue d’ensemble — tous les flux"
        subtitle="Flux standard, branche N+2, modifications et rejets."
        chart={MASTER_FLOW}
        legend="Une prime peut être rejetée à n’importe quelle étape : elle revient à l’état Initialisé (was_rejected=true). Les validations successives ont lieu aux étapes N+1 → N+2 (optionnelle) → Directeur → DG → Traitement DRH."
      />

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Flux par type de prime</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {availableTypes.map((t) => (
            <SchedulerFlow key={t} bonusType={t} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <FlowCard
          title="Flux avec N+2 (sous-directeur)"
          subtitle="Prime mensuelle — option « passer par un N+2 »"
          chart={N2_FLOW}
          legend="Si l'option pass_to_n2 est active, après la validation N+1 la prime passe en « En attente N+2 ». Le N+2 peut aussi valider directement une prime Initialisé (comme un N+1)."
        />
        <FlowCard
          title="Flux de modification"
          subtitle="Qui modifie → vers quel état la prime revient"
          chart={MODIFICATION_FLOW}
          legend="DG → En attente DG · Directeur → En attente Directeur · DRH / autres → Initialisé. La prime est bloquée en modification si elle n'est ni Initialisé ni En attente Directeur (sauf admin/DG/DRH)."
        />
      </div>

      <FlowCard
        title="Flux de rejet"
        subtitle="Rejet à n'importe quelle étape"
        chart={REJECTION_FLOW}
        legend="Le rejet remet la prime à l'état Initialisé avec le drapeau was_rejected=true, un motif est enregistré, et le créateur / manager est notifié."
      />
    </div>
  );
}