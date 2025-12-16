// Packages functionality
let selectedPlan = null;
// Zpřístupnit globálně pro GoPay integraci
window.selectedPlan = selectedPlan;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    initializePackages();
    initializeAuthState();
    // Po načtení stránky vyčkej na Firebase a načti stav balíčku
    (function waitAndLoadPlan(){
        if (window.firebaseAuth && window.firebaseDb) {
            loadCurrentPlan();
        } else {
            setTimeout(waitAndLoadPlan, 100);
        }
    })();
    // Zpracování návratu ze Stripe Checkout (?payment=success|canceled)
    (function handleStripeReturn(){
        try {
            const params = new URLSearchParams(window.location.search);
            const status = params.get('payment');
            if (!status) return;
            // Vyčistit URL
            try { window.history.replaceState({}, document.title, window.location.pathname); } catch (_) {}
            if (status === 'success') {
                // Po návratu ze Stripe: synchronizuj plán z extension (customers/{uid}/subscriptions)
                (async () => {
                    try {
                        await syncPlanFromStripeSubscription();
                    } catch (e) {
                        console.warn('syncPlanFromStripeSubscription failed:', e);
                    } finally {
                        showSuccess();
                        // Případně znovu načti manage UI
                        try { loadCurrentPlan(); } catch (_) {}
                    }
                })();
            } else if (status === 'canceled') {
                showMessage("Platba byla zrušena.", "error");
                // Vrátit tlačítko do původního stavu
                const payButton = document.querySelector('.payment-actions .btn-primary');
                if (payButton) {
                    payButton.innerHTML = '<i class="fas fa-credit-card"></i> Zaplatit';
                    payButton.disabled = false;
                }
            }
        } catch (e) {
            console.error('handleStripeReturn error:', e);
        }
    })();
});

