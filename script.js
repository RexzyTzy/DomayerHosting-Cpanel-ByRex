/* ============================================================
   Cpanel DomayerHosting By Ren&Kyz - script.js
   ============================================================ */

// ========== SOUND EFFECTS ==========
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudio() { if (!audioCtx) audioCtx = new AudioCtx(); return audioCtx; }

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
    click:   () => playTone(880, 'sine', 0.08, 0.07),
    nav:     () => { playTone(660, 'sine', 0.06, 0.05); setTimeout(()=>playTone(880,'sine',0.08,0.05), 60); },
    success: () => { playTone(523, 'sine', 0.1, 0.07); setTimeout(()=>playTone(659,'sine',0.1,0.07),100); setTimeout(()=>playTone(784,'sine',0.15,0.07),200); },
    error:   () => { playTone(200, 'sawtooth', 0.1, 0.08); setTimeout(()=>playTone(150,'sawtooth',0.1,0.08),100); },
    open:    () => playTone(440, 'sine', 0.12, 0.05),
    close:   () => playTone(330, 'sine', 0.1, 0.05),
};

// Attach click sounds globally
document.addEventListener('click', e => {
    const t = e.target.closest('button, .nav-item, .sidebar-user');
    if (t) SFX.click();
}, { capture: true, passive: true });

// ========== STATE ==========
const State = {
    user: null,      // logged-in panel user
    sidebarCollapsed: false,
    currentPage: 'home',
};

// ========== UTILS ==========
const $ = id => document.getElementById(id);
const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);

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

// Close modal on overlay click
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
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
        err.classList.remove('show');
        try {
            const res = await api('/login', 'POST', { username, password });
            if (res.ok) {
                State.user = res.user;
                SFX.success();
                showApp();
            } else {
                err.textContent = res.error || 'Username atau password salah';
                err.classList.add('show');
                SFX.error();
            }
        } catch (ex) {
            err.textContent = 'Gagal terhubung ke server';
            err.classList.add('show');
            SFX.error();
        }
    });
}

