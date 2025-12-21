// Statistiky - Admin stránka
let allUsers = [];
let allAds = [];
let charts = {};

// Inicializace
document.addEventListener('DOMContentLoaded', () => {
    const checkFirebase = setInterval(() => {
        if (window.firebaseAuth && window.firebaseDb) {
            initStatsPage();
            clearInterval(checkFirebase);
        }
    }, 100);
});

async function initStatsPage() {
    console.log('Inicializuji stránku statistik...');
    
    // Zkontrolovat admin status
    const auth = window.firebaseAuth;
    if (!auth || !auth.currentUser) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    const isAdmin = await checkAdminStatus(auth.currentUser.uid);
    if (!isAdmin) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Načíst data
    await loadAllUsers();
    await loadAllAds();
    displayStats();
    
    // Zobrazit admin menu
    if (typeof window.checkAndShowAdminMenu === 'function') {
        setTimeout(() => window.checkAndShowAdminMenu(), 500);
    }
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
        if (window.firebaseAuth?.currentUser?.email && adminEmails.includes(window.firebaseAuth.currentUser.email.toLowerCase())) {
            return true;
        }
        return false;
    } catch (error) {
        console.error('Chyba při kontrole admin statusu:', error);
        return false;
    }
}

// Načtení všech uživatelů
async function loadAllUsers() {
    try {
        const { getDocs, getDoc, collection, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const usersSnapshot = await getDocs(collection(window.firebaseDb, 'users'));
        allUsers = [];
        
        for (const userDoc of usersSnapshot.docs) {
            const userData = { id: userDoc.id, uid: userDoc.id, ...userDoc.data() };
            const profileRef = doc(window.firebaseDb, 'users', userDoc.id, 'profile', 'profile');
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
                const profileData = profileSnap.data();
                userData.name = profileData.name || userData.name || userDoc.data().email || 'Bez jména';
                userData.email = profileData.email || userData.email || userDoc.data().email || 'Bez emailu';
            }
            allUsers.push(userData);
        }
        
        console.log('Načteno uživatelů:', allUsers.length);
    } catch (error) {
        console.error('Chyba při načítání uživatelů:', error);
    }
}

// Načtení všech inzerátů
async function loadAllAds() {
    try {
        const { getDocs, collection, collectionGroup } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const cgSnapshot = await getDocs(collectionGroup(window.firebaseDb, 'inzeraty'));
        allAds = [];
        
        cgSnapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const userIdFromPath = docSnap.ref.parent && docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : undefined;
            if (!data.userId && userIdFromPath) data.userId = userIdFromPath;
            allAds.push({ id: docSnap.id, ...data });
        });
        
        if (allAds.length === 0) {
            const servicesSnapshot = await getDocs(collection(window.firebaseDb, 'services'));
            servicesSnapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                allAds.push({ id: docSnap.id, ...data });
            });
        }
        
        console.log('Načteno inzerátů:', allAds.length);
    } catch (error) {
        console.error('Chyba při načítání inzerátů:', error);
    }
}

