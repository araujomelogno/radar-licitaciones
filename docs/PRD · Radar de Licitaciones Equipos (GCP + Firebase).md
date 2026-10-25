# PRD · Radar de Licitaciones Equipos (GCP + Firebase)

Oct 10, 2026 · @Equipos · Borrador v0.1

## Resumen

Construir en Google Cloud + Firebase un **radar de licitaciones autónomo** para Equipos Consultores. El radar detecta todos los días los llamados de investigación, encuestas y evaluación con trabajo en Uruguay o Paraguay, los clasifica según qué tan bien encajan con la firma y acompaña la decisión de presentarse. Se entrega en cinco fases, y la cuarta cierra el ciclo: analiza con IA por qué se gana o se pierde cada licitación. La primera reemplaza al radar actual con algo que corre solo y suma un panel de configuración.

**Punto de partida.** El radar de referencia ya cubre 16 fuentes de Uruguay y Paraguay y tiene tres hojas: Oportunidades, Registro y Competencia. También maneja relevancia alta, media y baja y un pipeline de estados (Nueva, Analizando, Vamos a postular, Nos presentamos, En evaluación, Ganada, Perdida, Descartada). Tiene dos limitaciones: depende de una tarea programada que necesita una computadora prendida, y su lógica de búsqueda no se puede configurar sin tocar código.

**Decisiones tomadas en el brainstorm:**

- Desarrollo por fases: radar + configuración → competencia y alertas → análisis de TdR → análisis de resultados y propuestas → LinkedIn y extras.
- LinkedIn queda para v2, por búsqueda indexada, nunca por scraping.
- BID: se recolectan los avisos públicos de proyectos y lo que llega por BEO se carga a mano.
- Usuarios: solo el equipo interno con cuentas @equipos.com.uy. No es multi-empresa.

**Decisiones incorporadas desde la búsqueda diaria del radar actual** (25/10/2026):

- **Países: Uruguay y Paraguay, con regla estricta.** Solo entra lo que se ejecuta en esos dos países. Un estudio multipaís entra solo si los nombra. Reemplaza el criterio anterior de “Uruguay + regional LAC”.
- **Fuentes nuevas:** DNCP Paraguay, Intendencia de Montevideo (no publica en Compras Estatales), Ceibal por su feed RSS, y búsquedas indexadas de UTEC, otros organismos de gub.uy y LinkedIn.
- **Reglas explícitas de qué entra y qué no**, y una rúbrica de relevancia. Están en la sección de fuentes.
- **El tablero actual ya tiene una hoja de propuestas de competidores**, con las colecciones `propuestas` y `contactos`. Se migra y la fase 4 parte de ahí.

## Problema

Las oportunidades de Equipos están repartidas en 16 portales con formatos distintos: compras estatales, bancos multilaterales, agencias de la ONU y organismos de cooperación. Hoy alguien tiene que revisarlos a mano o depender de un radar que solo corre si una computadora está prendida. El costo de no resolverlo es directo: **un llamado que se detecta tarde es un llamado al que no se llega**. Los de multilaterales suelen dar entre 2 y 4 semanas para una expresión de interés.

El segundo problema es el ruido. Detectar no alcanza: el equipo pierde horas leyendo términos de referencia de llamados que no encajan. Si la lista se llena de falsos positivos, el equipo deja de mirarla y el radar muere.

## Objetivos y no-objetivos

**Objetivos**

1. **Cero dependencia de una computadora.** El radar corre todos los días en GCP, con al menos 98% de corridas diarias exitosas en 30 días.
2. **Detección temprana.** El 90% de los llamados relevantes aparecen en el radar dentro de las 24 h siguientes a su publicación en una fuente cubierta.
3. **Poco ruido.** Al menos el 50% de los llamados marcados “alta” terminan en Analizando o en un estado posterior. Los “baja” no se muestran por defecto.
4. **Decisión más rápida (fase 3).** Pasar de “Nueva” a una decisión de postular o descartar en menos de 2 días hábiles, con ficha de TdR generada.
5. **Configurable sin código.** Un admin puede agregar una keyword, una exclusión o un competidor, o apagar una fuente, desde el panel, y el cambio rige en la corrida siguiente.
6. **Aprender de cada licitación (fase 4).** El 80% de las postulaciones cerradas tienen el resultado cargado y un análisis comparado dentro de los 30 días siguientes a la adjudicación.

**No-objetivos**

- **Scraping de LinkedIn.** Viola sus términos y pone en riesgo las cuentas. En v2 se evalúa solo la búsqueda indexada.
- **Integración con BEO (BID) o WBG eProcure.** Son portales con login y sin API. Lo que llega por ahí se carga a mano.
- **Armar la propuesta.** El radar ayuda a decidir si presentarse, no redacta la oferta. Es otra iniciativa.
- **Multi-empresa o venta a terceros.** Solo uso interno. Igual se usa un `orgId` en el modelo de datos para no cerrar la puerta.
- **Agregadores pagos en v1 (por ejemplo, la suscripción de DevelopmentAid).** Se evalúa con datos de cobertura reales después de la fase 1. UNDB Online ya no es opción: el portal cerró el 31/3/2025.

