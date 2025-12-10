// Instagram-like chat: pouze frontend (UI), připraveno na API integraci
// - Levý panel: konverzace
// - Pravý panel: aktivní chat (bubliny, avatar, timestamp)
// - Posílání textu + až 5 obrázků (náhledy)
// - Psaní jen pro přihlášené (gating přes Firebase auth)

console.log('💬 IG Chat: init');

/** Stav **/
let igCurrentUser = null;                 // přihlášený uživatel
let igConversations = [];                 // seznam konverzací (z Firestore)
let igMessagesByConvId = {};              // zprávy podle ID konverzace (cache)
let igSelectedConvId = null;              // aktivní konverzace
let igSelectedFiles = [];                 // vybrané obrázky pro aktuální zprávu
let igUnsubConvs = null;                  // odpojení listeneru konverzací
let igUnsubMsgs = null;                   // odpojení listeneru zpráv

/** Pomocné **/
function igFormatTime(date) {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}
function igParams() { return new URLSearchParams(window.location.search); }

/** Inicializace po načtení DOM + auth watcher **/
document.addEventListener('DOMContentLoaded', async () => {
	// Firebase auth (pokud je k dispozici)
	try {
		if (window.firebaseAuth) {
        const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        onAuthStateChanged(window.firebaseAuth, (user) => {
				igCurrentUser = user || null;
				igUpdateGating();
				if (igCurrentUser) {
					igStartConversationsListener(igCurrentUser.uid);
					// Po přihlášení zkusit zpracovat deep link znovu (pokud je v URL)
					igHandleDeepLink();
				} else {
					if (igUnsubConvs) { igUnsubConvs(); igUnsubConvs = null; }
					if (igUnsubMsgs) { igUnsubMsgs(); igUnsubMsgs = null; }
					igConversations = [];
					igRenderConversations();
					igRenderRightAds(); // Reset pravého panelu
					const box = igQ('igMessages'); if (box) box.innerHTML = '<div class="ig-empty">Vyberte konverzaci vlevo nebo začněte novou.</div>';
				}
			});
		}
	} catch (_) {}

	igInitUI();
	igHandleDeepLink();
	igRenderConversations();
	igRenderRightAds(); // Načte se až při výběru konverzace
	igUpdateGating();
});

/** UI prvky **/
function igQ(id) { return document.getElementById(id); }

function igInitUI() {
	const backBtn = igQ('igBackBtn');
	if (backBtn) backBtn.addEventListener('click', () => {
		window.history.back?.();
	});
	const openProfile = igQ('igOpenProfile');
	if (openProfile) openProfile.addEventListener('click', () => {
		igOpenPeerProfile();
	});

	const input = igQ('igText');
	const send = igQ('igSend');
	const files = igQ('igFiles');
	if (input) {
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				igHandleSend();
			}
		});
	}
	if (send) {
		send.addEventListener('click', (e) => { e.preventDefault(); igHandleSend(); });
	}
	if (files) {
		files.addEventListener('change', () => {
			const selected = Array.from(files.files || []);
			igSelectedFiles = selected.slice(0, 5);
			igRenderFilePreview();
		});
	}
	const search = igQ('igSearch');
	if (search) search.addEventListener('input', igFilterConversations);
}

