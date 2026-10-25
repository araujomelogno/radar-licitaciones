import { useEffect, useState } from 'react';
import { useDatos } from '../context/Datos';
import { useToast } from '../context/Toasts';
import { api } from '../data';
import { ESTADOS, MOTIVOS_DESCARTE } from '../lib/constantes';
import type { Estado, MotivoCodigo, Oportunidad } from '../lib/tipos';
import { EstadoChip, Modal } from './ui';

/** Selector de estado. Elegir “Descartada” obliga a dar un motivo antes de guardar. */
export function SelectorEstado({ op, compacto }: { op: Oportunidad; compacto?: boolean }) {
  const { puedeEditar, email } = useDatos();
  const toast = useToast();
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  if (!puedeEditar) return <EstadoChip estado={op.estado} />;

  const cambiar = async (nuevo: Estado) => {
    if (nuevo === op.estado) return;
    if (nuevo === 'descartada') {
      setPidiendoMotivo(true);
      return;
    }
    setGuardando(true);
    try {
      await api.cambiarEstado(op, { nuevo }, email);
    } catch (e) {
      toast(`No se pudo cambiar el estado: ${(e as Error).message}`, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <select
        className={`select ${compacto ? 'select-sm' : ''}`}
        value={op.estado}
        disabled={guardando}
        onChange={(e) => cambiar(e.target.value as Estado)}
        aria-label={`Estado de ${op.titulo}`}
      >
        {ESTADOS.map((e) => (
          <option key={e.clave} value={e.clave}>
            {e.etiqueta}
          </option>
        ))}
      </select>
      {pidiendoMotivo && <ModalDescarte op={op} onCerrar={() => setPidiendoMotivo(false)} />}
    </>
  );
}

function ModalDescarte({ op, onCerrar }: { op: Oportunidad; onCerrar: () => void }) {
  const { email } = useDatos();
  const toast = useToast();
  const [codigo, setCodigo] = useState<MotivoCodigo | ''>('');
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const valido = codigo !== '' && (codigo !== 'otro' || texto.trim().length > 2);

  const confirmar = async () => {
    if (!valido) return;
    setGuardando(true);
    try {
      await api.cambiarEstado(op, { nuevo: 'descartada', motivoDescarte: { codigo, texto: texto.trim() } }, email);
      toast('Llamado descartado. El radar va a usar el motivo para aprender.', 'ok');
      onCerrar();
    } catch (e) {
      toast(`No se pudo descartar: ${(e as Error).message}`, 'err');
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="¿Por qué se descarta?"
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn btn-outline" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn btn-orange" disabled={!valido || guardando} onClick={confirmar}>
            {guardando ? 'Guardando…' : 'Descartar'}
          </button>
        </>
      }
    >
      <p className="small muted mb-2">{op.titulo}</p>
      <fieldset style={{ border: 'none' }}>
        <legend className="label">
          Motivo <span className="req">*</span>
        </legend>
        <div className="seg" role="radiogroup">
          {MOTIVOS_DESCARTE.map((m) => (
            <button key={m.clave} type="button" role="radio" aria-checked={codigo === m.clave} className={codigo === m.clave ? 'on' : ''} onClick={() => setCodigo(m.clave)}>
              {m.etiqueta}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-group mt-2">
        <label htmlFor="desc-texto">
          Detalle {codigo === 'otro' ? <span className="req">*</span> : <span className="muted">(opcional)</span>}
        </label>
        <textarea id="desc-texto" className="textarea" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: pide experiencia en 3 países" />
        {codigo === 'otro' && texto.trim().length <= 2 && <div className="field-hint">Con “Otro” hay que escribir el motivo.</div>}
      </div>
    </Modal>
  );
}

/** Nota editable. Si otro usuario la cambia mientras no estás editando, se actualiza sola. */
export function EditorNota({ op }: { op: Oportunidad }) {
  const { puedeEditar, email } = useDatos();
  const toast = useToast();
  const [borrador, setBorrador] = useState(op.nota ?? '');
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!editando) setBorrador(op.nota ?? '');
  }, [op.nota, editando]);

  if (!puedeEditar) return op.nota ? <div className="nota-view">{op.nota}</div> : null;

  const sucio = borrador !== (op.nota ?? '');
  const guardar = async () => {
    setGuardando(true);
    try {
      await api.guardarNota(op, borrador.trim(), email);
      setEditando(false);
    } catch (e) {
      toast(`No se pudo guardar la nota: ${(e as Error).message}`, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div>
      <textarea
        className="textarea"
        rows={2}
        value={borrador}
        placeholder="Nota (responsable, próximos pasos…)"
        aria-label={`Nota de ${op.titulo}`}
        onFocus={() => setEditando(true)}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={() => !sucio && setEditando(false)}
        style={{ minHeight: 56, fontSize: '0.8rem' }}
      />
      {sucio && (
        <div className="flex mt-1">
          <button className="btn btn-orange btn-sm" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar nota'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setBorrador(op.nota ?? '');
              setEditando(false);
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
