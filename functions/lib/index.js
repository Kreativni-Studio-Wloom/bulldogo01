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
exports.setAdminStatus = exports.sendWelcomeEmail = exports.sendNewMessageEmail = exports.sendProfileChangeEmail = exports.onPlanCancelled = exports.forceCheckExpiredPlans = exports.enforceExpiredPlanAds = exports.paymentReturn = exports.gopayNotification = exports.checkPayment = exports.createPayment = exports.cleanupInactiveUsers = exports.reportAd = exports.sendInactivityWarningEmails = exports.validateICO = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const cors_1 = __importDefault(require("cors"));
const nodemailer = __importStar(require("nodemailer"));
admin.initializeApp();
const corsHandler = (0, cors_1.default)({ origin: true });
function toDateMaybe(v) {
    if (!v)
        return null;
    if (v instanceof Date)
        return v;
    if (typeof (v === null || v === void 0 ? void 0 : v.toDate) === "function")
        return v.toDate();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}
function getUidFromProfileDocRef(ref) {
    var _a;
    // /users/{uid}/profile/profile
    const userDoc = (_a = ref.parent) === null || _a === void 0 ? void 0 : _a.parent;
    return userDoc ? userDoc.id : null;
}
function isPlanActive(profile, now) {
    if (!profile)
        return false;
    const plan = (profile.plan || "").toString();
    // Pokud plan není hobby nebo business, není aktivní
    if (!plan || plan === "none" || (plan !== "hobby" && plan !== "business"))
        return false;
    const end = toDateMaybe(profile.planPeriodEnd);
    const cancelAt = toDateMaybe(profile.planCancelAt);
    // Pokud planPeriodEnd neexistuje, považujeme plán za neaktivní (musí mít datum konce)
    if (!end)
        return false;
    // Pokud je konec v minulosti, plán vypršel
    if (now >= end)
        return false;
    // Pokud je nastavené zrušení a konec období, plán vypršel
    if (cancelAt && now >= end)
        return false;
    return true;
}
async function deleteAdReviewsAndDoc(adRef) {
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
            if (ops > 0)
                await batch.commit();
        }
    }
    catch (e) {
        functions.logger.debug("Ad reviews delete skipped or failed", { adId: adRef.id, error: e === null || e === void 0 ? void 0 : e.message });
    }
    await adRef.delete();
}
async function clearPlanExpiredMarkersForUser(userId) {
    const db = admin.firestore();
    const profileRef = db.collection("users").doc(userId).collection("profile").doc("profile");
    await profileRef.set({
        planExpiredAt: admin.firestore.FieldValue.delete(),
        planExpiredProcessedAt: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    const adsSnap = await db.collection(`users/${userId}/inzeraty`).where("inactiveReason", "==", "plan_expired").get();
    if (adsSnap.empty)
        return;
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
    if (ops > 0)
        await batch.commit();
}
/**
 * validateICO
 * HTTPS endpoint, který proxy-uje dotaz na HlídačStátu a sjednotí odpověď.
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
            // HlídačStátu API - endpoint pro firmy podle IČO
            const hlidacToken = ((_c = functions.config().hlidacstatu) === null || _c === void 0 ? void 0 : _c.api_token) || "36a6940d34774a5c90270f60ea73130b";
            try {
                const url = `https://api.hlidacstatu.cz/api/v2/firmy/ico/${ico}`;
                const hlidac = await axios_1.default.get(url, {
                    timeout: 7000,
                    headers: {
                        Accept: "application/json",
                        Authorization: `Token ${hlidacToken}`,
                        "User-Agent": "Bulldogo-Functions/1.0 (+https://bulldogo.cz)",
                    },
                });
                const data = hlidac.data || {};
                // HlídačStátu API vrací FirmaDTO: { ico, jmeno, datoveSchranky, zalozena }
                const companyName = data.jmeno || data.nazev || null;
                // Pokud API vrátilo data s IČO a jménem, firma existuje
                if (data.ico && companyName) {
                    res.status(200).json({ ok: true, ico, name: companyName, seat: null });
                    return;
                }
            }
            catch (err) {
                networkError = true;
                functions.logger.warn("HlídačStátu API call failed", { status: (_d = err === null || err === void 0 ? void 0 : err.response) === null || _d === void 0 ? void 0 : _d.status, code: err === null || err === void 0 ? void 0 : err.code, message: err === null || err === void 0 ? void 0 : err.message });
                // Pokud je 404, firma neexistuje
                if (((_e = err === null || err === void 0 ? void 0 : err.response) === null || _e === void 0 ? void 0 : _e.status) === 404) {
                    res.status(200).json({ ok: false, reason: "Subjekt s tímto IČO nebyl nalezen." });
                    return;
                }
            }
            if (networkError) {
                res.status(200).json({ ok: false, reason: "HlídačStátu je dočasně nedostupný. Zkuste to později." });
                return;
            }
            res.status(200).json({ ok: false, reason: "Subjekt s tímto IČO nebyl nalezen." });
        }
        catch (error) {
            const status = (_f = error === null || error === void 0 ? void 0 : error.response) === null || _f === void 0 ? void 0 : _f.status;
            if (status === 404) {
                res.status(200).json({ ok: false, reason: "Subjekt s tímto IČO nebyl nalezen." });
                return;
            }
            res.status(200).json({ ok: false, reason: "HlídačStátu je dočasně nedostupný. Zkuste to později." });
        }
    });
});
/**
 * Konfigurace pro mazání neaktivních účtů
 */
const INACTIVITY_WARNING_MONTHS = 5; // Po 5 měsících odeslat varování
const INACTIVITY_DELETE_MONTHS = 6; // Po 6 měsících smazat účet
const MILLIS_IN_DAY = 24 * 60 * 60 * 1000;
/**
 * Formátuje datum do českého formátu
 */
function formatDateCzech(date) {
    const day = date.getDate();
    const months = [
        "ledna", "února", "března", "dubna", "května", "června",
        "července", "srpna", "září", "října", "listopadu", "prosince"
    ];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${day}. ${month} ${year}`;
}
/**
 * Generuje HTML šablonu varovného emailu o neaktivitě
 */
function generateInactivityWarningEmailHTML(userName, deletionDate) {
    const formattedDate = formatDateCzech(deletionDate);
    return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upozornění na smazání účtu - Bulldogo.cz</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; min-height: 100vh;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ffffff;">
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%); border-radius: 24px; box-shadow: 0 25px 80px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05); overflow: hidden;">
                
                <!-- Červený header pruh (varování) -->
                <tr>
                  <td style="background: linear-gradient(90deg, #dc2626 0%, #ef4444 50%, #f87171 100%); height: 8px;"></td>
                </tr>
                
                <!-- Ikona -->
                <tr>
                  <td align="center" style="padding: 40px 0 20px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 50%; width: 100px; height: 100px; text-align: center; line-height: 100px; box-shadow: 0 10px 30px rgba(220, 38, 38, 0.2);">
                          <span style="font-size: 50px;">⚠️</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Pozdrav -->
                <tr>
                  <td align="center" style="padding: 0 40px 20px 40px;">
                    <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #dc2626; line-height: 1.3;">
                      Váš účet bude smazán
                    </h1>
                  </td>
                </tr>
                
                <!-- Hlavní text -->
                <tr>
                  <td align="center" style="padding: 0 40px 25px 40px;">
                    <p style="margin: 0 0 15px 0; font-size: 18px; line-height: 1.7; color: #4a5568;">
                      Ahoj, <strong style="color: #1a1a2e;">${userName}</strong>!
                    </p>
                    <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #718096;">
                      Všimli jsme si, že jste se na <strong>Bulldogo.cz</strong> dlouho nepřihlásili. 
                      Váš účet bude z důvodu neaktivity <strong style="color: #dc2626;">automaticky smazán</strong>.
                    </p>
                  </td>
                </tr>
                
                <!-- Datum smazání -->
                <tr>
                  <td style="padding: 0 40px 25px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 16px; border: 2px solid #fecaca;">
                      <tr>
                        <td align="center" style="padding: 25px;">
                          <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #991b1b; text-transform: uppercase; letter-spacing: 1px;">
                            Datum smazání účtu
                          </p>
                          <p style="margin: 0; font-size: 28px; font-weight: 800; color: #dc2626;">
                            ${formattedDate}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Varování -->
                <tr>
                  <td style="padding: 0 40px 25px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #fffbeb; border-radius: 12px; border: 1px solid #fde68a;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #92400e;">
                            <strong>⚠️ Tato akce je nevratná!</strong><br>
                            Po smazání budou trvale odstraněny všechny vaše údaje včetně profilu, inzerátů, recenzí a zpráv.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Jak zabránit -->
                <tr>
                  <td style="padding: 0 40px 30px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 16px; border: 1px solid #a7f3d0;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px;">
                            ✅ Jak zabránit smazání?
                          </p>
                          <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #047857;">
                            <strong>Stačí se přihlásit</strong> do svého účtu před datem smazání a váš účet zůstane aktivní. 
                            Žádné další kroky nejsou potřeba.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- CTA tlačítko -->
                <tr>
                  <td align="center" style="padding: 0 40px 30px 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #ff6a00 0%, #ffa62b 100%); border-radius: 12px; box-shadow: 0 8px 25px rgba(255, 106, 0, 0.35);">
                          <a href="https://bulldogo.cz/" target="_blank" style="display: inline-block; padding: 18px 50px; font-size: 17px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">
                            PŘIHLÁSIT SE →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Podpora -->
                <tr>
                  <td align="center" style="padding: 0 40px 40px 40px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                      Máte otázky? Kontaktujte naši podporu na 
                      <a href="mailto:support@bulldogo.cz" style="color: #ff6a00; text-decoration: none; font-weight: 600;">support@bulldogo.cz</a>
                      nebo zavolejte na <a href="tel:+420605121023" style="color: #ff6a00; text-decoration: none; font-weight: 600;">+420 605 121 023</a>.
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 40px 20px 20px 20px;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                „Služby jednoduše. Pro každého."
              </p>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #4a5568;">
                <a href="https://bulldogo.cz" style="color: #ff6a00; text-decoration: none;">bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="mailto:support@bulldogo.cz" style="color: #ff6a00; text-decoration: none;">support@bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="tel:+420605121023" style="color: #ff6a00; text-decoration: none;">+420 605 121 023</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
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
 * Scheduled job: Odešle varovný email uživatelům neaktivním 5 měsíců
 * Spouští se denně v 3:00 ráno (hodinu před mazáním)
 */
exports.sendInactivityWarningEmails = functions
    .region("europe-west1")
    .pubsub.schedule("0 3 * * *")
    .timeZone("Europe/Prague")
    .onRun(async () => {
    const auth = admin.auth();
    const db = admin.firestore();
    // Cutoff pro 5 měsíců neaktivity
    const warningCutoff = Date.now() - INACTIVITY_WARNING_MONTHS * 30 * MILLIS_IN_DAY;
    // Cutoff pro 6 měsíců (aby se neposílalo těm, co už mají být smazáni)
    const deleteCutoff = Date.now() - INACTIVITY_DELETE_MONTHS * 30 * MILLIS_IN_DAY;
    let nextPageToken = undefined;
    let warnedCount = 0;
    do {
        const page = await auth.listUsers(1000, nextPageToken);
        for (const user of page.users) {
            const lastSignIn = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).getTime() : 0;
            const created = user.metadata.creationTime ? new Date(user.metadata.creationTime).getTime() : 0;
            const lastActivity = lastSignIn || created;
            if (!lastActivity)
                continue;
            // Uživatel je neaktivní 5+ měsíců, ale méně než 6 měsíců
            if (lastActivity < warningCutoff && lastActivity >= deleteCutoff) {
                try {
                    // Zkontrolovat, zda jsme už varovný email neposlali
                    const profileDoc = await db.doc(`users/${user.uid}/profile/profile`).get();
                    const profileData = profileDoc.exists ? profileDoc.data() : null;
                    // Pokud už byl email odeslán v posledních 25 dnech, přeskočit
                    const lastWarningAt = profileData === null || profileData === void 0 ? void 0 : profileData.inactivityWarningAt;
                    if (lastWarningAt) {
                        const warningDate = lastWarningAt.toDate ? lastWarningAt.toDate() : new Date(lastWarningAt);
                        const daysSinceWarning = (Date.now() - warningDate.getTime()) / MILLIS_IN_DAY;
                        if (daysSinceWarning < 25) {
                            continue; // Email už byl nedávno odeslán
                        }
                    }
                    // Vypočítat datum smazání (30 dní od teď)
                    const deletionDate = new Date(Date.now() + 30 * MILLIS_IN_DAY);
                    // Získat email a jméno
                    const email = user.email;
                    if (!email)
                        continue;
                    let userName = "uživateli";
                    if (profileData) {
                        if (profileData.firstName) {
                            userName = profileData.firstName;
                        }
                        else if (profileData.name && profileData.name !== "Uživatel" && profileData.name !== "Firma") {
                            userName = profileData.name.split(" ")[0];
                        }
                        else if (profileData.companyName) {
                            userName = profileData.companyName;
                        }
                    }
                    // Odeslat varovný email
                    const mailOptions = {
                        from: {
                            name: "BULLDOGO",
                            address: "info@bulldogo.cz",
                        },
                        to: email,
                        subject: "⚠️ Váš účet na Bulldogo.cz bude smazán",
                        html: generateInactivityWarningEmailHTML(userName, deletionDate),
                        text: `Ahoj ${userName}!\n\nVšimli jsme si, že jste se na Bulldogo.cz dlouho nepřihlásili. Váš účet bude z důvodu neaktivity automaticky smazán dne ${formatDateCzech(deletionDate)}.\n\nTato akce je nevratná! Po smazání budou trvale odstraněny všechny vaše údaje.\n\nJak zabránit smazání? Stačí se přihlásit do svého účtu před datem smazání.\n\nPřihlásit se: https://bulldogo.cz\n\nMáte otázky? Kontaktujte podporu na support@bulldogo.cz nebo +420 605 121 023.\n\n© 2025 BULLDOGO`,
                    };
                    await smtpTransporter.sendMail(mailOptions);
                    // Uložit, že jsme email odeslali
                    await db.doc(`users/${user.uid}/profile/profile`).set({
                        inactivityWarningAt: admin.firestore.FieldValue.serverTimestamp(),
                        inactivityWarningEmail: email,
                    }, { merge: true });
                    warnedCount++;
                    functions.logger.info("📧 Varovný email o neaktivitě odeslán", {
                        uid: user.uid,
                        email: email,
                        deletionDate: deletionDate.toISOString(),
                    });
                }
                catch (err) {
                    functions.logger.error("Chyba při odesílání varovného emailu", {
                        uid: user.uid,
                        error: err === null || err === void 0 ? void 0 : err.message,
                    });
                }
            }
        }
        nextPageToken = page.pageToken;
    } while (nextPageToken);
    functions.logger.info("✅ sendInactivityWarningEmails finished", { warnedCount });
    return null;
});
/**
 * Mapování důvodů nahlášení na české popisky
 */
