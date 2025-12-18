import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import cors from "cors";
import * as nodemailer from "nodemailer";

admin.initializeApp();
const corsHandler = cors({ origin: true });

type AnyObj = Record<string, any>;

function toDateMaybe(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getUidFromProfileDocRef(ref: admin.firestore.DocumentReference): string | null {
  // /users/{uid}/profile/profile
  const userDoc = ref.parent?.parent;
  return userDoc ? userDoc.id : null;
}

function isPlanActive(profile: AnyObj | null | undefined, now: Date): boolean {
  if (!profile) return false;
  const plan = (profile.plan || "").toString();
  if (!plan || plan === "none") return false;
  const end = toDateMaybe(profile.planPeriodEnd);
  const cancelAt = toDateMaybe(profile.planCancelAt);
  if (cancelAt && end && now >= end) return false;
  if (end && now >= end) return false;
  return true;
}

async function deleteAdReviewsAndDoc(adRef: admin.firestore.DocumentReference): Promise<void> {
  const db = admin.firestore();
  try {
    const reviewsSnap = await adRef.collection("reviews").get();
    if (!reviewsSnap.empty) {
      let batch = db.batch();
      let ops = 0;
      for (const r of reviewsSnap.docs) {
        batch.delete(r.ref);
        ops++;
        if (ops >= 450) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
    }
  } catch (e: any) {
    functions.logger.debug("Ad reviews delete skipped or failed", { adId: adRef.id, error: e?.message });
  }
  await adRef.delete();
}

async function clearPlanExpiredMarkersForUser(userId: string): Promise<void> {
  const db = admin.firestore();
  const profileRef = db.collection("users").doc(userId).collection("profile").doc("profile");
  await profileRef.set(
    {
      planExpiredAt: admin.firestore.FieldValue.delete(),
      planExpiredProcessedAt: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  const adsSnap = await db.collection(`users/${userId}/inzeraty`).where("inactiveReason", "==", "plan_expired").get();
  if (adsSnap.empty) return;
  let batch = db.batch();
  let ops = 0;
  for (const adDoc of adsSnap.docs) {
    batch.update(adDoc.ref, {
      inactiveReason: admin.firestore.FieldValue.delete(),
      inactiveAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

/**
 * validateICO
 * HTTPS endpoint, který proxy-uje dotaz na ARES a sjednotí odpověď.
 */
export const validateICO = functions.region("europe-west1").https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      let networkError = false;
      const raw =
        (req.method === "GET"
          ? (req.query.ico as string) || (req.query.ic as string) || ""
          : (req.body?.ico as string) || (req.body?.ic as string) || "") || "";
      const ico = (raw || "").toString().replace(/\D+/g, "").slice(0, 8);
      if (ico.length !== 8) {
        res.status(200).json({ ok: false, reason: "IČO musí mít 8 číslic." });
        return;
      }

      // Primární REST JSON API
      try {
        const url = `https://ares.gov.cz/ekonomicke-subjekty-v-be/v1/ekonomicke-subjekty/${ico}`;
        const ares = await axios.get(url, {
          timeout: 7000,
          headers: {
            Accept: "application/json",
            "User-Agent": "Bulldogo-Functions/1.0 (+https://bulldogo.cz)",
          },
        });
        const data: AnyObj = (ares.data as AnyObj) || {};
        const companyName =
          data.obchodniJmeno || data.obchodni_jmeno || data.obchodni_name || data.obchodniJméno || null;
        const seat = data.sidlo || data.sídlo || data.seat || null;
        if (companyName || data.ico || data.IC) {
          res.status(200).json({ ok: true, ico, name: companyName, seat });
          return;
        }
      } catch (err: any) {
        networkError = true;
        functions.logger.warn("ARES JSON call failed", { status: err?.response?.status, code: err?.code, message: err?.message });
      }

      // Fallback na staré XML API
      try {
        const urlXml1 = `https://wwwinfo.mfcr.cz/cgi-bin/ares/darv_bas.cgi?ico=${ico}`;
        const xmlRes1 = await axios.get<string>(urlXml1, {
          timeout: 8000,
          responseType: "text",
          headers: {
            Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Bulldogo-Functions/1.0 (+https://bulldogo.cz)",
          },
          transformResponse: [(d) => d],
        });
        let xml = xmlRes1.data || "";
        if (!xml || typeof xml !== "string" || xml.length < 50) {
          const urlXml2 = `https://wwwinfo.mfcr.cz/cgi-bin/ares/xar.cgi?ico=${ico}&jazyk=cz&xml=1`;
          const xmlRes2 = await axios.get<string>(urlXml2, {
            timeout: 8000,
            responseType: "text",
            headers: {
              Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
              "User-Agent": "Bulldogo-Functions/1.0 (+https://bulldogo.cz)",
            },
            transformResponse: [(d) => d],
          });
          xml = xmlRes2.data || "";
        }

        const icoMatch = xml.match(/<[^>]*ICO[^>]*>\s*([0-9]{8})\s*<\/[^>]*ICO[^>]*>/i);
        let name: string | null = null;
        const nameMatchOF = xml.match(/<[^>]*OF[^>]*>\s*([^<]+)\s*<\/[^>]*OF[^>]*>/i);
        const nameMatchObchodniFirma = xml.match(/<Obchodni[_ ]?firma[^>]*>\s*([^<]+)\s*<\/Obchodni[_ ]?firma[^>]*>/i);
        if (nameMatchOF && nameMatchOF[1]) name = nameMatchOF[1].trim();
        else if (nameMatchObchodniFirma && nameMatchObchodniFirma[1]) name = nameMatchObchodniFirma[1].trim();

        if (icoMatch && icoMatch[1]) {
          res.status(200).json({ ok: true, ico, name });
          return;
        }
      } catch (err: any) {
        networkError = true;
        functions.logger.warn("ARES XML call failed", { status: err?.response?.status, code: err?.code, message: err?.message });
      }

      if (networkError) {
        res.status(200).json({ ok: false, reason: "ARES je dočasně nedostupný. Zkuste to později." });
        return;
      }
      res.status(200).json({ ok: false, reason: "Subjekt s tímto IČO nebyl nalezen." });
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        res.status(200).json({ ok: false, reason: "Subjekt s tímto IČO nebyl nalezen." });
        return;
      }
      res.status(200).json({ ok: false, reason: "ARES je dočasně nedostupný. Zkuste to později." });
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

async function deleteUserData(uid: string): Promise<void> {
  const db = admin.firestore();
  functions.logger.info("🧹 Deleting data for inactive user", { uid });

  try {
    await db.doc(`users/${uid}/profile/profile`).delete({ exists: true });
  } catch (err: any) {
    functions.logger.debug("Profile delete skipped or failed", { uid, error: err?.message });
  }

  try {
    const adsSnap = await db.collection(`users/${uid}/inzeraty`).get();
    for (const adDoc of adsSnap.docs) {
      try {
        const reviewsSnap = await adDoc.ref.collection("reviews").get();
        if (!reviewsSnap.empty) {
          let batch = db.batch();
          let ops = 0;
          for (const r of reviewsSnap.docs) {
            batch.delete(r.ref);
            ops++;
            if (ops >= 450) {
              await batch.commit();
              batch = db.batch();
              ops = 0;
            }
          }
          if (ops > 0) await batch.commit();
        }
      } catch (err: any) {
        functions.logger.debug("Ad reviews delete skipped or failed", { uid, adId: adDoc.id, error: err?.message });
      }
      await adDoc.ref.delete();
    }
  } catch (err: any) {
    functions.logger.debug("Ads delete skipped or failed", { uid, error: err?.message });
  }

  try {
    const profileReviewsSnap = await db.collection(`users/${uid}/reviews`).get();
    if (!profileReviewsSnap.empty) {
      const batch = db.batch();
      profileReviewsSnap.forEach((r) => batch.delete(r.ref));
      await batch.commit();
    }
  } catch (err: any) {
    functions.logger.debug("User reviews subcollection delete failed", { uid, error: err?.message });
  }

  try {
    const rootReviewsSnap = await db.collection("reviews").where("reviewedUserId", "==", uid).get();
    if (!rootReviewsSnap.empty) {
      const batch = db.batch();
      rootReviewsSnap.forEach((r) => batch.delete(r.ref));
      await batch.commit();
    }
  } catch (err: any) {
    functions.logger.debug("Root reviews delete failed", { uid, error: err?.message });
  }

  try {
    const messagesSnap = await db.collection("messages").where("userId", "==", uid).get();
    if (!messagesSnap.empty) {
      const batch = db.batch();
      messagesSnap.forEach((m) => batch.delete(m.ref));
      await batch.commit();
    }
  } catch (err: any) {
    functions.logger.debug("Messages delete failed", { uid, error: err?.message });
  }

  try {
    await db.doc(`users/${uid}`).delete({ exists: true });
  } catch (err: any) {
    functions.logger.debug("Root user doc delete skipped or failed", { uid, error: err?.message });
  }
}

export const cleanupInactiveUsers = functions
  .region("europe-west1")
  .pubsub.schedule("0 4 * * *")
  .timeZone("Europe/Prague")
  .onRun(async () => {
    const auth = admin.auth();
    const cutoff = Date.now() - INACTIVITY_MONTHS * 30 * MILLIS_IN_DAY;
    let nextPageToken: string | undefined = undefined;
    let deletedCount = 0;
    do {
      const page: admin.auth.ListUsersResult = await auth.listUsers(1000, nextPageToken);
      for (const user of page.users) {
        const lastSignIn = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).getTime() : 0;
        const created = user.metadata.creationTime ? new Date(user.metadata.creationTime).getTime() : 0;
        const lastActivity = lastSignIn || created;
        if (!lastActivity) continue;
        if (lastActivity < cutoff) {
          functions.logger.info("🧹 Deleting inactive auth user", {
            uid: user.uid,
            email: user.email ?? null,
            lastSignIn: user.metadata.lastSignInTime ?? user.metadata.creationTime,
          });
          try {
            await deleteUserData(user.uid);
          } catch (err: any) {
            functions.logger.error("Failed to delete Firestore data for inactive user", { uid: user.uid, error: err?.message });
          }
          try {
            await auth.deleteUser(user.uid);
            deletedCount += 1;
          } catch (err: any) {
            functions.logger.error("Failed to delete auth user", { uid: user.uid, error: err?.message });
          }
        }
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);
    functions.logger.info("✅ cleanupInactiveUsers finished", { deletedCount, inactivityMonths: INACTIVITY_MONTHS });
    return null;
  });

// GoPay konfigurace z environment variables
type GoPayConfig = { clientId: string; clientSecret: string; apiUrl: string; isTest: boolean };
const getGoPayConfig = (): GoPayConfig => {
  const cfg = (functions.config() as any).gopay || {};
  const isTest = process.env.NODE_ENV !== "production" || cfg.use_test === "true";
  return {
    clientId: isTest ? (cfg.test_client_id || "") : (cfg.client_id || ""),
    clientSecret: isTest ? (cfg.test_client_secret || "") : (cfg.client_secret || ""),
    apiUrl: isTest ? (cfg.test_api_url || "https://gw.sandbox.gopay.com/api") : (cfg.api_url || "https://gate.gopay.cz/api"),
    isTest,
  };
};

async function getGoPayAccessToken(scope = "payment-create"): Promise<string> {
  const gopayConfig = getGoPayConfig();
  if (!gopayConfig.clientId || !gopayConfig.clientSecret) {
    throw new Error("GoPay credentials not configured. Please set gopay.client_id and gopay.client_secret");
  }
  try {
    const response = await axios.post(`${gopayConfig.apiUrl}/oauth2/token`, null, {
      auth: {
        username: gopayConfig.clientId,
        password: gopayConfig.clientSecret,
      },
      params: {
        grant_type: "client_credentials",
        scope,
      },
    });
    return (response.data as AnyObj).access_token as string;
  } catch (error: any) {
    functions.logger.error("GoPay OAuth2 error", { details: error?.response?.data || error?.message });
    const msg = error?.response?.data?.errors?.[0]?.message || error?.message || "unknown";
    throw new Error(`Failed to get GoPay access token: ${msg}`);
  }
}

/**
 * Pomocná funkce pro aktivaci uživatelského plánu po zaplacení
 */
async function activateUserPlan(orderNumber: string): Promise<void> {
  const db = admin.firestore();
  const paymentDoc = await db.collection("payments").doc(orderNumber).get();
  if (!paymentDoc.exists) {
    functions.logger.error("Payment document not found", { orderNumber });
    return;
  }
  const paymentData = paymentDoc.data() as AnyObj | undefined;
  if (!paymentData) {
    functions.logger.error("Payment data is empty", { orderNumber });
    return;
  }
  const { userId, planId, planName, state } = paymentData;
  if (state !== "PAID") {
    functions.logger.info("Payment not paid yet", { orderNumber, state });
    return;
  }
  if (paymentData.planActivated) {
    functions.logger.info("Plan already activated", { orderNumber });
    return;
  }
  if (!userId || !planId) {
    functions.logger.error("Missing userId or planId", { orderNumber });
    return;
  }

  const userProfileRef = db.collection("users").doc(userId).collection("profile").doc("profile");
  const now = admin.firestore.Timestamp.now();
  const durationDays = 30;
  const periodEnd = new Date(now.toDate());
  periodEnd.setDate(periodEnd.getDate() + durationDays);

  await userProfileRef.set(
    {
      plan: planId,
      planName,
      planUpdatedAt: now,
      planPeriodStart: now,
      planPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
      planDurationDays: durationDays,
      planCancelAt: null,
    },
    { merge: true }
  );

  // Odstranit expirační značky (pokud uživatel obnovil balíček)
  try {
    await clearPlanExpiredMarkersForUser(String(userId));
  } catch (e: any) {
    functions.logger.warn("Failed clearing plan expired markers", { userId, error: e?.message });
  }

  await paymentDoc.ref.update({
    planActivated: true,
    planActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  functions.logger.info("Plan activated for user", { userId, planId });
}

/**
 * Vytvoří platbu v GoPay
 */
export const createPayment = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed. Use POST." });
        return;
      }
      const body = (req.body || {}) as AnyObj;
      const {
        amount,
        currency = "CZK",
        orderNumber,
        orderDescription,
        userId,
        planId,
        planName,
        items = [],
        payerEmail,
        payerPhone,
        payerFirstName,
        payerLastName,
        returnUrl,
      } = body;

      if (!amount || !orderNumber || !orderDescription || !userId || !planId || !planName) {
        res.status(400).json({
          error: "Missing required fields: amount, orderNumber, orderDescription, userId, planId, planName",
        });
        return;
      }
      if (amount <= 0) {
        res.status(400).json({ error: "Amount must be greater than 0" });
        return;
      }

      const accessToken = await getGoPayAccessToken("payment-create");
      const gopayConfig = getGoPayConfig();
      const projCfg = (functions.config() as any).project || {};
      const baseUrl =
        returnUrl || `https://${projCfg.region || "europe-west1"}-${projCfg.id || ""}.cloudfunctions.net`;
      const paymentReturnUrl = returnUrl || `${baseUrl}/paymentReturn`;
      const paymentNotificationUrl = `${baseUrl}/gopayNotification`;

      const paymentData: AnyObj = {
        amount: Math.round(Number(amount) * 100),
        currency,
        order_number: orderNumber,
        order_description: orderDescription,
        items:
          Array.isArray(items) && items.length > 0
            ? items
            : [
                {
                  name: planName,
                  amount: Math.round(Number(amount) * 100),
                  count: 1,
                },
              ],
        payer: {
          allowed_payment_instruments: ["PAYMENT_CARD", "BANK_ACCOUNT"],
          default_payment_instrument: "PAYMENT_CARD",
          contact: {
            ...(payerEmail ? { email: payerEmail } : {}),
            ...(payerPhone ? { phone_number: payerPhone } : {}),
            ...(payerFirstName ? { first_name: payerFirstName } : {}),
            ...(payerLastName ? { last_name: payerLastName } : {}),
          },
        },
        target: { type: "ACCOUNT", goid: parseInt(gopayConfig.clientId, 10) },
        return_url: paymentReturnUrl,
        notification_url: paymentNotificationUrl,
        lang: "cs",
      };

      const paymentResponse = await axios.post(`${gopayConfig.apiUrl}/payments/payment`, paymentData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      const goPayPayment = paymentResponse.data as AnyObj;

      const paymentRecord: AnyObj = {
        gopayId: goPayPayment.id,
        orderNumber,
        userId,
        planId,
        planName,
        amount,
        currency,
        state: goPayPayment.state || "CREATED",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        gopayResponse: goPayPayment,
      };
      await admin.firestore().collection("payments").doc(orderNumber).set(paymentRecord);

      res.status(200).json({
        success: true,
        paymentId: goPayPayment.id,
        orderNumber,
        gwUrl: goPayPayment.gw_url,
        state: goPayPayment.state,
      });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to create payment",
        message: error?.message,
        details: error?.response?.data || undefined,
      });
    }
  });
});

/**
 * Ověří stav platby v GoPay
 */
export const checkPayment = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      const paymentId = (req.query.paymentId as string) || "";
      const orderNumber = (req.query.orderNumber as string) || "";
      if (!paymentId && !orderNumber) {
        res.status(400).json({ error: "Missing paymentId or orderNumber" });
        return;
      }

      const accessToken = await getGoPayAccessToken("payment-all");
      const gopayConfig = getGoPayConfig();
      const paymentResponse = await axios.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId || orderNumber}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const goPayPayment = paymentResponse.data as AnyObj;

      if (orderNumber) {
        const paymentRef = admin.firestore().collection("payments").doc(orderNumber);
        await paymentRef.update({
          state: goPayPayment.state,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastChecked: admin.firestore.FieldValue.serverTimestamp(),
          gopayResponse: goPayPayment,
        });
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
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to check payment",
        message: error?.message,
        details: error?.response?.data || undefined,
      });
    }
  });
});