## Usuarios e historias de usuario

Hay tres roles, todos con cuenta @equipos.com.uy: **Admin** (dirección técnica u operativa), **Editor** (responsables comerciales y de proyectos) y **Lector** (resto del equipo).

**Editor: responsable comercial**

- Como editor, quiero ver cada mañana los llamados nuevos y abiertos ordenados por fit y cierre, para decidir en minutos cuáles mirar.
- Como editor, quiero cambiar el estado de un llamado y dejar una nota con responsable, para que el equipo sepa quién lo lleva.
- Como editor, quiero indicar el motivo al descartar (fuera de rubro, monto, país, requisitos, plazo), para que el radar aprenda qué no mostrar.
- Como editor, quiero cargar a mano un llamado que llegó por BEO, correo o un contacto, para tener todo el pipeline en un solo lugar.
- Como editor, quiero recibir un correo con los llamados “alta” que cierran pronto, para no depender de entrar al radar (fase 2).
- Como editor, quiero que al marcar “Analizando” se genere una ficha del TdR con requisitos, equipo clave, criterios y plazos, comparada con nuestros antecedentes, para decidir sin leer 60 páginas (fase 3).

**Editor: responsable de propuestas (fase 4)**

- Como responsable de propuestas, quiero marcar a qué llamados nos presentamos, con qué monto y con qué socios, para tener la historia completa de postulaciones.
- Como responsable de propuestas, quiero subir nuestra propuesta, las de la competencia y el acta de evaluación, para tener el expediente entero en un solo lugar.
- Como responsable de propuestas, quiero un análisis comparado que explique, criterio por criterio, por qué ganó el ganador, para mejorar la próxima propuesta.
- Como dirección, quiero ver la tasa de adjudicación y dónde perdemos puntos según el tipo de llamado, para decidir en qué vale la pena competir.

**Admin: dueño del radar**

- Como admin, quiero editar el perfil de la firma (sectores, servicios, antecedentes, países, montos), para que la clasificación refleje lo que de verdad hacemos.
- Como admin, quiero gestionar keywords y exclusiones por fuente, y prender o apagar fuentes, sin tocar código.
- Como admin, quiero ver el estado de cada fuente (última corrida, avisos leídos, errores), para enterarme cuando un scraper se rompe.
- Como admin, quiero gestionar la lista de competidores (RUT, nombre, grupo), para mantener la hoja Competencia.
- Como admin, quiero lanzar una corrida manual, para probar un cambio de configuración sin esperar al día siguiente.

**Lector**

- Como lector, quiero consultar el registro histórico de llamados y adjudicaciones, para preparar propuestas y entender el mercado.

**Casos borde**

- El mismo llamado aparece en dos fuentes (por ejemplo, BM y DevelopmentAid): se muestra una sola vez, con ambas fuentes.
- Un aviso sin fecha de cierre se muestra como “fecha a confirmar” y no cuenta para “cierra en 7 días”.
- Una fuente falla: el resto de la corrida sigue, la fuente queda en rojo en el panel y el admin recibe aviso.
- Un llamado se corrige o se prórroga: se actualiza la fecha de cierre y se guarda en el historial, sin crear un duplicado.
- Un usuario sin rol asignado entra con cuenta @equipos.com.uy: ve una pantalla de “pedir acceso” y no ve datos.

## Fuentes de datos

Las fuentes estructuradas van primero porque dan la mayor parte del valor con poco mantenimiento. Los scrapers se agregan de a uno y cada uno tiene su propio chequeo de salud.