const reportReasonLabels = {
    spam: "Spam nebo podvodný inzerát",
    inappropriate: "Nevhodný obsah",
    misleading: "Zavádějící informace",
    wrong_category: "Špatná kategorie",
    duplicate: "Duplicitní inzerát",
    contact_issue: "Problém s kontaktem",
    other: "Jiný důvod",
};
/**
 * Generuje HTML šablonu emailu o nahlášení inzerátu (pro majitele)
 */
function generateReportEmailForOwnerHTML(ownerName, adTitle, adId, reporterName, reason, description) {
    const reasonLabel = reportReasonLabels[reason] || reason;
    return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nahlášení inzerátu - Bulldogo.cz</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; min-height: 100vh;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background: linear-gradient(135deg, #ff6a00 0%, #ee0979 100%); border-radius: 20px; padding: 15px 25px; box-shadow: 0 10px 40px rgba(255, 106, 0, 0.3);">
                    <span style="font-size: 32px; font-weight: 900; color: #ffffff; letter-spacing: 2px;">BULLDOGO</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Karta -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%); border-radius: 24px; box-shadow: 0 25px 80px rgba(0, 0, 0, 0.1); overflow: hidden;">
                
                <tr>
                  <td style="background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%); height: 8px;"></td>
                </tr>
                
                <tr>
                  <td align="center" style="padding: 40px 0 20px 0;">
                    <span style="font-size: 50px;">⚠️</span>
                  </td>
                </tr>
                
                <tr>
                  <td align="center" style="padding: 0 40px 20px 40px;">
                    <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #1a1a2e;">
                      Váš inzerát byl nahlášen
                    </h1>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 0 40px 25px 40px;">
                    <p style="margin: 0 0 15px 0; font-size: 16px; color: #4a5568;">
                      Ahoj, <strong>${ownerName}</strong>!
                    </p>
                    <p style="margin: 0; font-size: 16px; color: #718096;">
                      Uživatel nahlásil váš inzerát. Prosím zkontrolujte, zda je vše v pořádku.
                    </p>
                  </td>
                </tr>
                
                <!-- Detail inzerátu -->
                <tr>
                  <td style="padding: 0 40px 20px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f8f9fa; border-radius: 12px; border: 1px solid #e5e7eb;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Nahlášený inzerát</p>
                          <p style="margin: 0 0 4px 0; font-size: 18px; font-weight: 700; color: #1a1a2e;">${adTitle}</p>
                          <p style="margin: 0; font-size: 13px; color: #9ca3af;">ID: ${adId}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Důvod -->
                <tr>
                  <td style="padding: 0 40px 20px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #fffbeb; border-radius: 12px; border: 1px solid #fde68a;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 8px 0; font-size: 13px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">Důvod nahlášení</p>
                          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #92400e;">${reasonLabel}</p>
                          ${description ? `<p style="margin: 12px 0 0 0; font-size: 14px; color: #78716c; border-top: 1px solid #fde68a; padding-top: 12px;">${description}</p>` : ""}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Nahlašovatel -->
                <tr>
                  <td style="padding: 0 40px 20px 40px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">
                      <strong>Nahlásil:</strong> ${reporterName}
                    </p>
                  </td>
                </tr>
                
                <!-- Co dělat -->
                <tr>
                  <td style="padding: 0 40px 25px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ecfdf5; border-radius: 12px; border: 1px solid #a7f3d0;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #065f46;">✅ Co můžete udělat?</p>
                          <ul style="margin: 0; padding-left: 20px; color: #047857; font-size: 14px; line-height: 1.8;">
                            <li>Zkontrolujte obsah inzerátu</li>
                            <li>Upravte případné nepřesnosti</li>
                            <li>Pokud je vše v pořádku, nemusíte nic dělat</li>
                          </ul>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- CTA -->
                <tr>
                  <td align="center" style="padding: 0 40px 30px 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #ff6a00 0%, #ffa62b 100%); border-radius: 12px;">
                          <a href="https://bulldogo.cz/my-ads.html" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none;">
                            ZKONTROLOVAT MÉ INZERÁTY →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Podpora -->
                <tr>
                  <td align="center" style="padding: 0 40px 40px 40px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">
                      Máte otázky? Kontaktujte 
                      <a href="mailto:support@bulldogo.cz" style="color: #ff6a00;">support@bulldogo.cz</a>
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 40px 20px 20px 20px;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">© 2025 BULLDOGO. Všechna práva vyhrazena.</p>
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
 * Generuje HTML šablonu emailu o nahlášení inzerátu (pro admina)
 */
function generateReportEmailForAdminHTML(adTitle, adId, adOwnerName, adOwnerEmail, reporterName, reporterEmail, reason, description) {
    const reasonLabel = reportReasonLabels[reason] || reason;
    return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nahlášení inzerátu - Admin</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f3f4f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          
          <tr>
            <td style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px;">🚨 Nové nahlášení inzerátu</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 30px;">
              
              <!-- Inzerát -->
              <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 14px; text-transform: uppercase;">📋 Nahlášený inzerát</h3>
                <p style="margin: 0 0 8px 0;"><strong>Název:</strong> ${adTitle}</p>
                <p style="margin: 0 0 8px 0;"><strong>ID:</strong> ${adId}</p>
                <p style="margin: 0;"><strong>URL:</strong> <a href="https://bulldogo.cz/ad-detail.html?id=${adId}" style="color: #ff6a00;">Zobrazit inzerát</a></p>
              </div>
              
              <!-- Majitel -->
              <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 14px; text-transform: uppercase;">👤 Majitel inzerátu</h3>
                <p style="margin: 0 0 8px 0;"><strong>Jméno:</strong> ${adOwnerName}</p>
                <p style="margin: 0;"><strong>Email:</strong> <a href="mailto:${adOwnerEmail}" style="color: #ff6a00;">${adOwnerEmail || "Neznámý"}</a></p>
              </div>
              
              <!-- Nahlašovatel -->
              <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 12px 0; color: #374151; font-size: 14px; text-transform: uppercase;">🔔 Nahlašovatel</h3>
                <p style="margin: 0 0 8px 0;"><strong>Jméno:</strong> ${reporterName}</p>
                <p style="margin: 0;"><strong>Email:</strong> <a href="mailto:${reporterEmail}" style="color: #ff6a00;">${reporterEmail || "Nepřihlášený"}</a></p>
              </div>
              
              <!-- Důvod -->
              <div style="background: #fef3c7; border-radius: 12px; padding: 20px; border: 1px solid #fcd34d;">
                <h3 style="margin: 0 0 12px 0; color: #92400e; font-size: 14px; text-transform: uppercase;">⚠️ Důvod nahlášení</h3>
                <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #92400e;">${reasonLabel}</p>
                ${description ? `<p style="margin: 12px 0 0 0; color: #78716c; border-top: 1px solid #fcd34d; padding-top: 12px;">${description}</p>` : ""}
              </div>
              
            </td>
          </tr>
          
          <tr>
            <td style="padding: 0 30px 30px 30px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af;">
                Tento email byl automaticky vygenerován systémem Bulldogo.cz
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
 * HTTPS endpoint pro nahlášení inzerátu
 */
exports.reportAd = functions.region("europe-west1").https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        try {
            if (req.method !== "POST") {
                res.status(405).json({ success: false, error: "Method not allowed" });
                return;
            }
            const { adId, adTitle, adOwnerId, adOwnerName, adOwnerEmail, reporterUid, reporterName, reporterEmail, reason, description, } = req.body;
            if (!adId || !reason) {
                res.status(400).json({ success: false, error: "Missing required fields" });
                return;
            }
            const db = admin.firestore();
            // Get owner email from Firestore if not provided
            let ownerEmail = adOwnerEmail;
            let ownerName = adOwnerName || "Majitel inzerátu";
            if (adOwnerId && !ownerEmail) {
                try {
                    const ownerProfile = await db.doc(`users/${adOwnerId}/profile/profile`).get();
                    if (ownerProfile.exists) {
                        const data = ownerProfile.data();
                        ownerEmail = (data === null || data === void 0 ? void 0 : data.email) || "";
                        ownerName = (data === null || data === void 0 ? void 0 : data.name) || (data === null || data === void 0 ? void 0 : data.firstName) || (data === null || data === void 0 ? void 0 : data.companyName) || ownerName;
                    }
                }
                catch (e) {
                    functions.logger.debug("Could not fetch owner profile", { adOwnerId });
                }
            }
            // Save report to Firestore
            await db.collection("reports").add({
                adId,
                adTitle: adTitle || "",
                adOwnerId: adOwnerId || "",
                adOwnerEmail: ownerEmail || "",
                reporterUid: reporterUid || "",
                reporterName: reporterName || "Anonymní",
                reporterEmail: reporterEmail || "",
                reason,
                description: description || "",
                status: "pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Send email to ad owner
            if (ownerEmail) {
                try {
                    await smtpTransporter.sendMail({
                        from: { name: "BULLDOGO", address: "info@bulldogo.cz" },
                        to: ownerEmail,
                        subject: `⚠️ Váš inzerát "${adTitle}" byl nahlášen`,
                        html: generateReportEmailForOwnerHTML(ownerName, adTitle || "Bez názvu", adId, reporterName || "Anonymní uživatel", reason, description || ""),
                    });
                    functions.logger.info("Report email sent to owner", { ownerEmail, adId });
                }
                catch (e) {
                    functions.logger.error("Failed to send report email to owner", { error: e === null || e === void 0 ? void 0 : e.message });
                }
            }
            // Send copy to admin
            try {
                await smtpTransporter.sendMail({
                    from: { name: "BULLDOGO", address: "info@bulldogo.cz" },
                    to: "support@bulldogo.cz",
                    subject: `🚨 Nahlášení inzerátu: ${adTitle}`,
                    html: generateReportEmailForAdminHTML(adTitle || "Bez názvu", adId, ownerName, ownerEmail || "", reporterName || "Anonymní", reporterEmail || "", reason, description || ""),
                });
                functions.logger.info("Report email sent to admin", { adId });
            }
            catch (e) {
                functions.logger.error("Failed to send report email to admin", { error: e === null || e === void 0 ? void 0 : e.message });
            }
            res.status(200).json({ success: true });
        }
        catch (error) {
            functions.logger.error("Report ad error", { error: error === null || error === void 0 ? void 0 : error.message });
            res.status(500).json({ success: false, error: (error === null || error === void 0 ? void 0 : error.message) || "Internal error" });
        }
    });
});
/**
 * Generuje HTML šablonu emailu o smazání účtu
 */
