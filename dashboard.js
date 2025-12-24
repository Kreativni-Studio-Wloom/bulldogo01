// Dashboard JavaScript - Admin panel

let allUsers = [];
let allAds = [];
let currentUserDetails = null;

// Admin credentials (v produkci by měly být v bezpečném prostředí)
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'admin123'
};

// Inicializace po načtení Firebase
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard DOMContentLoaded');
    const checkFirebase = setInterval(() => {
        if (window.firebaseAuth && window.firebaseDb) {
            console.log('Firebase nalezen v Dashboard, inicializuji');
            initDashboard();
            clearInterval(checkFirebase);
        } else {
            console.log('Čekám na Firebase v Dashboard...');
        }
    }, 100);
});

// Inicializace dashboardu
function initDashboard() {
    console.log('Inicializuji Dashboard');
    
    // Event listenery
    setupEventListeners();
    
    // Zkontrolovat, jestli je admin už přihlášen
    checkAdminLogin();
}

// Kontrola admin statusu z Firestore
async function checkAdminStatusFromFirestore(uid) {
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
        
        // Fallback: kontrola přes email
        const auth = window.firebaseAuth;
        if (auth && auth.currentUser) {
            const adminEmails = ['admin@bulldogo.cz', 'support@bulldogo.cz'];
            if (auth.currentUser.email && adminEmails.includes(auth.currentUser.email.toLowerCase())) {
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('Chyba při kontrole admin statusu:', error);
        return false;
    }
}

// Zkontrolovat admin přihlášení
async function checkAdminLogin() {
    // Počkat na Firebase Auth pomocí onAuthStateChanged
    const auth = window.firebaseAuth;
    if (!auth) {
        console.log('Firebase Auth není dostupné');
        showLoginForm();
        return;
    }
    
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    
    onAuthStateChanged(auth, async (user) => {
        console.log('Auth state changed na dashboard:', user ? user.email : 'Odhlášen');
        
        if (user) {
            const isAdmin = await checkAdminStatusFromFirestore(user.uid);
            if (isAdmin) {
                console.log('✅ Uživatel je admin podle Firestore');
                localStorage.setItem('adminLoggedIn', 'true');
                showDashboard();
                await loadDashboardData();
                
                // Zobrazit admin menu
                if (typeof window.checkAndShowAdminMenu === 'function') {
                    setTimeout(() => window.checkAndShowAdminMenu(), 500);
                }
                return;
            } else {
                // Uživatel není admin - smazat localStorage a zobrazit login
                localStorage.removeItem('adminLoggedIn');
                showLoginForm();
                return;
            }
        }
        
        // Uživatel není přihlášen - zobrazit login formulář
        localStorage.removeItem('adminLoggedIn');
        showLoginForm();
    });
}

// Nastavení event listenerů
function setupEventListeners() {
    // Admin login form
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', handleAdminLogin);
    }
    
    // User search
    const userSearch = document.getElementById('userSearch');
    if (userSearch) {
        userSearch.addEventListener('input', filterUsers);
    }
    
    // User filter
    const userFilter = document.getElementById('userFilter');
    if (userFilter) {
        userFilter.addEventListener('change', filterUsers);
    }
    
    // Balance edit form
    const balanceEditForm = document.getElementById('balanceEditForm');
    if (balanceEditForm) {
        balanceEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await updateUserBalance();
        });
    }
    
    // Ad edit form
    const adEditForm = document.getElementById('adEditForm');
    if (adEditForm) {
        adEditForm.addEventListener('submit', saveAdChanges);
    }
    
    // Close modals on outside click
    window.onclick = function(event) {
        const adEditModal = document.getElementById('adEditModal');
        if (event.target === adEditModal) {
            closeAdEditModal();
        }
    }
}

// Zpracování admin přihlášení
async function handleAdminLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const username = formData.get('username');
    const password = formData.get('password');
    
    console.log('Admin login attempt:', username);
    
    // Zkontrolovat, jestli je uživatel přihlášen v Firebase Auth
    const auth = window.firebaseAuth;
    if (auth && auth.currentUser) {
        const isAdmin = await checkAdminStatusFromFirestore(auth.currentUser.uid);
        if (isAdmin) {
            console.log('✅ Uživatel je admin podle Firestore');
            localStorage.setItem('adminLoggedIn', 'true');
            showDashboard();
            loadDashboardData();
            showMessage('Úspěšně přihlášen jako admin!', 'success');
            return;
        }
    }
    
    // Fallback: starý způsob přihlášení (pro kompatibilitu)
    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        console.log('Admin login successful (legacy)');
        localStorage.setItem('adminLoggedIn', 'true');
        showDashboard();
        loadDashboardData();
        showMessage('Úspěšně přihlášen jako admin!', 'success');
    } else {
        console.log('Admin login failed');
        showMessage('Neplatné přihlašovací údaje! Zkontroluj, že máš admin status v Firestore.', 'error');
    }
}

