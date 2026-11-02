# LADdle (Yakuzadle)

Juego diario de adivinanzas estilo Wordle ambientado en la saga *Like a Dragon* (antes *Yakuza*). Cada día hay un personaje misterioso y hay que identificarlo comparando atributos.

**Jugar: https://laddle.web.app/**

## Cómo se juega

1. Escribe el nombre de un personaje y pulsa **Guess**.
2. Cada atributo se colorea: **verde** (correcto), **amarillo** (coincidencia parcial) o **rojo** (incorrecto). En altura y fecha de nacimiento, una flecha indica si el objetivo es mayor o menor.
3. No puedes hacer otro intento hasta que la fila anterior termine de revelarse.
4. Tienes **15 intentos**. Cada 3 intentos (3, 6, 9 y 12) ganas una carga de **pista**, hasta un máximo de 4.

Atributos comparados: género, afiliación, nacionalidad, juegos, grupo sanguíneo, estilo de pelea, altura y fecha de nacimiento.

| Modo | Descripción |
|---|---|
| **Normal** | Personajes principales y secundarios relevantes. Personaje diario. |
| **Kiwami** | Lista completa, incluye NPCs menores y spin-offs. Personaje diario. |
| **Infinite** | Personaje aleatorio elegido en el cliente, sin límite de partidas. No guarda sesión. |

Las estadísticas y la partida en curso se guardan en `localStorage`.

## Estructura

```
yakuzadle/            Frontend (React 19 + Vite)
yakuzadle-backend/    API (Node.js + Express + Firestore)
img_yakuzadle/        Imágenes de personajes (PNG)
scrape_yakuza.py      Script para poblar Firestore con los datos de los personajes
```

El objetivo diario **nunca llega al cliente** hasta que se acierta o se pierde: el backend guarda el personaje en Firestore y devuelve un estado de partida firmado (HMAC con `REVEAL_SECRET`) que el cliente reenvía en cada intento.

## Ejecutar en local

Requisitos: Node.js 20.6+ y un proyecto de Firebase con Firestore (colección `personajes`).

**Backend**

```bash
cd yakuzadle-backend
npm install
node --env-file=.env server.js    # http://localhost:3001
```

**Frontend**

```bash
cd yakuzadle
npm install
npm run dev                       # http://localhost:5173
```

En desarrollo el frontend apunta a `http://localhost:3001` (`yakuzadle/.env.development`).

### Variables de entorno del backend (`yakuzadle-backend/.env`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `FIREBASE_TYPE`, `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_CLIENT_ID`, `FIREBASE_AUTH_URI`, `FIREBASE_TOKEN_URI`, `FIREBASE_AUTH_PROVIDER_X509_CERT_URL`, `FIREBASE_CLIENT_X509_CERT_URL` | Sí | Campos de la service account de Firebase |
| `REVEAL_SECRET` | Sí | Mínimo 16 caracteres (recomendado 32+). Firma el estado de partida y decide el personaje diario. Genera uno con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | No | Por defecto `3001` |
| `LEGACY_FIRST_DAY` | No | Fecha `YYYY-MM-DD` (UTC) |
| `TRUST_PROXY_HOPS` | No | Proxies de confianza. Por defecto `1` |
| `API_RATE_LIMIT_PER_MIN` / `IMAGE_RATE_LIMIT_PER_MIN` | No | Límites por minuto. Por defecto `60` / `600` |

## API

`difficulty` acepta `normal` o `kiwami` (cualquier otro valor se trata como `normal`).

| Ruta | Descripción |
|---|---|
| `GET /list` | Lista de personajes para el autocompletado |
| `GET /guess?name=&difficulty=&state=` | Compara un personaje con el objetivo. Devuelve el resultado y el nuevo `state`. En modo infinito se usa `targetName` en lugar de `state` |
| `GET /hint?difficulty=&state=` | Devuelve un atributo aún no revelado |
| `GET /images/:filename` | Proxy de imágenes de personajes |
| `GET /health` | Estado del servidor |

## Despliegue

- **Frontend:** GitHub Actions (`.github/workflows/deploy.yml`) compila y publica en Firebase Hosting al hacer push a `main`. Requiere el secreto `FIREBASE_TOKEN`.
- **Backend:** Render.com, con las variables de entorno anteriores configuradas en el servicio. Su URL se define en `yakuzadle/.env.production`.

## Créditos

Proyecto fan no oficial, sin relación con Ryu Ga Gotoku Studio ni SEGA. *Like a Dragon / Yakuza* y sus personajes pertenecen a sus respectivos propietarios. Inspirado en [Wordle](https://www.nytimes.com/games/wordle/index.html) y [Loldle](https://loldle.net/).