function generateAccountDeletedEmailHTML(userName) {
    return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Účet byl smazán - Bulldogo.cz</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; min-height: 100vh;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ffffff;">
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%); border-radius: 24px; box-shadow: 0 25px 80px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05); overflow: hidden;">
                
                <!-- Šedý header pruh -->
                <tr>
                  <td style="background: linear-gradient(90deg, #6b7280 0%, #9ca3af 50%, #d1d5db 100%); height: 8px;"></td>
                </tr>
                
                <!-- Ikona -->
                <tr>
                  <td align="center" style="padding: 40px 0 20px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 50%; width: 100px; height: 100px; text-align: center; line-height: 100px; box-shadow: 0 10px 30px rgba(107, 114, 128, 0.2);">
                          <span style="font-size: 50px;">👋</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Pozdrav -->
                <tr>
                  <td align="center" style="padding: 0 40px 20px 40px;">
                    <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #1a1a2e; line-height: 1.3;">
                      Váš účet byl smazán
                    </h1>
                  </td>
                </tr>
                
                <!-- Hlavní text -->
                <tr>
                  <td align="center" style="padding: 0 40px 25px 40px;">
                    <p style="margin: 0 0 15px 0; font-size: 18px; line-height: 1.7; color: #4a5568;">
                      Ahoj, <strong style="color: #1a1a2e;">${userName}</strong>!
                    </p>
                    <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #718096;">
                      Váš účet na <strong>Bulldogo.cz</strong> byl z důvodu dlouhodobé neaktivity 
                      <strong>trvale smazán</strong>.
                    </p>
                  </td>
                </tr>
                
                <!-- Info box -->
                <tr>
                  <td style="padding: 0 40px 25px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f8f9fa; border-radius: 16px; border: 1px solid #e5e7eb;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #4a5568;">
                            <strong>Co bylo smazáno:</strong>
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #6b7280; font-size: 14px; line-height: 1.8;">
                            <li>Váš profil a osobní údaje</li>
                            <li>Všechny vaše inzeráty</li>
                            <li>Recenze a hodnocení</li>
                            <li>Zprávy a konverzace</li>
                          </ul>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Varování -->
                <tr>
                  <td style="padding: 0 40px 25px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 12px; border: 1px solid #fecaca;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #991b1b;">
                            <strong>⚠️ Tato akce je nevratná.</strong><br>
                            Data již nelze obnovit.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Poděkování -->
                <tr>
                  <td style="padding: 0 40px 30px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #fff8eb 0%, #fff3e0 100%); border-radius: 16px; border: 1px solid #ffe0b2;">
                      <tr>
                        <td align="center" style="padding: 25px;">
                          <p style="margin: 0; font-size: 18px; line-height: 1.6; color: #92400e;">
                            <strong>🧡 Děkujeme, že jste byli součástí Bulldogo!</strong>
                          </p>
                          <p style="margin: 12px 0 0 0; font-size: 15px; color: #b45309;">
                            Pokud se rozhodnete vrátit, budeme rádi. Můžete si kdykoliv vytvořit nový účet.
                          </p>
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
                          <a href="https://bulldogo.cz/" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">
                            VYTVOŘIT NOVÝ ÚČET →
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
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                „Služby jednoduše. Pro každého."
              </p>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #4a5568;">
                <a href="https://bulldogo.cz" style="color: #ff6a00; text-decoration: none;">bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="mailto:support@bulldogo.cz" style="color: #ff6a00; text-decoration: none;">support@bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="tel:+420605121023" style="color: #ff6a00; text-decoration: none;">+420 605 121 023</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
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
 * Odešle email o smazání účtu
 */
