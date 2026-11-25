# Gesys Consultor

Tablero para guardar las credenciales de Odoo de cada cliente —pruebas y producción— y consultarlas con Gemini 4 Hydrogen. El asistente solo lee. En producción, cada envío pide confirmación. Puede recorrer la base para señalar problemas, siempre citando el modelo, el criterio y el conteo.

## Modelo

La app llama a la API de Gemini con `gemini-4-hydrogen` y `thinkingLevel: high`. Hydrogen también admite `xhigh` si hace falta más profundidad.

La clave se crea en [Google AI Studio](https://aistudio.google.com/apikey) y va en `GEMINI_API_KEY`. Una clave de Cursor, aunque empiece por `grok_`, no llama a este modelo.

## Arranque local

```bash
npm install
npm run dev
```

Sin `DATABASE_URL`, los clientes se guardan cifrados en `.data/store.json`.

## Variables

| Variable | Uso |
| --- | --- |
| `APP_PASSWORD` | Contraseña de entrada. Mínimo 8 caracteres. |
| `SESSION_SECRET` | Firma de la cookie. Si falta, se usa `APP_PASSWORD`. |
| `CREDENTIALS_SECRET` | Cifra las claves de Odoo. Mínimo 16 caracteres. |
| `GEMINI_API_KEY` | Clave de Google AI Studio. |
| `GEMINI_MODEL` | Por defecto `gemini-4-hydrogen`. |
| `GEMINI_THINKING_LEVEL` | `low`, `medium`, `high` o `xhigh`. Por defecto `high`. |
| `DATABASE_URL` | Postgres. Obligatoria en Vercel. |
| `ODOO_ALLOW_PRIVATE_URLS` | `true` solo si una base vive en una IP privada tuya. |

## Vercel

1. Crea una base Postgres (Neon, desde el marketplace de Vercel, vale).
2. En el proyecto, define las variables de arriba. En `DATABASE_URL` usa la cadena con pooler.
3. `npx vercel` o conecta el repositorio. El framework es Next.js.

En el plan Hobby las funciones pueden cortarse a los 60 segundos. Con razonamiento alto y varias lecturas de Odoo, una consulta larga puede necesitar el límite de 120 segundos de un plan superior. Está declarado en `src/app/api/chat/route.ts`.

## Límites a propósito

- Las herramientas son `search_read`, `search_count`, `read`, `fields_get` y el listado de modelos. No hay create, write ni unlink.
- Un dominio vacío se corta a 10 filas.
- Cada consulta puede encadenar hasta 12 lecturas.
- Las URLs de Odoo tienen que ser públicas, salvo que actives `ODOO_ALLOW_PRIVATE_URLS`.
- Se pueden adjuntar hasta 4 imágenes, de 1,2 MB cada una. Tras recargar, el historial guarda el texto y una nota de que hubo imagen, no el archivo.