// Zobrazení přihlašovacího formuláře
function showLoginForm() {
    document.getElementById('adminLogin').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    document.querySelector('.admin-info').style.display = 'none';
}

// Zobrazení dashboardu
function showDashboard() {
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.querySelector('.admin-info').style.display = 'flex';
}

// Načtení dat pro dashboard
async function loadDashboardData() {
    try {
        console.log('Načítám dashboard data...');
        
        // Načíst všechny uživatele
        await loadAllUsers();
        console.log('✅ Načteno uživatelů:', allUsers.length);
        
        // Načíst všechny inzeráty
        await loadAllAds();
        console.log('✅ Načteno inzerátů:', allAds.length);
        
        // Aktualizovat statistiky
        console.log('Aktualizuji statistiky...');
        updateDashboardStats();
        updateDashboardOverview();
        
        console.log('✅ Dashboard data načtena a aktualizována');
        console.log('   - Uživatelé:', allUsers.length);
        console.log('   - Inzeráty:', allAds.length);
        
    } catch (error) {
        console.error('❌ Chyba při načítání dashboard dat:', error);
        showMessage('Nepodařilo se načíst data dashboardu.', 'error');
    }
}

// Načtení všech uživatelů
async function loadAllUsers() {
    try {
        const { getDocs, getDoc, collection, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const usersSnapshot = await getDocs(collection(window.firebaseDb, 'users'));
        allUsers = [];
        
        // Pro každý uživatel načti profil z users/{uid}/profile/profile a slouč
        for (const userDoc of usersSnapshot.docs) {
            const userData = { 
                id: userDoc.id, 
                uid: userDoc.id,  // Přidat uid pro kompatibilitu
                ...userDoc.data() 
            };
            const profileRef = doc(window.firebaseDb, 'users', userDoc.id, 'profile', 'profile');
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                userData.name = profileData.name || userData.name || userDoc.data().email || 'Bez jména';
                userData.email = profileData.email || userData.email || userDoc.data().email || 'Bez emailu';
                userData.balance = profileData.balance || 0;
                userData.profileCreatedAt = profileData.createdAt || userDoc.data().createdAt || null;
            } else {
                // Pokud profil neexistuje, použít data z root dokumentu
                userData.name = userData.name || userData.email || 'Bez jména';
                userData.email = userData.email || 'Bez emailu';
                userData.balance = 0;
            }
            allUsers.push(userData);
        }
        
        console.log('Načteno uživatelů (s profily):', allUsers.length);
        
    } catch (error) {
        console.error('Chyba při načítání uživatelů:', error);
        throw error;
    }
}