/** Realtime konverzace aktuálního uživatele z Firestore **/
async function igStartConversationsListener(uid) {
	try {
		if (!window.firebaseDb) return;
		const { collection, query, where, onSnapshot, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
		const chatsRef = collection(window.firebaseDb, 'chats');
		const q = query(chatsRef, where('participants', 'array-contains', uid));
		if (igUnsubConvs) { igUnsubConvs(); igUnsubConvs = null; }
		igUnsubConvs = onSnapshot(q, async (snap) => {
			// Nejdříve vytvoř základní seznam konverzací
			const conversations = snap.docs.map(d => {
				const data = d.data() || {};
				const otherId = (data.participants || []).find(p => p !== uid) || '';
				return {
					id: d.id,
					title: data.peerName || 'Načítám...',
					last: data.lastMessage || '',
					time: data.lastAt?.toDate?.() || new Date(0),
					avatar: data.peerAvatar || '',
					peerId: otherId,
					participants: data.participants || []
				};
			}).sort((a,b) => (b.time?.getTime?.()||0) - (a.time?.getTime?.()||0));
			
			// Zobrazit ihned se základními daty
			igConversations = conversations;
			igRenderConversations();
			
            // Načíst jména (a avatar) uživatelů asynchronně
			for (let conv of conversations) {
				if (conv.peerId) {
					try {
						// Zkusit načíst z profilu
						const profileRef = doc(window.firebaseDb, 'users', conv.peerId, 'profile', 'profile');
						const profileSnap = await getDoc(profileRef);
						let userName = null;
                        let avatarUrl = null;
						
						if (profileSnap.exists()) {
							const profileData = profileSnap.data();
							userName = profileData.name || profileData.email;
                            avatarUrl = profileData.photoURL || profileData.avatarUrl || '';
						} else {
							// Fallback - zkusit users dokument
							const userRef = doc(window.firebaseDb, 'users', conv.peerId);
							const userSnap = await getDoc(userRef);
							if (userSnap.exists()) {
								userName = userSnap.data().email;
							}
						}
						
						if (userName) {
							// Aktualizovat název konverzace
							const convIndex = igConversations.findIndex(c => c.id === conv.id);
							if (convIndex !== -1) {
								igConversations[convIndex].title = userName;
                                if (avatarUrl) igConversations[convIndex].avatar = avatarUrl;
								igRenderConversations();
							}
						}
					} catch (e) {
						console.warn(`⚠️ Nepodařilo se načíst jméno pro ${conv.peerId}:`, e);
					}
				}
			}
		}, (err) => console.warn('Chats listener error:', err));
	} catch (e) {
		console.warn('igStartConversationsListener failed', e);
	}
}

/** Deep link: ?userId=...&listingId=...&listingTitle=... **/
function igHandleDeepLink() {
	const p = igParams();
	const userId = p.get('userId');
	const listingTitle = p.get('listingTitle');
	const listingId = p.get('listingId');
	// Zajistit/otevřít konverzaci s daným uživatelem (pokud je přihlášeno)
	if (userId && igCurrentUser) {
		igEnsureChatWith(userId, listingId, listingTitle).then((chatId) => {
			if (chatId) {
				igSelectedConvId = chatId;
				// Předat userId pro načtení inzerátů (pro případ, že konverzace ještě není v seznamu)
				igOpenConversation(chatId, userId);
			}
		}).catch(()=>{});
	}
	// Zobrazit předmět (ad title) nad zprávami
	if (listingTitle) {
		const subject = igQ('igSubject');
		const subjectText = igQ('igSubjectText');
		if (subject && subjectText) {
			// Pokud máme ID inzerátu, udělat z předmětu odkaz na detail inzerátu
			if (listingId) {
				const a = document.createElement('a');
				a.href = `ad-detail.html?id=${encodeURIComponent(listingId)}&userId=${encodeURIComponent(userId || '')}`;
				a.textContent = listingTitle;
				a.target = '_blank';
				a.rel = 'noopener';
				subjectText.innerHTML = '';
				subjectText.appendChild(a);
			} else {
				subjectText.textContent = listingTitle;
			}
			subject.style.display = 'inline-flex';
		}
		// Předvyplnit placeholder i samotný text zprávy
		const input = igQ('igText');
		if (input) {
			if (!input.placeholder) input.placeholder = 'K inzerátu: ' + listingTitle;
			if (!input.value) input.value = 'K inzerátu: ' + listingTitle + ' – ';
		}
	}
}

// Zajistit existenci chat dokumentu mezi aktuálním uživatelem a protistranou
async function igEnsureChatWith(peerUid, listingId, listingTitle) {
	try {
		if (!igCurrentUser || !window.firebaseDb) return null;
		const a = igCurrentUser.uid;
		const b = peerUid;
		const chatId = [a, b].sort().join('_');
		const { doc, getDoc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
		const ref = doc(window.firebaseDb, 'chats', chatId);
		const snap = await getDoc(ref);
		if (!snap.exists()) {
			await setDoc(ref, {
				participants: [a, b],
				lastMessage: '',
				lastAt: serverTimestamp(),
				createdAt: serverTimestamp(),
				listingId: listingId || null,
				listingTitle: listingTitle || null
			}, { merge: true });
		}
		return chatId;
	} catch (e) {
		console.warn('igEnsureChatWith failed', e);
		return null;
	}
}

/** Pravý panel – 3 nejnovější inzeráty daného uživatele **/
async function igRenderRightAds(peerUserId = null) {
	const el = igQ('igRightAds');
	if (!el) return;
	
	console.log('📋 igRenderRightAds volána s peerUserId:', peerUserId);
	
	// Pokud není zadán peerUserId, zobrazit prázdný stav
	if (!peerUserId) {
		console.warn('⚠️ peerUserId je null, zobrazuji prázdný stav');
		el.innerHTML = '<div style="padding:12px; color:#6b7280;">Vyberte konverzaci pro zobrazení inzerátů</div>';
		return;
	}
	
	try {
		// Počkat na inicializaci Firebasu (až 3s)
		let tries = 0;
		while (!window.firebaseDb && tries < 30) {
			await new Promise(r => setTimeout(r, 100));
			tries++;
		}
		if (!window.firebaseDb) throw new Error('Firestore není inicializován');
		
		// Načíst inzeráty konkrétního uživatele
		const { collection, getDocs, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
		const inzeraty = collection(window.firebaseDb, 'users', peerUserId, 'inzeraty');
		const q = query(inzeraty, orderBy('createdAt', 'desc'), limit(3));
		const snap = await getDocs(q);
		if (snap.empty) {
			el.innerHTML = '<div style="padding:12px; color:#6b7280;">Zatím žádné inzeráty</div>';
			return;
		}
        const items = [];
        snap.forEach(doc => {
			const d = doc.data() || {};
			const userRef = doc.ref.parent?.parent;
			const userId = userRef?.id || '';
			const title = d.title || 'Bez názvu';
			const location = d.location || 'Neuvedeno';
			const category = d.category || '';
			const price = d.price || '';
			
			// TOP badge s oranžovo-žlutým gradientem (barvy webu)
			const topBadge = d.isTop ? `
				<span style="
					background: linear-gradient(135deg, #f77c00 0%, #fdf002 100%);
					color: #111827;
					padding: 2px 8px;
					border-radius: 12px;
					font-size: 11px;
					font-weight: 700;
					text-transform: uppercase;
					letter-spacing: 0.5px;
					display: inline-flex;
					align-items: center;
					gap: 4px;
					box-shadow: 0 2px 8px rgba(247, 124, 0, 0.3);
				">
					<i class="fas fa-fire" style="font-size: 10px; color: #f77c00;"></i>
					TOP
				</span>
			` : '';
			
            // Moderní karta s hover efektem
            items.push(`
                <div style="
					background: white;
					border-radius: 12px;
					padding: 14px;
					margin-bottom: 12px;
					cursor: pointer;
					transition: all 0.2s ease;
					border: 1px solid #e5e7eb;
					box-shadow: 0 1px 3px rgba(0,0,0,0.05);
				" 
				onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 16px rgba(247,124,0,0.25)'; this.style.borderColor='#f77c00';"
				onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.05)'; this.style.borderColor='#e5e7eb';"
				onclick="window.location.href='ad-detail.html?id=${encodeURIComponent(doc.id)}&userId=${encodeURIComponent(userId)}'">
					
					<!-- Hlavička s názvem a TOP badge -->
					<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:8px;">
						<h4 style="
							font-size: 15px;
							font-weight: 600;
							color: #111827;
							line-height: 1.4;
							flex: 1;
							margin: 0;
						">${title}</h4>
						${topBadge}
					</div>
					
					<!-- Lokace a kategorie -->
					<div style="
						display: flex;
						align-items: center;
						gap: 8px;
						font-size: 13px;
						color: #6b7280;
						margin-bottom: 8px;
					">
						<i class="fas fa-map-marker-alt" style="color:#f77c00; font-size:11px;"></i>
						<span>${location}</span>
						${category ? `
							<span style="color:#d1d5db;">•</span>
							<span>${category}</span>
						` : ''}
					</div>
					
					<!-- Cena a šipka -->
					<div style="display:flex; align-items:center; justify-content:space-between;">
						${price ? `
							<div style="
								font-size: 16px;
								font-weight: 700;
								background: linear-gradient(135deg, #f77c00 0%, #fdf002 100%);
								-webkit-background-clip: text;
								-webkit-text-fill-color: transparent;
								background-clip: text;
							">${price}</div>
						` : '<div></div>'}
						<i class="fas fa-arrow-right" style="
							color: #f77c00;
							font-size: 14px;
							opacity: 0.7;
						"></i>
					</div>
				</div>
            `);
		});
		el.innerHTML = items.join('');
	} catch (e) {
		console.warn('Pravý panel – nepodařilo se načíst inzeráty:', e);
		// Fallback – 3 statické karty s logem
		el.innerHTML = Array.from({ length: 3 }).map((_, i) => `
			<div class="ig-conv">
				<div class="ig-avatar"><img src="fotky/bulldogo-logo.png" alt="Bulldogo logo" loading="lazy" decoding="async"></div>
				<div>
					<div class="ig-title">Bulldogo</div>
					<div class="ig-last">Ukázka ${i + 1}</div>
				</div>
				<div class="ig-time"></div>
			</div>
		`).join('');
	}
}

/** Gating – přihlášení povolí psaní **/
function igUpdateGating() {
	const prompt = igQ('igLoginPrompt');
	const inputBar = igQ('igInput');
	const input = igQ('igText');
	const send = igQ('igSend');
	const files = igQ('igFiles');
	const isLogged = !!igCurrentUser;
	if (prompt) prompt.style.display = isLogged ? 'none' : 'flex';
	if (inputBar) inputBar.style.display = isLogged ? 'block' : 'none';
	if (input) input.disabled = !isLogged;
	if (send) send.disabled = !isLogged;
	if (files) files.disabled = !isLogged;
}

/** Render konverzací **/
function igRenderConversations(list = igConversations) {
	const el = igQ('igConversations');
	if (!el) return;
	if (!list || list.length === 0) {
		el.innerHTML = '<div style="padding:12px; color:#6b7280;">Žádné konverzace</div>';
        return;
    }
	el.innerHTML = list.map(c => `
		<div class="ig-conv ${igSelectedConvId === c.id ? 'active' : ''}" data-id="${c.id}">
			<div class="ig-avatar">
                ${c.avatar ? `<img src="${c.avatar}" alt="Avatar" loading="lazy" decoding="async">` : `<i class="fas fa-user"></i>`}
            </div>
			<div>
				<div class="ig-title">${c.title}</div>
				<div class="ig-last">${c.last || ''}</div>
            </div>
			<div class="ig-time">${igFormatTime(c.time)}</div>
                </div>
	`).join('');
	// click handlers
	Array.from(el.querySelectorAll('.ig-conv')).forEach(item => {
		item.addEventListener('click', () => {
			const id = item.getAttribute('data-id');
			igOpenConversation(id);
            });
        });
}

function igFilterConversations() {
	const q = (igQ('igSearch')?.value || '').toLowerCase();
	const filtered = igConversations.filter(c => (c.title || '').toLowerCase().includes(q) || (c.last || '').toLowerCase().includes(q));
	igRenderConversations(filtered);
}

/** Otevření konverzace **/
async function igOpenConversation(convId, peerUserIdFromUrl = null) {
	igSelectedConvId = convId;
	igRenderConversations();
	// hlavička
	const conv = igConversations.find(c => c.id === convId);
	const peerUserId = peerUserIdFromUrl || conv?.peerId || null;
	
	// Načíst jméno uživatele z profilu
	let peerName = conv?.title || 'Konverzace';
	if (peerUserId && window.firebaseDb) {
		try {
			const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
			const profileRef = doc(window.firebaseDb, 'users', peerUserId, 'profile', 'profile');
			const profileSnap = await getDoc(profileRef);
			if (profileSnap.exists()) {
				const profileData = profileSnap.data();
				peerName = profileData.name || profileData.email || 'Uživatel';
				console.log('✅ Načteno jméno uživatele:', peerName);
			} else {
				// Fallback - použít email z users dokumentu
				const userRef = doc(window.firebaseDb, 'users', peerUserId);
				const userSnap = await getDoc(userRef);
				if (userSnap.exists()) {
					const userData = userSnap.data();
					peerName = userData.email || 'Uživatel';
				}
			}
		} catch (e) {
			console.warn('⚠️ Nepodařilo se načíst jméno uživatele:', e);
		}
	}
	
	igQ('igPeerName').textContent = peerName;
	igQ('igPeerStatus').textContent = 'Online';
	
	console.log('🔍 igOpenConversation:', {
		convId,
		peerUserIdFromUrl,
		convPeerId: conv?.peerId,
		finalPeerUserId: peerUserId,
		peerName
	});
	
	if (peerUserId) {
		igRenderRightAds(peerUserId);
	} else {
		console.warn('⚠️ Nepodařilo se zjistit peerUserId pro načtení inzerátů');
	}
	
	igStartMessagesListener(convId);
	igRenderMessages();
}

/** Otevřít profil druhého účastníka chatu **/
function igOpenPeerProfile() {
	if (!igSelectedConvId) {
		console.warn('⚠️ Žádná vybraná konverzace');
		return;
	}
	
	// Najít konverzaci a získat userId druhého účastníka
	const conv = igConversations.find(c => c.id === igSelectedConvId);
	if (!conv || !conv.participants || conv.participants.length < 2) {
		console.warn('⚠️ Konverzace nemá účastníky');
		return;
	}
	
	// Zjistit userId druhého účastníka (ne mě)
	const myUid = igCurrentUser?.uid;
	const peerUid = conv.participants.find(uid => uid !== myUid);
	
	if (!peerUid) {
		console.warn('⚠️ Nepodařilo se najít druhého účastníka');
		return;
	}
	
	console.log('🔗 Otevírám profil:', peerUid);
	// Přesměrovat na profil
	window.location.href = `profile-detail.html?userId=${encodeURIComponent(peerUid)}`;
}

/** Render zpráv **/
function igRenderMessages() {
	const box = igQ('igMessages');
	if (!box) return;
	const msgs = igMessagesByConvId[igSelectedConvId] || [];
    const conv = igConversations.find(c => c.id === igSelectedConvId);
    const peerAvatar = conv?.avatar || '';
	if (msgs.length === 0) {
		box.innerHTML = '<div class="ig-empty">Zatím žádné zprávy – napište první.</div>';
        return;
    }
	box.innerHTML = msgs.map(m => {
		const mine = igCurrentUser ? (m.uid === 'me' || m.uid === igCurrentUser.uid) : (m.uid === 'me');
		const imgs = (m.images || []).map(img => `<img src="${img.url}" alt="${img.name||''}" loading="lazy" decoding="async">`).join('');
        return `
			<div class="ig-row ${mine ? 'mine' : ''}">
				<div class="ig-avatar">
                    ${!mine && peerAvatar ? `<img src="${peerAvatar}" alt="Avatar" loading="lazy" decoding="async">` : `<i class="fas fa-user"></i>`}
                </div>
				<div class="ig-bubble">
					${m.text ? `<div>${m.text}</div>` : ''}
					${imgs ? `<div class=\"ig-images\">${imgs}</div>` : ''}
					<div class="ig-meta">${igFormatTime(m.at)}</div>
            </div>
			</div>`;
    }).join('');
	box.scrollTop = box.scrollHeight;
}

/** Náhled vybraných obrázků **/
function igRenderFilePreview() {
	const wrap = igQ('igFilePreview');
	if (!wrap) return;
	if (igSelectedFiles.length === 0) { wrap.innerHTML=''; return; }
	wrap.innerHTML = igSelectedFiles.map((f, i) => {
		const url = URL.createObjectURL(f);
		return `<img src="${url}" alt="náhled ${i+1}">`;
	}).join('');
}

/** Odeslání zprávy **/
function igHandleSend() {
	if (!igCurrentUser) return; // gating
	if (!igSelectedConvId) return;
	const input = igQ('igText');
	const text = (input?.value || '').trim();
	if (!text && igSelectedFiles.length === 0) return;
	igSendMessageToFirestore(igSelectedConvId, text, igSelectedFiles).catch(e=>console.warn(e));
	if (input) input.value = '';
	igSelectedFiles = [];
	igRenderFilePreview();
}

// Realtime listener zpráv pro aktivní chat
async function igStartMessagesListener(chatId) {
	try {
		if (!window.firebaseDb) return;
		if (igUnsubMsgs) { igUnsubMsgs(); igUnsubMsgs = null; }
		const { collection, query, orderBy, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
		const msgsRef = collection(window.firebaseDb, 'chats', chatId, 'messages');
		const q = query(msgsRef, orderBy('createdAt', 'asc'));
		igUnsubMsgs = onSnapshot(q, (snap) => {
			const list = snap.docs.map(d => {
				const m = d.data() || {};
				return {
					id: d.id,
					uid: m.fromUid === igCurrentUser?.uid ? 'me' : (m.fromUid || 'other'),
					text: m.text || '',
					images: Array.isArray(m.images) ? m.images : [],
					at: m.createdAt?.toDate?.() || new Date()
				};
			});
			igMessagesByConvId[chatId] = list;
			if (igSelectedConvId === chatId) igRenderMessages();
		}, (err) => console.warn('Messages listener error', err));
	} catch (e) {
		console.warn('igStartMessagesListener failed', e);
	}
}

// Odeslání zprávy do Firestore
async function igSendMessageToFirestore(chatId, text, files) {
	if (!igCurrentUser || !window.firebaseDb) return;
	const { collection, addDoc, doc, updateDoc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
	await setDoc(doc(window.firebaseDb, 'chats', chatId), { lastAt: serverTimestamp() }, { merge: true });
	const msgsRef = collection(window.firebaseDb, 'chats', chatId, 'messages');
	await addDoc(msgsRef, {
		fromUid: igCurrentUser.uid,
		text: text || '',
		images: [],
		createdAt: serverTimestamp()
	});
	await updateDoc(doc(window.firebaseDb, 'chats', chatId), {
		lastMessage: text || '📷 Foto',
		lastAt: serverTimestamp()
	});
}

// Export / integrace: voláno z inzerátu (přesměruje na chat s parametry)
window.contactSeller = function(listingId, sellerUid, listingTitle) {
	const url = new URL(window.location.origin + '/chat.html');
	url.searchParams.set('userId', sellerUid || '');
	if (listingId) url.searchParams.set('listingId', listingId);
	if (listingTitle) url.searchParams.set('listingTitle', listingTitle);
	window.location.href = url.toString();
};

// Export pro případné využití
window.igOpenConversation = igOpenConversation;

// Konec – UI je čistě frontend mock, přizpůsoben stylu IG DM