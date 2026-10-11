# PRD · Radar de Licitaciones Equipos (GCP + Firebase)

Oct 10, 2026 · @Equipos · Borrador v0.1

## Resumen

Construir en Google Cloud + Firebase un **radar de licitaciones autónomo** para Equipos Consultores. El radar detecta todos los días los llamados de investigación, encuestas y evaluación aplicables a Uruguay, los clasifica según qué tan bien encajan con la firma y acompaña la decisión de presentarse. Se entrega en cuatro fases. La primera reemplaza al radar actual con algo que corre solo y suma un panel de configuración.

**Punto de partida.** El radar de referencia ya cubre 14 fuentes y tiene tres hojas: Oportunidades, Registro y Competencia. También maneja relevancia alta, media y baja y un pipeline de estados (Nueva, Analizando, Vamos a postular, Nos presentamos, En evaluación, Ganada, Perdida, Descartada). Tiene dos limitaciones: depende de una tarea programada que necesita una computadora prendida, y su lógica de búsqueda no se puede configurar sin tocar código.

**Decisiones tomadas en el brainstorm:**

- Desarrollo por fases: radar + configuración → competencia y alertas → análisis de TdR → LinkedIn y extras.
- LinkedIn queda para v2, por búsqueda indexada, nunca por scraping.
- BID: se recolectan los avisos públicos de proyectos y lo que llega por BEO se carga a mano.
- Usuarios: solo el equipo interno con cuentas @equipos.com.uy. No es multi-empresa.

## Problema

Las oportunidades de Equipos están repartidas en más de 14 portales con formatos distintos: compras estatales, bancos multilaterales, agencias de la ONU y organismos de cooperación. Hoy alguien tiene que revisarlos a mano o depender de un radar que solo corre si una computadora está prendida. El costo de no resolverlo es directo: **un llamado que se detecta tarde es un llamado al que no se llega**. Los de multilaterales suelen dar entre 2 y 4 semanas para una expresión de interés.

El segundo problema es el ruido. Detectar no alcanza: el equipo pierde horas leyendo términos de referencia de llamados que no encajan. Si la lista se llena de falsos positivos, el equipo deja de mirarla y el radar muere.

## Objetivos y no-objetivos

**Objetivos**

1. **Cero dependencia de una computadora.** El radar corre todos los días en GCP, con al menos 98% de corridas diarias exitosas en 30 días.
2. **Detección temprana.** El 90% de los llamados relevantes aparecen en el radar dentro de las 24 h siguientes a su publicación en una fuente cubierta.
3. **Poco ruido.** Al menos el 50% de los llamados marcados “alta” terminan en Analizando o en un estado posterior. Los “baja” no se muestran por defecto.
4. **Decisión más rápida (fase 3).** Pasar de “Nueva” a una decisión de postular o descartar en menos de 2 días hábiles, con ficha de TdR generada.
5. **Configurable sin código.** Un admin puede agregar una keyword, una exclusión o un competidor, o apagar una fuente, desde el panel, y el cambio rige en la corrida siguiente.

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