/**
 * Endpoint pro notifikace od GoPay
 */
export const gopayNotification = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      const notification = req.body as AnyObj;
      functions.logger.info("GoPay notification received", { notification });
      if (!notification?.id) {
        res.status(400).json({ error: "Missing payment id in notification" });
        return;
      }
      const paymentId = notification.id;

      const accessToken = await getGoPayAccessToken("payment-all");
      const gopayConfig = getGoPayConfig();
      const paymentResponse = await axios.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const goPayPayment = paymentResponse.data as AnyObj;

      const paymentsSnapshot = await admin
        .firestore()
        .collection("payments")
        .where("gopayId", "==", paymentId)
        .limit(1)
        .get();
      if (!paymentsSnapshot.empty) {
        const paymentDoc = paymentsSnapshot.docs[0];
        const orderNumber = paymentDoc.id;
        await paymentDoc.ref.update({
          state: goPayPayment.state,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          notificationReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
          gopayResponse: goPayPayment,
        });
        if (goPayPayment.state === "PAID") {
          await activateUserPlan(orderNumber);
        }
      }
      res.status(200).send("OK");
    } catch (error: any) {
      functions.logger.error("GoPay notification error", { error: error?.message });
      res.status(200).send("OK");
    }
  });
});

/**
 * Pomocný endpoint pro payment return (redirect z GoPay)
 */
