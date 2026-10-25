# Spec · Fase 1 Radar autónomo y configuración

Oct 25, 2026 · @Equipos

Especificación de la fase 1 del Doc. Lo que no se redefine acá vale como está en el PRD.

## Problema y alcance

**La fase 1 reemplaza al radar actual por uno que corre solo en GCP y se configura sin código.** Hoy el radar depende de una tarea programada que necesita una computadora prendida, y sus fuentes, keywords y criterios están fijos en el código. Si la computadora está apagada o un sitio cambia, el equipo se entera tarde o no se entera. Los llamados de multilaterales suelen dar entre 2 y 4 semanas para una expresión de interés, así que un día perdido pesa.

**Entra en la fase 1:**

- Recolección diaria de 10 fuentes de Uruguay y Paraguay: ARCE, Intendencia de Montevideo, DNCP Paraguay, Banco Mundial, BID, UNGM, CND, AUCI, FIAP y Ceibal. Antes de construir cada una, se prueba si responde desde la nube y, si no, se aplica un plan B.
- Normalización, deduplicación, prefiltro y clasificación con Gemini.
- App web con las hojas Oportunidades y Registro, y la carga manual de llamados (BEO, correo, contactos).
- Panel de configuración: perfil de la firma, keywords, fuentes y usuarios.
- Acceso con Google restringido a @equipos.com.uy, con tres roles.
- Migración de todas las colecciones del radar actual, resumen de cada corrida por correo y observabilidad básica.

**Queda para fases siguientes:** la hoja Competencia, el digest configurable por usuario, ANDE, el sitio de UTEC, otros organismos de gub.uy y LinkedIn (fase 2), las fichas de TdR y el análisis de resultados.

## Objetivos y no-objetivos

**Objetivos de la fase 1** (se miden a los 30 días del lanzamiento):

1. **Autonomía:** al menos 98% de corridas diarias exitosas, sin ninguna computadora del equipo involucrada.
2. **Cobertura:** las 10 fuentes activas (o con su plan B en marcha) con datos al día. Durante las 2 semanas en paralelo, el radar nuevo detecta al menos el 95% de los llamados relevantes que detecta el actual.
3. **Precisión:** al menos el 40% de los “alta” llegan a Analizando o más al cierre de la fase (la meta del PRD de 50% se exige después, con más descartes acumulados).
4. **Configuración sin código:** un admin cambia keywords, perfil o fuentes desde el panel y el cambio rige en la corrida siguiente, sin intervención de desarrollo.
5. **Continuidad:** el 100% del historial del radar actual (oportunidades, estados, notas) queda migrado y el radar viejo se apaga.

**No-objetivos de la fase 1**

- **Hoja Competencia y adjudicaciones:** pasan a la fase 2. El esquema ya reserva las colecciones, pero no se recolectan.
- **Digest configurable por usuario:** fase 2. En la fase 1 hay un solo resumen por corrida, que va a los admins.
- **ANDE, sitio de UTEC, otros organismos de gub.uy y LinkedIn:** fase 2. Las compras de UTEC ya llegan por ARCE.
- **CAF y DevelopmentAid:** CAF bloquea lectores automáticos y DevelopmentAid prohíbe la extracción en sus términos. Se cargan a mano, salvo que se contrate la API de DevelopmentAid (decisión abierta).
- **Llamados de otros países:** no entran aunque admitan firmas uruguayas, salvo que nombren a Uruguay o Paraguay.
- **App móvil nativa:** la app web tiene que funcionar bien en el celular, y alcanza.

## Historias de usuario

Las historias van ordenadas por prioridad. Cada una lleva un ID para trazarla en los tickets.

**Editor (responsable comercial o de proyectos)**

- **E1.** Como editor, quiero ver al entrar los llamados abiertos ordenados por relevancia y cierre, con los nuevos marcados, para decidir en pocos minutos cuáles mirar.
- **E2.** Como editor, quiero buscar y filtrar por texto, fuente, relevancia y estado, para encontrar un llamado puntual.
- **E3.** Como editor, quiero cambiar el estado y escribir una nota, y que el resto lo vea al instante, para coordinar sin mensajes aparte.
- **E4.** Como editor, quiero elegir un motivo al descartar, para que el radar aprenda qué no mostrar.
- **E5.** Como editor, quiero cargar a mano un llamado de BEO, CAF, correo o un contacto, para tener todo el pipeline en un solo lugar.
- **E6.** Como editor, quiero ver el historial de cambios de estado con autor y fecha, para saber quién decidió qué.
- **E7.** Como editor, quiero ver por qué un llamado salió “alta” o “media”, para confiar en la clasificación o corregirla.