// Sync plánu do users/{uid}/profile/profile podle Stripe subscription (Firebase Extension)
async function syncPlanFromStripeSubscription() {
    // Čekej na Firebase
    if (!window.firebaseAuth || !window.firebaseDb) return;
    const user = window.firebaseAuth.currentUser;
    if (!user) return;

    const { collection, query, where, getDocs, setDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    // Najdi aktivní nebo trial subscription
    const subsQ = query(
        collection(window.firebaseDb, 'customers', user.uid, 'subscriptions'),
        where('status', 'in', ['trialing', 'active'])
    );
    const subsSnap = await getDocs(subsQ);
    if (subsSnap.empty) {
        console.warn('No active/trialing subscription found for user', user.uid);
        return;
    }

    // Vezmi nejnovější (když je jich víc, vyber podle created/current_period_end)
    const subs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    subs.sort((a, b) => {
        const aT = (a.current_period_end?.seconds || a.created?.seconds || 0);
        const bT = (b.current_period_end?.seconds || b.created?.seconds || 0);
        return bT - aT;
    });
    const sub = subs[0];

    // Zjisti priceId ze subscription (extension dává buď price, nebo items/prices)
    const getFirstPriceId = (s) => {
        if (typeof s.price === 'string') return s.price;
        if (s.price?.id) return s.price.id;
        const item0 = Array.isArray(s.items) ? s.items[0] : null;
        if (item0?.price) {
            if (typeof item0.price === 'string') return item0.price;
            if (item0.price.id) return item0.price.id;
        }
        if (Array.isArray(s.prices) && s.prices[0]) return s.prices[0];
        return null;
    };
    const subPriceId = getFirstPriceId(sub);

    // Mapování: porovnej s aktuálními priceId pro hobby/business (dynamicky z products/prices)
    let hobbyPriceId = null;
    let businessPriceId = null;
    try {
        hobbyPriceId = await resolveStripePriceIdForPlan('hobby');
        businessPriceId = await resolveStripePriceIdForPlan('business');
    } catch (_) {}

    let planId = null;
    if (subPriceId && hobbyPriceId && subPriceId === hobbyPriceId) planId = 'hobby';
    if (subPriceId && businessPriceId && subPriceId === businessPriceId) planId = 'business';

    // Fallback: podle názvu produktu v sub (pokud je tam)
    if (!planId) {
        const name = (sub?.product?.name || sub?.items?.[0]?.price?.product?.name || '').toString().toLowerCase();
        if (name.includes('hobby')) planId = 'hobby';
        if (name.includes('firma')) planId = 'business';
    }
    if (!planId) {
        console.warn('Unable to map subscription to plan. subPriceId=', subPriceId);
        return;
    }

    const planName = planId === 'business' ? 'Firma' : 'Hobby uživatel';
    const now = new Date();
    // Stripe timestamps bývají v sekundách
    const cps = sub.current_period_start?.seconds ? new Date(sub.current_period_start.seconds * 1000) : now;
    const cpe = sub.current_period_end?.seconds ? new Date(sub.current_period_end.seconds * 1000) : null;

    await setDoc(
        doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile'),
        {
            plan: planId,
            planName,
            planUpdatedAt: now,
            planPeriodStart: cps,
            planPeriodEnd: cpe || null,
            planCancelAt: null
        },
        { merge: true }
    );

    // cache + badge
    try { localStorage.setItem('bdg_plan', planId); } catch (_) {}
    try {
        if (typeof window.applySidebarBadge === 'function') window.applySidebarBadge(planId);
    } catch (_) {}
}

function initializePackages() {
    console.log('🚀 Initializing packages');
    
    // Add event listeners to pricing buttons
    document.querySelectorAll('.btn-pricing').forEach(button => {
        button.addEventListener('click', function() {
            const plan = this.getAttribute('data-plan');
            const price = this.getAttribute('data-price');
            selectPlan(plan, price);
        });
    });
}

function selectPlan(plan, price) {
    selectedPlan = {
        plan: plan,
        price: parseInt(price)
    };
    // Zpřístupnit globálně pro GoPay integraci
    window.selectedPlan = selectedPlan;

    console.log('📦 Selected plan:', plan, 'Price:', price);

    // Show payment section
    showPayment();
}

function showPayment() {
    document.getElementById('paymentSection').style.display = 'block';
    document.querySelector('.top-ads-pricing').style.display = 'none';
    
    // Update payment summary
    updatePaymentSummary();
    
    // Scroll to payment
    document.getElementById('paymentSection').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

function hidePayment() {
    document.getElementById('paymentSection').style.display = 'none';
    document.querySelector('.top-ads-pricing').style.display = 'block';
    
    // Scroll to pricing
    document.querySelector('.top-ads-pricing').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

function updatePaymentSummary() {
    if (!selectedPlan) return;
    
    // Stripe (Firebase Extension) – zobrazení informací bez GoPay konfigurace
    let planTitle = '';
    let planType = '';
    let price = 0;
    switch(selectedPlan.plan) {
        case 'hobby':
            planTitle = 'Hobby uživatel';
            planType = 'První měsíc zdarma, poté 49 Kč/měsíc';
            price = 49;
            break;
        case 'business':
            planTitle = 'Firma';
            planType = 'Měsíční předplatné';
            price = 149;
            break;
    }
    
    document.getElementById('selectedPlanTitle').textContent = planTitle;
    document.getElementById('selectedPlanType').textContent = planType;
    
    if (selectedPlan.plan === 'hobby' && selectedPlan.price === 0) {
        document.getElementById('totalPrice').textContent = 'První měsíc zdarma';
    } else {
        document.getElementById('totalPrice').textContent = price + ' Kč/měsíc';
    }
}

async function processPayment() {
    // Kontrola výběru plánu
    if (!window.selectedPlan || !window.selectedPlan.plan) {
        showMessage("Prosím nejdříve vyberte balíček", "error");
        return;
    }
    // Kontrola přihlášení
    const user = window.firebaseAuth && window.firebaseAuth.currentUser;
    if (!user) {
        showMessage("Pro pokračování se prosím přihlaste.", "error");
        try { if (typeof window.showAuthModal === 'function') window.showAuthModal('login'); } catch (_) {}
        return;
    }
    // Mapování Stripe Price IDs (nahraďte skutečnými ID z Stripe)
    const STRIPE_PRICE_IDS = {
        hobby: "price_1Sf26X1aQBd6ajy2BPS7ioTv",
        business: "price_1Sf26s1aQBd6ajy2a5mNNLst"
    };
    // Pokus o dynamické zjištění priceId z Firestore (funguje v TEST i LIVE módu)
    async function resolveStripePriceIdForPlan(plan) {
        try {
            if (!window.firebaseDb) return null;
            const PRODUCT_NAME_BY_PLAN = {
                hobby: 'Hobby balíček',
                business: 'Firma balíček'
            };
            const targetName = PRODUCT_NAME_BY_PLAN[plan];
            if (!targetName) return null;
            const { getDocs, collection, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const productsQ = query(
                collection(window.firebaseDb, 'products'),
                where('active', '==', true),
                where('name', '==', targetName)
            );
            const productsSnap = await getDocs(productsQ);
            if (productsSnap.empty) return null;
            const prodDoc = productsSnap.docs[0];
            const pricesSnap = await getDocs(collection(prodDoc.ref, 'prices'));
            // Najdi aktivní recurring cenu
            for (const priceDoc of pricesSnap.docs) {
                const p = priceDoc.data() || {};
                if (p.active && p.type === 'recurring') {
                    return priceDoc.id; // price_...
                }
            }
            return null;
        } catch (_) {
            return null;
        }
    }
    const planId = window.selectedPlan.plan;
    // 1) Zkusit dynamicky — pokud existují produkty/prices synchronizované z test/live Stripe
    let priceId = await resolveStripePriceIdForPlan(planId);
    // 2) Fallback na pevně zadané IDs (typicky LIVE)
    if (!priceId) priceId = STRIPE_PRICE_IDS[planId];
    if (!priceId) {
        showMessage("Chybí Stripe cena pro vybraný balíček.", "error");
        return;
    }
    // UI: loading
    const payButton = document.querySelector('.payment-actions .btn-primary');
    const originalText = payButton ? payButton.innerHTML : null;
    if (payButton) {
        payButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Přesměrovávám...';
        payButton.disabled = true;
    }
    try {
        const { addDoc, collection, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const successUrl = `${window.location.origin}/packages.html?payment=success`;
        const cancelUrl = `${window.location.origin}/packages.html?payment=canceled`;
        // Připravit data pro Checkout Session – Stripe (Firebase Extension)
        const sessionData = {
            price: priceId,
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl
        };
        // Nastavit 30denní trial pro Hobby
        if (planId === 'hobby') {
            sessionData.trial_period_days = 30;
        }
        // Vytvořit Checkout Session dokument
        const checkoutRef = await addDoc(
            collection(window.firebaseDb, 'customers', user.uid, 'checkout_sessions'),
            sessionData
        );
        // Čekat na URL bez realtime listeneru (Safari často blokuje Listen/channel)
        const startedAt = Date.now();
        const timeoutMs = 60_000;
        const pollMs = 700;
        const poll = async () => {
            try {
                const snap = await getDoc(checkoutRef);
                const data = snap.data() || {};
                const url = data.url;
                const error = data.error;
                if (error) {
                    console.error('Stripe checkout error:', error);
                    showMessage(`Chyba při vytváření platby: ${error.message || 'zkuste to prosím znovu.'}`, "error");
                    if (payButton && originalText) {
                        payButton.innerHTML = originalText;
                        payButton.disabled = false;
                    }
                    return true; // stop
                }
                if (url) {
                    window.location.assign(url);
                    return true; // stop
                }
            } catch (e) {
                console.error('Stripe checkout poll error:', e);
            }
            return (Date.now() - startedAt) > timeoutMs;
        };
        const t = setInterval(async () => {
            const stop = await poll();
            if (stop) clearInterval(t);
        }, pollMs);
    } catch (error) {
        console.error('❌ Stripe checkout error:', error);
        showMessage("Nepodařilo se vytvořit platbu. Zkuste to prosím znovu.", "error");
        if (payButton && originalText) {
            payButton.innerHTML = originalText;
            payButton.disabled = false;
        }
    }
}

async function showSuccess() {
    document.getElementById('paymentSection').style.display = 'none';
    document.getElementById('successSection').style.display = 'block';
    
    // Scroll to success
    document.getElementById('successSection').scrollIntoView({ 
        behavior: 'smooth' 
    });

    // Zapsat plán do Firestore profilu uživatele (users/{uid}/profile/profile) - zdroj pravdy
    try {
        const user = window.firebaseAuth && window.firebaseAuth.currentUser;
        if (user && window.firebaseDb && selectedPlan && selectedPlan.plan) {
            const { setDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const now = new Date();
            const durationDays = 30; // měsíční předplatné
            const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
            
            console.log('💾 Ukládám balíček do databáze:', selectedPlan.plan);
            await setDoc(
                doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile'),
                { plan: selectedPlan.plan, planUpdatedAt: now, planPeriodStart: now, planPeriodEnd: periodEnd, planDurationDays: durationDays, planCancelAt: null },
                { merge: true }
            );
            console.log('✅ Balíček úspěšně uložen do databáze');
            
            // Volitelně synchronizovat do localStorage pouze pro zobrazení odznaku (cache)
            try {
                localStorage.setItem('bdg_plan', selectedPlan.plan);
            } catch (_) {}
        }
    } catch (e) {
        console.error('❌ Uložení plánu do Firestore selhalo:', e);
        showMessage('Nepodařilo se uložit balíček. Zkuste to prosím znovu.', 'error');
    }
}

function resetPackages() {
    // Reset all selections
    selectedPlan = null;
    window.selectedPlan = null;
    
    // Hide all sections except pricing
    document.getElementById('paymentSection').style.display = 'none';
    document.getElementById('successSection').style.display = 'none';
    document.querySelector('.top-ads-pricing').style.display = 'block';
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Ruční aktualizace odznaku po aktivaci balíčku (pro případ, že UI neodchytí změnu okamžitě)
async function refreshBadge() {
    try {
        const user = window.firebaseAuth && window.firebaseAuth.currentUser;
        if (!user) { showAuthModal('login'); return; }
        if (!window.firebaseDb) return;
        
        // Kontrola balíčku přímo z databáze (použít globální funkci pokud existuje)
        let plan = null;
        if (typeof window.checkUserPlanFromDatabase === 'function') {
            plan = await window.checkUserPlanFromDatabase(user.uid);
        } else {
            // Fallback: načíst přímo z databáze
            const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const ref = doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile');
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const data = snap.data();
                plan = data.plan || null;
                // Kontrola, zda je balíček aktivní
                if (plan) {
                    const planPeriodEnd = data.planPeriodEnd ? (data.planPeriodEnd.toDate ? data.planPeriodEnd.toDate() : new Date(data.planPeriodEnd)) : null;
                    if (planPeriodEnd && new Date() >= planPeriodEnd) {
                        plan = null;
                    }
                }
            }
        }
        
        // Volitelně synchronizovat do localStorage pro cache (zobrazení odznaku)
        if (plan) {
            try { localStorage.setItem('bdg_plan', plan); } catch (_) {}
        } else {
            try { localStorage.removeItem('bdg_plan'); } catch (_) {}
        }
        
        // Vložit/aktualizovat odznak v tlačítku Profil
        const userProfileSection = document.getElementById('userProfileSection');
        const btnProfile = userProfileSection && userProfileSection.querySelector('.btn-profile');
        if (btnProfile) {
            const old = btnProfile.querySelector('.user-badge');
            if (old) old.remove();
            const badge = document.createElement('span');
            const label = plan === 'business' ? 'Firma' : plan === 'hobby' ? 'Hobby' : '?';
            const cls = plan === 'business' ? 'badge-business' : plan === 'hobby' ? 'badge-hobby' : 'badge-unknown';
            badge.className = 'user-badge ' + cls;
            badge.textContent = label;
            btnProfile.appendChild(badge);
        }
        // krátká zpráva
        alert('Odznak aktualizován' + (plan ? `: ${plan}` : ''));
    } catch (e) {
        console.error('❌ refreshBadge:', e);
        alert('Nepodařilo se aktualizovat odznak');
    }
}

// Načíst aktuální balíček a aktualizovat manage UI
async function loadCurrentPlan() {
    try {
        const user = window.firebaseAuth && window.firebaseAuth.currentUser;
        const pPlan = document.getElementById('currentPlan');
        const pEnd = document.getElementById('currentPlanEnd');
        const pCancel = document.getElementById('currentPlanCancelAt');
        const cancelInfo = document.getElementById('cancelInfo');
        const btnCancel = document.getElementById('btnCancelPlan');
        const btnUndo = document.getElementById('btnUndoCancel');
        if (!user || !window.firebaseDb || !pPlan) return;
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const ref = doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile');
        const snap = await getDoc(ref);
        let plan = 'none', planPeriodEnd = null, planCancelAt = null;
        if (snap.exists()) {
            const data = snap.data();
            plan = data.plan || 'none';
            planPeriodEnd = data.planPeriodEnd ? (data.planPeriodEnd.toDate ? data.planPeriodEnd.toDate() : new Date(data.planPeriodEnd)) : null;
            planCancelAt = data.planCancelAt ? (data.planCancelAt.toDate ? data.planCancelAt.toDate() : new Date(data.planCancelAt)) : null;
        }
        const planLabel = plan === 'business' ? 'Firma' : plan === 'hobby' ? 'Hobby' : 'Žádný';
        pPlan.textContent = planLabel;
        pEnd.textContent = planPeriodEnd ? planPeriodEnd.toLocaleDateString('cs-CZ') : '-';
        if (planCancelAt) {
            cancelInfo.style.display = '';
            pCancel.textContent = planCancelAt.toLocaleDateString('cs-CZ');
            if (btnCancel) btnCancel.style.display = 'none';
            if (btnUndo) btnUndo.style.display = '';
        } else {
            cancelInfo.style.display = 'none';
            if (btnCancel) btnCancel.style.display = plan === 'none' ? 'none' : '';
            if (btnUndo) btnUndo.style.display = 'none';
        }
    } catch (e) {
        console.error('❌ loadCurrentPlan:', e);
    }
}

// Naplánovat zrušení k datu konce období
async function cancelPlan() {
    try {
        const user = window.firebaseAuth && window.firebaseAuth.currentUser;
        if (!user || !window.firebaseDb) return;
        const { getDoc, setDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const ref = doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile');
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const data = snap.data();
        const end = data.planPeriodEnd ? (data.planPeriodEnd.toDate ? data.planPeriodEnd.toDate() : new Date(data.planPeriodEnd)) : null;
        if (!end) { alert('Nelze určit konec období.'); return; }
        await setDoc(ref, { planCancelAt: end }, { merge: true });
        alert('Zrušení balíčku naplánováno k: ' + end.toLocaleDateString('cs-CZ'));
        loadCurrentPlan();
    } catch (e) {
        console.error('❌ cancelPlan:', e);
        alert('Nepodařilo se naplánovat zrušení');
    }
}

// Zrušit naplánované zrušení
async function undoCancel() {
    try {
        const user = window.firebaseAuth && window.firebaseAuth.currentUser;
        if (!user || !window.firebaseDb) return;
        const { setDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const ref = doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile');
        await setDoc(ref, { planCancelAt: null }, { merge: true });
        alert('Zrušení bylo odebráno');
        loadCurrentPlan();
    } catch (e) {
        console.error('❌ undoCancel:', e);
        alert('Nepodařilo se zrušit naplánované zrušení');
    }
}

// Auth modal – používej přímo globální implementaci z auth.js (bez stínění názvu)
function callAuthModal(type) {
	if (typeof window.showAuthModal === 'function') {
		window.showAuthModal(type || 'login');
	}
}

function closeAuthModal() {
    if (window.closeAuthModal) window.closeAuthModal();
}

// Bezpečnostní guardy – tyto prvky vytváří až auth.js
window.addEventListener('click', function(event) {
    const modal = document.getElementById('authModal');
    if (modal && event.target === modal) {
        closeAuthModal();
    }
});

const authFormEl = document.getElementById('authForm');
if (authFormEl) {
    authFormEl.addEventListener('submit', function(e) { e.preventDefault(); });
}

const switchBtnEl = document.querySelector('.auth-switch-btn');
if (switchBtnEl) {
    switchBtnEl.addEventListener('click', function() {
        const type = this.getAttribute('data-type');
        callAuthModal(type);
    });
}

// Chat link handling with auth check
document.querySelectorAll('a[href="chat.html"]').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        checkAuthForChat();
    });
});

function checkAuthForChat() {
    // Check if user is authenticated
    if (window.firebaseAuth) {
        window.firebaseAuth.onAuthStateChanged((user) => {
            if (user) {
                // User is logged in, allow access to chat
                window.location.href = 'chat.html';
            } else {
                // User is not logged in, show auth modal
                callAuthModal('login');
            }
        });
    } else {
        // Firebase not loaded yet, show auth modal
        callAuthModal('login');
    }
}