async function sendAccountDeletedEmail(email, userName) {
    const mailOptions = {
        from: {
            name: "BULLDOGO",
            address: "info@bulldogo.cz",
        },
        to: email,
        subject: "👋 Váš účet na Bulldogo.cz byl smazán",
        html: generateAccountDeletedEmailHTML(userName),
        text: `Ahoj ${userName}!\n\nVáš účet na Bulldogo.cz byl z důvodu dlouhodobé neaktivity trvale smazán.\n\nCo bylo smazáno:\n- Váš profil a osobní údaje\n- Všechny vaše inzeráty\n- Recenze a hodnocení\n- Zprávy a konverzace\n\n⚠️ Tato akce je nevratná. Data již nelze obnovit.\n\n🧡 Děkujeme, že jste byli součástí Bulldogo! Pokud se rozhodnete vrátit, můžete si kdykoliv vytvořit nový účet na https://bulldogo.cz\n\n© 2025 BULLDOGO`,
    };
    await smtpTransporter.sendMail(mailOptions);
}
/**
 * Scheduled cleanup of inactive accounts.
 * Smaže účty, které se nepřihlásily déle než 6 měsíců,
 * včetně základních dat ve Firestore (profil, inzeráty, recenze, zprávy).
 */
async function deleteUserData(uid) {
    const db = admin.firestore();
    functions.logger.info("🧹 Deleting data for inactive user", { uid });
    try {
        await db.doc(`users/${uid}/profile/profile`).delete({ exists: true });
    }
    catch (err) {
        functions.logger.debug("Profile delete skipped or failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
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
                    if (ops > 0)
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
    try {
        const rootReviewsSnap = await db.collection("reviews").where("reviewedUserId", "==", uid).get();
        if (!rootReviewsSnap.empty) {
            const batch = db.batch();
            rootReviewsSnap.forEach((r) => batch.delete(r.ref));
            await batch.commit();
        }
    }
    catch (err) {
        functions.logger.debug("Root reviews delete failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
    try {
        const messagesSnap = await db.collection("messages").where("userId", "==", uid).get();
        if (!messagesSnap.empty) {
            const batch = db.batch();
            messagesSnap.forEach((m) => batch.delete(m.ref));
            await batch.commit();
        }
    }
    catch (err) {
        functions.logger.debug("Messages delete failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
    try {
        await db.doc(`users/${uid}`).delete({ exists: true });
    }
    catch (err) {
        functions.logger.debug("Root user doc delete skipped or failed", { uid, error: err === null || err === void 0 ? void 0 : err.message });
    }
}
exports.cleanupInactiveUsers = functions
    .region("europe-west1")
    .pubsub.schedule("0 4 * * *")
    .timeZone("Europe/Prague")
    .onRun(async () => {
    var _a, _b;
    const auth = admin.auth();
    const db = admin.firestore();
    const cutoff = Date.now() - INACTIVITY_DELETE_MONTHS * 30 * MILLIS_IN_DAY;
    let nextPageToken = undefined;
    let deletedCount = 0;
    do {
        const page = await auth.listUsers(1000, nextPageToken);
        for (const user of page.users) {
            const lastSignIn = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).getTime() : 0;
            const created = user.metadata.creationTime ? new Date(user.metadata.creationTime).getTime() : 0;
            const lastActivity = lastSignIn || created;
            if (!lastActivity)
                continue;
            if (lastActivity < cutoff) {
                functions.logger.info("🧹 Deleting inactive auth user", {
                    uid: user.uid,
                    email: (_a = user.email) !== null && _a !== void 0 ? _a : null,
                    lastSignIn: (_b = user.metadata.lastSignInTime) !== null && _b !== void 0 ? _b : user.metadata.creationTime,
                });
                // Získat jméno uživatele před smazáním pro email
                let userName = "uživateli";
                const email = user.email;
                try {
                    const profileDoc = await db.doc(`users/${user.uid}/profile/profile`).get();
                    if (profileDoc.exists) {
                        const profileData = profileDoc.data();
                        if (profileData === null || profileData === void 0 ? void 0 : profileData.firstName) {
                            userName = profileData.firstName;
                        }
                        else if ((profileData === null || profileData === void 0 ? void 0 : profileData.name) && profileData.name !== "Uživatel" && profileData.name !== "Firma") {
                            userName = profileData.name.split(" ")[0];
                        }
                        else if (profileData === null || profileData === void 0 ? void 0 : profileData.companyName) {
                            userName = profileData.companyName;
                        }
                    }
                }
                catch (e) {
                    // Ignorovat chyby při získávání jména
                }
                // Smazat data uživatele
                try {
                    await deleteUserData(user.uid);
                }
                catch (err) {
                    functions.logger.error("Failed to delete Firestore data for inactive user", { uid: user.uid, error: err === null || err === void 0 ? void 0 : err.message });
                }
                // Smazat Auth účet
                try {
                    await auth.deleteUser(user.uid);
                    deletedCount += 1;
                    // Odeslat email o smazání účtu (po úspěšném smazání)
                    if (email) {
                        try {
                            await sendAccountDeletedEmail(email, userName);
                            functions.logger.info("📧 Email o smazání účtu odeslán", { email, userName });
                        }
                        catch (emailErr) {
                            functions.logger.error("Failed to send account deleted email", { email, error: emailErr === null || emailErr === void 0 ? void 0 : emailErr.message });
                        }
                    }
                }
                catch (err) {
                    functions.logger.error("Failed to delete auth user", { uid: user.uid, error: err === null || err === void 0 ? void 0 : err.message });
                }
            }
        }
        nextPageToken = page.pageToken;
    } while (nextPageToken);
    functions.logger.info("✅ cleanupInactiveUsers finished", { deletedCount, inactivityMonths: INACTIVITY_DELETE_MONTHS });
    return null;
});
const getGoPayConfig = () => {
    const cfg = functions.config().gopay || {};
    const isTest = process.env.NODE_ENV !== "production" || cfg.use_test === "true";
    return {
        clientId: isTest ? (cfg.test_client_id || "") : (cfg.client_id || ""),
        clientSecret: isTest ? (cfg.test_client_secret || "") : (cfg.client_secret || ""),
        apiUrl: isTest ? (cfg.test_api_url || "https://gw.sandbox.gopay.com/api") : (cfg.api_url || "https://gate.gopay.cz/api"),
        isTest,
    };
};
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
                scope,
            },
        });
        return response.data.access_token;
    }
    catch (error) {
        functions.logger.error("GoPay OAuth2 error", { details: ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || (error === null || error === void 0 ? void 0 : error.message) });
        const msg = ((_e = (_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.errors) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.message) || (error === null || error === void 0 ? void 0 : error.message) || "unknown";
        throw new Error(`Failed to get GoPay access token: ${msg}`);
    }
}
/**
 * Pomocná funkce pro aktivaci uživatelského plánu po zaplacení
 */
async function activateUserPlan(orderNumber) {
    const db = admin.firestore();
    const paymentDoc = await db.collection("payments").doc(orderNumber).get();
    if (!paymentDoc.exists) {
        functions.logger.error("Payment document not found", { orderNumber });
        return;
    }
    const paymentData = paymentDoc.data();
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
    await userProfileRef.set({
        plan: planId,
        planName,
        planUpdatedAt: now,
        planPeriodStart: now,
        planPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
        planDurationDays: durationDays,
        planCancelAt: null,
    }, { merge: true });
    // Odstranit expirační značky (pokud uživatel obnovil balíček)
    try {
        await clearPlanExpiredMarkersForUser(String(userId));
    }
    catch (e) {
        functions.logger.warn("Failed clearing plan expired markers", { userId, error: e === null || e === void 0 ? void 0 : e.message });
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
exports.createPayment = functions.https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a;
        try {
            if (req.method !== "POST") {
                res.status(405).json({ error: "Method not allowed. Use POST." });
                return;
            }
            const body = (req.body || {});
            const { amount, currency = "CZK", orderNumber, orderDescription, userId, planId, planName, items = [], payerEmail, payerPhone, payerFirstName, payerLastName, returnUrl, } = body;
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
            const projCfg = functions.config().project || {};
            const baseUrl = returnUrl || `https://${projCfg.region || "europe-west1"}-${projCfg.id || ""}.cloudfunctions.net`;
            const paymentReturnUrl = returnUrl || `${baseUrl}/paymentReturn`;
            const paymentNotificationUrl = `${baseUrl}/gopayNotification`;
            const paymentData = {
                amount: Math.round(Number(amount) * 100),
                currency,
                order_number: orderNumber,
                order_description: orderDescription,
                items: Array.isArray(items) && items.length > 0
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
                    contact: Object.assign(Object.assign(Object.assign(Object.assign({}, (payerEmail ? { email: payerEmail } : {})), (payerPhone ? { phone_number: payerPhone } : {})), (payerFirstName ? { first_name: payerFirstName } : {})), (payerLastName ? { last_name: payerLastName } : {})),
                },
                target: { type: "ACCOUNT", goid: parseInt(gopayConfig.clientId, 10) },
                return_url: paymentReturnUrl,
                notification_url: paymentNotificationUrl,
                lang: "cs",
            };
            const paymentResponse = await axios_1.default.post(`${gopayConfig.apiUrl}/payments/payment`, paymentData, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            });
            const goPayPayment = paymentResponse.data;
            const paymentRecord = {
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
        }
        catch (error) {
            res.status(500).json({
                error: "Failed to create payment",
                message: error === null || error === void 0 ? void 0 : error.message,
                details: ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || undefined,
            });
        }
    });
});
/**
 * Ověří stav platby v GoPay
 */