* **E8.** Como editor (hoy, Marcos), quiero recibir al final de cada corrida un correo corto con las nuevas por país y fuente, las de relevancia alta y media, y las fuentes que fallaron, para no tener que entrar si no hay nada.

**Admin (dueño del radar)**

- **A1.** Como admin, quiero editar el perfil de la firma (servicios, sectores, antecedentes, países y montos), para que la clasificación refleje lo que hacemos.
- **A2.** Como admin, quiero gestionar keywords a incluir y excluir, globales o por fuente, sin tocar código.
- **A3.** Como admin, quiero prender o apagar una fuente y ver su última corrida, cuántos avisos leyó y si falló, para detectar un scraper roto.
- **A4.** Como admin, quiero lanzar una corrida manual, para probar un cambio sin esperar al día siguiente.
- **A5.** Como admin, quiero dar de alta usuarios y asignarles un rol, para controlar quién edita.
- **A6.** Como admin, quiero recibir un correo si la corrida diaria falla o una fuente queda en cero 3 días seguidos, para no enterarme tarde.

* **A7.** Como admin, quiero ver y cambiar el método de acceso de cada fuente (HTTP, navegador sin interfaz, agente local o manual), para resolver un bloqueo sin tocar código.

**Lector**

- **L1.** Como lector, quiero consultar oportunidades y registro sin poder modificarlos, para seguir el pipeline.

**Casos borde que la fase 1 tiene que resolver**

- Un mismo llamado en dos fuentes se muestra una sola vez, con ambas fuentes.
- Un aviso sin fecha de cierre muestra “fecha a confirmar” y no cuenta en “cierra en 7 días”.
- Una prórroga actualiza el cierre, guarda el cambio en el historial y conserva estado y nota.
- Si una fuente falla, el resto de la corrida sigue y la fuente queda en rojo en el panel.
- Si Gemini no responde o devuelve un JSON inválido, el aviso queda como “sin clasificar”, visible, y se reintenta en la corrida siguiente.
- Un usuario de @equipos.com.uy sin rol asignado ve “pedí acceso al admin” y ningún dato.
- Una cuenta de otro dominio no puede entrar.
- Dos editores cambian el mismo llamado a la vez: gana el último cambio y los dos quedan en el historial.

* Un estudio multipaís que no nombra a Uruguay ni a Paraguay se descarta en el prefiltro, con el motivo registrado.
* Un llamado de Paraguay muestra el monto estimado en guaraníes y, si se sabe, si el pliego admite firmas extranjeras.
* Si un llamado de la DNCP también está en el BID o en DevelopmentAid, queda una sola vez, con la DNCP como fuente oficial.
* Una fuente que empieza a rechazar pedidos desde la nube queda en rojo con el detalle “bloqueo de acceso”, y el admin puede pasarla a agente local o a carga manual.

## Flujo de la corrida diaria

La corrida está diseñada para degradarse por partes: una fuente caída o un aviso que el LLM no pudo clasificar no frenan el resto, y todo queda registrado para reintentar.

&#91;embedded content: corrida diaria · 7 pasos y manejo de fallas\]

Cada paso es idempotente: si la corrida se repite el mismo día, no crea duplicados ni pisa estados ni notas.

## Requisitos P0

La fase 1 no sale sin estos 14 requisitos. Cada uno indica qué historias cubre.

### RF-01 · Orquestación de la corrida (A3, A4)

Cloud Scheduler dispara todos los días a las 06:00 (America/Montevideo) un Cloud Workflow. El workflow lanza los collectors en paralelo y después corre, en orden, normalización y dedup, prefiltro, clasificación y cierre de la corrida. La corrida manual desde el panel llama al mismo workflow, mediante una Cloud Function que solo acepta admins.

