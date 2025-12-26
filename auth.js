// Auth.js - Firebase Authentication funkcionality

// Debug: Zkontrolovat, jestli se auth.js načítá
console.log('🔧 Auth.js: Soubor se načítá na stránce:', window.location.pathname);
console.log('🔧 Auth.js: Čas načtení:', new Date().toLocaleTimeString());

// Globální proměnné
let authCurrentUser = null;
let firebaseAuth = null;
let firebaseDb = null;
let recaptchaVerifier = null; // invisible reCAPTCHA instance for phone auth
let phoneConfirmationResult = null; // result holder after sending SMS

// Diagnostická funkce pro kontrolu reCAPTCHA konfigurace
async function checkRecaptchaConfig() {
    console.log('🔍 Kontrola konfigurace reCAPTCHA...');
    
    const checks = {
        firebaseAuth: false,
        firebaseDb: false,
        recaptchaContainer: false,
        recaptchaVerifier: false,
        phoneAuth: false
    };
    
    try {
        // 1. Kontrola Firebase Auth
        if (window.firebaseAuth || firebaseAuth) {
            checks.firebaseAuth = true;
            console.log('✅ Firebase Auth je dostupný');
        } else {
            console.error('❌ Firebase Auth není dostupný');
        }
        
        // 2. Kontrola Firebase DB
        if (window.firebaseDb || firebaseDb) {
            checks.firebaseDb = true;
            console.log('✅ Firebase DB je dostupný');
        } else {
            console.error('❌ Firebase DB není dostupný');
        }
        
        // 3. Kontrola reCAPTCHA kontejneru
        const container = document.getElementById('recaptcha-container');
        if (container) {
            checks.recaptchaContainer = true;
            console.log('✅ reCAPTCHA kontejner existuje v DOM');
        } else {
            console.error('❌ reCAPTCHA kontejner neexistuje v DOM');
        }
        
        // 4. Pokus o vytvoření reCAPTCHA verifieru (test)
        if (checks.firebaseAuth) {
            try {
                const auth = window.firebaseAuth || firebaseAuth;
                const authMod = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
                const { RecaptchaVerifier } = authMod;
                
                const testContainer = document.getElementById('recaptcha-container');
                if (testContainer) {
                    // Vytvořit testovací verifier (nepoužijeme ho, jen ověříme, že to funguje)
                    const testVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                        size: 'invisible',
                        callback: () => {},
                        'expired-callback': () => {}
                    });
                    checks.recaptchaVerifier = true;
                    console.log('✅ reCAPTCHA Verifier lze vytvořit');
                    
                    // Okamžitě vyčistit testovací verifier
                    try { await testVerifier.clear(); } catch (_) {}
                }
            } catch (err) {
                console.error('❌ Nelze vytvořit reCAPTCHA Verifier:', err);
                console.error('   Důvod:', err.message);
            }
        }
        
        // 5. Kontrola Firebase konfigurace
        if (checks.firebaseAuth) {
            const auth = window.firebaseAuth || firebaseAuth;
            const config = auth.app.options;
            console.log('📋 Firebase konfigurace:');
            console.log('   Project ID:', config.projectId);
            console.log('   Auth Domain:', config.authDomain);
            console.log('   API Key:', config.apiKey ? 'nastaven' : 'chybí');
            
            if (config.projectId === 'inzerio-inzerce') {
                checks.phoneAuth = true;
                console.log('✅ Projekt ID odpovídá očekávané hodnotě');
            } else {
                console.warn('⚠️ Projekt ID neodpovídá očekávané hodnotě:', config.projectId);
            }
        }
        
        // Shrnutí
        console.log('\n📊 Shrnutí kontroly reCAPTCHA:');
        console.log('   Firebase Auth:', checks.firebaseAuth ? '✅' : '❌');
        console.log('   Firebase DB:', checks.firebaseDb ? '✅' : '❌');
        console.log('   reCAPTCHA kontejner:', checks.recaptchaContainer ? '✅' : '❌');
        console.log('   reCAPTCHA Verifier:', checks.recaptchaVerifier ? '✅' : '❌');
        console.log('   Firebase konfigurace:', checks.phoneAuth ? '✅' : '⚠️');
        
        const allPassed = Object.values(checks).every(v => v === true);
        if (allPassed) {
            console.log('\n✅ Všechny kontroly prošly! reCAPTCHA by měla fungovat.');
        } else {
            console.log('\n⚠️ Některé kontroly selhaly. Zkontrolujte Firebase Console.');
            console.log('📖 Pro více informací otevřete: RECAPTCHA_CONFIG_CHECK.md');
        }
        
        return checks;
    } catch (error) {
        console.error('❌ Chyba při kontrole reCAPTCHA konfigurace:', error);
        return checks;
    }
}

// Exportovat funkci globálně pro použití v konzoli
window.checkRecaptchaConfig = checkRecaptchaConfig;

// Diagnostická funkce pro kontrolu Phone Authentication nastavení
async function checkPhoneAuthConfig() {
    console.log('🔍 Kontrola Phone Authentication konfigurace...');
    console.log('');
    console.log('⚠️ Tato kontrola vyžaduje manuální ověření v Firebase Console:');
    console.log('');
    console.log('1. Firebase Console → Authentication → Sign-in method');
    console.log('   ✅ Phone musí být ENABLED');
    console.log('');
    console.log('2. Klikněte na Phone (telefonní ikona) a zkontrolujte:');
    console.log('   ✅ Phone number sign-in musí být Enabled');
    console.log('   ✅ reCAPTCHA by měla být automaticky nakonfigurovaná');
    console.log('');
    console.log('3. Firebase Console → Authentication → Settings → Authorized domains');
    console.log('   ✅ Musí obsahovat: localhost');
    console.log('');
    console.log('4. Google Cloud Console → APIs & Services → Enabled APIs');
    console.log('   ✅ Identity Toolkit API musí být povoleno');
    console.log('');
    console.log('📖 Pro více informací otevřete: RECAPTCHA_CONFIG_CHECK.md');
    console.log('');
    
    // Zkusit zjistit, zda můžeme testovat phone auth
    if (window.firebaseAuth || firebaseAuth) {
        const auth = window.firebaseAuth || firebaseAuth;
        console.log('✅ Firebase Auth je připraven pro telefonní autentifikaci');
        console.log('   Project ID:', auth.app.options.projectId);
        console.log('   Auth Domain:', auth.app.options.authDomain);
    } else {
        console.error('❌ Firebase Auth není dostupný');
    }
}

window.checkPhoneAuthConfig = checkPhoneAuthConfig;
console.log('💡 Pro kontrolu reCAPTCHA konfigurace zadejte: checkRecaptchaConfig()');
console.log('💡 Pro kontrolu Phone Auth nastavení zadejte: checkPhoneAuthConfig()');

// Funkce pro inicializaci auth po načtení Firebase
function initializeAuthWithFirebase() {
    if (window.firebaseAuth && window.firebaseDb) {
        console.log('✅ Firebase již dostupný');
        firebaseAuth = window.firebaseAuth;
        firebaseDb = window.firebaseDb;
        initAuth();
        return true;
    }
    return false;
}

// Inicializace po načtení Firebase
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 Auth.js: DOMContentLoaded spuštěn');
    
    // Okamžitě zkusit získat Firebase
    if (initializeAuthWithFirebase()) {
        return; // Firebase je připraven, pokračujeme
    }
    
    console.log('⏳ Čekám na Firebase...');
    
    // Deklarovat proměnné před použitím
    let checkFirebase = null;
    
    // Funkce pro vyčištění listenerů a intervalů
    const cleanup = () => {
        if (checkFirebase) {
            clearInterval(checkFirebase);
            checkFirebase = null;
        }
        window.removeEventListener('firebaseReady', onFirebaseReady);
    };
    
    // Poslouchat event 'firebaseReady' pokud je dostupný
    const onFirebaseReady = () => {
        console.log('📢 Obdržen event firebaseReady');
        if (initializeAuthWithFirebase()) {
            cleanup();
        }
    };
    
    if (typeof window.addEventListener !== 'undefined') {
        window.addEventListener('firebaseReady', onFirebaseReady);
        
        // Poslouchat také na chybové eventy
        window.addEventListener('firebaseError', (event) => {
            console.error('❌ Firebase Error event obdržen:', event.detail);
            cleanup();
            const errorMsg = event.detail?.message || 'Nepodařilo se načíst Firebase.';
            showMessage(`Chyba: ${errorMsg} Obnovte stránku.`, 'error');
        });
    }
    
    // Také pravidelně kontrolovat (fallback)
    checkFirebase = setInterval(() => {
        console.log('🔍 Kontroluji Firebase:', {
            firebaseReady: !!window.firebaseReady,
            firebaseAuth: !!window.firebaseAuth,
            firebaseDb: !!window.firebaseDb,
            firebaseError: !!window.firebaseError
        });
        
        // Pokud byl nastaven error, zobrazit chybu a přestat kontrolovat
        if (window.firebaseError) {
            console.error('❌ Firebase má error:', window.firebaseError);
            cleanup();
            const errorMsg = window.firebaseError?.message || 'Nepodařilo se načíst Firebase.';
            showMessage(`Chyba: ${errorMsg} Obnovte stránku.`, 'error');
            return;
        }
        
        if (initializeAuthWithFirebase()) {
            cleanup();
        }
    }, 100);
    
    // Timeout po 15 sekundách (zvýšeno z 10)
    setTimeout(() => {
        if (!firebaseAuth || !firebaseDb) {
            console.error('❌ Firebase se nenačetl během 15 sekund!');
            console.error('❌ Stav Firebase:', {
                firebaseReady: !!window.firebaseReady,
                firebaseAuth: !!window.firebaseAuth,
                firebaseDb: !!window.firebaseDb,
                firebaseApp: !!window.firebaseApp
            });
            cleanup();
            showMessage('Chyba: Firebase se nenačetl. Obnovte stránku.', 'error');
        }
    }, 15000);
});

// Univerzální delegovaný handler pro otevření auth modalu na všech stránkách
document.addEventListener('click', (e) => {
    const target = e.target.closest(
        '.btn-login, .btn-register, ' +                 // standardní tlačítka
        '[data-open-auth], [data-auth], ' +            // datové atributy
        '[onclick*="showAuthModal"], ' +               // inline onclick fallback
        'a[href="#login"], a[href="#register"]'        // hashové odkazy
    );
    if (!target) return;
    try {
        const isLogin =
            target.classList?.contains?.('btn-login') ||
            target.getAttribute?.('data-open-auth') === 'login' ||
            target.getAttribute?.('data-auth') === 'login' ||
            (target.getAttribute?.('onclick') || '').includes("showAuthModal('login'") ||
            (target.getAttribute?.('href') || '') === '#login';
        const isRegister =
            target.classList?.contains?.('btn-register') ||
            target.getAttribute?.('data-open-auth') === 'register' ||
            target.getAttribute?.('data-auth') === 'register' ||
            (target.getAttribute?.('onclick') || '').includes("showAuthModal('register'") ||
            (target.getAttribute?.('href') || '') === '#register';
        if (isLogin) {
            e.preventDefault();
            e.stopPropagation();
            try {
                showAuthModal('login');
            } catch (err) {
                console.error('showAuthModal(login) selhalo, zkouším fallback:', err);
                try {
                    if (!document.getElementById('authModal')) createAuthModal();
                    setTimeout(() => {
                        try { showAuthModal('login'); } catch (_) {}
                    }, 0);
                } catch (_) {}
            }
        } else if (isRegister) {
            e.preventDefault();
            e.stopPropagation();
            try {
                showAuthModal('register');
            } catch (err) {
                console.error('showAuthModal(register) selhalo, zkouším fallback:', err);
                try {
                    if (!document.getElementById('authModal')) createAuthModal();
                    setTimeout(() => {
                        try { showAuthModal('register'); } catch (_) {}
                    }, 0);
                } catch (_) {}
            }
        }
    } catch (_) {}
});