exports.checkPayment = functions.https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a;
        try {
            const paymentId = req.query.paymentId || "";
            const orderNumber = req.query.orderNumber || "";
            if (!paymentId && !orderNumber) {
                res.status(400).json({ error: "Missing paymentId or orderNumber" });
                return;
            }
            const accessToken = await getGoPayAccessToken("payment-all");
            const gopayConfig = getGoPayConfig();
            const paymentResponse = await axios_1.default.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId || orderNumber}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const goPayPayment = paymentResponse.data;
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
        }
        catch (error) {
            res.status(500).json({
                error: "Failed to check payment",
                message: error === null || error === void 0 ? void 0 : error.message,
                details: ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || undefined,
            });
        }
    });
});
/**
 * Endpoint pro notifikace od GoPay
 */
exports.gopayNotification = functions.https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        try {
            const notification = req.body;
            functions.logger.info("GoPay notification received", { notification });
            if (!(notification === null || notification === void 0 ? void 0 : notification.id)) {
                res.status(400).json({ error: "Missing payment id in notification" });
                return;
            }
            const paymentId = notification.id;
            const accessToken = await getGoPayAccessToken("payment-all");
            const gopayConfig = getGoPayConfig();
            const paymentResponse = await axios_1.default.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const goPayPayment = paymentResponse.data;
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
        }
        catch (error) {
            functions.logger.error("GoPay notification error", { error: error === null || error === void 0 ? void 0 : error.message });
            res.status(200).send("OK");
        }
    });
});
/**
 * Pomocný endpoint pro payment return (redirect z GoPay)
 */
exports.paymentReturn = functions.https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a, _b, _c;
        try {
            const paymentId = req.query.idPaymentSession || "";
            const state = req.query.state || "";
            if (paymentId) {
                const accessToken = await getGoPayAccessToken("payment-all");
                const gopayConfig = getGoPayConfig();
                try {
                    const paymentResponse = await axios_1.default.get(`${gopayConfig.apiUrl}/payments/payment/${paymentId}`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    const goPayPayment = paymentResponse.data;
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
                        const frontendUrl = ((_a = functions.config().frontend) === null || _a === void 0 ? void 0 : _a.url) || "https://bulldogo.cz";
                        const returnPath = `/packages.html?payment=${goPayPayment.state}&orderNumber=${orderNumber}&paymentId=${paymentId}`;
                        res.redirect(`${frontendUrl}${returnPath}`);
                        return;
                    }
                }
                catch (e) {
                    // ignore – fallback redirect below
                }
            }
            const frontendUrl = ((_b = functions.config().frontend) === null || _b === void 0 ? void 0 : _b.url) || "https://bulldogo.cz";
            res.redirect(`${frontendUrl}/packages.html?payment=${state || "unknown"}`);
        }
        catch (error) {
            const frontendUrl = ((_c = functions.config().frontend) === null || _c === void 0 ? void 0 : _c.url) || "https://bulldogo.cz";
            res.redirect(`${frontendUrl}/packages.html?payment=error`);
        }
    });
});
/**
 * Balíček expiroval => inzeráty se přesunou na 1 měsíc do "Moje inzeráty" (status=inactive, reason=plan_expired),
 * poté se trvale smažou (včetně reviews). Pro ostatní uživatele nejsou viditelné.
 */
const PLAN_EXPIRED_DELETE_DAYS = 30;
exports.enforceExpiredPlanAds = functions
    .region("europe-west1")
    .pubsub.schedule("*/5 * * * *") // každých 5 minut – minimalizuje okno viditelnosti
    .timeZone("Europe/Prague")
    .onRun(async () => {
    const db = admin.firestore();
    const nowDate = new Date();
    const nowTs = admin.firestore.Timestamp.fromDate(nowDate);
    const deleteCutoff = admin.firestore.Timestamp.fromMillis(Date.now() - PLAN_EXPIRED_DELETE_DAYS * 24 * MILLIS_IN_DAY);
    let processed = 0;
    let inactivated = 0;
    let deleted = 0;
    // SPOLEHLIVÝ PŘÍSTUP: Projít všechny uživatele a zkontrolovat jejich plán
    functions.logger.info("🔍 Checking all users for expired plans...");
    const usersSnap = await db.collection("users").get();
    functions.logger.info(`📋 Found ${usersSnap.size} users to check`);
    for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        // Načíst profil
        let profile = null;
        try {
            const profileDoc = await db.doc(`users/${userId}/profile/profile`).get();
            profile = profileDoc.exists ? profileDoc.data() : null;
        }
        catch (e) {
            continue;
        }
        // Zkontrolovat, zda má aktivní plán
        const hasActivePlan = isPlanActive(profile, nowDate);
        if (hasActivePlan) {
            // Má aktivní plán - přeskočit
            continue;
        }
        // Najít aktivní inzeráty tohoto uživatele
        const adsSnap = await db.collection(`users/${userId}/inzeraty`).where("status", "==", "active").get();
        if (adsSnap.empty) {
            continue;
        }
        functions.logger.info(`🚫 User ${userId} has no active plan, deactivating ${adsSnap.size} ads`);
        // Nemá aktivní plán - deaktivovat všechny jeho aktivní inzeráty
        let batch = db.batch();
        let ops = 0;
        for (const adDoc of adsSnap.docs) {
            batch.update(adDoc.ref, {
                status: "inactive",
                inactiveReason: "plan_expired",
                inactiveAt: nowTs,
                updatedAt: nowTs,
            });
            ops++;
            inactivated++;
            if (ops >= 450) {
                await batch.commit();
                batch = db.batch();
                ops = 0;
            }
        }
        if (ops > 0) {
            await batch.commit();
        }
        // Aktualizovat profil
        const profileRef = db.doc(`users/${userId}/profile/profile`);
        const planEnd = profile ? toDateMaybe(profile.planPeriodEnd) : null;
        const existingExpiredAt = profile === null || profile === void 0 ? void 0 : profile.planExpiredAt;
        const expiredAt = existingExpiredAt ? existingExpiredAt : (planEnd ? admin.firestore.Timestamp.fromDate(planEnd) : nowTs);
        await profileRef.set({
            plan: null,
            planCancelAt: null,
            planExpiredAt: expiredAt,
            planExpiredProcessedAt: nowTs,
        }, { merge: true });
        processed++;
    }
    // DRUHÁ ČÁST: Mazání starých inzerátů označených jako plan_expired (starší než 30 dní)
    functions.logger.info("🗑️ Checking for old expired ads to delete...");
    for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const expiredAdsSnap = await db.collection(`users/${userId}/inzeraty`)
            .where("status", "==", "inactive")
            .where("inactiveReason", "==", "plan_expired")
            .get();
        for (const adDoc of expiredAdsSnap.docs) {
            const ad = adDoc.data();
            const inactiveAtDate = toDateMaybe(ad.inactiveAt);
            const inactiveAt = inactiveAtDate ? admin.firestore.Timestamp.fromDate(inactiveAtDate) : null;
            // Mazat jen ty starší než 30 dní
            if (inactiveAt && inactiveAt.toMillis() <= deleteCutoff.toMillis()) {
                try {
                    await deleteAdReviewsAndDoc(adDoc.ref);
                    deleted++;
                }
                catch (e) {
                    functions.logger.warn("Failed to delete expired ad", { adId: adDoc.id, error: e === null || e === void 0 ? void 0 : e.message });
                }
            }
        }
    }
    // 3) Pokud uživatel obnovil balíček mimo GoPay flow (např. Stripe extension),
    // vyčisti profily, které mají planExpiredAt, ale plán už je zase aktivní.
    try {
        const markedSnap = await db.collectionGroup("profile").where("planExpiredAt", "!=", null).get();
        for (const profDoc of markedSnap.docs) {
            const uid = getUidFromProfileDocRef(profDoc.ref);
            if (!uid)
                continue;
            const profile = profDoc.data();
            if (isPlanActive(profile, nowDate)) {
                await clearPlanExpiredMarkersForUser(uid);
            }
        }
    }
    catch (e) {
        functions.logger.debug("Skipped renewal markers cleanup", { error: e === null || e === void 0 ? void 0 : e.message });
    }
    functions.logger.info("✅ enforceExpiredPlanAds finished", { processed, inactivated, deleted });
    return null;
});
/**
 * Manuální HTTP endpoint pro okamžitou kontrolu a deaktivaci inzerátů bez aktivního plánu.
 * Volat: GET /forceCheckExpiredPlans
 */