- [ ] Cada collector es un Cloud Run Job con un timeout de 15 minutos y 2 reintentos con espera creciente.
- [ ] Si una fuente agota sus reintentos, la corrida sigue, la fuente queda en “error” y la corrida termina en “parcial”.
- [ ] Con una corrida en curso, un pedido manual se rechaza con el mensaje “ya hay una corrida en curso, empezó a las HH:MM”. Un lock en `corridas/actual` lo impide.
- [ ] La corrida completa termina en menos de 30 minutos.

### RF-02 · Collectors por fuente

| Fuente | País | Método | Alcance que trae | Acceso desde la nube |
| --- | --- | --- | --- | --- |
| ARCE | UY | RSS OCDS mensual `/ocds/rss/AAAA/MM` y detalle por `/ocds/release/{id}` | Llamados nuevos de los últimos N días. Incluye 18 intendencias y UTEC (con UTEC como fuente propia) | A probar |
| Intendencia de Montevideo | UY | Vista de compras vigentes de la cartelera SIAB y detalle de cada compra (páginas en windows-1252) | Compras vigentes, filtradas por rubro | A probar |
| DNCP Paraguay | PY | API v3 de datos abiertos (OCDS) | Convocatorias abiertas de los últimos 7 días, con monto, procedimiento y financiamiento | Sí |
| Banco Mundial | UY, PY | API JSON `procnotices` con `project_ctry_name_exact` | Expresiones de interés e invitaciones a ofertar de los últimos 7 días | Sí |
| BID | UY, PY | API *datastore* de data.iadb.org | Avisos de proyectos en Uruguay y Paraguay | Sí |
| UNGM | UY, PY | Listado público buscado por país | Solo filas con país beneficiario Uruguay o Paraguay | A probar |
| CND | UY | Otros llamados y llamados a ofertas en línea | Llamados abiertos | Sí |
| AUCI | UY | Convocatorias de gub.uy | Solo las marcadas “Vigente”. Se excluyen becas | Sí |
| FIAP | UY, PY | Página de ofertas de fiap.gob.es | Ofertas vigentes con trabajo en Uruguay o Paraguay | Sí |
| Ceibal | UY | Feed RSS de convocatorias abiertas | Estudios, evaluaciones y consultorías. Sin equipamiento, cursos ni libros | A probar |

- [ ] Cada collector lee una ventana configurable, por defecto 7 días hacia atrás, para cubrir días caídos sin crear duplicados.
- [ ] La respuesta cruda se guarda en Cloud Storage (`raw/{fuente}/{fecha}.json`) por 30 días, para poder reprocesarla sin volver a pedir.
- [ ] Los scrapers respetan robots.txt, hacen como máximo 1 pedido por segundo por sitio y se identifican con un User-Agent propio.
- [ ] Todos los collectors implementan la misma interfaz (`fetch → parse → AvisoNormalizado[]`), así que agregar una fuente en la fase 2 es agregar un módulo.

### RF-03 · Normalización

Cada aviso se convierte al esquema `AvisoNormalizado` (ver Contratos de datos).

- [ ] Las fechas quedan en ISO 8601 con zona horaria. Un cierre sin hora se toma a las 23:59 hora local del organismo.
- [ ] El país queda en ISO 3166-1 alfa-2 y la moneda en ISO 4217.
- [ ] El texto se limpia de HTML y se corta en 20.000 caracteres, guardando el largo original.

### RF-04 · Deduplicación y prórrogas (casos borde)

- [ ] El `doc_id` es el slug de la fuente más el ID del llamado, igual que en el radar actual: `ce-1378357`, `im-D197177`, `dncp-<ID>`, `bm-OP00473712`, `ungm-<n>`, `ceibal-<n>`, `cnd-llamado-13-2026`. Si la fuente no tiene ID, se usa un slug del título.
- [ ] Entre fuentes distintas se busca el mismo llamado: mismo organismo y objeto parecido, mismo número de llamado o de proyecto, o misma fecha de cierre. Si coincide, se fusiona y se agrega la fuente a `fuentes[]`.
- [ ] Cuando hay duplicado, se queda la fuente oficial (ARCE, Intendencia de Montevideo, DNCP, Banco Mundial, CND, Ceibal o UNGM) antes que LinkedIn o DevelopmentAid. En Paraguay, la DNCP gana sobre los avisos del BID.
- [ ] Dado un aviso ya guardado, cuando vuelve con otra fecha de cierre, entonces se actualiza `cierre`, se agrega el cambio al historial y se conservan estado y nota.
- [ ] Ninguna corrida duplica un documento: es idempotente.

