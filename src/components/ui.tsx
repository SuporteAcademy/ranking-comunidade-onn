import { useEffect, useId, useRef, type ReactNode } from 'react';

export function BotaoArquivo({
  children,
  aceita = '.xlsx,.xls,.csv',
  multiplos = false,
  primario = false,
  onArquivos,
}: {
  children: ReactNode;
  aceita?: string;
  multiplos?: boolean;
  primario?: boolean;
  onArquivos: (arquivos: File[]) => void;
}) {
  const id = useId();
  return (
    <>
      <input
        id={id}
        type="file"
        accept={aceita}
        multiple={multiplos}
        hidden
        onChange={(e) => {
          const lista = [...(e.target.files ?? [])];
          e.target.value = '';
          if (lista.length) onArquivos(lista);
        }}
      />
      <label htmlFor={id} className={`btn ${primario ? 'primario' : ''}`} tabIndex={0} role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            document.getElementById(id)?.click();
          }
        }}
      >
        {children}
      </label>
    </>
  );
}

export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
  rodape,
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog ref={ref} onClose={onFechar} onCancel={onFechar} aria-label={titulo}>
      {aberto && (
        <>
          <div className="modal-corpo">
            <h3 style={{ fontSize: 18 }}>{titulo}</h3>
            {children}
          </div>
          {rodape && <div className="modal-rodape">{rodape}</div>}
        </>
      )}
    </dialog>
  );
}

export function Aviso({ tipo = 'alerta', children }: { tipo?: 'alerta' | 'ruim' | 'ok' | 'info'; children: ReactNode }) {
  const icone = tipo === 'ok' ? '✓' : tipo === 'ruim' ? '✕' : tipo === 'info' ? 'i' : '!';
  return (
    <div className={`aviso ${tipo}`} role={tipo === 'ruim' ? 'alert' : 'status'}>
      <strong aria-hidden style={{ width: 16, textAlign: 'center' }}>{icone}</strong>
      <div>{children}</div>
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

export const fmt = (n: number) => n.toLocaleString('pt-BR');
