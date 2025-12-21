// Nahlášení - Admin stránka
let allReports = [];
let currentReport = null;
let currentStep = 1;
let reviewResult = null; // true = OK, false = NOT OK

// Inicializace
document.addEventListener('DOMContentLoaded', () => {
    const checkFirebase = setInterval(() => {
        if (window.firebaseAuth && window.firebaseDb) {
            initReportsPage();
            clearInterval(checkFirebase);
        }
    }, 100);
});

async function initReportsPage() {
    console.log('Inicializuji stránku nahlášení...');
    
    const auth = window.firebaseAuth;
    if (!auth) {
        console.error('Firebase Auth není dostupné');
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Počkat na přihlášení uživatele pomocí onAuthStateChanged
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    
    onAuthStateChanged(auth, async (user) => {
        console.log('Auth state changed na nahlaseni.html:', user ? user.email : 'Odhlášen');
        
        if (!user) {
            console.log('Uživatel není přihlášen, přesměrovávám na dashboard');
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Zkontrolovat admin status
        const isAdmin = await checkAdminStatus(user.uid);
        console.log('Admin status pro', user.email, ':', isAdmin);
        
        if (!isAdmin) {
            console.log('Uživatel není admin, přesměrovávám na dashboard');
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Načíst data
        try {
            await loadAllReports();
            displayReports();
            
            // Zobrazit admin menu
            if (typeof window.checkAndShowAdminMenu === 'function') {
                setTimeout(() => window.checkAndShowAdminMenu(), 500);
            }
        } catch (error) {
            console.error('Chyba při načítání dat:', error);
            showMessage('Nepodařilo se načíst data.', 'error');
        }
    });
}

// Kontrola admin statusu
async function checkAdminStatus(uid) {
    if (!uid) return false;
    try {
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const profileRef = doc(window.firebaseDb, 'users', uid, 'profile', 'profile');
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            if (profileData.isAdmin === true || profileData.role === 'admin') {
                return true;
            }
        }
        const adminEmails = ['admin@bulldogo.cz', 'support@bulldogo.cz'];
        const userEmail = window.firebaseAuth?.currentUser?.email;
        if (userEmail && typeof userEmail === 'string' && adminEmails.includes(userEmail.toLowerCase())) {
            return true;
        }
        return false;
    } catch (error) {
        console.error('Chyba při kontrole admin statusu:', error);
        return false;
    }
}

// Načtení všech nahlášení
async function loadAllReports() {
    try {
        const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        console.log('Načítám nahlášení...');
        
        allReports = [];
        
        // Zkusit kolekci 'reports'
        try {
            const reportsSnapshot = await getDocs(collection(window.firebaseDb, 'reports'));
            console.log('Reports kolekce výsledek:', reportsSnapshot.size, 'dokumentů');
            
            for (const reportDoc of reportsSnapshot.docs) {
                const reportData = reportDoc.data();
                allReports.push({
                    id: reportDoc.id,
                    ...reportData
                });
            }
            
            console.log('Načteno nahlášení:', allReports.length);
        } catch (error) {
            console.warn('Chyba při načítání nahlášení:', error.message);
        }
        
    } catch (error) {
        console.error('Chyba při načítání nahlášení:', error);
    }
}

// Zobrazení nahlášení
function displayReports() {
    const grid = document.getElementById('reportsGrid');
    
    if (allReports.length === 0) {
        grid.innerHTML = `
            <div class="no-reports">
                <i class="fas fa-flag"></i>
                <h3>Žádná nahlášení</h3>
                <p>V systému nejsou žádná nahlášení inzerátů.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = allReports.map(report => createReportCard(report)).join('');
}

// Vytvoření karty nahlášení
function createReportCard(report) {
    const createdAt = report.createdAt?.toDate ? report.createdAt.toDate().toLocaleDateString('cs-CZ') : 
                     report.createdAt ? new Date(report.createdAt).toLocaleDateString('cs-CZ') : 'Neznámé';
    
    return `
        <div class="report-card">
            <div class="report-card-header">
                <h3>Nahlášený inzerát</h3>
                <span class="report-date">${createdAt}</span>
            </div>
            <div class="report-card-body">
                <p><strong>Inzerát ID:</strong> ${report.adId || 'Neznámé'}</p>
                <p><strong>Uživatel ID:</strong> ${report.userId || 'Neznámé'}</p>
                <p><strong>Důvod:</strong> ${report.reason || 'Neuvedeno'}</p>
            </div>
            <div class="report-card-actions">
                <button class="btn btn-primary" onclick="startReview('${report.id}')">
                    <i class="fas fa-check-circle"></i> Zkontrolovat
                </button>
            </div>
        </div>
    `;
}

// Spuštění kontroly
async function startReview(reportId) {
    const report = allReports.find(r => r.id === reportId);
    if (!report) {
        showMessage('Nahlášení nenalezeno.', 'error');
        return;
    }
    
    currentReport = report;
    currentStep = 1;
    reviewResult = null;
    
    // Načíst data inzerátu
    try {
        const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Zkusit načíst inzerát
        let adData = null;
        if (report.userId && report.adId) {
            const adRef = doc(window.firebaseDb, 'users', report.userId, 'inzeraty', report.adId);
            const adSnap = await getDoc(adRef);
            if (adSnap.exists()) {
                adData = { id: adSnap.id, ...adSnap.data() };
            }
        }
        
        // Fallback na services
        if (!adData && report.adId) {
            const adRef = doc(window.firebaseDb, 'services', report.adId);
            const adSnap = await getDoc(adRef);
            if (adSnap.exists()) {
                adData = { id: adSnap.id, ...adSnap.data() };
            }
        }
        
        if (!adData) {
            showMessage('Inzerát nenalezen.', 'error');
            return;
        }
        
    } catch (error) {
        console.error('Chyba při načítání inzerátu:', error);
        showMessage('Nepodařilo se načíst inzerát.', 'error');
        return;
    }
    
    // Zobrazit modal
    document.getElementById('reviewModal').style.display = 'block';
    showReviewStep(1);
}

// Zobrazení kroku kontroly
async function showReviewStep(step) {
    // Skrýt všechny kroky
    document.querySelectorAll('.review-step').forEach(s => s.classList.remove('active'));
    
    // Aktualizovat indikátory
    document.querySelectorAll('.step').forEach(s => {
        s.classList.remove('active', 'completed');
        const stepNum = parseInt(s.dataset.step);
        if (stepNum < step) {
            s.classList.add('completed');
        } else if (stepNum === step) {
            s.classList.add('active');
        }
    });
    
    // Zobrazit aktuální krok
    const stepElement = document.getElementById(`review-step-${step}`);
    if (stepElement) {
        stepElement.classList.add('active');
    }
    
    // Načíst data pro krok
    if (step === 1) {
        await loadReviewImages();
    } else if (step === 2) {
        await loadReviewTitleDescription();
    } else if (step === 3) {
        await loadReviewUser();
    } else if (step === 4) {
        showReviewResult();
    }
}

// Načtení obrázků
async function loadReviewImages() {
    const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    let adData = null;
    if (currentReport.userId && currentReport.adId) {
        const adRef = doc(window.firebaseDb, 'users', currentReport.userId, 'inzeraty', currentReport.adId);
        const adSnap = await getDoc(adRef);
        if (adSnap.exists()) {
            adData = adSnap.data();
        }
    }
    
    if (!adData && currentReport.adId) {
        const adRef = doc(window.firebaseDb, 'services', currentReport.adId);
        const adSnap = await getDoc(adRef);
        if (adSnap.exists()) {
            adData = adSnap.data();
        }
    }
    
    const imagesContainer = document.getElementById('reviewImages');
    const images = adData?.images || adData?.image ? [adData.image] : [];
    
    if (images.length === 0) {
        imagesContainer.innerHTML = '<p>Inzerát nemá žádné obrázky.</p>';
    } else {
        imagesContainer.innerHTML = images.map((img, idx) => `
            <img src="${img}" alt="Obrázek ${idx + 1}" class="review-image">
        `).join('');
    }
}

// Načtení názvu a popisu
async function loadReviewTitleDescription() {
    const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    let adData = null;
    if (currentReport.userId && currentReport.adId) {
        const adRef = doc(window.firebaseDb, 'users', currentReport.userId, 'inzeraty', currentReport.adId);
        const adSnap = await getDoc(adRef);
        if (adSnap.exists()) {
            adData = adSnap.data();
        }
    }
    
    if (!adData && currentReport.adId) {
        const adRef = doc(window.firebaseDb, 'services', currentReport.adId);
        const adSnap = await getDoc(adRef);
        if (adSnap.exists()) {
            adData = adSnap.data();
        }
    }
    
    document.getElementById('reviewTitle').textContent = adData?.title || 'Bez názvu';
    document.getElementById('reviewDescription').textContent = adData?.description || 'Bez popisu';
}

// Načtení údajů o uživateli
async function loadReviewUser() {
    const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    if (!currentReport.userId) {
        document.getElementById('reviewUserDetails').innerHTML = '<p>Uživatel nenalezen.</p>';
        return;
    }
    
    const profileRef = doc(window.firebaseDb, 'users', currentReport.userId, 'profile', 'profile');
    const profileSnap = await getDoc(profileRef);
    
    let userData = {};
    if (profileSnap.exists()) {
        userData = profileSnap.data();
    }
    
    // Zkusit načíst root dokument
    const userRef = doc(window.firebaseDb, 'users', currentReport.userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
        userData = { ...userData, ...userSnap.data() };
    }
    
    const avatarHtml = userData.avatar ? 
        `<img src="${userData.avatar}" alt="Avatar" class="avatar-img">` :
        `<i class="fas fa-user-circle"></i>`;
    
    document.getElementById('reviewUserAvatar').innerHTML = avatarHtml;
    document.getElementById('reviewUserDetails').innerHTML = `
        <div class="user-detail-item">
            <strong>Jméno:</strong> ${userData.name || 'Bez jména'}
        </div>
        <div class="user-detail-item">
            <strong>Email:</strong> ${userData.email || 'Bez emailu'}
        </div>
        <div class="user-detail-item">
            <strong>Telefon:</strong> ${userData.phone || 'Neuvedeno'}
        </div>
        <div class="user-detail-item">
            <strong>ICO:</strong> ${userData.ico || 'Neuvedeno'}
        </div>
    `;
}

// Zpracování kroku
async function reviewStep(step, isOk) {
    if (!isOk) {
        // Není v pořádku - smazat inzerát
        reviewResult = false;
        await completeReview();
        return;
    }
    
    // V pořádku - pokračovat na další krok
    if (step < 3) {
        currentStep = step + 1;
        showReviewStep(currentStep);
    } else {
        // Všechny kroky prošly - dokončit
        reviewResult = true;
        await completeReview();
    }
}

// Dokončení kontroly
async function completeReview() {
    currentStep = 4;
    showReviewStep(4);
    
    if (reviewResult === false) {
        // Smazat inzerát
        try {
            const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            
            if (currentReport.userId && currentReport.adId) {
                const adRef = doc(window.firebaseDb, 'users', currentReport.userId, 'inzeraty', currentReport.adId);
                await deleteDoc(adRef);
            } else if (currentReport.adId) {
                const adRef = doc(window.firebaseDb, 'services', currentReport.adId);
                await deleteDoc(adRef);
            }
            
            console.log('✅ Inzerát smazán z Firestore');
        } catch (error) {
            console.error('Chyba při mazání inzerátu:', error);
        }
    }
    
    // Smazat nahlášení
    try {
        const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const reportRef = doc(window.firebaseDb, 'reports', currentReport.id);
        await deleteDoc(reportRef);
        console.log('✅ Nahlášení smazáno z Firestore');
    } catch (error) {
        console.error('Chyba při mazání nahlášení:', error);
    }
    
    // Aktualizovat seznam
    allReports = allReports.filter(r => r.id !== currentReport.id);
    displayReports();
}

// Zobrazení výsledku
function showReviewResult() {
    const resultDiv = document.getElementById('reviewResult');
    
    if (reviewResult === true) {
        resultDiv.innerHTML = `
            <div class="review-success">
                <i class="fas fa-check-circle"></i>
                <h4>Kontrola dokončena</h4>
                <p>Inzerát je v pořádku. Nahlášení bylo odstraněno.</p>
                <button class="btn btn-primary" onclick="closeReviewModal()">Zavřít</button>
            </div>
        `;
    } else {
        resultDiv.innerHTML = `
            <div class="review-error">
                <i class="fas fa-times-circle"></i>
                <h4>Kontrola dokončena</h4>
                <p>Inzerát byl smazán z důvodu porušení pravidel.</p>
                <button class="btn btn-primary" onclick="closeReviewModal()">Zavřít</button>
            </div>
        `;
    }
}

// Zavření modalu
function closeReviewModal() {
    document.getElementById('reviewModal').style.display = 'none';
    currentReport = null;
    currentStep = 1;
    reviewResult = null;
}

// Helper funkce
let showMessageCallCount = 0;
function showMessage(message, type = 'info') {
    if (showMessageCallCount > 0) {
        console.log(`[showMessage] ${type}: ${message}`);
        return;
    }
    
    showMessageCallCount++;
    try {
        if (typeof window.showMessage === 'function' && window.showMessage !== showMessage) {
            window.showMessage(message, type);
        } else {
            console.log(`[showMessage] ${type}: ${message}`);
            if (type === 'error') {
                alert(message);
            }
        }
    } finally {
        showMessageCallCount--;
    }
}

// Close modal on outside click
window.onclick = function(event) {
    const modal = document.getElementById('reviewModal');
    if (event.target === modal) {
        closeReviewModal();
    }
}