### RF-05 · Prefiltro

Reglas deterministas que corren antes del LLM, configurables en `config/busqueda`.

- [ ] **Regla geográfica estricta:** entra solo si el país beneficiario o el lugar de ejecución es Uruguay o Paraguay. Un estudio multipaís entra solo si los nombra.
- [ ] **Exclusiones:** obras, suministros, equipamiento, mantenimiento, insumos médicos, contratación de personal individual, becas y fondos para empresas, y estudios de ingeniería, suelos, saneamiento, proyectos ejecutivos, factibilidad de infraestructura, impacto ambiental o diagnósticos médicos.
- [ ] **Exclusiones por palabra** que evitan falsos positivos: “encuesta de precios”, topografía, geotecnia y medidor.
- [ ] Pasa al LLM si tiene al menos una keyword de la lista semilla del PRD en el título, la descripción o los ítems, o si es una consultoría de firma.
- [ ] Lo descartado se guarda como “baja” con el motivo `prefiltro: <regla>`. No se muestra por defecto, pero se puede auditar.

### RF-06 · Clasificación con Gemini (E7)

Gemini 3.1 Flash-Lite por Vertex AI, con salida en JSON con esquema y temperatura 0.

- [ ] El prompt incluye el perfil de la firma, las reglas de inclusión y exclusión, la rúbrica de relevancia y hasta 10 descartes recientes con su motivo.
- [ ] Rúbrica: “alta” si el objeto principal es una encuesta, un estudio o una evaluación con trabajo de campo; “media” si lo incluye como componente o es una consultoría afín; “baja” si es marginal. Ante la duda, baja.
- [ ] La salida trae: puntaje de 0 a 100, resumen en español de hasta 2 líneas (en Paraguay, con el monto en guaraníes y si admite firmas extranjeras), motivo de 1 línea y servicios detectados.
- [ ] La relevancia se deriva del puntaje con umbrales configurables, calibrados para coincidir con la rúbrica: 70 o más es “alta”, de 40 a 69 “media”, menos de 40 “baja”.
- [ ] El texto del aviso va delimitado como dato. El modelo no tiene herramientas, y una salida que no cumple el esquema se descarta. Una página con instrucciones ocultas no puede cambiar el comportamiento del clasificador.
- [ ] Cada documento guarda el modelo y la versión de prompt con que se clasificó.
- [ ] Si el JSON es inválido o hay timeout, se reintenta 1 vez. Si vuelve a fallar, queda “sin clasificar”, visible, y se reintenta en la corrida siguiente.
- [ ] Antes de salir a producción, sobre un set de 50 avisos etiquetados por el equipo (de Uruguay y de Paraguay, tomados del historial del radar actual), la clasificación coincide en al menos el 80% de los casos en la distinción alta / no alta.

### RF-07 · Hoja Oportunidades (E1, E2, E3, E4)

Paridad con el radar actual, más el motivo de descarte.

- [ ] Vista por defecto: abiertas, relevancia alta y media, ordenadas por relevancia y después por cierre.
- [ ] Estadísticas arriba: abiertas y relevantes, nuevas en la última corrida y que cierran en 7 días.
- [ ] Cada tarjeta muestra título con link, fuentes, organismo, país, tipo, cierre con días restantes, relevancia, resumen, motivo, estado y nota.
- [ ] Los cambios de otros usuarios aparecen en menos de 2 segundos, sin recargar.
- [ ] Dado un editor que elige “Descartada”, cuando confirma, entonces debe elegir un motivo (fuera de rubro, monto, país, requisitos, plazo u otro con texto) antes de guardar.

### RF-08 · Hoja Registro y carga manual (E5, E6)

- [ ] La tabla muestra todos los llamados, abiertos y cerrados, con chips por estado, filtros por fuente y año, y búsqueda.
- [ ] Cada fila despliega su historial de estados y cierres, con autor y fecha.
- [ ] El formulario de alta manual pide título y organismo como obligatorios; país, canal (BEO, CAF, correo, contacto u otro), cierre, estado y link son opcionales.
- [ ] Los llamados manuales no se reclasifican ni se tocan en las corridas.