function logout() {
    api('/logout', 'POST').finally(() => {
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
    // Show/hide owner-only items
    qsa('.owner-only').forEach(el => {
        el.style.display = isOwner ? '' : 'none';
    });
}

function toggleSidebar() {
    State.sidebarCollapsed = !State.sidebarCollapsed;
    const sb = $('sidebar');
    const mw = $('main-wrapper');
    const nb = $('navbar');
    sb.classList.toggle('collapsed', State.sidebarCollapsed);
    mw.classList.toggle('collapsed', State.sidebarCollapsed);
    nb.classList.toggle('collapsed', State.sidebarCollapsed);
}

// ========== NAVIGATION ==========
function navigateTo(page) {
    SFX.nav();
    State.currentPage = page;
    // Update active nav item
    qsa('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
    // Show page
    qsa('.page').forEach(el => el.classList.remove('active'));
    const pg = $('page-' + page);
    if (pg) { pg.classList.add('active'); pg.classList.add('fade-up'); setTimeout(()=>pg.classList.remove('fade-up'),400); }
    // Load data for page
    const loaders = {
        home: loadHome,
        createAccount: () => loadCreateAccount(),
        createServer: () => loadCreateServer(),
        listUsers: loadListUsers,
        listServers: loadListServers,
        listNests: loadListNests,
        addAccount: loadAddAccount,
        activityLog: loadActivityLog,
    };
    if (loaders[page]) loaders[page]();
}

// ========== HOME PAGE ==========
async function loadHome() {
    $('home-loading').style.display = 'flex';
    $('home-stats').style.display = 'none';
    try {
        const res = await api('/stats');
        if (res.ok) {
            $('stat-users').textContent = res.data.users;
            $('stat-servers').textContent = res.data.servers;
            $('stat-nests').textContent = res.data.nests;
            $('stat-eggs').textContent = res.data.eggs;
            $('stat-nodes').textContent = res.data.nodes;
            $('stat-alloc').textContent = res.data.allocations;
            $('home-stats').style.display = 'grid';
        }
    } catch(e) { toast('Gagal memuat statistik panel', 'error'); }
    $('home-loading').style.display = 'none';
}

// ========== CREATE ACCOUNT ==========
async function loadCreateAccount() {
    // Role select based on logged-in user role
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
    btn.disabled = true; btn.textContent = 'Membuat...';
    try {
        const res = await api('/pterodactyl/create-user', 'POST', { email, username, firstname, lastname, password, role: parseInt(role) });
        if (res.ok) {
            toast('Akun berhasil dibuat!', 'success');
            ['ca-email','ca-username','ca-firstname','ca-lastname','ca-password'].forEach(id => $(id).value = '');
        } else {
            toast('Gagal: ' + (res.error || 'Error tidak diketahui'), 'error');
        }
    } catch(e) { toast('Gagal terhubung', 'error'); }
    btn.disabled = false; btn.textContent = '🚀 Buat Akun';
}

// ========== CREATE SERVER ==========
async function loadCreateServer() {
    // Load users, nodes, nests
    await Promise.all([loadCSUsers(), loadCSNodes(), loadCSNests()]);
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
                $('cs-alloc-loading').textContent = 'Memuat alokasi...';
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
    const $defAlloc = $('cs-default-alloc');
    $defAlloc.innerHTML = '<option>Loading...</option>';
    try {
        const res = await api('/pterodactyl/allocations/' + nodeId);
        if (res.ok) {
            $defAlloc.innerHTML = res.data.map(a => `<option value="${a.id}">${a.ip}:${a.port}</option>`).join('');
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
            // Update server name with egg name
            sel.onchange = function() {
                const ownUname = $('cs-name').value;
                const opt = this.options[this.selectedIndex];
                if (opt.value) {
                    const ownerName = ownUname.split('(')[0].trim() || '';
                    $('cs-name').value = ownerName + '(' + opt.text + ')';
                }
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
    const eggOpt = $('cs-egg').options[$('cs-egg').selectedIndex];
    const dockerImage = eggOpt ? eggOpt.dataset.docker : '';
    const startup = eggOpt ? decodeURIComponent(eggOpt.dataset.startup || '') : '';
    const ownerEmail = (() => {
        const opt = $('cs-owner').options[$('cs-owner').selectedIndex];
        if (!opt) return '';
        try { const u = JSON.parse(opt.dataset.user||'{}'); return u.email||''; } catch(e) { return ''; }
    })();
    const ownerUname = (() => {
        const opt = $('cs-owner').options[$('cs-owner').selectedIndex];
        if (!opt) return '';
        try { const u = JSON.parse(opt.dataset.user||'{}'); return u.username||''; } catch(e) { return ''; }
    })();

    if (!ownerId || !serverName || !nodeId || !allocId || !nestId || !eggId || !phone) {
        toast('Lengkapi semua field yang diperlukan termasuk nomor WA buyer', 'error'); return;
    }

    const btn = $('btn-create-server');
    btn.disabled = true; btn.textContent = 'Membuat Server...';
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
        });
        if (res.ok) {
            toast('Server berhasil dibuat & pesan WA terkirim!', 'success');
        } else {
            toast('Gagal: ' + (res.error || 'Error tidak diketahui'), 'error');
        }
    } catch(e) { toast('Gagal terhubung', 'error'); }
    btn.disabled = false; btn.textContent = '🚀 Buat Server & Kirim WA';
}

// ========== LIST USERS ==========
async function loadListUsers() {
    $('lu-table-body').innerHTML = `<tr><td colspan="5" class="text-center p-6"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    try {
        const res = await api('/pterodactyl/users');
        if (res.ok) renderUsersTable(res.data);
        else toast('Gagal memuat users', 'error');
    } catch(e) { toast('Gagal terhubung', 'error'); }
}

function renderUsersTable(users) {
    const isOwner = State.user && State.user.role === 1;
    const search = ($('lu-search').value || '').toLowerCase();
    const filtered = users.filter(u =>
        u.username.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search)
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

let cachedUsers = [];
document.addEventListener('DOMContentLoaded', () => {
    const s = $('lu-search');
    if (s) s.addEventListener('input', () => renderUsersTable(cachedUsers));
});

async function loadListUsersWithCache() {
    const res = await api('/pterodactyl/users');
    if (res.ok) { cachedUsers = res.data; renderUsersTable(res.data); }
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
    try {
        const body = { email, username, role };
        if (password) body.password = password;
        const res = await api('/pterodactyl/users/' + id, 'PATCH', body);
        if (res.ok) {
            toast('User berhasil diupdate!', 'success');
            closeModal('edit-user-modal');
            loadListUsers();
        } else { toast('Gagal: ' + (res.error || 'Error'), 'error'); }
    } catch(e) { toast('Gagal terhubung', 'error'); }
    btn.disabled = false;
}

function deleteUser(id, username) {
    confirmDialog(`Hapus user "${username}" dari panel Pterodactyl?`, async () => {
        const res = await api('/pterodactyl/users/' + id, 'DELETE');
        if (res.ok) { toast('User dihapus!', 'success'); loadListUsers(); }
        else toast('Gagal: ' + (res.error||'Error'), 'error');
    });
}

// ========== LIST SERVERS ==========
async function loadListServers() {
    $('ls-table-body').innerHTML = `<tr><td colspan="4" class="text-center p-6"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    try {
        const res = await api('/pterodactyl/servers');
        if (res.ok) renderServersTable(res.data);
        else toast('Gagal memuat servers', 'error');
    } catch(e) { toast('Gagal terhubung', 'error'); }
}

function renderServersTable(servers) {
    const isOwner = State.user && State.user.role === 1;
    if (!servers.length) {
        $('ls-table-body').innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🖥</div><p>Tidak ada server ditemukan</p></div></td></tr>`;
        return;
    }
    $('ls-table-body').innerHTML = servers.map(s => {
        const status = s.status === 'running' ? 'badge-green' : (s.status === 'offline' ? 'badge-red' : 'badge-blue');
        const statusLabel = s.status || 'installing';
        return `<tr>
            <td>${s.name}</td>
            <td>${s.user || s.owner || '-'}</td>
            <td><span class="badge ${status}">${statusLabel}</span></td>
            <td>${isOwner ? `<button class="btn-sm btn-del" onclick="deleteServer('${s.identifier}','${s.name}')">🗑 Hapus</button>` : '-'}</td>
        </tr>`;
    }).join('');
}

function deleteServer(identifier, name) {
    confirmDialog(`Hapus server "${name}" dari panel?`, async () => {
        const res = await api('/pterodactyl/servers/' + identifier, 'DELETE');
        if (res.ok) { toast('Server dihapus!', 'success'); loadListServers(); }
        else toast('Gagal: ' + (res.error||'Error'), 'error');
    });
}

// ========== LIST NESTS ==========
async function loadListNests() {
    $('ln-table-body').innerHTML = `<tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    try {
        const res = await api('/pterodactyl/nests');
        if (!res.ok) { toast('Gagal memuat nests', 'error'); return; }
        if (!res.data.length) {
            $('ln-table-body').innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon">🥚</div><p>Tidak ada nest</p></div></td></tr>`;
            return;
        }
        $('ln-table-body').innerHTML = res.data.map(n => `<tr>
            <td>${n.id}</td>
            <td>${n.name}</td>
            <td>${n.description || '-'}</td>
            <td><span class="badge badge-cyan">${n.egg_count || 0} eggs</span></td>
        </tr>`).join('');
    } catch(e) { toast('Gagal terhubung', 'error'); }
}

// ========== ADD ACCOUNT (Panel Login) ==========
async function loadAddAccount() {
    loadPanelAccounts();
}

async function loadPanelAccounts() {
    const res = await api('/panel-accounts');
    const tbody = $('pa-table-body');
    if (!res.ok) { tbody.innerHTML = '<tr><td colspan="4">Gagal memuat</td></tr>'; return; }
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
    const res = await api('/panel-accounts', 'POST', { username, password, role });
    if (res.ok) {
        toast('Akun panel ditambahkan!', 'success');
        $('pa-username').value = ''; $('pa-password').value = '';
        loadPanelAccounts();
    } else toast('Gagal: ' + (res.error||'Error'), 'error');
    btn.disabled = false;
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
    const res = await api('/panel-accounts/' + id, 'PATCH', body);
    if (res.ok) {
        toast('Akun panel diupdate!', 'success');
        closeModal('edit-panel-user-modal');
        loadPanelAccounts();
    } else toast('Gagal: ' + (res.error||'Error'), 'error');
}

function deletePanelUser(id, username) {
    confirmDialog(`Hapus akun panel "${username}"?`, async () => {
        const res = await api('/panel-accounts/' + id, 'DELETE');
        if (res.ok) { toast('Akun dihapus!', 'success'); loadPanelAccounts(); }
        else toast('Gagal', 'error');
    });
}

// ========== ACTIVITY LOG ==========
async function loadActivityLog() {
    $('al-table-body').innerHTML = `<tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>`;
    try {
        const res = await api('/logs');
        if (res.ok) renderLogs(res.data);
        else toast('Gagal memuat log', 'error');
    } catch(e) { toast('Gagal terhubung', 'error'); }
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
        const res = await api('/logs/clear', 'DELETE');
        if (res.ok) { toast('Log dibersihkan!', 'success'); loadActivityLog(); }
        else toast('Gagal', 'error');
    });
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    // Check session
    api('/me').then(res => {
        if (res.ok && res.user) {
            State.user = res.user;
            showApp();
        }
    }).catch(() => {});
});