| Fuente | Acceso | Estado verificado (10/10/2026) | Fase | Riesgo |
| --- | --- | --- | --- | --- |
| [Compras Estatales (ARCE)](https://www.gub.uy/agencia-reguladora-compras-estatales/datos-y-estadisticas/datos/open-contracting) | RSS OCDS `comprasestatales.gub.uy/ocds/rss` (últimos 500), más `/ocds/rss/AAAA/MM` y `/ocds/record/{id}` en JSON. También cubre las compras de UTEC | Activa | 1 | Bajo |
| Banco Mundial | API JSON `search.worldbank.org/api/v2/procnotices`: 422.409 avisos, el último del 9/10/2026. El filtro por país que probé no filtró; hay que validar los parámetros | Activa | 1 | Bajo |
| [BID: avisos de proyectos](https://data.iadb.org/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards) | CSV con API *datastore* en data.iadb.org, actualizado el 9/10/2026. La página de avisos de iadb.org ahora remite a la app “BID for the Americas” y no tiene un listado para leer | Activa. Falta validar los campos de país y cierre | 1 | Medio |
| [UNGM (ONU)](https://www.ungm.org/Public/Notice) | Listado público con filtro por país beneficiario (Uruguay). Sin API ni RSS. Incluye al PNUD, cuyo portal propio está desactualizado desde junio de 2024 | Activa. Revisar términos de uso | 1 | Medio |
| [CND](https://llamados.cnd.org.uy/) | Scraping del listado, con estados abierto y cerrado | Activa (último llamado del 8/10/2026) | 1 | Medio |
| [AUCI](https://www.gub.uy/agencia-uruguaya-cooperacion-internacional/comunicacion/convocatorias) | Scraping. **Cambió la URL:** auci.gub.uy redirige a gub.uy. Mezcla consultorías con becas y programas | Activa | 1 | Medio |
| [FIAP (ex FIIAPP)](https://www.fiap.gob.es/perfil_contratante/) | Scraping del perfil del contratante. **Cambió el dominio** a fiap.gob.es | Sitio activo (noticias del 9/10/2026). No pude ver el listado | 2 | Medio |
| CAF | caf.com bloquea lectores automáticos por robots.txt, así que no corresponde scrapearlo. Sus convocatorias aparecen indexadas en DevelopmentAid | No verificable | Manual o agregador | Alto |
| ANDE, Ceibal, sitio de UTEC | Scraping | **No verificado:** los sitios rechazan el acceso desde este entorno. Revisar a mano en la semana 1 | 2 | Alto |
| [DevelopmentAid](https://www.developmentaid.org/legal-terms/terms-policy) | **No scrapear:** sus términos prohíben la extracción automatizada. Tiene API con membresía, solo para uso interno | Activa | Ver alternativas | Bajo con API |
| BEO (BID) y WBG eProcure | Carga manual: requieren login y no tienen API | Sin cambios | 1 | No aplica |
| LinkedIn | Búsqueda indexada con Gemini y grounding. Nunca login ni scraping | No aplica | v2 | Medio |

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
8. **Migración.** Importar las oportunidades, el registro y los competidores del radar actual, para no perder historia.

### P1: Fase 2, competencia y alertas

1. **Hoja Competencia.** Adjudicaciones de ARCE a los RUT configurados, con torta y barras por monto en pesos, y conversión por tipo de cambio BCU de la fecha.
2. **Alertas por correo.** Digest diario (o semanal, a elección de cada usuario) y aviso inmediato para “alta” con cierre en 10 días o menos. Se envían por Gmail API desde una cuenta de servicio o por la extensión *Trigger Email* de Firebase.
3. **Más fuentes (sin DevelopmentAid, que solo se integra por API si se contrata).** FIAP, ANDE, Ceibal y el sitio de UTEC.
4. **Métricas de precisión.** Una vista interna con el porcentaje de “alta” que llega a Analizando y los motivos de descarte más frecuentes.

### P1: Fase 3, análisis de TdR (go/no-go)

1. Al pasar a “Analizando”, el sistema descarga los PDF del llamado (o un editor los sube a Cloud Storage).
2. Gemini Pro extrae una ficha estructurada: objeto, requisitos de experiencia de la firma, equipo clave, criterios y ponderaciones, plazos, presupuesto, idioma, si admite consorcio y documentos a presentar.
3. La ficha se cruza con los antecedentes del perfil y marca cada requisito como “cumplimos”, “parcial” o “no cumplimos”, con la evidencia.
   - [ ] Cada dato de la ficha cita la página del PDF de donde sale.
   - [ ] Si el PDF es escaneado o no se puede leer, la ficha lo dice y no inventa campos.

### P2: Fase 4, consideraciones futuras

- **LinkedIn y web abierta** por búsqueda indexada (grounding).
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
| `oportunidades/{id}` | título, organismo, país, fuentes\[\], url, publicado, cierre, tipo, texto, relevancia, puntaje, resumen, motivo, estado, nota, historial\[\], ficha (fase 3) | Pipeline y editores |
| `config/perfil` | sectores, servicios, antecedentes\[\], países, rango de monto, versión de prompt y modelo | Admin |
| `config/busqueda` | keywords a incluir y excluir, globales y por fuente | Admin |
| `fuentes/{id}` | activa, tipo de acceso, último estado, avisos leídos, último error | Pipeline y admin |
| `corridas/{id}` | inicio, fin, conteos por fuente, errores y tokens del LLM | Pipeline |
| `competidores/{rut}` | nombre, grupo, si es propio | Admin |
| `adjudicaciones/{id}` | rut, organismo, objeto, monto, moneda, monto en pesos, tipo de cambio BCU, fecha, url (fase 2) | Pipeline |
| `usuarios/{uid}` | rol, preferencias de alerta | Admin |
| `auditoria/{id}` | quién cambió qué y cuándo en la configuración | Sistema |

## Costos estimados

**Operar el radar costaría entre US$ 10 y 20 por mes, con un techo razonable de \~US$ 40.** Casi toda la infraestructura entra en las capas gratuitas. El costo real es el LLM, y el prefiltro por keywords lo mantiene bajo. Son precios de lista en USD, consultados en octubre de 2026.

| Componente | Supuesto de uso | Costo mensual (USD) |
| --- | --- | --- |
| Gemini 3.1 Flash-Lite (clasificación) | \~100 avisos/día tras el prefiltro, \~3k tokens de entrada y 300 de salida cada uno. A US$ 0,25 / 1M de entrada y US$ 1,50 / 1M de salida | \~4 (\~18 sin prefiltro) |
| Gemini 3.1 Pro (fichas de TdR, fase 3) | \~20 PDFs/mes de \~80k tokens. A US$ 2 / 1M de entrada y US$ 12 / 1M de salida | \~5 |
| Grounding con Google Search (v2, LinkedIn) | \~600 consultas/mes. Hay 5.000 gratis por mes; después US$ 14 cada 1.000 | 0 |
| Cloud Run Jobs | \~12 collectors × 2 min × 30 días, unos 43k vCPU-s. Gratis hasta 240k vCPU-s por mes | 0 |
| Firestore | Unos miles de documentos y lecturas de un equipo chico, dentro de la cuota gratuita diaria | 0–2 |
| Cloud Scheduler | \~12 jobs (3 gratis, después US$ 0,10 por job). Se puede bajar a 1 con Cloud Workflows | \~1 |
| Cloud Storage, Artifact Registry, Secret Manager, Logging | PDFs de TdR e imágenes de contenedores, pocos GB | \~1–2 |
| Firebase Hosting + Auth | Usuarios internos, tráfico mínimo | 0 |
| Correo (Gmail API) | Digest diario a menos de 20 personas | 0 |
| **Total** |  | **\~10–20 (techo \~40)** |

- **Ojo con 2027:** los modelos Flash (no Flash-Lite) suben de US$ 0,75 a US$ 1,50 por 1M de entrada desde el 1/1/2027. Por eso la clasificación usa Flash-Lite.
- **Para ahorrar:** la clasificación diaria puede ir por *batch*, que cuesta la mitad. Encaja porque no es en tiempo real.
- **Fuera de este cálculo:** un agregador pago, si se contrata, y las horas de desarrollo.
- **Control:** poner una alerta de presupuesto en Cloud Billing en US$ 30/mes.

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
| Propuestas presentadas que salieron del radar | Rezagado | ≥ 4 por trimestre | ≥ 8 | Estado “Nos presentamos” con fuente distinta de manual |
| Adjudicaciones ganadas que salieron del radar | Rezagado | ≥ 1 en 6 meses | ≥ 3 | Estado “Ganada” |
| Llamados relevantes perdidos | Rezagado | 0 por trimestre | 0 | Llamados que el equipo conoció por fuera y que una fuente cubierta ya había publicado |

Las metas son hipótesis iniciales. Conviene ajustarlas con el volumen histórico del radar actual después de la migración.

## Fases y cronograma

La fase 1 tarda unas 5 a 6 semanas y reemplaza al radar actual. Cada fase siguiente arranca solo cuando se cumple el criterio medible de la anterior.

&#91;embedded content: hoja de ruta · 4 fases y 3 criterios de paso\]

No hay fechas límite contractuales. La única dependencia externa es validar el dataset del BID y el formato de exportación del radar actual, dos tareas de la primera semana. Durante las 2 semanas en paralelo, el radar actual sigue activo y se comparan los dos resultados.

## Preguntas abiertas y riesgos

**Preguntas que bloquean la fase 1**

- [ ] ¿Se usa el mismo proyecto GCP y Firebase que el sistema de paneles, o uno nuevo? Recomiendo uno nuevo, para aislar billing y permisos. *(Ingeniería)*
- [ ] ¿El dataset del BID en data.iadb.org trae país, tipo de aviso y fecha de cierre, y se actualiza todos los días? Hay que verificarlo con el CSV real antes de comprometer la fuente. *(Ingeniería)*
- [ ] ¿Quién es dueño del perfil de la firma y carga los antecedentes iniciales? *(Dirección)*
- [ ] ¿Cómo se exporta la data del radar actual (oportunidades, registro, competidores) para migrarla? *(Ingeniería)*

**Preguntas que no bloquean**

- [ ] ¿El digest va a cada usuario o a una lista común (licitaciones@)? *(Comercial)*
- [ ] ¿Los términos de uso de UNGM permiten la lectura automatizada del listado público? (DevelopmentAid ya está respondido: no la permite.) *(Legal)*
- [ ] ¿Qué umbral de monto mínimo justifica mirar un llamado? *(Comercial)*
- [ ] ¿Se guardan las fichas de TdR como antecedente para propuestas futuras? *(Dirección)*

**Riesgos**

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Demasiado ruido y el equipo deja de mirar | Alto | Prefiltro, “baja” oculto por defecto, aprendizaje con descartes y la métrica de precisión desde el día 1 |
| Un scraper se rompe sin que nadie se entere | Medio | Health check por fuente, alerta si una fuente trae 0 avisos 3 días seguidos, y punto rojo en el panel |
| Huecos de cobertura en el BID (lo que solo sale por BEO) | Medio | Carga manual fácil y medir cuántos llamados llegan por fuera para decidir si vale un agregador pago |
| El LLM clasifica mal o inventa datos del TdR | Medio | Salida en JSON validado, citas de página obligatorias y revisión humana antes de postular |
| Suben los precios del LLM | Bajo | Flash-Lite y batch, modelo configurable y alerta de presupuesto en US$ 30/mes |
