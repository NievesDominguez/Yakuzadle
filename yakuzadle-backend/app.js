const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { compareCharacters } = require("./compare.js");
const { utcDateStr } = require("./services/dailyTarget.js");
const { MAX_ATTEMPTS, earnedHintCharges, emptyState } = require("./services/gameState.js");

// Campos que pueden salir como pista
const HINT_FIELDS = ["games", "affiliation", "nationality", "fighting_style", "height", "date_of_birth"];

const hintValue = (target, field) => (field === "games" ? target.appears_in : target[field]);

// Comprueba si el personaje tiene un valor útil para este campo (no vacío ni unknown)
function hasUsefulValue(target, field) {
    const value = hintValue(target, field);
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0 && !value.every((v) => v === "unknown");
    if (typeof value === "string") return value.trim() !== "" && value.toLowerCase() !== "unknown";
    return true;
}

const difficultyOf = (query) => (query.difficulty === "kiwami" ? "kiwami" : "normal");

function createApp({
    store,
    daily,
    codec,
    imageProxy,
    rateLimits = {},
    trustProxyHops = 1,
    readyWaitMs = 20000, // Cuánto espera una petición a que carguen los personajes antes de dar error 503
    now = () => new Date(),
    log = console,
}) {
    const app = express();

    // Detrás del proxy de Render, req.ip debe ser la IP real del jugador
    // Sin esto todos los jugadores compartirían la IP del balanceador y el rate limit sería global
    app.set("trust proxy", trustProxyHops);

    // Configurar CORS para permitir solo los dominios de la app frontend, y solo métodos GET
    app.use(cors({
        origin: ["https://yamaibot.web.app", "https://yamaibot.firebaseapp.com", "https://laddle.web.app", "https://laddle.firebaseapp.com"],
        methods: ["GET"],
    }));

    // Usar Helmet para configurar cabeceras de seguridad
    app.use(helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" },
        crossOriginEmbedderPolicy: false,
    }));

    app.use(compression());

    // Diagnóstico de proxy: en las 3 primeras peticiones se registra la IP que ve Express
    // Comprueba en los logs de Render que req.ip es la IP pública real y no la de un balanceador
    let proxyLogs = 0;
    app.use((req, res, next) => {
        if (proxyLogs < 3 && req.path !== "/health") {
            proxyLogs += 1;
            log.log(`[proxy-check] req.ip=${req.ip} x-forwarded-for=${req.headers["x-forwarded-for"] || "-"} (trust proxy hops=${trustProxyHops})`);
        }
        next();
    });

    // Rate limit por IP. La API y las imágenes tienen límites separados
    const limiter = (limit, message) =>
        rateLimit({ windowMs: 60 * 1000, limit, message: { error: message }, standardHeaders: true, legacyHeaders: false });
    const apiLimiter = limiter(rateLimits.api ?? 60, "Too many requests, please slow down.");
    const imageLimiter = limiter(rateLimits.images ?? 999, "Too many image requests, please slow down.");

    // Los endpoints del juego esperan a que la caché de personajes esté lista y si tarda demasiado, error 503
    async function requireReady(req, res, next) {
        if (store.isReady() || (await store.whenReady(readyWaitMs))) return next();
        res.set("Retry-After", "5").status(503).json({ error: "starting" });
    }

    // Salud responde siempre, esté o no cargado Firestore
    app.get("/health", (req, res) => {
        res.json({ status: "ok", ready: store.isReady(), characters: store.size() });
    });

    // Lista de personajes
    app.get("/list", apiLimiter, requireReady, (req, res) => res.json(store.list()));

    // Intento de adivinar
    app.get("/guess", apiLimiter, requireReady, async (req, res) => {
        const { name, targetName } = req.query;
        const difficulty = difficultyOf(req.query);
        if (typeof name !== "string" || !name) return res.status(400).json({ error: "Missing name" });

        const userChar = store.get(name);
        if (!userChar) return res.status(404).json({ error: "Character not found" });

        try {
            const character = { ...userChar, games: userChar.appears_in, gender: userChar.gender || "M" };

            // Modo infinito (targetName): el objetivo lo elige el cliente, no hay nada que proteger
            if (typeof targetName === "string" && targetName) {
                const targetChar = store.get(targetName);
                if (!targetChar) return res.status(404).json({ error: "Target character not found" });
                const correct = userChar.name === targetChar.name;
                return res.json({
                    character,
                    result: compareCharacters(userChar, targetChar),
                    correct,
                    target: correct ? { name: targetChar.name, images: targetChar.images || [] } : null,
                });
            }

            // Modo diario: el cliente reenvía el state firmado que devolvió el intento anterior.
            // El objetivo solo se revela al acertar o al agotar los intentos
            const today = utcDateStr(now());
            let state = emptyState(today, difficulty);
            if (req.query.state !== undefined) {
                const decoded = codec.decode(req.query.state);
                if (!decoded || decoded.state.date !== today || decoded.state.difficulty !== difficulty) {
                    return res.status(409).json({ error: "stale_state" }); // Manipulado, de otro día o de otra dificultad
                }
                state = decoded.state;
            }
            if (state.guesses.length >= MAX_ATTEMPTS) return res.status(409).json({ error: "game_over" });
            if (state.guesses.includes(userChar.name)) return res.status(409).json({ error: "already_guessed" });

            const targetChar = await daily.getDailyTarget(difficulty, now());
            const correct = userChar.name === targetChar.name;
            const attempts = state.guesses.length + 1;
            const lost = !correct && attempts >= MAX_ATTEMPTS;
            const finished = correct || lost;

            res.json({
                character,
                result: compareCharacters(userChar, targetChar),
                correct,
                lost,
                attempts,
                target: finished ? { name: targetChar.name, images: targetChar.images || [] } : null,
                state: finished ? null : codec.encode({ ...state, guesses: [...state.guesses, userChar.name] }),
            });
        } catch (error) {
            log.error("Error in /guess:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // Pista
    app.get("/hint", apiLimiter, requireReady, async (req, res) => {
        const difficulty = difficultyOf(req.query);
        const { targetName } = req.query;

        try {
            // Infinito: el cliente elige objetivo y controla las pistas ya usadas
            if (typeof targetName === "string" && targetName) {
                const target = store.get(targetName);
                if (!target) return res.status(404).json({ error: "Target character not found" });
                const used = typeof req.query.usedFields === "string" ? req.query.usedFields.split(",").filter(Boolean) : [];
                const available = HINT_FIELDS.filter((f) => !used.includes(f) && hasUsefulValue(target, f));
                if (available.length === 0) return res.json({ noHints: true });
                const field = available[Math.floor(Math.random() * available.length)];
                return res.json({ field, value: hintValue(target, field) });
            }

            // Diario: exige el state firmado. Las cargas de pista se calculan con los intentos del estado, y el servidor decide qué campo sale
            if (req.query.state === undefined) return res.status(400).json({ error: "missing_state" });
            const decoded = codec.decode(req.query.state);
            const today = utcDateStr(now());
            if (!decoded || decoded.state.date !== today || decoded.state.difficulty !== difficulty) {
                return res.status(409).json({ error: "stale_state" });
            }
            const { state, payload } = decoded;

            if (state.hints.length >= earnedHintCharges(state.guesses.length)) {
                return res.status(403).json({ error: "no_hint_available" });
            }

            const target = await daily.getDailyTarget(difficulty, now());
            // Campos ya acertados (verdes) en algún intento no son pistas
            const solved = HINT_FIELDS.filter((f) =>
                state.guesses.some((g) => {
                    const guessed = store.get(g);
                    return guessed && compareCharacters(guessed, target)[f] === "green";
                })
            );
            const excluded = new Set([...state.hints, ...solved]);
            const available = HINT_FIELDS.filter((f) => !excluded.has(f) && hasUsefulValue(target, f));
            if (available.length === 0) return res.json({ noHints: true, state: req.query.state });

            const field = available[codec.pick(payload, "hint", available.length)];
            res.json({
                field,
                value: hintValue(target, field),
                state: codec.encode({ ...state, hints: [...state.hints, field] }),
            });
        } catch (error) {
            log.error("Error in /hint:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // Imágenes
    app.get("/images/:filename", imageLimiter, imageProxy);

    // Nunca devolver trazas de error al cliente
    app.use((err, req, res, next) => {
        log.error("Unhandled error:", err);
        if (res.headersSent) return;
        res.status(500).json({ error: "Internal server error" });
    });

    return app;
}

module.exports = { createApp };