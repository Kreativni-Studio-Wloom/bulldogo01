// Plan management (profile-plan.html)
// Načtení, zrušení na konci období, vrácení zrušení, ruční aktualizace badge

async function plan_waitForFirebase() {
	return new Promise((resolve) => {
		(function wait(){
			if (window.firebaseAuth && window.firebaseDb) return resolve();
			setTimeout(wait, 100);
		})();
	});
}

async function plan_load() {
	await plan_waitForFirebase();
	loadCurrentPlan_profile();
	// Znovu načíst po inicializaci Auth (když currentUser naběhne později)
	try {
		if (window.firebaseAuth && typeof window.firebaseAuth.onAuthStateChanged === 'function') {
			window.firebaseAuth.onAuthStateChanged((u) => {
				if (u) loadCurrentPlan_profile();
			});
		}
	} catch (_) {}
}

document.addEventListener('DOMContentLoaded', plan_load);
window.addEventListener('pageshow', () => { loadCurrentPlan_profile(); });

function formatDaysDiff(a, b) {
	const ms = b.getTime() - a.getTime();
	return Math.max(0, Math.ceil(ms / (24*60*60*1000)));
}

async function loadCurrentPlan_profile() {
	try {
		const user = window.firebaseAuth && window.firebaseAuth.currentUser;
		const pPlan = document.getElementById('currentPlan');
		const pEnd = document.getElementById('currentPlanEnd');
		const pCancel = document.getElementById('currentPlanCancelAt');
		const cancelInfo = document.getElementById('cancelInfo');
		const btnCancel = document.getElementById('btnCancelPlan');
		const btnUndo = document.getElementById('btnUndoCancel');
		const pDuration = document.getElementById('currentPlanDuration');
		const pRemaining = document.getElementById('currentPlanRemaining');
		const statPlanBadge = document.getElementById('currentPlanBadge');
		const statPlanDays = document.getElementById('currentPlanDays');
		if (!user || !window.firebaseDb || !pPlan) return;
		const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
		const ref = doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile');
		const snap = await getDoc(ref);
		let plan = 'none', planPeriodEnd = null, planCancelAt = null, planDurationDays = null, planPeriodStart = null;
		if (snap.exists()) {
			const data = snap.data();
			plan = data.plan || 'none';
			planPeriodStart = data.planPeriodStart ? (data.planPeriodStart.toDate ? data.planPeriodStart.toDate() : new Date(data.planPeriodStart)) : null;
			planPeriodEnd = data.planPeriodEnd ? (data.planPeriodEnd.toDate ? data.planPeriodEnd.toDate() : new Date(data.planPeriodEnd)) : null;
			planDurationDays = data.planDurationDays || (planPeriodStart && planPeriodEnd ? formatDaysDiff(planPeriodStart, planPeriodEnd) : null);
			planCancelAt = data.planCancelAt ? (data.planCancelAt.toDate ? data.planCancelAt.toDate() : new Date(data.planCancelAt)) : null;
		}
		// Pokud plán vypršel, považuj ho za neaktivní
		if (planPeriodEnd && new Date() >= planPeriodEnd) {
			plan = 'none';
			planCancelAt = null;
		}
		const planLabel = plan === 'business' ? 'Firma' : plan === 'hobby' ? 'Hobby' : 'Žádný';
		pPlan.textContent = planLabel;
		pEnd.textContent = planPeriodEnd ? planPeriodEnd.toLocaleDateString('cs-CZ') : '-';
		if (pDuration) pDuration.textContent = planDurationDays ? `${planDurationDays} dní` : '-';
		if (pRemaining && planPeriodEnd) {
			pRemaining.textContent = `${formatDaysDiff(new Date(), planPeriodEnd)} dní`;
		} else if (pRemaining) {
			pRemaining.textContent = '-';
		}
		// Stat karty nahoře
		if (statPlanBadge) statPlanBadge.textContent = planLabel;
		if (statPlanDays) {
			statPlanDays.textContent = (plan !== 'none' && planPeriodEnd) ? String(formatDaysDiff(new Date(), planPeriodEnd)) : '-';
		}

		// Pokud není aktivní plán, nabídni přechod na výběr balíčku
		try {
			const manage = document.getElementById('manageSection');
			if (manage) {
				let empty = document.getElementById('noPlanNotice');
				if (plan === 'none') {
					if (!empty) {
						empty = document.createElement('div');
						empty.id = 'noPlanNotice';
						empty.className = 'no-plan-notice';
						empty.innerHTML = `
							<div class="no-plan-notice-icon">
								<i class="fas fa-box-open"></i>
							</div>
							<div class="no-plan-notice-content">
								<h3 class="no-plan-notice-title">Nemáte aktivní balíček</h3>
								<p class="no-plan-notice-text">Balíček si vyberete na stránce Balíčky.</p>
								<a href="packages.html" class="btn btn-primary btn-bulldogo">
									<i class="fas fa-box"></i>
									Přejít na balíčky
								</a>
							</div>
						`;
						manage.appendChild(empty);
					} else {
						empty.style.display = '';
					}
				} else if (empty) {
					empty.style.display = 'none';
				}
			}
		} catch (_) {}
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
	} catch (e) { console.error('plan_load:', e); }
}

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
		loadCurrentPlan_profile();
	} catch (e) { console.error('cancelPlan:', e); alert('Nepodařilo se naplánovat zrušení'); }
}