export const paymentReturn = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      const paymentId = (req.query.idPaymentSession as string) || "";
      const state = (req.query.state as string) || "";
      if (paymentId) {
        const accessToken = await getGoPayAccessToken("payment-all");
        const gopayConfig = getGoPayConfig();
        try {
          const paymentResponse = await axios.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const goPayPayment = paymentResponse.data as AnyObj;
          const paymentsSnapshot = await admin
            .firestore()
            .collection("payments")
            .where("gopayId", "==", parseInt(paymentId, 10))
            .limit(1)
            .get();
          if (!paymentsSnapshot.empty) {
            const paymentDoc = paymentsSnapshot.docs[0];
            const orderNumber = paymentDoc.id;
            await paymentDoc.ref.update({
              state: goPayPayment.state,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              gopayResponse: goPayPayment,
            });
            if (goPayPayment.state === "PAID") {
              await activateUserPlan(orderNumber);
            }
            const frontendUrl = (functions.config() as any).frontend?.url || "https://bulldogo.cz";
            const returnPath = `/packages.html?payment=${goPayPayment.state}&orderNumber=${orderNumber}&paymentId=${paymentId}`;
            res.redirect(`${frontendUrl}${returnPath}`);
            return;
          }
        } catch (e) {
          // ignore – fallback redirect below
        }
      }
      const frontendUrl = (functions.config() as any).frontend?.url || "https://bulldogo.cz";
      res.redirect(`${frontendUrl}/packages.html?payment=${state || "unknown"}`);
    } catch (error: any) {
      const frontendUrl = (functions.config() as any).frontend?.url || "https://bulldogo.cz";
      res.redirect(`${frontendUrl}/packages.html?payment=error`);
    }
  });
});