// Načtení všech inzerátů
async function loadAllAds() {
    try {
        const { getDocs, collection, collectionGroup } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        allAds = [];
        
        // Zkusit collectionGroup
        try {
            const cgSnapshot = await getDocs(collectionGroup(window.firebaseDb, 'inzeraty'));
            console.log('CollectionGroup výsledek:', cgSnapshot.size, 'dokumentů');
            
            cgSnapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const userIdFromPath = docSnap.ref.parent && docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : undefined;
                if (!data.userId && userIdFromPath) data.userId = userIdFromPath;
                allAds.push({ id: docSnap.id, userId: data.userId || userIdFromPath, ...data });
            });
            
            console.log('Načteno inzerátů z users/{uid}/inzeraty:', allAds.length);
        } catch (cgError) {
            console.warn('Chyba při načítání přes collectionGroup:', cgError.message);
        }
        
        // Fallback na services
        if (allAds.length === 0) {
            try {
                const servicesSnapshot = await getDocs(collection(window.firebaseDb, 'services'));
                console.log('Services kolekce výsledek:', servicesSnapshot.size, 'dokumentů');
                
                servicesSnapshot.forEach((docSnap) => {
                    const data = docSnap.data() || {};
                    allAds.push({ id: docSnap.id, ...data });
                });
                
                console.log('Načteno inzerátů z fallback kolekce services:', allAds.length);
            } catch (servicesError) {
                console.warn('Chyba při načítání z kolekce services:', servicesError.message);
            }
        }
        
        // Pokud stále nic, projít všechny uživatele
        if (allAds.length === 0) {
            console.warn('Stále žádné inzeráty, zkouším projít všechny uživatele...');
            try {
                const usersSnapshot = await getDocs(collection(window.firebaseDb, 'users'));
                let totalAds = 0;
                
                for (const userDoc of usersSnapshot.docs) {
                    const userId = userDoc.id;
                    try {
                        const userAdsRef = collection(window.firebaseDb, 'users', userId, 'inzeraty');
                        const userAdsSnapshot = await getDocs(userAdsRef);
                        
                        userAdsSnapshot.forEach((adDoc) => {
                            const data = adDoc.data() || {};
                            allAds.push({
                                id: adDoc.id,
                                userId: userId,
                                ...data
                            });
                            totalAds++;
                        });
                    } catch (userError) {
                        console.warn(`Chyba při načítání inzerátů pro uživatele ${userId}:`, userError.message);
                    }
                }
                
                console.log('Načteno inzerátů procházením uživatelů:', totalAds);
            } catch (usersError) {
                console.error('Chyba při procházení uživatelů:', usersError);
            }
        }
        
        console.log('Celkem načteno inzerátů:', allAds.length);
    } catch (error) {
        console.error('Chyba při načítání inzerátů:', error);
        throw error;
    }
}

// Aktualizace statistik dashboardu
function updateDashboardStats() {
    const totalUsers = allUsers.length;
    const totalAds = allAds.length;
    const activeAds = allAds.filter(ad => ad.status === 'active' || !ad.status).length;
    const topAds = allAds.filter(ad => ad.isTop === true).length;
    const totalViews = allAds.reduce((sum, ad) => sum + (ad.views || 0), 0);
    const totalContacts = allAds.reduce((sum, ad) => sum + (ad.contacts || 0), 0);
    
    console.log('📊 Aktualizuji statistiky:', {
        totalUsers,
        totalAds,
        activeAds,
        topAds,
        totalViews,
        totalContacts
    });
    
    const totalUsersEl = document.getElementById('totalUsers');
    const totalAdsEl = document.getElementById('totalAds');
    const activeAdsEl = document.getElementById('activeAds');
    const topAdsEl = document.getElementById('topAds');
    const totalViewsEl = document.getElementById('totalViews');
    const totalContactsEl = document.getElementById('totalContacts');
    
    if (totalUsersEl) {
        totalUsersEl.textContent = totalUsers;
        console.log('✅ totalUsers aktualizováno:', totalUsers);
    } else {
        console.warn('⚠️ Element totalUsers nenalezen');
    }
    
    if (totalAdsEl) {
        totalAdsEl.textContent = totalAds;
        console.log('✅ totalAds aktualizováno:', totalAds);
    } else {
        console.warn('⚠️ Element totalAds nenalezen');
    }
    
    if (activeAdsEl) {
        activeAdsEl.textContent = activeAds;
        console.log('✅ activeAds aktualizováno:', activeAds);
    } else {
        console.warn('⚠️ Element activeAds nenalezen');
    }
    
    if (topAdsEl) {
        topAdsEl.textContent = topAds;
        console.log('✅ topAds aktualizováno:', topAds);
    } else {
        console.warn('⚠️ Element topAds nenalezen');
    }
    
    if (totalViewsEl) {
        totalViewsEl.textContent = totalViews.toLocaleString('cs-CZ');
        console.log('✅ totalViews aktualizováno:', totalViews);
    } else {
        console.warn('⚠️ Element totalViews nenalezen');
    }
    
    if (totalContactsEl) {
        totalContactsEl.textContent = totalContacts.toLocaleString('cs-CZ');
        console.log('✅ totalContacts aktualizováno:', totalContacts);
    } else {
        console.warn('⚠️ Element totalContacts nenalezen');
    }
}

