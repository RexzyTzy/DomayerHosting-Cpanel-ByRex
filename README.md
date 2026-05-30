# 🐦 Cpanel DomayerHosting By Ren&Kyz

> Panel manajemen hosting berbasis Pterodactyl yang dibangun dengan **Go (Golang)** — ringan, cepat, dan siap deploy ke **Railway**.

---

## 📋 Daftar Isi

- [Fitur](#fitur)
- [Struktur File](#struktur-file)
- [Teknologi](#teknologi)
- [Konfigurasi](#konfigurasi)
- [Cara Deploy ke Railway](#cara-deploy-ke-railway)
- [Login Default](#login-default)
- [Role System](#role-system)
- [Fitur Detail](#fitur-detail)
- [Database Structure](#database-structure)
- [WhatsApp Integration](#whatsapp-integration)
- [Changelog](#changelog)

---

## ✨ Fitur

| Fitur | Administrator | Owner |
|-------|:---:|:---:|
| Login Panel | ✅ | ✅ |
| Home Dashboard (Stats) | ✅ | ✅ |
| Create Account Pterodactyl | ✅ (member only) | ✅ (member + admin) |
| Create Server + Kirim WA | ✅ | ✅ |
| List Users (view) | ✅ | ✅ |
| List Users (edit/delete) | ❌ | ✅ |
| List Servers (view) | ✅ | ✅ |
| List Servers (delete) | ❌ | ✅ |
| List Nests & Eggs | ✅ | ✅ |
| Add Account Panel | ❌ | ✅ |
| Activity Log | ❌ | ✅ |
| Clear Activity Log | ❌ | ✅ |

---

## 📁 Struktur File

```
cpanel-domayer/
├── index.go       ← Backend Go (semua logic, API, HTML renderer)
├── style.css      ← Tampilan UI (Neon Cyberpunk + Glassmorphism)
├── script.js      ← Frontend JavaScript (SPA, sounds, API calls)
├── go.mod         ← Go module dependencies
├── go.sum         ← Go dependency checksums
├── railway.toml   ← Konfigurasi deploy Railway
└── README.md      ← Dokumentasi ini
```

> ⚠️ **Semua konfigurasi (API key, DB, dsb) disimpan langsung di `index.go`** — tidak perlu file `.env`.

---

## 🔧 Teknologi

- **Backend**: Go 1.21 (net/http standard library)
- **Database**: MySQL (remote MariaDB via TCP)
- **Frontend**: Vanilla HTML + CSS + JavaScript (SPA, no framework)
- **UI Theme**: Neon Cyberpunk Glassmorphism (dark mode)
- **WhatsApp**: Fonnte API
- **Pterodactyl**: Admin API v1
- **Deploy**: Railway (Nixpacks auto-detect Go)

---

## ⚙ Konfigurasi

Semua konfigurasi ada di bagian `CONFIG` dalam `index.go`:

```go
const (
    DBHost     = "157.230.40.102"
    DBPort     = "3306"
    DBUser     = "u63_F4OEsPnGIW"
    DBPassword = "Ncr=pa0a==IsDqXmJyi3d1h3"
    DBName     = "s63_domayer"

    PterodactylURL      = "https://domayer.septacloud.me"
    PterodactylAdminKey = "ptla_3iotPc2yjpGPLsk0Ap86JRT1FOdKWN8YQzn6Xv1JdCU"
    PterodactylUserKey  = "ptlc_GdtcgltLHzPehw8LrOQKgJNe7kFXDgzjtwIlX8X5Huf"

    FonnteAPIKey = "WSutCwy53viwdyH8gwqE"
    PanelLink    = "https://reshhus.myserverr.web.id"
    PanelPMALink = "https://reshhus.myserverr.web.id/pma"
)
```

---

## 🚀 Cara Deploy ke Railway

### 1. Persiapan
- Punya akun [Railway](https://railway.app)
- Install [Railway CLI](https://docs.railway.app/develop/cli) (opsional)

### 2. Upload Project
1. Buat project baru di Railway
2. Pilih **"Deploy from GitHub"** atau gunakan Railway CLI
3. Push semua file ke repository GitHub kamu

### 3. Deploy via GitHub
```bash
git init
git add .
git commit -m "Initial deploy Cpanel DomayerHosting"
git remote add origin https://github.com/username/repo.git
git push -u origin main
```
Lalu connect repo tersebut ke Railway.

### 4. Deploy via CLI
```bash
railway login
railway init
railway up
```

### 5. Konfigurasi Port
Railway otomatis set `PORT` environment variable. Server sudah dikonfigurasi untuk membaca `PORT` dari environment:
```go
port := os.Getenv("PORT")
if port == "" {
    port = "8080"
}
```

### 6. Generate Domain
Di Railway dashboard → Settings → Networking → Generate Domain

---

## 🔑 Login Default

Saat pertama kali dijalankan, sistem otomatis membuat akun Owner default:

| Username | Password | Role |
|----------|----------|------|
| `admin`  | `admin123` | Owner |

> ⚠️ **Segera ganti password setelah login pertama!** Gunakan menu **Add Account Panel** untuk mengelola akun.

---

## 👑 Role System

### Role 0 — Administrator
- Bisa membuat akun Pterodactyl (hanya sebagai Member)
- Bisa membuat server dan mengirim WA ke buyer
- Bisa melihat list users, servers, nests
- **Tidak bisa** edit/hapus user atau server
- **Tidak bisa** akses Add Account Panel & Activity Log

### Role 1 — Owner
- Semua akses Administrator
- Bisa membuat akun Pterodactyl sebagai Member atau Administrator
- Bisa edit dan hapus user & server di Pterodactyl
- Bisa mengelola akun login panel (tambah/edit/hapus)
- Bisa melihat dan clear Activity Log

---

## 🔍 Fitur Detail

### 🏠 Home Dashboard
Menampilkan statistik panel secara realtime:
- Total Users terdaftar di Pterodactyl
- Total Servers aktif
- Total Nests & Eggs
- Total Nodes & Alokasi
- Informasi URL panel

### 👤 Create Account
Form untuk membuat akun baru di Pterodactyl:
- Email, Username, First Name, Last Name
- Password, Language (English default)
- Role: Member (untuk semua user) / Administrator (khusus Owner)

### 🖥 Create Server
Form lengkap pembuatan server dengan:
- **Core Details**: Owner (select dari list user), Nama server auto-fill, Deskripsi
- **Allocation**: Pilih Node (auto-select jika hanya 1), Default Allocation otomatis
- **Feature Limits**: Database, Backup, Allocation limit (0–10)
- **Resources**: CPU 100%–500%, Memory 1–50GB, Disk 1–50GB
- **Nest & Egg**: Select nest → egg dengan auto-fetch
- **WA Integration**: Input nomor buyer, pesan terkirim otomatis setelah server dibuat

### 👥 List Users
Tabel semua user Pterodactyl dengan:
- ID, Email, Username, Role, Aksi
- Search realtime
- Edit & Delete (khusus Owner)

### 🖥 List Servers
Tabel semua server dengan:
- Nama Server, Owner Username, Status (running/offline/installing)
- Delete server (khusus Owner)

### 🥚 List Nests
Tabel semua nest dengan jumlah egg per nest

### 🔐 Add Account Panel
Menu khusus Owner untuk:
- Tambah akun panel login baru (username, password, role)
- Lihat semua akun panel yang ada
- Edit dan hapus akun panel

### 📋 Activity Log
Log semua aktivitas dengan format:
```
Username | Role | Aktivitas | Waktu
```
Contoh:
```
Rexxy | Owner | Membuat server RexxyTzy(Minecraft) untuk user123 | 06:45 02/03/2026
```
- Tombol **Clear All Log** untuk membersihkan semua log

---

## 🗄 Database Structure

Tabel dibuat **otomatis** saat pertama kali dijalankan.

### Tabel `users`
```sql
CREATE TABLE users (
    id       INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password VARCHAR(64) NOT NULL,  -- MD5 hash
    role     TINYINT NOT NULL DEFAULT 0  -- 0=admin, 1=owner
);
```

### Tabel `logs`
```sql
CREATE TABLE logs (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    users VARCHAR(64) NOT NULL,
    role  TINYINT NOT NULL DEFAULT 0,
    log   TEXT NOT NULL,
    time  VARCHAR(32) NOT NULL
);
```

---

## 📱 WhatsApp Integration

Menggunakan **Fonnte API** untuk kirim pesan WA otomatis ke buyer.

### Format nomor yang diterima:
- `628xxxxxxxxx` → langsung digunakan
- `08xxxxxxxxx` → dikonversi ke `628xxxxxxxxx`

### Template pesan yang dikirim:
```
________📦KOTAK PESANAN ANDA________
_selamat pesanan anda sudah terkonfirmasi oleh owner_

_data data account anda_
_gmail : buyer@gmail.com_
_user : buyerusername_
_password : buyerpassword_
_egg : Minecraft Java_

_link untuk masuk ke hosting_
_link panel : https://reshhus.myserverr.web.id_
_link phpmyadmin : https://reshhus.myserverr.web.id/pma_

*________⚠️RULES / TOS________*
_1.dilarang menggunakan script bertujuan ddos/hacking/bypass_
_2.dilarang mencoba otak Atik sistem operasi_
_3.jika account hilang/dicuri teman tidak ada refund_
_4.refund aktif selama 7 hari_
```

---

## 🎵 Sound Effects

Panel dilengkapi **efek suara** (Web Audio API):
- **Klik tombol/nav**: tone pendek
- **Navigasi sidebar**: chord pendek
- **Sukses**: melodi naik 3 nada
- **Error**: nada turun
- **Buka/tutup modal**: tone berbeda

> Suara aktif otomatis setelah interaksi pertama user (browser policy).

---

## 🔒 Security Notes

- Password login panel di-hash menggunakan **MD5**
- Session berbasis cookie dengan `HttpOnly` flag
- Token session di-generate random per login
- Session expire setelah 7 hari

---

## 📝 Changelog

### v1.0.0 — Initial Release
- Login panel dengan role system (Administrator & Owner)
- Dashboard statistik realtime dari Pterodactyl API
- Create Account Pterodactyl
- Create Server dengan auto-fill & WA sender
- List Users, Servers, Nests
- Add Account Panel (Owner only)
- Activity Log dengan auto-record (Owner only)
- Neon Cyberpunk Glassmorphism UI
- Sound effects pada navigasi dan interaksi
- Auto-create database tables
- Default owner account seeder
- Deploy-ready untuk Railway

---

## 👨‍💻 Credits

**Cpanel DomayerHosting** dibuat oleh **Ren&Kyz**

> "Simple, fast, and powerful hosting panel for Pterodactyl"
