/* ============================================================
   Cpanel DomayerHosting By Ren&Kyz - script.js
   v2.0 - Loading progress, sidebar fix, responsive
   ============================================================ */

// ========== LOADING PROGRESS BAR ==========
const Progress = {
    bar: null,
    val: 0,
    timer: null,
    init() {
        this.bar = document.getElementById('progress-bar');
    },
    start() {
        if (!this.bar) return;
        this.val = 0;
        this.bar.style.opacity = '1';
        this.bar.style.background = '';
        this.bar.style.width = '0%';
        clearInterval(this.timer);
        // Use rAF-based increment for smooth progress
        const step = () => {
            if (this.val < 80) {
                this.val += (80 - this.val) * 0.05 + 0.5;
                this.bar.style.width = Math.min(this.val, 80) + '%';
                this.timer = requestAnimationFrame(step);
            }
        };
        this.timer = requestAnimationFrame(step);
    },
    done() {
        if (!this.bar) return;
        cancelAnimationFrame(this.timer);
        this.bar.style.width = '100%';
        setTimeout(() => {
            this.bar.style.opacity = '0';
            setTimeout(() => { this.bar.style.width = '0%'; }, 250);
        }, 250);
    },
    fail() {
        if (!this.bar) return;
        cancelAnimationFrame(this.timer);
        this.bar.style.background = 'var(--red)';
        this.bar.style.width = '100%';
        setTimeout(() => {
            this.bar.style.opacity = '0';
            setTimeout(() => {
                this.bar.style.width = '0%';
                this.bar.style.background = '';
            }, 250);
        }, 400);
    }
};

// ========== SOUND EFFECTS ==========
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudio() { if (!audioCtx) audioCtx = new AudioCtx(); return audioCtx; }

// Real click sound (MP3 embedded)
const CLICK_MP3 = 'data:audio/mp3;base64,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SmuagKDwSg0XOlgdAQiNgy8Nfurhp2KneV/1hN10RaiNvqxun/01TEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kETwgAPHSEbjBhzScIkI7GGDdgggqRMghGvA3AuiZBAM0FVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EETdj/AAAH+AAAAIAAAP8AAAAQAAAf4AAAAgAAA/wAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQRN2P8AAAf4AAAAgAAA/wAAABAAAB/gAAACAAAD/AAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xBk3Y/wAAB/gAAACAAAD/AAAAEAAAH+AAAAIAAAP8AAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EGTdj/AAAH+AAAAIAAAP8AAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZN2P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
let clickBuffer = null;
let clickAudio = null;

async function loadClickSound() {
    try {
        const ac = getAudio();
        const res = await fetch(CLICK_MP3);
        const arr = await res.arrayBuffer();
        clickBuffer = await ac.decodeAudioData(arr);
    } catch(e) {
        // Fallback: use HTML Audio element
        clickAudio = new Audio(CLICK_MP3);
        clickAudio.volume = 0.5;
    }
}

function playClick() {
    try {
        if (clickBuffer) {
            const ac = getAudio();
            const src = ac.createBufferSource();
            const gain = ac.createGain();
            src.buffer = clickBuffer;
            src.connect(gain);
            gain.connect(ac.destination);
            gain.gain.value = 0.6;
            src.start(0);
        } else if (clickAudio) {
            // Clone for rapid clicks
            const clone = clickAudio.cloneNode();
            clone.volume = 0.6;
            clone.play().catch(()=>{});
        }
    } catch(e) {}
}

function playTone(freq, type, dur, vol) {
    try {
        const ac = getAudio();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol || 0.08, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
        osc.start(ac.currentTime);
        osc.stop(ac.currentTime + dur);
    } catch(e) {}
}

const SFX = {
    click:   () => playClick(),
    nav:     () => { playClick(); },
    success: () => { playTone(523, 'sine', 0.1, 0.07); setTimeout(()=>playTone(659,'sine',0.1,0.07),100); setTimeout(()=>playTone(784,'sine',0.15,0.07),200); },
    error:   () => { playTone(200, 'sawtooth', 0.1, 0.08); setTimeout(()=>playTone(150,'sawtooth',0.1,0.08),100); },
    open:    () => playClick(),
    close:   () => playClick(),
};

// Load click sound on first user interaction
let clickLoaded = false;
document.addEventListener('click', e => {
    if (!clickLoaded) {
        clickLoaded = true;
        loadClickSound();
    }
    const t = e.target.closest('button, .nav-item, .sidebar-user');
    if (t) SFX.click();
}, { passive: true });

// ========== STATE ==========
const State = {
    user: null,
    sidebarCollapsed: false,
    mobileSidebarOpen: false,
    currentPage: 'home',
};

// ========== UTILS ==========
const $ = id => document.getElementById(id);
const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

// Debounce - prevent rapid repeated calls
function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// Throttle - limit execution rate
function throttle(fn, limit) {
    let last = 0;
    return (...args) => {
        const now = Date.now();
        if (now - last >= limit) { last = now; fn(...args); }
    };
}