### RF-09 · Panel de configuración (A1, A2, A3, A4)

Tiene cuatro pestañas, solo para Admin: Perfil, Búsqueda, Fuentes y Usuarios.

- [ ] **Perfil:** servicios, sectores, antecedentes (título, cliente, año, monto), países aceptados y rango de monto.
- [ ] **Búsqueda:** keywords a incluir y excluir, globales o por fuente, sin duplicados y hasta 200 por lista. También los umbrales de relevancia.
- [ ] **Fuentes:** prender o apagar cada una, ver su última corrida, avisos leídos, nuevos y último error, y el botón de corrida manual.
- [ ] Cada cambio guardado sube la versión de la configuración, deja una entrada en `auditoria` y rige en la corrida siguiente.

### RF-10 · Acceso y roles (A5, L1, casos borde)

- [ ] Se entra con Google mediante Firebase Auth, pidiendo cuentas del dominio equipos.com.uy.
- [ ] Las Firestore Rules exigen email verificado de @equipos.com.uy y un rol en los *custom claims*. Sin las dos cosas no se lee nada.
- [ ] Los roles los asigna un admin desde la pestaña Usuarios, mediante una Cloud Function. El primer admin se crea con un script de arranque.
- [ ] Dado alguien con una cuenta de Gmail, cuando entra, entonces ve “solo cuentas de equipos.com.uy” y ningún dato.

### RF-11 · Migración del radar actual

- [ ] Se exportan todas las colecciones de la base del artefacto actual (`oportunidades`, `competidores`, `adjudicaciones`, `propuestas`, `contactos` y `config`) y se importan con un script idempotente.
- [ ] Los `doc_id` se conservan tal cual, porque el formato ya es el mismo. El estado de las fuentes de `meta/estado` alimenta el primer estado de `fuentes`.
- [ ] El script informa cuántos registros leyó, importó y rechazó, y por qué.
- [ ] Estados, notas, historial y `estado_fecha` se conservan.

### RF-12 · Observabilidad y alertas operativas (A6)

- [ ] Cada corrida escribe en `corridas/{id}`: inicio, fin, estado y, por fuente, leídos, nuevos, actualizados, errores, tokens y costo estimado del LLM.
- [ ] Los logs de Cloud Logging son estructurados y llevan el ID de la corrida.
- [ ] Cloud Monitoring avisa por correo a los admins si el workflow falla, si no hubo corrida exitosa en 26 horas, o si una fuente trae 0 avisos 3 días seguidos.
- [ ] Hay una alerta de presupuesto en Cloud Billing por US$ 40/mes.

### RF-13 · Acceso a sitios que bloquean la nube (A7)

El radar actual lee ARCE, la Intendencia de Montevideo, UNGM y Ceibal con el navegador de una computadora, porque bloquean descargas desde servidores. La fase 1 no puede depender de eso.

- [ ] En la semana 1, cada fuente se prueba desde Cloud Run con HTTP simple y con navegador sin interfaz (Playwright). El resultado queda en una tabla en `fuentes`.
- [ ] Si una fuente rechaza el pedido, se resuelve en este orden: 1) IP fija de salida con Cloud NAT (\~US$ 4–5/mes), 2) agente local en un equipo de la oficina siempre prendido, que corre solo esos collectors y escribe en Firestore con una cuenta de servicio, 3) carga manual.
- [ ] Ninguna fuente depende de la computadora personal de alguien.
- [ ] El método de acceso de cada fuente se puede cambiar desde el panel.
- [ ] Ningún collector inicia sesión, completa formularios, acepta cookies no esenciales ni se registra en un portal.

### RF-14 · Resumen de cada corrida (E8)

- [ ] Al cerrar la corrida, se manda un correo corto a los admins, con Gmail API desde una cuenta de servicio.
- [ ] El correo trae: cuántas nuevas hubo, por país y por fuente; la lista de alta y media con título, organismo, país y cierre; las fuentes que fallaron; y el link a la app.
- [ ] Si no hubo nada nuevo, el correo lo dice en una línea.

## Contratos de datos

