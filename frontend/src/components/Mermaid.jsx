import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

let mermaidId = 0;

export default function Mermaid({ chart, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      maxTextSize: 1000000,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: {
        primaryColor: '#eff6ff',
        primaryTextColor: '#1e3a8a',
        primaryBorderColor: '#93c5fd',
        lineColor: '#94a3b8',
        secondaryColor: '#fdf4ff',
        tertiaryColor: '#f0fdf4',
        clusterBkg: '#f8fafc',
        clusterBorder: '#cbd5e1',
        edgeLabelBackground: '#ffffff',
        fontSize: '14px',
      },
    });
    let mounted = true;
    const id = `bpm-mermaid-${++mermaidId}`;
    mermaid.render(id, chart).then(({ svg }) => {
      if (mounted && ref.current) ref.current.innerHTML = svg;
    }).catch((err) => {
      console.error('Mermaid render failed:', err);
      if (mounted && ref.current) {
        ref.current.innerHTML = `<pre class="text-red-600 text-xs whitespace-pre-wrap p-4 bg-red-50 rounded-lg">${chart}</pre>`;
      }
    });
    return () => { mounted = false; };
  }, [chart]);

  return <div ref={ref} className={`overflow-x-auto ${className}`} />;
}