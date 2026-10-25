import { Fragment, useEffect, useMemo, useState } from 'react';
import { Cargando, TagInput } from '../components/ui';
import { useDatos } from '../context/Datos';
import { useToast } from '../context/Toasts';
import { api } from '../data';
import { DOMINIO, ETIQUETA_METODO, ETIQUETA_ROL, MAX_KEYWORDS } from '../lib/constantes';
import { esEmailDominio, fechaHora, hora, iniciales, sinDuplicados } from '../lib/helpers';
import type { Antecedente, ConfigBusqueda, ConfigPerfil, Corrida, Fuente, MetodoAcceso, Moneda, Rol } from '../lib/tipos';

type Tab = 'perfil' | 'busqueda' | 'fuentes' | 'usuarios';
const TABS: { id: Tab; t: string }[] = [
  { id: 'perfil', t: 'Perfil' },
  { id: 'busqueda', t: 'Búsqueda' },
  { id: 'fuentes', t: 'Fuentes' },
  { id: 'usuarios', t: 'Usuarios' },
];

export function Configuracion() {
  const { config } = useDatos();
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.replace('#', '') as Tab;
    return TABS.some((t) => t.id === h) ? h : 'perfil';
  });
  useEffect(() => {
    const alCambiar = () => {
      const h = location.hash.replace('#', '') as Tab;
      if (TABS.some((t) => t.id === h)) setTab(h);
    };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  const cambiarTab = (t: Tab) => {
    setTab(t);
    history.replaceState(null, '', `#${t}`);
  };

  return (
    <>
      <div className="page-header">
        <div className="accent-bar" />
        <h2>
          Configuración <span className="accent">del radar</span>
        </h2>
        <p>Cada cambio guardado sube la versión, queda en la auditoría y rige en la corrida siguiente.</p>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => cambiarTab(t.id)}>
            {t.t}
          </button>
        ))}
      </div>
      {!config && (tab === 'perfil' || tab === 'busqueda') ? (
        <Cargando />
      ) : (
        <>
          {tab === 'perfil' && config && <TabPerfil perfil={config.perfil} />}
          {tab === 'busqueda' && config && <TabBusqueda busqueda={config.busqueda} />}
          {tab === 'fuentes' && <TabFuentes />}
          {tab === 'usuarios' && <TabUsuarios />}
        </>
      )}
    </>
  );
}