// Aktualizace overview dashboardu
function updateDashboardOverview() {
    const totalUsers = allUsers.length;
    const totalAds = allAds.length;
    const activeAds = allAds.filter(ad => ad.status === 'active' || !ad.status).length;
    const topAds = allAds.filter(ad => ad.isTop === true).length;
    const totalViews = allAds.reduce((sum, ad) => sum + (ad.views || 0), 0);
    const totalContacts = allAds.reduce((sum, ad) => sum + (ad.contacts || 0), 0);
    const avgViews = totalAds > 0 ? Math.round(totalViews / totalAds) : 0;
    
    const usersWithAds = new Set(allAds.map(ad => ad.userId || ad.userId)).size;
    const usersWithoutAds = totalUsers - usersWithAds;
    
    console.log('📊 Aktualizuji overview:', {
        totalUsers,
        usersWithAds,
        usersWithoutAds,
        totalAds,
        activeAds,
        topAds,
        totalViews,
        avgViews,
        totalContacts
    });
    
    const overviewTotalUsersEl = document.getElementById('overviewTotalUsers');
    if (overviewTotalUsersEl) {
        overviewTotalUsersEl.textContent = totalUsers;
        document.getElementById('overviewUsersWithAds').textContent = usersWithAds;
        document.getElementById('overviewUsersWithoutAds').textContent = usersWithoutAds;
        document.getElementById('overviewTotalAds').textContent = totalAds;
        document.getElementById('overviewActiveAds').textContent = activeAds;
        document.getElementById('overviewTopAds').textContent = topAds;
        document.getElementById('overviewTotalViews').textContent = totalViews.toLocaleString('cs-CZ');
        document.getElementById('overviewAvgViews').textContent = avgViews;
        document.getElementById('overviewTotalContacts').textContent = totalContacts.toLocaleString('cs-CZ');
        console.log('✅ Overview aktualizováno');
    } else {
        console.warn('⚠️ Overview elementy nenalezeny - možná není dashboard zobrazen');
    }
}

