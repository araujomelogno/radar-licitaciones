import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DatosProvider, useDatos } from './context/Datos';
import { ToastsProvider } from './context/Toasts';
import { DOMINIO } from './lib/constantes';
import { Login, PantallaCarga, SinRol } from './pages/Acceso';
import { Configuracion } from './pages/Configuracion';
import { Oportunidades } from './pages/Oportunidades';
import { Registro } from './pages/Registro';

function Rutas() {
  const { sesion, esAdmin } = useDatos();

  switch (sesion.estado) {
    case 'cargando':
      return <PantallaCarga />;
    case 'anonimo':
      return <Login key={sesion.error ?? ''} error={sesion.error} />;
    case 'dominio_invalido':
      // Se cierra la sesión enseguida; mientras tanto no se muestra ningún dato.
      return <Login key="dominio" error={`Solo cuentas de ${DOMINIO}.`} />;
    case 'sin_rol':
      return <SinRol email={sesion.usuario.email} />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Oportunidades />} />
        <Route path="registro" element={<Registro />} />
        <Route path="configuracion" element={esAdmin ? <Configuracion /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastsProvider>
        <DatosProvider>
          <Rutas />
        </DatosProvider>
      </ToastsProvider>
    </BrowserRouter>
  );
}
