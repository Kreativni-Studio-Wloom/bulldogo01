"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupInactiveUsers = exports.paymentReturn = exports.gopayNotification = exports.checkPayment = exports.createPayment = exports.validateICO = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
// Inicializace Firebase Admin
admin.initializeApp();
// CORS middleware
const corsHandler = (0, cors_1.default)({ origin: true });
/**
 * validateICO
 * HTTPS endpoint, který proxy-uje dotaz na ARES a sjednotí odpověď.
 * Volání:
 *  - GET /validateICO?ico=12345678
 *  - POST /validateICO  { ico: "12345678" }
 * Vrací JSON: { ok: boolean, ico?: string, name?: string, seat?: any, reason?: string }
 */
exports.validateICO = functions.region("europe-west1").https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a, _b, _c, _d, _e, _f;
        try {
            let networkError = false;
            const raw = (req.method === "GET"
                ? req.query.ico || req.query.ic || ""
                : ((_a = req.body) === null || _a === void 0 ? void 0 : _a.ico) || ((_b = req.body) === null || _b === void 0 ? void 0 : _b.ic) || "") || "";
            const ico = (raw || "").toString().replace(/\D+/g, "").slice(0, 8);
            if (ico.length !== 8) {
                res.status(200).json({ ok: false, reason: "IČO musí mít 8 číslic." });
                return;
            }
            // Primární REST JSON API
            try {
                const url = `https://ares.gov.cz/ekonomicke-subjekty-v-be/v1/ekonomicke-subjekty/${ico}`;
                const ares = await axios_1.default.get(url, {
                    timeout: 7000,
                    headers: {
                        "Accept": "application/json",
                        // Některá veřejná rozhraní jsou citlivá na User-Agent
                        "User-Agent": "Bulldogo-Functions/1.0 (+https://bulldogo.cz)"
                    }
                });
                const data = ares.data || {};
                const companyName = data.obchodniJmeno ||
                    data.obchodni_jmeno ||
                    data.obchodni_name ||
                    data.obchodniJméno ||
                    null;
                const seat = data.sidlo || data.sídlo || data.seat || null;
                if (companyName || data.ico || data.IC) {
                    res.status(200).json({ ok: true, ico, name: companyName, seat });
                    return;
                }
            }
            catch (err) {
                networkError = true;
                console.warn("ARES JSON call failed:", ((_c = err === null || err === void 0 ? void 0 : err.response) === null || _c === void 0 ? void 0 : _c.status) || (err === null || err === void 0 ? void 0 : err.code) || (err === null || err === void 0 ? void 0 : err.message) || "unknown");
                // pokračuj na XML fallback
            }
            // Fallback na staré XML API (spolehlivé i pro některé OSVČ záznamy)
            try {
                // Primární XML endpoint
                const urlXml1 = `https://wwwinfo.mfcr.cz/cgi-bin/ares/darv_bas.cgi?ico=${ico}`;
                const xmlRes1 = await axios_1.default.get(urlXml1, {
                    timeout: 8000,
                    responseType: "text",
                    headers: {
                        "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
                        "User-Agent": "Bulldogo-Functions/1.0 (+https://bulldogo.cz)"
                    },
                    transformResponse: [(d) => d],
                });
                let xml = xmlRes1.data || "";
                // Pokud by první endpoint nevrátil data, zkus záložní
                if (!xml || typeof xml !== "string" || xml.length < 50) {
                    const urlXml2 = `https://wwwinfo.mfcr.cz/cgi-bin/ares/xar.cgi?ico=${ico}&jazyk=cz&xml=1`;
                    const xmlRes2 = await axios_1.default.get(urlXml2, {
                        timeout: 8000,
                        responseType: "text",
                        headers: {
                            "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
                            "User-Agent": "Bulldogo-Functions/1.0 (+https://bulldogo.cz)"
                        },
                        transformResponse: [(d) => d],
                    });
                    xml = xmlRes2.data || "";
                }
                const icoMatch = xml.match(/<[^>]*ICO[^>]*>\s*([0-9]{8})\s*<\/[^>]*ICO[^>]*>/i);
                let name = null;
                const nameMatchOF = xml.match(/<[^>]*OF[^>]*>\s*([^<]+)\s*<\/[^>]*OF[^>]*>/i);
                const nameMatchObchodniFirma = xml.match(/<Obchodni[_ ]?firma[^>]*>\s*([^<]+)\s*<\/Obchodni[_ ]?firma[^>]*>/i);
                if (nameMatchOF && nameMatchOF[1])
                    name = nameMatchOF[1].trim();
                else if (nameMatchObchodniFirma && nameMatchObchodniFirma[1])
                    name = nameMatchObchodniFirma[1].trim();
                if (icoMatch && icoMatch[1]) {
                    res.status(200).json({ ok: true, ico, name });
                    return;
                }
            }
            catch (err) {
                networkError = true;
                console.warn("ARES XML call failed:", ((_d = err === null || err === void 0 ? void 0 : err.response) === null || _d === void 0 ? void 0 : _d.status) || (err === null || err === void 0 ? void 0 : err.code) || (err === null || err === void 0 ? void 0 : err.message) || "unknown");
                // ignoruj, půjdeme na závěrečnou chybu
            }
            if (networkError) {
                res
                    .status(200)
                    .json({ ok: false, reason: "ARES je dočasně nedostupný. Zkuste to později." });
                return;
            }
            res.status(200).json({ ok: false, reason: "Subjekt s tímto IČO nebyl nalezen." });
        }
        catch (error) {
            const status = (_e = error === null || error === void 0 ? void 0 : error.response) === null || _e === void 0 ? void 0 : _e.status;
            if (status === 404) {
                res.status(200).json({ ok: false, reason: "Subjekt s tímto IČO nebyl nalezen." });
                return;
            }
            console.error("ARES proxy error:", ((_f = error === null || error === void 0 ? void 0 : error.response) === null || _f === void 0 ? void 0 : _f.data) || (error === null || error === void 0 ? void 0 : error.message));
            res
                .status(200)
                .json({ ok: false, reason: "ARES je dočasně nedostupný. Zkuste to později." });
        }
    });
});

