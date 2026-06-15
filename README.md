# Yakuzadle  
  
Juego diario de adivinanzas al estilo Wordle ambientado en el universo de la saga *Like a Dragon* (anteriormente *Yakuza*). Cada día aparece un personaje misterioso y el jugador debe identificarlo a través de diversas pistas.
**Pruébalo: https://yamaibot.web.app/**
  
## Cómo se juega  
  
1. Escribe el nombre de un personaje de la saga en el buscador.  
2. El juego compara tus atributos con los del personaje objetivo y muestra feedback con colores:  
   - **Verde**: atributo correcto.
   - **Amarillo**: coincidencia parcial.  
   - **Rojo**: atributo incorrecto.
   - **Flechas** (solo para altura y año de nacimiento): indica si el valor real es mayor o menor.
3. Usa las pistas para afinar tu siguiente intento.
4. Si te quedas atascado, puedes pedir una **pista** o **rendirte** para revelar el personaje.
  
### Atributos comparados  

Género, afiliación, nacionalidad/ascendencia, juegos, grupo sanguíneo, estilo de pelea, altura y fecha de nacimiento.
  
### Modos de dificultad  
  
- **Normal**: lista de personajes principales y secundarios más relevantes.
- **Kiwami**: lista de personajes, incluyendo los principales, algunos NPCs menores y personajes de spin-offs secundarios.
  
## Tecnologías  
  
| Capa | Tecnologías |  
|---|---|  
| Frontend | React 19, Vite, Tailwind CSS, canvas-confetti |  
| Backend | Node.js, Express, Firebase Admin SDK |  
| Base de datos | Google Firestore |  
| Despliegue frontend | Firebase Hosting + GitHub Actions |  
| Despliegue backend | Render.com |  
| Assets | Imágenes alojadas en el propio repositorio (`img_yakuzadle/`) |  
  
## Estructura del repositorio

Yakuzadle/  
├── yakuzadle/              # Aplicación frontend (React + Vite)  
│   ├── src/  
│   │   ├── components/     # Componentes UI (GuessInput, ResultRow, etc.)  
│   │   ├── services/       # Capa de comunicación con la API (api.js)  
│   │   └── App.jsx         # Estado global y lógica de sesión  
│   └── vite.config.js  
├── yakuzadle-backend/      # API REST (Express)  
│   ├── server.js           # Rutas y selección del personaje diario  
│   ├── compare.js          # Motor de comparación de atributos  
│   └── firestore.js        # Acceso a la base de datos  
├── img_yakuzadle/          # Imágenes de personajes en formato WebP (~657 archivos)  
├── firebase.json           # Configuración de Firebase Hosting  
└── .firebaserc             # Proyecto Firebase: yamaibot

## Variables de entorno  
  
### `yakuzadle/.env.development`  
  
```env
VITE_API_BASE_URL=http://localhost:3000  
VITE_IMAGE_BASE_URL=<URL base para las imágenes de personajes>
```

### `yakuzadle-backend/.env`

```env
PORT=3000  
FIREBASE_SERVICE_ACCOUNT=<ruta o JSON de la service account key>
```

> `serviceAccountKey.json` está excluido del control de versiones por seguridad.  
  
## API Endpoints  
  
| Método | Ruta | Descripción |  
|---|---|---|  
| `GET` | `/list` | Lista de personajes para el autocompletado |  
| `GET` | `/guess?name=&difficulty=` | Compara un personaje con el objetivo diario |  
| `GET` | `/daily-target?difficulty=` | Devuelve el personaje objetivo del día |  
| `GET` | `/hint?difficulty=` | Devuelve un atributo no revelado al azar |  
| `GET` | `/health` | Comprobación de estado del servidor |  
  
**Parámetro `difficulty`**: `normal` o `kiwami`.  
  
## Despliegue  
  
El frontend se despliega automáticamente en **Firebase Hosting** mediante GitHub Actions al hacer push a `main`. El backend está alojado en **Render.com** y se conecta a **Google Firestore** para obtener los datos de los personajes.  
  
## Créditos  
  
Proyecto fan no oficial basado en la saga *Like a Dragon / Yakuza* de SEGA / Ryu Ga Gotoku Studio.
Inspirado en [Wordle](https://www.nytimes.com/games/wordle/index.html) y [Loldle](https://loldle.net/).