// Redundantní přímé navázání – kdyby delegace nestačila (některé podstránky)
function bindAuthOpeners(root = document) {
    const sel = '.btn-login, .btn-register, [data-open-auth], [data-auth], a[href="#login"], a[href="#register"]';
    root.querySelectorAll(sel).forEach(el => {
        if (el.dataset.authBound === '1') return;
        el.addEventListener('click', (e) => {
            const href = el.getAttribute('href') || '';
            const dataOpen = el.getAttribute('data-open-auth') || el.getAttribute('data-auth') || '';
            const isLogin = el.classList.contains('btn-login') || href === '#login' || dataOpen === 'login';
            const isRegister = el.classList.contains('btn-register') || href === '#register' || dataOpen === 'register';
            if (isLogin || isRegister) {
                e.preventDefault();
                e.stopPropagation();
                showAuthModal(isLogin ? 'login' : 'register');
            }
        }, { passive: false });
        el.dataset.authBound = '1';
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Přímé navázání po načtení
    try { bindAuthOpeners(document); } catch (_) {}
    // Sledovat přidávání prvků dynamicky
    const mo = new MutationObserver((muts) => {
        muts.forEach(m => {
            m.addedNodes?.forEach?.(node => {
                if (node.nodeType === 1) {
                    try { bindAuthOpeners(node); } catch (_) {}
                }
            });
        });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
});

// Inicializace autentifikace
function initAuth() {
    console.log('🔧 Inicializuji auth s Firebase:', { firebaseAuth: !!firebaseAuth, firebaseDb: !!firebaseDb });
    
    // Import Firebase funkcí dynamicky
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js').then(({ onAuthStateChanged }) => {
        console.log('✅ Firebase Auth modul načten');
        
        // DEV bypass pro reCAPTCHA – pouze na lokálu (nikoliv na vercel.app)
        try {
            const isDevHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            const isProd = location.hostname.endsWith('bulldogo.cz');
            if (isDevHost && !isProd && firebaseAuth?.settings) {
                // Pozor: funguje jen s testovacími čísly definovanými v Firebase Console
                firebaseAuth.settings.appVerificationDisabledForTesting = true;
                console.log('⚙️ reCAPTCHA vypnuta pro vývoj (použijte testovací čísla ve Firebase Console) – pouze localhost.');
            }
        } catch (e) {
            console.warn('⚠️ Nepodařilo se nastavit appVerificationDisabledForTesting:', e?.message || e);
        }
        // Sledování stavu přihlášení
        onAuthStateChanged(firebaseAuth, (user) => {
            console.log('👤 Auth state changed:', user ? `Přihlášen: ${user.email}` : 'Odhlášen');
            console.log('👤 Auth state changed na stránce:', window.location.pathname);
            console.log('👤 Auth state changed v čase:', new Date().toLocaleTimeString());
            authCurrentUser = user;
            updateUI(user);
            
            // Zkontrolovat admin menu po změně auth stavu
            if (typeof window.checkAndShowAdminMenu === 'function') {
                setTimeout(() => window.checkAndShowAdminMenu(), 500);
            }
            
            // Zkontrolovat, zda existuje callback po přihlášení
            if (user && window.afterLoginCallback) {
                console.log('🔄 Spouštím callback po přihlášení');
                window.afterLoginCallback();
                // Vyčistit callback
                window.afterLoginCallback = null;
            }
        });
    }).catch(error => {
        console.error('❌ Chyba při načítání Firebase Auth:', error);
    });
    
    // Inicializace výběru typu registrace
    setupRegistrationTypeSelection();
    
    // Nastavení event listenerů
    setupEventListeners();
    
    // Debug: Zkontrolovat elementy po načtení
    setTimeout(() => {
        const personForm = document.querySelector('.person-form');
        const companyForm = document.querySelector('.company-form');
        const typeButtons = document.querySelectorAll('.registration-type-btn');
        
        console.log('🔍 Debug po načtení DOM:', {
            personForm: personForm ? 'nalezen' : 'nenalezen',
            companyForm: companyForm ? 'nalezen' : 'nenalezen',
            typeButtons: typeButtons.length,
            personFormDisplay: personForm ? personForm.style.display : 'N/A',
            companyFormDisplay: companyForm ? companyForm.style.display : 'N/A'
        });
    }, 1000);
}

// Funkce pro zablokování/odblokování polí při firemní registraci
function toggleCompanyFormFields(disabled) {
    const companyNameEl = document.getElementById('companyName');
    const authEmailEl = document.getElementById('authEmail');
    const authPasswordEl = document.getElementById('authPassword');
    const authPhoneEl = document.getElementById('authPhone');
    const btnSendPhoneCode = document.getElementById('btnSendPhoneCode');
    
    if (companyNameEl) companyNameEl.disabled = disabled;
    if (authEmailEl) authEmailEl.disabled = disabled;
    if (authPasswordEl) authPasswordEl.disabled = disabled;
    if (authPhoneEl) authPhoneEl.disabled = disabled;
    if (btnSendPhoneCode) btnSendPhoneCode.disabled = disabled;
    
    // Visual feedback
    const style = disabled ? 'cursor: not-allowed; opacity: 0.6;' : 'cursor: auto; opacity: 1;';
    if (companyNameEl) companyNameEl.style.cssText = (companyNameEl.style.cssText.replace(/cursor:[^;]+;|opacity:[^;]+;/g, '')) + style;
    if (authEmailEl) authEmailEl.style.cssText = (authEmailEl.style.cssText.replace(/cursor:[^;]+;|opacity:[^;]+;/g, '')) + style;
    if (authPasswordEl) authPasswordEl.style.cssText = (authPasswordEl.style.cssText.replace(/cursor:[^;]+;|opacity:[^;]+;/g, '')) + style;
    if (authPhoneEl) authPhoneEl.style.cssText = (authPhoneEl.style.cssText.replace(/cursor:[^;]+;|opacity:[^;]+;/g, '')) + style;
}

// Nastavení výběru typu registrace
function setupRegistrationTypeSelection() {
    const typeButtons = document.querySelectorAll('.registration-type-btn');
    const personForm = document.querySelector('.person-form');
    const companyForm = document.querySelector('.company-form');
    
    console.log('🔧 Nastavuji registrační typy:', { typeButtons: typeButtons.length, personForm, companyForm });
    
    typeButtons.forEach(button => {
        button.addEventListener('click', () => {
            console.log('🖱️ Kliknuto na tlačítko:', button.getAttribute('data-type'));
            
            // Odstranit active třídu ze všech tlačítek
            typeButtons.forEach(btn => btn.classList.remove('active'));
            // Přidat active třídu na kliknuté tlačítko
            button.classList.add('active');
            
            const type = button.getAttribute('data-type');
            console.log('📝 Typ registrace:', type);
            
            if (type === 'person') {
                console.log('👤 Zobrazuji formulář pro fyzickou osobu');
                personForm.style.display = 'block';
                personForm.classList.remove('hidden');
                personForm.classList.add('visible');
                companyForm.style.display = 'none';
                companyForm.classList.add('hidden');
                companyForm.classList.remove('visible');
                // required přepínač
                toggleRequired(personForm, true);
                toggleRequired(companyForm, false);
                // Odblokovat všechna pole pro osobní registraci
                toggleCompanyFormFields(false);
                // Reset IČO verifikačního flagu
                window.__icoVerified = false;
                window.__icoVerifiedValue = null;
            } else if (type === 'company') {
                console.log('🏢 Zobrazuji formulář pro firmu');
                personForm.style.display = 'none';
                personForm.classList.add('hidden');
                personForm.classList.remove('visible');
                companyForm.style.display = 'block';
                companyForm.classList.remove('hidden');
                companyForm.classList.add('visible');
                // required přepínač
                toggleRequired(personForm, false);
                toggleRequired(companyForm, true);
                // Zablokovat všechna pole kromě IČO pole (dokud není IČO ověřeno)
                toggleCompanyFormFields(true);
                // Reset IČO verifikačního flagu
                window.__icoVerified = false;
                window.__icoVerifiedValue = null;
            }
            
            console.log('📊 Stav formulářů:', {
                personForm: {
                    display: personForm.style.display,
                    classes: personForm.className
                },
                companyForm: {
                    display: companyForm.style.display,
                    classes: companyForm.className
                }
            });
        });
    });
}

// Přepínání required atributů uvnitř kontejneru
function toggleRequired(container, isRequired) {
    if (!container) return;
    const inputs = container.querySelectorAll('input, select, textarea');
    inputs.forEach((el) => {
        if (isRequired) {
            if (el.getAttribute('data-optional') === 'true') {
                el.required = false;
            } else {
                el.required = true;
            }
        } else {
            el.required = false;
        }
    });
}

// Normalizace telefonního čísla do E.164 (+420123456789), odstranění mezer a 00 -> +
function normalizePhone(input) {
    const raw = (input || '').toString().trim().replace(/\s+/g, '');
    if (!raw) return '';
    if (raw.startsWith('00')) return '+' + raw.slice(2);
    if (raw.startsWith('+')) return raw;
    if (raw.startsWith('420')) return '+420' + raw.slice(3);
    return raw;
}

// Ověření, zda telefon ještě není použit v žádném profilu (users/*/profile/profile)
async function isPhoneAvailable(normalizedPhone) {
    if (!normalizedPhone) return false;
    try {
        const { getDocs, query, collectionGroup, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const q = query(collectionGroup(firebaseDb, 'profile'), where('phone', '==', normalizedPhone));
        const snap = await getDocs(q);
        return snap.empty;
    } catch (error) {
        // Pokud nemůžeme zkontrolovat kvůli oprávněním, vrátíme true (telefon je dostupný)
        // aby registrace mohla pokračovat - duplicitní telefon se zachytí při vytváření profilu
        console.warn('⚠️ Nelze ověřit dostupnost telefonu:', error.code || error.message);
        if (error.code === 'permission-denied') {
            // Při chybě oprávnění považujeme telefon za dostupný
            // (duplikace se zachytí při vytváření profilu)
            return true;
        }
        // U ostatních chyb také vrátíme true, aby registrace mohla pokračovat
        return true;
    }
}

// Normalizace IČO: ponechá jen číslice a omezí na 8 znaků (CZ IČO)
function normalizeICO(input) {
    const digits = (input || '').toString().replace(/\D+/g, '');
    return digits.slice(0, 8);
}

// Ověření IČO – preferuje Firebase Function proxy (CORS-safe), fallback na přímé HlídačStátu volání
async function validateICOWithARES(ico) {
    const n = normalizeICO(ico);
    if (n.length !== 8) return { ok: false, reason: 'IČO musí mít 8 číslic.' };
    try {
        // 0) Na Vercelu využij interní serverless proxy /api/validateICO (řeší CORS)
        const isVercel = location.hostname.endsWith('.vercel.app');
        if (isVercel) {
            try {
                // Explicitně použít správný název (s velkým I)
                const proxyUrl = `/api/validateICO?ico=${encodeURIComponent(n)}`;
                const proxyRes = await fetch(proxyUrl, { 
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                if (proxyRes.ok) {
                    const proxyData = await proxyRes.json().catch(() => ({}));
                    if (typeof proxyData?.ok === 'boolean') return proxyData;
                } else if (proxyRes.status === 503 || proxyRes.status === 404) {
                    // Pokud proxy selže, pokračovat na Firebase Function
                    console.warn('Vercel proxy failed, trying Firebase Function');
                }
            } catch (e) {
                console.warn('Vercel proxy error:', e);
            }
        }
        // 1) Zkusit volat Firebase Function (lokálně i v produkci)
        const projectId = (window.firebaseApp && window.firebaseApp.options && window.firebaseApp.options.projectId) || 'inzerio-inzerce';
        const regions = ['us-central1', 'europe-west1'];
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        // Nejprve emulator (us-central1) na localhostu
        if (isLocal) {
            try {
                const fnUrlLocal = `http://127.0.0.1:5001/${projectId}/us-central1/validateICO?ico=${encodeURIComponent(n)}`;
                const fnResLocal = await fetch(fnUrlLocal, { method: 'GET' });
                if (fnResLocal.ok) {
                    const dataLocal = await fnResLocal.json().catch(() => ({}));
                    if (typeof dataLocal?.ok === 'boolean') {
                        if (dataLocal.ok === false && /nedostupn/i.test(dataLocal.reason || '')) {
                            throw new Error('Emulator HlídačStátu nedostupný, zkouším produkci');
                        }
                        return dataLocal;
                    }
                }
            } catch (_) {}
        }
        // Poté produkce – zkus více regionů
        for (const r of regions) {
            try {
                const prodUrl = `https://${r}-${projectId}.cloudfunctions.net/validateICO?ico=${encodeURIComponent(n)}`;
                const prodRes = await fetch(prodUrl, { method: 'GET' });
                if (prodRes.ok) {
                    const prodData = await prodRes.json().catch(() => ({}));
                    if (typeof prodData?.ok === 'boolean') {
                        return prodData;
                    }
                }
            } catch (_) {}
        }

        // 2) Fallback: přímé HlídačStátu REST volání (může selhat na CORS v prohlížeči)
        // Tento fallback obvykle selže kvůli CORS, ale zkusíme to
        // POZOR: API token by neměl být v klientském kódu, ale pro testování ho můžeme použít
        try {
            const urlV2 = `https://api.hlidacstatu.cz/api/v2/firmy/ico/${n}`;
            const res = await fetch(urlV2, { 
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Token 36a6940d34774a5c90270f60ea73130b'
                }
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                // HlídačStátu API vrací FirmaDTO: { ico, jmeno, datoveSchranky, zalozena }
                if (data && data.ico && data.jmeno) {
                    return { ok: true, name: data.jmeno, seat: null };
                }
            }
        } catch (corsError) {
            // CORS error je očekávaný - prohlížeč blokuje přímé volání
            console.warn('Direct HlídačStátu call blocked by CORS (expected)');
        }
        
        // Pokud všechny metody selhaly, vrátit obecnou chybovou zprávu
        return { ok: false, reason: 'HlídačStátu je dočasně nedostupný. Zkuste to později.' };
    } catch (e) {
        return { ok: false, reason: 'HlídačStátu je dočasně nedostupný. Zkuste to později.' };
    }
}

// Registrace nového uživatele
async function register(email, password, userData) {
    try {
        console.log('📝 Pokus o registraci:', { email, userData, firebaseAuth: !!firebaseAuth, firebaseDb: !!firebaseDb });
        
        if (!firebaseAuth || !firebaseDb) {
            console.error('❌ Firebase není dostupný!', { firebaseAuth: !!firebaseAuth, firebaseDb: !!firebaseDb });
            showMessage('Chyba: Firebase není načten. Obnovte stránku.', 'error');
            return;
        }
        
        const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        const { addDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Kontrola unikátnosti telefonního čísla před vytvořením účtu
        const rawPhone = userData.phone || '';
        const normalizedPhone = normalizePhone(rawPhone);
        // Pokud jde o firmu, ověřit IČO přes HlídačStátu
        if (userData.type === 'company') {
            const icoCheck = await validateICOWithARES(userData.ico || '');
            if (!icoCheck.ok) {
                showMessage(icoCheck.reason || 'IČO se nepodařilo ověřit.', 'error');
                return;
            }
            // Volitelně doplnit obchodní název/sídlo z HlídačStátu
            if (!userData.companyName && icoCheck.name) {
                userData.companyName = icoCheck.name;
            }
            if (!userData.companyAddress && icoCheck.seat && icoCheck.seat.text) {
                userData.companyAddress = icoCheck.seat.text;
            }
        }
        if (!normalizedPhone) {
            showMessage('Telefon je povinný a musí být ve formátu +420...', 'error');
            return;
        }
        const available = await isPhoneAvailable(normalizedPhone);
        if (!available) {
            showMessage('Toto telefonní číslo je již používáno jiným účtem.', 'error');
            return;
        }
        
        const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        const user = userCredential.user;
        
        // Vytvořit root dokument uživatele a profil subdokument
        const { setDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await setDoc(doc(firebaseDb, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            createdAt: new Date(),
            userType: userData.type
        });
        
        // Vytvořit profil podle typu uživatele s rozšířenými informacemi
        const profileData = {
            email: user.email,
            balance: 1000,
            createdAt: new Date(),
            userType: userData.type,
            // Základní informace
            name: userData.firstName && userData.lastName ? `${userData.firstName} ${userData.lastName}` : (userData.companyName || 'Uživatel'),
            phone: normalizedPhone || null,
            city: userData.city || null,
            bio: userData.bio || null,
            // Obchodní informace
            businessName: userData.companyName || userData.businessName || null,
            businessType: userData.businessType || null,
            businessAddress: userData.companyAddress || userData.businessAddress || null,
            businessDescription: userData.businessDescription || null,
            // Předvolby
            emailNotifications: userData.emailNotifications !== false,
            smsNotifications: userData.smsNotifications === true,
            marketingEmails: userData.marketingEmails === true,
            // Hodnocení (prázdné při registraci)
            rating: 0,
            totalReviews: 0,
            ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
            recentReviews: [],
            // Statistiky
            totalAds: 0,
            activeAds: 0,
            totalViews: 0,
            totalContacts: 0
        };
        
        if (userData.type === 'person') {
            profileData.firstName = userData.firstName;
            profileData.lastName = userData.lastName;
            profileData.birthDate = userData.birthDate;
            profileData.name = `${userData.firstName} ${userData.lastName}`;
        } else if (userData.type === 'company') {
            profileData.name = userData.companyName || 'Firma';
            profileData.company = {
                companyName: userData.companyName || null,
                ico: normalizeICO(userData.ico || '') || null,
                dic: userData.dic || null,
                phone: normalizedPhone || null,
                address: userData.companyAddress || null
            };
        }
        
        await setDoc(doc(firebaseDb, 'users', user.uid, 'profile', 'profile'), profileData);

        // Manuálně aktualizovat UI po registraci
        console.log('🔄 Manuálně aktualizuji UI po registraci');
        updateUI(user);

        showMessage('Úspěšně jste se zaregistrovali!', 'success');
        closeAuthModal();
        return user;
    } catch (error) {
        handleAuthError(error);
    }
}

// Přihlášení uživatele
async function login(email, password) {
    try {
        console.log('🔐 Pokus o přihlášení:', { email, firebaseAuth: !!firebaseAuth });
        
        if (!firebaseAuth) {
            console.error('❌ Firebase Auth není dostupný!');
            showMessage('Chyba: Firebase není načten. Obnovte stránku.', 'error');
            return;
        }
        
        console.log('📦 Importuji Firebase Auth modul...');
        const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        console.log('✅ Firebase Auth modul načten');
        
        console.log('🔑 Volám signInWithEmailAndPassword...');
        const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
        console.log('✅ Přihlášení úspěšné:', userCredential.user);
        
        // Manuálně aktualizovat UI po přihlášení
        console.log('🔄 Manuálně aktualizuji UI po přihlášení');
        updateUI(userCredential.user);
        
        showMessage('Úspěšně jste se přihlásili!', 'success');
        closeAuthModal();
        return userCredential.user;
    } catch (error) {
        console.error('❌ Chyba při přihlašování:', error);
        console.error('❌ Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
        });
        handleAuthError(error);
    }
}

// Odhlášení uživatele
async function logout(options = {}) {
    try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        
        await signOut(firebaseAuth);
        showMessage('Úspěšně jste se odhlásili!', 'success');

        // Všude po webu po odhlášení přesměrovat na domovskou stránku
        const redirect = options && options.redirect !== undefined ? !!options.redirect : true;
        const redirectUrl = (options && options.redirectUrl) ? String(options.redirectUrl) : 'index.html';
        const delayMs = (options && typeof options.delayMs === 'number') ? options.delayMs : 250;
        if (redirect) {
            setTimeout(() => {
                try { window.location.href = redirectUrl; } catch (_) {}
            }, delayMs);
        }
    } catch (error) {
        handleAuthError(error);
    }
}

// Kontrola admin statusu uživatele
async function checkAdminStatus(user) {
    if (!user || !user.uid) return false;
    
    try {
        const db = firebaseDb || window.firebaseDb;
        if (!db) return false;
        
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Zkontrolovat profil uživatele pro admin flag
        const profileRef = doc(db, 'users', user.uid, 'profile', 'profile');
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            // Admin může být označen přes pole 'isAdmin' nebo 'role: admin'
            if (profileData.isAdmin === true || profileData.role === 'admin') {
                return true;
            }
        }
        
        // Fallback: kontrola přes email (pouze pro skutečné admin emaily)
        const adminEmails = ['admin@bulldogo.cz', 'support@bulldogo.cz'];
        if (user.email && adminEmails.includes(user.email.toLowerCase())) {
            return true;
        }
        
        // Poznámka: localStorage fallback byl odstraněn kvůli bezpečnosti
        // Admin práva se kontrolují pouze přes Firestore profil nebo admin emaily
        
        return false;
    } catch (error) {
        console.error('Chyba při kontrole admin statusu:', error);
        return false;
    }
}

// Aktualizace UI podle stavu přihlášení
async function updateUI(user) {
    console.log('🔄 Aktualizuji UI pro uživatele:', user ? user.email : 'Odhlášen');
    console.log('🔄 updateUI volána na stránce:', window.location.pathname);
    console.log('🔄 updateUI volána v čase:', new Date().toLocaleTimeString());
    
    const authSection = document.querySelector('.auth-section');
    const userProfileSection = document.querySelector('.user-profile-section');
    const adminSection = document.getElementById('adminSection');
    
    console.log('🔍 UI elementy:', { 
        authSection: !!authSection, 
        userProfileSection: !!userProfileSection,
        adminSection: !!adminSection,
        authSectionDisplay: authSection ? authSection.style.display : 'N/A',
        userProfileSectionDisplay: userProfileSection ? userProfileSection.style.display : 'N/A'
    });
    
    // Debug: Zkontrolovat všechny možné elementy
    const allAuthElements = document.querySelectorAll('[class*="auth"]');
    const allUserElements = document.querySelectorAll('[class*="user"]');
    console.log('🔍 Všechny auth elementy:', allAuthElements.length);
    console.log('🔍 Všechny user elementy:', allUserElements.length);
    
    if (user) {
        // Uživatel je přihlášen
        if (authSection) authSection.style.display = 'none';
        if (userProfileSection) {
            userProfileSection.style.display = 'block';
            
            // Zobrazit email v navbaru
            const userEmailSpan = userProfileSection.querySelector('.user-email');
            if (userEmailSpan) {
                userEmailSpan.textContent = user.email;
            }
            
            // Zobrazit jméno a email v dropdown menu
            const displayName = userProfileSection.querySelector('.user-display-name');
            const userEmail = userProfileSection.querySelector('.user-email');
            
            if (displayName && userEmail) {
                // Zkusit načíst jméno z Firestore
                loadUserProfile(user.uid).then(userProfile => {
                    if (userProfile && userProfile.name) {
                        displayName.textContent = userProfile.name;
                    } else {
                        // Pokud není jméno, použít část emailu před @
                        const emailName = user.email.split('@')[0];
                        displayName.textContent = emailName.charAt(0).toUpperCase() + emailName.slice(1);
                    }
                    
                    // Zobrazit zůstatek
                    const balanceAmount = document.querySelector('.balance-amount');
                    if (balanceAmount && userProfile) {
                        const balance = userProfile.balance || 0;
                        balanceAmount.textContent = `${balance.toLocaleString('cs-CZ')} Kč`;
                    }

                    // Kontrola balíčku z databáze pro zobrazení odznaku
                    try {
                        let activePlan = null;
                        if (userProfile && userProfile.plan) {
                            // Kontrola, zda je balíček aktivní
                            const end = userProfile.planPeriodEnd ? (userProfile.planPeriodEnd.toDate ? userProfile.planPeriodEnd.toDate() : new Date(userProfile.planPeriodEnd)) : null;
                            const cancelAt = userProfile.planCancelAt ? (userProfile.planCancelAt.toDate ? userProfile.planCancelAt.toDate() : new Date(userProfile.planCancelAt)) : null;
                            
                            // Pokud má zrušení naplánované a období skončilo, balíček není aktivní
                            if (cancelAt && end && new Date() >= end) {
                                // Aktualizovat databázi - odstranit plan
                                (async () => {
                                    try {
                                        const { setDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                                        await setDoc(doc(firebaseDb, 'users', user.uid, 'profile', 'profile'), { plan: null, planCancelAt: null }, { merge: true });
                                    } catch (_) {}
                                })();
                                activePlan = null;
                            } else if (end && new Date() >= end) {
                                // Období skončilo, balíček není aktivní
                                activePlan = null;
                            } else {
                                // Balíček je aktivní
                                activePlan = userProfile.plan;
                            }
                        }
                        
                        // Synchronizace do localStorage pouze pro zobrazení odznaku (volitelné)
                        if (activePlan) {
                            localStorage.setItem('bdg_plan', activePlan);
                        } else {
                            localStorage.removeItem('bdg_plan');
                        }
                    } catch (_) {}
                });
                userEmail.textContent = user.email;
            }

            // Odznak podle balíčku (hobby/firma/?) vedle tlačítka Profil - získat z databáze
            try {
                (async () => {
                    try {
                        const activePlan = await checkUserPlanFromDatabase(user.uid);
                        const btnProfile = userProfileSection.querySelector('.btn-profile');
                        if (btnProfile) {
                            const old = btnProfile.querySelector('.user-badge');
                            if (old) old.remove();
                            
                            if (activePlan) {
                                const badge = document.createElement('span');
                                const label = activePlan === 'business' ? 'Firma' : activePlan === 'hobby' ? 'Hobby' : '?';
                                const cls = activePlan === 'business' ? 'badge-business' : activePlan === 'hobby' ? 'badge-hobby' : 'badge-unknown';
                                badge.className = 'user-badge ' + cls;
                                badge.textContent = label;
                                btnProfile.appendChild(badge);
                            }
                        }
                    } catch (_) {}
                })();
            } catch (_) {}
        }
        
        // Zobrazit tlačítko pro přidání služby
        showAddServiceButton();
        
        // Kontrola admin statusu a zobrazení admin menu
        checkAdminStatus(user).then(isAdmin => {
            const adminSection = document.getElementById('adminSection');
            if (adminSection) {
                if (isAdmin) {
                    adminSection.style.display = 'block';
                    console.log('✅ Admin menu zobrazeno');
                } else {
                    adminSection.style.display = 'none';
                }
            }
        });
    } else {
        // Uživatel není přihlášen
        if (authSection) authSection.style.display = 'flex';
        if (userProfileSection) userProfileSection.style.display = 'none';
        
        // Skrýt admin menu
        const adminSection = document.getElementById('adminSection');
        if (adminSection) adminSection.style.display = 'none';
        
        hideAddServiceButton();
    }
}

// Zobrazení tlačítka pro přidání služby
function showAddServiceButton() {
    let addServiceBtn = document.querySelector('.add-service-btn');
    if (!addServiceBtn) {
        addServiceBtn = document.createElement('a');
        addServiceBtn.href = 'create-ad.html';
        addServiceBtn.className = 'btn btn-primary add-service-btn';
        addServiceBtn.innerHTML = '<i class="fas fa-plus"></i> Přidat službu';
        
        const heroButtons = document.querySelector('.hero-buttons');
        if (heroButtons) {
            heroButtons.appendChild(addServiceBtn);
        }
    }
}

// Skrytí tlačítka pro přidání služby
function hideAddServiceButton() {
    const addServiceBtn = document.querySelector('.add-service-btn');
    if (addServiceBtn) {
        addServiceBtn.remove();
    }
}

// Vytvoření auth modalu dynamicky
function createAuthModal() {
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    
    modal.innerHTML = `
		<div class="modal-content auth-with-hero">
			<div class="auth-hero-ledge">
				<img src="fotky/bulldogo-overlay.png" alt="Bulldogo" class="auth-dog-lean" aria-hidden="true">
				<div class="modal-header">
					<h2 class="modal-title">Přihlášení</h2>
					<span class="close" onclick="closeAuthModal()">&times;</span>
				</div>
			</div>
            <form id="authForm" class="auth-form">
                <!-- Výběr typu registrace (pouze při registraci) -->
                <div class="form-group registration-type" style="display: none;">
                    <label class="form-label">Typ registrace:</label>
                    <div class="registration-type-buttons">
                        <button type="button" class="registration-type-btn active" data-type="person">
                            <i class="fas fa-user"></i> Hobby (fyzická osoba)
                        </button>
                        <button type="button" class="registration-type-btn" data-type="company">
                            <i class="fas fa-building"></i> Firma
                        </button>
                    </div>
                </div>

                <!-- Formulář pro fyzickou osobu -->
                <div class="person-form" style="display: none;">
                    <div class="form-row two-col">
                        <div class="half">
                            <input type="text" id="firstName" name="firstName" placeholder="Jméno" required>
                        </div>
                        <div class="half">
                            <input type="text" id="lastName" name="lastName" placeholder="Příjmení" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <div class="date-inline">
                            <label for="birthDate">Datum narození</label>
                            <input type="date" id="birthDate" name="birthDate" required>
                        </div>
                    </div>
                </div>

                <!-- Formulář pro firmu -->
                <div class="company-form" style="display: none;">
                    <div class="form-group">
                        <div style="display:flex; gap:8px; align-items:center;">
                            <input type="text" id="ico" name="ico" placeholder="IČ" required style="flex:1;">
                            <button type="button" id="btnVerifyICO" class="btn" style="flex:1;">Ověřit</button>
                        </div>
                        <div id="icoStatus" style="font-size:13px; margin-top:4px; color:#6b7280;"></div>
                    </div>
                    <div class="form-group">
                        <input type="text" id="companyName" name="companyName" placeholder="Název firmy" required>
                    </div>
                    <!-- Telefon a e‑mail pro firmu se vyplňují níže ve společných polích -->
                </div>

                <!-- Společná pole -->
                <div class="form-group" id="groupAuthEmail" style="display: none;">
                    <input type="email" id="authEmail" name="email" placeholder="Email" required>
                </div>
                <div class="form-group">
                    <input type="password" id="authPassword" name="password" placeholder="Heslo" required>
                </div>
                <div class="form-row two-col" id="phoneRow">
                    <div class="half">
                        <input type="tel" id="authPhone" name="phone" placeholder="Telefon" required>
                    </div>
                    <div class="half" id="phoneRight">
                        <button type="button" id="btnSendPhoneCode" class="btn btn-secondary" style="display: none;">Odeslat SMS kód</button>
                        <input type="text" id="phoneCode" name="phoneCode" placeholder="Kód z SMS" inputmode="numeric" autocomplete="one-time-code" style="display: none;">
                    </div>
                </div>

                <div class="form-group">
                    <button type="submit" class="auth-submit-btn btn btn-primary">Přihlásit se</button>
                    <button type="button" id="btnAuthSubmit" class="btn btn-primary" style="display: none;">Dokončit registraci</button>
                </div>

                <div class="form-group">
                    <button type="button" class="auth-switch-btn btn btn-link">Nemáte účet? Zaregistrujte se</button>
                </div>
                
                <!-- Neviditelná reCAPTCHA pro ověření telefonu -->
                <div id="recaptcha-container" style="height:0; overflow:hidden;"></div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Resetovat flag při vytvoření nového modalu
    authModalEventsSetup = false;
    
    // Nastavit event listenery
    setupAuthModalEvents();
    
    return modal;
}

// Nastavení event listenerů pro auth modal
// Flag pro kontrolu, zda už byly listenery nastaveny
let authModalEventsSetup = false;

function setupAuthModalEvents() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    
    // Pokud už byly listenery nastaveny, neopakovat
    if (authModalEventsSetup) return;
    
    // Event listener pro zavírací tlačítko
    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        // Odstranit starý onclick atribut
        closeBtn.removeAttribute('onclick');
        // Odstranit všechny existující listenery (pokud existují)
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        // Přidat nový listener
        newCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAuthModal();
        });
    }
    
    // Event listener pro kliknutí na pozadí (overlay) - zavřít modal
    // Použít once: false, ale zkontrolovat, zda už není listener
    const handleModalClick = (e) => {
        if (e.target === modal) {
            closeAuthModal();
        }
    };
    // Odstranit starý listener, pokud existuje
    modal.removeEventListener('click', handleModalClick);
    modal.addEventListener('click', handleModalClick);
    
    // Event listener pro přepínání mezi přihlášením a registrací
    const authSwitchBtn = modal.querySelector('.auth-switch-btn');
    if (authSwitchBtn) {
        const handleSwitchClick = () => {
            const type = authSwitchBtn.getAttribute('data-type');
            showAuthModal(type);
        };
        authSwitchBtn.removeEventListener('click', handleSwitchClick);
        authSwitchBtn.addEventListener('click', handleSwitchClick);
    }
    
    // Event listener pro tlačítka typu registrace
    const typeButtons = modal.querySelectorAll('.registration-type-btn');
    typeButtons.forEach(btn => {
        const handleTypeClick = () => {
            typeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const type = btn.getAttribute('data-type');
            const personForm = modal.querySelector('.person-form');
            const companyForm = modal.querySelector('.company-form');
            
            if (type === 'person') {
                personForm.style.display = 'block';
                personForm.classList.add('visible');
                personForm.classList.remove('hidden');
                companyForm.style.display = 'none';
                companyForm.classList.add('hidden');
                companyForm.classList.remove('visible');
            } else {
                companyForm.style.display = 'block';
                companyForm.classList.add('visible');
                companyForm.classList.remove('hidden');
                personForm.style.display = 'none';
                personForm.classList.add('hidden');
                personForm.classList.remove('visible');
            }
        };
        btn.removeEventListener('click', handleTypeClick);
        btn.addEventListener('click', handleTypeClick);
    });
    
    // Event listener pro formulář - ODSTRANĚNO (přidává se v setupEventListeners)
    // Duplicitní listenery způsobovaly vícenásobné odesílání formuláře
    
    // Event listener pro tlačítko odeslání SMS kódu
    const btnSendPhoneCode = modal.querySelector('#btnSendPhoneCode');
    if (btnSendPhoneCode) {
        const handleSendCode = async () => {
            console.log('Odeslání SMS kódu');
        };
        btnSendPhoneCode.removeEventListener('click', handleSendCode);
        btnSendPhoneCode.addEventListener('click', handleSendCode);
    }
    
    authModalEventsSetup = true;
}

// Zobrazení auth modalu
function showAuthModal(type = 'login') {
    console.log('🔧 showAuthModal volána s typem:', type);
    let modal = document.getElementById('authModal');
    
    // Pokud modal neexistuje, vytvoř ho dynamicky
    if (!modal) {
        console.log('🔧 Modal neexistuje, vytvářím ho dynamicky');
        modal = createAuthModal();
    }
    
    const modalTitle = modal.querySelector('.modal-title');
    const submitBtn = modal.querySelector('.auth-submit-btn');
    const switchBtn = modal.querySelector('.auth-switch-btn');
    const registrationType = modal.querySelector('.registration-type');
    const personForm = modal.querySelector('.person-form');
    const companyForm = modal.querySelector('.company-form');
    
    console.log('🔍 Elementy nalezeny:', {
        modal: !!modal,
        modalTitle: !!modalTitle,
        submitBtn: !!submitBtn,
        switchBtn: !!switchBtn,
        registrationType: !!registrationType,
        personForm: !!personForm,
        companyForm: !!companyForm
    });

    const btnSendPhoneCode = modal.querySelector('#btnSendPhoneCode');
    const btnAuthSubmit = modal.querySelector('#btnAuthSubmit');
    const groupAuthEmail = modal.querySelector('#groupAuthEmail');
    const phoneRight = modal.querySelector('#phoneRight');
    const phoneCode = modal.querySelector('#phoneCode');
    const authEmail = modal.querySelector('#authEmail');
    const authPhone = modal.querySelector('#authPhone');
    const phoneRow = modal.querySelector('#phoneRow');

    if (type === 'login') {
        console.log('🔧 Nastavuji modal pro přihlášení');
        modal.setAttribute('data-mode', 'login');
        modalTitle.textContent = 'Přihlášení';
        submitBtn.textContent = 'Přihlásit se';
        switchBtn.textContent = 'Nemáte účet? Zaregistrujte se';
        switchBtn.setAttribute('data-type', 'register');
        registrationType.style.display = 'none';
        personForm.style.display = 'none';
        companyForm.style.display = 'none';
        // Přihlášení: e‑mail + heslo
        if (groupAuthEmail) { groupAuthEmail.style.display = ''; }
        if (authEmail) { authEmail.required = true; }
        
        // Odstranit required atribut ze skrytých polí při přihlášení
        toggleRequired(personForm, false);
        toggleRequired(companyForm, false);
        
        // Přepnout tlačítka a kroky
        if (btnSendPhoneCode) btnSendPhoneCode.style.display = 'none';
        if (btnAuthSubmit) btnAuthSubmit.style.display = 'none';
        if (submitBtn) submitBtn.style.display = '';
        // Skrytí telefonní řádky v přihlášení + zrušit required na telefonu
        if (authPhone) authPhone.required = false;
        if (phoneRow) phoneRow.style.display = 'none';
        if (phoneRight && phoneCode) phoneCode.style.display = 'none';

        console.log('✅ Modal nastaven pro přihlášení:', { 
            title: modalTitle.textContent, 
            submitBtn: submitBtn.textContent 
        });
    } else {
        modalTitle.textContent = 'Registrace';
        modal.setAttribute('data-mode', 'register');
        submitBtn.textContent = 'Zaregistrovat se';
        switchBtn.textContent = 'Již máte účet? Přihlaste se';
        switchBtn.setAttribute('data-type', 'login');
        registrationType.style.display = 'block';
        if (groupAuthEmail) { groupAuthEmail.style.display = ''; }
        if (authEmail) { authEmail.required = true; }
        
        // Zobrazit formulář pro fyzickou osobu jako výchozí
        personForm.style.display = 'block';
        personForm.classList.add('visible');
        personForm.classList.remove('hidden');
        companyForm.style.display = 'none';
        companyForm.classList.add('hidden');
        companyForm.classList.remove('visible');
        
        // Přepnout tlačítka a kroky
        if (btnSendPhoneCode) btnSendPhoneCode.style.display = '';
        if (btnAuthSubmit) btnAuthSubmit.style.display = 'none';
        // V režimu registrace primární submit "Zaregistrovat se" nepotřebujeme
        if (submitBtn) submitBtn.style.display = 'none';
        if (phoneRight) {
            if (phoneCode) phoneCode.style.display = 'none';
        }
        // Zobrazit telefonní řádku pro registraci + vyžadovat telefon
        if (authPhone) authPhone.required = true;
        if (phoneRow) phoneRow.style.display = '';
        if (authPhone && (!authPhone.value || authPhone.value.trim() === '')) {
            authPhone.value = '+420';
        }

        console.log('🎯 Inicializace registrace - výchozí stav:', {
            personForm: {
                display: personForm.style.display,
                classes: personForm.className
            },
            companyForm: {
                display: companyForm.style.display,
                classes: companyForm.className
            }
        });
        
        // Aktivovat tlačítko pro fyzickou osobu
        const typeButtons = document.querySelectorAll('.registration-type-btn');
        typeButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector('.registration-type-btn[data-type="person"]').classList.add('active');
    }

    // Nastavit event listenery jen pokud ještě nebyly nastaveny
    if (!authModalEventsSetup) {
        setupAuthModalEvents();
    }
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open'); // Přidat třídu pro CSS kontrolu
    
    // Po vytvoření/otevření modalu navěsit plné listenery (form submit, SMS krok)
    try { setupEventListeners(); } catch (e) { console.warn('setupEventListeners failed', e); }
    
    // Debug: Zkontrolovat formulář po otevření modalu a nastavit event listener
    setTimeout(() => {
        const authFormAfterOpen = modal.querySelector('#authForm');
        console.log('🔍 AuthForm po otevření modalu:', authFormAfterOpen ? 'NALEZEN' : 'NENALEZEN');
        console.log('🔍 AuthForm element po otevření:', authFormAfterOpen);
        if (authFormAfterOpen) {
            console.log('🔍 AuthForm ID po otevření:', authFormAfterOpen.id);
            console.log('🔍 AuthForm class po otevření:', authFormAfterOpen.className);
            
            // Nastavit event listener na formulář po otevření modalu
            console.log('🔧 Nastavuji event listener na formulář po otevření modalu');
            
            // Debug: Zkontrolovat, jestli už má event listener
            console.log('🔍 AuthForm má event listener:', authFormAfterOpen.onsubmit !== null);
            
            // ODSTRANĚNO: Duplicitní event listener - formulář už má listener v setupEventListeners()
            // Přidávání dalšího listeneru způsobovalo vícenásobné odesílání formuláře
        }
    }, 100);
}

// Zavření auth modalu
function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    document.body.classList.remove('modal-open'); // Odstranit třídu pro CSS kontrolu
    
    // Vyčištění formuláře
    const form = document.getElementById('authForm');
    if (form) {
        form.reset();
    }
}

// Export funkcí pro globální použití - ihned po definici
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.createAuthModal = createAuthModal;
window.setupAuthModalEvents = setupAuthModalEvents;

// Funkce pro kontrolu aktivního balíčku z databáze (globální)
window.checkUserPlanFromDatabase = async function(userId) {
    try {
        if (!userId || !window.firebaseDb) return null;
        
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const profileRef = doc(window.firebaseDb, 'users', userId, 'profile', 'profile');
        const snap = await getDoc(profileRef);
        
        if (!snap.exists()) return null;
        
        const data = snap.data();
        const plan = data.plan;
        
        // Pokud nemá balíček, vrátit null
        if (!plan || plan === 'none') return null;
        
        // Kontrola, zda je balíček aktivní (planPeriodEnd je v budoucnosti)
        const planPeriodEnd = data.planPeriodEnd ? (data.planPeriodEnd.toDate ? data.planPeriodEnd.toDate() : new Date(data.planPeriodEnd)) : null;
        const planCancelAt = data.planCancelAt ? (data.planCancelAt.toDate ? data.planCancelAt.toDate() : new Date(data.planCancelAt)) : null;
        
        // Pokud má zrušení naplánované a období skončilo, balíček není aktivní
        if (planCancelAt && planPeriodEnd && new Date() >= planPeriodEnd) {
            return null;
        }
        
        // Pokud je planPeriodEnd v minulosti, balíček už není aktivní
        if (planPeriodEnd && new Date() >= planPeriodEnd) {
            return null;
        }
        
        return plan;
    } catch (error) {
        console.error('Chyba při kontrole balíčku z databáze:', error);
        return null;
    }
};

// Export funkce pro globální použití
window.checkUserPlanFromDatabase = checkUserPlanFromDatabase;

// Zobrazení modalu pro přidání služby
async function showAddServiceModal() {
    // Gating: vyžaduje přihlášení a vybraný balíček
    const viewer = window.firebaseAuth?.currentUser;
    if (!viewer) {
        if (typeof window.showAuthRequiredModal === 'function') {
            window.showAuthRequiredModal();
        } else {
            showMessage('Pro přidání inzerátu se prosím přihlaste nebo registrujte.', 'error');
        }
        return;
    }
    
    // Kontrola balíčku přímo z databáze
    const plan = await checkUserPlanFromDatabase(viewer.uid);
    if (!plan) {
        // Nemá aktivní balíček – nasměrujeme na výběr balíčku
        showMessage('Nejdříve si vyberte balíček.', 'info');
        window.location.href = 'packages.html';
        return;
    }
    
    const modal = document.getElementById('addServiceModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Inicializace counteru pro popis inzerátu
    if (typeof initCharCounter === 'function') {
        setTimeout(() => {
            initCharCounter('serviceDescription', 'serviceDescriptionCounter', 600);
        }, 100);
    }
}

// Zavření modalu pro přidání služby
function closeAddServiceModal() {
    const modal = document.getElementById('addServiceModal');
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    
    // Vyčištění formuláře
    const form = document.getElementById('addServiceForm');
    form.reset();
    
    // Reset counteru
    const counter = document.getElementById('serviceDescriptionCounter');
    if (counter) {
        counter.textContent = '600';
        if (counter.parentElement) {
            counter.parentElement.classList.remove('warning', 'error');
        }
    }
}

// Export dalších funkcí
window.showAddServiceModal = showAddServiceModal;
window.closeAddServiceModal = closeAddServiceModal;

// Zpracování chyb autentifikace
function handleAuthError(error) {
    let message = 'Došlo k chybě při autentifikaci.';
    
    switch (error.code) {
        case 'auth/email-already-in-use':
            message = 'Tento email je již používán.';
            break;
        case 'auth/weak-password':
            message = 'Heslo je příliš slabé.';
            break;
        case 'auth/invalid-email':
            message = 'Neplatný email.';
            break;
        case 'auth/user-not-found':
            message = 'Uživatel s tímto emailem neexistuje.';
            break;
        case 'auth/wrong-password':
            message = 'Nesprávné heslo.';
            break;
        case 'auth/too-many-requests':
            message = 'Příliš mnoho pokusů. Zkuste to později.';
            break;
    }
    
    showMessage(message, 'error');
}

// Překlad běžných chyb phone auth do srozumitelných zpráv
function humanizePhoneError(error) {
    const code = error?.code || '';
    switch (code) {
        case 'auth/invalid-phone-number':
            return 'Neplatné telefonní číslo.';
        case 'auth/missing-phone-number':
            return 'Chybí telefonní číslo.';
        case 'auth/too-many-requests':
            return 'Příliš mnoho pokusů. Zkuste to později.';
        case 'auth/captcha-check-failed':
            return 'Ověření reCAPTCHA selhalo. Obnovte stránku a zkuste to znovu.';
        case 'auth/invalid-verification-code':
            return 'Neplatný kód z SMS.';
        case 'auth/code-expired':
            return 'Platnost kódu vypršela. Požádejte o nový.';
        case 'auth/quota-exceeded':
            return 'Byl překročen limit pro SMS. Zkuste to později.';
        case 'auth/invalid-app-credential':
            console.error('❌ Firebase telefonní autentifikace není správně nakonfigurovaná. Zkontrolujte:');
            console.error('1. Firebase Console → Authentication → Sign-in method → Phone musí být povoleno');
            console.error('2. Firebase Console → Authentication → Settings → Authorized domains musí obsahovat localhost');
            console.error('3. Zkontrolujte, že máte správný API klíč a projekt ID');
            return 'Telefonní ověření není správně nakonfigurované. Prosím zkontrolujte nastavení Firebase projektu. Pro více informací otevřete konzoli.';
        case 'auth/captcha-check-failed':
            return 'Ověření reCAPTCHA selhalo. Obnovte stránku a zkuste to znovu.';
        default:
            return error?.message || 'Došlo k chybě. Zkuste to znovu.';
    }
}

// Zobrazení zprávy (banner ve stylu pejska s gradientem)
function showMessage(message, type = 'info', options = {}) {
    console.log(`💬 Zobrazuji zprávu: ${message} (${type})`);
    const timeoutMs = typeof options.timeout === 'number' ? options.timeout : 5000;
    
    // Kontejner (pro snadné centrování a stacking)
    let host = document.getElementById('notice-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'notice-host';
        host.style.cssText = `
            position: fixed;
            top: 120px;
            right: 24px;
            left: auto;
            transform: none;
            z-index: 10050;
            width: min(90vw, 520px);
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: flex-end;
            pointer-events: none;
        `;
        document.body.appendChild(host);
    }
    
    const banner = document.createElement('div');
    banner.className = `notice-banner notice-${type}`;
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.pointerEvents = 'auto';
    banner.innerHTML = `
        <div class="notice-hero">
            <img src="fotky/bulldogo-overlay.png" alt="" aria-hidden="true">
        </div>
        <div class="notice-content">
            <strong class="notice-title">${message}</strong>
            <button class="notice-close" aria-label="Zavřít" title="Zavřít">×</button>
        </div>
    `;
    
    // Zavření
    const close = () => {
        try {
            banner.classList.add('closing');
            setTimeout(() => banner.remove(), 180);
        } catch (_) {
            banner.remove();
        }
    };
    banner.querySelector('.notice-close')?.addEventListener('click', close);
    if (timeoutMs > 0) setTimeout(close, timeoutMs);
    
    host.appendChild(banner);
}

// Helper funkce pro kontrolu aktivního předplatného
async function checkActiveSubscription(uid) {
    try {
        const db = firebaseDb || window.firebaseDb;
        if (!db) {
            console.error('❌ checkActiveSubscription: firebaseDb není dostupný');
            return { hasSubscription: false, plan: null, expired: false };
        }
        
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const profileRef = doc(db, 'users', uid, 'profile', 'profile');
        const profileSnap = await getDoc(profileRef);
        
        console.log('🔍 checkActiveSubscription pro uid:', uid, 'profil existuje:', profileSnap.exists());
        
        if (!profileSnap.exists()) {
            console.log('❌ Profil neexistuje - žádné předplatné');
            return { hasSubscription: false, plan: null, expired: false };
        }
        
        const profile = profileSnap.data();
        const plan = profile.plan; // 'hobby' nebo 'business'
        
        console.log('📋 Aktuální plán:', plan, 'planPeriodEnd:', profile.planPeriodEnd);
        
        if (!plan || (plan !== 'hobby' && plan !== 'business')) {
            console.log('❌ Žádný aktivní plán (plan =', plan, ')');
            return { hasSubscription: false, plan: null, expired: false };
        }
        
        // Zkontrolovat, zda předplatné nevypršelo
        const planPeriodEnd = profile.planPeriodEnd;
        if (planPeriodEnd) {
            const endDate = planPeriodEnd.toDate ? planPeriodEnd.toDate() : new Date(planPeriodEnd);
            console.log('📅 Datum vypršení:', endDate, 'Nyní:', new Date());
            if (endDate < new Date()) {
                console.log('❌ Předplatné vypršelo');
                return { hasSubscription: false, plan: plan, expired: true };
            }
        }
        
        console.log('✅ Předplatné aktivní');
        return { hasSubscription: true, plan: plan, expired: false };
    } catch (error) {
        console.error('❌ Chyba při kontrole předplatného:', error);
        return { hasSubscription: false, plan: null, expired: false };
    }
}

// Globálně dostupná funkce pro kontrolu předplatného
window.checkActiveSubscription = checkActiveSubscription;

// Přidání služby
async function addService(serviceData) {
    try {
        if (!authCurrentUser) {
            showMessage('Musíte být přihlášeni pro přidání služby.', 'error');
            return false;
        }

        const db = firebaseDb || window.firebaseDb;
        if (!db) {
            showMessage('Chyba: Databáze není dostupná.', 'error');
            return false;
        }

        const { addDoc, collection, setDoc, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const { ref, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');

        // Kontrola aktivního předplatného - POVINNÁ
        console.log('🔒 Kontroluji předplatné před přidáním inzerátu...');
        const subscriptionCheck = await checkActiveSubscription(authCurrentUser.uid);
        console.log('🔒 Výsledek kontroly:', subscriptionCheck);
        
        if (!subscriptionCheck.hasSubscription) {
            if (subscriptionCheck.expired) {
                showMessage('⚠️ Vaše předplatné vypršelo. Pro přidávání inzerátů si prosím obnovte balíček.', 'error');
            } else {
                showMessage('⚠️ Pro přidávání inzerátů potřebujete aktivní předplatné (Hobby nebo Firma).', 'error');
            }
            // Přesměrovat na stránku balíčků po 2 sekundách
            setTimeout(() => {
                window.location.href = 'packages.html';
            }, 2000);
            return false; // DŮLEŽITÉ: vrátit false pro zastavení
        }

        // Zkontrolovat, zda uživatel existuje, pokud ne, vytvořit ho
        const userRef = doc(db, 'users', authCurrentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            // Vytvořit root dokument uživatele
            await setDoc(userRef, {
                uid: authCurrentUser.uid,
                email: authCurrentUser.email,
                createdAt: new Date()
            });
            
            // Vytvořit profil uživatele
            await setDoc(doc(db, 'users', authCurrentUser.uid, 'profile', 'profile'), {
                name: authCurrentUser.email.split('@')[0],
                email: authCurrentUser.email,
                balance: 1000,
                createdAt: new Date()
            });
        }

        // Nahrát obrázky do Firebase Storage
        // Zkontrolovat, zda Storage je dostupné
        if (!window.firebaseApp) {
            throw new Error('Firebase App není inicializované');
        }
        
        // Použít globálně inicializované Storage (musí existovat z firebase-init.js)
        if (!window.firebaseStorage) {
            const { getStorage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
            window.firebaseStorage = getStorage(window.firebaseApp);
            console.log('✅ Vytvořil jsem novou Storage instanci');
        }
        
        const storage = window.firebaseStorage;
        const uploadedImages = [];
        
        const bucketName = window.firebaseApp?.options?.storageBucket;
        console.log('📦 Storage inicializace:', {
            app: !!window.firebaseApp,
            storage: !!storage,
            bucket: bucketName || 'default',
            storageUrl: storage?._delegate?._host || 'unknown'
        });
        
        // Kontrola, zda Storage bucket existuje
        if (!bucketName) {
            throw new Error('Storage bucket není nakonfigurovaný v Firebase konfiguraci');
        }
        
        // Debug: zkontrolovat Storage instance
        if (storage) {
            console.log('📦 Storage instance detaily:', {
                bucket: bucketName,
                host: storage?._delegate?._host,
                protocol: storage?._delegate?._protocol
            });
        }
        
        // Nahrát náhledový obrázek, nebo použít výchozí URL bez uploadu
        if (serviceData.previewImage) {
            try {
                console.log('📸 Nahrávám náhledový obrázek...', {
                    fileName: serviceData.previewImage.name,
                    fileSize: serviceData.previewImage.size,
                    fileType: serviceData.previewImage.type
                });
                const fileName = `services/${authCurrentUser.uid}/${Date.now()}_preview.jpg`;
                console.log('📍 Cesta k souboru:', fileName);
                const previewRef = ref(storage, fileName);
                console.log('📤 Začínám nahrávání...');
                const previewSnapshot = await uploadBytes(previewRef, serviceData.previewImage, {
                    contentType: serviceData.previewImage.type || 'image/jpeg'
                });
                console.log('✅ Upload úspěšný, získávám URL...');
                const previewUrl = await getDownloadURL(previewSnapshot.ref);
                uploadedImages.push({
                    url: previewUrl,
                    isPreview: true,
                    name: serviceData.previewImage.name
                });
                console.log('✅ Náhledový obrázek nahrán:', previewUrl);
            } catch (uploadError) {
                console.error('❌ Chyba při nahrávání náhledového obrázku:', uploadError);
                console.error('❌ Error code:', uploadError.code);
                console.error('❌ Error message:', uploadError.message);
                console.error('❌ Error serverResponse:', uploadError.serverResponse);
                
                let errorMessage = 'Nepodařilo se nahrát náhledový obrázek. ';
                if (uploadError.code === 'storage/unauthorized') {
                    errorMessage += 'Nemáte oprávnění k nahrávání. Zkontrolujte Storage Rules.';
                } else if (uploadError.code === 'storage/unknown') {
                    errorMessage += 'Storage není dostupné. Zkontrolujte, zda je Storage povolené v Firebase projektu.';
                } else {
                    errorMessage += `Chyba: ${uploadError.message || 'Neznámá chyba'}`;
                }
                
                showMessage(errorMessage, 'error');
                throw uploadError; // Přerušit proces přidávání služby
            }
        } else if (serviceData.defaultPreviewUrl) {
            uploadedImages.push({
                url: serviceData.defaultPreviewUrl,
                isPreview: true,
                name: 'default'
            });
        }
        
        // Nahrát další obrázky
        if (serviceData.additionalImages && serviceData.additionalImages.length > 0) {
            console.log('📸 Nahrávám další obrázky...', serviceData.additionalImages.length);
            try {
                for (let i = 0; i < serviceData.additionalImages.length; i++) {
                    const image = serviceData.additionalImages[i];
                    const imageRef = ref(storage, `services/${authCurrentUser.uid}/${Date.now()}_${i}.jpg`);
                    const imageSnapshot = await uploadBytes(imageRef, image, {
                        contentType: image.type || 'image/jpeg'
                    });
                    const imageUrl = await getDownloadURL(imageSnapshot.ref);
                    uploadedImages.push({
                        url: imageUrl,
                        isPreview: false,
                        name: image.name
                    });
                }
                console.log('✅ Všechny další obrázky nahrány');
            } catch (uploadError) {
                console.error('❌ Chyba při nahrávání dalších obrázků:', uploadError);
                showMessage('Nepodařilo se nahrát některé obrázky. Zkuste to znovu.', 'error');
                throw uploadError; // Přerušit proces přidávání služby
            }
        }

        // Vytvořit službu s URL obrázků
        const { serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const serviceToSave = {
            ...serviceData,
            userId: authCurrentUser.uid,
            userEmail: authCurrentUser.email,
            createdAt: serverTimestamp(),
            status: 'active',
            images: uploadedImages
        };
        
        // Odstranit File objekty před uložením do Firestore
        delete serviceToSave.previewImage;
        delete serviceToSave.additionalImages;

        await addDoc(collection(db, 'users', authCurrentUser.uid, 'inzeraty'), serviceToSave);

        showMessage('Služba byla úspěšně přidána!', 'success');
        closeAddServiceModal();
        
        // Real-time listener automaticky aktualizuje seznam
        return true; // Úspěch
    } catch (error) {
        console.error('Chyba při přidávání služby:', error);
        showMessage('Došlo k chybě při přidávání služby.', 'error');
        return false; // Neúspěch
    }
}

// Načtení uživatelského profilu z Firestore (users/{uid}/profile/profile)
async function loadUserProfile(uid) {
    try {
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const profileRef = doc(firebaseDb, 'users', uid, 'profile', 'profile');
        const snap = await getDoc(profileRef);
        return snap.exists() ? snap.data() : null;
    } catch (error) {
        console.error('Chyba při načítání uživatelského profilu:', error);
        return null;
    }
}

// Přepínání dropdown menu
function toggleUserDropdown() {
    const dropdown = document.querySelector('.user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Zavření dropdown menu při kliknutí mimo něj
function closeUserDropdown() {
    const dropdown = document.querySelector('.user-dropdown');
    if (dropdown) {
        dropdown.classList.remove('active');
    }
}

// Načtení služeb z databáze
async function loadServices() {
    try {
        const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const servicesSnapshot = await getDocs(collection(firebaseDb, 'services'));
        const services = [];
        
        servicesSnapshot.forEach((doc) => {
            services.push({ id: doc.id, ...doc.data() });
        });
        
        // Zde můžete aktualizovat UI se seznamem služeb
        console.log('Načtené služby:', services);
        
        return services;
    } catch (error) {
        console.error('Chyba při načítání služeb:', error);
    }
}

// Event listenery - přesunuto do initAuth funkce
function setupEventListeners() {
    console.log('🔧 Nastavuji event listenery');
    
    // Auth formulář - POUZE JEDEN LISTENER (odstraněny duplicity)
    const authForm = document.getElementById('authForm');
    console.log('🔍 Hledám authForm:', authForm ? 'NALEZEN' : 'NENALEZEN');
    console.log('🔍 AuthForm element:', authForm);
    if (authForm) {
        // Odstranit existující listenery - klonovat formulář a nahradit
        const newForm = authForm.cloneNode(true);
        authForm.parentNode.replaceChild(newForm, authForm);
        const cleanAuthForm = document.getElementById('authForm');
		
		// Po klonování se ztratí listenery na tlačítkách typů registrace.
		// Znovu je navážeme, aby šlo přepnout na „Firma“.
		try {
			setupRegistrationTypeSelection();
		} catch (e) {
			console.warn('⚠️ Nepodařilo se znovu navázat registration-type listenery:', e?.message || e);
		}
        
        console.log('🔧 Auth formulář nalezen, přidávám event listener (bez duplicit)');
        console.log('🔧 AuthForm ID:', cleanAuthForm.id);
        console.log('🔧 AuthForm class:', cleanAuthForm.className);
        
        // Přidat listener pouze jednou
        cleanAuthForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation(); // Zastavit propagaci eventu
            
            // Zamezit vícenásobnému odesílání
            const submitBtn = cleanAuthForm.querySelector('button[type="submit"]');
            if (submitBtn && submitBtn.disabled) {
                console.log('⚠️ Formulář se již odesílá, ignoruji další pokus');
                return;
            }
            
            if (submitBtn) {
                submitBtn.disabled = true;
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Zpracovávám...';
            }
            
            console.log('📝 Auth formulář odeslán');
            
            const formData = new FormData(cleanAuthForm);
            const email = formData.get('email');
            const password = formData.get('password');
            
            console.log('📧 Formulář data:', { email, password: password ? '***' : 'prázdné' });
            
            const modalEl = document.getElementById('authModal');
            const mode = modalEl?.getAttribute('data-mode') || '';
            const isLogin = mode === 'login';
            console.log('🔍 Typ akce:', { 
                mode, isLogin 
            });
            
            try {
                if (isLogin) {
                    console.log('🔐 Volám login funkci');
                    await login(email, password);
                } else {
                    // U registrace submit už nevolá registraci; používáme tlačítko pro telefonní ověření
                    console.log('ℹ️ Ignoruji submit u registrace, použijte tlačítko pro odeslání SMS.');
                }
            } catch (error) {
                console.error('❌ Chyba při zpracování formuláře:', error);
            } finally {
                // Obnovit tlačítko
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = isLogin ? 'Přihlásit se' : 'Zaregistrovat se';
                }
            }
        });
    }
    // Tlačítko: Pokračovat na ověření telefonního čísla
    const btnSendPhoneCode = document.getElementById('btnSendPhoneCode');
    if (btnSendPhoneCode) {
        btnSendPhoneCode.addEventListener('click', async () => {
            try {
                // Validace vstupů kroku 1
                const form = document.getElementById('authForm');
                const formData = new FormData(form);

                const email = formData.get('email');
                const password = formData.get('password');
                const activeTypeBtn = document.querySelector('.registration-type-btn.active');
                const userType = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'person';
                const phone = (formData.get('phone') || '').toString().trim();
                const ico = (formData.get('ico') || '').toString().trim();

                if (!email || !password || !phone) {
                    showMessage('Vyplňte e‑mail, heslo a telefon.', 'error');
                    return;
                }
                // Ověřit IČO pro firemní registraci (musí být již ověřeno před odesláním)
                if (userType === 'company') {
                    if (!window.__icoVerified || window.__icoVerifiedValue !== ico) {
                        showMessage('Nejdříve musíte ověřit IČO tlačítkem "Ověřit".', 'error');
                        return;
                    }
                    // Dvojité ověření pro jistotu
                    const icoCheck = await validateICOWithARES(ico);
                    if (!icoCheck.ok) {
                        showMessage(icoCheck.reason || 'IČO se nepodařilo ověřit.', 'error');
                        window.__icoVerified = false;
                        toggleCompanyFormFields(true);
                        return;
                    }
                }
                if (!phone.startsWith('+') && !phone.startsWith('00') && !phone.startsWith('420')) {
                    showMessage('Telefon uveďte v mezinárodním formátu (např. +420...).', 'error');
                    return;
                }

                // Normalizovat a ověřit unikátnost telefonu ještě před odesláním SMS
                const normalizedPhone = normalizePhone(phone);
                // Zabránit odeslání jen s předvolbou bez čísla
                if (normalizedPhone === '+420') {
                    showMessage('Doplňte telefonní číslo za předvolbou +420.', 'error');
                    return;
                }
                const available = await isPhoneAvailable(normalizedPhone);
                if (!available) {
                    showMessage('Toto telefonní číslo je již používáno jiným účtem.', 'error');
                    return;
                }

                // Lazy load potřebných funkcí (Firebase v10.7.1 v projektu)
                const authMod = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
                const { RecaptchaVerifier, signInWithPhoneNumber } = authMod;

                // Zjistit, zda používáme DEV bypass (testovací čísla)
                const devBypass = !!(firebaseAuth?.settings?.appVerificationDisabledForTesting);

                // Vždy vytvořit čistou reCAPTCHA instanci (prevence DUPE)
                try { if (recaptchaVerifier) { await recaptchaVerifier.clear(); } } catch (_) {}
                recaptchaVerifier = null;
                const containerId = 'recaptcha-container';
                const container = document.getElementById(containerId);
                if (!container) {
                    showMessage('Chybí reCAPTCHA kontejner v DOM.', 'error');
                    return;
                }
                
                // Inicializace verifieru
                recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, containerId, {
                    size: 'invisible',
                    callback: () => {},
                    'expired-callback': () => {
                        console.warn('⚠️ reCAPTCHA expired');
                        if (!devBypass) showMessage('Ověření reCAPTCHA vypršelo, zkuste to znovu.', 'error');
                    }
                });
                
                // Render/verify POUZE mimo devBypass
                btnSendPhoneCode.disabled = true;
                btnSendPhoneCode.textContent = 'Inicializuji ověření...';
                if (!devBypass) {
                    try { 
                        console.log('🔄 Renderování reCAPTCHA...');
                        await recaptchaVerifier.render();
                        console.log('✅ reCAPTCHA render dokončen');
                        console.log('🔄 Ověřování reCAPTCHA (invisible)...');
                        await recaptchaVerifier.verify();
                        console.log('✅ reCAPTCHA verify dokončeno');
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } catch (renderError) {
                        console.error('❌ Chyba při render/verify reCAPTCHA:', renderError);
                        showMessage('reCAPTCHA se nepodařilo inicializovat. Přidejte doménu do Authorized domains nebo použijte testovací telefon.', 'error');
                        throw renderError;
                    }
                } else {
                    console.log('🧪 Dev bypass aktivní: reCAPTCHA se nerenederuje ani neověřuje (použijte test telefonní čísla).');
                }

                console.log('📱 Pokus o odeslání SMS na:', normalizedPhone);
                console.log('🔐 reCAPTCHA verifier:', recaptchaVerifier ? 'existuje' : 'chybí');
                console.log('🔥 Firebase Auth:', firebaseAuth ? 'existuje' : 'chybí');
                console.log('📋 Firebase config:', {
                    projectId: firebaseAuth.app.options.projectId,
                    apiKey: firebaseAuth.app.options.apiKey ? 'nastaven' : 'chybí'
                });
                
                btnSendPhoneCode.textContent = 'Odesílám SMS...';

                // Odeslat SMS s podrobným error handlingem
                try {
                    console.log('📤 Volám signInWithPhoneNumber...');
                    phoneConfirmationResult = await signInWithPhoneNumber(firebaseAuth, normalizedPhone, recaptchaVerifier);
                    console.log('✅ SMS úspěšně odeslána, phoneConfirmationResult:', !!phoneConfirmationResult);
                } catch (smsError) {
                    console.error('❌ Chyba při odesílání SMS:', smsError);
                    console.error('❌ Error code:', smsError?.code);
                    console.error('❌ Error message:', smsError?.message);
                    console.error('❌ Full error:', JSON.stringify(smsError, null, 2));
                    
                    // Pro auth/invalid-app-credential přidat specifické instrukce
                    if (smsError?.code === 'auth/invalid-app-credential') {
                        console.error('🔧 ŘEŠENÍ: Zkontrolujte v Firebase Console:');
                        console.error('  1. Authentication → Sign-in method → Phone → musí být ENABLED');
                        console.error('  2. Authentication → Settings → Authorized domains → musí obsahovat "localhost"');
                        console.error('  3. Project Settings → General → zkontrolujte API klíč a projekt ID');
                        console.error('  4. Zkontrolujte, že reCAPTCHA je správně nakonfigurovaná v Phone sign-in nastavení');
                    }
                    
                    throw smsError;
                }

                // Zobrazit pole pro kód a umožnit dokončení registrace
                const phoneCodeInput = document.getElementById('phoneCode') || document.querySelector('#phoneCode');
                const btnAuthSubmitLocal = document.getElementById('btnAuthSubmit') || document.querySelector('#btnAuthSubmit');
                if (phoneCodeInput) phoneCodeInput.style.display = '';
                if (btnSendPhoneCode) btnSendPhoneCode.style.display = 'none';
                if (btnAuthSubmitLocal) btnAuthSubmitLocal.style.display = '';
                // Ujistit se, že původní submit zůstane skrytý i po odeslání SMS
                const submitBtnLocal = document.querySelector('#authModal .auth-submit-btn');
                if (submitBtnLocal) submitBtnLocal.style.display = 'none';

                showMessage('SMS s kódem byla odeslána.', 'success');
            } catch (err) {
                try { if (recaptchaVerifier) recaptchaVerifier.clear(); recaptchaVerifier = null; } catch (_) {}
                console.error(err);
                showMessage(humanizePhoneError(err), 'error');
            } finally {
                btnSendPhoneCode.disabled = false;
                btnSendPhoneCode.textContent = 'Pokračovat na ověření telefonního čísla';
            }
        });
    }

    // Tlačítko: Dokončit registraci (ověřit zadaný SMS kód a založit účet)
    const btnAuthSubmit2 = document.getElementById('btnAuthSubmit');
    if (btnAuthSubmit2) {
        btnAuthSubmit2.addEventListener('click', async () => {
            try {
                const title = (document.querySelector('#authModal .modal-title')?.textContent || '').trim();
                if (title !== 'Registrace') return; // jen v režimu registrace
                const raw = (document.getElementById('phoneCode')?.value || '').toString().trim();
                // Povolit 4–8 číslic, odstranit mezery a nečíselné znaky
                const code = raw.replace(/\s+/g, '').replace(/[^0-9]/g, '');
                if (!code) { showMessage('Zadejte kód z SMS.', 'error'); return; }
                if (!phoneConfirmationResult) { showMessage('Nejdřív odešlete SMS s kódem.', 'error'); return; }

                btnAuthSubmit2.disabled = true;
                btnAuthSubmit2.textContent = 'Dokončuji…';

                // Potvrdit SMS kód
                const result = await phoneConfirmationResult.confirm(code);
                const phoneUser = result.user;

                // Data pro propojení
                const form = document.getElementById('authForm');
                const formData = new FormData(form);
                const email = formData.get('email');
                const password = formData.get('password');
                const activeTypeBtn = document.querySelector('.registration-type-btn.active');
                const userType = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'person';
                const firstName = (formData.get('firstName') || '').toString().trim();
                const lastName = (formData.get('lastName') || '').toString().trim();
                const birthDate = (formData.get('birthDate') || '').toString().trim();
                const companyName = (formData.get('companyName') || '').toString().trim();
                const ico = (formData.get('ico') || '').toString().trim();

                // Vytvořit e-mailové přihlašování k telefonnímu účtu
                const { linkWithCredential, EmailAuthProvider, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
                const credential = EmailAuthProvider.credential(email, password);
                await linkWithCredential(phoneUser, credential);

                // Zapsat profil
                const { setDoc, doc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                const finalUser = phoneUser;
                await setDoc(doc(firebaseDb, 'users', finalUser.uid), {
                    uid: finalUser.uid,
                    email,
                    phoneNumber: finalUser.phoneNumber || '',
                    createdAt: serverTimestamp(),
                    provider: 'password+phone',
                    type: userType
                }, { merge: true });
                await setDoc(doc(firebaseDb, 'users', finalUser.uid, 'profile', 'profile'), {
                    name: userType === 'company' ? companyName : `${firstName} ${lastName}`.trim(),
                    firstName: userType === 'company' ? '' : firstName,
                    lastName: userType === 'company' ? '' : lastName,
                    birthDate: userType === 'company' ? '' : birthDate,
                    phone: (finalUser.phoneNumber || ''),
                    ico: userType === 'company' ? ico : '',
                    plan: 'none',
                    updatedAt: serverTimestamp()
                }, { merge: true });
                try {
                    await updateProfile(finalUser, { displayName: userType === 'company' ? companyName : `${firstName} ${lastName}`.trim() });
                } catch (_) {}

                showMessage('Registrace dokončena.', 'success');
                closeAuthModal();
                if (typeof window.afterLoginCallback === 'function') {
                    try { window.afterLoginCallback(); } catch (_) {}
                }
            } catch (err) {
                console.error('❌ Dokončení registrace selhalo:', err);
                showMessage(humanizePhoneError(err), 'error');
            } finally {
                btnAuthSubmit2.disabled = false;
                btnAuthSubmit2.textContent = 'Dokončit registraci';
            }
        });
    }
    // Tlačítko: Zpět z kroku 2
    const btnPhoneBack = document.getElementById('btnPhoneBack');
    if (btnPhoneBack) {
        btnPhoneBack.addEventListener('click', () => {
            const phoneStep2 = document.getElementById('phoneStep2');
            const btnSendPhoneCodeLocal = document.getElementById('btnSendPhoneCode');
            const btnAuthSubmitLocal = document.getElementById('btnAuthSubmit');
            if (phoneStep2) phoneStep2.style.display = 'none';
            if (btnSendPhoneCodeLocal) btnSendPhoneCodeLocal.style.display = '';
            if (btnAuthSubmitLocal) btnAuthSubmitLocal.style.display = 'none';
        });
    }

    // Tlačítko: Ověřit kód a dokončit registraci
    const btnVerifyPhoneCode = document.getElementById('btnVerifyPhoneCode');
    if (btnVerifyPhoneCode) {
        btnVerifyPhoneCode.addEventListener('click', async () => {
            try {
                const code = (document.getElementById('smsCode')?.value || '').toString().trim();
                if (!code) {
                    showMessage('Zadejte kód z SMS.', 'error');
                    return;
                }
                if (!phoneConfirmationResult) {
                    showMessage('Nejdřív odešlete SMS s kódem.', 'error');
                    return;
                }

                btnVerifyPhoneCode.disabled = true;
                btnVerifyPhoneCode.textContent = 'Ověřuji...';

                // a) Potvrdit SMS kód => přihlásí dočasně telefonního uživatele
                const result = await phoneConfirmationResult.confirm(code);
                const phoneUser = result.user;

                // b) Připravit data pro propojení email+heslo
                const form = document.getElementById('authForm');
                const formData = new FormData(form);
                const email = formData.get('email');
                const password = formData.get('password');
                const activeTypeBtn = document.querySelector('.registration-type-btn.active');
                const userType = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'person';

                const authMod = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
                const { EmailAuthProvider, linkWithCredential, updateProfile } = authMod;

                // c) Update displayName
                const firstName = formData.get('firstName');
                const lastName = formData.get('lastName');
                const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
                if (displayName) {
                    await updateProfile(phoneUser, { displayName });
                }

                // d) Propojit email+heslo s telefonním účtem
                const credential = EmailAuthProvider.credential(email, password);
                const linked = await linkWithCredential(phoneUser, credential);
                const finalUser = linked.user;

                // e) Připravit a ověřit telefon (normalizace + unikátnost)
                const userData = { type: userType };
                if (userType === 'person') {
                    userData.firstName = firstName;
                    userData.lastName = lastName;
                    userData.phone = formData.get('phone');
                    userData.birthDate = formData.get('birthDate');
                } else {
                    userData.companyName = formData.get('companyName');
                    userData.ico = formData.get('ico');
                    userData.dic = formData.get('dic');
                    userData.companyAddress = formData.get('companyAddress');
                    // Telefon i e‑mail pro firmu se berou ze společných polí
                    userData.phone = formData.get('phone');
                }
                // Při dokončení registrace ještě jednou ověřit IČO (pro jistotu)
                if (userType === 'company') {
                    const ico = userData.ico || '';
                    if (!window.__icoVerified || window.__icoVerifiedValue !== ico) {
                        showMessage('Nejdříve musíte ověřit IČO tlačítkem "Ověřit".', 'error');
                        return;
                    }
                    const icoCheck = await validateICOWithARES(ico);
                    if (!icoCheck.ok) {
                        showMessage(icoCheck.reason || 'IČO se nepodařilo ověřit.', 'error');
                        window.__icoVerified = false;
                        toggleCompanyFormFields(true);
                        return;
                    }
                    if (!userData.companyName && icoCheck.name) {
                        userData.companyName = icoCheck.name;
                    }
                    if (!userData.companyAddress && icoCheck.seat && icoCheck.seat.text) {
                        userData.companyAddress = icoCheck.seat.text;
                    }
                }

                const rawPhone = (userData.phone || '');
                const normalizedPhone = normalizePhone(rawPhone);
                if (!normalizedPhone) {
                    showMessage('Telefon je povinný a musí být ve formátu +420...', 'error');
                    return;
                }
                const available = await isPhoneAvailable(normalizedPhone);
                if (!available) {
                    showMessage('Toto telefonní číslo je již používáno jiným účtem.', 'error');
                    return;
                }

                // Vytvoření dokumentů (kopie logiky z register, ale bez createUserWithEmailAndPassword)
                const { setDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
                await setDoc(doc(firebaseDb, 'users', finalUser.uid), {
                    uid: finalUser.uid,
                    email: finalUser.email,
                    createdAt: new Date(),
                    userType: userData.type
                });

                const profileData = {
                    email: finalUser.email,
                    balance: 1000,
                    createdAt: new Date(),
                    userType: userData.type,
                    name: displayName || (userData.companyName || 'Uživatel'),
                    phone: normalizedPhone || null,
                    city: userData.city || null,
                    bio: userData.bio || null,
                    businessName: userData.companyName || userData.businessName || null,
                    businessType: userData.businessType || null,
                    businessAddress: userData.companyAddress || userData.businessAddress || null,
                    businessDescription: userData.businessDescription || null,
                    emailNotifications: userData.emailNotifications !== false,
                    smsNotifications: userData.smsNotifications === true,
                    marketingEmails: userData.marketingEmails === true,
                    rating: 0,
                    totalReviews: 0,
                    ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
                    recentReviews: [],
                    totalAds: 0,
                    activeAds: 0,
                    totalViews: 0,
                    totalContacts: 0
                };

                if (userType === 'person') {
                    profileData.firstName = firstName;
                    profileData.lastName = lastName;
                    profileData.birthDate = formData.get('birthDate');
                    profileData.name = displayName || `${firstName || ''} ${lastName || ''}`.trim();
                } else {
                    profileData.name = userData.companyName || 'Firma';
                    profileData.company = {
                        companyName: userData.companyName || null,
                        ico: normalizeICO(userData.ico || '') || null,
                        dic: userData.dic || null,
                        phone: normalizedPhone || null,
                        address: userData.companyAddress || null
                    };
                }

                // --- Úkol 2 dokončen ---
                // --- Úkol 4 dokončen ---

                await setDoc(doc(firebaseDb, 'users', finalUser.uid, 'profile', 'profile'), profileData);

                updateUI(finalUser);
                showMessage('Registrace úspěšná. Telefon ověřen.', 'success');
                closeAuthModal();
            } catch (err) {
                console.error(err);
                showMessage(humanizePhoneError(err), 'error');
            } finally {
                btnVerifyPhoneCode.disabled = false;
                btnVerifyPhoneCode.textContent = 'Ověřit kód a dokončit registraci';
            }
        });
    }

    // Ověření IČ přes HlídačStátu (vedle pole IČ)
    const btnVerifyICO = document.getElementById('btnVerifyICO');
    if (btnVerifyICO) {
        btnVerifyICO.addEventListener('click', async () => {
            try {
                const icoInput = document.getElementById('ico') || document.getElementById('companyId');
                const statusEl = document.getElementById('icoStatus');
                const companyNameEl = document.getElementById('companyName');
                const companyAddressEl = document.getElementById('companyAddress');
                const icoVal = (icoInput?.value || '').toString().trim();
                if (!icoVal) { 
                    if (statusEl) { 
                        statusEl.style.color = '#dc3545'; 
                        statusEl.textContent = 'Zadejte IČ'; 
                    } 
                    return; 
                }
                btnVerifyICO.disabled = true;
                btnVerifyICO.textContent = 'Ověřuji...';
                const res = await validateICOWithARES(icoVal);
                if (res.ok) {
                    if (statusEl) { 
                        statusEl.style.color = '#28a745'; 
                        statusEl.textContent = 'IČ ověřeno ✓'; 
                    }
                    // Předvyplnit název/sídlo pokud jsou prázdné
                    if (res.name && companyNameEl && !companyNameEl.value) {
                        companyNameEl.value = res.name;
                    }
                    if (res.seat && companyAddressEl && !companyAddressEl.value && res.seat.text) {
                        companyAddressEl.value = res.seat.text;
                    }
                    // Odblokovat všechna pole po úspěšném ověření
                    toggleCompanyFormFields(false);
                    // Nastavit flag, že IČO je ověřeno
                    window.__icoVerified = true;
                    window.__icoVerifiedValue = icoVal;
                } else {
                    if (statusEl) { 
                        statusEl.style.color = '#dc3545'; 
                        statusEl.textContent = res.reason || 'IČ nebylo ověřeno'; 
                    }
                    // Pole zůstávají zablokovaná
                    window.__icoVerified = false;
                }
            } catch (e) {
                const statusEl = document.getElementById('icoStatus');
                if (statusEl) { 
                    statusEl.style.color = '#dc3545'; 
                    statusEl.textContent = 'Chyba při ověřování IČ'; 
                }
                window.__icoVerified = false;
            } finally {
                btnVerifyICO.disabled = false;
                btnVerifyICO.textContent = 'Ověřit';
            }
        });
    }
    
    // Přepínání mezi přihlášením a registrací
    const authSwitchBtn = document.querySelector('.auth-switch-btn');
    if (authSwitchBtn) {
        authSwitchBtn.addEventListener('click', () => {
            const type = authSwitchBtn.getAttribute('data-type');
            showAuthModal(type);
        });
    }

    // Při otevření registrace přejmenovat texty tlačítek, když existují
    const modalTitle = document.querySelector('.modal-title');
    if (modalTitle && modalTitle.textContent === 'Registrace') {
        // V režimu registrace má být hlavní flow: Odeslat SMS → Dokončit registraci
        const primarySubmit = document.querySelector('#authModal .auth-submit-btn');
        if (primarySubmit) primarySubmit.style.display = 'none';
        const sendCodeBtn = document.getElementById('btnSendPhoneCode');
        if (sendCodeBtn) sendCodeBtn.textContent = 'Pokračovat na ověření telefonního čísla';
        const completeBtn = document.getElementById('btnAuthSubmit');
        if (completeBtn) completeBtn.textContent = 'Dokončit registraci';
    }
    
    // Inicializace náhledů obrázků
    setupImagePreviews();
    
    // Formulář pro přidání služby
    // Event listener pro formulář přidání služby - pouze pro modaly na jiných stránkách
    // Na stránce create-ad.html se používá create-ad.js, ne tento listener
    const addServiceForm = document.getElementById('addServiceForm');
    if (addServiceForm && !window.location.pathname.includes('create-ad.html')) {
        addServiceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(addServiceForm);
            const serviceData = {
                title: formData.get('title'),
                category: formData.get('category'),
                description: formData.get('description'),
                price: formData.get('price'),
                location: formData.get('location')
            };
            
            // Zpracovat obrázky
            const previewImageInput = document.getElementById('previewImage');
            const additionalImagesInput = document.getElementById('additionalImages');
            
            // Validace náhledového obrázku
            if (!previewImageInput.files[0]) {
                showMessage('Náhledový obrázek je povinný!', 'error');
                return;
            }
            
            serviceData.previewImage = previewImageInput.files[0];
            
            // Zpracovat další obrázky
            if (additionalImagesInput.files.length > 0) {
                if (additionalImagesInput.files.length > 10) {
                    showMessage('Můžete nahrát maximálně 10 dalších fotek!', 'error');
                    return;
                }
                serviceData.additionalImages = Array.from(additionalImagesInput.files);
            }
            
            await addService(serviceData);
        });
    }
    
    // Zavření modalu při kliknutí mimo něj
    window.addEventListener('click', (e) => {
        const authModal = document.getElementById('authModal');
        const addServiceModal = document.getElementById('addServiceModal');
        const userDropdown = document.querySelector('.user-dropdown');
        
        if (e.target === authModal) {
            closeAuthModal();
        }
        if (e.target === addServiceModal) {
            closeAddServiceModal();
        }
        
        // Zavření dropdown menu při kliknutí mimo něj
        if (userDropdown && !userDropdown.contains(e.target)) {
            closeUserDropdown();
        }
    });
}

// Funkce pro náhled obrázků při nahrávání
function setupImagePreviews() {
    const previewImageInput = document.getElementById('previewImage');
    const additionalImagesInput = document.getElementById('additionalImages');
    const previewImagePreview = document.getElementById('previewImagePreview');
    const additionalImagesPreview = document.getElementById('additionalImagesPreview');
    
    if (previewImageInput && previewImagePreview) {
        previewImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewImagePreview.innerHTML = `<img src="${e.target.result}" alt="Náhled">`;
                    previewImagePreview.classList.remove('empty');
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    if (additionalImagesInput && additionalImagesPreview) {
        additionalImagesInput.addEventListener('change', function(e) {
            const files = Array.from(e.target.files);
            if (files.length > 10) {
                showMessage('Můžete nahrát maximálně 10 dalších fotek!', 'error');
                return;
            }
            
            additionalImagesPreview.innerHTML = '';
            
            files.forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const imageItem = document.createElement('div');
                    imageItem.className = 'image-item';
                    imageItem.innerHTML = `
                        <img src="${e.target.result}" alt="Obrázek ${index + 1}">
                        <button class="remove-btn" onclick="removeImage(${index})">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    additionalImagesPreview.appendChild(imageItem);
                };
                reader.readAsDataURL(file);
            });
        });
    }
}

