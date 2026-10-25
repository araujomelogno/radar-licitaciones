import { Fragment, useDeferredValue, useMemo, useState } from 'react';
import { SelectorEstado } from '../components/EstadoEditor';
import { Cargando, Icono, Modal, RelevanciaBadge } from '../components/ui';
import { useDatos } from '../context/Datos';
import { useToast } from '../context/Toasts';
import { api } from '../data';
import { CANALES_MANUALES, ESTADOS, ETIQUETA_ESTADO, PAGINA } from '../lib/constantes';
import {
  desdeFechaInput,
  descargarArchivo,
  diaLocal,
  estaAbierta,
  fecha,
  fechaHora,
  normalizar,
  registroACsv,
  relevanciaDe,
  textoBusqueda,
} from '../lib/helpers';
import type { EntradaHistorial, Estado, NuevoManual, Oportunidad, Pais } from '../lib/tipos';

function anioDe(o: Oportunidad): string {
  const d = o.publicado ?? o.detectado ?? o.cierre;
  return d ? diaLocal(d).slice(0, 4) : '';
}

export function Registro() {
  const { oportunidades, umbrales, puedeEditar } = useDatos();
  const [texto, setTexto] = useState('');
  const [fuente, setFuente] = useState('todas');
  const [anio, setAnio] = useState('todos');
  const [estado, setEstado] = useState<Estado | 'todos'>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAGINA);
  const [cargando, setCargando] = useState(false);
  const busqueda = useDeferredValue(texto);

  const ops = useMemo(() => oportunidades ?? [], [oportunidades]);
  const indice = useMemo(() => new Map(ops.map((o) => [o.docId, textoBusqueda(o)])), [ops]);
  const anios = useMemo(() => [...new Set(ops.map(anioDe).filter(Boolean))].sort().reverse(), [ops]);
  const fuentes = useMemo(() => [...new Set(ops.flatMap((o) => o.fuentes))].sort(), [ops]);

  // Filtros de fuente, año y texto (los chips de estado cuentan sobre este subconjunto).
  const base = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    return ops.filter((o) => {
      if (fuente !== 'todas' && !o.fuentes.includes(fuente)) return false;
      if (anio !== 'todos' && anioDe(o) !== anio) return false;
      if (palabras.length) {
        const t = indice.get(o.docId) ?? '';
        if (!palabras.every((p) => t.includes(p))) return false;
      }
      return true;
    });
  }, [ops, fuente, anio, busqueda, indice]);

  const conteos = useMemo(() => {
    const c = Object.fromEntries(ESTADOS.map((e) => [e.clave, 0])) as Record<Estado, number>;
    for (const o of base) c[o.estado]++;
    return c;
  }, [base]);

  const filas = useMemo(
    () =>
      base
        .filter((o) => estado === 'todos' || o.estado === estado)
        .sort((a, b) => (b.detectado?.getTime() ?? b.publicado?.getTime() ?? 0) - (a.detectado?.getTime() ?? a.publicado?.getTime() ?? 0)),
    [base, estado],
  );

  const exportar = () => {
    descargarArchivo(`registro-radar-${diaLocal(new Date())}.csv`, registroACsv(filas, umbrales));
  };

  return (
    <>
      <div className="page-header">
        <div className="accent-bar" />
        <div className="header-row">
          <div>
            <h2>
              Registro <span className="accent">de llamados</span>
            </h2>
            <p>Todos los llamados, abiertos y cerrados, con su historial de estados y cierres.</p>
          </div>
          <div className="toolbar">
            <button className="btn btn-outline" onClick={exportar} disabled={!filas.length}>
              Exportar CSV
            </button>
            {puedeEditar && (
              <button className="btn btn-orange" onClick={() => setCargando(true)}>
                + Cargar llamado
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="chip-row mb-2" role="group" aria-label="Filtrar por estado">
        <button className={`est est-descartada ${estado === 'todos' ? 'on' : ''}`} onClick={() => setEstado('todos')} aria-pressed={estado === 'todos'}>
          Todos <span className="n">{base.length}</span>
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e.clave}
            className={`est est-${e.clave} ${estado === e.clave ? 'on' : ''}`}
            onClick={() => setEstado(estado === e.clave ? 'todos' : e.clave)}
            aria-pressed={estado === e.clave}
          >
            {e.etiqueta} <span className="n">{conteos[e.clave]}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="filtros filtros-3">
            <div className="search busq">
              {Icono.buscar}
              <input className="input" type="search" placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar en el registro" />
            </div>
            <select className="select" value={fuente} onChange={(e) => setFuente(e.target.value)} aria-label="Fuente">
              <option value="todas">Todas las fuentes</option>
              {fuentes.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <select className="select" value={anio} onChange={(e) => setAnio(e.target.value)} aria-label="Año">
              <option value="todos">Todos los años</option>
              {anios.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="card-body tight">
          {oportunidades === null ? (
            <Cargando />
          ) : filas.length === 0 ? (
            <div className="empty-state">No hay llamados con estos filtros.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th aria-label="Historial" style={{ width: 40 }} />
                    <th>Llamado</th>
                    <th>Fuentes</th>
                    <th>Cierre</th>
                    <th>Relevancia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, limite).map((o) => {
                    const exp = abierto === o.docId;
                    return (
                      <Fragment key={o.docId}>
                        <tr className="fila">
                          <td>
                            <button
                              className="expand-btn"
                              aria-expanded={exp}
                              aria-label={exp ? 'Ocultar historial' : 'Ver historial'}
                              onClick={() => setAbierto(exp ? null : o.docId)}
                            >
                              ▶
                            </button>
                          </td>
                          <td className="titulo-celda">
                            {o.url ? (
                              <a href={o.url} target="_blank" rel="noopener noreferrer">
                                {o.titulo}
                              </a>
                            ) : (
                              <span className="td-strong">{o.titulo}</span>
                            )}
                            <div className="org">
                              {o.organismo}
                              {o.pais ? ` · ${o.pais}` : ''} · <span className="mono">{o.docId}</span>
                            </div>
                          </td>
                          <td style={{ maxWidth: 180 }}>
                            <div className="chip-row">
                              {o.fuentes.map((f) => (
                                <span key={f} className="fuente-chip">
                                  {f}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="nowrap">
                            {o.cierre ? fecha(o.cierre) : <span className="muted">A confirmar</span>}
                            {!estaAbierta(o) && <div className="small muted">Cerrado</div>}
                          </td>
                          <td>
                            <RelevanciaBadge relevancia={relevanciaDe(o, umbrales)} />
                          </td>
                          <td style={{ minWidth: 160 }}>
                            <SelectorEstado op={o} compacto />
                          </td>
                        </tr>
                        {exp && (
                          <tr className="hist-row">
                            <td />
                            <td colSpan={5}>
                              <Historial op={o} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {filas.length > limite && (
        <div className="ver-mas">
          <button className="btn btn-outline" onClick={() => setLimite((l) => l + PAGINA * 2)}>
            Ver más ({filas.length - limite} restantes)
          </button>
        </div>
      )}
      {cargando && <ModalCarga onCerrar={() => setCargando(false)} />}
    </>
  );
}

function describir(h: EntradaHistorial): string {
  const est = (v: string | null) => (v ? (ETIQUETA_ESTADO[v as Estado] ?? v) : '—');
  const fch = (v: string | null) => {
    if (!v) return 'a confirmar';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : fechaHora(d);
  };
  switch (h.tipo) {
    case 'alta':
      return `Alta${h.detalle ? ` · ${h.detalle}` : ''}`;
    case 'estado':
      return `Estado: ${est(h.de)} → ${est(h.a)}${h.detalle ? ` · ${h.detalle}` : ''}`;
    case 'cierre':
      return `Cierre: ${fch(h.de)} → ${fch(h.a)}${h.detalle ? ` · ${h.detalle}` : ''}`;
    case 'nota':
      return `Nota: “${h.a ?? ''}”`;
    case 'fusion':
      return `Fusionado con ${h.a ?? 'otra fuente'}${h.detalle ? ` · ${h.detalle}` : ''}`;
    case 'migracion':
      return `Migrado del radar anterior${h.detalle ? ` · ${h.detalle}` : ''}`;
    default:
      return h.detalle ?? '';
  }
}

function Historial({ op }: { op: Oportunidad }) {
  const lista = [...op.historial].sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));
  return (
    <div>
      {op.nota && (
        <p className="small mb-2">
          <strong>Nota actual:</strong> {op.nota}
        </p>
      )}
      {lista.length === 0 ? (
        <p className="small muted">Sin historial registrado.</p>
      ) : (
        <ul className="hist">
          {lista.map((h, i) => (
            <li key={i}>
              <span className="cuando">{fechaHora(h.fecha)}</span>
              <span>
                {describir(h)} <span className="quien">· {h.autor === 'radar' ? 'Radar' : h.autor}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModalCarga({ onCerrar }: { onCerrar: () => void }) {
  const { email } = useDatos();
  const toast = useToast();
  const [d, setD] = useState({ titulo: '', organismo: '', pais: '', canal: 'BEO', cierre: '', estado: 'nueva', url: '' });
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const urlValida = !d.url || /^https?:\/\/\S+$/i.test(d.url.trim());
  const valido = d.titulo.trim().length > 2 && d.organismo.trim().length > 1 && urlValida;
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });

  const guardar = async () => {
    setIntentado(true);
    if (!valido) return;
    setGuardando(true);
    const datos: NuevoManual = {
      titulo: d.titulo,
      organismo: d.organismo,
      pais: (d.pais || null) as Pais | null,
      canal: d.canal as NuevoManual['canal'],
      cierre: desdeFechaInput(d.cierre),
      estado: d.estado as Estado,
      url: d.url.trim(),
    };
    try {
      await api.crearManual(datos, email);
      toast('Llamado cargado. No se reclasifica en las corridas.', 'ok');
      onCerrar();
    } catch (e) {
      toast(`No se pudo cargar: ${(e as Error).message}`, 'err');
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Cargar llamado a mano"
      onCerrar={onCerrar}
      pie={
        <>
          <button className="btn btn-outline" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn btn-orange" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Cargar'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label htmlFor="m-titulo">
          Título <span className="req">*</span>
        </label>
        <input id="m-titulo" className="input" value={d.titulo} onChange={set('titulo')} placeholder="Tipo y número del llamado + objeto" />
        {intentado && d.titulo.trim().length <= 2 && <div className="field-error">El título es obligatorio.</div>}
      </div>
      <div className="form-group">
        <label htmlFor="m-org">
          Organismo <span className="req">*</span>
        </label>
        <input id="m-org" className="input" value={d.organismo} onChange={set('organismo')} />
        {intentado && d.organismo.trim().length <= 1 && <div className="field-error">El organismo es obligatorio.</div>}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="m-canal">Canal</label>
          <select id="m-canal" className="select" value={d.canal} onChange={set('canal')}>
            {CANALES_MANUALES.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="m-pais">País</label>
          <select id="m-pais" className="select" value={d.pais} onChange={set('pais')}>
            <option value="">Sin indicar</option>
            <option>Uruguay</option>
            <option>Paraguay</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="m-cierre">Cierre</label>
          <input id="m-cierre" className="input" type="date" value={d.cierre} onChange={set('cierre')} />
          <div className="field-hint">Sin hora se toma a las 23:59 de Montevideo.</div>
        </div>
        <div className="form-group">
          <label htmlFor="m-estado">Estado</label>
          <select id="m-estado" className="select" value={d.estado} onChange={set('estado')}>
            {ESTADOS.filter((e) => e.clave !== 'descartada').map((e) => (
              <option key={e.clave} value={e.clave}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="m-url">Link</label>
        <input id="m-url" className="input" type="url" value={d.url} onChange={set('url')} placeholder="https://…" />
        {intentado && !urlValida && <div className="field-error">El link tiene que empezar con http:// o https://.</div>}
      </div>
    </Modal>
  );
}