function isMobile() { return window.innerWidth <= 768; }

function api(path, method, body) {
    const opts = { method: method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch('/api' + path, opts).then(r => r.json());
}

function toast(msg, type) {
    const c = $('toast-container');
    const d = document.createElement('div');
    d.className = 'toast ' + (type || 'info');
    const icons = { success: '✓', error: '✗', info: 'ℹ' };
    d.innerHTML = `<span>${icons[type||'info']||'ℹ'}</span><span>${msg}</span>`;
    c.appendChild(d);
    if (type === 'success') SFX.success();
    if (type === 'error') SFX.error();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 300); }, 3500);
}

function confirmDialog(msg, onConfirm) {
    SFX.open();
    $('confirm-text').textContent = msg;
    $('confirm-modal').classList.add('show');
    $('confirm-ok').onclick = () => { closeModal('confirm-modal'); onConfirm(); };
}

function openModal(id) { SFX.open(); $(id).classList.add('show'); }
function closeModal(id) { SFX.close(); $(id).classList.remove('show'); }

document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
    // Close mobile sidebar when clicking overlay
    if (e.target.id === 'sidebar-overlay') closeMobileSidebar();
});

// ========== AUTH ==========
function initLogin() {
    const form = $('login-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const username = $('login-username').value.trim();
        const password = $('login-password').value;
        const err = $('login-error');
        const btn = $('login-btn');
        err.classList.remove('show');

        // Login loading state
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span> Masuk...';
        Progress.start();

        try {
            const res = await api('/login', 'POST', { username, password });
            if (res.ok) {
                State.user = res.user;
                Progress.done();
                SFX.success();
                btn.innerHTML = '✓ Berhasil!';
                setTimeout(() => showApp(), 400);
            } else {
                Progress.fail();
                err.textContent = res.error || 'Username atau password salah';
                err.classList.add('show');
                SFX.error();
                btn.disabled = false;
                btn.innerHTML = '🚀 Masuk ke Panel';
            }
        } catch (ex) {
            Progress.fail();
            err.textContent = 'Gagal terhubung ke server';
            err.classList.add('show');
            SFX.error();
            btn.disabled = false;
            btn.innerHTML = '🚀 Masuk ke Panel';
        }
    });
}

function logout() {
    Progress.start();
    api('/logout', 'POST').finally(() => {
        Progress.done();
        State.user = null;
        location.reload();
    });
}

// ========== APP SHELL ==========
function showApp() {
    $('login-page').style.display = 'none';
    $('app').style.display = 'flex';
    renderUserInfo();
    renderSidebar();
    initSidebarResponsive();
    navigateTo('home');
}

function renderUserInfo() {
    if (!State.user) return;
    const initials = State.user.username.substring(0, 2).toUpperCase();
    const roleLabel = State.user.role === 1 ? 'Owner' : 'Administrator';
    qsa('.u-initials').forEach(el => el.textContent = initials);
    qsa('.u-name').forEach(el => el.textContent = State.user.username);
    qsa('.u-role').forEach(el => el.textContent = roleLabel);
    $('navbar-username').textContent = State.user.username;
    $('navbar-role').textContent = roleLabel;
}

// ========== SIDEBAR ==========
function renderSidebar() {
    const isOwner = State.user && State.user.role === 1;
    qsa('.owner-only').forEach(el => {
        el.style.display = isOwner ? '' : 'none';
    });
}

function initSidebarResponsive() {
    // Start collapsed on mobile
    if (isMobile()) {
        State.sidebarCollapsed = false;
        State.mobileSidebarOpen = false;
        applySidebarState();
    } else {
        // Desktop: start expanded
        State.sidebarCollapsed = false;
        applySidebarState();
    }

    // Listen for resize
    window.addEventListener('resize', throttle(() => {
        if (isMobile()) {
            // On mobile, always use overlay mode
            const sb = $('sidebar');
            const mw = $('main-wrapper');
            const nb = $('navbar');
            sb.classList.remove('collapsed');
            mw.classList.remove('collapsed');
            nb.classList.remove('collapsed');
            mw.style.marginLeft = '0';
            nb.style.left = '0';
            if (!State.mobileSidebarOpen) {
                sb.classList.remove('mobile-open');
                $('sidebar-overlay').classList.remove('show');
            }
        } else {
            // Desktop restore
            $('sidebar-overlay').classList.remove('show');
            State.mobileSidebarOpen = false;
            applySidebarState();
        }
    }, 150));
}

function applySidebarState() {
    const sb = $('sidebar');
    const mw = $('main-wrapper');
    const nb = $('navbar');

    if (isMobile()) {
        // Mobile: sidebar is overlay, no margin shift
        sb.classList.remove('collapsed');
        mw.style.marginLeft = '0';
        nb.style.left = '0';
        if (State.mobileSidebarOpen) {
            sb.classList.add('mobile-open');
            $('sidebar-overlay').classList.add('show');
        } else {
            sb.classList.remove('mobile-open');
            $('sidebar-overlay').classList.remove('show');
        }
    } else {
        // Desktop: push layout
        sb.classList.remove('mobile-open');
        $('sidebar-overlay').classList.remove('show');
        mw.style.marginLeft = '';
        nb.style.left = '';
        sb.classList.toggle('collapsed', State.sidebarCollapsed);
        mw.classList.toggle('collapsed', State.sidebarCollapsed);
        nb.classList.toggle('collapsed', State.sidebarCollapsed);
    }
}