// Funkce pro odstranění obrázku z náhledu
function removeImage(index) {
    const additionalImagesInput = document.getElementById('additionalImages');
    const additionalImagesPreview = document.getElementById('additionalImagesPreview');
    
    if (additionalImagesInput && additionalImagesPreview) {
        const dt = new DataTransfer();
        const files = Array.from(additionalImagesInput.files);
        
        files.forEach((file, i) => {
            if (i !== index) {
                dt.items.add(file);
            }
        });
        
        additionalImagesInput.files = dt.files;
        
        // Aktualizovat náhled
        additionalImagesInput.dispatchEvent(new Event('change'));
    }
}

// Instagram-like prohlížeč obrázků
function openImageViewer(images, startIndex = 0) {
    console.log('🖼️ Otevírám prohlížeč obrázků:', images.length, 'obrázků');
    
    if (!images || images.length === 0) {
        showMessage('Žádné obrázky k zobrazení', 'error');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal image-viewer-modal';
    modal.style.display = 'flex';
    
    let currentIndex = startIndex;
    
    function updateImage() {
        const mainImage = modal.querySelector('.image-viewer-main');
        const counter = modal.querySelector('.image-viewer-counter');
        const thumbnails = modal.querySelectorAll('.image-viewer-thumbnail');
        
        if (mainImage && images[currentIndex]) {
            mainImage.src = images[currentIndex].url;
            mainImage.alt = images[currentIndex].name || `Obrázek ${currentIndex + 1}`;
        }
        
        if (counter) {
            counter.textContent = `${currentIndex + 1} / ${images.length}`;
        }
        
        thumbnails.forEach((thumb, index) => {
            thumb.classList.toggle('active', index === currentIndex);
        });
        
        // Skrýt/zobrazit navigační tlačítka
        const prevBtn = modal.querySelector('.image-viewer-prev');
        const nextBtn = modal.querySelector('.image-viewer-next');
        
        if (prevBtn) prevBtn.style.display = images.length > 1 ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = images.length > 1 ? 'flex' : 'none';
    }
    
    modal.innerHTML = `
        <div class="image-viewer-content">
            <div class="image-viewer-header">
                <button class="image-viewer-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
                <div class="image-viewer-counter">${currentIndex + 1} / ${images.length}</div>
            </div>
            
            <div class="image-viewer-body">
                <img class="image-viewer-main" src="${images[currentIndex].url}" alt="${images[currentIndex].name || `Obrázek ${currentIndex + 1}`}">
                
                <button class="image-viewer-nav image-viewer-prev" onclick="navigateImage(-1)">
                    <i class="fas fa-chevron-left"></i>
                </button>
                
                <button class="image-viewer-nav image-viewer-next" onclick="navigateImage(1)">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            
            <div class="image-viewer-thumbnails">
                ${images.map((img, index) => `
                    <div class="image-viewer-thumbnail ${index === currentIndex ? 'active' : ''}" onclick="goToImage(${index})">
                        <img src="${img.url}" alt="${img.name || `Obrázek ${index + 1}`}">
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Přidat navigační funkce
    window.navigateImage = function(direction) {
        currentIndex += direction;
        if (currentIndex < 0) currentIndex = images.length - 1;
        if (currentIndex >= images.length) currentIndex = 0;
        updateImage();
    };
    
    window.goToImage = function(index) {
        currentIndex = index;
        updateImage();
    };
    
    // Klávesové zkratky
    const handleKeydown = (e) => {
        if (e.key === 'ArrowLeft') navigateImage(-1);
        if (e.key === 'ArrowRight') navigateImage(1);
        if (e.key === 'Escape') modal.remove();
    };
    
    document.addEventListener('keydown', handleKeydown);
    
    // Vyčistit event listener při zavření
    const originalRemove = modal.remove;
    modal.remove = function() {
        document.removeEventListener('keydown', handleKeydown);
        delete window.navigateImage;
        delete window.goToImage;
        originalRemove.call(this);
    };
    
    document.body.appendChild(modal);
    updateImage();
}

// Export funkcí pro globální použití - ihned po definici
window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;
window.createAuthModal = createAuthModal;
window.setupAuthModalEvents = setupAuthModalEvents;
window.showAddServiceModal = showAddServiceModal;
window.closeAddServiceModal = closeAddServiceModal;
window.logout = logout;
window.addService = addService;
window.loadServices = loadServices;
window.toggleUserDropdown = toggleUserDropdown;
window.closeUserDropdown = closeUserDropdown;
window.setupImagePreviews = setupImagePreviews;
window.removeImage = removeImage;
window.openImageViewer = openImageViewer;

// Debug: Zkontrolovat, zda jsou funkce dostupné
console.log('🔧 Auth.js: Exportované funkce:', {
    showAuthModal: typeof window.showAuthModal,
    closeAuthModal: typeof window.closeAuthModal,
    showAddServiceModal: typeof window.showAddServiceModal
});

// Fallback pro tlačítka - pokud se funkce nenačtou, zobrazit chybu
document.addEventListener('DOMContentLoaded', () => {
    // Zkontrolovat, zda jsou funkce dostupné po 1 sekundě
    setTimeout(() => {
        if (typeof window.showAuthModal !== 'function') {
            console.error('❌ showAuthModal není dostupná!');
            // Přidat error handler na tlačítka
            document.querySelectorAll('[onclick*="showAuthModal"]').forEach(btn => {
                btn.onclick = () => {
                    alert('Chyba: Autentifikační funkce nejsou načtené. Obnovte stránku.');
                };
            });
        } else {
            console.log('✅ showAuthModal je dostupná');
        }
    }, 1000);
});