exports.forceCheckExpiredPlans = functions
    .region("europe-west1")
    .https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a;
        try {
            const db = admin.firestore();
            const nowDate = new Date();
            const nowTs = admin.firestore.Timestamp.fromDate(nowDate);
            let checked = 0;
            let deactivated = 0;
            const details = [];
            // Projít všechny uživatele
            const usersSnap = await db.collection("users").get();
            for (const userDoc of usersSnap.docs) {
                const userId = userDoc.id;
                checked++;
                // Načíst profil
                const profileDoc = await db.doc(`users/${userId}/profile/profile`).get();
                const profile = profileDoc.exists ? profileDoc.data() : null;
                const hasActivePlan = isPlanActive(profile, nowDate);
                // Načíst aktivní inzeráty tohoto uživatele
                const adsSnap = await db.collection(`users/${userId}/inzeraty`).where("status", "==", "active").get();
                const userDetail = {
                    userId,
                    activeAdsCount: adsSnap.size,
                    hasActivePlan,
                    profileExists: profileDoc.exists,
                    plan: (profile === null || profile === void 0 ? void 0 : profile.plan) || null,
                    planPeriodEnd: (profile === null || profile === void 0 ? void 0 : profile.planPeriodEnd) ? (_a = toDateMaybe(profile.planPeriodEnd)) === null || _a === void 0 ? void 0 : _a.toISOString() : null,
                };
                if (!hasActivePlan && adsSnap.size > 0) {
                    // Deaktivovat všechny aktivní inzeráty
                    let batch = db.batch();
                    let ops = 0;
                    for (const adDoc of adsSnap.docs) {
                        batch.update(adDoc.ref, {
                            status: "inactive",
                            inactiveReason: "plan_expired",
                            inactiveAt: nowTs,
                            updatedAt: nowTs,
                        });
                        ops++;
                        deactivated++;
                        if (ops >= 450) {
                            await batch.commit();
                            batch = db.batch();
                            ops = 0;
                        }
                    }
                    if (ops > 0) {
                        await batch.commit();
                    }
                    userDetail.action = `DEACTIVATED ${adsSnap.size} ads`;
                }
                else if (hasActivePlan) {
                    userDetail.action = "SKIPPED (has active plan)";
                }
                else {
                    userDetail.action = "SKIPPED (no active ads)";
                }
                details.push(userDetail);
            }
            res.json({
                success: true,
                message: `Zkontrolováno ${checked} uživatelů, deaktivováno ${deactivated} inzerátů`,
                usersChecked: checked,
                adsDeactivated: deactivated,
                details,
            });
        }
        catch (error) {
            functions.logger.error("Error in forceCheckExpiredPlans", error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});
/**
 * Trigger: Když se změní profil uživatele a plan se změní na null/prázdný,
 * okamžitě pozastavit všechny jeho inzeráty.
 */