| Fuente | País | Acceso | ¿Funciona desde la nube? | Fase |
| --- | --- | --- | --- | --- |
| [Compras Estatales (ARCE)](https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos/open-contracting) | UY | RSS OCDS mensual `/ocds/rss/AAAA/MM` y `/ocds/release/{id}`. Incluye 18 de las 19 intendencias y las compras de UTEC | **A probar:** el radar actual lo lee con navegador porque bloquea descargas desde la nube | 1 |
| Intendencia de Montevideo (cartelera SIAB) | UY | Vista de compras vigentes de la cartelera SIAB y detalle de cada compra. No publica en Compras Estatales | **A probar** (navegador en el radar actual) | 1 |
| [DNCP Paraguay](https://data.open-contracting.org/en/publication/63) | PY | API v3 de datos abiertos en OCDS, con actualización horaria y licencia CC BY 4.0. Hay que confirmar si pide registro | Sí (el radar actual la lee sin navegador) | 1 |
| Banco Mundial | UY, PY | API JSON `procnotices` con `project_ctry_name_exact=Uruguay` o `Paraguay` | Sí | 1 |
| BID | UY, PY | Dataset de data.iadb.org y búsqueda de avisos públicos. BEO, a mano | Sí | 1 |
| [UNGM (ONU)](https://www.ungm.org/Public/Notice) | UY, PY | Listado público buscado por país, verificando el país beneficiario de cada fila | **A probar** (navegador) | 1 |
| [CND](https://llamados.cnd.org.uy/) | UY | Otros llamados y llamados a ofertas en línea | Sí | 1 |
| [AUCI](https://www.gub.uy/agencia-uruguaya-cooperacion-internacional/comunicacion/convocatorias) | UY | Convocatorias marcadas “Vigente” | Sí | 1 |
| [FIAP (ex FIIAPP)](https://www.fiap.gob.es/ofertas/) | UY, PY | Página de ofertas y búsquedas de convocatorias de EUROsociAL | Sí | 1 |
| Ceibal | UY | Feed RSS de convocatorias abiertas en compras.ceibal.edu.uy | **A probar** (navegador) | 1 |
| ANDE | UY | Páginas de llamados a consultoría y otros llamados (etiqueta ABIERTO o CERRADO). Se excluyen sus convocatorias de fondos | **A probar** (navegador) | 2 |
| UTEC (sitio propio) | UY | Búsqueda indexada de llamados a consultoría. Las compras ya llegan por ARCE | Sí | 2 |
| Otros gub.uy | UY | Búsqueda indexada de expresiones de interés y llamados del MEF | Sí | 2 |
| LinkedIn | UY, PY | Búsqueda indexada de posts de los últimos 15 días, nunca login. Se prefiere siempre el aviso oficial | Sí | 2 |
| CAF | — | Su robots.txt bloquea lectores automáticos. **El radar actual la lee con navegador: hay que decidir** | No corresponde | Manual |
| [DevelopmentAid](https://www.developmentaid.org/legal-terms/terms-policy) | — | Sus términos prohíben la extracción automatizada. **El radar actual la lee con navegador: hay que decidir.** Hay API con membresía | Solo por API | Manual o API paga |
| BEO (BID) y WBG eProcure | — | Carga manual (requieren login) | No aplica | 1 |

**Riesgo nuevo: acceso desde la nube.** El radar actual usa el navegador de una computadora personal para 7 fuentes, porque esos sitios bloquean descargas desde servidores. Si bloquean a Cloud Run, mudarse a GCP no alcanza. Por eso la semana 1 de la fase 1 prueba cada fuente desde Cloud Run (requisito 10 de la fase 1).

Los datos de ARCE se publican bajo la Licencia de Datos Abiertos de Uruguay, que exige citar la fuente ([open-contracting.org](https://data.open-contracting.org/en/publication/43)).

### Alternativas a UNDB Online

UNDB Online [cerró el 31/3/2025](https://www.gov.pl/web/rozwoj-technologia/baza-zamowien-publicznych-united-nations-development-business-zmiany-w-funkcjonowaniu). La mayor parte de lo que publicaba se puede leer gratis en la fuente original: la API del Banco Mundial, el dataset del BID y UNGM. **Recomendación: la fase 1 arranca sin pagar nada.** Se mide qué llamados llegan por fuera del radar y, si los huecos lo justifican, se contrata DevelopmentAid con API. Es la única opción que permite integrarse sin violar términos.

| Opción | Qué aporta | Costo | Encaje con el radar |
| --- | --- | --- | --- |
| Fuentes oficiales (BM, BID, UNGM) | Cubren casi todo lo que publicaba UNDB para Uruguay | Gratis | Ya están en la fase 1 |
| [DevelopmentAid](https://www.developmentaid.org/donors/membership) | Indexa CAF, AUCI, agencias de la UE y donantes bilaterales, en español | Membresía institucional; el precio se cotiza | **El mejor:** tiene API permitida para uso interno |
| [Devex Pro Funding](https://www.devex.com/membership/organizations) | Alertas, shortlists y adjudicaciones de más de 850 fuentes. Útil para el radar de socios | Plan institucional a cotizar (Devex Pro individual: US$ 499/año) | Sin API documentada: solo alertas por correo |
| UNGM Pro | Alertas de búsquedas guardadas en UNGM | No pude verificar el precio | Redundante si el radar ya lee UNGM |
| dgMarket | Avisos del BM y otros organismos | No publica precios | **No recomendado:** el último aviso visible es de diciembre de 2025 |

### Reglas de inclusión, exclusión y relevancia

Estas reglas vienen de la búsqueda diaria del radar actual. Van en `config/busqueda` y en el prompt del clasificador, así que el admin las puede editar.

**Alcance geográfico (estricto).** El país beneficiario o el lugar de ejecución tiene que ser Uruguay o Paraguay. Un estudio multipaís entra solo si los nombra. Lo demás se descarta, aunque admita firmas uruguayas.

**Sí entran:**

- Llamados a firmas o equipos para estudios de opinión pública, encuestas de hogares, de usuarios o de satisfacción, relevamientos y levantamiento de datos, e investigación de mercado.
- Estudios cualitativos (grupos focales, entrevistas), líneas de base, evaluaciones de programas o de impacto con trabajo de campo, y estudios de percepción, imagen o clima.
- Consultorías individuales de evaluación o investigación de alto nivel.

**No entran:**

- Obras, suministros, equipamiento, mantenimiento e insumos médicos.
- Contratación de personal individual (encuestadores, analistas sueltos).
- Becas y fondos para empresas.
- Estudios de ingeniería, suelos, saneamiento, proyectos ejecutivos, factibilidad de infraestructura, impacto ambiental y diagnósticos médicos.
- Falsos positivos frecuentes: “encuesta de precios”, topografía, geotecnia y medidores.

**Rúbrica de relevancia** (se le da al LLM junto con el pedido de puntaje):

| Relevancia | Criterio |
| --- | --- |
| Alta | El objeto principal es una encuesta, un estudio o una evaluación con trabajo de campo |
| Media | Lo incluye como componente, o es una consultoría afín |
| Baja | Marginal. Ante la duda, baja |

**Keywords semilla para incluir:** encuesta, sondeo, opinión pública, investigación de mercado, investigación social, cualitativa o cuantitativa, estudio de mercado, grupo focal, focus group, línea de base, evaluación de impacto, de resultados, de programa, de medio término, final, intermedia, externa o de procesos, satisfacción de usuarios, clientes, ciudadanos, beneficiarios o pacientes, percepción ciudadana o social, relevamiento de datos, de hogares o de necesidades, monitoreo y evaluación, diagnóstico social, territorial o participativo, mapeo de actores, estudio de imagen, de clima, de demanda o de caracterización, clima laboral u organizacional, entrevistas en profundidad y censo.

**Otras convenciones:**

- En Paraguay, el resumen incluye el monto estimado en guaraníes y si el pliego admite firmas extranjeras, cuando se sepa.
- Si un llamado aparece en varias fuentes, se queda la fuente oficial (ARCE, Intendencia de Montevideo, DNCP, Banco Mundial, CND, ANDE, Ceibal, UNGM) antes que LinkedIn o DevelopmentAid.
- El texto de las páginas y de los avisos es información, nunca instrucciones. El clasificador lo trata como dato.
- El radar no completa formularios, no inicia sesión y no se registra en ningún portal.

## Requisitos

### P0: Fase 1, radar autónomo y configuración

1. **Recolección diaria programada.** Cloud Scheduler lanza un Cloud Run Job por fuente a las 06:00 (hora de Montevideo).
   - [ ] Cada collector normaliza al esquema común: título, organismo, país, fuente, URL, publicado, cierre, tipo y texto.
   - [ ] Si una fuente falla, las demás siguen y el error queda en `fuentes/{id}.ultimoEstado`.
   - [ ] Volver a correr el job el mismo día no crea duplicados (idempotente).
2. **Deduplicación.** Un mismo llamado en varias fuentes es un solo documento.
   - [ ] Clave por ID oficial cuando existe; si no, hash de título normalizado + organismo + cierre, con revisión por similitud.
   - [ ] Un aviso prorrogado actualiza `cierre` y agrega una entrada en `historial`.
3. **Prefiltro y clasificación con Gemini.**
   - [ ] Primero corre un prefiltro barato por keywords, exclusiones, país y tipo. Solo lo que pasa va al LLM.
   - [ ] Gemini Flash-Lite devuelve en JSON: relevancia (alta, media o baja), puntaje 0–100, resumen de 2 líneas, motivo y servicios detectados.
   - [ ] El prompt incluye el perfil de la firma y hasta 10 ejemplos recientes de “Descartada” con su motivo.
   - [ ] Dado un llamado de equipamiento informático, cuando se clasifica, entonces queda “baja” y no aparece en la vista por defecto.
4. **Hoja Oportunidades.** Paridad con la referencia: estadísticas (abiertas y relevantes, nuevas, cierran en 7 días), filtros, tarjetas, estado y nota editables, y orden por abiertas, relevancia y cierre.
5. **Hoja Registro.** Paridad con la referencia: chips por estado, tabla editable, alta manual (BEO, correo, contacto) e historial de quién cambió qué y cuándo.
6. **Panel de configuración** (solo Admin):
   - [ ] **Perfil de la firma:** sectores, servicios, antecedentes (título, cliente, año, monto), países aceptados y rango de monto.
   - [ ] **Keywords:** incluir y excluir, globales y por fuente, en español, inglés y portugués.
   - [ ] **Fuentes:** prender o apagar cada una, ver última corrida, avisos leídos y errores, y lanzar una corrida manual.
   - [ ] **Usuarios y roles:** invitar con cuenta @equipos.com.uy y asignar Admin, Editor o Lector.
   - [ ] Un cambio guardado rige en la corrida siguiente y queda en un log de auditoría.
7. **Acceso.** Firebase Auth con Google, restringido al dominio equipos.com.uy. Los roles van en *custom claims* y las Firestore Rules aplican lectura y escritura por rol.
8. **Migración.** Importar todas las colecciones del radar actual (oportunidades, competidores, adjudicaciones, propuestas, contactos y config), para no perder historia.

**Agregados de la fase 1 que vienen de la búsqueda diaria del radar actual:**

- **Uruguay y Paraguay.** El país es `UY` o `PY`, con la regla geográfica estricta. El perfil admite montos en pesos, dólares y guaraníes.
- **Fuentes nuevas en la fase 1:** DNCP Paraguay, Intendencia de Montevideo (SIAB) y Ceibal (RSS).
- **Acceso a sitios que bloquean la nube.** En la semana 1 se prueba cada fuente desde Cloud Run, con HTTP simple y con navegador sin interfaz (Playwright). Si una fuente rechaza el pedido, se prueba en este orden:
  1. IP fija de salida con Cloud NAT (\~US$ 4–5/mes).
  2. Un agente local en un equipo de la oficina siempre prendido, que corre solo esos collectors y escribe en Firestore.
  3. Carga manual.
  - [ ] Nunca se depende de la computadora personal de alguien.
- **Resumen de cada corrida.** Al terminar, un correo corto a los admins con las nuevas por país y fuente, la lista de alta y media (título, organismo, país y cierre), las fuentes que fallaron y el link. Es lo que hoy recibe Marcos, así que se mantiene; el digest configurable por usuario sigue en la fase 2.
- **IDs compatibles con el radar actual.** El `doc_id` es el slug de la fuente más el ID del llamado: `ce-1378357`, `bm-OP00473712`, `dncp-<ID>`, `im-D197177`, `ceibal-<n>`, `ungm-<n>`. Así la migración no remapea.
- **Protección contra instrucciones en las páginas.** El texto de los avisos va al LLM como dato delimitado, y la salida solo se acepta si cumple el esquema JSON.

### P1: Fase 2, competencia y alertas

1. **Hoja Competencia.** Adjudicaciones de ARCE a los RUT configurados, con torta y barras por monto en pesos, y conversión por tipo de cambio BCU de la fecha.
2. **Alertas por correo.** Digest diario (o semanal, a elección de cada usuario) y aviso inmediato para “alta” con cierre en 10 días o menos. Se envían por Gmail API desde una cuenta de servicio o por la extensión *Trigger Email* de Firebase.
3. **Más fuentes (sin DevelopmentAid, que solo se integra por API si se contrata).** ANDE, el sitio de UTEC, otros llamados de gub.uy y LinkedIn por búsqueda indexada (adelantado desde la fase 5).
4. **Métricas de precisión.** Una vista interna con el porcentaje de “alta” que llega a Analizando y los motivos de descarte más frecuentes.

### P1: Fase 3, análisis de TdR (go/no-go)

1. Al pasar a “Analizando”, el sistema descarga los PDF del llamado (o un editor los sube a Cloud Storage).
2. Gemini Pro extrae una ficha estructurada: objeto, requisitos de experiencia de la firma, equipo clave, criterios y ponderaciones, plazos, presupuesto, idioma, si admite consorcio y documentos a presentar.
3. La ficha se cruza con los antecedentes del perfil y marca cada requisito como “cumplimos”, “parcial” o “no cumplimos”, con la evidencia.
   - [ ] Cada dato de la ficha cita la página del PDF de donde sale.
   - [ ] Si el PDF es escaneado o no se puede leer, la ficha lo dice y no inventa campos.

### P1: Fase 4, análisis de resultados y propuestas

El tablero actual ya tiene una hoja de propuestas de competidores (colecciones `propuestas` y `contactos`). La fase 4 parte de esos datos migrados y respeta su diseño, en lugar de empezar de cero.

1. **Marcar postulaciones.** Al pasar un llamado a “Nos presentamos”, se crea una postulación con fecha de presentación, monto ofertado y moneda, modalidad (sola, consorcio o subcontrato), socios y responsable.
   - [ ] No se puede marcar “Ganada” o “Perdida” sin una postulación.
   - [ ] Los llamados cargados a mano también admiten postulación.
2. **Carga de documentos.** En cada postulación, un editor sube archivos PDF, DOCX o XLSX a Cloud Storage y los clasifica por tipo: propuesta de Equipos (técnica y económica), propuesta de un competidor (vinculada a su RUT en `competidores`), TdR, acta o informe de evaluación, resolución de adjudicación, y consultas y aclaraciones.
   - [ ] Hasta 50 MB por archivo. Se aceptan PDFs escaneados.
   - [ ] Cada documento registra quién lo subió, cuándo y de dónde se obtuvo (portal, vista del expediente o pedido de acceso a la información).
3. **Resultados de evaluación.** Un formulario permite cargar los puntajes por criterio y oferente, el monto ofertado, el puesto y el adjudicatario. Gemini puede proponer los valores a partir del acta, y un editor los confirma antes de guardarlos.
   - [ ] Si el acta no trae puntajes por criterio, se carga solo el resultado final.
   - [ ] Si la adjudicación ya figura en ARCE (fase 2), se vincula automáticamente.
4. **Análisis comparado con IA.** Una postulación con resultado tiene un botón “Analizar”. Gemini Pro lee todas las propuestas, el TdR y el acta, y arma un informe con:
   - Una tabla por criterio con el puntaje de cada oferente y lo que hizo distinto el mejor puntuado.
   - Una comparación de enfoque metodológico, muestra y diseño, equipo clave, cronograma y precio.
   - Las fortalezas y debilidades de la propuesta de Equipos frente a la ganadora.
   - Entre 3 y 5 recomendaciones concretas para la próxima propuesta similar.
   - [ ] Cada afirmación sobre una propuesta cita el documento y la página. Si no hay evidencia, el informe lo dice.
   - [ ] Si faltan las propuestas de la competencia, el análisis se hace solo contra el acta y lo aclara.
   - [ ] El informe queda versionado y se puede exportar a PDF.
5. **Vista Resultados.** Muestra la tasa de adjudicación por organismo, fuente, tipo de servicio y rango de monto, la diferencia de precio con el ganador, los criterios donde Equipos pierde más puntos y los competidores más frecuentes.
   - [ ] Los hallazgos de análisis anteriores alimentan el perfil de la firma y la ficha de TdR de la fase 3. Por ejemplo: “en llamados del BID perdemos puntos en equipo clave”.
6. **Confidencialidad.** Los documentos solo los ven Admin y Editor; Lector ve resultados agregados. El bucket es privado, las descargas se hacen con URLs firmadas de corta duración y quedan en un log. El procesamiento va por Vertex AI, que no usa los datos del cliente para entrenar modelos.

### P2: Fase 5, consideraciones futuras

- **Web abierta** por búsqueda indexada (grounding).
- **Radar de socios:** shortlists y adjudicaciones a consultoras internacionales en Uruguay, para ofrecerse como socio local de campo.
- **Biblioteca de antecedentes y CVs** reutilizable en propuestas.
- **Evaluar un agregador pago** si la fase 1 muestra huecos de cobertura. El candidato es DevelopmentAid con API.

Para no cerrar estas puertas: usar `orgId` en todas las colecciones, guardar el texto completo de cada aviso y versionar los prompts.

## Arquitectura y modelo de datos

La arquitectura separa la recolección (jobs batch en Cloud Run, sin servidores prendidos) de la app (Firebase). Se comunican solo a través de Firestore.

&#91;embedded content: arquitectura · pipeline diario y app\]

La app nunca llama a las fuentes ni al LLM. Lee Firestore en tiempo real, y el pipeline lee de Firestore la configuración que edita el admin.

**Decisiones de stack**

- **Collectors:** Python 3.12 en contenedores de Cloud Run Jobs. Un job por fuente, para que una falla no tumbe al resto.
- **Orquestación:** Cloud Scheduler dispara un Cloud Workflow que lanza los jobs en paralelo y después el paso de clasificación. La corrida manual del panel llama al mismo workflow mediante una Cloud Function con control de rol.
- **LLM:** Gemini por Vertex AI con cuenta de servicio y salida en JSON con esquema. Modelo y prompt quedan versionados en `config`.
- **App:** React + Vite en Firebase Hosting, con Firebase Auth (Google, dominio equipos.com.uy), roles por *custom claims* y Firestore Rules.
- **Región:** Firestore y Cloud Run en `southamerica-east1` (São Paulo), lo más cerca de Montevideo. Vertex AI en la región o endpoint global donde esté disponible el modelo.
- **Secretos y observabilidad:** Secret Manager para credenciales y Cloud Logging con alertas por error de job.

**Colecciones de Firestore** (todas con `orgId`)

| Colección | Contenido principal | Quién escribe |
| --- | --- | --- |
| `oportunidades/{slug-fuente}-{id}` | título, organismo, país (UY o PY), fuentes\[\], url, publicado, cierre, tipo, texto, relevancia, puntaje, resumen, motivo, estado, nota, historial\[\], ficha (fase 3) | Pipeline y editores |
| `config/perfil` | sectores, servicios, antecedentes\[\], países, rango de monto en UYU, USD y PYG, versión de prompt y modelo | Admin |
| `config/busqueda` | keywords a incluir y excluir, reglas de inclusión y exclusión, rúbrica de relevancia y umbrales | Admin |
| `fuentes/{id}` | activa, tipo de acceso (HTTP, navegador, agente local o manual), último estado, avisos leídos, último error | Pipeline y admin |
| `corridas/{id}` | inicio, fin, conteos por fuente, errores y tokens del LLM | Pipeline |
| `competidores/{rut}` | nombre, grupo, si es propio | Admin |
| `adjudicaciones/{id}` | rut, organismo, objeto, monto, moneda, monto en pesos, tipo de cambio BCU, fecha, url (fase 2) | Pipeline |
| `propuestas/{id}` y `contactos/{id}` | Hoja actual de propuestas de competidores, migrada tal cual. La fase 4 la integra a `postulaciones` | Editores |
| `postulaciones/{id}` | oportunidadId, fecha de presentación, monto ofertado, moneda, modalidad, socios\[\], responsable, resultado (fase 4) | Editores |
| `postulaciones/{id}/documentos/{docId}` | tipo, oferente (RUT), ruta en Cloud Storage, origen, quién lo subió y cuándo (fase 4) | Editores |
| `postulaciones/{id}/evaluacion` | por oferente: puntaje por criterio, total, monto, puesto; adjudicatario (fase 4) | Editores, con propuesta de la IA |
| `postulaciones/{id}/analisis/{version}` | informe comparado, citas, modelo y versión de prompt, voto de utilidad (fase 4) | Sistema |
| `usuarios/{uid}` | rol, preferencias de alerta | Admin |
| `auditoria/{id}` | quién cambió qué y cuándo en la configuración, y descargas de documentos | Sistema |

## Costos estimados

**Operar el radar costaría entre US$ 15 y 30 por mes con las cinco fases activas, con un techo razonable de \~US$ 50.** Casi toda la infraestructura entra en las capas gratuitas. El costo real es el LLM, y el prefiltro por keywords lo mantiene bajo. Son precios de lista en USD, consultados en octubre de 2026.

| Componente | Supuesto de uso | Costo mensual (USD) |
| --- | --- | --- |
| Gemini 3.1 Flash-Lite (clasificación) | \~100 avisos/día tras el prefiltro, \~3k tokens de entrada y 300 de salida cada uno. A US$ 0,25 / 1M de entrada y US$ 1,50 / 1M de salida | \~4 (\~18 sin prefiltro) |
| Gemini 3.1 Pro (fichas de TdR, fase 3) | \~20 PDFs/mes de \~80k tokens. A US$ 2 / 1M de entrada y US$ 12 / 1M de salida | \~5 |
| Gemini 3.1 Pro (análisis comparado, fase 4) | \~4 análisis/mes de \~5 documentos y \~250k tokens cada uno. Por encima de 200k tokens se cobra US$ 4 / 1M de entrada y US$ 18 / 1M de salida, unos US$ 1,30 por análisis | \~5 |
| Grounding con Google Search (fase 2: LinkedIn, UTEC, gub.uy, BID) | \~15 consultas/día, unas 450/mes. Hay 5.000 gratis por mes; después US$ 14 cada 1.000 | 0 |
| Cloud NAT con IP fija (solo si alguna fuente bloquea a Cloud Run) | IP a US$ 0,005/h (US$ 3,60/mes), gateway a US$ 0,0014 por instancia y hora, y US$ 0,045 por GiB procesado, con pocos GiB | \~4–5 |
| Agente local en la oficina (solo si la IP fija no alcanza) | Un equipo chico siempre prendido | Hardware a cotizar |
| Cloud Run Jobs | \~10 collectors × 2 min × 30 días, unos 36k vCPU-s. Gratis hasta 240k vCPU-s por mes | 0 |
| Firestore | Unos miles de documentos y lecturas de un equipo chico, dentro de la cuota gratuita diaria | 0–2 |
| Cloud Scheduler y Workflows | 1 job y 1 workflow diarios | \~0–1 |
| Cloud Storage, Artifact Registry, Secret Manager, Logging | PDFs de TdR y propuestas, crudos e imágenes de contenedores: pocos GB | \~1–3 |
| Firebase Hosting + Auth | Usuarios internos, tráfico mínimo | 0 |
| Correo (Gmail API) | Resumen de cada corrida y digest diario a menos de 20 personas | 0 |
| **Total** |  | **\~15–30 (techo \~50)** |

- **Ojo con 2027:** los modelos Flash (no Flash-Lite) suben de US$ 0,75 a US$ 1,50 por 1M de entrada desde el 1/1/2027. Por eso la clasificación usa Flash-Lite.
- **Para ahorrar:** la clasificación diaria puede ir por *batch*, que cuesta la mitad. Encaja porque no es en tiempo real.
- **Fuera de este cálculo:** un agregador pago, si se contrata, y las horas de desarrollo.
- **Control:** poner una alerta de presupuesto en Cloud Billing en US$ 40/mes.

Fuentes de precios: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) y [Cloud Run pricing](https://cloud.google.com/run/pricing). El precio de Vertex AI puede diferir levemente; conviene confirmarlo en la consola.

## Métricas de éxito

Todas se calculan desde Firestore, a partir del historial de estados y de la colección `corridas`. Se revisan a los 30 y a los 90 días de lanzar la fase 1.

| Métrica | Tipo | Meta | Meta ambiciosa | Cómo se mide |
| --- | --- | --- | --- | --- |
| Corridas diarias exitosas | Adelantado | ≥ 98% | 100% | `corridas` con estado ok / días del período |
| Precisión de “alta” | Adelantado | ≥ 50% | ≥ 70% | “alta” que llegan a Analizando o más / total de “alta” |
| Latencia de detección | Adelantado | 90% en menos de 24 h | 90% en menos de 12 h | `detectado` − `publicado` |
| Uso semanal | Adelantado | ≥ 3 editores | Todo el equipo comercial | Usuarios distintos que cambian un estado en la semana |
| Tiempo hasta decidir | Adelantado (fase 3) | Menos de 2 días hábiles | Menos de 1 día | Nueva → Postular o Descartada |
| Postulaciones con resultado cargado | Adelantado (fase 4) | ≥ 80% a los 30 días de adjudicada | 100% | Postulaciones con evaluación / postulaciones cerradas |
| Análisis comparados útiles | Adelantado (fase 4) | ≥ 70% | ≥ 90% | Voto “útil / no útil” al pie de cada informe |
| Propuestas presentadas que salieron del radar | Rezagado | ≥ 4 por trimestre | ≥ 8 | Estado “Nos presentamos” con fuente distinta de manual |
| Adjudicaciones ganadas que salieron del radar | Rezagado | ≥ 1 en 6 meses | ≥ 3 | Estado “Ganada” |
| Tasa de adjudicación de Equipos | Rezagado (fase 4) | Línea de base a los 6 meses | +5 puntos a los 12 meses | Ganadas / postulaciones con resultado |
| Llamados relevantes perdidos | Rezagado | 0 por trimestre | 0 | Llamados que el equipo conoció por fuera y que una fuente cubierta ya había publicado |

Las metas son hipótesis iniciales. Conviene ajustarlas con el volumen histórico del radar actual después de la migración.

## Fases y cronograma

La fase 1 tarda unas 6 a 7 semanas (una más por Paraguay, la Intendencia de Montevideo, Ceibal y la prueba de acceso desde la nube) y reemplaza al radar actual. Cada fase siguiente arranca solo cuando se cumple el criterio medible de la anterior. La fase 4 depende solo de la 1 (necesita el estado “Nos presentamos”), así que puede adelantarse a la 3 si se prioriza.

&#91;embedded content: hoja de ruta · 5 fases y 4 criterios de paso\]

No hay fechas límite contractuales. La única dependencia externa es validar el dataset del BID y el formato de exportación del radar actual, dos tareas de la primera semana. Durante las 2 semanas en paralelo, el radar actual sigue activo y se comparan los dos resultados.

## Preguntas abiertas y riesgos

**Preguntas que bloquean la fase 1**

- [ ] ¿Se usa el mismo proyecto GCP y Firebase que el sistema de paneles, o uno nuevo? Recomiendo uno nuevo, para aislar billing y permisos. *(Ingeniería)*
- [ ] ¿El dataset del BID en data.iadb.org trae país, tipo de aviso y fecha de cierre, y se actualiza todos los días? Hay que verificarlo con el CSV real antes de comprometer la fuente. *(Ingeniería)*
- [ ] ¿Quién es dueño del perfil de la firma y carga los antecedentes iniciales? *(Dirección)*
- [ ] ¿Cómo se exporta la data del radar actual (oportunidades, registro, competidores) para migrarla? *(Ingeniería)*

* [ ] ¿Qué fuentes responden desde Cloud Run y cuáles necesitan IP fija o agente local? Se resuelve con la prueba de la semana 1. *(Ingeniería)*
* [ ] CAF y DevelopmentAid: el radar actual los lee con navegador, pero CAF lo prohibe en su robots.txt y DevelopmentAid en sus términos de uso. ¿Se pasan a carga manual (lo que recomiendo) o se contrata la API de DevelopmentAid? *(Dirección y Legal)*
* [ ] ¿La API de la DNCP pide registro o credenciales? *(Ingeniería)*

**Preguntas que no bloquean**

- [ ] ¿El digest va a cada usuario o a una lista común (licitaciones@)? *(Comercial)*
- [ ] ¿Los términos de uso de UNGM permiten la lectura automatizada del listado público? (DevelopmentAid ya está respondido: no la permite.) *(Legal)*
- [ ] ¿Qué umbral de monto mínimo justifica mirar un llamado? *(Comercial)*
- [ ] ¿Se guardan las fichas de TdR como antecedente para propuestas futuras? *(Dirección)*

* [ ] ¿Qué propuestas de la competencia se pueden obtener y usar internamente, y por qué vía (vista del expediente o pedido de acceso a la información pública, Ley 18.381)? ¿Cambia según sea un llamado estatal o de un multilateral? *(Legal)*
* [ ] ¿Cuánto tiempo se guardan las propuestas y quién puede borrarlas? *(Dirección)*

**Riesgos**

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Sitios que bloquean pedidos desde la nube (ARCE, IM, UNGM, Ceibal, ANDE) | Alto | Prueba en la semana 1. Después, IP fija, agente local en la oficina o carga manual, en ese orden |
| Demasiado ruido y el equipo deja de mirar | Alto | Prefiltro, reglas de exclusión explícitas, “baja” oculto por defecto, aprendizaje con descartes y la métrica de precisión desde el día 1 |
| Filtración de propuestas propias o de la competencia | Alto | Bucket privado, acceso solo para Admin y Editor, URLs firmadas de corta duración y log de descargas |
| Un scraper se rompe sin que nadie se entere | Medio | Health check por fuente, alerta si una fuente trae 0 avisos 3 días seguidos, y punto rojo en el panel |
| Huecos de cobertura (lo que solo sale por BEO, CAF o DevelopmentAid) | Medio | Carga manual fácil y medir cuántos llamados llegan por fuera para decidir si vale un agregador pago |
| Una página con instrucciones ocultas manipula al clasificador | Medio | Texto del aviso delimitado como dato, salida solo en JSON con esquema y sin herramientas disponibles para el modelo |
| El LLM clasifica mal o inventa datos del TdR o de las propuestas | Medio | Salida en JSON validado, citas de página obligatorias y revisión humana antes de postular o de guardar puntajes |
| No conseguir las propuestas de la competencia | Medio | El análisis funciona igual contra el acta de evaluación. Pedirlas por vista del expediente o por acceso a la información pública cuando corresponda |
| Suben los precios del LLM | Bajo | Flash-Lite y batch, modelo configurable y alerta de presupuesto en US$ 40/mes |
