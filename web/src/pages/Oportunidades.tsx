import { memo, useDeferredValue, useMemo, useState } from 'react';
import { EditorNota, SelectorEstado } from '../components/EstadoEditor';
import { Cargando, Icono, RelevanciaBadge } from '../components/ui';
import { useDatos } from '../context/Datos';
import { ESTADOS, ETIQUETA_TIPO, MOTIVOS_DESCARTE, PAGINA } from '../lib/constantes';
import {
  cierraEn7Dias,
  compararPorRelevanciaYCierre,
  diasRestantes,
  esDescartePrefiltro,
  estaAbierta,
  fecha,
  fechaHora,
  monto,
  normalizar,
  relevanciaDe,
  textoBusqueda,
  textoCierre,
} from '../lib/helpers';
import type { Estado, Oportunidad, Relevancia, Umbrales } from '../lib/tipos';

type FiltroRel = 'relevantes' | Relevancia | 'todas';
type Vista = 'abiertas' | 'nuevas' | 'cierran7' | 'todas';

export function Oportunidades() {
  const { oportunidades, errorOportunidades, umbrales, ultimaCorrida } = useDatos();
  const [texto, setTexto] = useState('');
  const [fuente, setFuente] = useState('todas');
  const [rel, setRel] = useState<FiltroRel>('relevantes');
  const [estado, setEstado] = useState<Estado | 'todos'>('todos');
  const [vista, setVista] = useState<Vista>('abiertas');
  const [prefiltro, setPrefiltro] = useState(false);
  const [limite, setLimite] = useState(PAGINA);
  const busqueda = useDeferredValue(texto);

  const ahora = useMemo(() => new Date(), [oportunidades]); // eslint-disable-line react-hooks/exhaustive-deps

  // Índice de búsqueda: se recalcula solo cuando cambian los datos.
  const indice = useMemo(() => new Map((oportunidades ?? []).map((o) => [o.docId, textoBusqueda(o)])), [oportunidades]);

  const stats = useMemo(() => {
    const ops = oportunidades ?? [];
    let abiertasRel = 0;
    let nuevas = 0;
    let cierran = 0;
    for (const o of ops) {
      const abierta = estaAbierta(o, ahora);
      const r = relevanciaDe(o, umbrales);
      if (abierta && (r === 'alta' || r === 'media')) abiertasRel++;
      if (ultimaCorrida && o.detectadoCorrida === ultimaCorrida.id && !esDescartePrefiltro(o)) nuevas++;
      if (cierraEn7Dias(o, ahora) && (r === 'alta' || r === 'media')) cierran++;
    }
    return { abiertasRel, nuevas, cierran };
  }, [oportunidades, umbrales, ultimaCorrida, ahora]);

  const fuentesDisponibles = useMemo(() => [...new Set((oportunidades ?? []).flatMap((o) => o.fuentes))].sort(), [oportunidades]);

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda);
    const palabras = q.split(/\s+/).filter(Boolean);
    return (oportunidades ?? [])
      .filter((o) => {
        if (prefiltro) return esDescartePrefiltro(o);
        if (vista === 'abiertas' && !estaAbierta(o, ahora)) return false;
        if (vista === 'cierran7' && !cierraEn7Dias(o, ahora)) return false;
        if (vista === 'nuevas' && (!ultimaCorrida || o.detectadoCorrida !== ultimaCorrida.id || esDescartePrefiltro(o))) return false;
        const r = relevanciaDe(o, umbrales);
        if (rel === 'relevantes' && r !== 'alta' && r !== 'media') return false;
        if (rel !== 'relevantes' && rel !== 'todas' && r !== rel) return false;
        if (estado !== 'todos' && o.estado !== estado) return false;
        if (fuente !== 'todas' && !o.fuentes.includes(fuente)) return false;
        if (palabras.length) {
          const t = indice.get(o.docId) ?? '';
          if (!palabras.every((p) => t.includes(p))) return false;
        }
        return true;
      })
      .sort(compararPorRelevanciaYCierre(umbrales));
  }, [oportunidades, busqueda, vista, rel, estado, fuente, prefiltro, umbrales, ultimaCorrida, indice, ahora]);

  const limpiar = () => {
    setTexto('');
    setFuente('todas');
    setRel('relevantes');
    setEstado('todos');
    setVista('abiertas');
    setPrefiltro(false);
    setLimite(PAGINA);
  };
  const porDefecto = !texto && fuente === 'todas' && rel === 'relevantes' && estado === 'todos' && vista === 'abiertas' && !prefiltro;

  return (
    <>
      <div className="page-header">
        <div className="accent-bar" />
        <div className="header-row">
          <div>
            <h2>
              Oportunidades <span className="accent">abiertas</span>
            </h2>
            <p>
              {ultimaCorrida
                ? `Última corrida: ${fechaHora(ultimaCorrida.inicio)}${ultimaCorrida.estado === 'en_curso' ? ' (en curso)' : ''}`
                : 'Todavía no hay corridas registradas.'}
            </p>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <button className="stat s-orange" onClick={limpiar} aria-pressed={porDefecto}>
          <div className="stat-num">{stats.abiertasRel}</div>
          <div className="stat-label">Abiertas y relevantes</div>
        </button>
        <button
          className="stat s-free"
          onClick={() => {
            limpiar();
            setVista('nuevas');
            setRel('todas');
          }}
          aria-pressed={vista === 'nuevas'}
        >
          <div className="stat-num">{stats.nuevas}</div>
          <div className="stat-label">Nuevas en la última corrida</div>
        </button>
        <button
          className="stat s-bad"
          onClick={() => {
            limpiar();
            setVista('cierran7');
          }}
          aria-pressed={vista === 'cierran7'}
        >
          <div className="stat-num">{stats.cierran}</div>
          <div className="stat-label">Cierran en 7 días</div>
        </button>
      </div>

      <div className="card mb-2">
        <div className="card-body" style={{ padding: '1rem' }}>
          <div className="filtros">
            <div className="search busq">
              {Icono.buscar}
              <input className="input" type="search" placeholder="Buscar por título, organismo, nota…" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar" />
            </div>
            <select className="select" value={fuente} onChange={(e) => setFuente(e.target.value)} aria-label="Fuente">
              <option value="todas">Todas las fuentes</option>
              {fuentesDisponibles.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <select className="select" value={rel} onChange={(e) => setRel(e.target.value as FiltroRel)} aria-label="Relevancia" disabled={prefiltro}>
              <option value="relevantes">Alta y media</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
              <option value="sin_clasificar">Sin clasificar</option>
              <option value="todas">Todas las relevancias</option>
            </select>
            <select className="select" value={estado} onChange={(e) => setEstado(e.target.value as Estado | 'todos')} aria-label="Estado" disabled={prefiltro}>
              <option value="todos">Todos los estados</option>
              {ESTADOS.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="filtros-extra">
            <div className="seg" role="group" aria-label="Vista">
              {(
                [
                  ['abiertas', 'Abiertas'],
                  ['nuevas', 'Nuevas'],
                  ['cierran7', 'Cierran en 7 días'],
                  ['todas', 'Abiertas y cerradas'],
                ] as [Vista, string][]
              ).map(([v, t]) => (
                <button key={v} className={vista === v && !prefiltro ? 'on' : ''} onClick={() => setVista(v)} disabled={prefiltro}>
                  {t}
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={prefiltro} onChange={(e) => setPrefiltro(e.target.checked)} />
              Descartados por el prefiltro (auditoría)
            </label>
            {!porDefecto && (
              <button className="btn btn-ghost btn-sm" onClick={limpiar}>
                Volver a la vista por defecto
              </button>
            )}
          </div>
        </div>
      </div>

      {errorOportunidades && <div className="alert alert-error">No se pudieron leer las oportunidades: {errorOportunidades}</div>}
      {oportunidades === null ? (
        <Cargando />
      ) : (
        <>
          <div className="resultados" aria-live="polite">
            {filtradas.length === 1 ? '1 llamado' : `${filtradas.length} llamados`}
            {prefiltro && ' descartados por el prefiltro'}
          </div>
          {filtradas.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <span className="ei" aria-hidden>
                  ◎
                </span>
                No hay llamados con estos filtros.
              </div>
            </div>
          ) : (
            <div className="op-list">
              {filtradas.slice(0, limite).map((o) => (
                <TarjetaOportunidad key={o.docId} op={o} umbrales={umbrales} nueva={!!ultimaCorrida && o.detectadoCorrida === ultimaCorrida.id} ahora={ahora} />
              ))}
            </div>
          )}
          {filtradas.length > limite && (
            <div className="ver-mas">
              <button className="btn btn-outline" onClick={() => setLimite((l) => l + PAGINA)}>
                Ver {Math.min(PAGINA, filtradas.length - limite)} más ({filtradas.length - limite} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

const TarjetaOportunidad = memo(function TarjetaOportunidad({
  op,
  umbrales,
  nueva,
  ahora,
}: {
  op: Oportunidad;
  umbrales: Umbrales | null;
  nueva: boolean;
  ahora: Date;
}) {
  const r = relevanciaDe(op, umbrales);
  const dias = diasRestantes(op.cierre, ahora);
  const abierta = estaAbierta(op, ahora);
  const claseCierre = dias === null ? 'confirmar' : abierta && dias <= 3 && dias >= 0 ? 'urgente' : '';
  const motivoDesc = op.motivoDescarte ? MOTIVOS_DESCARTE.find((m) => m.clave === op.motivoDescarte?.codigo)?.etiqueta : null;

  return (
    <article className={`op r-${r}`}>
      <div style={{ minWidth: 0 }}>
        <div className="op-head">
          {nueva && <span className="badge badge-nueva">Nueva</span>}
          <RelevanciaBadge relevancia={r} puntaje={op.puntaje} />
          {op.fuentes.map((f) => (
            <span key={f} className="fuente-chip">
              {f}
            </span>
          ))}
          {op.manual && <span className="badge badge-soft">Manual</span>}
        </div>
        {op.url ? (
          <a className="op-title" href={op.url} target="_blank" rel="noopener noreferrer">
            {op.titulo}
          </a>
        ) : (
          <span className="op-title">{op.titulo}</span>
        )}
        <div className="op-meta">
          <span>
            <strong>{op.organismo}</strong>
          </span>
          {op.pais && <span>{op.pais}</span>}
          {op.tipo && <span>{ETIQUETA_TIPO[op.tipo]}</span>}
          {op.financiador && <span>Financia: {op.financiador}</span>}
          {op.monto != null && <span>Monto estimado: {monto(op.monto, op.moneda)}</span>}
          {op.pais === 'Paraguay' && op.admiteExtranjeras != null && (
            <span>{op.admiteExtranjeras ? 'Admite firmas extranjeras' : 'No admite firmas extranjeras'}</span>
          )}
        </div>
        {op.resumen && <p className="op-resumen">{op.resumen}</p>}
        {op.motivo && (
          <p className="op-motivo">
            <b>{r === 'sin_clasificar' ? 'Pendiente:' : esDescartePrefiltro(op) ? 'Prefiltro:' : `Por qué salió ${r}:`}</b> {op.motivo}
          </p>
        )}
        {r === 'sin_clasificar' && !op.motivo && (
          <p className="op-motivo">
            <b>Pendiente:</b> el clasificador no respondió; se reintenta en la próxima corrida.
          </p>
        )}
      </div>
      <div className="op-side">
        <div className={`cierre ${claseCierre}`}>
          {textoCierre(op.cierre, ahora)}
          <span className="sub">{op.cierre ? `Cierre: ${fechaHora(op.cierre)}` : 'Sin fecha de cierre publicada'}</span>
          {op.publicado && <span className="sub">Publicado: {fecha(op.publicado)}</span>}
        </div>
        <SelectorEstado op={op} />
        {op.estado === 'descartada' && motivoDesc && (
          <div className="descarte">
            Descartada por <strong>{motivoDesc.toLowerCase()}</strong>
            {op.motivoDescarte?.texto ? `: ${op.motivoDescarte.texto}` : ''}
          </div>
        )}
        <EditorNota op={op} />
      </div>
    </article>
  );
});