exports.onPlanCancelled = functions
    .region("europe-west1")
    .firestore.document("users/{userId}/profile/profile")
    .onUpdate(async (change, context) => {
    const userId = context.params.userId;
    const before = change.before.data();
    const after = change.after.data();
    const planBefore = ((before === null || before === void 0 ? void 0 : before.plan) || "").toString();
    const planAfter = ((after === null || after === void 0 ? void 0 : after.plan) || "").toString();
    // Kontrola: měl plán a teď nemá (zrušení předplatného)
    const hadActivePlan = planBefore === "hobby" || planBefore === "business";
    const hasActivePlan = planAfter === "hobby" || planAfter === "business";
    const db = admin.firestore();
    // PŘÍPAD 1: Zrušení předplatného (měl plán, teď nemá)
    if (hadActivePlan && !hasActivePlan) {
        functions.logger.info("🚫 Plan cancelled for user, deactivating ads", { userId, planBefore, planAfter });
        const nowTs = admin.firestore.FieldValue.serverTimestamp();
        // Pozastavit všechny aktivní inzeráty uživatele
        const adsSnap = await db.collection(`users/${userId}/inzeraty`).where("status", "==", "active").get();
        if (adsSnap.empty) {
            functions.logger.info("No active ads to deactivate for user", { userId });
            return null;
        }
        let batch = db.batch();
        let ops = 0;
        let deactivated = 0;
        for (const adDoc of adsSnap.docs) {
            batch.update(adDoc.ref, {
                status: "inactive",
                inactiveReason: "plan_expired",
                inactiveAt: nowTs,
                updatedAt: nowTs,
            });
            ops++;
            deactivated++;
            if (ops >= 450) {
                await batch.commit();
                batch = db.batch();
                ops = 0;
            }
        }
        if (ops > 0) {
            await batch.commit();
        }
        functions.logger.info("✅ Deactivated ads due to plan cancellation", { userId, deactivated });
        return null;
    }
    // PŘÍPAD 2: Obnovení předplatného (neměl plán, teď má)
    if (!hadActivePlan && hasActivePlan) {
        functions.logger.info("✅ Plan renewed for user, clearing expired markers", { userId, planBefore, planAfter });
        // Vyčistit inactiveReason z inzerátů, které byly pozastaveny kvůli vypršení předplatného
        const expiredAdsSnap = await db.collection(`users/${userId}/inzeraty`).where("inactiveReason", "==", "plan_expired").get();
        if (expiredAdsSnap.empty) {
            functions.logger.info("No expired ads to clean for user", { userId });
            return null;
        }
        let batch = db.batch();
        let ops = 0;
        let cleaned = 0;
        for (const adDoc of expiredAdsSnap.docs) {
            batch.update(adDoc.ref, {
                inactiveReason: admin.firestore.FieldValue.delete(),
                inactiveAt: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            ops++;
            cleaned++;
            if (ops >= 450) {
                await batch.commit();
                batch = db.batch();
                ops = 0;
            }
        }
        if (ops > 0) {
            await batch.commit();
        }
        // Vyčistit planExpiredAt z profilu
        await change.after.ref.set({
            planExpiredAt: admin.firestore.FieldValue.delete(),
            planExpiredProcessedAt: admin.firestore.FieldValue.delete(),
        }, { merge: true });
        functions.logger.info("✅ Cleaned expired markers for renewed user", { userId, cleaned });
        return null;
    }
    return null;
});
// ===============================================
// SMTP Email konfigurace pro Hostinger
// ===============================================
const smtpTransporter = nodemailer.createTransport({
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: {
        user: "info@bulldogo.cz",
        pass: "Fotbal1997.",
    },
});
/**
 * Načte jméno uživatele z Firestore profilu
 */
async function getUserNameFromProfile(uid) {
    try {
        const db = admin.firestore();
        const profileDoc = await db.doc(`users/${uid}/profile/profile`).get();
        if (profileDoc.exists) {
            const data = profileDoc.data();
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
    }
    catch (error) {
        return "uživateli";
    }
}
/**
 * Generuje HTML šablonu uvítacího emailu
 */
function generateWelcomeEmailHTML(userName) {
    return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vítejte na Bulldogo.cz</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; min-height: 100vh;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ffffff;">
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
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                „Služby jednoduše. Pro každého."
              </p>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #4a5568;">
                <a href="https://bulldogo.cz" style="color: #ff6a00; text-decoration: none;">bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="mailto:support@bulldogo.cz" style="color: #ff6a00; text-decoration: none;">support@bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="tel:+420605121023" style="color: #ff6a00; text-decoration: none;">+420 605 121 023</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
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
 * Mapování názvů polí na české popisky
 */
const fieldLabels = {
    name: "Jméno",
    email: "E-mail",
    phone: "Telefon",
    city: "Město",
    bio: "O mně",
    businessName: "Název firmy",
    businessType: "Typ podnikání",
    businessAddress: "Adresa firmy",
    businessDescription: "Popis firmy",
    companyName: "Název společnosti",
    ico: "IČO",
    dic: "DIČ",
    address: "Adresa",
    emailNotifications: "E-mailová upozornění",
    smsNotifications: "SMS upozornění",
    marketingEmails: "Marketingové e-maily",
};
/**
 * Pole, která se mají ignorovat při porovnání změn
 */
const ignoredFields = [
    "updatedAt",
    "createdAt",
    "rating",
    "totalReviews",
    "ratingBreakdown",
    "recentReviews",
    "totalAds",
    "activeAds",
    "totalViews",
    "totalContacts",
    "balance",
    "plan",
    "planName",
    "planUpdatedAt",
    "planPeriodStart",
    "planPeriodEnd",
    "planDurationDays",
    "planCancelAt",
    "planExpiredAt",
    "planExpiredProcessedAt",
    "firstName",
    "lastName",
    "birthDate",
];
/**
 * Formátuje hodnotu pro zobrazení v emailu
 */
function formatValue(value) {
    if (value === null || value === undefined)
        return "—";
    if (typeof value === "boolean")
        return value ? "Ano" : "Ne";
    if (typeof value === "object") {
        if (value.companyName || value.ico) {
            // Je to company objekt
            const parts = [];
            if (value.companyName)
                parts.push(value.companyName);
            if (value.ico)
                parts.push(`IČO: ${value.ico}`);
            if (value.dic)
                parts.push(`DIČ: ${value.dic}`);
            if (value.address)
                parts.push(value.address);
            if (value.phone)
                parts.push(value.phone);
            return parts.join(", ") || "—";
        }
        return JSON.stringify(value);
    }
    return String(value);
}
/**
 * Porovná dva objekty a vrátí změněná pole
 */
function getChangedFields(before, after) {
    const changes = [];
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
        if (ignoredFields.includes(key))
            continue;
        const oldVal = before[key];
        const newVal = after[key];
        // Porovnání hodnot
        const oldStr = JSON.stringify(oldVal);
        const newStr = JSON.stringify(newVal);
        if (oldStr !== newStr) {
            changes.push({
                field: key,
                label: fieldLabels[key] || key,
                oldValue: oldVal,
                newValue: newVal,
            });
        }
    }
    return changes;
}
/**
 * Generuje HTML šablonu emailu o změně údajů
 */
function generateProfileChangeEmailHTML(userName, changes) {
    const changesHTML = changes.map((change) => `
    <tr>
      <td style="padding: 12px 15px; border-bottom: 1px solid #f0f0f0;">
        <strong style="color: #1a1a2e;">${change.label}</strong>
      </td>
      <td style="padding: 12px 15px; border-bottom: 1px solid #f0f0f0; color: #6b7280; text-decoration: line-through;">
        ${formatValue(change.oldValue)}
      </td>
      <td style="padding: 12px 15px; border-bottom: 1px solid #f0f0f0; color: #22c55e; font-weight: 600;">
        ${formatValue(change.newValue)}
      </td>
    </tr>
  `).join("");
    return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Změna údajů - Bulldogo.cz</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; min-height: 100vh;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ffffff;">
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%); border-radius: 24px; box-shadow: 0 25px 80px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05); overflow: hidden;">
                
                <!-- Oranžový header pruh -->
                <tr>
                  <td style="background: linear-gradient(90deg, #ff6a00 0%, #ffa62b 50%, #fcd34d 100%); height: 8px;"></td>
                </tr>
                
                <!-- Ikona -->
                <tr>
                  <td align="center" style="padding: 40px 0 20px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 50%; width: 100px; height: 100px; text-align: center; line-height: 100px; box-shadow: 0 10px 30px rgba(255, 166, 43, 0.3);">
                          <span style="font-size: 50px;">🔐</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Pozdrav -->
                <tr>
                  <td align="center" style="padding: 0 40px 20px 40px;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #1a1a2e; line-height: 1.3;">
                      Změna údajů v účtu
                    </h1>
                  </td>
                </tr>
                
                <!-- Hlavní text -->
                <tr>
                  <td align="center" style="padding: 0 40px 30px 40px;">
                    <p style="margin: 0 0 20px 0; font-size: 18px; line-height: 1.7; color: #4a5568;">
                      Ahoj, <strong style="color: #ff6a00;">${userName}</strong>!
                    </p>
                    <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #718096;">
                      Ve vašem účtu na <strong>Bulldogo.cz</strong> byly právě provedeny následující změny:
                    </p>
                  </td>
                </tr>
                
                <!-- Tabulka změn -->
                <tr>
                  <td style="padding: 0 40px 30px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden;">
                      <tr style="background: linear-gradient(90deg, #f8f9fa 0%, #f3f4f6 100%);">
                        <th style="padding: 15px; text-align: left; font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Položka</th>
                        <th style="padding: 15px; text-align: left; font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Původní</th>
                        <th style="padding: 15px; text-align: left; font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Nové</th>
                      </tr>
                      ${changesHTML}
                    </table>
                  </td>
                </tr>
                
                <!-- Varování -->
                <tr>
                  <td style="padding: 0 40px 30px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 16px; border: 1px solid #fecaca;">
                      <tr>
                        <td style="padding: 20px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 24px;">⚠️</span>
                              </td>
                              <td>
                                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #991b1b;">
                                  <strong>Neprovedli jste tuto změnu?</strong><br>
                                  Pokud jste tyto změny neprovedli vy, okamžitě nás kontaktujte na 
                                  <a href="mailto:support@bulldogo.cz" style="color: #dc2626; font-weight: 600;">support@bulldogo.cz</a> 
                                  nebo na tel. <a href="tel:+420605121023" style="color: #dc2626; font-weight: 600;">+420 605 121 023</a>.
                                  Doporučujeme také změnit heslo k vašemu účtu.
                                </p>
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
                          <a href="https://bulldogo.cz/profile-settings.html" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">
                            ZKONTROLOVAT NASTAVENÍ →
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
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                „Služby jednoduše. Pro každého."
              </p>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #4a5568;">
                <a href="https://bulldogo.cz" style="color: #ff6a00; text-decoration: none;">bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="mailto:support@bulldogo.cz" style="color: #ff6a00; text-decoration: none;">support@bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="tel:+420605121023" style="color: #ff6a00; text-decoration: none;">+420 605 121 023</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
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
 * Firebase Firestore Trigger - Odešle email při změně údajů v profilu
 */
exports.sendProfileChangeEmail = functions
    .region("europe-west1")
    .firestore.document("users/{userId}/profile/profile")
    .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const userId = context.params.userId;
    // Získej změněná pole
    const changes = getChangedFields(beforeData, afterData);
    // Pokud nejsou žádné relevantní změny, neposílej email
    if (changes.length === 0) {
        functions.logger.debug("Žádné relevantní změny v profilu", { userId });
        return null;
    }
    // Získej email uživatele
    const email = afterData.email;
    if (!email) {
        functions.logger.warn("Uživatel nemá email, přeskakuji odeslání emailu o změně", { userId });
        return null;
    }
    // Získej jméno uživatele
    let userName = "uživateli";
    if (afterData.firstName) {
        userName = afterData.firstName;
    }
    else if (afterData.name && afterData.name !== "Uživatel" && afterData.name !== "Firma") {
        userName = afterData.name.split(" ")[0];
    }
    else if (afterData.companyName) {
        userName = afterData.companyName;
    }
    const mailOptions = {
        from: {
            name: "BULLDOGO",
            address: "info@bulldogo.cz",
        },
        to: email,
        subject: "🔐 Změna údajů ve vašem účtu - Bulldogo.cz",
        html: generateProfileChangeEmailHTML(userName, changes),
        text: `Ahoj ${userName}!\n\nVe vašem účtu na Bulldogo.cz byly právě provedeny následující změny:\n\n${changes.map((c) => `${c.label}: ${formatValue(c.oldValue)} → ${formatValue(c.newValue)}`).join("\n")}\n\nPokud jste tyto změny neprovedli vy, okamžitě nás kontaktujte na support@bulldogo.cz nebo na tel. +420 605 121 023.\n\n© 2025 BULLDOGO`,
    };
    try {
        await smtpTransporter.sendMail(mailOptions);
        functions.logger.info("✅ Email o změně údajů úspěšně odeslán", {
            userId,
            email,
            changedFields: changes.map((c) => c.field),
        });
        return null;
    }
    catch (error) {
        functions.logger.error("❌ Chyba při odesílání emailu o změně údajů", {
            userId,
            email,
            error: error === null || error === void 0 ? void 0 : error.message,
        });
        return null;
    }
});
/**
 * Generuje HTML šablonu emailu o nové zprávě v chatu
 */
