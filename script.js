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

// Click sound - loaded from /click.mp3
let clickBuffer = null;

async function loadClickSound() {
    try {
        const ac = getAudio();
        const res = await fetch('/click.mp3');
        const arr = await res.arrayBuffer();
        clickBuffer = await ac.decodeAudioData(arr);
    } catch(e) {}
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
    nav:     () => playClick(),
    success: () => { playTone(523,'sine',0.1,0.07); setTimeout(()=>playTone(659,'sine',0.1,0.07),100); setTimeout(()=>playTone(784,'sine',0.15,0.07),200); },
    error:   () => { playTone(200,'sawtooth',0.1,0.08); setTimeout(()=>playTone(150,'sawtooth',0.1,0.08),100); },
    open:    () => playClick(),
    close:   () => playClick(),
};

// Load sound on first interaction (browser policy)
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
    // Validasi
    if (!email || !username || !firstname || !password) {
        toast('Lengkapi semua field yang diperlukan', 'error'); return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        toast('Format email tidak valid!', 'error'); return;
    }
    if (username.length < 3) {
        toast('Username minimal 3 karakter', 'error'); return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        toast('Username hanya boleh huruf, angka, titik, strip, underscore', 'error'); return;
    }
    if (password.length < 8) {
        toast('Password minimal 8 karakter', 'error'); return;
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
        <td>
          <span style="cursor:pointer" onclick="navigator.clipboard.writeText('${u.email}').then(()=>toast('Email disalin!','info'))">${u.email} 📋</span>
        </td>
        <td>
          <span style="cursor:pointer" onclick="navigator.clipboard.writeText('${u.username}').then(()=>toast('Username disalin!','info'))">${u.username} 📋</span>
        </td>
        <td><span class="badge ${u.root_admin ? 'badge-pink' : 'badge-cyan'}">${u.root_admin ? 'Admin' : 'Member'}</span></td>
        <td style="display:flex;gap:5px;flex-wrap:wrap">
          ${isOwner ? `<button class="btn-sm btn-edit" onclick="openEditUser(${u.id},'${u.email}','${u.username}',${u.root_admin?1:0})">✏ Edit</button>
            <button class="btn-sm btn-del" onclick="deleteUser(${u.id},'${u.username}')">🗑 Hapus</button>` : '-'}
        </td>
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
        if (res.ok) {
            cachedServers = res.data;
            renderServersTable(res.data);
            Progress.done();
        } else { Progress.fail(); toast('Gagal memuat servers', 'error'); }
    } catch(e) { Progress.fail(); toast('Gagal terhubung', 'error'); }
}

let cachedServers = [];

function renderServersTable(servers) {
    const isOwner = State.user && State.user.role === 1;
    const search = ($('ls-search') ? $('ls-search').value : '').toLowerCase();
    const filtered = search ? servers.filter(s => s.name.toLowerCase().includes(search) || (s.user||'').toLowerCase().includes(search)) : servers;
    if (!filtered.length) {
        $('ls-table-body').innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🖥</div><p>Tidak ada server ditemukan</p></div></td></tr>`;
        return;
    }
    $('ls-table-body').innerHTML = filtered.map(s => {
        const isSuspended = s.status === 'suspended';
        const status = isSuspended ? 'badge-red' : s.status === 'running' ? 'badge-green' : s.status === 'offline' ? 'badge-red' : 'badge-blue';
        const statusLabel = isSuspended ? '🔒 suspended' : (s.status || 'installing');
        return `<tr>
            <td><span style="cursor:pointer;color:var(--cyan)" onclick="openServerDetail('${s.identifier}')">${s.name}</span></td>
            <td>${s.user || s.owner || '-'}</td>
            <td><span class="badge ${status}">${statusLabel}</span></td>
            <td style="display:flex;gap:5px;flex-wrap:wrap">
              <button class="btn-sm btn-edit" onclick="openServerDetail('${s.identifier}')">🔍 Detail</button>
              <button class="btn-sm" style="background:rgba(168,85,247,0.1);color:var(--purple);border:1px solid rgba(168,85,247,0.25)" onclick="reinstallServer('${s.identifier}','${s.name}')">🔄 Reinstall</button>
              ${isOwner && !isSuspended ? `<button class="btn-sm" style="background:rgba(245,158,11,0.1);color:var(--yellow);border:1px solid rgba(245,158,11,0.25)" onclick="suspendServer('${s.identifier}','${s.name}')">🔒 Suspend</button>` : ''}
              ${isOwner && isSuspended ? `<button class="btn-sm" style="background:rgba(34,197,94,0.1);color:var(--green);border:1px solid rgba(34,197,94,0.25)" onclick="unsuspendServer('${s.identifier}','${s.name}')">🔓 Unsuspend</button>` : ''}
              ${isOwner ? `<button class="btn-sm btn-del" onclick="deleteServer('${s.identifier}','${s.name}')">🗑 Hapus</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function deleteServer(identifier, name) {
    confirmDialog(`Hapus server "${name}" dari panel? Server akan DIHAPUS PERMANENT.`, async () => {
        Progress.start();
        const res = await api('/pterodactyl/servers/' + identifier, 'DELETE');
        if (res.ok) { Progress.done(); toast('Server dihapus!', 'success'); loadListServers(); }
        else { Progress.fail(); toast('Gagal: ' + (res.error||'Error'), 'error'); }
    });
}

function suspendServer(identifier, name) {
    confirmDialog(`Suspend server "${name}"? Server akan dibekukan, data tetap aman.`, async () => {
        Progress.start();
        const res = await api('/pterodactyl/suspend/' + identifier, 'POST');
        if (res.ok) { Progress.done(); toast('Server disuspend!', 'success'); loadListServers(); }
        else { Progress.fail(); toast('Gagal suspend: ' + (res.error||'Error'), 'error'); }
    });
}

function unsuspendServer(identifier, name) {
    confirmDialog(`Unsuspend server "${name}"? Server akan aktif kembali.`, async () => {
        Progress.start();
        const res = await api('/pterodactyl/unsuspend/' + identifier, 'POST');
        if (res.ok) { Progress.done(); toast('Server diaktifkan kembali!', 'success'); loadListServers(); }
        else { Progress.fail(); toast('Gagal unsuspend: ' + (res.error||'Error'), 'error'); }
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
    const ls = $('ls-search');
    if (ls) ls.addEventListener('input', debounce(() => renderServersTable(cachedServers), 200));
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
