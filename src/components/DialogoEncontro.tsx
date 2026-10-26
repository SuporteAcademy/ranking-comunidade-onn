import { useState } from 'react';
import { minimoSegundos } from '../lib/calculo';
import { dataBR } from '../lib/texto';
import type { Encontro } from '../lib/types';
import { Aviso, Modal } from './ui';

export type Rascunho = Omit<Encontro, 'id' | 'importadoEm'> & { id?: string };

/** Formulário de data/duração de um encontro — usado ao importar e ao editar. */
export function DialogoEncontro({
  rascunho,
  existentes,
  restantes = 0,
  onSalvar,
  onCancelar,
}: {
  rascunho: Rascunho;
  existentes: Encontro[];
  restantes?: number;
  onSalvar: (r: Rascunho, substituirId?: string) => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState(rascunho);
  const editando = !!rascunho.id;
  const duplicado = existentes.find((e) => e.data === form.data && e.id !== rascunho.id);
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(form.data) && form.duracaoMin > 0 && form.percentualMinimo > 0 && form.percentualMinimo <= 100;
  const minimo = Math.round(minimoSegundos(form) / 60);
  const passam = form.linhas.filter((l) => l.duracaoSeg >= minimoSegundos(form)).length;
  const titulo = form.titulo.trim() || `Encontro ao vivo ${form.data ? dataBR(form.data) : ''}`;

  const salvar = (substituirId?: string) => onSalvar({ ...form, titulo }, substituirId);

  return (
    <Modal
      aberto
      titulo={editando ? 'Editar encontro' : 'Novo encontro ao vivo'}
      onFechar={onCancelar}
      rodape={
        <>
          <button className="btn" onClick={onCancelar}>
            {restantes ? 'Pular este arquivo' : 'Cancelar'}
          </button>
          {duplicado && !editando && (
            <button className="btn" disabled={!valido} onClick={() => salvar(duplicado.id)}>
              Substituir o de {dataBR(duplicado.data)}
            </button>
          )}
          <button className="btn primario" disabled={!valido} onClick={() => salvar()}>
            {editando ? 'Salvar' : duplicado ? 'Adicionar mesmo assim' : 'Adicionar encontro'}
          </button>
        </>
      }
    >
      <p className="muted small" style={{ margin: 0 }}>
        Arquivo <strong>{form.arquivo}</strong> · {form.linhas.length} linhas na lista
        {restantes > 0 && ` · mais ${restantes} arquivo(s) na fila`}
      </p>
      <div className="grade-campos">
        <label className="campo">
          Data do encontro
          <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </label>
        <label className="campo">
          Duração (min)
          <input
            type="number"
            min={1}
            value={form.duracaoMin}
            onChange={(e) => setForm({ ...form, duracaoMin: Number(e.target.value) })}
          />
        </label>
        <label className="campo">
          Presença mínima (%)
          <input
            type="number"
            min={1}
            max={100}
            value={form.percentualMinimo}
            onChange={(e) => setForm({ ...form, percentualMinimo: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="campo campo-cheio">
        Nome (opcional)
        <input
          type="text"
          placeholder={`Encontro ao vivo ${form.data ? dataBR(form.data) : ''}`}
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        />
      </label>
      <Aviso tipo="info">
        <p>
          Precisa ficar pelo menos <strong>{minimo} min</strong> para ganhar os pontos. Pela lista,{' '}
          <strong>{passam}</strong> entrada(s) já passam disso — o resultado final sai depois de ligar cada pessoa ao
          cadastro.
        </p>
      </Aviso>
      {duplicado && (
        <Aviso>
          <p>
            Já existe um encontro em {dataBR(duplicado.data)} ({duplicado.arquivo}). Se for a mesma lista, substitua
            para não contar duas vezes.
          </p>
        </Aviso>
      )}
    </Modal>
  );
}