// Zobrazení tabů
function showTab(tabName) {
    // Skrýt všechny taby
    document.querySelectorAll('.dashboard-tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Zobrazit vybraný tab
    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.closest('.tab-btn').classList.add('active');
    
    // Načíst data pro tab
    if (tabName === 'ads') {
        displayAllAds();
    } else if (tabName === 'stats') {
        displayStats();
    }
}

// Zobrazení všech inzerátů
function displayAllAds() {
    const grid = document.getElementById('adsGrid');
    
    if (allAds.length === 0) {
        grid.innerHTML = `
            <div class="no-ads">
                <i class="fas fa-list"></i>
                <h3>Žádné inzeráty</h3>
                <p>V systému nejsou žádné inzeráty.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = allAds.map(ad => createAdCard(ad)).join('');
}

// Vytvoření karty inzerátu
function createAdCard(ad) {
    const statusClass = ad.status === 'active' ? 'active' : 'inactive';
    const statusText = ad.status === 'active' ? 'Aktivní' : ad.status === 'inactive' ? 'Neaktivní' : 'Čekající';
    const topBadge = ad.isTop ? '<span class="top-badge"><i class="fas fa-fire"></i> TOP</span>' : '';
    const createdAt = ad.createdAt?.toDate ? ad.createdAt.toDate().toLocaleDateString('cs-CZ') : 'Neznámé';
    
    return `
        <div class="ad-card-admin">
            <div class="ad-card-header">
                <h3>${ad.title || 'Bez názvu'}</h3>
                ${topBadge}
            </div>
            <div class="ad-card-body">
                <p class="ad-description">${(ad.description || '').substring(0, 150)}${ad.description?.length > 150 ? '...' : ''}</p>
                <div class="ad-meta">
                    <span><i class="fas fa-map-marker-alt"></i> ${ad.location || 'Neuvedeno'}</span>
                    <span><i class="fas fa-tag"></i> ${ad.category || 'Neuvedeno'}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="ad-stats">
                    <span><i class="fas fa-eye"></i> ${ad.views || 0} zobrazení</span>
                    <span><i class="fas fa-comments"></i> ${ad.contacts || 0} kontaktů</span>
                    <span><i class="fas fa-calendar"></i> ${createdAt}</span>
                </div>
            </div>
            <div class="ad-card-actions">
                <button class="btn btn-primary" onclick="editAd('${ad.id}')">
                    <i class="fas fa-edit"></i> Upravit
                </button>
                <button class="btn btn-danger" onclick="deleteAd('${ad.id}')">
                    <i class="fas fa-trash"></i> Smazat
                </button>
            </div>
        </div>
    `;
}

// Filtrování inzerátů
function filterAds() {
    const searchTerm = document.getElementById('adsSearch').value.toLowerCase();
    const statusFilter = document.getElementById('adsStatusFilter').value;
    
    let filteredAds = allAds.filter(ad => {
        const matchesSearch = (ad.title || '').toLowerCase().includes(searchTerm) ||
                             (ad.description || '').toLowerCase().includes(searchTerm);
        const matchesStatus = !statusFilter || ad.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
    
    const grid = document.getElementById('adsGrid');
    if (filteredAds.length === 0) {
        grid.innerHTML = `
            <div class="no-ads">
                <i class="fas fa-list"></i>
                <h3>Žádné inzeráty</h3>
                <p>Nebyly nalezeny žádné inzeráty odpovídající filtru.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = filteredAds.map(ad => createAdCard(ad)).join('');
}

// Editace inzerátu
async function editAd(adId) {
    const ad = allAds.find(a => a.id === adId);
    if (!ad) return;
    
    document.getElementById('editAdId').value = adId;
    document.getElementById('editAdTitle').value = ad.title || '';
    document.getElementById('editAdDescription').value = ad.description || '';
    document.getElementById('editAdStatus').value = ad.status || 'active';
    document.getElementById('editAdCategory').value = ad.category || '';
    document.getElementById('editAdLocation').value = ad.location || '';
    
    document.getElementById('adEditModal').style.display = 'block';
}

// Zavření modalu pro editaci
function closeAdEditModal() {
    document.getElementById('adEditModal').style.display = 'none';
}

// Uložení změn inzerátu
async function saveAdChanges(e) {
    e.preventDefault();
    const adId = document.getElementById('editAdId').value;
    const formData = new FormData(e.target);
    
    try {
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Najít ad dokument (může být v users/{uid}/inzeraty/{adId})
        let adRef = null;
        for (const ad of allAds) {
            if (ad.id === adId) {
                // Zkusit najít přes userId
                if (ad.userId) {
                    adRef = doc(window.firebaseDb, 'users', ad.userId, 'inzeraty', adId);
                } else {
                    // Fallback na starou strukturu
                    adRef = doc(window.firebaseDb, 'services', adId);
                }
                break;
            }
        }
        
        if (!adRef) {
            throw new Error('Inzerát nenalezen');
        }
        
        await updateDoc(adRef, {
            title: formData.get('title'),
            description: formData.get('description'),
            status: formData.get('status'),
            category: formData.get('category'),
            location: formData.get('location'),
            updatedAt: new Date()
        });
        
        // Aktualizovat lokální data
        const adIndex = allAds.findIndex(a => a.id === adId);
        if (adIndex !== -1) {
            allAds[adIndex] = { ...allAds[adIndex], ...Object.fromEntries(formData) };
        }
        
        closeAdEditModal();
        displayAllAds();
        updateDashboardStats();
        showMessage('Inzerát úspěšně upraven!', 'success');
    } catch (error) {
        console.error('Chyba při ukládání inzerátu:', error);
        showMessage('Nepodařilo se uložit změny inzerátu.', 'error');
    }
}

// Mazání inzerátu
async function deleteAd(adId) {
    if (!confirm('Opravdu chcete smazat tento inzerát? Tato akce je nevratná.')) {
        return;
    }
    
    try {
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        // Najít ad dokument
        let adRef = null;
        for (const ad of allAds) {
            if (ad.id === adId) {
                if (ad.userId) {
                    adRef = doc(window.firebaseDb, 'users', ad.userId, 'inzeraty', adId);
                } else {
                    adRef = doc(window.firebaseDb, 'services', adId);
                }
                break;
            }
        }
        
        if (!adRef) {
            throw new Error('Inzerát nenalezen');
        }
        
        await deleteDoc(adRef);
        
        // Odstranit z lokálních dat
        allAds = allAds.filter(a => a.id !== adId);
        
        displayAllAds();
        updateDashboardStats();
        showMessage('Inzerát úspěšně smazán!', 'success');
    } catch (error) {
        console.error('Chyba při mazání inzerátu:', error);
        showMessage('Nepodařilo se smazat inzerát.', 'error');
    }
}

// Zobrazení statistik a doporučení
function displayStats() {
    const container = document.getElementById('statsContent');
    
    // Vypočítat statistiky
    const totalUsers = allUsers.length;
    const totalAds = allAds.length;
    const activeAds = allAds.filter(ad => ad.status === 'active' || !ad.status).length;
    const inactiveAds = allAds.filter(ad => ad.status === 'inactive').length;
    const topAds = allAds.filter(ad => ad.isTop === true).length;
    const usersWithAds = new Set(allAds.map(ad => ad.userId)).size;
    const usersWithoutAds = totalUsers - usersWithAds;
    const avgAdsPerUser = totalUsers > 0 ? (totalAds / totalUsers).toFixed(1) : 0;
    const totalViews = allAds.reduce((sum, ad) => sum + (ad.views || 0), 0);
    const avgViewsPerAd = totalAds > 0 ? (totalViews / totalAds).toFixed(1) : 0;
    
    // Doporučení
    const recommendations = [];
    if (usersWithoutAds > 0) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-users',
            title: 'Uživatelé bez inzerátů',
            text: `${usersWithoutAds} uživatelů nemá žádné inzeráty. Zvažte odeslání emailu s tipy, jak začít.`
        });
    }
    if (inactiveAds > activeAds * 0.3) {
        recommendations.push({
            type: 'info',
            icon: 'fa-exclamation-triangle',
            title: 'Mnoho neaktivních inzerátů',
            text: `${inactiveAds} inzerátů je neaktivních. Zkontrolujte, proč uživatelé své inzeráty deaktivovali.`
        });
    }
    if (avgViewsPerAd < 10) {
        recommendations.push({
            type: 'success',
            icon: 'fa-lightbulb',
            title: 'Nízká návštěvnost',
            text: `Průměrně ${avgViewsPerAd} zobrazení na inzerát. Zvažte zlepšení SEO a propagace.`
        });
    }
    if (topAds === 0 && totalAds > 10) {
        recommendations.push({
            type: 'info',
            icon: 'fa-fire',
            title: 'Žádné TOP inzeráty',
            text: 'Zvažte propagaci TOP funkcionality pro zvýšení příjmů.'
        });
    }
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-box">
                <h3><i class="fas fa-chart-pie"></i> Přehled</h3>
                <ul>
                    <li>Celkem uživatelů: <strong>${totalUsers}</strong></li>
                    <li>Uživatelé s inzeráty: <strong>${usersWithAds}</strong></li>
                    <li>Uživatelé bez inzerátů: <strong>${usersWithoutAds}</strong></li>
                    <li>Průměr inzerátů na uživatele: <strong>${avgAdsPerUser}</strong></li>
                </ul>
            </div>
            <div class="stat-box">
                <h3><i class="fas fa-list"></i> Inzeráty</h3>
                <ul>
                    <li>Celkem inzerátů: <strong>${totalAds}</strong></li>
                    <li>Aktivní: <strong>${activeAds}</strong></li>
                    <li>Neaktivní: <strong>${inactiveAds}</strong></li>
                    <li>TOP inzeráty: <strong>${topAds}</strong></li>
                </ul>
            </div>
            <div class="stat-box">
                <h3><i class="fas fa-eye"></i> Návštěvnost</h3>
                <ul>
                    <li>Celkem zobrazení: <strong>${totalViews.toLocaleString('cs-CZ')}</strong></li>
                    <li>Průměr na inzerát: <strong>${avgViewsPerAd}</strong></li>
                </ul>
            </div>
        </div>
        <div class="recommendations">
            <h3><i class="fas fa-lightbulb"></i> Doporučení</h3>
            ${recommendations.length > 0 ? recommendations.map(rec => `
                <div class="recommendation ${rec.type}">
                    <i class="fas ${rec.icon}"></i>
                    <div>
                        <strong>${rec.title}</strong>
                        <p>${rec.text}</p>
                    </div>
                </div>
            `).join('') : '<p>Všechno vypadá dobře! Žádná doporučení.</p>'}
        </div>
    `;
}

// Zobrazení uživatelů
function displayUsers(users) {
    const grid = document.getElementById('usersGrid');
    
    if (users.length === 0) {
        grid.innerHTML = `
            <div class="no-users">
                <i class="fas fa-users"></i>
                <h3>Žádní uživatelé</h3>
                <p>V systému nejsou žádní registrovaní uživatelé.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = users.map(user => createUserCard(user)).join('');
}