// Zobrazení statistik
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
    const totalContacts = allAds.reduce((sum, ad) => sum + (ad.contacts || 0), 0);
    
    // Statistiky podle kategorií
    const categoryStats = {};
    allAds.forEach(ad => {
        const cat = ad.category || 'Neuvedeno';
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    });
    
    // Statistiky podle lokací
    const locationStats = {};
    allAds.forEach(ad => {
        const loc = ad.location || 'Neuvedeno';
        locationStats[loc] = (locationStats[loc] || 0) + 1;
    });
    
    // Statistiky podle měsíců (nové inzeráty)
    const monthlyStats = {};
    allAds.forEach(ad => {
        const date = ad.createdAt?.toDate ? ad.createdAt.toDate() : (ad.createdAt ? new Date(ad.createdAt) : new Date());
        const month = date.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
        monthlyStats[month] = (monthlyStats[month] || 0) + 1;
    });
    
    // Doporučení
    const recommendations = [];
    if (usersWithoutAds > 0) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-users',
            title: 'Uživatelé bez inzerátů',
            text: `${usersWithoutAds} uživatelů nemá žádné inzeráty. Zvažte odeslání emailu s tipy, jak začít, nebo vytvořte onboarding proces.`
        });
    }
    if (inactiveAds > activeAds * 0.3) {
        recommendations.push({
            type: 'info',
            icon: 'fa-exclamation-triangle',
            title: 'Mnoho neaktivních inzerátů',
            text: `${inactiveAds} inzerátů je neaktivních (${Math.round(inactiveAds / totalAds * 100)}%). Zkontrolujte, proč uživatelé své inzeráty deaktivovali a zvažte zlepšení UX.`
        });
    }
    if (avgViewsPerAd < 10 && totalAds > 0) {
        recommendations.push({
            type: 'success',
            icon: 'fa-lightbulb',
            title: 'Nízká návštěvnost',
            text: `Průměrně ${avgViewsPerAd} zobrazení na inzerát. Zvažte zlepšení SEO, propagaci na sociálních sítích nebo optimalizaci vyhledávání.`
        });
    }
    if (topAds === 0 && totalAds > 10) {
        recommendations.push({
            type: 'info',
            icon: 'fa-fire',
            title: 'Žádné TOP inzeráty',
            text: 'Zvažte propagaci TOP funkcionality pro zvýšení příjmů. Můžete vytvořit speciální nabídku nebo slevu pro první TOP inzeráty.'
        });
    }
    if (totalAds === 0) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-rocket',
            title: 'Začněte s propagací',
            text: 'V systému zatím nejsou žádné inzeráty. Začněte propagovat platformu a motivovat uživatele k vytváření prvních inzerátů.'
        });
    }
    if (totalUsers === 0) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-user-plus',
            title: 'Potřebujete více uživatelů',
            text: 'V systému zatím nejsou žádní uživatelé. Začněte s marketingovou kampaní a přilákejte první uživatele.'
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
                    <li>Celkem kontaktů: <strong>${totalContacts.toLocaleString('cs-CZ')}</strong></li>
                </ul>
            </div>
        </div>
        
        <div class="charts-section">
            <h2><i class="fas fa-chart-line"></i> Grafy</h2>
            <div class="charts-grid">
                <div class="chart-container">
                    <h3>Inzeráty podle kategorií</h3>
                    <canvas id="categoryChart"></canvas>
                </div>
                <div class="chart-container">
                    <h3>Inzeráty podle lokací</h3>
                    <canvas id="locationChart"></canvas>
                </div>
                <div class="chart-container">
                    <h3>Nové inzeráty podle měsíců</h3>
                    <canvas id="monthlyChart"></canvas>
                </div>
                <div class="chart-container">
                    <h3>Stav inzerátů</h3>
                    <canvas id="statusChart"></canvas>
                </div>
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
    
    // Vytvořit grafy
    createCharts(categoryStats, locationStats, monthlyStats, { activeAds, inactiveAds, topAds });
}

// Vytvoření grafů
function createCharts(categoryStats, locationStats, monthlyStats, statusStats) {
    // Zničit existující grafy
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};
    
    // Graf kategorií
    const categoryCtx = document.getElementById('categoryChart');
    if (categoryCtx) {
        const categoryLabels = Object.keys(categoryStats).slice(0, 10);
        const categoryData = categoryLabels.map(cat => categoryStats[cat]);
        charts.category = new Chart(categoryCtx, {
            type: 'bar',
            data: {
                labels: categoryLabels,
                datasets: [{
                    label: 'Počet inzerátů',
                    data: categoryData,
                    backgroundColor: 'rgba(247, 124, 0, 0.8)',
                    borderColor: 'rgba(247, 124, 0, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    // Graf lokací
    const locationCtx = document.getElementById('locationChart');
    if (locationCtx) {
        const locationLabels = Object.keys(locationStats).slice(0, 10);
        const locationData = locationLabels.map(loc => locationStats[loc]);
        charts.location = new Chart(locationCtx, {
            type: 'doughnut',
            data: {
                labels: locationLabels,
                datasets: [{
                    data: locationData,
                    backgroundColor: [
                        'rgba(247, 124, 0, 0.8)',
                        'rgba(255, 215, 0, 0.8)',
                        'rgba(255, 138, 0, 0.8)',
                        'rgba(255, 165, 0, 0.8)',
                        'rgba(255, 200, 0, 0.8)',
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true
            }
        });
    }
    
    // Graf měsíců
    const monthlyCtx = document.getElementById('monthlyChart');
    if (monthlyCtx) {
        const monthlyLabels = Object.keys(monthlyStats).slice(-6);
        const monthlyData = monthlyLabels.map(month => monthlyStats[month]);
        charts.monthly = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: monthlyLabels,
                datasets: [{
                    label: 'Nové inzeráty',
                    data: monthlyData,
                    borderColor: 'rgba(247, 124, 0, 1)',
                    backgroundColor: 'rgba(247, 124, 0, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
    
    // Graf stavů
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx) {
        charts.status = new Chart(statusCtx, {
            type: 'pie',
            data: {
                labels: ['Aktivní', 'Neaktivní', 'TOP'],
                datasets: [{
                    data: [statusStats.activeAds, statusStats.inactiveAds, statusStats.topAds],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(255, 215, 0, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true
            }
        });
    }
}