Hay tres contratos que fijan las interfaces entre módulos: el aviso normalizado que devuelve cada collector, la salida del LLM y los permisos por rol. Todos los documentos llevan `orgId` para no cerrar la puerta a multi-empresa.

**`AvisoNormalizado`** (lo que devuelve cada collector)

| Campo | Tipo | Obligatorio | Nota |
| --- | --- | --- | --- |
| `docId` | string | sí | Slug de la fuente + ID del llamado, solo letras, dígitos y guiones |
| `fuente` | enum | sí | Uno de los nombres de fuente del radar actual, por ejemplo “Compras Estatales” o “DNCP Paraguay” |
| `idOficial` | string | no | ID en la fuente |
| `titulo` | string | sí | Tipo y número del llamado + objeto, sin HTML |
| `organismo` | string | sí | En la Intendencia de Montevideo, con el departamento |
| `pais` | enum | sí | `Uruguay` o `Paraguay` |
| `tipo` | enum | sí | `consultoria_firma`, `consultoria_individual`, `servicios`, `expresion_interes`, `aviso_general`, `otro` |
| `url` | string | sí | Aviso o pliego oficial |
| `publicado` | datetime | no | ISO 8601 |
| `cierre` | datetime | no | ISO 8601 con `-03:00`. Si falta: “fecha a confirmar” |
| `monto` y `moneda` | number y string | no | ISO 4217: UYU, USD o PYG |
| `financiador` | string | no | BID, Banco Mundial, PNUD, UE, etc. |
| `idioma` | string | no | `es`, `en` o `pt` |
| `texto` | string | no | Hasta 20.000 caracteres |
| `crudoRef` | string | sí | Ruta del archivo crudo en Cloud Storage |

**`oportunidades/{id}`** agrega al aviso normalizado: `fuentes[]`, `detectado`, `relevancia`, `puntaje`, `resumen`, `motivo`, `servicios[]`, `clasificacion: {modelo, promptVersion, fecha}`, `estado`, `motivoDescarte`, `nota`, `historial[]`, `manual`, `legacyId` y `orgId`.

**Salida del LLM** (esquema JSON que se le exige a Gemini):

```json
{
  "puntaje": 0,
  "resumen": "máx. 280 caracteres, en español",
  "motivo": "máx. 160 caracteres: por qué encaja o no con Equipos",
  "servicios": ["encuesta_hogares", "evaluacion_impacto", "cualitativo", "linea_base", "otro"],
  "esInvestigacion": true,
  "confianza": "alta | media | baja"
}
```

La relevancia no la decide el modelo: se deriva del `puntaje` con los umbrales de la configuración. Así, cambiar un umbral no obliga a reclasificar.

**Permisos por rol** (Firestore Rules)

| Colección | Lector | Editor | Admin | Sistema (cuenta de servicio) |
| --- | --- | --- | --- | --- |
| `oportunidades` | lee | lee; edita solo `estado`, `motivoDescarte`, `nota` e `historial`; crea manuales | todo | crea y actualiza |
| `config/*` | — | lee | lee y edita | lee |
| `fuentes`, `corridas` | lee | lee | lee y edita `fuentes` | escribe |
| `usuarios`, `auditoria` | — | — | lee | escribe |

## Requisitos no funcionales, P1 y P2

**No funcionales (P0)**

| Área | Requisito |
| --- | --- |
| Rendimiento | La app carga y es usable en menos de 2 s con 2.000 oportunidades. La corrida completa tarda menos de 30 min |
| Seguridad | Una cuenta de servicio por componente, con permisos mínimos. Secretos en Secret Manager, nunca en el código. Ninguna API pública sin autenticación |
| Datos | Firestore y Cloud Run en `southamerica-east1`. Export semanal de Firestore a Cloud Storage, guardado 8 semanas. Crudos guardados 30 días |
| Usabilidad | Español rioplatense, fechas en formato es-UY y hora de Montevideo. Funciona en el celular desde 360 px de ancho. Modo claro y oscuro. Contraste WCAG AA |
| Calidad | Tests unitarios por collector con HTML y JSON reales guardados como fixtures. El set de 50 avisos etiquetados corre en CI cada vez que cambia el prompt |
| Entrega | Repositorio en GitHub. Deploy con GitHub Actions y Workload Identity Federation, sin claves de servicio descargadas. Entornos de staging y producción separados |