function toggleSidebar() {
    if (isMobile()) {
        State.mobileSidebarOpen = !State.mobileSidebarOpen;
        if (State.mobileSidebarOpen) SFX.open(); else SFX.close();
    } else {
        State.sidebarCollapsed = !State.sidebarCollapsed;
        if (State.sidebarCollapsed) SFX.close(); else SFX.open();
    }
    applySidebarState();
}

function closeMobileSidebar() {
    State.mobileSidebarOpen = false;
    SFX.close();
    applySidebarState();
}

// Close mobile sidebar when nav item clicked
document.addEventListener('click', e => {
    if (e.target.closest('.nav-item') && isMobile()) {
        setTimeout(() => closeMobileSidebar(), 200);
    }
});

// ========== NAVIGATION ==========
function navigateTo(page) {
    SFX.nav();
    State.currentPage = page;
    qsa('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
    // Use rAF for smooth page transition
    requestAnimationFrame(() => {
        qsa('.page').forEach(el => el.classList.remove('active'));
        const pg = $('page-' + page);
        if (pg) {
            pg.classList.add('active');
            pg.classList.add('fade-up');
            setTimeout(() => pg.classList.remove('fade-up'), 300);
        }
    });
    const loaders = {
        home: loadHome,
        createAccount: loadCreateAccount,
        createServer: loadCreateServer,
        listUsers: loadListUsers,
        listServers: loadListServers,
        listNests: loadListNests,
        renewHosting: loadRenewHosting,
        addAccount: loadAddAccount,
        activityLog: loadActivityLog,
    };
    if (loaders[page]) loaders[page]();
}

// ========== HOME PAGE ==========
async function loadHome() {
    $('home-loading').style.display = 'flex';
    $('home-stats').style.display = 'none';
    Progress.start();
    try {
        const [statsRes, expRes] = await Promise.all([
            api('/stats'),
            api('/expirations'),
        ]);
        if (statsRes.ok) {
            $('stat-users').textContent = statsRes.data.users;
            $('stat-servers').textContent = statsRes.data.servers;
            $('stat-nests').textContent = statsRes.data.nests;
            $('stat-eggs').textContent = statsRes.data.eggs;
            $('stat-nodes').textContent = statsRes.data.nodes;
            $('stat-alloc').textContent = statsRes.data.allocations;
            $('home-stats').style.display = 'grid';
        }
        if (expRes.ok) renderExpirationTable(expRes.data);
        Progress.done();
    } catch(e) { Progress.fail(); toast('Gagal memuat statistik panel', 'error'); }
    $('home-loading').style.display = 'none';
}

function renderExpirationTable(data) {
    const tbody = $('exp-table-body');
    if (!tbody) return;
    if (!data || !data.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">⏰</div><p>Tidak ada server dengan expired</p></div></td></tr>`;
        return;
    }
    const now = new Date();
    tbody.innerHTML = data.map(e => {
        // Parse dd/mm/yyyy hh:mm
        const parts = e.expire_at.split(' ');
        const dmy = parts[0].split('/');
        const hm = (parts[1]||'00:00').split(':');
        const expDate = new Date(dmy[2], dmy[1]-1, dmy[0], hm[0], hm[1]);
        const diff = Math.ceil((expDate - now) / (1000*60*60*24));
        const badge = diff <= 1 ? 'badge-red' : diff <= 3 ? 'badge-yellow' : 'badge-green';
        const label = diff < 0 ? 'Expired!' : diff === 0 ? 'Hari ini' : diff + ' hari lagi';
        return `<tr>
            <td>${e.server_name}</td>
            <td>${e.owner_username || '-'}</td>
            <td>${e.expire_at}</td>
            <td><span class="badge ${badge}">${label}</span></td>
        </tr>`;
    }).join('');
}

// ========== CREATE ACCOUNT ==========
async function loadCreateAccount() {
    const roleSelect = $('ca-role');
    if (!roleSelect) return;
    if (State.user.role === 1) {
        roleSelect.innerHTML = `<option value="0">Member</option><option value="1">Administrator</option>`;
    } else {
        roleSelect.innerHTML = `<option value="0">Member</option>`;
    }
}

async function submitCreateAccount() {
    const email = $('ca-email').value.trim();
    const username = $('ca-username').value.trim();
    const firstname = $('ca-firstname').value.trim();
    const lastname = $('ca-lastname').value.trim();
    const password = $('ca-password').value;
    const role = $('ca-role').value;
    if (!email || !username || !firstname || !password) {
        toast('Lengkapi semua field yang diperlukan', 'error'); return;
    }
    const btn = $('btn-create-account');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Membuat...';
    Progress.start();
    try {
        const res = await api('/pterodactyl/create-user', 'POST', { email, username, firstname, lastname, password, role: parseInt(role) });
        if (res.ok) {
            Progress.done();
            toast('Akun berhasil dibuat!', 'success');
            ['ca-email','ca-username','ca-firstname','ca-lastname','ca-password'].forEach(id => $(id).value = '');
        } else {
            Progress.fail();
            toast('Gagal: ' + (res.error || 'Error tidak diketahui'), 'error');
        }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
    btn.disabled = false;
    btn.innerHTML = '🚀 Buat Akun';
}

// ========== CREATE SERVER ==========
async function loadCreateServer() {
    Progress.start();
    await Promise.all([loadCSUsers(), loadCSNodes(), loadCSNests()]);
    Progress.done();
}

async function loadCSUsers() {
    const sel = $('cs-owner');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading...</option>';
    try {
        const res = await api('/pterodactyl/users');
        if (res.ok) {
            sel.innerHTML = '<option value="">-- Pilih Owner --</option>' +
                res.data.map(u => `<option value="${u.id}" data-user='${JSON.stringify({username:u.username,email:u.email})}'>${u.username} (${u.email})</option>`).join('');
            sel.onchange = function() {
                const opt = this.options[this.selectedIndex];
                if (opt.dataset.user) {
                    const u = JSON.parse(opt.dataset.user);
                    $('cs-name').value = u.username;
                    $('cs-owner-pass').value = '';
                }
            };
        }
    } catch(e) {}
}

async function loadCSNodes() {
    const sel = $('cs-node');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading...</option>';
    try {
        const res = await api('/pterodactyl/nodes');
        if (res.ok && res.data.length > 0) {
            if (res.data.length === 1) {
                sel.innerHTML = `<option value="${res.data[0].id}">${res.data[0].name} (Auto)</option>`;
                await loadCSAllocations(res.data[0].id);
            } else {
                sel.innerHTML = '<option value="">-- Pilih Node --</option>' +
                    res.data.map(n => `<option value="${n.id}">${n.name}</option>`).join('');
                sel.onchange = () => loadCSAllocations(sel.value);
            }
        }
    } catch(e) {}
}

async function loadCSAllocations(nodeId) {
    if (!nodeId) return;
    const defAlloc = $('cs-default-alloc');
    defAlloc.innerHTML = '<option>Loading...</option>';
    try {
        const res = await api('/pterodactyl/allocations/' + nodeId);
        if (res.ok) {
            defAlloc.innerHTML = res.data.map(a => `<option value="${a.id}">${a.ip}:${a.port}</option>`).join('');
            $('cs-alloc-loading').textContent = '';
        }
    } catch(e) {}
}

async function loadCSNests() {
    const sel = $('cs-nest');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading...</option>';
    try {
        const res = await api('/pterodactyl/nests');
        if (res.ok) {
            sel.innerHTML = '<option value="">-- Pilih Nest --</option>' +
                res.data.map(n => `<option value="${n.id}">${n.name}</option>`).join('');
            sel.onchange = () => loadCSEggs(sel.value);
        }
    } catch(e) {}
}

async function loadCSEggs(nestId) {
    const sel = $('cs-egg');
    if (!sel || !nestId) return;
    sel.innerHTML = '<option>Loading...</option>';
    try {
        const res = await api('/pterodactyl/nests/' + nestId + '/eggs');
        if (res.ok) {
            sel.innerHTML = '<option value="">-- Pilih Egg --</option>' +
                res.data.map(e => `<option value="${e.id}" data-docker="${e.docker_image}" data-startup="${encodeURIComponent(e.startup)}">${e.name}</option>`).join('');
            sel.onchange = function() {
                const ownUname = $('cs-name').value.split('(')[0].trim();
                const opt = this.options[this.selectedIndex];
                if (opt.value) $('cs-name').value = ownUname + '(' + opt.text + ')';
            };
        }
    } catch(e) {}
}

function gbToMb(gb) { return gb * 1024; }

async function submitCreateServer() {
    const ownerId = $('cs-owner').value;
    const serverName = $('cs-name').value.trim();
    const ownerPass = $('cs-owner-pass').value;
    const description = $('cs-desc').value.trim();
    const nodeId = $('cs-node').value;
    const allocId = $('cs-default-alloc').value;
    const nestId = $('cs-nest').value;
    const eggId = $('cs-egg').value;
    const cpu = parseInt($('cs-cpu').value) * 100;
    const memory = gbToMb(parseInt($('cs-memory').value));
    const disk = gbToMb(parseInt($('cs-disk').value));
    const dbLimit = parseInt($('cs-db-limit').value);
    const backupLimit = parseInt($('cs-backup-limit').value);
    const allocLimit = parseInt($('cs-alloc-limit').value);
    const phone = $('cs-phone').value.trim();
    const expiredDays = parseInt($('cs-expired-days').value) || 0;
    const eggOpt = $('cs-egg').options[$('cs-egg').selectedIndex];
    const dockerImage = eggOpt ? eggOpt.dataset.docker : '';
    const startup = eggOpt ? decodeURIComponent(eggOpt.dataset.startup || '') : '';
    const ownerOpt = $('cs-owner').options[$('cs-owner').selectedIndex];
    let ownerEmail = '', ownerUname = '';
    if (ownerOpt && ownerOpt.dataset.user) {
        try { const u = JSON.parse(ownerOpt.dataset.user); ownerEmail = u.email||''; ownerUname = u.username||''; } catch(e) {}
    }

    if (!ownerId || !serverName || !nodeId || !allocId || !nestId || !eggId || !phone) {
        toast('Lengkapi semua field yang diperlukan termasuk nomor WA buyer', 'error'); return;
    }

    const btn = $('btn-create-server');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Membuat Server...';
    Progress.start();
    try {
        const res = await api('/pterodactyl/create-server', 'POST', {
            name: serverName, owner_id: parseInt(ownerId),
            description, node_id: parseInt(nodeId),
            default_allocation: parseInt(allocId),
            nest_id: parseInt(nestId), egg_id: parseInt(eggId),
            cpu, memory, disk,
            database_limit: dbLimit, backup_limit: backupLimit, allocation_limit: allocLimit,
            docker_image: dockerImage, startup,
            phone, owner_email: ownerEmail, owner_username: ownerUname,
            owner_password: ownerPass, egg_name: eggOpt ? eggOpt.text : '',
            expired_days: expiredDays,
        });
        if (res.ok) {
            Progress.done();
            toast('Server berhasil dibuat & pesan WA terkirim!', 'success');
        } else {
            Progress.fail();
            toast('Gagal: ' + (res.error || 'Error tidak diketahui'), 'error');
        }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
    btn.disabled = false;
    btn.innerHTML = '🚀 Buat Server & Kirim WA';
}

// ========== LIST USERS ==========
let cachedUsers = [];

async function loadListUsers() {
    $('lu-table-body').innerHTML = `<tr><td colspan="5"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    Progress.start();
    try {
        const res = await api('/pterodactyl/users');
        if (res.ok) {
            cachedUsers = res.data;
            renderUsersTable(res.data);
            Progress.done();
        } else { Progress.fail(); toast('Gagal memuat users', 'error'); }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
}

function renderUsersTable(users) {
    const isOwner = State.user && State.user.role === 1;
    const search = ($('lu-search') ? $('lu-search').value : '').toLowerCase();
    const filtered = users.filter(u =>
        u.username.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
    );
    if (!filtered.length) {
        $('lu-table-body').innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👥</div><p>Tidak ada user ditemukan</p></div></td></tr>`;
        return;
    }
    $('lu-table-body').innerHTML = filtered.map(u => `
    <tr>
        <td>${u.id}</td>
        <td>${u.email}</td>
        <td>${u.username}</td>
        <td><span class="badge ${u.root_admin ? 'badge-pink' : 'badge-cyan'}">${u.root_admin ? 'Admin' : 'Member'}</span></td>
        <td>${isOwner ? `<button class="btn-sm btn-edit" onclick="openEditUser(${u.id},'${u.email}','${u.username}',${u.root_admin?1:0})">✏ Edit</button>
            <button class="btn-sm btn-del" onclick="deleteUser(${u.id},'${u.username}')">🗑 Hapus</button>` : '-'}</td>
    </tr>`).join('');
}

function openEditUser(id, email, username, role) {
    $('eu-id').value = id;
    $('eu-email').value = email;
    $('eu-username').value = username;
    $('eu-role').value = role;
    $('eu-password').value = '';
    openModal('edit-user-modal');
}

async function submitEditUser() {
    const id = $('eu-id').value;
    const email = $('eu-email').value.trim();
    const username = $('eu-username').value.trim();
    const password = $('eu-password').value;
    const role = parseInt($('eu-role').value);
    const btn = $('btn-edit-user');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Menyimpan...';
    Progress.start();
    try {
        const body = { email, username, role };
        if (password) body.password = password;
        const res = await api('/pterodactyl/users/' + id, 'PATCH', body);
        if (res.ok) {
            Progress.done();
            toast('User berhasil diupdate!', 'success');
            closeModal('edit-user-modal');
            loadListUsers();
        } else { Progress.fail(); toast('Gagal: ' + (res.error || 'Error'), 'error'); }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
    btn.disabled = false;
    btn.innerHTML = '💾 Simpan';
}

function deleteUser(id, username) {
    confirmDialog(`Hapus user "${username}" dari panel Pterodactyl?`, async () => {
        Progress.start();
        const res = await api('/pterodactyl/users/' + id, 'DELETE');
        if (res.ok) { Progress.done(); toast('User dihapus!', 'success'); loadListUsers(); }
        else { Progress.fail(); toast('Gagal: ' + (res.error||'Error'), 'error'); }
    });
}

// ========== LIST SERVERS ==========
async function loadListServers() {
    $('ls-table-body').innerHTML = `<tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    Progress.start();
    try {
        const res = await api('/pterodactyl/servers');
        if (res.ok) { renderServersTable(res.data); Progress.done(); }
        else { Progress.fail(); toast('Gagal memuat servers', 'error'); }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
}

function renderServersTable(servers) {
    const isOwner = State.user && State.user.role === 1;
    if (!servers.length) {
        $('ls-table-body').innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🖥</div><p>Tidak ada server ditemukan</p></div></td></tr>`;
        return;
    }
    $('ls-table-body').innerHTML = servers.map(s => {
        const status = s.status === 'running' ? 'badge-green' : (s.status === 'offline' ? 'badge-red' : 'badge-blue');
        return `<tr>
            <td><span style="cursor:pointer;color:var(--cyan)" onclick="openServerDetail('${s.identifier}')">${s.name}</span></td>
            <td>${s.user || s.owner || '-'}</td>
            <td><span class="badge ${status}">${s.status || 'installing'}</span></td>
            <td style="display:flex;gap:5px;flex-wrap:wrap">
              <button class="btn-sm btn-edit" onclick="openServerDetail('${s.identifier}')">🔍 Detail</button>
              <button class="btn-sm" style="background:rgba(168,85,247,0.1);color:var(--purple);border:1px solid rgba(168,85,247,0.25)" onclick="reinstallServer('${s.identifier}','${s.name}')">🔄 Reinstall</button>
              ${isOwner ? `<button class="btn-sm btn-del" onclick="deleteServer('${s.identifier}','${s.name}')">🗑 Hapus</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function deleteServer(identifier, name) {
    confirmDialog(`Hapus server "${name}" dari panel?`, async () => {
        Progress.start();
        const res = await api('/pterodactyl/servers/' + identifier, 'DELETE');
        if (res.ok) { Progress.done(); toast('Server dihapus!', 'success'); loadListServers(); }
        else { Progress.fail(); toast('Gagal: ' + (res.error||'Error'), 'error'); }
    });
}

// ========== LIST NESTS ==========
async function loadListNests() {
    $('ln-table-body').innerHTML = `<tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    Progress.start();
    try {
        const res = await api('/pterodactyl/nests');
        if (!res.ok) { Progress.fail(); toast('Gagal memuat nests', 'error'); return; }
        if (!res.data.length) {
            $('ln-table-body').innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🥚</div><p>Tidak ada nest</p></div></td></tr>`;
            Progress.done(); return;
        }
        $('ln-table-body').innerHTML = res.data.map(n => `<tr>
            <td>${n.id}</td>
            <td>${n.name}</td>
            <td>${n.description || '-'}</td>
            <td><span class="badge badge-cyan">${n.egg_count || 0} eggs</span></td>
        </tr>`).join('');
        Progress.done();
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
}

// ========== ADD ACCOUNT ==========
async function loadAddAccount() { loadPanelAccounts(); }

async function loadPanelAccounts() {
    const tbody = $('pa-table-body');
    tbody.innerHTML = `<tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    Progress.start();
    const res = await api('/panel-accounts');
    if (!res.ok) { Progress.fail(); tbody.innerHTML = '<tr><td colspan="4">Gagal memuat</td></tr>'; return; }
    Progress.done();
    if (!res.data.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">👤</div><p>Belum ada akun panel</p></div></td></tr>`;
        return;
    }
    tbody.innerHTML = res.data.map(u => `<tr>
        <td>${u.username}</td>
        <td>${'*'.repeat(8)}</td>
        <td><span class="badge ${u.role===1?'badge-pink':'badge-cyan'}">${u.role===1?'Owner':'Administrator'}</span></td>
        <td>
            <button class="btn-sm btn-edit" onclick="openEditPanelUser(${u.id},'${u.username}',${u.role})">✏ Edit</button>
            <button class="btn-sm btn-del" onclick="deletePanelUser(${u.id},'${u.username}')">🗑 Hapus</button>
        </td>
    </tr>`).join('');
}

async function submitAddPanelAccount() {
    const username = $('pa-username').value.trim();
    const password = $('pa-password').value;
    const role = parseInt($('pa-role').value);
    if (!username || !password) { toast('Username dan password wajib diisi', 'error'); return; }
    const btn = $('btn-add-panel-acc');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Menambah...';
    Progress.start();
    const res = await api('/panel-accounts', 'POST', { username, password, role });
    if (res.ok) {
        Progress.done();
        toast('Akun panel ditambahkan!', 'success');
        $('pa-username').value = ''; $('pa-password').value = '';
        loadPanelAccounts();
    } else { Progress.fail(); toast('Gagal: ' + (res.error||'Error'), 'error'); }
    btn.disabled = false;
    btn.innerHTML = '➕ Tambah Akun';
}

function openEditPanelUser(id, username, role) {
    $('ep-id').value = id;
    $('ep-username').value = username;
    $('ep-role').value = role;
    $('ep-password').value = '';
    openModal('edit-panel-user-modal');
}

async function submitEditPanelUser() {
    const id = $('ep-id').value;
    const username = $('ep-username').value.trim();
    const password = $('ep-password').value;
    const role = parseInt($('ep-role').value);
    const body = { username, role };
    if (password) body.password = password;
    Progress.start();
    const res = await api('/panel-accounts/' + id, 'PATCH', body);
    if (res.ok) {
        Progress.done();
        toast('Akun panel diupdate!', 'success');
        closeModal('edit-panel-user-modal');
        loadPanelAccounts();
    } else { Progress.fail(); toast('Gagal: ' + (res.error||'Error'), 'error'); }
}

function deletePanelUser(id, username) {
    confirmDialog(`Hapus akun panel "${username}"?`, async () => {
        Progress.start();
        const res = await api('/panel-accounts/' + id, 'DELETE');
        if (res.ok) { Progress.done(); toast('Akun dihapus!', 'success'); loadPanelAccounts(); }
        else { Progress.fail(); toast('Gagal', 'error'); }
    });
}

// ========== ACTIVITY LOG ==========
async function loadActivityLog() {
    $('al-table-body').innerHTML = `<tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    Progress.start();
    try {
        const res = await api('/logs');
        if (res.ok) { renderLogs(res.data); Progress.done(); }
        else { Progress.fail(); toast('Gagal memuat log', 'error'); }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
}

function renderLogs(logs) {
    if (!logs.length) {
        $('al-table-body').innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">📋</div><p>Belum ada aktivitas</p></div></td></tr>`;
        return;
    }
    $('al-table-body').innerHTML = logs.map(l => `<tr>
        <td>${l.users}</td>
        <td><span class="badge ${l.role===1?'badge-pink':'badge-cyan'}">${l.role===1?'Owner':'Administrator'}</span></td>
        <td>${l.log}</td>
        <td class="log-time">${l.time}</td>
    </tr>`).join('');
}

async function clearActivityLog() {
    confirmDialog('Hapus semua activity log? Tindakan ini tidak dapat dibatalkan.', async () => {
        Progress.start();
        const res = await api('/logs/clear', 'DELETE');
        if (res.ok) { Progress.done(); toast('Log dibersihkan!', 'success'); loadActivityLog(); }
        else { Progress.fail(); toast('Gagal', 'error'); }
    });
}

// ========== SEARCH ==========
document.addEventListener('DOMContentLoaded', () => {
    const s = $('lu-search');
    if (s) s.addEventListener('input', debounce(() => renderUsersTable(cachedUsers), 200));
});

// ========== WIB CLOCK ==========
function startWIBClock() {
    const el = document.getElementById('wib-clock');
    if (!el) return;
    const days = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    let lastSec = -1;
    function tick() {
        const wib = new Date(Date.now() + (7 * 60 * 60 * 1000));
        const s = wib.getUTCSeconds();
        // Only update DOM when second changes (saves ~59/60 DOM writes)
        if (s !== lastSec) {
            lastSec = s;
            const d = wib.getUTCDate().toString().padStart(2,'0');
            const mo = months[wib.getUTCMonth()];
            const y = wib.getUTCFullYear();
            const h = wib.getUTCHours().toString().padStart(2,'0');
            const m = wib.getUTCMinutes().toString().padStart(2,'0');
            const ss = s.toString().padStart(2,'0');
            const day = days[wib.getUTCDay()];
            el.textContent = `🕐 ${day}, ${d} ${mo} ${y}  ${h}:${m}:${ss} WIB`;
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    Progress.init();
    startWIBClock();
    initLogin();
    Progress.start();
    api('/me').then(res => {
        if (res.ok && res.user) {
            State.user = res.user;
            Progress.done();
            showApp();
        } else {
            Progress.done();
        }
    }).catch(() => Progress.done());
});

// ========== SERVER DETAIL ==========
async function openServerDetail(identifier) {
    openModal('server-detail-modal');
    $('server-detail-body').innerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
    Progress.start();
    try {
        const res = await api('/pterodactyl/server-detail/' + identifier);
        if (res.ok) {
            Progress.done();
            const d = res.data;
            const statusBadge = d.status === 'running' ? 'badge-green' : d.status === 'offline' ? 'badge-red' : 'badge-blue';
            const memGB = (d.memory / 1024).toFixed(1);
            const diskGB = (d.disk / 1024).toFixed(1);
            $('server-detail-body').innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:0.87rem">
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">SERVER NAME</div>
                <div style="font-weight:700;color:var(--cyan)">${d.name}</div>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">STATUS</div>
                <span class="badge ${statusBadge}">${d.status || 'installing'}</span>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">IP : PORT</div>
                <div style="font-weight:600">${d.ip || '-'}:${d.port || '-'}</div>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">EGG / NEST</div>
                <div style="font-weight:600">${d.egg || '-'} <span style="color:var(--text-muted)">/ ${d.nest || '-'}</span></div>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">MEMORY</div>
                <div style="font-weight:700;color:var(--blue)">${memGB} GB</div>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">DISK</div>
                <div style="font-weight:700;color:var(--purple)">${diskGB} GB</div>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">CPU LIMIT</div>
                <div style="font-weight:700;color:var(--pink)">${d.cpu}%</div>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">EXPIRED</div>
                <div style="font-weight:600;color:${d.expire_at ? 'var(--yellow)' : 'var(--green)'}">${d.expire_at || '♾ Permanen'}</div>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">DATABASE LIMIT</div>
                <div>${d.db_limit}</div>
              </div>
              <div class="card" style="padding:14px">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">BACKUP LIMIT</div>
                <div>${d.backup_limit}</div>
              </div>
              ${d.description ? `<div class="card" style="padding:14px;grid-column:1/-1">
                <div style="color:var(--text-secondary);font-size:0.72rem;margin-bottom:4px">DESKRIPSI</div>
                <div>${d.description}</div>
              </div>` : ''}
            </div>
            <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
              <button class="btn btn-secondary" style="background:rgba(168,85,247,0.1);color:var(--purple);border-color:rgba(168,85,247,0.25)"
                onclick="closeModal('server-detail-modal');reinstallServer('${d.identifier}','${d.name}')">🔄 Reinstall</button>
              <button class="btn btn-secondary" onclick="closeModal('server-detail-modal')">Tutup</button>
            </div>`;
        } else {
            Progress.fail();
            $('server-detail-body').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>${res.error || 'Gagal memuat detail'}</p></div>`;
        }
    } catch(e) {
        Progress.fail();
        $('server-detail-body').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>Gagal terhubung</p></div>`;
    }
}

// ========== REINSTALL SERVER ==========
function reinstallServer(identifier, name) {
    confirmDialog(`Reinstall server "${name}"? Semua file akan direset ke default egg. Data database tidak terhapus.`, async () => {
        Progress.start();
        const res = await api('/pterodactyl/reinstall/' + identifier, 'POST');
        if (res.ok) {
            Progress.done();
            toast('Reinstall server dimulai! Tunggu beberapa menit.', 'success');
        } else {
            Progress.fail();
            toast('Gagal reinstall: ' + (res.error || 'Error'), 'error');
        }
    });
}

// ========== PERPANJANG HOSTING ==========
async function loadRenewHosting() {
    const tbody = $('rh-table-body');
    tbody.innerHTML = `<tr><td colspan="5"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    Progress.start();
    try {
        const res = await api('/expirations');
        if (res.ok) {
            Progress.done();
            renderRenewTable(res.data);
        } else {
            Progress.fail();
            toast('Gagal memuat data', 'error');
        }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
}

function renderRenewTable(data) {
    const tbody = $('rh-table-body');
    if (!data || !data.length) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🔄</div><p>Tidak ada server dengan masa aktif terdaftar</p></div></td></tr>`;
        return;
    }
    const now = new Date();
    tbody.innerHTML = data.map(e => {
        const parts = e.expire_at.split(' ');
        const dmy = parts[0].split('/');
        const hm = (parts[1] || '00:00').split(':');
        const expDate = new Date(dmy[2], dmy[1]-1, dmy[0], hm[0], hm[1]);
        const diff = Math.ceil((expDate - now) / (1000*60*60*24));
        const badge = diff < 0 ? 'badge-red' : diff <= 1 ? 'badge-red' : diff <= 3 ? 'badge-yellow' : 'badge-green';
        const label = diff < 0 ? 'Sudah expired' : diff === 0 ? 'Hari ini' : diff + ' hari lagi';
        return `<tr>
            <td>${e.server_name}</td>
            <td>${e.owner_username || '-'}</td>
            <td>${e.expire_at}</td>
            <td><span class="badge ${badge}">${label}</span></td>
            <td>
              <button class="btn-sm btn-edit" onclick="openRenewModal('${e.server_id}','${e.server_name}','${e.expire_at}')">🔄 Perpanjang</button>
            </td>
        </tr>`;
    }).join('');
}

function openRenewModal(serverId, serverName, currentExpire) {
    $('renew-server-id').value = serverId;
    $('renew-server-name').textContent = serverName;
    $('renew-current-expire').textContent = currentExpire;
    $('renew-add-days').value = '30';
    openModal('renew-modal');
}

async function submitRenew() {
    const serverId = $('renew-server-id').value;
    const addDays = parseInt($('renew-add-days').value);
    const btn = $('btn-do-renew');
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Memproses...';
    Progress.start();
    try {
        const res = await api('/expirations/renew', 'POST', { server_id: serverId, add_days: addDays });
        if (res.ok) {
            Progress.done();
            toast(`Server diperpanjang! Expired baru: ${res.new_expire}`, 'success');
            closeModal('renew-modal');
            loadRenewHosting();
        } else {
            Progress.fail();
            toast('Gagal: ' + (res.error || 'Error'), 'error');
        }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
    btn.disabled = false;
    btn.innerHTML = '✅ Perpanjang';
}