/**
 * Scheduled cleanup of inactive accounts.
 * Smaže účty, které se nepřihlásily déle než 6 měsíců,
 * včetně základních dat ve Firestore (profil, inzeráty, recenze, zprávy).
 */
const INACTIVITY_MONTHS = 6;
const MILLIS_IN_DAY = 24 * 60 * 60 * 1000;
async function deleteUserData(uid) {
    const db = admin.firestore();
    functions.logger.info("🧹 Deleting data for inactive user", { uid });
    // Smazat profilový dokument users/{uid}/profile/profile
    try {
        await db.doc(`users/${uid}/profile/profile`).delete({ exists: true });
    }
    catch (err) {
        functions.logger.debug("Profile delete skipped or failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
    // Smazat inzeráty + jejich recenze: users/{uid}/inzeraty/*
    try {
        const adsSnap = await db.collection(`users/${uid}/inzeraty`).get();
        for (const adDoc of adsSnap.docs) {
            try {
                // Smazat reviews subkolekci daného inzerátu (pokud existuje)
                const reviewsSnap = await adDoc.ref.collection("reviews").get();
                if (!reviewsSnap.empty) {
                    const batch = db.batch();
                    reviewsSnap.forEach((r) => batch.delete(r.ref));
                    await batch.commit();
                }
            }
            catch (err) {
                functions.logger.debug("Ad reviews delete skipped or failed", { uid, adId: adDoc.id, error: err === null || err === void 0 ? void 0 : err.message });
            }
            await adDoc.ref.delete();
        }
    }
    catch (err) {
        functions.logger.debug("Ads delete skipped or failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
    // Smazat uživatelské recenze pod users/{uid}/reviews
    try {
        const profileReviewsSnap = await db.collection(`users/${uid}/reviews`).get();
        if (!profileReviewsSnap.empty) {
            const batch = db.batch();
            profileReviewsSnap.forEach((r) => batch.delete(r.ref));
            await batch.commit();
        }
    }
    catch (err) {
        functions.logger.debug("User reviews subcollection delete failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
    // Smazat kořenové recenze, kde je tento uživatel hodnocen
    try {
        const rootReviewsSnap = await db
            .collection("reviews")
            .where("reviewedUserId", "==", uid)
            .get();
        if (!rootReviewsSnap.empty) {
            const batch = db.batch();
            rootReviewsSnap.forEach((r) => batch.delete(r.ref));
            await batch.commit();
        }
    }
    catch (err) {
        functions.logger.debug("Root reviews delete failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
    // Smazat zprávy v kolekci messages, kde userId === uid
    try {
        const messagesSnap = await db
            .collection("messages")
            .where("userId", "==", uid)
            .get();
        if (!messagesSnap.empty) {
            const batch = db.batch();
            messagesSnap.forEach((m) => batch.delete(m.ref));
            await batch.commit();
        }
    }
    catch (err) {
        functions.logger.debug("Messages delete failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
    // Nakonec smazat kořenový dokument users/{uid} (pokud existuje)
    try {
        await db.doc(`users/${uid}`).delete({ exists: true });
    }
    catch (err) {
        functions.logger.debug("Root user doc delete skipped or failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
}
exports.cleanupInactiveUsers = functions
    .region("europe-west1")
    .pubsub.schedule("0 4 * * *") // každý den ve 4 ráno
    .timeZone("Europe/Prague")
    .onRun(async (context) => {
    const auth = admin.auth();
    const cutoff = Date.now() - INACTIVITY_MONTHS * 30 * MILLIS_IN_DAY;
    let nextPageToken = undefined;
    let deletedCount = 0;
    do {
        const page = await auth.listUsers(1000, nextPageToken);
        for (const user of page.users) {
            var _a, _b;
            // Použij poslední přihlášení, fallback na datum vytvoření
            const lastSignIn = user.metadata.lastSignInTime
                ? new Date(user.metadata.lastSignInTime).getTime()
                : 0;
            const created = user.metadata.creationTime
                ? new Date(user.metadata.creationTime).getTime()
                : 0;
            const lastActivity = lastSignIn || created;
            if (!lastActivity)
                continue;
            if (lastActivity < cutoff) {
                functions.logger.info("🧹 Deleting inactive auth user", {
                    uid: user.uid,
                    email: (_a = user.email) !== null && _a !== void 0 ? _a : null,
                    lastSignIn: (_b = user.metadata.lastSignInTime) !== null && _b !== void 0 ? _b : user.metadata.creationTime,
                });
                try {
                    await deleteUserData(user.uid);
                }
                catch (err) {
                    functions.logger.error("Failed to delete Firestore data for inactive user", {
                        uid: user.uid,
                        error: err === null || err === void 0 ? void 0 : err.message,
                    });
                }
                try {
                    await auth.deleteUser(user.uid);
                    deletedCount += 1;
                }
                catch (err) {
                    functions.logger.error("Failed to delete auth user", {
                        uid: user.uid,
                        error: err === null || err === void 0 ? void 0 : err.message,
                    });
                }
            }
        }
        nextPageToken = page.pageToken;
    } while (nextPageToken);
    functions.logger.info("✅ cleanupInactiveUsers finished", {
        deletedCount,
        inactivityMonths: INACTIVITY_MONTHS,
    });
    return null;
});
// GoPay konfigurace z environment variables
const getGoPayConfig = () => {
    const config = functions.config().gopay || {};
    const isTest = process.env.NODE_ENV !== "production" || config.use_test === "true";
    return {
        clientId: isTest ? (config.test_client_id || "") : (config.client_id || ""),
        clientSecret: isTest ? (config.test_client_secret || "") : (config.client_secret || ""),
        apiUrl: isTest ? (config.test_api_url || "https://gw.sandbox.gopay.com/api") : (config.api_url || "https://gate.gopay.cz/api"),
        isTest,
    };
};
// Pomocná funkce pro získání OAuth2 tokenu
async function getGoPayAccessToken(scope = "payment-create") {
    var _a, _b, _c, _d, _e;
    const gopayConfig = getGoPayConfig();
    if (!gopayConfig.clientId || !gopayConfig.clientSecret) {
        throw new Error("GoPay credentials not configured. Please set gopay.client_id and gopay.client_secret");
    }
    try {
        const response = await axios_1.default.post(`${gopayConfig.apiUrl}/oauth2/token`, null, {
            auth: {
                username: gopayConfig.clientId,
                password: gopayConfig.clientSecret,
            },
            params: {
                grant_type: "client_credentials",
                scope: scope,
            },
        });
        return response.data.access_token;
    }
    catch (error) {
        console.error("GoPay OAuth2 error:", ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        throw new Error(`Failed to get GoPay access token: ${((_e = (_d = (_c = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.errors) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message) || error.message}`);
    }
}
/**
 * Vytvoří platbu v GoPay
 *
 * POST /createPayment
 * Body: {
 *   amount: number,
 *   currency: string (default: "CZK"),
 *   orderNumber: string,
 *   orderDescription: string,
 *   userId: string,
 *   planId: string,
 *   planName: string,
 *   items: Array<{name: string, amount: number, count: number}>,
 *   payerEmail?: string,
 *   payerPhone?: string,
 *   payerFirstName?: string,
 *   payerLastName?: string,
 *   returnUrl?: string (default: automaticky)
 * }
 */
exports.createPayment = functions.https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a, _b, _c;
        try {
            // Povolit pouze POST
            if (req.method !== "POST") {
                res.status(405).json({ error: "Method not allowed. Use POST." });
                return;
            }
            const { amount, currency = "CZK", orderNumber, orderDescription, userId, planId, planName, items = [], payerEmail, payerPhone, payerFirstName, payerLastName, returnUrl, } = req.body;
            // Validace povinných polí
            if (!amount || !orderNumber || !orderDescription || !userId || !planId || !planName) {
                res.status(400).json({
                    error: "Missing required fields: amount, orderNumber, orderDescription, userId, planId, planName",
                });
                return;
            }
            // Validace částky
            if (amount <= 0) {
                res.status(400).json({ error: "Amount must be greater than 0" });
                return;
            }
            // Získání přístupového tokenu
            const accessToken = await getGoPayAccessToken("payment-create");
            // Příprava payment data
            const gopayConfig = getGoPayConfig();
            // Vytvoření return_url a notification_url
            const baseUrl = returnUrl || `https://${((_a = functions.config().project) === null || _a === void 0 ? void 0 : _a.region) || "europe-west1"}-${((_b = functions.config().project) === null || _b === void 0 ? void 0 : _b.id) || ""}.cloudfunctions.net`;
            const paymentReturnUrl = returnUrl || `${baseUrl}/paymentReturn`;
            const paymentNotificationUrl = `${baseUrl}/gopayNotification`;
            const paymentData = {
                amount: Math.round(amount * 100),
                currency: currency,
                order_number: orderNumber,
                order_description: orderDescription,
                items: items.length > 0 ? items : [
                    {
                        name: planName,
                        amount: Math.round(amount * 100),
                        count: 1,
                    },
                ],
                payer: {
                    allowed_payment_instruments: ["PAYMENT_CARD", "BANK_ACCOUNT"],
                    default_payment_instrument: "PAYMENT_CARD",
                    contact: Object.assign(Object.assign(Object.assign(Object.assign({}, (payerEmail && { email: payerEmail })), (payerPhone && { phone_number: payerPhone })), (payerFirstName && { first_name: payerFirstName })), (payerLastName && { last_name: payerLastName })),
                },
                target: {
                    type: "ACCOUNT",
                    goid: parseInt(gopayConfig.clientId, 10),
                },
                return_url: paymentReturnUrl,
                notification_url: paymentNotificationUrl,
                lang: "cs",
            };
            // Vytvoření platby v GoPay
            const paymentResponse = await axios_1.default.post(`${gopayConfig.apiUrl}/payments/payment`, paymentData, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            });
            const goPayPayment = paymentResponse.data;
            // Uložení do Firestore pro sledování
            const paymentRecord = {
                gopayId: goPayPayment.id,
                orderNumber: orderNumber,
                userId: userId,
                planId: planId,
                planName: planName,
                amount: amount,
                currency: currency,
                state: goPayPayment.state || "CREATED",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                gopayResponse: goPayPayment,
            };
            await admin.firestore().collection("payments").doc(orderNumber).set(paymentRecord);
            // Vrácení odpovědi s gw_url pro přesměrování
            res.status(200).json({
                success: true,
                paymentId: goPayPayment.id,
                orderNumber: orderNumber,
                gwUrl: goPayPayment.gw_url,
                state: goPayPayment.state,
            });
        }
        catch (error) {
            console.error("Create payment error:", error);
            res.status(500).json({
                error: "Failed to create payment",
                message: error.message,
                details: ((_c = error.response) === null || _c === void 0 ? void 0 : _c.data) || undefined,
            });
        }
    });
});
/**
 * Ověří stav platby v GoPay
 *
 * GET /checkPayment?paymentId=123456&orderNumber=ORDER-123
 */
exports.checkPayment = functions.https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a;
        try {
            const paymentId = req.query.paymentId;
            const orderNumber = req.query.orderNumber;
            if (!paymentId && !orderNumber) {
                res.status(400).json({ error: "Missing paymentId or orderNumber" });
                return;
            }
            // Získání přístupového tokenu
            const accessToken = await getGoPayAccessToken("payment-all");
            const gopayConfig = getGoPayConfig();
            // Získání informací o platbě z GoPay
            const paymentResponse = await axios_1.default.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId || orderNumber}`, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                },
            });
            const goPayPayment = paymentResponse.data;
            // Aktualizace záznamu v Firestore
            if (orderNumber) {
                const paymentRef = admin.firestore().collection("payments").doc(orderNumber);
                await paymentRef.update({
                    state: goPayPayment.state,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastChecked: admin.firestore.FieldValue.serverTimestamp(),
                    gopayResponse: goPayPayment,
                });
                // Pokud je platba zaplacená, aktualizuj uživatelský plán
                if (goPayPayment.state === "PAID") {
                    await activateUserPlan(orderNumber);
                }
            }
            res.status(200).json({
                success: true,
                payment: {
                    id: goPayPayment.id,
                    orderNumber: goPayPayment.order_number,
                    state: goPayPayment.state,
                    amount: goPayPayment.amount ? goPayPayment.amount / 100 : 0,
                    currency: goPayPayment.currency,
                },
            });
        }
        catch (error) {
            console.error("Check payment error:", error);
            res.status(500).json({
                error: "Failed to check payment",
                message: error.message,
                details: ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || undefined,
            });
        }
    });
});
/**
 * Endpoint pro notifikace od GoPay
 *
 * POST /gopayNotification
 * GoPay posílá notifikace automaticky na tento endpoint
 */
exports.gopayNotification = functions.https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        try {
            // GoPay posílá notifikaci jako JSON v body
            const notification = req.body;
            console.log("GoPay notification received:", JSON.stringify(notification, null, 2));
            if (!notification.id) {
                res.status(400).json({ error: "Missing payment id in notification" });
                return;
            }
            const paymentId = notification.id;
            // Ověření stavu platby v GoPay API
            const accessToken = await getGoPayAccessToken("payment-all");
            const gopayConfig = getGoPayConfig();
            const paymentResponse = await axios_1.default.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId}`, {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                },
            });
            const goPayPayment = paymentResponse.data;
            // Nalezení záznamu platby v Firestore podle GoPay ID
            const paymentsSnapshot = await admin.firestore()
                .collection("payments")
                .where("gopayId", "==", paymentId)
                .limit(1)
                .get();
            if (!paymentsSnapshot.empty) {
                const paymentDoc = paymentsSnapshot.docs[0];
                const orderNumber = paymentDoc.id;
                // Aktualizace stavu platby
                await paymentDoc.ref.update({
                    state: goPayPayment.state,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    notificationReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
                    gopayResponse: goPayPayment,
                });
                // Pokud je platba zaplacená, aktivuj uživatelský plán
                if (goPayPayment.state === "PAID") {
                    await activateUserPlan(orderNumber);
                }
            }
            // GoPay očekává odpověď "OK"
            res.status(200).send("OK");
        }
        catch (error) {
            console.error("GoPay notification error:", error);
            // I při chybě vrátíme OK, abychom GoPay nezaměstnávali opakovanými notifikacemi
            res.status(200).send("OK");
        }
    });
});
/**
 * Pomocná funkce pro aktivaci uživatelského plánu po zaplacení
 */
async function activateUserPlan(orderNumber) {
    try {
        const paymentDoc = await admin.firestore().collection("payments").doc(orderNumber).get();
        if (!paymentDoc.exists) {
            console.error(`Payment document ${orderNumber} not found`);
            return;
        }
        const paymentData = paymentDoc.data();
        if (!paymentData) {
            console.error(`Payment data for ${orderNumber} is empty`);
            return;
        }
        const { userId, planId, planName, state } = paymentData;
        // Zkontroluj, že platba je skutečně zaplacená
        if (state !== "PAID") {
            console.log(`Payment ${orderNumber} is not paid yet (state: ${state})`);
            return;
        }
        // Zkontroluj, zda už není plán aktivován (ochrana před duplicitní aktivací)
        if (paymentData.planActivated) {
            console.log(`Plan for payment ${orderNumber} already activated`);
            return;
        }
        if (!userId || !planId) {
            console.error(`Missing userId or planId for payment ${orderNumber}`);
            return;
        }
        // Aktivace plánu v profilu uživatele
        const userProfileRef = admin.firestore()
            .collection("users")
            .doc(userId)
            .collection("profile")
            .doc("profile");
        const now = admin.firestore.Timestamp.now();
        const durationDays = 30; // měsíční předplatné
        const periodEnd = new Date(now.toDate());
        periodEnd.setDate(periodEnd.getDate() + durationDays);
        await userProfileRef.set({
            plan: planId,
            planName: planName,
            planUpdatedAt: now,
            planPeriodStart: now,
            planPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
            planDurationDays: durationDays,
            planCancelAt: null,
        }, { merge: true });
        // Označení, že plán byl aktivován
        await paymentDoc.ref.update({
            planActivated: true,
            planActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Plan ${planId} activated for user ${userId}`);
    }
    catch (error) {
        console.error(`Error activating plan for payment ${orderNumber}:`, error);
        throw error;
    }
}
/**
 * Pomocný endpoint pro payment return (redirect z GoPay)
 *
 * GET /paymentReturn?paymentId=123456&orderNumber=ORDER-123
 *
 * Tento endpoint je volán po návratu uživatele z GoPay platební brány
 * Měl by přesměrovat uživatele na frontend s parametry
 */
exports.paymentReturn = functions.https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a, _b, _c;
        try {
            const paymentId = req.query.idPaymentSession;
            const state = req.query.state;
            // Pokud je paymentId, ověř stav platby
            if (paymentId) {
                const accessToken = await getGoPayAccessToken("payment-all");
                const gopayConfig = getGoPayConfig();
                try {
                    const paymentResponse = await axios_1.default.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId}`, {
                        headers: {
                            "Authorization": `Bearer ${accessToken}`,
                        },
                    });
                    const goPayPayment = paymentResponse.data;
                    // Najdi payment záznam podle GoPay ID
                    const paymentsSnapshot = await admin.firestore()
                        .collection("payments")
                        .where("gopayId", "==", parseInt(paymentId, 10))
                        .limit(1)
                        .get();
                    if (!paymentsSnapshot.empty) {
                        const paymentDoc = paymentsSnapshot.docs[0];
                        const orderNumber = paymentDoc.id;
                        // Aktualizace stavu
                        await paymentDoc.ref.update({
                            state: goPayPayment.state,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            gopayResponse: goPayPayment,
                        });
                        // Pokud je platba zaplacená, aktivuj plán
                        if (goPayPayment.state === "PAID") {
                            await activateUserPlan(orderNumber);
                        }
                        // Přesměrování na frontend s parametry
                        const frontendUrl = ((_a = functions.config().frontend) === null || _a === void 0 ? void 0 : _a.url) || "https://bulldogo.cz";
                        const returnPath = `/packages.html?payment=${goPayPayment.state}&orderNumber=${orderNumber}&paymentId=${paymentId}`;
                        res.redirect(`${frontendUrl}${returnPath}`);
                        return;
                    }
                }
                catch (error) {
                    console.error("Error checking payment status:", error);
                }
            }
            // Fallback přesměrování
            const frontendUrl = ((_b = functions.config().frontend) === null || _b === void 0 ? void 0 : _b.url) || "https://bulldogo.cz";
            res.redirect(`${frontendUrl}/packages.html?payment=${state || "unknown"}`);
        }
        catch (error) {
            console.error("Payment return error:", error);
            const frontendUrl = ((_c = functions.config().frontend) === null || _c === void 0 ? void 0 : _c.url) || "https://bulldogo.cz";
            res.redirect(`${frontendUrl}/packages.html?payment=error`);
        }
    });
});
//# sourceMappingURL=index.js.map