**P1: si entra en el tiempo de la fase, si no, al principio de la fase 2**

- **Reclasificar abiertas:** un botón en el panel que vuelve a clasificar las oportunidades abiertas después de cambiar el perfil.
- **Probar con un aviso:** pegar un aviso en el panel y ver cómo lo clasificaría la configuración actual.
- **Exportar el registro a CSV.**
- **Vista de descartados por el prefiltro,** para auditar falsos negativos.

**P2: no se construye, pero el diseño lo tiene en cuenta**

- `orgId` en todos los documentos, por si algún día es multi-empresa.
- Texto completo y crudos guardados, para que la fase 3 (fichas de TdR) los reutilice.
- Interfaz común de collectors, para sumar fuentes en la fase 2 sin tocar el pipeline.
- `postulaciones` y `adjudicaciones` reservadas en el esquema, para las fases 2 y 4.

## Costos de la fase 1

**Operar la fase 1 costaría unos US$ 5–15 por mes, con un techo de \~US$ 30 si hace falta IP fija.** Es menos que en el PRD porque todavía no hay fichas de TdR, análisis de propuestas ni grounding. Precios de lista en USD.

| Componente | Supuesto de uso | Costo mensual (USD) | Precio verificado |
| --- | --- | --- | --- |
| Gemini 3.1 Flash-Lite | \~100 avisos/día tras el prefiltro, \~3k tokens de entrada y 300 de salida cada uno. A US$ 0,25 / 1M de entrada y US$ 1,50 / 1M de salida | \~4 (\~18 sin prefiltro) | Sí, 10/10/2026 |
| Gemini, set de 50 avisos en CI | \~50 corridas del set en la fase, \~150k tokens cada una | < 1 | Sí, 10/10/2026 |
| Cloud Run Jobs | 10 collectors × \~2 min × 30 días, unos 36k vCPU-s. Gratis hasta 240k vCPU-s por mes | 0 | Sí, 10/10/2026 |
| Cloud NAT con IP fija (solo si alguna fuente bloquea a Cloud Run) | IP a US$ 0,005/h (US$ 3,60/mes), gateway a US$ 0,0014 por instancia y hora, y US$ 0,045 por GiB procesado, con pocos GiB | \~4–5 | Sí, 25/10/2026 |
| Agente local en la oficina (solo si la IP fija no alcanza) | Un equipo chico siempre prendido | Hardware a cotizar | No aplica |
| Cloud Workflows y Cloud Scheduler | 1 workflow diario de \~60 pasos y 1 job programado | 0–1 | No: confirmar en la semana 1 |
| Firestore, Hosting, Auth y Cloud Functions | Equipo chico, pocos miles de documentos y lecturas | 0–2 | No: confirmar en la semana 1 |
| Cloud Storage, Logging, Artifact Registry | Crudos de 30 días, exports semanales e imágenes de contenedores: pocos GB | \~1–2 | No: confirmar en la semana 1 |
| Gmail API y Cloud Monitoring | Resumen de cada corrida y alertas por correo | 0 | No: confirmar en la semana 1 |
| **Total** |  | **\~5–15 (techo \~30)** |  |

- **Para ahorrar:** la clasificación diaria puede ir en modo *batch* de Gemini, que cuesta la mitad, porque no necesita respuesta inmediata.
- **Fuera de este cálculo:** las horas de desarrollo y el tiempo del equipo para etiquetar los 50 avisos del set (estimo 2 a 3 horas).
- **Control:** alerta de presupuesto en US$ 40/mes desde el primer día, la misma que en el PRD.

