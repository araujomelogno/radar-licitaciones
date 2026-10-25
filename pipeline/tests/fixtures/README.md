# Fixtures de collectors

Cada carpeta tiene el crudo de una fuente con la forma que devuelve `fetch` (HTML, XML o JSON).

**Importante:** estos fixtures son **sintéticos**. Reproducen la estructura documentada de cada fuente
(OCDS para ARCE y DNCP, `procnotices` para el Banco Mundial, CKAN para el BID, RSS para Ceibal) y una
estructura plausible para los listados HTML (IM, UNGM, CND, AUCI, FIAP). Se escribieron sin acceso a los
sitios, porque el entorno de desarrollo no llegaba a ellos.

En la semana 1, junto con la prueba de acceso desde la nube (RF-13), hay que reemplazarlos por respuestas
reales guardadas desde Cloud Run (`raw/{fuente}/{fecha}.json` en el bucket) y ajustar los selectores de
cada collector hasta que los tests pasen con esos datos reales.