async function undoCancel() {
	try {
		const user = window.firebaseAuth && window.firebaseAuth.currentUser;
		if (!user || !window.firebaseDb) return;
		const { setDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
		const ref = doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile');
		await setDoc(ref, { planCancelAt: null }, { merge: true });
		alert('Zrušení bylo odebráno');
		loadCurrentPlan_profile();
	} catch (e) { console.error('undoCancel:', e); alert('Nepodařilo se zrušit naplánované zrušení'); }
}

async function refreshBadge() {
	try {
		const user = window.firebaseAuth && window.firebaseAuth.currentUser;
		if (!user) { showAuthModal('login'); return; }
		if (!window.firebaseDb) return;
		const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
		const ref = doc(window.firebaseDb, 'users', user.uid, 'profile', 'profile');
		const snap = await getDoc(ref);
		const plan = snap.exists() ? (snap.data().plan || localStorage.getItem('bdg_plan')) : localStorage.getItem('bdg_plan');
		if (plan) { try { localStorage.setItem('bdg_plan', plan); } catch (_) {} }
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
		alert('Odznak aktualizován' + (plan ? `: ${plan}` : ''));
		loadCurrentPlan_profile();
	} catch (e) { console.error('refreshBadge:', e); alert('Nepodařilo se aktualizovat odznak'); }
}

function updatePlanInfo() {
	loadCurrentPlan_profile();
	alert('Údaje o plánu aktualizovány');
}

// Otevřít Stripe Customer Portal (Firebase Stripe Extension)
async function openStripeCustomerPortal() {
	try {
		await plan_waitForFirebase();
		const user = window.firebaseAuth && window.firebaseAuth.currentUser;
		if (!user) { showAuthModal('login'); return; }
		if (!window.firebaseApp) { alert('Chyba: Firebase app není inicializována.'); return; }

		// UI loading overlay
		const btn = document.getElementById('btnManageSubscription');
		const prevDisabled = btn ? btn.disabled : false;
		const prevText = btn ? btn.innerHTML : null;
		if (btn) {
			btn.disabled = true;
			btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Otevírám…';
		}
		let overlay = document.getElementById('stripePortalLoading');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.id = 'stripePortalLoading';
			overlay.style.cssText = `
				position: fixed;
				inset: 0;
				background: rgba(17, 24, 39, 0.55);
				backdrop-filter: blur(4px);
				z-index: 99999;
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 24px;
			`;
			overlay.innerHTML = `
				<div style="background:#fff; border-radius:16px; padding:22px 20px; width:100%; max-width:420px; box-shadow:0 20px 60px rgba(0,0,0,.25); text-align:center;">
					<div style="font-size:28px; color:#f77c00; margin-bottom:12px;">
						<i class="fas fa-spinner fa-spin"></i>
					</div>
					<div style="font-weight:800; color:#111827; font-size:18px; margin-bottom:6px;">Otevírám správu předplatného</div>
					<div style="color:#6b7280; font-size:14px;">Za chvíli budete přesměrováni do Stripe.</div>
				</div>
			`;
			document.body.appendChild(overlay);
		} else {
			overlay.style.display = 'flex';
		}

		const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
		// Extension běží v us-central1
		const functions = getFunctions(window.firebaseApp, 'us-central1');
		const createPortalLink = httpsCallable(functions, 'ext-firestore-stripe-payments-createPortalLink');
		const returnUrl = window.location.origin + '/profile-plan.html';
		const res = await createPortalLink({ returnUrl, locale: 'auto' });
		const url = res?.data?.url;
		if (!url) throw new Error('Stripe portal URL nebyla vrácena.');
		window.location.assign(url);
	} catch (e) {
		console.error('openStripeCustomerPortal:', e);
		// Hide overlay + restore button on error
		try {
			const overlay = document.getElementById('stripePortalLoading');
			if (overlay) overlay.style.display = 'none';
		} catch (_) {}
		try {
			const btn = document.getElementById('btnManageSubscription');
			if (btn) {
				btn.disabled = false;
				// restore label (best effort)
				btn.innerHTML = '<i class="fas fa-credit-card"></i> Zrušit předplatné';
			}
		} catch (_) {}
		alert('Nepodařilo se otevřít správu předplatného. Zkuste to prosím znovu.');
	}
}

// export
window.openStripeCustomerPortal = openStripeCustomerPortal;