Fuentes: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) y [Cloud Run pricing](https://cloud.google.com/run/pricing). Vertex AI puede diferir levemente de la Gemini API.

## Métricas y criterio de salida

**La fase 1 se da por cerrada, y el radar viejo se apaga, cuando se cumplen los cinco criterios de salida.** Se evalúan al final de las 2 semanas en paralelo con el radar actual.

| Métrica | Tipo | Criterio de salida | Meta a 30 días | Cómo se mide |
| --- | --- | --- | --- | --- |
| Corridas exitosas | Adelantado | 14 de 14 en el paralelo | ≥ 98% | `corridas` con estado ok o parcial sin fuentes críticas caídas |
| Cobertura frente al radar actual | Adelantado | ≥ 95% de sus relevantes | No aplica | Cruce por URL y título de lo que detectaron los dos radares en el paralelo |
| Acuerdo con el set etiquetado | Adelantado | ≥ 80% alta / no alta | ≥ 85% | CI sobre el set de 50 avisos |
| Precisión de “alta” | Adelantado | ≥ 40% | ≥ 50% | “alta” que llegan a Analizando o más / total de “alta” |
| Migración | Adelantado | 100% de registros con 0 rechazos sin explicar | No aplica | Informe del script de migración |
| Uso semanal | Adelantado | No es criterio | ≥ 3 editores por semana | Usuarios distintos que cambian un estado |
| Latencia de detección | Rezagado | No es criterio | 90% en menos de 24 h | `detectado` − `publicado` |
| Llamados relevantes perdidos | Rezagado | No es criterio | 0 | Llamados conocidos por fuera que una fuente cubierta ya había publicado |

La cobertura del paralelo es el criterio más importante: si el radar nuevo pierde algo que el viejo encontraba, no se apaga el viejo.

## Plan de trabajo

Son 7 semanas de desarrollo y 2 de funcionamiento en paralelo con el radar actual. La semana extra viene de Paraguay, la Intendencia de Montevideo, Ceibal y la prueba de acceso desde la nube.

&#91;embedded content: plan de trabajo · 9 semanas y 4 hitos\]

La semana 1 resuelve las preguntas que bloquean el arranque. Si alguna fuente no se puede leer como se esperaba, se pasa a carga manual y el plan no se mueve. El riesgo de calendario está en los scrapers: si uno lleva más de 2 días, se deja para la fase 2.

## Preguntas abiertas y dependencias

**Bloquean el arranque (semana 1)**

- [ ] ¿Proyecto GCP nuevo o el mismo del sistema de paneles? Recomiendo uno nuevo, para separar billing y permisos. *(Ingeniería)*
- [ ] ¿Quién etiqueta los 50 avisos del set y quién carga el perfil inicial de la firma? *(Dirección)*
- [ ] Confirmar el filtro por país de la API del Banco Mundial (el radar actual usa project\_ctry\_name\_exact) y si la API de la DNCP pide registro. *(Ingeniería)*
- [ ] ¿El dataset del BID trae país, tipo de aviso y cierre como campos? *(Ingeniería)*

* [ ] ¿Qué fuentes responden desde Cloud Run? La prueba de la semana 1 define si hace falta IP fija o un agente local, y por lo tanto si hay que comprar un equipo para la oficina. *(Ingeniería)*
* [ ] CAF y DevelopmentAid: ¿carga manual (lo que recomiendo) o se contrata la API de DevelopmentAid? *(Dirección y Legal)*

**No bloquean**

- [ ] ¿Los términos de uso de UNGM permiten la lectura automatizada del listado público? Si no, UNGM pasa a carga manual. *(Legal)*
- [ ] ¿El perfil del contratante de FIAP publica contrataciones con alcance en Uruguay con suficiente frecuencia como para justificar el scraper? *(Comercial)*
- [ ] ¿Qué motivos de descarte usa hoy el equipo? Se usan para armar la lista cerrada. *(Comercial)*
- [ ] ¿Hace falta confirmar los precios de Workflows, Scheduler y Firestore antes del arranque, o alcanza con la alerta de presupuesto? *(Ingeniería)*

**Dependencias**

| Dependencia | Responsable | Para cuándo |
| --- | --- | --- |
| Proyecto GCP con billing y la alerta de presupuesto | Ingeniería | Semana 1 |
| Dominio equipos.com.uy habilitado para Google Sign-In | Admin de Google Workspace | Semana 1 |
| Acceso a la base del radar actual para exportarla | Ingeniería | Semana 1 |
| Resultado de la prueba de acceso desde la nube | Ingeniería | Fin de la semana 1 |
| Equipo de oficina para el agente local (solo si hace falta) | Dirección | Semana 3 |
| Set de 50 avisos etiquetados, de Uruguay y Paraguay | Comercial | Semana 3 |
| Perfil de la firma cargado | Dirección | Semana 5 |