// Vytvoření karty uživatele
function createUserCard(user) {
    const userAds = allAds.filter(ad => ad.userId === user.uid);
    const activeAds = userAds.filter(ad => ad.status === 'active').length;
    
    const joinDate = user.createdAt?.toDate?.() || user.createdAt || user.profileCreatedAt?.toDate?.() || user.profileCreatedAt;
    const formattedDate = joinDate ? new Date(joinDate).toLocaleDateString('cs-CZ') : 'Neznámé';
    
    return `
        <div class="user-card" onclick="showUserDetails('${user.uid}')">
            <div class="user-card-header">
                <div class="user-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="user-info">
                    <h3>${user.name || 'Bez jména'}</h3>
                    <p>${user.email}</p>
                </div>
            </div>
            <div class="user-card-stats">
                <div class="stat-item">
                    <i class="fas fa-list"></i>
                    <span>${userAds.length} inzerátů</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-check-circle"></i>
                    <span>${activeAds} aktivních</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-calendar"></i>
                    <span>${formattedDate}</span>
                </div>
            </div>
            <div class="user-card-actions">
                <button class="btn btn-primary" onclick="event.stopPropagation(); showUserDetails('${user.uid}')">
                    <i class="fas fa-eye"></i> Zobrazit detaily
                </button>
            </div>
        </div>
    `;
}