/**
 * Balíček expiroval => inzeráty se přesunou na 1 měsíc do "Moje inzeráty" (status=inactive, reason=plan_expired),
 * poté se trvale smažou (včetně reviews). Pro ostatní uživatele nejsou viditelné.
 */
const PLAN_EXPIRED_DELETE_DAYS = 30;

export const enforceExpiredPlanAds = functions
  .region("europe-west1")
  .pubsub.schedule("*/5 * * * *") // každých 5 minut – minimalizuje okno viditelnosti
  .timeZone("Europe/Prague")
  .onRun(async () => {
    const db = admin.firestore();
    const nowDate = new Date();
    const nowTs = admin.firestore.Timestamp.fromDate(nowDate);
    const deleteCutoff = admin.firestore.Timestamp.fromMillis(Date.now() - PLAN_EXPIRED_DELETE_DAYS * 24 * MILLIS_IN_DAY);

    // 1) Najdi profily s expirovaným období (planPeriodEnd < now)
    const expiredProfilesSnap = await db.collectionGroup("profile").where("planPeriodEnd", "<", nowTs).get();
    let processed = 0;
    let inactivated = 0;
    let deleted = 0;

    for (const profDoc of expiredProfilesSnap.docs) {
      const uid = getUidFromProfileDocRef(profDoc.ref);
      if (!uid) continue;
      const profile = profDoc.data() as AnyObj;
      if (isPlanActive(profile, nowDate)) continue;

      // nastav planExpiredAt jen jednou (start měsíční lhůty)
      const existingExpiredAt = profile.planExpiredAt;
      const planEnd = toDateMaybe(profile.planPeriodEnd);
      const expiredAt = existingExpiredAt ? existingExpiredAt : (planEnd ? admin.firestore.Timestamp.fromDate(planEnd) : nowTs);

      await profDoc.ref.set(
        {
          plan: null,
          planCancelAt: null,
          planExpiredAt: expiredAt,
          planExpiredProcessedAt: nowTs,
        },
        { merge: true }
      );

      // 2) Projdi inzeráty uživatele: inaktivuj a smaž ty po 30 dnech
      const adsSnap = await db.collection(`users/${uid}/inzeraty`).get();
      if (adsSnap.empty) {
        processed++;
        continue;
      }

      // batch updates for inactivation
      let batch = db.batch();
      let ops = 0;
      const toDelete: admin.firestore.DocumentReference[] = [];

      for (const adDoc of adsSnap.docs) {
        const ad = adDoc.data() as AnyObj;
        const status = (ad.status || "active").toString();
        if (status === "deleted" || status === "archived") continue;

        const reason = (ad.inactiveReason || "").toString();
        const inactiveAtTs = ad.inactiveAt;
        const inactiveAtDate = toDateMaybe(inactiveAtTs);
        const inactiveAt = inactiveAtDate ? admin.firestore.Timestamp.fromDate(inactiveAtDate) : null;

        // mazat jen ty, co jsme označili jako plan_expired a jsou starší než cutoff
        if (status === "inactive" && reason === "plan_expired" && inactiveAt && inactiveAt.toMillis() <= deleteCutoff.toMillis()) {
          toDelete.push(adDoc.ref);
          continue;
        }

        // inaktivovat (jen když ještě není plan_expired) – inactiveAt neresetovat
        if (!(status === "inactive" && reason === "plan_expired")) {
          const upd: AnyObj = {
            status: "inactive",
            inactiveReason: "plan_expired",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (!ad.inactiveAt) upd.inactiveAt = nowTs;
          batch.update(adDoc.ref, upd);
          ops++;
          inactivated++;
          if (ops >= 450) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
          }
        }
      }

      if (ops > 0) await batch.commit();

      // delete (with reviews) after updates
      for (const ref of toDelete) {
        await deleteAdReviewsAndDoc(ref);
        deleted++;
      }

      processed++;
    }

    // 3) Pokud uživatel obnovil balíček mimo GoPay flow (např. Stripe extension),
    // vyčisti profily, které mají planExpiredAt, ale plán už je zase aktivní.
    try {
      const markedSnap = await db.collectionGroup("profile").where("planExpiredAt", "!=", null).get();
      for (const profDoc of markedSnap.docs) {
        const uid = getUidFromProfileDocRef(profDoc.ref);
        if (!uid) continue;
        const profile = profDoc.data() as AnyObj;
        if (isPlanActive(profile, nowDate)) {
          await clearPlanExpiredMarkersForUser(uid);
        }
      }
    } catch (e: any) {
      functions.logger.debug("Skipped renewal markers cleanup", { error: e?.message });
    }

    functions.logger.info("✅ enforceExpiredPlanAds finished", { processed, inactivated, deleted });
    return null;
  });

