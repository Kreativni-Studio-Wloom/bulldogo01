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
    
    const auth = window.firebaseAuth;
    if (!auth) {
        console.error('Firebase Auth není dostupné');
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Počkat na přihlášení uživatele pomocí onAuthStateChanged
    const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    
    onAuthStateChanged(auth, async (user) => {
        console.log('Auth state changed na statistiky.html:', user ? user.email : 'Odhlášen');
        
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
            await loadAllUsers();
            await loadAllAds();
            displayStats();
            
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
                userData.plan = profileData.plan || null; // Balíček uživatele
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
    
    // Statistiky návštěvnosti podle dnů (posledních 30 dní)
    const dailyViewsStats = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateKey = date.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
        dailyViewsStats[dateKey] = 0;
    }
    // Simulace návštěvnosti z views (v reálném případě by to mělo být z analytics)
    allAds.forEach(ad => {
        if (ad.views && ad.views > 0) {
            const adDate = ad.createdAt?.toDate ? ad.createdAt.toDate() : (ad.createdAt ? new Date(ad.createdAt) : new Date());
            const daysSinceCreation = Math.floor((now - adDate) / (1000 * 60 * 60 * 24));
            if (daysSinceCreation >= 0 && daysSinceCreation < 30) {
                const dateKey = new Date(adDate.getTime() + daysSinceCreation * 24 * 60 * 60 * 1000).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
                if (dailyViewsStats[dateKey] !== undefined) {
                    dailyViewsStats[dateKey] += Math.floor(ad.views / 30); // Rozdělit views na dny
                }
            }
        }
    });
    
    // Statistiky prodeje balíčků
    const packageStats = {};
    allUsers.forEach(user => {
        const plan = user.plan || 'bez_planu';
        packageStats[plan] = (packageStats[plan] || 0) + 1;
    });
    
    // TOP inzeráty statistiky (nejoblíbenější kategorie a lokace)
    const topAdsList = allAds.filter(ad => ad.isTop === true);
    const topCategoryStats = {};
    const topLocationStats = {};
    topAdsList.forEach(ad => {
        const cat = ad.category || 'Neuvedeno';
        const loc = ad.location || 'Neuvedeno';
        topCategoryStats[cat] = (topCategoryStats[cat] || 0) + 1;
        topLocationStats[loc] = (topLocationStats[loc] || 0) + 1;
    });
    
    // TOP inzeráty podle zobrazení
    const topAdsByViews = [...allAds].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    
    // Inteligentní doporučení podle aktuálního stavu
    const recommendations = generateIntelligentRecommendations({
        totalUsers,
        totalAds,
        activeAds,
        inactiveAds,
        topAds,
        usersWithAds,
        usersWithoutAds,
        avgViewsPerAd: parseFloat(avgViewsPerAd),
        totalViews,
        totalContacts,
        packageStats,
        topAdsList,
        avgAdsPerUser: parseFloat(avgAdsPerUser)
    });
    
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
        
        <div class="stats-grid" style="margin-top: 2rem;">
            <div class="stat-box">
                <h3><i class="fas fa-shopping-cart"></i> Prodeje balíčků</h3>
                <ul>
                    ${Object.entries(packageStats).map(([plan, count]) => {
                        const planName = plan === 'bez_planu' ? 'Bez balíčku' : 
                                        plan === 'basic' ? 'Základní' :
                                        plan === 'premium' ? 'Prémiový' :
                                        plan === 'enterprise' ? 'Enterprise' : plan;
                        return `<li>${planName}: <strong>${count}</strong></li>`;
                    }).join('')}
                    <li>Celkem s balíčkem: <strong>${totalUsers - (packageStats['bez_planu'] || 0)}</strong></li>
                </ul>
            </div>
            <div class="stat-box">
                <h3><i class="fas fa-fire"></i> TOP inzeráty</h3>
                <ul>
                    <li>Celkem TOP: <strong>${topAds}</strong></li>
                    <li>Nejoblíbenější kategorie: <strong>${Object.keys(topCategoryStats).length > 0 ? Object.entries(topCategoryStats).sort((a, b) => b[1] - a[1])[0][0] : 'Žádná'}</strong></li>
                    <li>Nejoblíbenější lokace: <strong>${Object.keys(topLocationStats).length > 0 ? Object.entries(topLocationStats).sort((a, b) => b[1] - a[1])[0][0] : 'Žádná'}</strong></li>
                    <li>Průměr zobrazení TOP: <strong>${topAds > 0 ? Math.round(topAdsList.reduce((sum, ad) => sum + (ad.views || 0), 0) / topAds) : 0}</strong></li>
                </ul>
            </div>
        </div>
        
        <div class="charts-section">
            <h2><i class="fas fa-chart-line"></i> Grafy</h2>
            <div class="charts-grid">
                <div class="chart-container">
                    <h3>Návštěvnost (posledních 30 dní)</h3>
                    <canvas id="trafficChart"></canvas>
                </div>
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
                <div class="chart-container">
                    <h3>Prodeje balíčků</h3>
                    <canvas id="packageChart"></canvas>
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
    createCharts(categoryStats, locationStats, monthlyStats, { activeAds, inactiveAds, topAds }, dailyViewsStats, packageStats);
}

// Vytvoření grafů
function createCharts(categoryStats, locationStats, monthlyStats, statusStats, dailyViewsStats, packageStats) {
    // Zničit existující grafy
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};
    
    // Graf návštěvnosti
    const trafficCtx = document.getElementById('trafficChart');
    if (trafficCtx) {
        const labels = Object.keys(dailyViewsStats);
        const data = Object.values(dailyViewsStats);
        charts.traffic = new Chart(trafficCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Zobrazení',
                    data: data,
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
    
    // Graf prodeje balíčků
    const packageCtx = document.getElementById('packageChart');
    if (packageCtx && packageStats) {
        const packageLabels = Object.keys(packageStats).map(plan => {
            return plan === 'bez_planu' ? 'Bez balíčku' : 
                   plan === 'basic' ? 'Základní' :
                   plan === 'premium' ? 'Prémiový' :
                   plan === 'enterprise' ? 'Enterprise' : plan;
        });
        const packageData = Object.values(packageStats);
        charts.package = new Chart(packageCtx, {
            type: 'doughnut',
            data: {
                labels: packageLabels,
                datasets: [{
                    data: packageData,
                    backgroundColor: [
                        'rgba(156, 163, 175, 0.8)',
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(247, 124, 0, 0.8)',
                        'rgba(139, 92, 246, 0.8)'
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

// Generování inteligentních doporučení
function generateIntelligentRecommendations(stats) {
    const recommendations = [];
    const { totalUsers, totalAds, activeAds, inactiveAds, topAds, usersWithAds, usersWithoutAds, avgViewsPerAd, totalViews, totalContacts, packageStats, topAdsList, avgAdsPerUser } = stats;
    
    // 1. Uživatelé bez inzerátů
    if (usersWithoutAds > totalUsers * 0.5 && totalUsers > 10) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-users',
            priority: 1,
            title: 'Vysoký podíl uživatelů bez inzerátů',
            text: `${Math.round(usersWithoutAds / totalUsers * 100)}% uživatelů nemá žádné inzeráty. Zvažte onboarding email, tutorial nebo motivaci pro první inzerát.`
        });
    } else if (usersWithoutAds > 0 && totalUsers <= 10) {
        recommendations.push({
            type: 'info',
            icon: 'fa-users',
            priority: 3,
            title: 'Uživatelé bez inzerátů',
            text: `${usersWithoutAds} uživatelů nemá žádné inzeráty. Zvažte odeslání emailu s tipy, jak začít.`
        });
    }
    
    // 2. Nízká aktivita
    if (totalAds === 0 && totalUsers > 0) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-rocket',
            priority: 1,
            title: 'Žádné inzeráty',
            text: 'Máte uživatele, ale žádné inzeráty. Začněte propagovat platformu a motivovat uživatele k vytváření prvních inzerátů.'
        });
    }
    
    // 3. Nízká návštěvnost
    if (avgViewsPerAd < 5 && totalAds > 5) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-eye',
            priority: 1,
            title: 'Velmi nízká návštěvnost',
            text: `Průměrně pouze ${avgViewsPerAd} zobrazení na inzerát. Zvažte SEO optimalizaci, propagaci na sociálních sítích nebo zlepšení vyhledávání.`
        });
    } else if (avgViewsPerAd < 10 && totalAds > 0) {
        recommendations.push({
            type: 'info',
            icon: 'fa-lightbulb',
            priority: 2,
            title: 'Nízká návštěvnost',
            text: `Průměrně ${avgViewsPerAd} zobrazení na inzerát. Zvažte zlepšení SEO nebo propagaci.`
        });
    }
    
    // 4. Neaktivní inzeráty
    if (inactiveAds > activeAds && totalAds > 10) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-exclamation-triangle',
            priority: 1,
            title: 'Více neaktivních než aktivních inzerátů',
            text: `${inactiveAds} neaktivních vs ${activeAds} aktivních. Zkontrolujte, proč uživatelé deaktivují inzeráty a zvažte zlepšení UX.`
        });
    } else if (inactiveAds > activeAds * 0.3 && totalAds > 5) {
        recommendations.push({
            type: 'info',
            icon: 'fa-exclamation-triangle',
            priority: 2,
            title: 'Mnoho neaktivních inzerátů',
            text: `${Math.round(inactiveAds / totalAds * 100)}% inzerátů je neaktivních. Zkontrolujte důvody deaktivace.`
        });
    }
    
    // 5. TOP inzeráty
    if (topAds === 0 && totalAds > 20) {
        recommendations.push({
            type: 'info',
            icon: 'fa-fire',
            priority: 2,
            title: 'Žádné TOP inzeráty',
            text: 'Zvažte propagaci TOP funkcionality pro zvýšení příjmů. Můžete vytvořit speciální nabídku nebo slevu.'
        });
    } else if (topAds > 0 && topAds < totalAds * 0.1) {
        recommendations.push({
            type: 'success',
            icon: 'fa-fire',
            priority: 3,
            title: 'TOP inzeráty fungují',
            text: `${topAds} TOP inzerátů (${Math.round(topAds / totalAds * 100)}%). Zvažte propagaci této funkcionality pro více uživatelů.`
        });
    }
    
    // 6. Prodeje balíčků
    const usersWithPackages = totalUsers - (packageStats['bez_planu'] || 0);
    if (usersWithPackages === 0 && totalUsers > 10) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-shopping-cart',
            priority: 1,
            title: 'Žádné prodeje balíčků',
            text: 'Žádný uživatel nemá aktivní balíček. Zvažte propagaci balíčků nebo speciální nabídku pro první zákazníky.'
        });
    } else if (usersWithPackages < totalUsers * 0.1 && totalUsers > 20) {
        recommendations.push({
            type: 'info',
            icon: 'fa-shopping-cart',
            priority: 2,
            title: 'Nízký počet prodejů balíčků',
            text: `Pouze ${Math.round(usersWithPackages / totalUsers * 100)}% uživatelů má balíček. Zvažte zlepšení propagace nebo cenové strategie.`
        });
    }
    
    // 7. Průměr inzerátů na uživatele
    if (avgAdsPerUser < 1 && usersWithAds > 0) {
        recommendations.push({
            type: 'info',
            icon: 'fa-list',
            priority: 2,
            title: 'Nízký počet inzerátů na uživatele',
            text: `Průměrně ${avgAdsPerUser} inzerátů na uživatele. Zvažte motivaci uživatelů k vytváření více inzerátů.`
        });
    }
    
    // 8. Kontakty
    if (totalContacts === 0 && totalAds > 5) {
        recommendations.push({
            type: 'warning',
            icon: 'fa-comments',
            priority: 1,
            title: 'Žádné kontakty',
            text: 'Uživatelé nevyužívají kontaktní funkci. Zkontrolujte, zda je funkce snadno dostupná a funkční.'
        });
    }
    
    // Seřadit podle priority
    recommendations.sort((a, b) => a.priority - b.priority);
    
    return recommendations;
}

