import { NavLink, Outlet } from 'react-router-dom';
import { useDatos } from '../context/Datos';
import { useTema } from '../context/tema';
import { api } from '../data';
import { ETIQUETA_ROL } from '../lib/constantes';
import { iniciales } from '../lib/helpers';
import type { Rol } from '../lib/tipos';
import { Icono } from './ui';

function SelectorDemo({ clase }: { clase?: string }) {
  const { rol } = useDatos();
  if (api.modo !== 'demo') return null;
  return (
    <div className={`demo-box ${clase ?? ''}`}>
      <label className="label" htmlFor={`demo-rol-${clase ?? 'side'}`}>
        Modo demo · ver como
      </label>
      <select
        id={`demo-rol-${clase ?? 'side'}`}
        value={rol ?? 'sin_rol'}
        onChange={(e) => api.demoCambiarRol?.(e.target.value === 'sin_rol' ? null : (e.target.value as Rol))}
      >
        <option value="admin">Admin</option>
        <option value="editor">Editor</option>
        <option value="lector">Lector</option>
        <option value="sin_rol">Sin rol</option>
      </select>
    </div>
  );
}

export function Layout() {
  const { sesion, rol, esAdmin } = useDatos();
  const [tema, alternarTema] = useTema();
  const usuario = sesion.estado === 'ok' ? sesion.usuario : null;

  return (
    <>
      {api.modo === 'demo' && <div className="demo-banner">Modo demo: datos de ejemplo en memoria, los cambios no se guardan.</div>}
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-top">
            <div>
              <img className="logo-horizontal-white" src="/logo-horizontal.png" alt="Equipos Consultores" />
              <div className="sidebar-app-name">Radar de licitaciones</div>
            </div>
          </div>
          <div className="sidebar-section-label">Radar</div>
          <nav aria-label="Principal">
            <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">{Icono.radar}</span>Oportunidades
            </NavLink>
            <NavLink to="/registro" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-icon">{Icono.registro}</span>Registro
            </NavLink>
            {esAdmin && (
              <NavLink to="/configuracion" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="nav-icon">{Icono.config}</span>Configuración
              </NavLink>
            )}
          </nav>
          <div className="sidebar-footer">
            <SelectorDemo />
            {usuario && (
              <div className="user-pill" title={usuario.email}>
                <div className="user-avatar">
                  {usuario.foto ? <img src={usuario.foto} alt="" referrerPolicy="no-referrer" /> : iniciales(usuario.nombre, usuario.email)}
                </div>
                <div className="user-info-wrap">
                  <div className="user-email">{usuario.email}</div>
                  <div className="user-role">{rol ? ETIQUETA_ROL[rol] : ''}</div>
                </div>
              </div>
            )}
            <div className="sidebar-actions">
              <button
                className="btn btn-sm"
                onClick={alternarTema}
                aria-label={tema === 'dark' ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
                title={tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                style={{ flex: '0 0 auto' }}
              >
                <span style={{ width: 15, height: 15, display: 'inline-flex' }}>{tema === 'dark' ? Icono.sol : Icono.luna}</span>
              </button>
              <button className="btn btn-sm" onClick={() => api.salir()}>
                Salir
              </button>
            </div>
          </div>
          <div className="mobile-only demo-mobile">
            <SelectorDemo clase="mobile" />
          </div>
        </aside>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </>
  );
}
