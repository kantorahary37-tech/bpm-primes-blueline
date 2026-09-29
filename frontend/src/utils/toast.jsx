import baseToast from 'react-hot-toast';

/**
 * Wrapper de react-hot-toast — même API que `toast` (toast(), toast.success,
 * toast.error, toast.loading, toast.custom, toast.dismiss…), avec en plus un
 * bouton « ✕ » sur chaque notification pour la fermer immédiatement, sans
 * attendre la fin du délai d'affichage.
 *
 * Usage : `import toast from '../utils/toast';` (et non depuis 'react-hot-toast').
 */

const CloseButton = ({ id }) => (
  <button
    type="button"
    aria-label="Fermer la notification"
    title="Fermer"
    onClick={() => baseToast.dismiss(id)}
    className="shrink-0 self-start ml-2 -mr-1 -mt-0.5 rounded-md p-1 text-black/40 hover:text-black/70 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-black/20 transition-colors"
  >
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
);

// Le message peut être une string, un nœud JSX ou une fonction (t) => nœud.
const withCloseButton = (message) => (t) => {
  const node = typeof message === 'function' ? message(t) : message;
  return (
    <div className="flex items-start w-full">
      <div className="flex-1 min-w-0">{node}</div>
      <CloseButton id={t.id} />
    </div>
  );
};

const make = (type) => (message, options) =>
  type === 'blank'
    ? baseToast(withCloseButton(message), options)
    : baseToast[type](withCloseButton(message), options);

const toast = make('blank');

toast.success = make('success');
toast.error = make('error');
toast.loading = make('loading');
toast.custom = (message, options) => baseToast.custom(withCloseButton(message), options);
toast.dismiss = baseToast.dismiss;
toast.remove = baseToast.remove;

export default toast;
