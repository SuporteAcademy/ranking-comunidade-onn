import { useState } from 'react';
import { formatarMinutos } from '../lib/texto';
import type { Pessoa, ResultadoLinha } from '../lib/types';
import { buscarPessoas, nomeCompleto } from '../lib/vinculo';
import { useDados } from '../state/dados';
import { Modal } from './ui';

export function DialogoVinculo({
  resultado,
  diretorio,
  onFechar,
}: {
  resultado: ResultadoLinha;
  diretorio: Map<string, Pessoa>;
  onFechar: () => void;
}) {
  const { atualizar } = useDados();
  const nome = nomeCompleto(resultado.linha);
  const [termo, setTermo] = useState(resultado.linha.nome.split(' ')[0] ?? '');
  const achados = buscarPessoas(diretorio, termo);
  const temSalvo = resultado.status === 'manual' || (resultado.status === 'ignorado' && resultado.motivo === 'Ignorado manualmente');

  const salvar = (membro: Pessoa | null) => {
    atualizar((d) => ({
      vinculos: {
        ...d.vinculos,
        [resultado.chave]: {
          chave: resultado.chave,
          membroEmail: membro?.email ?? null,
          rotulo: membro ? membro.nome : nome,
          criadoEm: new Date().toISOString(),
        },
      },
    }));
    onFechar();
  };

  const desfazer = () => {
    atualizar((d) => {
      const vinculos = { ...d.vinculos };
      delete vinculos[resultado.chave];
      return { vinculos };
    });
    onFechar();
  };

  const item = (p: Pessoa) => (
    <button key={p.email} onClick={() => salvar(p)}>
      <strong>{p.nome}</strong>{' '}
      <span className="muted small">
        {p.email}
        {!p.noCadastro && ' · fora da planilha de membros'}
        {p.situacao && !/^ativ/i.test(p.situacao) && ` · ${p.situacao}`}
      </span>
    </button>
  );

  return (
    <Modal
      aberto
      titulo="Quem é este participante?"
      onFechar={onFechar}
      rodape={
        <>
          {temSalvo && (
            <button className="btn" onClick={desfazer}>
              Voltar ao automático
            </button>
          )}
          <button className="btn" onClick={() => salvar(null)}>
            Ignorar (não é membro)
          </button>
          <button className="btn" onClick={onFechar}>
            Fechar
          </button>
        </>
      }
    >
      <div className="status-import">
        <strong>{nome || '(sem nome)'}</strong>
        <div className="muted small">
          {resultado.linha.email || 'sem e-mail (convidado)'} · {formatarMinutos(resultado.linha.duracaoSeg)} nesta entrada
        </div>
      </div>

      {resultado.sugestoes.length > 0 && (
        <div>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Possíveis membros ({resultado.motivo.toLowerCase()})
          </div>
          <div className="resultados">{resultado.sugestoes.map(item)}</div>
        </div>
      )}

      <label className="campo campo-cheio">
        Buscar membro por nome ou e-mail
        <input autoFocus type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex.: Maria Silva" />
      </label>
      {termo.trim() && (
        <div className="resultados">
          {achados.length ? achados.map(item) : <p className="muted small" style={{ padding: 12, margin: 0 }}>Ninguém encontrado.</p>}
        </div>
      )}
      <p className="muted small" style={{ margin: 0 }}>
        A escolha fica salva: nos próximos encontros, esse mesmo nome + e-mail do Meet já vem ligado.
      </p>
    </Modal>
  );
}