// ===============================================
// SMTP Email konfigurace pro Hostinger
// ===============================================
const smtpTransporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true, // SSL
  auth: {
    user: "info@bulldogo.cz",
    pass: "Fotbal1997.",
  },
});

/**
 * Načte jméno uživatele z Firestore profilu
 */
async function getUserNameFromProfile(uid: string): Promise<string> {
  try {
    const db = admin.firestore();
    const profileDoc = await db.doc(`users/${uid}/profile/profile`).get();
    
    if (profileDoc.exists) {
      const data = profileDoc.data() as AnyObj;
      
      // Priorita: firstName, pak name, pak companyName
      if (data.firstName) {
        return data.firstName;
      }
      if (data.name && data.name !== "Uživatel" && data.name !== "Firma") {
        // Vezmi jen první jméno pokud je celé jméno
        const firstName = data.name.split(" ")[0];
        return firstName;
      }
      if (data.companyName) {
        return data.companyName;
      }
    }
    
    return "uživateli";
  } catch (error) {
    return "uživateli";
  }
}

/**
 * Generuje HTML šablonu uvítacího emailu
 */
function generateWelcomeEmailHTML(userName: string): string {
  return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vítejte na Bulldogo.cz</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%); min-height: 100vh;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Hlavní kontejner -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          
          <!-- Logo sekce -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background: linear-gradient(135deg, #ff6a00 0%, #ee0979 100%); border-radius: 20px; padding: 15px 25px; box-shadow: 0 10px 40px rgba(255, 106, 0, 0.3);">
                    <span style="font-size: 32px; font-weight: 900; color: #ffffff; letter-spacing: 2px;">
                      B<span style="background: linear-gradient(90deg, #ffffff 0%, #ffd700 100%); -webkit-background-clip: text; background-clip: text;">ULLDOGO</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Hlavní karta -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%); border-radius: 24px; box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1); overflow: hidden;">
                
                <!-- Oranžový header pruh -->
                <tr>
                  <td style="background: linear-gradient(90deg, #ff6a00 0%, #ffa62b 50%, #fcd34d 100%); height: 8px;"></td>
                </tr>
                
                <!-- Ikona obálky -->
                <tr>
                  <td align="center" style="padding: 40px 0 20px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 50%; width: 100px; height: 100px; text-align: center; line-height: 100px; box-shadow: 0 10px 30px rgba(255, 166, 43, 0.3);">
                          <span style="font-size: 50px;">🎉</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Pozdrav -->
                <tr>
                  <td align="center" style="padding: 0 40px 20px 40px;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #1a1a2e; line-height: 1.3;">
                      Ahoj, ${userName}! 👋
                    </h1>
                  </td>
                </tr>
                
                <!-- Hlavní text -->
                <tr>
                  <td align="center" style="padding: 0 40px 30px 40px;">
                    <p style="margin: 0 0 20px 0; font-size: 18px; line-height: 1.7; color: #4a5568;">
                      <strong style="color: #ff6a00;">Děkujeme za registraci</strong> na portálu <strong>Bulldogo.cz</strong>!
                    </p>
                    <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #718096;">
                      Jsme rádi, že jste se stali součástí naší komunity. Nyní můžete využívat všechny výhody našeho portálu – <strong>vytvářet inzeráty</strong>, <strong>hledat služby</strong> a <strong>spojovat se s profesionály</strong> po celé České republice.
                    </p>
                  </td>
                </tr>
                
                <!-- Výhody sekce -->
                <tr>
                  <td style="padding: 0 40px 30px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #fff8eb 0%, #fff3e0 100%); border-radius: 16px; border: 1px solid #ffe0b2;">
                      <tr>
                        <td style="padding: 25px;">
                          <p style="margin: 0 0 15px 0; font-size: 14px; font-weight: 700; color: #ff6a00; text-transform: uppercase; letter-spacing: 1px;">
                            Co vás čeká?
                          </p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="color: #22c55e; font-size: 18px;">✓</span>
                                <span style="margin-left: 10px; color: #4a5568; font-size: 15px;">Snadné vytváření inzerátů</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="color: #22c55e; font-size: 18px;">✓</span>
                                <span style="margin-left: 10px; color: #4a5568; font-size: 15px;">Ověření firemních profilu</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="color: #22c55e; font-size: 18px;">✓</span>
                                <span style="margin-left: 10px; color: #4a5568; font-size: 15px;">Integrovaný chat se zákazníky</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="color: #22c55e; font-size: 18px;">✓</span>
                                <span style="margin-left: 10px; color: #4a5568; font-size: 15px;">Systém hodnocení a recenzí</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- CTA tlačítko -->
                <tr>
                  <td align="center" style="padding: 0 40px 40px 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #ff6a00 0%, #ffa62b 100%); border-radius: 12px; box-shadow: 0 8px 25px rgba(255, 106, 0, 0.35);">
                          <a href="https://bulldogo.cz/services.html" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">
                            PROHLÉDNOUT SLUŽBY →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 40px 20px 20px 20px;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #a0aec0;">
                „Služby jednoduše. Pro každého."
              </p>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #718096;">
                <a href="https://bulldogo.cz" style="color: #ffa62b; text-decoration: none;">bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="mailto:support@bulldogo.cz" style="color: #ffa62b; text-decoration: none;">support@bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="tel:+420605121023" style="color: #ffa62b; text-decoration: none;">+420 605 121 023</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #4a5568;">
                © 2025 BULLDOGO. Všechna práva vyhrazena.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Firebase Auth Trigger - Odešle uvítací email při vytvoření nového uživatele
 */