/** Borrador local de un documento de config: se resincroniza si cambia afuera y no hay cambios sin guardar. */
function useBorrador<T>(remoto: T, limpiar: (v: T) => object) {
  const [borrador, setBorrador] = useState<T>(remoto);
  const [base, setBase] = useState<T>(remoto);
  const sucio = JSON.stringify(limpiar(borrador)) !== JSON.stringify(limpiar(base));
  useEffect(() => {
    if (!sucio) {
      setBorrador(remoto);
    }
    setBase(remoto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoto]);
  return { borrador, setBorrador, sucio, descartar: () => setBorrador(base) };
}

function BarraGuardar({ sucio, guardando, onGuardar, onDescartar, version, actualizado, por, error }: {
  sucio: boolean;
  guardando: boolean;
  onGuardar: () => void;
  onDescartar: () => void;
  version?: number;
  actualizado?: Date | null;
  por?: string;
  error?: string | null;
}) {
  return (
    <div className="savebar">
      <div className="info">
        {error ? (
          <span className="field-error">{error}</span>
        ) : sucio ? (
          <strong style={{ color: 'var(--amber)' }}>Hay cambios sin guardar.</strong>
        ) : (
          <>
            Versión {version ?? 0}
            {actualizado ? ` · guardada el ${fechaHora(actualizado)}` : ''}
            {por ? ` por ${por}` : ''}
          </>
        )}
      </div>
      <div className="flex">
        <button className="btn btn-outline btn-sm" disabled={!sucio || guardando} onClick={onDescartar}>
          Descartar
        </button>
        <button className="btn btn-orange btn-sm" disabled={!sucio || guardando || !!error} onClick={onGuardar}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

// ── Perfil ──────────────────────────────────────────────────────────────
const sinMeta = ({ version: _v, actualizado: _a, actualizadoPor: _p, ...r }: { version?: number; actualizado?: Date | null; actualizadoPor?: string }) => r;

function TabPerfil({ perfil }: { perfil: ConfigPerfil }) {
  const { email } = useDatos();
  const toast = useToast();
  const { borrador: p, setBorrador, sucio, descartar } = useBorrador(perfil, sinMeta);
  const [guardando, setGuardando] = useState(false);
  const set = <K extends keyof ConfigPerfil>(k: K, v: ConfigPerfil[K]) => setBorrador({ ...p, [k]: v });
  const setAnt = (i: number, cambios: Partial<Antecedente>) => set('antecedentes', p.antecedentes.map((a, j) => (j === i ? { ...a, ...cambios } : a)));
  const num = (v: string) => (v === '' ? null : Number(v));

  const error =
    p.rangoMonto.min != null && p.rangoMonto.max != null && p.rangoMonto.min > p.rangoMonto.max
      ? 'El monto mínimo no puede ser mayor que el máximo.'
      : p.antecedentes.some((a) => !a.titulo.trim())
        ? 'Cada antecedente necesita un título.'
        : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      await api.guardarConfig(
        'perfil',
        {
          servicios: sinDuplicados(p.servicios),
          sectores: sinDuplicados(p.sectores),
          antecedentes: p.antecedentes.map((a) => ({ ...a, titulo: a.titulo.trim(), cliente: a.cliente.trim() })),
          paises: p.paises,
          rangoMonto: p.rangoMonto,
        },
        email,
      );
      toast('Perfil guardado. Rige en la próxima corrida.', 'ok');
    } catch (e) {
      toast(`No se pudo guardar: ${(e as Error).message}`, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="config-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-header-title">Servicios</div>
          </div>
          <div className="card-body">
            <TagInput valor={p.servicios} onChange={(v) => set('servicios', v)} placeholder="Ej.: encuestas de hogares" />
            <p className="field-hint">Lo que hace la firma. Va en el prompt del clasificador.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-header-title">Sectores</div>
          </div>
          <div className="card-body">
            <TagInput valor={p.sectores} onChange={(v) => set('sectores', v)} placeholder="Ej.: salud, educación" />
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-header">
          <div className="card-header-title">Países y rango de monto</div>
        </div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group">
              <span className="label">Países aceptados</span>
              <div className="flex">
                {['Uruguay', 'Paraguay'].map((pais) => (
                  <label key={pais} className="check">
                    <input
                      type="checkbox"
                      checked={p.paises.includes(pais)}
                      onChange={(e) => set('paises', e.target.checked ? [...p.paises, pais] : p.paises.filter((x) => x !== pais))}
                    />
                    {pais}
                  </label>
                ))}
              </div>
              <p className="field-hint">Regla estricta: un estudio multipaís entra solo si nombra a uno de estos países.</p>
            </div>
            <div className="form-row-3" style={{ gridTemplateColumns: '1fr 1fr 110px' }}>
              <div className="form-group">
                <label htmlFor="p-min">Mínimo</label>
                <input id="p-min" className="input" type="number" min={0} value={p.rangoMonto.min ?? ''} onChange={(e) => set('rangoMonto', { ...p.rangoMonto, min: num(e.target.value) })} />
              </div>
              <div className="form-group">
                <label htmlFor="p-max">Máximo</label>
                <input id="p-max" className="input" type="number" min={0} value={p.rangoMonto.max ?? ''} onChange={(e) => set('rangoMonto', { ...p.rangoMonto, max: num(e.target.value) })} />
              </div>
              <div className="form-group">
                <label htmlFor="p-mon">Moneda</label>
                <select id="p-mon" className="select" value={p.rangoMonto.moneda} onChange={(e) => set('rangoMonto', { ...p.rangoMonto, moneda: e.target.value as Moneda })}>
                  <option>USD</option>
                  <option>UYU</option>
                  <option>PYG</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-header">
          <div className="card-header-title">Antecedentes ({p.antecedentes.length})</div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => set('antecedentes', [...p.antecedentes, { titulo: '', cliente: '', anio: new Date().getFullYear(), monto: null, moneda: 'USD' }])}
          >
            + Agregar
          </button>
        </div>
        <div className="card-body tight">
          {p.antecedentes.length === 0 ? (
            <div className="empty-state">Sin antecedentes cargados.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Cliente</th>
                    <th>Año</th>
                    <th>Monto</th>
                    <th>Moneda</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {p.antecedentes.map((a, i) => (
                    <tr key={i}>
                      <td style={{ minWidth: 220 }}>
                        <input className="input input-sm" value={a.titulo} onChange={(e) => setAnt(i, { titulo: e.target.value })} aria-label="Título" />
                      </td>
                      <td style={{ minWidth: 150 }}>
                        <input className="input input-sm" value={a.cliente} onChange={(e) => setAnt(i, { cliente: e.target.value })} aria-label="Cliente" />
                      </td>
                      <td style={{ width: 100 }}>
                        <input className="input input-sm" type="number" value={a.anio ?? ''} onChange={(e) => setAnt(i, { anio: num(e.target.value) })} aria-label="Año" />
                      </td>
                      <td style={{ width: 140 }}>
                        <input className="input input-sm" type="number" value={a.monto ?? ''} onChange={(e) => setAnt(i, { monto: num(e.target.value) })} aria-label="Monto" />
                      </td>
                      <td style={{ width: 100 }}>
                        <select className="select select-sm" value={a.moneda} onChange={(e) => setAnt(i, { moneda: e.target.value as Moneda })} aria-label="Moneda">
                          <option>USD</option>
                          <option>UYU</option>
                          <option>PYG</option>
                        </select>
                      </td>
                      <td>
                        <button className="icon-btn" aria-label={`Quitar ${a.titulo || 'antecedente'}`} onClick={() => set('antecedentes', p.antecedentes.filter((_, j) => j !== i))}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <BarraGuardar sucio={sucio} guardando={guardando} onGuardar={guardar} onDescartar={descartar} version={perfil.version} actualizado={perfil.actualizado} por={perfil.actualizadoPor} error={error} />
    </>
  );
}

// ── Búsqueda ────────────────────────────────────────────────────────────
function TabBusqueda({ busqueda }: { busqueda: ConfigBusqueda }) {
  const { email, fuentes } = useDatos();
  const toast = useToast();
  const { borrador: b, setBorrador, sucio, descartar } = useBorrador(busqueda, sinMeta);
  const [guardando, setGuardando] = useState(false);
  const [fuenteSel, setFuenteSel] = useState('');
  const set = <K extends keyof ConfigBusqueda>(k: K, v: ConfigBusqueda[K]) => setBorrador({ ...b, [k]: v });
  const fuenteActual = fuenteSel || fuentes[0]?.id || '';
  const pf = b.porFuente[fuenteActual] ?? { incluir: [], excluir: [] };
  const setPf = (k: 'incluir' | 'excluir', v: string[]) => set('porFuente', { ...b.porFuente, [fuenteActual]: { ...pf, [k]: v } });

  const error =
    !(b.umbrales.alta > b.umbrales.media) ? 'El umbral de “alta” tiene que ser mayor que el de “media”.'
    : b.umbrales.alta > 100 || b.umbrales.media < 0 ? 'Los umbrales van de 0 a 100.'
    : !(b.ventanaDias >= 1 && b.ventanaDias <= 60) ? 'La ventana tiene que estar entre 1 y 60 días.'
    : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      // Se limpian las fuentes sin keywords para no guardar entradas vacías.
      const porFuente = Object.fromEntries(
        Object.entries(b.porFuente)
          .map(([k, v]) => [k, { incluir: sinDuplicados(v.incluir).slice(0, MAX_KEYWORDS), excluir: sinDuplicados(v.excluir).slice(0, MAX_KEYWORDS) }] as const)
          .filter(([, v]) => v.incluir.length || v.excluir.length),
      );
      await api.guardarConfig(
        'busqueda',
        {
          incluir: sinDuplicados(b.incluir).slice(0, MAX_KEYWORDS),
          excluir: sinDuplicados(b.excluir).slice(0, MAX_KEYWORDS),
          excluirRubros: sinDuplicados(b.excluirRubros).slice(0, MAX_KEYWORDS),
          porFuente,
          umbrales: { alta: Math.round(b.umbrales.alta), media: Math.round(b.umbrales.media) },
          ventanaDias: Math.round(b.ventanaDias),
        },
        email,
      );
      toast('Búsqueda guardada. Rige en la próxima corrida.', 'ok');
    } catch (e) {
      toast(`No se pudo guardar: ${(e as Error).message}`, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="config-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-header-title">Keywords a incluir · globales</div>
          </div>
          <div className="card-body">
            <TagInput valor={b.incluir} onChange={(v) => set('incluir', v)} placeholder="Ej.: línea de base" />
            <p className="field-hint">Pasa al clasificador si tiene al menos una en el título, la descripción o los ítems.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-header-title">Excluir por palabra · globales</div>
          </div>
          <div className="card-body">
            <TagInput valor={b.excluir} onChange={(v) => set('excluir', v)} placeholder="Ej.: encuesta de precios" />
            <p className="field-hint">Evitan falsos positivos. Lo excluido queda como “baja” con el motivo, auditable.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-header-title">Exclusiones temáticas</div>
          </div>
          <div className="card-body">
            <TagInput valor={b.excluirRubros} onChange={(v) => set('excluirRubros', v)} placeholder="Ej.: obras, suministros" />
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-header-title">Umbrales de relevancia</div>
          </div>
          <div className="card-body">
            <div className="form-row-3">
              <div className="form-group">
                <label htmlFor="u-alta">Alta desde</label>
                <input id="u-alta" className="input" type="number" min={0} max={100} value={b.umbrales.alta} onChange={(e) => set('umbrales', { ...b.umbrales, alta: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label htmlFor="u-media">Media desde</label>
                <input id="u-media" className="input" type="number" min={0} max={100} value={b.umbrales.media} onChange={(e) => set('umbrales', { ...b.umbrales, media: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label htmlFor="u-ventana">Ventana (días)</label>
                <input id="u-ventana" className="input" type="number" min={1} max={60} value={b.ventanaDias} onChange={(e) => set('ventanaDias', Number(e.target.value))} />
              </div>
            </div>
            <p className="field-hint">
              Puntaje ≥ {b.umbrales.alta} es alta, de {b.umbrales.media} a {b.umbrales.alta - 1} media, menos de {b.umbrales.media} baja. Cambiar un umbral no obliga a reclasificar.
            </p>
          </div>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-header">
          <div className="card-header-title">Keywords por fuente</div>
          <select className="select select-sm" style={{ width: 'auto' }} value={fuenteActual} onChange={(e) => setFuenteSel(e.target.value)} aria-label="Fuente">
            {fuentes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
                {b.porFuente[f.id] && (b.porFuente[f.id].incluir.length || b.porFuente[f.id].excluir.length) ? ' •' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="card-body">
          <div className="form-row">
            <div>
              <span className="label">Incluir solo en esta fuente</span>
              <TagInput key={`i-${fuenteActual}`} valor={pf.incluir} onChange={(v) => setPf('incluir', v)} />
            </div>
            <div>
              <span className="label">Excluir solo en esta fuente</span>
              <TagInput key={`e-${fuenteActual}`} valor={pf.excluir} onChange={(v) => setPf('excluir', v)} />
            </div>
          </div>
        </div>
      </div>

      <BarraGuardar sucio={sucio} guardando={guardando} onGuardar={guardar} onDescartar={descartar} version={busqueda.version} actualizado={busqueda.actualizado} por={busqueda.actualizadoPor} error={error} />
    </>
  );
}

// ── Fuentes ─────────────────────────────────────────────────────────────
const ESTADO_FUENTE: Record<string, { clase: string; dot: string; t: string }> = {
  ok: { clase: 'badge-on', dot: 'dot-ok', t: 'OK' },
  error: { clase: 'badge-err', dot: 'dot-err', t: 'Error' },
  bloqueo: { clase: 'badge-err', dot: 'dot-err', t: 'Bloqueo de acceso' },
  omitida: { clase: 'badge-off', dot: 'dot-off', t: 'Omitida' },
  en_curso: { clase: 'badge-warn', dot: 'dot-warn', t: 'En curso' },
};
const ESTADO_CORRIDA: Record<Corrida['estado'], { clase: string; t: string }> = {
  ok: { clase: 'badge-on', t: 'OK' },
  parcial: { clase: 'badge-warn', t: 'Parcial' },
  error: { clase: 'badge-err', t: 'Error' },
  en_curso: { clase: 'badge-info', t: 'En curso' },
};
const PRUEBA: Record<string, string> = { ok: 'responde', bloqueo: 'bloquea', error: 'error', pendiente: 'sin probar' };

function TabFuentes() {
  const { fuentes, corridas, lock, config, email } = useDatos();
  const toast = useToast();
  const [lanzando, setLanzando] = useState(false);
  const [errLanzar, setErrLanzar] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [verCorrida, setVerCorrida] = useState<string | null>(null);

  const lanzar = async () => {
    setLanzando(true);
    setErrLanzar(null);
    try {
      const r = await api.lanzarCorrida();
      toast(`Corrida ${r.corridaId} lanzada.`, 'ok');
    } catch (e) {
      setErrLanzar((e as Error).message);
    } finally {
      setLanzando(false);
    }
  };

  const actualizar = async (f: Fuente, cambios: Partial<Pick<Fuente, 'activa' | 'metodo'>>) => {
    setOcupada(f.id);
    try {
      await api.actualizarFuente(f.id, cambios, email);
      toast(`${f.nombre}: cambio guardado. Rige en la próxima corrida.`, 'ok');
    } catch (e) {
      toast(`No se pudo guardar: ${(e as Error).message}`, 'err');
    } finally {
      setOcupada(null);
    }
  };

  const conProblema = fuentes.filter((f) => f.activa && (f.ultimaCorrida?.estado === 'error' || f.ultimaCorrida?.estado === 'bloqueo' || (f.ceroConsecutivos ?? 0) >= 3));

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-header-title">Corrida manual</div>
            <div className="small muted">Llama al mismo workflow que la corrida diaria de las 06:00.</div>
          </div>
          <button className="btn btn-orange" onClick={lanzar} disabled={lanzando || !!lock}>
            {lanzando ? 'Lanzando…' : lock ? 'Corrida en curso…' : 'Lanzar corrida'}
          </button>
        </div>
        {(errLanzar || lock) && (
          <div className="card-body" style={{ paddingBottom: '0.5rem' }}>
            {lock && <div className="alert alert-info">Hay una corrida en curso ({lock.corridaId}), empezó a las {hora(lock.inicio)}.</div>}
            {errLanzar && <div className="alert alert-error">{errLanzar}</div>}
          </div>
        )}
      </div>

      {conProblema.length > 0 && (
        <div className="alert alert-error mt-2" role="alert">
          {conProblema.length === 1 ? 'Una fuente necesita atención: ' : `${conProblema.length} fuentes necesitan atención: `}
          {conProblema.map((f) => f.nombre).join(', ')}. Si bloquea la nube, pasala a agente local o a carga manual.
        </div>
      )}

      <div className="card mt-2">
        <div className="card-header">
          <div className="card-header-title">Fuentes ({fuentes.filter((f) => f.activa).length} activas de {fuentes.length})</div>
        </div>
        <div className="card-body tight">
          {fuentes.length === 0 ? (
            <Cargando />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Activa</th>
                    <th>Fuente</th>
                    <th>Método de acceso</th>
                    <th>Última corrida</th>
                    <th className="right">Leídos · nuevos</th>
                  </tr>
                </thead>
                <tbody>
                  {fuentes.map((f) => {
                    const u = f.ultimaCorrida;
                    const est = u ? ESTADO_FUENTE[u.estado] : null;
                    return (
                      <tr key={f.id} className="fila">
                        <td>
                          <label className="switch" aria-label={`${f.activa ? 'Apagar' : 'Prender'} ${f.nombre}`}>
                            <input type="checkbox" checked={f.activa} disabled={ocupada === f.id} onChange={(e) => actualizar(f, { activa: e.target.checked })} />
                            <span />
                          </label>
                        </td>
                        <td>
                          <div className="fuente-nombre">
                            <span className={`dot ${!f.activa ? 'dot-off' : (est?.dot ?? 'dot-off')}`} aria-hidden />
                            {f.nombre}
                          </div>
                          <div className="fuente-sub">
                            {f.paises.join(' · ')} · <span className="mono">{f.slug}-</span>
                          </div>
                          <div className="fuente-sub" title={f.pruebaAcceso?.detalle || undefined}>
                            Prueba desde la nube:{' '}
                            {f.pruebaAcceso ? (
                              <>
                                HTTP <strong>{PRUEBA[f.pruebaAcceso.http ?? 'pendiente']}</strong> · navegador{' '}
                                <strong>{PRUEBA[f.pruebaAcceso.navegador ?? 'pendiente']}</strong>
                              </>
                            ) : (
                              'sin probar'
                            )}
                          </div>
                          {f.pruebaAcceso?.detalle && <div className="fuente-sub">{f.pruebaAcceso.detalle}</div>}
                        </td>
                        <td style={{ minWidth: 215 }}>
                          <select
                            className="select select-sm"
                            value={f.metodo}
                            disabled={ocupada === f.id}
                            onChange={(e) => actualizar(f, { metodo: e.target.value as MetodoAcceso })}
                            aria-label={`Método de acceso de ${f.nombre}`}
                          >
                            {(Object.keys(ETIQUETA_METODO) as MetodoAcceso[]).map((m) => (
                              <option key={m} value={m}>
                                {ETIQUETA_METODO[m]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ minWidth: 170 }}>
                          {u ? (
                            <>
                              <span className={`badge ${est?.clase}`}>{est?.t}</span>{' '}
                              <span className="small muted nowrap">{fechaHora(u.inicio)}</span>
                              {u.error && <div className="err-text mt-1">{u.error}</div>}
                              {(f.ceroConsecutivos ?? 0) >= 3 && <div className="err-text">{f.ceroConsecutivos} días seguidos en cero</div>}
                            </>
                          ) : (
                            <span className="muted small">Sin corridas</span>
                          )}
                        </td>
                        <td className="right mono nowrap">{u ? `${u.leidos} · ${u.nuevos}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-header">
          <div className="card-header-title">Corridas recientes</div>
        </div>
        <div className="card-body tight">
          {corridas.length === 0 ? (
            <div className="empty-state">Todavía no hay corridas.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Inicio</th>
                    <th>Estado</th>
                    <th>Disparo</th>
                    <th className="right">Leídos</th>
                    <th className="right">Nuevos</th>
                    <th className="right">Clasificados</th>
                    <th className="right">Tokens</th>
                    <th className="right">Costo</th>
                    <th aria-label="Detalle" />
                  </tr>
                </thead>
                <tbody>
                  {corridas.slice(0, 10).map((c) => {
                    const fallidas = Object.entries(c.fuentes).filter(([, v]) => v.estado === 'error' || v.estado === 'bloqueo');
                    const ver = verCorrida === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr className="fila">
                          <td className="nowrap">
                            {fechaHora(c.inicio)}
                            <div className="small muted">{c.fin ? `${Math.max(1, Math.round((c.fin.getTime() - (c.inicio?.getTime() ?? 0)) / 60000))} min` : '—'}</div>
                          </td>
                          <td>
                            <span className={`badge ${ESTADO_CORRIDA[c.estado].clase}`}>{ESTADO_CORRIDA[c.estado].t}</span>
                            {fallidas.length > 0 && <div className="err-text">{fallidas.map(([id]) => fuentes.find((f) => f.id === id)?.nombre ?? id).join(', ')}</div>}
                          </td>
                          <td className="small">
                            {c.disparo === 'manual' ? 'Manual' : 'Programada'}
                            {c.solicitadoPor && <div className="muted">{c.solicitadoPor}</div>}
                          </td>
                          <td className="right mono">{c.totales?.leidos ?? '—'}</td>
                          <td className="right mono">{c.totales?.nuevos ?? '—'}</td>
                          <td className="right mono">
                            {c.totales?.clasificados ?? '—'}
                            {c.totales?.sinClasificar ? <div className="small" style={{ color: 'var(--amber)' }}>{c.totales.sinClasificar} sin clasificar</div> : null}
                          </td>
                          <td className="right mono small">{c.llm ? `${Math.round(c.llm.tokensEntrada / 1000)}k / ${Math.round(c.llm.tokensSalida / 1000)}k` : '—'}</td>
                          <td className="right mono small">{c.llm ? `US$ ${c.llm.costoUsd.toFixed(3)}` : '—'}</td>
                          <td>
                            {Object.keys(c.fuentes).length > 0 && (
                              <button className="btn btn-ghost btn-sm" aria-expanded={ver} onClick={() => setVerCorrida(ver ? null : c.id)}>
                                {ver ? 'Ocultar' : 'Por fuente'}
                              </button>
                            )}
                          </td>
                        </tr>
                        {ver && (
                          <tr className="hist-row">
                            <td colSpan={9}>
                              <div className="chip-row">
                                {Object.entries(c.fuentes).map(([id, v]) => (
                                  <span key={id} className={`badge ${ESTADO_FUENTE[v.estado]?.clase ?? 'badge-soft'}`} style={{ textTransform: 'none', letterSpacing: 0 }}>
                                    {fuentes.find((f) => f.id === id)?.nombre ?? id}: {v.leidos} leídos · {v.nuevos} nuevos · {v.actualizados} act.
                                  </span>
                                ))}
                              </div>
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

      {config && <ResumenCorreo destinatarios={config.sistema.destinatariosExtra} version={config.sistema.version} />}
    </>
  );
}

function ResumenCorreo({ destinatarios, version }: { destinatarios: string[]; version?: number }) {
  const { email, usuarios } = useDatos();
  const toast = useToast();
  const remoto = useMemo(() => ({ destinatariosExtra: destinatarios }), [destinatarios]);
  const { borrador, setBorrador, sucio, descartar } = useBorrador(remoto, (v) => v);
  const [guardando, setGuardando] = useState(false);
  const invalidos = borrador.destinatariosExtra.filter((e) => !esEmailDominio(e, DOMINIO));
  const admins = usuarios.filter((u) => u.rol === 'admin').map((u) => u.email);

  const guardar = async () => {
    setGuardando(true);
    try {
      await api.guardarConfig('sistema', { destinatariosExtra: sinDuplicados(borrador.destinatariosExtra.map((e) => e.toLowerCase())) }, email);
      toast('Destinatarios guardados.', 'ok');
    } catch (e) {
      toast(`No se pudo guardar: ${(e as Error).message}`, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="card mt-2">
      <div className="card-header">
        <div>
          <div className="card-header-title">Resumen de cada corrida por correo</div>
          <div className="small muted">Va siempre a los admins{admins.length ? ` (${admins.join(', ')})` : ''}. Sumá acá a otras personas del equipo.</div>
        </div>
      </div>
      <div className="card-body">
        <TagInput valor={borrador.destinatariosExtra} onChange={(v) => setBorrador({ destinatariosExtra: v })} placeholder={`nombre@${DOMINIO}`} max={50} />
        {invalidos.length > 0 && <div className="field-error">Solo direcciones de {DOMINIO}: {invalidos.join(', ')}</div>}
        <div className="flex mt-2">
          <span className="small muted">Versión {version ?? 0}</span>
          <span className="spacer" />
          <button className="btn btn-outline btn-sm" disabled={!sucio || guardando} onClick={descartar}>
            Descartar
          </button>
          <button className="btn btn-orange btn-sm" disabled={!sucio || guardando || invalidos.length > 0} onClick={guardar}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Usuarios ────────────────────────────────────────────────────────────
function TabUsuarios() {
  const { usuarios, email: yo } = useDatos();
  const toast = useToast();
  const [nuevo, setNuevo] = useState('');
  const [rolNuevo, setRolNuevo] = useState<Rol>('editor');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [errNuevo, setErrNuevo] = useState<string | null>(null);

  const ordenados = useMemo(
    () => [...usuarios].sort((a, b) => (a.rol === null ? -1 : 0) - (b.rol === null ? -1 : 0) || a.email.localeCompare(b.email)),
    [usuarios],
  );
  const sinRol = usuarios.filter((u) => !u.rol).length;

  const asignar = async (email: string, rol: Rol | null) => {
    setOcupado(email);
    try {
      await api.asignarRol(email, rol);
      toast(rol ? `${email} ahora es ${ETIQUETA_ROL[rol].toLowerCase()}.` : `${email} quedó sin acceso.`, 'ok');
      return true;
    } catch (e) {
      toast(`No se pudo asignar el rol: ${(e as Error).message}`, 'err');
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const alta = async () => {
    const e = nuevo.trim().toLowerCase();
    if (!esEmailDominio(e, DOMINIO)) {
      setErrNuevo(`Tiene que ser una cuenta de ${DOMINIO}.`);
      return;
    }
    setErrNuevo(null);
    if (await asignar(e, rolNuevo)) setNuevo('');
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="card-header-title">Dar de alta</div>
        </div>
        <div className="card-body">
          <div className="flex" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label htmlFor="u-email" className="sr-only">
                Email
              </label>
              <input
                id="u-email"
                className="input"
                type="email"
                placeholder={`nombre@${DOMINIO}`}
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && alta()}
              />
              {errNuevo && <div className="field-error">{errNuevo}</div>}
            </div>
            <select className="select" style={{ width: 'auto' }} value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as Rol)} aria-label="Rol">
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="lector">Lector</option>
            </select>
            <button className="btn btn-orange" onClick={alta} disabled={!nuevo || ocupado !== null}>
              Dar acceso
            </button>
          </div>
          <p className="field-hint">Admin configura el radar; Editor cambia estados, notas y carga llamados; Lector solo consulta.</p>
        </div>
      </div>

      {sinRol > 0 && <div className="alert alert-warn mt-2">{sinRol === 1 ? 'Una persona pidió acceso' : `${sinRol} personas pidieron acceso`}: asignales un rol.</div>}

      <div className="card mt-2">
        <div className="card-header">
          <div className="card-header-title">Usuarios ({usuarios.length})</div>
        </div>
        <div className="card-body tight">
          {usuarios.length === 0 ? (
            <div className="empty-state">Nadie entró todavía.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Último acceso</th>
                    <th>Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((u) => (
                    <tr key={u.uid} className="fila">
                      <td>
                        <div className="flex" style={{ flexWrap: 'nowrap' }}>
                          <div className="user-avatar" style={{ width: 30, height: 30, fontSize: '0.72rem' }}>
                            {u.foto ? <img src={u.foto} alt="" referrerPolicy="no-referrer" /> : iniciales(u.nombre, u.email)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="td-strong">{u.nombre || u.email}</div>
                            {u.nombre && <div className="small muted">{u.email}</div>}
                          </div>
                          {u.pendiente ? (
                            <span className="badge badge-info">Invitado · todavía no entró</span>
                          ) : (
                            !u.rol && <span className="badge badge-warn">Pide acceso</span>
                          )}
                        </div>
                      </td>
                      <td className="small muted nowrap">{fechaHora(u.ultimoAcceso)}</td>
                      <td style={{ minWidth: 150 }}>
                        <select
                          className="select select-sm"
                          value={u.rol ?? ''}
                          disabled={ocupado === u.email || u.email === yo}
                          title={u.email === yo ? 'No podés cambiar tu propio rol' : undefined}
                          onChange={(e) => asignar(u.email, (e.target.value || null) as Rol | null)}
                          aria-label={`Rol de ${u.email}`}
                        >
                          <option value="">Sin acceso</option>
                          <option value="admin">Admin</option>
                          <option value="editor">Editor</option>
                          <option value="lector">Lector</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