// Filtrování uživatelů
function filterUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const filterValue = document.getElementById('userFilter').value;
    
    let filteredUsers = allUsers.filter(user => {
        const userId = user.uid || user.id;
        const matchesSearch = (user.name?.toLowerCase() || '').includes(searchTerm) || 
                             (user.email?.toLowerCase() || '').includes(searchTerm);
        
        let matchesFilter = true;
        if (filterValue === 'withAds') {
            const userAds = allAds.filter(ad => (ad.userId === userId) || (ad.userId === user.id));
            matchesFilter = userAds.length > 0;
        } else if (filterValue === 'withoutAds') {
            const userAds = allAds.filter(ad => (ad.userId === userId) || (ad.userId === user.id));
            matchesFilter = userAds.length === 0;
        }
        
        return matchesSearch && matchesFilter;
    });
    
    displayUsers(filteredUsers);
}

// Zobrazení detailů uživatele
function showUserDetails(userId) {
    console.log('Zobrazuji detaily uživatele:', userId);
    
    const user = allUsers.find(u => u.uid === userId);
    if (!user) {
        console.log('Uživatel nenalezen');
        return;
    }
    
    currentUserDetails = user;
    
    // Vyplnit informace o uživateli
    document.getElementById('userDetailName').textContent = user.name || 'Bez jména';
    document.getElementById('userDetailEmail').textContent = user.email;
    
    const joinDate = user.createdAt?.toDate?.() || user.createdAt;
    const formattedDate = joinDate ? new Date(joinDate).toLocaleDateString('cs-CZ') : 'Neznámé';
    document.getElementById('userDetailJoinDate').textContent = `Registrován: ${formattedDate}`;
    
    // Zobrazit zůstatek
    const balance = user.balance || 0;
    document.getElementById('userDetailBalance').textContent = `${balance.toLocaleString('cs-CZ')} Kč`;
    
    // Načíst inzeráty uživatele
    loadUserAds(userId);
    
    // Zobrazit modal
    document.getElementById('userDetailsModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Načtení inzerátů uživatele
function loadUserAds(userId) {
    const userAds = allAds.filter(ad => ad.userId === userId);
    const grid = document.getElementById('userAdsGrid');
    
    if (userAds.length === 0) {
        grid.innerHTML = `
            <div class="no-ads">
                <i class="fas fa-list"></i>
                <h3>Žádné inzeráty</h3>
                <p>Tento uživatel zatím nepřidal žádné inzeráty.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = userAds.map(ad => createUserAdCard(ad)).join('');
}

// Vytvoření karty inzerátu uživatele
function createUserAdCard(ad) {
    const categoryNames = {
        'technical': 'Technické služby',
        'it': 'IT služby',
        'design': 'Design a kreativita',
        'education': 'Vzdělávání',
        'home': 'Domácí služby',
        'transport': 'Doprava a logistika'
    };
    
    const statusColors = {
        'active': '#28a745',
        'inactive': '#dc3545',
        'paused': '#ffc107'
    };
    
    const statusTexts = {
        'active': 'Aktivní',
        'inactive': 'Neaktivní',
        'paused': 'Pozastaveno'
    };
    
    const createdDate = ad.createdAt?.toDate?.() || ad.createdAt;
    const formattedDate = createdDate ? new Date(createdDate).toLocaleDateString('cs-CZ') : 'Neznámé';
    
    return `
        <div class="user-ad-card">
            <div class="ad-header">
                <h4>${ad.title}</h4>
                <div class="ad-category">${categoryNames[ad.category] || ad.category}</div>
                <div class="ad-status" style="background-color: ${statusColors[ad.status]}; color: white; padding: 0.2rem 0.5rem; border-radius: 10px; font-size: 0.8rem; margin-top: 0.5rem;">
                    ${statusTexts[ad.status] || ad.status}
                </div>
            </div>
            <div class="ad-content">
                <p class="ad-description">${ad.description}</p>
                <div class="ad-details">
                    <div class="ad-detail">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${ad.location}</span>
                    </div>
                    ${ad.price ? `
                    <div class="ad-detail">
                        <i class="fas fa-tag"></i>
                        <span>${ad.price}</span>
                    </div>
                    ` : ''}
                    <div class="ad-detail">
                        <i class="fas fa-eye"></i>
                        <span>${ad.views || 0} zobrazení</span>
                    </div>
                    <div class="ad-detail">
                        <i class="fas fa-calendar"></i>
                        <span>Vytvořeno: ${formattedDate}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Zavření modalu s detaily uživatele
function closeUserDetailsModal() {
    document.getElementById('userDetailsModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    currentUserDetails = null;
}

// Admin odhlášení
function adminLogout() {
    localStorage.removeItem('adminLoggedIn');
    showLoginForm();
    showMessage('Úspěšně odhlášen z admin panelu.', 'success');
}

// Zobrazení modalu pro úpravu zůstatku
function showBalanceEditModal() {
    if (!currentUserDetails) return;
    
    const currentBalance = currentUserDetails.balance || 0;
    document.getElementById('newBalance').value = currentBalance;
    document.getElementById('balanceReason').value = '';
    
    document.getElementById('balanceEditModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Zavření modalu pro úpravu zůstatku
function closeBalanceEditModal() {
    document.getElementById('balanceEditModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Aktualizace zůstatku uživatele
async function updateUserBalance() {
    try {
        if (!currentUserDetails) return;
        
        const { updateDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const formData = new FormData(document.getElementById('balanceEditForm'));
        const newBalance = parseInt(formData.get('balance'));
        const reason = formData.get('reason') || 'Admin změna';
        
        // Aktualizovat profil users/{uid}/profile/profile
        await updateDoc(doc(window.firebaseDb, 'users', currentUserDetails.uid, 'profile', 'profile'), {
            balance: newBalance,
            lastBalanceUpdate: new Date(),
            balanceUpdateReason: reason
        });
        
        // Aktualizovat lokální data
        currentUserDetails.balance = newBalance;
        const userIndex = allUsers.findIndex(u => u.uid === currentUserDetails.uid);
        if (userIndex !== -1) {
            allUsers[userIndex].balance = newBalance;
        }
        
        // Aktualizovat zobrazení
        document.getElementById('userDetailBalance').textContent = `${newBalance.toLocaleString('cs-CZ')} Kč`;
        
        showMessage(`Zůstatek uživatele byl úspěšně změněn na ${newBalance.toLocaleString('cs-CZ')} Kč!`, 'success');
        closeBalanceEditModal();
        
    } catch (error) {
        console.error('Chyba při aktualizaci zůstatku:', error);
        showMessage('Nepodařilo se aktualizovat zůstatek.', 'error');
    }
}

// Zobrazení zprávy
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Event listenery
document.addEventListener('DOMContentLoaded', () => {
    // Zavření modalu při kliknutí mimo něj
    window.addEventListener('click', (e) => {
        const userDetailsModal = document.getElementById('userDetailsModal');
        const balanceEditModal = document.getElementById('balanceEditModal');
        
        if (e.target === userDetailsModal) {
            closeUserDetailsModal();
        }
        
        if (e.target === balanceEditModal) {
            closeBalanceEditModal();
        }
    });
});

// Export funkcí pro globální použití
window.showUserDetails = showUserDetails;
window.closeUserDetailsModal = closeUserDetailsModal;
window.showBalanceEditModal = showBalanceEditModal;
window.closeBalanceEditModal = closeBalanceEditModal;
window.updateUserBalance = updateUserBalance;
window.adminLogout = adminLogout;
