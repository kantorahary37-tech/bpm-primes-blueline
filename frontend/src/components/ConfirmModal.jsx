import { useState, useCallback } from 'react';
import Modal from './Modal';
import { ExclamationIcon } from './Icons';

/**
 * Modale de confirmation stylée — remplace window.confirm().
 *
 * Usage :
 *   const { confirm, confirmElement } = useConfirm();
 *   const ok = await confirm({
 *     title: 'Lancer la synchronisation ?',
 *     message: 'Cette opération créera uniquement les nouveaux employés.',
 *     details: ['Les employés existants ne seront pas modifiés.'],
 *     confirmText: 'Synchroniser',
 *     tone: 'primary' | 'danger' | 'warning',
 *   });
 *   if (!ok) return;
 */
export function useConfirm() {
  const [state, setState] = useState(null);
  const [resolveRef, setResolveRef] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setState({ ...options });
      setResolveRef(() => resolve);
    });
  }, []);

  const close = (value) => {
    setState(null);
    if (resolveRef) resolveRef(value);
  };

  const confirmElement = (
    <ConfirmModal
      options={state}
      onClose={(value) => close(value)}
    />
  );

  return { confirm, confirmElement };
}

function ConfirmModal({ options, onClose }) {
  if (!options) return null;
  const {
    title = 'Confirmation',
    message,
    details = [],
    confirmText = 'Confirmer',
    cancelText = 'Annuler',
    tone = 'primary',
  } = options;

  const toneStyles = {
    primary: { btn: 'bg-blue-600 hover:bg-blue-700 text-white border-0', icon: 'text-blue-600 bg-blue-50' },
    danger: { btn: 'bg-red-600 hover:bg-red-700 text-white border-0', icon: 'text-red-600 bg-red-50' },
    warning: { btn: 'bg-amber-500 hover:bg-amber-600 text-white border-0', icon: 'text-amber-600 bg-amber-50' },
  }[tone] || {};

  return (
    <Modal open={!!options} onClose={() => onClose(false)} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${toneStyles.icon}`}>
            <ExclamationIcon className="w-5 h-5" />
          </div>
          {message && <p className="text-sm text-gray-700 leading-relaxed pt-2">{message}</p>}
        </div>
        {details.length > 0 && (
          <ul className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
            {details.map((d, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">•</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={() => onClose(false)} className="btn btn-sm btn-ghost">
            {cancelText}
          </button>
          <button onClick={() => onClose(true)} className={`btn btn-sm ${toneStyles.btn}`} autoFocus>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