export const sendWelcomeEmail = functions
  .region("europe-west1")
  .auth.user()
  .onCreate(async (user) => {
    const email = user.email;
    
    if (!email) {
      functions.logger.warn("Nový uživatel nemá email, přeskakuji odeslání uvítacího emailu", { uid: user.uid });
      return null;
    }
    
    // Počkáme chvíli, aby se profil stihl vytvořit v databázi
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const userName = await getUserNameFromProfile(user.uid);
    
    const mailOptions = {
      from: {
        name: "BULLDOGO",
        address: "info@bulldogo.cz",
      },
      to: email,
      subject: "🎉 Vítejte na Bulldogo.cz!",
      html: generateWelcomeEmailHTML(userName),
      text: `Ahoj ${userName}!\n\nDěkujeme za registraci na portálu Bulldogo.cz!\n\nJsme rádi, že jste se stali součástí naší komunity. Nyní můžete využívat všechny výhody našeho portálu – vytvářet inzeráty, hledat služby a spojovat se s profesionály po celé České republice.\n\nNavštivte nás: https://bulldogo.cz\n\n„Služby jednoduše. Pro každého."\n\n© 2025 BULLDOGO`,
    };
    
    try {
      await smtpTransporter.sendMail(mailOptions);
      functions.logger.info("✅ Uvítací email úspěšně odeslán", { 
        uid: user.uid, 
        email: email,
        userName: userName 
      });
      return null;
    } catch (error: any) {
      functions.logger.error("❌ Chyba při odesílání uvítacího emailu", { 
        uid: user.uid, 
        email: email,
        error: error?.message,
        code: error?.code 
      });
      // Neházíme chybu, aby se registrace nedostala do chybového stavu
      return null;
    }
  });