function generateNewMessageEmailHTML(recipientName, senderName, listingTitle, messageText) {
    const listingSection = listingTitle ? `
    <tr>
      <td style="padding: 0 40px 20px 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #fff8eb 0%, #fff3e0 100%); border-radius: 12px; border: 1px solid #ffe0b2;">
          <tr>
            <td style="padding: 15px;">
              <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: 600;">
                <span style="margin-right: 8px;">📋</span> K inzerátu:
              </p>
              <p style="margin: 8px 0 0 0; font-size: 16px; color: #1a1a2e; font-weight: 700;">
                ${listingTitle}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  ` : "";
    // Zkrátit zprávu pokud je moc dlouhá
    const truncatedMessage = messageText.length > 500
        ? messageText.substring(0, 500) + "..."
        : messageText;
    return `
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nová zpráva - Bulldogo.cz</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; min-height: 100vh;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #ffffff;">
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%); border-radius: 24px; box-shadow: 0 25px 80px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05); overflow: hidden;">
                
                <!-- Oranžový header pruh -->
                <tr>
                  <td style="background: linear-gradient(90deg, #ff6a00 0%, #ffa62b 50%, #fcd34d 100%); height: 8px;"></td>
                </tr>
                
                <!-- Ikona -->
                <tr>
                  <td align="center" style="padding: 40px 0 20px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); border-radius: 50%; width: 100px; height: 100px; text-align: center; line-height: 100px; box-shadow: 0 10px 30px rgba(255, 166, 43, 0.3);">
                          <span style="font-size: 50px;">💬</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Pozdrav -->
                <tr>
                  <td align="center" style="padding: 0 40px 20px 40px;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #1a1a2e; line-height: 1.3;">
                      Nová zpráva
                    </h1>
                  </td>
                </tr>
                
                <!-- Hlavní text -->
                <tr>
                  <td align="center" style="padding: 0 40px 25px 40px;">
                    <p style="margin: 0; font-size: 18px; line-height: 1.7; color: #4a5568;">
                      Ahoj, <strong style="color: #ff6a00;">${recipientName}</strong>!
                    </p>
                    <p style="margin: 10px 0 0 0; font-size: 16px; line-height: 1.7; color: #718096;">
                      Uživatel <strong style="color: #1a1a2e;">${senderName}</strong> ti poslal novou zprávu.
                    </p>
                  </td>
                </tr>
                
                <!-- Inzerát (pokud existuje) -->
                ${listingSection}
                
                <!-- Zpráva -->
                <tr>
                  <td style="padding: 0 40px 30px 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f8f9fa; border-radius: 16px; border: 1px solid #e5e7eb;">
                      <tr>
                        <td style="padding: 20px;">
                          <p style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">
                            Zpráva:
                          </p>
                          <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #1a1a2e; white-space: pre-wrap;">
                            ${truncatedMessage}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- CTA tlačítko -->
                <tr>
                  <td align="center" style="padding: 0 40px 30px 40px;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background: linear-gradient(135deg, #ff6a00 0%, #ffa62b 100%); border-radius: 12px; box-shadow: 0 8px 25px rgba(255, 106, 0, 0.35);">
                          <a href="https://bulldogo.cz/chat.html" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; letter-spacing: 0.5px;">
                            ODPOVĚDĚT →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Info o vypnutí -->
                <tr>
                  <td align="center" style="padding: 0 40px 40px 40px;">
                    <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.5;">
                      Tato oznámení můžete vypnout v 
                      <a href="https://bulldogo.cz/profile-settings.html" style="color: #ff6a00; text-decoration: none;">nastavení účtu</a>.
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 40px 20px 20px 20px;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                „Služby jednoduše. Pro každého."
              </p>
              <p style="margin: 0 0 20px 0; font-size: 13px; color: #4a5568;">
                <a href="https://bulldogo.cz" style="color: #ff6a00; text-decoration: none;">bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="mailto:support@bulldogo.cz" style="color: #ff6a00; text-decoration: none;">support@bulldogo.cz</a> &nbsp;|&nbsp;
                <a href="tel:+420605121023" style="color: #ff6a00; text-decoration: none;">+420 605 121 023</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
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
 * Firebase Firestore Trigger - Odešle email při nové zprávě v chatu
 */
exports.sendNewMessageEmail = functions
    .region("europe-west1")
    .firestore.document("chats/{chatId}/messages/{messageId}")
    .onCreate(async (snap, context) => {
    var _a;
    const db = admin.firestore();
    const messageData = snap.data();
    const chatId = context.params.chatId;
    const senderUid = messageData.fromUid;
    const messageText = messageData.text || "";
    // Pokud zpráva nemá text (jen obrázky), upravíme text
    const displayText = messageText || (((_a = messageData.images) === null || _a === void 0 ? void 0 : _a.length) > 0 ? "📷 Obrázek" : "");
    if (!displayText) {
        functions.logger.debug("Zpráva nemá obsah, přeskakuji email", { chatId });
        return null;
    }
    try {
        // Načíst chat dokument pro získání účastníků a info o inzerátu
        const chatDoc = await db.doc(`chats/${chatId}`).get();
        if (!chatDoc.exists) {
            functions.logger.warn("Chat dokument neexistuje", { chatId });
            return null;
        }
        const chatData = chatDoc.data();
        const participants = chatData.participants || [];
        const listingTitle = chatData.listingTitle || null;
        // Najít příjemce (druhý účastník)
        const recipientUid = participants.find((p) => p !== senderUid);
        if (!recipientUid) {
            functions.logger.warn("Nelze najít příjemce zprávy", { chatId, senderUid });
            return null;
        }
        // Načíst profil příjemce pro email a jméno
        const recipientProfileDoc = await db.doc(`users/${recipientUid}/profile/profile`).get();
        if (!recipientProfileDoc.exists) {
            functions.logger.warn("Profil příjemce neexistuje", { recipientUid });
            return null;
        }
        const recipientProfile = recipientProfileDoc.data();
        const recipientEmail = recipientProfile.email;
        // Kontrola, zda má uživatel povolené notifikace o nových zprávách
        if (recipientProfile.chatNotifications === false) {
            functions.logger.debug("Příjemce má vypnuté notifikace o nových zprávách", { recipientUid });
            return null;
        }
        if (!recipientEmail) {
            functions.logger.warn("Příjemce nemá email", { recipientUid });
            return null;
        }
        // Získat jméno příjemce
        let recipientName = "uživateli";
        if (recipientProfile.firstName) {
            recipientName = recipientProfile.firstName;
        }
        else if (recipientProfile.name && recipientProfile.name !== "Uživatel" && recipientProfile.name !== "Firma") {
            recipientName = recipientProfile.name.split(" ")[0];
        }
        else if (recipientProfile.companyName) {
            recipientName = recipientProfile.companyName;
        }
        // Načíst profil odesílatele pro jméno
        let senderName = "Někdo";
        try {
            const senderProfileDoc = await db.doc(`users/${senderUid}/profile/profile`).get();
            if (senderProfileDoc.exists) {
                const senderProfile = senderProfileDoc.data();
                if (senderProfile.firstName && senderProfile.lastName) {
                    senderName = `${senderProfile.firstName} ${senderProfile.lastName}`;
                }
                else if (senderProfile.name && senderProfile.name !== "Uživatel" && senderProfile.name !== "Firma") {
                    senderName = senderProfile.name;
                }
                else if (senderProfile.companyName) {
                    senderName = senderProfile.companyName;
                }
            }
        }
        catch (e) {
            functions.logger.debug("Nelze načíst profil odesílatele", { senderUid });
        }
        const mailOptions = {
            from: {
                name: "BULLDOGO",
                address: "info@bulldogo.cz",
            },
            to: recipientEmail,
            subject: `💬 Nová zpráva od ${senderName} - Bulldogo.cz`,
            html: generateNewMessageEmailHTML(recipientName, senderName, listingTitle, displayText),
            text: `Ahoj ${recipientName}!\n\nUživatel ${senderName} ti poslal novou zprávu${listingTitle ? ` k inzerátu "${listingTitle}"` : ""}.\n\nZpráva:\n${displayText}\n\nOdpověz na: https://bulldogo.cz/chat.html\n\n© 2025 BULLDOGO`,
        };
        await smtpTransporter.sendMail(mailOptions);
        functions.logger.info("✅ Email o nové zprávě odeslán", {
            recipientUid,
            recipientEmail,
            senderUid,
            senderName,
            chatId,
        });
        return null;
    }
    catch (error) {
        functions.logger.error("❌ Chyba při odesílání emailu o nové zprávě", {
            chatId,
            error: error === null || error === void 0 ? void 0 : error.message,
        });
        return null;
    }
});
/**
 * Firebase Auth Trigger - Odešle uvítací email při vytvoření nového uživatele
 */
exports.sendWelcomeEmail = functions
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
    }
    catch (error) {
        functions.logger.error("❌ Chyba při odesílání uvítacího emailu", {
            uid: user.uid,
            email: email,
            error: error === null || error === void 0 ? void 0 : error.message,
            code: error === null || error === void 0 ? void 0 : error.code
        });
        // Neházíme chybu, aby se registrace nedostala do chybového stavu
        return null;
    }
});
/**
 * Firebase Function - Nastaví admin status pro uživatele
 * Použití: POST s { uid: "user-uid" } nebo GET s ?uid=user-uid
 */
exports.setAdminStatus = functions.region("europe-west1").https.onRequest(async (req, res) => {
    return corsHandler(req, res, async () => {
        var _a, _b, _c;
        try {
            if (req.method !== "POST" && req.method !== "GET") {
                res.status(405).json({ error: "Method not allowed. Use POST or GET." });
                return;
            }
            const uid = req.method === "POST" ? (((_a = req.body) === null || _a === void 0 ? void 0 : _a.uid) || ((_b = req.body) === null || _b === void 0 ? void 0 : _b.userId)) : (_c = req.query) === null || _c === void 0 ? void 0 : _c.uid;
            if (!uid || typeof uid !== "string") {
                res.status(400).json({ error: "Missing or invalid uid parameter" });
                return;
            }
            const db = admin.firestore();
            const profileRef = db.collection("users").doc(uid).collection("profile").doc("profile");
            // Nastavit admin status
            await profileRef.set({
                isAdmin: true,
                role: "admin",
                adminSetAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            functions.logger.info("✅ Admin status nastaven", { uid });
            res.status(200).json({
                success: true,
                message: "Admin status successfully set",
                uid: uid,
            });
        }
        catch (error) {
            functions.logger.error("❌ Chyba při nastavování admin statusu", {
                error: error === null || error === void 0 ? void 0 : error.message,
                stack: error === null || error === void 0 ? void 0 : error.stack,
            });
            res.status(500).json({
                error: "Failed to set admin status",
                message: error === null || error === void 0 ? void 0 : error.message,
            });
        }
    });
});
//# sourceMappingURL=index.js.map