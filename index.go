package main

import (
	"crypto/md5"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// ============================================================
// CONFIG - HARDCODED
// ============================================================
const (
	DBHost     = "160.187.211.168"
	DBPort     = "3306"
	DBUser     = "u33_skwR6rpsf3"
	DBPassword = "aW7nnmGI0^z.H@2TcC.RAn!3"
	DBName     = "s33_domayer"

	PterodactylURL      = "https://domayer.septacloud.me"
	PterodactylAdminKey = "ptla_3iotPc2yjpGPLsk0Ap86JRT1FOdKWN8YQzn6Xv1JdCU"
	PterodactylUserKey  = "ptlc_GdtcgltLHzPehw8LrOQKgJNe7kFXDgzjtwIlX8X5Huf"

	FonnteAPIKey  = "WSutCwy53viwdyH8gwqE"
	PanelLink     = "https://domayer.septacloud.me"
	PanelPMALink  = "https://domayer.septacloud.me/pma"

	SessionCookieName = "domayer_session"
	SessionMaxAge     = 86400 * 7 // 7 days
)

// ============================================================
// GLOBALS
// ============================================================
var db *sql.DB

// In-memory session store: token -> username
var sessions = map[string]string{}

// WIB timezone (UTC+7)
var wibLoc = time.FixedZone("WIB", 7*60*60)

// ============================================================
// MODELS
// ============================================================
type PanelUser struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Role     int    `json:"role"` // 0=administrator, 1=owner
}

type LogEntry struct {
	Users string `json:"users"`
	Role  int    `json:"role"`
	Log   string `json:"log"`
	Time  string `json:"time"`
}

// ============================================================
// DATABASE INIT
// ============================================================
func initDB() {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4&timeout=10s&readTimeout=10s&writeTimeout=10s",
		DBUser, DBPassword, DBHost, DBPort, DBName)
	var err error
	db, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("⚠ DB open error: %v — will retry in background", err)
		go retryDB(dsn)
		return
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err = db.Ping(); err != nil {
		log.Printf("⚠ DB ping error: %v — will retry in background", err)
		go retryDB(dsn)
		return
	}
	log.Println("✅ Database connected")
	autoMigrate()
}

func retryDB(dsn string) {
	for i := 1; i <= 10; i++ {
		time.Sleep(time.Duration(i*3) * time.Second)
		log.Printf("🔄 Retrying DB connection (attempt %d/10)...", i)
		conn, err := sql.Open("mysql", dsn)
		if err != nil {
			log.Printf("⚠ Retry %d failed: %v", i, err)
			continue
		}
		conn.SetMaxOpenConns(10)
		conn.SetMaxIdleConns(5)
		conn.SetConnMaxLifetime(5 * time.Minute)
		if err = conn.Ping(); err != nil {
			log.Printf("⚠ Retry %d ping failed: %v", i, err)
			conn.Close()
			continue
		}
		db = conn
		log.Println("✅ Database connected (retry success)")
		autoMigrate()
		return
	}
	log.Println("❌ All DB retry attempts failed. Running without database.")
}

func autoMigrate() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id       INT AUTO_INCREMENT PRIMARY KEY,
			username VARCHAR(64) NOT NULL UNIQUE,
			password VARCHAR(64) NOT NULL,
			role     TINYINT NOT NULL DEFAULT 0
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

		`CREATE TABLE IF NOT EXISTS logs (
			id    INT AUTO_INCREMENT PRIMARY KEY,
			users VARCHAR(64) NOT NULL,
			role  TINYINT NOT NULL DEFAULT 0,
			log   TEXT NOT NULL,
			time  VARCHAR(32) NOT NULL
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

		`CREATE TABLE IF NOT EXISTS server_expirations (
			id              INT AUTO_INCREMENT PRIMARY KEY,
			server_id       VARCHAR(64) NOT NULL UNIQUE,
			server_name     VARCHAR(255) NOT NULL,
			owner_id        INT NOT NULL DEFAULT 0,
			owner_username  VARCHAR(64) NOT NULL DEFAULT \'\',
			owner_email     VARCHAR(128) NOT NULL DEFAULT \'\',
			owner_phone     VARCHAR(32) NOT NULL DEFAULT \'\',
			owner_password  VARCHAR(128) NOT NULL DEFAULT \'\',
			egg_name        VARCHAR(128) NOT NULL DEFAULT \'\',
			duration_days   INT NOT NULL DEFAULT 0,
			notif_sent      TINYINT NOT NULL DEFAULT 0,
			suspended       TINYINT NOT NULL DEFAULT 0,
			suspend_notif   TINYINT NOT NULL DEFAULT 0,
			pre_suspend_notif TINYINT NOT NULL DEFAULT 0,
			suspended_at    DATETIME NULL,
			expire_at       DATETIME NOT NULL,
			created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
	}
	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Printf("⚠ Migrate warning: %v", err)
		}
	}

	// Seed default owner if no users exist
	var count int
	db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if count == 0 {
		pass := md5Hash("admin123")
		db.Exec("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", "admin", pass, 1)
		log.Println("✅ Default owner created: admin / admin123")
	}
}

func md5Hash(s string) string {
	return s
}

// ============================================================
// HELPERS
// ============================================================
func jsonResp(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func errResp(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": msg})
}

func decodeBody(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}

func getSession(r *http.Request) *PanelUser {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return nil
	}
	username, ok := sessions[cookie.Value]
	if !ok {
		return nil
	}
	if db == nil {
		return nil
	}
	var u PanelUser
	err = db.QueryRow("SELECT id, username, role FROM users WHERE username=?", username).Scan(&u.ID, &u.Username, &u.Role)
	if err != nil {
		return nil
	}
	return &u
}

func requireAuth(w http.ResponseWriter, r *http.Request) *PanelUser {
	u := getSession(r)
	if u == nil {
		errResp(w, 401, "Unauthorized")
	}
	return u
}

func requireOwner(w http.ResponseWriter, r *http.Request) *PanelUser {
	u := requireAuth(w, r)
	if u == nil {
		return nil
	}
	if u.Role != 1 {
		errResp(w, 403, "Hanya Owner yang bisa mengakses fitur ini")
		return nil
	}
	return u
}

func writeLog(username string, role int, logMsg string) {
	if db == nil {
		return
	}
	t := time.Now().In(wibLoc).Format("15:04 02/01/2006")
	db.Exec("INSERT INTO logs (users, role, log, time) VALUES (?,?,?,?)", username, role, logMsg, t)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(200)
	dbStatus := "connected"
	if db == nil {
		dbStatus = "connecting..."
	} else if err := db.Ping(); err != nil {
		dbStatus = "reconnecting..."
	}
	fmt.Fprintf(w, `{"ok":true,"status":"running","db":"%s"}`, dbStatus)
}

func generateToken() string {
	return fmt.Sprintf("%x", md5.Sum([]byte(fmt.Sprintf("%d-%d", time.Now().In(wibLoc).UnixNano(), os.Getpid()))))
}

// ============================================================
// PTERODACTYL API CLIENT
// ============================================================
func pteroRequest(method, path string, body interface{}) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		bodyReader = strings.NewReader(string(b))
	}
	req, err := http.NewRequest(method, PterodactylURL+path, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+PterodactylAdminKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

// ============================================================
// FONNTE WHATSAPP SENDER
// ============================================================
func sendWhatsApp(phone, message string) error {
	// Normalize phone
	phone = strings.TrimSpace(phone)
	if strings.HasPrefix(phone, "08") {
		phone = "628" + phone[2:]
	}
	if !strings.HasPrefix(phone, "62") {
		phone = "62" + strings.TrimLeft(phone, "0")
	}

	payload := map[string]string{
		"target":  phone,
		"message": message,
	}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://api.fonnte.com/send", strings.NewReader(string(b)))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", FonnteAPIKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func buildWAMessage(email, username, password, eggName, expiredDate string) string {
	expiredLine := ""
	if expiredDate != "" {
		expiredLine = fmt.Sprintf("\n_expired : %s_", expiredDate)
	}
	return fmt.Sprintf(`________📦KOTAK PESANAN ANDA________
_selamat pesanan anda sudah terkonfirmasi oleh owner_

_data data account anda_
_gmail : %s_
_user : %s_
_password : %s_
_egg : %s_%s

_link untuk masuk ke hosting_
_link panel : %s_
_link phpmyadmin : %s_

*________⚠️RULES / TOS________*
_1.dilarang menggunakan script bertujuan ddos/hacking/bypass_
_2.dilarang mencoba otak Atik sistem operasi_
_3.jika account hilang/dicuri teman tidak ada refund_
_4.refund aktif selama 7 hari_`,
		email, username, password, eggName, expiredLine, PanelLink, PanelPMALink)
}

// ============================================================
// STATIC FILE HANDLER
// ============================================================
func staticHandler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch path {
	case "/style.css":
		w.Header().Set("Content-Type", "text/css")
		http.ServeFile(w, r, "style.css")
	case "/script.js":
		w.Header().Set("Content-Type", "application/javascript")
		http.ServeFile(w, r, "script.js")
	default:
		serveIndex(w, r)
	}
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, htmlPage())
}

// ============================================================
// ROUTES
// ============================================================
func main() {
	initDB()

	mux := http.NewServeMux()

	// Static + frontend
	mux.HandleFunc("/style.css", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		http.ServeFile(w, r, "style.css")
	})
	mux.HandleFunc("/script.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		http.ServeFile(w, r, "script.js")
	})
	mux.HandleFunc("/click.mp3", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mpeg")
		w.Header().Set("Cache-Control", "public, max-age=31536000")
		http.ServeFile(w, r, "click.mp3")
	})

	// Health check
	mux.HandleFunc("/health", handleHealth)

	// Auth
	mux.HandleFunc("/api/login", handleLogin)
	mux.HandleFunc("/api/logout", handleLogout)
	mux.HandleFunc("/api/me", handleMe)

	// Stats
	mux.HandleFunc("/api/stats", handleStats)

	// Pterodactyl Users
	mux.HandleFunc("/api/pterodactyl/users", handlePteroUsers)
	mux.HandleFunc("/api/pterodactyl/users/", handlePteroUserByID)
	mux.HandleFunc("/api/pterodactyl/create-user", handleCreatePteroUser)

	// Pterodactyl Servers
	mux.HandleFunc("/api/pterodactyl/servers", handlePteroServers)
	mux.HandleFunc("/api/pterodactyl/servers/", handlePteroServerByID)
	mux.HandleFunc("/api/pterodactyl/create-server", handleCreateServer)

	// Pterodactyl Nodes & Allocations
	mux.HandleFunc("/api/pterodactyl/nodes", handlePteroNodes)
	mux.HandleFunc("/api/pterodactyl/allocations/", handlePteroAllocations)

	// Pterodactyl Nests & Eggs
	mux.HandleFunc("/api/pterodactyl/nests", handlePteroNests)
	mux.HandleFunc("/api/pterodactyl/nests/", handlePteroNestEggs)

	// Panel Accounts (local DB)
	mux.HandleFunc("/api/panel-accounts", handlePanelAccounts)
	mux.HandleFunc("/api/panel-accounts/", handlePanelAccountByID)

	// Activity Log
	mux.HandleFunc("/api/logs", handleLogs)
	mux.HandleFunc("/api/logs/clear", handleLogsClear)

	// Server Expirations
	mux.HandleFunc("/api/expirations", handleExpirations)
	mux.HandleFunc("/api/expirations/renew", handleRenewServer)

	// Suspend / Unsuspend
	mux.HandleFunc("/api/pterodactyl/suspend/", handleSuspendServer)
	mux.HandleFunc("/api/pterodactyl/unsuspend/", handleUnsuspendServer)

	// Server Detail & Reinstall
	mux.HandleFunc("/api/pterodactyl/server-detail/", handleServerDetail)
	mux.HandleFunc("/api/pterodactyl/reinstall/", handleReinstallServer)

	// Auto delete empty users
	mux.HandleFunc("/api/pterodactyl/check-empty-users", handleCheckEmptyUsers)

	// Catch-all -> serve SPA
	mux.HandleFunc("/", serveIndex)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Start auto-expiry checker
	go startExpiryChecker()

	log.Printf("🚀 Cpanel DomayerHosting By Ren&Kyz running on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(mux)))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ============================================================
// AUTH HANDLERS
// ============================================================
func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errResp(w, 405, "Method not allowed")
		return
	}
	if db == nil {
		errResp(w, 503, "Database sedang menghubungkan, coba lagi dalam beberapa detik")
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := decodeBody(r, &body); err != nil {
		errResp(w, 400, "Invalid JSON")
		return
	}
	hashed := md5Hash(body.Password)
	var u PanelUser
	err := db.QueryRow("SELECT id, username, role FROM users WHERE username=? AND password=?",
		body.Username, hashed).Scan(&u.ID, &u.Username, &u.Role)
	if err != nil {
		errResp(w, 401, "Username atau password salah")
		return
	}
	token := generateToken()
	sessions[token] = u.Username
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   SessionMaxAge,
		HttpOnly: true,
	})
	writeLog(u.Username, u.Role, "Login ke panel")
	jsonResp(w, map[string]interface{}{"ok": true, "user": u})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(SessionCookieName)
	if err == nil {
		delete(sessions, cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: SessionCookieName, MaxAge: -1, Path: "/"})
	jsonResp(w, map[string]interface{}{"ok": true})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	u := getSession(r)
	if u == nil {
		jsonResp(w, map[string]interface{}{"ok": false})
		return
	}
	jsonResp(w, map[string]interface{}{"ok": true, "user": u})
}

// ============================================================
// STATS HANDLER
// ============================================================
func handleStats(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}

	type Stats struct {
		Users       int `json:"users"`
		Servers     int `json:"servers"`
		Nests       int `json:"nests"`
		Eggs        int `json:"eggs"`
		Nodes       int `json:"nodes"`
		Allocations int `json:"allocations"`
	}
	var s Stats

	// Users
	if data, code, err := pteroRequest("GET", "/api/application/users?per_page=100", nil); err == nil && code == 200 {
		var res struct {
			Meta struct{ Pagination struct{ Total int } }
		}
		json.Unmarshal(data, &res)
		s.Users = res.Meta.Pagination.Total
	}
	// Servers
	if data, code, err := pteroRequest("GET", "/api/application/servers?per_page=100", nil); err == nil && code == 200 {
		var res struct {
			Meta struct{ Pagination struct{ Total int } }
		}
		json.Unmarshal(data, &res)
		s.Servers = res.Meta.Pagination.Total
	}
	// Nodes
	if data, code, err := pteroRequest("GET", "/api/application/nodes?per_page=100", nil); err == nil && code == 200 {
		var res struct {
			Data []interface{}
		}
		json.Unmarshal(data, &res)
		s.Nodes = len(res.Data)
	}
	// Nests & Eggs
	if data, code, err := pteroRequest("GET", "/api/application/nests?per_page=100&include=eggs", nil); err == nil && code == 200 {
		var res struct {
			Data []struct {
				Attributes struct {
					Relationships struct {
						Eggs struct {
							Data []interface{}
						}
					}
				}
			}
		}
		json.Unmarshal(data, &res)
		s.Nests = len(res.Data)
		for _, n := range res.Data {
			s.Eggs += len(n.Attributes.Relationships.Eggs.Data)
		}
	}
	// Allocations (all nodes)
	if data, code, err := pteroRequest("GET", "/api/application/nodes?per_page=100", nil); err == nil && code == 200 {
		var nodes struct {
			Data []struct {
				Attributes struct{ ID int }
			}
		}
		json.Unmarshal(data, &nodes)
		for _, n := range nodes.Data {
			if aData, aCode, aErr := pteroRequest("GET",
				fmt.Sprintf("/api/application/nodes/%d/allocations?per_page=100", n.Attributes.ID), nil); aErr == nil && aCode == 200 {
				var aRes struct{ Meta struct{ Pagination struct{ Total int } } }
				json.Unmarshal(aData, &aRes)
				s.Allocations += aRes.Meta.Pagination.Total
			}
		}
	}

	jsonResp(w, map[string]interface{}{"ok": true, "data": s})
}

// ============================================================
// PTERODACTYL USERS HANDLERS
// ============================================================
func handlePteroUsers(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	if r.Method != http.MethodGet {
		errResp(w, 405, "Method not allowed")
		return
	}
	data, code, err := pteroRequest("GET", "/api/application/users?per_page=100&include=servers", nil)
	if err != nil || code != 200 {
		errResp(w, 500, "Gagal mengambil data user dari Pterodactyl")
		return
	}
	var res struct {
		Data []struct {
			Attributes struct {
				ID        int    `json:"id"`
				Username  string `json:"username"`
				Email     string `json:"email"`
				RootAdmin bool   `json:"root_admin"`
			}
		}
	}
	json.Unmarshal(data, &res)
	type UserOut struct {
		ID        int    `json:"id"`
		Username  string `json:"username"`
		Email     string `json:"email"`
		RootAdmin bool   `json:"root_admin"`
	}
	out := []UserOut{}
	for _, d := range res.Data {
		out = append(out, UserOut{d.Attributes.ID, d.Attributes.Username, d.Attributes.Email, d.Attributes.RootAdmin})
	}
	jsonResp(w, map[string]interface{}{"ok": true, "data": out})
}

func handleCreatePteroUser(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	if r.Method != http.MethodPost {
		errResp(w, 405, "Method not allowed")
		return
	}
	var body struct {
		Email     string `json:"email"`
		Username  string `json:"username"`
		Firstname string `json:"firstname"`
		Lastname  string `json:"lastname"`
		Password  string `json:"password"`
		Role      int    `json:"role"` // 0=member, 1=admin
	}
	if err := decodeBody(r, &body); err != nil {
		errResp(w, 400, "Invalid JSON")
		return
	}
	// Admins can only create members
	if u.Role == 0 && body.Role == 1 {
		body.Role = 0
	}
	payload := map[string]interface{}{
		"email":      body.Email,
		"username":   body.Username,
		"first_name": body.Firstname,
		"last_name":  body.Lastname,
		"password":   body.Password,
		"root_admin": body.Role == 1,
		"language":   "en",
	}
	data, code, err := pteroRequest("POST", "/api/application/users", payload)
	if err != nil || (code != 200 && code != 201) {
		msg := "Gagal membuat user"
		if data != nil {
			msg += ": " + string(data)
		}
		errResp(w, 500, msg)
		return
	}
	writeLog(u.Username, u.Role, fmt.Sprintf("Membuat akun Pterodactyl: %s (%s)", body.Username, body.Email))
	jsonResp(w, map[string]interface{}{"ok": true})
}

func handlePteroUserByID(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil {
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/pterodactyl/users/"), "/")
	id := parts[0]
	if id == "" {
		errResp(w, 400, "Missing user ID")
		return
	}
	switch r.Method {
	case http.MethodPatch:
		var body map[string]interface{}
		if err := decodeBody(r, &body); err != nil {
			errResp(w, 400, "Invalid JSON")
			return
		}
		// Need to fetch current user first for required fields
		cur, code, err := pteroRequest("GET", "/api/application/users/"+id, nil)
		if err != nil || code != 200 {
			errResp(w, 500, "Gagal mengambil data user")
			return
		}
		var curRes struct {
			Attributes struct {
				Email     string `json:"email"`
				Username  string `json:"username"`
				Firstname string `json:"first_name"`
				Lastname  string `json:"last_name"`
				Language  string `json:"language"`
			}
		}
		json.Unmarshal(cur, &curRes)
		patch := map[string]interface{}{
			"email":      getStr(body, "email", curRes.Attributes.Email),
			"username":   getStr(body, "username", curRes.Attributes.Username),
			"first_name": curRes.Attributes.Firstname,
			"last_name":  curRes.Attributes.Lastname,
			"language":   "en",
			"root_admin": getInt(body, "role", 0) == 1,
		}
		if pw, ok := body["password"].(string); ok && pw != "" {
			patch["password"] = pw
		}
		data, code2, err2 := pteroRequest("PATCH", "/api/application/users/"+id, patch)
		if err2 != nil || (code2 != 200 && code2 != 201) {
			errResp(w, 500, "Gagal update user: "+string(data))
			return
		}
		writeLog(u.Username, u.Role, fmt.Sprintf("Edit user Pterodactyl ID: %s", id))
		jsonResp(w, map[string]interface{}{"ok": true})

	case http.MethodDelete:
		_, code, err := pteroRequest("DELETE", "/api/application/users/"+id, nil)
		if err != nil || (code != 200 && code != 204) {
			errResp(w, 500, "Gagal menghapus user")
			return
		}
		writeLog(u.Username, u.Role, fmt.Sprintf("Hapus user Pterodactyl ID: %s", id))
		jsonResp(w, map[string]interface{}{"ok": true})

	default:
		errResp(w, 405, "Method not allowed")
	}
}

func getStr(m map[string]interface{}, k, def string) string {
	if v, ok := m[k].(string); ok && v != "" {
		return v
	}
	return def
}
func getInt(m map[string]interface{}, k string, def int) int {
	switch v := m[k].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return def
}

// ============================================================
// PTERODACTYL SERVERS HANDLERS
// ============================================================
func handlePteroServers(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	data, code, err := pteroRequest("GET", "/api/application/servers?per_page=100&include=allocations", nil)
	if err != nil || code != 200 {
		errResp(w, 500, "Gagal mengambil server")
		return
	}
	var res struct {
		Data []struct {
			Attributes struct {
				Name        string `json:"name"`
				Identifier  string `json:"identifier"`
				Status      string `json:"status"`
				Relationships struct {
					Allocations struct {
						Data []struct {
							Attributes struct {
								IP   string `json:"ip"`
								Port int    `json:"port"`
							}
						}
					}
				}
			}
		}
	}
	json.Unmarshal(data, &res)

	// Also get user info per server
	type ServerOut struct {
		Name       string `json:"name"`
		Identifier string `json:"identifier"`
		Status     string `json:"status"`
		Owner      string `json:"owner"`
	}
	out := []ServerOut{}
	for _, d := range res.Data {
		st := d.Attributes.Status
		if st == "" {
			st = "running"
		}
		out = append(out, ServerOut{d.Attributes.Name, d.Attributes.Identifier, st, ""})
	}
	jsonResp(w, map[string]interface{}{"ok": true, "data": out})
}

func handleCreateServer(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	if r.Method != http.MethodPost {
		errResp(w, 405, "Method not allowed")
		return
	}
	var body struct {
		Name             string `json:"name"`
		OwnerID          int    `json:"owner_id"`
		Description      string `json:"description"`
		NodeID           int    `json:"node_id"`
		DefaultAlloc     int    `json:"default_allocation"`
		NestID           int    `json:"nest_id"`
		EggID            int    `json:"egg_id"`
		CPU              int    `json:"cpu"`
		Memory           int    `json:"memory"`
		Disk             int    `json:"disk"`
		DatabaseLimit    int    `json:"database_limit"`
		BackupLimit      int    `json:"backup_limit"`
		AllocationLimit  int    `json:"allocation_limit"`
		DockerImage      string `json:"docker_image"`
		Startup          string `json:"startup"`
		Phone            string `json:"phone"`
		OwnerEmail       string `json:"owner_email"`
		OwnerUsername    string `json:"owner_username"`
		OwnerPassword    string `json:"owner_password"`
		EggName          string `json:"egg_name"`
		ExpiredDays      int    `json:"expired_days"`
	}
	if err := decodeBody(r, &body); err != nil {
		errResp(w, 400, "Invalid JSON")
		return
	}

	// Fetch egg details for startup and docker_image if not provided
	dockerImage := body.DockerImage
	startup := body.Startup
	var envVars map[string]interface{}

	if eggData, eCode, eErr := pteroRequest("GET",
		fmt.Sprintf("/api/application/nests/%d/eggs/%d?include=config,variables", body.NestID, body.EggID), nil); eErr == nil && eCode == 200 {
		var eggRes struct {
			Attributes struct {
				DockerImage string `json:"docker_image"`
				Startup     string `json:"startup"`
				Relationships struct {
					Variables struct {
						Data []struct {
							Attributes struct {
								EnvVariable  string `json:"env_variable"`
								DefaultValue string `json:"default_value"`
							}
						}
					}
				}
			}
		}
		json.Unmarshal(eggData, &eggRes)
		if dockerImage == "" {
			dockerImage = eggRes.Attributes.DockerImage
		}
		if startup == "" {
			startup = eggRes.Attributes.Startup
		}
		envVars = map[string]interface{}{}
		for _, v := range eggRes.Attributes.Relationships.Variables.Data {
			envVars[v.Attributes.EnvVariable] = v.Attributes.DefaultValue
		}
	}

	if envVars == nil {
		envVars = map[string]interface{}{}
	}

	payload := map[string]interface{}{
		"name":        body.Name,
		"user":        body.OwnerID,
		"nest":        body.NestID,
		"egg":         body.EggID,
		"docker_image": dockerImage,
		"startup":     startup,
		"description": body.Description,
		"limits": map[string]interface{}{
			"memory": body.Memory,
			"swap":   0,
			"disk":   body.Disk,
			"io":     500,
			"cpu":    body.CPU,
		},
		"feature_limits": map[string]interface{}{
			"databases":   body.DatabaseLimit,
			"backups":     body.BackupLimit,
			"allocations": body.AllocationLimit,
		},
		"allocation": map[string]interface{}{
			"default":    body.DefaultAlloc,
			"additional": []int{},
		},
		"environment":   envVars,
		"start_on_completion": true,
	}

	data, code, err := pteroRequest("POST", "/api/application/servers", payload)
	if err != nil || (code != 200 && code != 201) {
		msg := "Gagal membuat server"
		if data != nil {
			msg += ": " + string(data)
		}
		errResp(w, 500, msg)
		return
	}

	writeLog(u.Username, u.Role, fmt.Sprintf("Membuat server: %s untuk %s", body.Name, body.OwnerUsername))

	// Get server identifier from response
	var createRes struct {
		Attributes struct {
			Identifier string `json:"identifier"`
		}
	}
	json.Unmarshal(data, &createRes)
	serverIdentifier := createRes.Attributes.Identifier

	// Save expiration if days set
	expiredLabel := ""
	if body.ExpiredDays > 0 && serverIdentifier != "" && db != nil {
		expireAt := time.Now().In(wibLoc).Add(time.Duration(body.ExpiredDays) * 24 * time.Hour)
		db.Exec(
			`INSERT INTO server_expirations (server_id, server_name, owner_id, owner_username, owner_email, owner_phone, owner_password, egg_name, duration_days, expire_at)
			VALUES (?,?,?,?,?,?,?,?,?,?)
			ON DUPLICATE KEY UPDATE expire_at=VALUES(expire_at), duration_days=VALUES(duration_days), notif_sent=0, suspended=0, suspend_notif=0, pre_suspend_notif=0, suspended_at=NULL`,
			serverIdentifier, body.Name, body.OwnerID, body.OwnerUsername, body.OwnerEmail,
			body.Phone, body.OwnerPassword, body.EggName, body.ExpiredDays,
			expireAt.Format("2006-01-02 15:04:05"),
		)
		expiredLabel = expireAt.Format("02/01/2006")
		writeLog(u.Username, u.Role, fmt.Sprintf("Set expired server %s: %d hari (%s)", body.Name, body.ExpiredDays, expiredLabel))
	}

	// Send WhatsApp
	if body.Phone != "" && body.OwnerEmail != "" {
		msg := buildWAMessage(body.OwnerEmail, body.OwnerUsername, body.OwnerPassword, body.EggName, expiredLabel)
		if waErr := sendWhatsApp(body.Phone, msg); waErr != nil {
			log.Printf("⚠ WA send error: %v", waErr)
		}
	}

	jsonResp(w, map[string]interface{}{"ok": true})
}

// pteroGetServerInternalID fetches the internal integer ID from an identifier string
func pteroGetServerInternalID(identifier string) (int, string, error) {
	data, code, err := pteroRequest("GET", "/api/application/servers?per_page=100", nil)
	if err != nil || code != 200 {
		return 0, "", fmt.Errorf("failed to fetch servers: %d", code)
	}
	var res struct {
		Data []struct {
			Attributes struct {
				ID         int    `json:"id"`
				Identifier string `json:"identifier"`
				Name       string `json:"name"`
			}
		}
	}
	json.Unmarshal(data, &res)
	for _, d := range res.Data {
		if d.Attributes.Identifier == identifier {
			return d.Attributes.ID, d.Attributes.Name, nil
		}
	}
	return 0, "", fmt.Errorf("server not found: %s", identifier)
}

// pteroDeleteServer deletes by internal integer ID
func pteroDeleteServer(internalID int) error {
	idStr := strconv.Itoa(internalID)
	_, code, err := pteroRequest("DELETE", "/api/application/servers/"+idStr+"/force", nil)
	if err == nil && (code == 200 || code == 204) {
		return nil
	}
	_, code2, err2 := pteroRequest("DELETE", "/api/application/servers/"+idStr, nil)
	if err2 == nil && (code2 == 200 || code2 == 204) {
		return nil
	}
	return fmt.Errorf("delete failed: force=%d normal=%d", code, code2)
}

// pteroSuspendServer suspends by internal integer ID
func pteroSuspendServer(internalID int) error {
	idStr := strconv.Itoa(internalID)
	_, code, err := pteroRequest("POST", "/api/application/servers/"+idStr+"/suspend", nil)
	if err != nil || (code != 200 && code != 202 && code != 204) {
		return fmt.Errorf("suspend failed: %d", code)
	}
	return nil
}

// pteroUnsuspendServer unsuspends by internal integer ID
func pteroUnsuspendServer(internalID int) error {
	idStr := strconv.Itoa(internalID)
	_, code, err := pteroRequest("POST", "/api/application/servers/"+idStr+"/unsuspend", nil)
	if err != nil || (code != 200 && code != 202 && code != 204) {
		return fmt.Errorf("unsuspend failed: %d", code)
	}
	return nil
}

func handlePteroServerByID(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil {
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/pterodactyl/servers/"), "/")
	identifier := parts[0]
	if identifier == "" {
		errResp(w, 400, "Missing server identifier")
		return
	}

	// Get internal ID
	internalID, serverName, err := pteroGetServerInternalID(identifier)
	if err != nil {
		errResp(w, 404, "Server tidak ditemukan: "+err.Error())
		return
	}

	switch r.Method {
	case http.MethodDelete:
		if err := pteroDeleteServer(internalID); err != nil {
			errResp(w, 500, "Gagal menghapus server: "+err.Error())
			return
		}
		// Clean up expiry table too
		if db != nil {
			db.Exec("DELETE FROM server_expirations WHERE server_id=?", identifier)
		}
		writeLog(u.Username, u.Role, fmt.Sprintf("Hapus server: %s (%s)", serverName, identifier))
		jsonResp(w, map[string]interface{}{"ok": true})

	default:
		errResp(w, 405, "Method not allowed")
	}
}

// ============================================================
// NODES & ALLOCATIONS
// ============================================================
func handlePteroNodes(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	data, code, err := pteroRequest("GET", "/api/application/nodes?per_page=100", nil)
	if err != nil || code != 200 {
		errResp(w, 500, "Gagal mengambil nodes")
		return
	}
	var res struct {
		Data []struct {
			Attributes struct {
				ID   int    `json:"id"`
				Name string `json:"name"`
			}
		}
	}
	json.Unmarshal(data, &res)
	type NodeOut struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}
	out := []NodeOut{}
	for _, d := range res.Data {
		out = append(out, NodeOut{d.Attributes.ID, d.Attributes.Name})
	}
	jsonResp(w, map[string]interface{}{"ok": true, "data": out})
}

func handlePteroAllocations(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	nodeID := strings.TrimPrefix(r.URL.Path, "/api/pterodactyl/allocations/")
	nodeID = strings.Split(nodeID, "/")[0]
	if nodeID == "" {
		errResp(w, 400, "Missing node ID")
		return
	}
	data, code, err := pteroRequest("GET",
		fmt.Sprintf("/api/application/nodes/%s/allocations?per_page=100", nodeID), nil)
	if err != nil || code != 200 {
		errResp(w, 500, "Gagal mengambil alokasi")
		return
	}
	var res struct {
		Data []struct {
			Attributes struct {
				ID       int    `json:"id"`
				IP       string `json:"ip"`
				Port     int    `json:"port"`
				Assigned bool   `json:"assigned"`
			}
		}
	}
	json.Unmarshal(data, &res)
	type AllocOut struct {
		ID   int    `json:"id"`
		IP   string `json:"ip"`
		Port int    `json:"port"`
	}
	out := []AllocOut{}
	for _, d := range res.Data {
		if !d.Attributes.Assigned {
			out = append(out, AllocOut{d.Attributes.ID, d.Attributes.IP, d.Attributes.Port})
		}
	}
	if len(out) == 0 {
		// If no free alloc, return all
		for _, d := range res.Data {
			out = append(out, AllocOut{d.Attributes.ID, d.Attributes.IP, d.Attributes.Port})
		}
	}
	jsonResp(w, map[string]interface{}{"ok": true, "data": out})
}

// ============================================================
// NESTS & EGGS
// ============================================================
func handlePteroNests(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	data, code, err := pteroRequest("GET", "/api/application/nests?per_page=100&include=eggs", nil)
	if err != nil || code != 200 {
		errResp(w, 500, "Gagal mengambil nests")
		return
	}
	var res struct {
		Data []struct {
			Attributes struct {
				ID          int    `json:"id"`
				Name        string `json:"name"`
				Description string `json:"description"`
				Relationships struct {
					Eggs struct {
						Data []interface{}
					}
				}
			}
		}
	}
	json.Unmarshal(data, &res)
	type NestOut struct {
		ID          int    `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		EggCount    int    `json:"egg_count"`
	}
	out := []NestOut{}
	for _, d := range res.Data {
		out = append(out, NestOut{
			d.Attributes.ID, d.Attributes.Name, d.Attributes.Description,
			len(d.Attributes.Relationships.Eggs.Data),
		})
	}
	jsonResp(w, map[string]interface{}{"ok": true, "data": out})
}

func handlePteroNestEggs(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/pterodactyl/nests/")
	parts := strings.Split(path, "/")
	nestID := parts[0]
	if nestID == "" || len(parts) < 2 || parts[1] != "eggs" {
		errResp(w, 400, "Invalid path")
		return
	}
	data, code, err := pteroRequest("GET",
		fmt.Sprintf("/api/application/nests/%s/eggs?per_page=100", nestID), nil)
	if err != nil || code != 200 {
		errResp(w, 500, "Gagal mengambil eggs")
		return
	}
	var res struct {
		Data []struct {
			Attributes struct {
				ID          int    `json:"id"`
				Name        string `json:"name"`
				DockerImage string `json:"docker_image"`
				Startup     string `json:"startup"`
			}
		}
	}
	json.Unmarshal(data, &res)
	type EggOut struct {
		ID          int    `json:"id"`
		Name        string `json:"name"`
		DockerImage string `json:"docker_image"`
		Startup     string `json:"startup"`
	}
	out := []EggOut{}
	for _, d := range res.Data {
		out = append(out, EggOut{d.Attributes.ID, d.Attributes.Name, d.Attributes.DockerImage, d.Attributes.Startup})
	}
	jsonResp(w, map[string]interface{}{"ok": true, "data": out})
}

// ============================================================
// PANEL ACCOUNTS (Local DB)
// ============================================================
func handlePanelAccounts(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil {
		return
	}
	if db == nil {
		errResp(w, 503, "Database tidak tersedia")
		return
	}
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query("SELECT id, username, role FROM users ORDER BY id")
		if err != nil {
			errResp(w, 500, "DB error")
			return
		}
		defer rows.Close()
		type AccOut struct {
			ID       int    `json:"id"`
			Username string `json:"username"`
			Role     int    `json:"role"`
		}
		out := []AccOut{}
		for rows.Next() {
			var a AccOut
			rows.Scan(&a.ID, &a.Username, &a.Role)
			out = append(out, a)
		}
		jsonResp(w, map[string]interface{}{"ok": true, "data": out})

	case http.MethodPost:
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
			Role     int    `json:"role"`
		}
		if err := decodeBody(r, &body); err != nil {
			errResp(w, 400, "Invalid JSON")
			return
		}
		if body.Username == "" || body.Password == "" {
			errResp(w, 400, "Username dan password wajib")
			return
		}
		hashed := md5Hash(body.Password)
		_, err := db.Exec("INSERT INTO users (username, password, role) VALUES (?,?,?)",
			body.Username, hashed, body.Role)
		if err != nil {
			errResp(w, 500, "Gagal menambah akun (username mungkin sudah ada)")
			return
		}
		writeLog(u.Username, u.Role, fmt.Sprintf("Tambah akun panel: %s (role %d)", body.Username, body.Role))
		jsonResp(w, map[string]interface{}{"ok": true})

	default:
		errResp(w, 405, "Method not allowed")
	}
}

func handlePanelAccountByID(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil {
		return
	}
	idStr := strings.TrimPrefix(r.URL.Path, "/api/panel-accounts/")
	idStr = strings.Split(idStr, "/")[0]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		errResp(w, 400, "Invalid ID")
		return
	}
	switch r.Method {
	case http.MethodPatch:
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
			Role     int    `json:"role"`
		}
		if err := decodeBody(r, &body); err != nil {
			errResp(w, 400, "Invalid JSON")
			return
		}
		if body.Password != "" {
			hashed := md5Hash(body.Password)
			db.Exec("UPDATE users SET username=?, password=?, role=? WHERE id=?",
				body.Username, hashed, body.Role, id)
		} else {
			db.Exec("UPDATE users SET username=?, role=? WHERE id=?",
				body.Username, body.Role, id)
		}
		writeLog(u.Username, u.Role, fmt.Sprintf("Edit akun panel ID: %d", id))
		jsonResp(w, map[string]interface{}{"ok": true})

	case http.MethodDelete:
		// Prevent self-delete
		if u.ID == id {
			errResp(w, 400, "Tidak bisa menghapus akun sendiri")
			return
		}
		db.Exec("DELETE FROM users WHERE id=?", id)
		writeLog(u.Username, u.Role, fmt.Sprintf("Hapus akun panel ID: %d", id))
		jsonResp(w, map[string]interface{}{"ok": true})

	default:
		errResp(w, 405, "Method not allowed")
	}
}

// ============================================================
// ACTIVITY LOG HANDLERS
// ============================================================
func handleLogs(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil {
		return
	}
	if db == nil {
		errResp(w, 503, "Database tidak tersedia")
		return
	}
	rows, err := db.Query("SELECT users, role, log, time FROM logs ORDER BY id DESC LIMIT 200")
	if err != nil {
		errResp(w, 500, "DB error")
		return
	}
	defer rows.Close()
	out := []LogEntry{}
	for rows.Next() {
		var l LogEntry
		rows.Scan(&l.Users, &l.Role, &l.Log, &l.Time)
		out = append(out, l)
	}
	jsonResp(w, map[string]interface{}{"ok": true, "data": out})
}

func handleLogsClear(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil {
		return
	}
	if r.Method != http.MethodDelete {
		errResp(w, 405, "Method not allowed")
		return
	}
	db.Exec("DELETE FROM logs")
	writeLog(u.Username, u.Role, "Clear semua activity log")
	jsonResp(w, map[string]interface{}{"ok": true})
}

// ============================================================
// SERVER EXPIRATION SYSTEM
// ============================================================

func startExpiryChecker() {
	log.Println("⏰ Auto-expiry checker started")
	for {
		time.Sleep(5 * time.Minute)
		checkPreSuspendNotif()
		checkAndSuspendExpired()
		checkAndDeleteSuspended()
		checkAndSendExpiryNotif()
	}
}

func notifThreshold(durationDays int) int {
	switch durationDays {
	case 1:
		return 4
	case 3:
		return 24
	default:
		return 72
	}
}

// Notif 4 jam sebelum suspend
func checkPreSuspendNotif() {
	if db == nil { return }
	now := time.Now().In(wibLoc)
	rows, err := db.Query(`SELECT server_id, server_name, owner_username, owner_phone, expire_at
		FROM server_expirations WHERE pre_suspend_notif=0 AND suspended=0 AND expire_at > ?`,
		now.Format("2006-01-02 15:04:05"))
	if err != nil { return }
	defer rows.Close()
	type ent struct{ ID, Name, Owner, Phone string; ExpireAt time.Time }
	var entries []ent
	for rows.Next() {
		var x ent
		rows.Scan(&x.ID, &x.Name, &x.Owner, &x.Phone, &x.ExpireAt)
		entries = append(entries, x)
	}
	rows.Close()
	for _, x := range entries {
		if x.ExpireAt.Sub(now) <= 4*time.Hour {
			if x.Phone != "" {
				h := int(x.ExpireAt.Sub(now).Hours())
				if h < 1 { h = 1 }
				msg := fmt.Sprintf("⚠️ *PERINGATAN - SERVER AKAN DISUSPEND*\n\n_Halo %s!_\n\n🖥 Server *%s* akan *disuspend dalam %d jam* karena masa aktif habis.\n\n_Segera hubungi owner untuk perpanjang!_\n_Link Panel: %s_",
					x.Owner, x.Name, h, PanelLink)
				sendWhatsApp(x.Phone, msg)
			}
			db.Exec("UPDATE server_expirations SET pre_suspend_notif=1 WHERE server_id=?", x.ID)
			writeLog("system", 1, fmt.Sprintf("Notif pre-suspend: %s", x.Name))
		}
	}
}

// Suspend server yang sudah expired
func checkAndSuspendExpired() {
	if db == nil { return }
	now := time.Now().In(wibLoc).Format("2006-01-02 15:04:05")
	rows, err := db.Query(`SELECT server_id, server_name, owner_username, owner_phone
		FROM server_expirations WHERE expire_at <= ? AND suspended=0`, now)
	if err != nil { return }
	defer rows.Close()
	type ent struct{ ID, Name, Owner, Phone string }
	var entries []ent
	for rows.Next() {
		var x ent
		rows.Scan(&x.ID, &x.Name, &x.Owner, &x.Phone)
		entries = append(entries, x)
	}
	rows.Close()
	for _, x := range entries {
		internalID, _, err := pteroGetServerInternalID(x.ID)
		if err != nil { log.Printf("⚠ Suspend: cannot find server %s: %v", x.ID, err); continue }
		if err := pteroSuspendServer(internalID); err != nil { log.Printf("⚠ Suspend failed %s: %v", x.Name, err); continue }
		suspAt := time.Now().In(wibLoc)
		db.Exec("UPDATE server_expirations SET suspended=1, suspended_at=? WHERE server_id=?",
			suspAt.Format("2006-01-02 15:04:05"), x.ID)
		if x.Phone != "" {
			msg := fmt.Sprintf("🔒 *SERVER DISUSPEND*\n\n_Halo %s, server kamu dibekukan karena belum perpanjang!_\n\n🖥 *Server* : %s\n⏰ *Disuspend* : %s\n\n_Kamu punya *3 hari* untuk perpanjang sebelum server *DIHAPUS PERMANENT*._\n\n_Hubungi owner sekarang!_\n_Link Panel: %s_",
				x.Owner, x.Name, suspAt.Format("02/01/2006 15:04"), PanelLink)
			sendWhatsApp(x.Phone, msg)
		}
		writeLog("system", 1, fmt.Sprintf("Auto-suspend: %s", x.Name))
		log.Printf("🔒 Suspended: %s", x.Name)
	}
}

// Delete server yang sudah suspend lebih dari 3 hari
func checkAndDeleteSuspended() {
	if db == nil { return }
	deadline := time.Now().In(wibLoc).Add(-3 * 24 * time.Hour).Format("2006-01-02 15:04:05")
	rows, err := db.Query(`SELECT server_id, server_name, owner_id, owner_username, owner_phone, owner_email
		FROM server_expirations WHERE suspended=1 AND suspended_at <= ?`, deadline)
	if err != nil { return }
	defer rows.Close()
	type ent struct{ ID, Name string; OwnerID int; Owner, Phone, Email string }
	var entries []ent
	for rows.Next() {
		var x ent
		rows.Scan(&x.ID, &x.Name, &x.OwnerID, &x.Owner, &x.Phone, &x.Email)
		entries = append(entries, x)
	}
	rows.Close()
	for _, x := range entries {
		internalID, _, err := pteroGetServerInternalID(x.ID)
		if err == nil {
			pteroDeleteServer(internalID)
		}
		db.Exec("DELETE FROM server_expirations WHERE server_id=?", x.ID)
		if x.Phone != "" {
			msg := fmt.Sprintf("❌ *SERVER DIHAPUS PERMANENT*\n\n_Halo %s, server kamu dihapus karena tidak perpanjang dalam 3 hari setelah suspend._\n\n🖥 *Server* : %s\n\n_Data tidak dapat dipulihkan._\n_Hubungi owner jika ingin order baru._\n_Link Panel: %s_",
				x.Owner, x.Name, PanelLink)
			sendWhatsApp(x.Phone, msg)
		}
		writeLog("system", 1, fmt.Sprintf("Auto-delete (3 hari suspend): %s", x.Name))
		log.Printf("🗑 Permanently deleted: %s", x.Name)
		if x.OwnerID > 0 {
			go checkAndDeleteEmptyUser(x.OwnerID, x.Owner, x.Phone, x.Email)
		}
	}
}

func checkAndDeleteEmptyUser(ownerID int, ownerUsername, phone, email string) {
	time.Sleep(10 * time.Second)
	idStr := strconv.Itoa(ownerID)
	data, code, err := pteroRequest("GET", "/api/application/users/"+idStr+"?include=servers", nil)
	if err != nil || code != 200 { return }
	var res struct {
		Attributes struct {
			Relationships struct {
				Servers struct{ Data []interface{} }
			}
		}
	}
	json.Unmarshal(data, &res)
	if len(res.Attributes.Relationships.Servers.Data) == 0 {
		pteroRequest("DELETE", "/api/application/users/"+idStr, nil)
		if phone != "" {
			msg := fmt.Sprintf("🗑️ *AKUN PANEL DIHAPUS*\n\n_Halo %s, akun panel kamu dihapus karena tidak memiliki server aktif._\n\n_Email: %s_\n\n_Hubungi owner jika ingin order baru._\n_Link Panel: %s_",
				ownerUsername, email, PanelLink)
			sendWhatsApp(phone, msg)
		}
		writeLog("system", 1, fmt.Sprintf("Auto-delete user tanpa server: %s", ownerUsername))
		log.Printf("👤 User deleted (no servers): %s", ownerUsername)
	}
}

func handleCheckEmptyUsers(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil { return }
	go func() {
		data, code, err := pteroRequest("GET", "/api/application/users?per_page=100&include=servers", nil)
		if err != nil || code != 200 { return }
		var res struct {
			Data []struct {
				Attributes struct {
					ID       int    `json:"id"`
					Username string `json:"username"`
					Email    string `json:"email"`
					Relationships struct {
						Servers struct{ Data []interface{} }
					}
				}
			}
		}
		json.Unmarshal(data, &res)
		for _, d := range res.Data {
			if len(d.Attributes.Relationships.Servers.Data) == 0 {
				checkAndDeleteEmptyUser(d.Attributes.ID, d.Attributes.Username, "", d.Attributes.Email)
			}
		}
	}()
	jsonResp(w, map[string]interface{}{"ok": true, "message": "Checking empty users in background"})
}

func checkAndSendExpiryNotif() {
	if db == nil { return }
	rows, err := db.Query(`SELECT server_id, server_name, owner_username, owner_phone, duration_days, expire_at
		FROM server_expirations WHERE notif_sent=0 AND suspended=0 AND expire_at > NOW()`)
	if err != nil { return }
	defer rows.Close()
	type ent struct{ ID, Name, Owner, Phone string; Duration int; ExpireAt time.Time }
	var entries []ent
	for rows.Next() {
		var x ent
		rows.Scan(&x.ID, &x.Name, &x.Owner, &x.Phone, &x.Duration, &x.ExpireAt)
		entries = append(entries, x)
	}
	rows.Close()
	now := time.Now().In(wibLoc)
	for _, x := range entries {
		timeLeft := x.ExpireAt.Sub(now)
		if timeLeft <= time.Duration(notifThreshold(x.Duration))*time.Hour {
			if x.Phone != "" {
				h := int(timeLeft.Hours())
				var ts string
				if h < 24 { ts = fmt.Sprintf("%d jam lagi", h) } else { ts = fmt.Sprintf("%d hari lagi", h/24) }
				msg := fmt.Sprintf("⚠️ *PERINGATAN EXPIRED HOSTING*\n\n_Halo %s, server kamu akan expired!_\n\n🖥 *Server* : %s\n⏰ *Expired* : %s\n⏳ *Sisa* : %s\n\n_Jika tidak perpanjang → server DISUSPEND → lalu DIHAPUS 3 hari kemudian._\n_Segera hubungi owner!_\n_Link Panel: %s_",
					x.Owner, x.Name, x.ExpireAt.In(wibLoc).Format("02/01/2006 15:04"), ts, PanelLink)
				sendWhatsApp(x.Phone, msg)
			}
			db.Exec("UPDATE server_expirations SET notif_sent=1 WHERE server_id=?", x.ID)
			writeLog("system", 1, fmt.Sprintf("Notif expired: %s", x.Name))
		}
	}
}


func handleExpirations(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil {
		return
	}
	if db == nil {
		errResp(w, 503, "Database tidak tersedia")
		return
	}
	rows, err := db.Query("SELECT server_id, server_name, owner_username, expire_at, created_at FROM server_expirations ORDER BY expire_at ASC")
	if err != nil {
		errResp(w, 500, "DB error")
		return
	}
	defer rows.Close()
	type ExpOut struct {
		ServerID      string `json:"server_id"`
		ServerName    string `json:"server_name"`
		OwnerUsername string `json:"owner_username"`
		ExpireAt      string `json:"expire_at"`
		CreatedAt     string `json:"created_at"`
	}
	out := []ExpOut{}
	for rows.Next() {
		var e ExpOut
		var expAt, creAt time.Time
		rows.Scan(&e.ServerID, &e.ServerName, &e.OwnerUsername, &expAt, &creAt)
		e.ExpireAt = expAt.Format("02/01/2006 15:04")
		e.CreatedAt = creAt.Format("02/01/2006 15:04")
		out = append(out, e)
	}
	jsonResp(w, map[string]interface{}{"ok": true, "data": out})
}

// ============================================================
// SUSPEND / UNSUSPEND HANDLERS
// ============================================================
func handleSuspendServer(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil { return }
	if r.Method != http.MethodPost { errResp(w, 405, "Method not allowed"); return }
	identifier := strings.TrimPrefix(r.URL.Path, "/api/pterodactyl/suspend/")
	identifier = strings.Split(identifier, "/")[0]
	internalID, serverName, err := pteroGetServerInternalID(identifier)
	if err != nil { errResp(w, 404, "Server tidak ditemukan"); return }
	if err := pteroSuspendServer(internalID); err != nil {
		errResp(w, 500, "Gagal suspend: "+err.Error()); return
	}
	writeLog(u.Username, u.Role, fmt.Sprintf("Suspend server: %s", serverName))
	jsonResp(w, map[string]interface{}{"ok": true})
}

func handleUnsuspendServer(w http.ResponseWriter, r *http.Request) {
	u := requireOwner(w, r)
	if u == nil { return }
	if r.Method != http.MethodPost { errResp(w, 405, "Method not allowed"); return }
	identifier := strings.TrimPrefix(r.URL.Path, "/api/pterodactyl/unsuspend/")
	identifier = strings.Split(identifier, "/")[0]
	internalID, serverName, err := pteroGetServerInternalID(identifier)
	if err != nil { errResp(w, 404, "Server tidak ditemukan"); return }
	if err := pteroUnsuspendServer(internalID); err != nil {
		errResp(w, 500, "Gagal unsuspend: "+err.Error()); return
	}
	// Reset suspended flag in DB if exists
	if db != nil {
		db.Exec("UPDATE server_expirations SET suspended=0, suspended_at=NULL WHERE server_id=?", identifier)
	}
	writeLog(u.Username, u.Role, fmt.Sprintf("Unsuspend server: %s", serverName))
	jsonResp(w, map[string]interface{}{"ok": true})
}

// ============================================================
// RENEW SERVER HANDLER
// ============================================================
func handleRenewServer(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil { return }
	if r.Method != http.MethodPost {
		errResp(w, 405, "Method not allowed"); return
	}
	if db == nil {
		errResp(w, 503, "Database tidak tersedia"); return
	}
	var body struct {
		ServerID   string `json:"server_id"`
		AddDays    int    `json:"add_days"`
	}
	if err := decodeBody(r, &body); err != nil {
		errResp(w, 400, "Invalid JSON"); return
	}
	if body.ServerID == "" || body.AddDays <= 0 {
		errResp(w, 400, "server_id dan add_days wajib diisi"); return
	}

	// Get current expiry data
	var serverName, ownerUsername, ownerPhone, ownerEmail, ownerPassword, eggName string
	var currentExpire time.Time
	var durationDays int
	err := db.QueryRow(`SELECT server_name, owner_username, owner_phone, owner_email, owner_password, egg_name, duration_days, expire_at
		FROM server_expirations WHERE server_id=?`, body.ServerID).Scan(
		&serverName, &ownerUsername, &ownerPhone, &ownerEmail, &ownerPassword, &eggName, &durationDays, &currentExpire)
	if err != nil {
		errResp(w, 404, "Server tidak ditemukan di database expired"); return
	}

	// New expiry = current + added days (if already expired, start from now)
	base := currentExpire
	if base.Before(time.Now().In(wibLoc)) {
		base = time.Now().In(wibLoc)
	}
	newExpire := base.Add(time.Duration(body.AddDays) * 24 * time.Hour)
	newDuration := durationDays + body.AddDays
	if newDuration > 30 { newDuration = 30 }

	db.Exec(`UPDATE server_expirations SET expire_at=?, duration_days=?, notif_sent=0 WHERE server_id=?`,
		newExpire.Format("2006-01-02 15:04:05"), newDuration, body.ServerID)

	writeLog(u.Username, u.Role, fmt.Sprintf("Perpanjang server %s: +%d hari (expire: %s)", serverName, body.AddDays, newExpire.Format("02/01/2006")))

	// Send WA notif to buyer
	if ownerPhone != "" {
		msg := fmt.Sprintf(`✅ *PERPANJANG HOSTING BERHASIL*

_Halo %s, hosting kamu berhasil diperpanjang!_

🖥 *Server* : %s
📦 *Egg* : %s
➕ *Ditambah* : %d hari
📅 *Expired baru* : %s

_Link Panel_ : %s
_Link phpMyAdmin_ : %s

*Terima kasih sudah memperpanjang!* 🎉`,
			ownerUsername, serverName, eggName, body.AddDays,
			newExpire.Format("02/01/2006 15:04"), PanelLink, PanelPMALink)
		sendWhatsApp(ownerPhone, msg)
	}

	jsonResp(w, map[string]interface{}{
		"ok": true,
		"new_expire": newExpire.Format("02/01/2006 15:04"),
		"server_name": serverName,
	})
}

// ============================================================
// SERVER DETAIL HANDLER
// ============================================================
func handleServerDetail(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil { return }
	identifier := strings.TrimPrefix(r.URL.Path, "/api/pterodactyl/server-detail/")
	identifier = strings.Split(identifier, "/")[0]
	if identifier == "" {
		errResp(w, 400, "Missing identifier"); return
	}

	// Fetch server by identifier using external ID lookup
	data, code, err := pteroRequest("GET", "/api/application/servers?per_page=100&include=allocations,egg,nest", nil)
	if err != nil || code != 200 {
		errResp(w, 500, "Gagal mengambil data server"); return
	}

	var res struct {
		Data []struct {
			Attributes struct {
				ID          int    `json:"id"`
				Name        string `json:"name"`
				Identifier  string `json:"identifier"`
				Description string `json:"description"`
				Status      string `json:"status"`
				Limits struct {
					Memory int `json:"memory"`
					Disk   int `json:"disk"`
					CPU    int `json:"cpu"`
					Swap   int `json:"swap"`
					IO     int `json:"io"`
				}
				FeatureLimits struct {
					Databases   int `json:"databases"`
					Backups     int `json:"backups"`
					Allocations int `json:"allocations"`
				} `json:"feature_limits"`
				Relationships struct {
					Allocations struct {
						Data []struct {
							Attributes struct {
								IP       string `json:"ip"`
								Port     int    `json:"port"`
								IPAlias  string `json:"ip_alias"`
								Assigned bool   `json:"assigned"`
							}
						}
					}
					Egg struct {
						Attributes struct {
							Name string `json:"name"`
						}
					}
					Nest struct {
						Attributes struct {
							Name string `json:"name"`
						}
					}
				}
			}
		}
	}
	json.Unmarshal(data, &res)

	for _, d := range res.Data {
		if d.Attributes.Identifier != identifier {
			continue
		}
		a := d.Attributes

		// Get primary allocation
		ip, port := "", 0
		for _, alloc := range a.Relationships.Allocations.Data {
			if alloc.Attributes.Assigned {
				ip = alloc.Attributes.IP
				if alloc.Attributes.IPAlias != "" {
					ip = alloc.Attributes.IPAlias
				}
				port = alloc.Attributes.Port
				break
			}
		}

		status := a.Status
		if status == "" { status = "running" }

		// Get expiry info
		expireAt := ""
		if db != nil {
			var t time.Time
			if err := db.QueryRow("SELECT expire_at FROM server_expirations WHERE server_id=?", identifier).Scan(&t); err == nil {
				expireAt = t.Format("02/01/2006 15:04")
			}
		}

		jsonResp(w, map[string]interface{}{
			"ok": true,
			"data": map[string]interface{}{
				"id":          a.ID,
				"name":        a.Name,
				"identifier":  a.Identifier,
				"description": a.Description,
				"status":      status,
				"ip":          ip,
				"port":        port,
				"memory":      a.Limits.Memory,
				"disk":        a.Limits.Disk,
				"cpu":         a.Limits.CPU,
				"egg":         a.Relationships.Egg.Attributes.Name,
				"nest":        a.Relationships.Nest.Attributes.Name,
				"db_limit":    a.FeatureLimits.Databases,
				"backup_limit": a.FeatureLimits.Backups,
				"expire_at":   expireAt,
			},
		})
		return
	}
	errResp(w, 404, "Server tidak ditemukan")
}

// ============================================================
// REINSTALL SERVER HANDLER
// ============================================================
func handleReinstallServer(w http.ResponseWriter, r *http.Request) {
	u := requireAuth(w, r)
	if u == nil { return }
	if r.Method != http.MethodPost {
		errResp(w, 405, "Method not allowed"); return
	}
	identifier := strings.TrimPrefix(r.URL.Path, "/api/pterodactyl/reinstall/")
	identifier = strings.Split(identifier, "/")[0]
	if identifier == "" {
		errResp(w, 400, "Missing identifier"); return
	}

	// Get server internal ID first
	data, code, err := pteroRequest("GET", "/api/application/servers?per_page=100", nil)
	if err != nil || code != 200 {
		errResp(w, 500, "Gagal mengambil server"); return
	}
	var res struct {
		Data []struct {
			Attributes struct {
				ID         int    `json:"id"`
				Identifier string `json:"identifier"`
				Name       string `json:"name"`
			}
		}
	}
	json.Unmarshal(data, &res)

	serverID := 0
	serverName := ""
	for _, d := range res.Data {
		if d.Attributes.Identifier == identifier {
			serverID = d.Attributes.ID
			serverName = d.Attributes.Name
			break
		}
	}
	if serverID == 0 {
		errResp(w, 404, "Server tidak ditemukan"); return
	}

	_, rCode, rErr := pteroRequest("POST", fmt.Sprintf("/api/application/servers/%d/reinstall", serverID), nil)
	if rErr != nil || (rCode != 200 && rCode != 202 && rCode != 204) {
		errResp(w, 500, "Gagal reinstall server"); return
	}

	writeLog(u.Username, u.Role, fmt.Sprintf("Reinstall server: %s (%s)", serverName, identifier))
	jsonResp(w, map[string]interface{}{"ok": true})
}

// ============================================================
// HTML PAGE (SPA)
// ============================================================
func htmlPage() string {
	return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="theme-color" content="#0a0c10">
<title>Cpanel DomayerHosting By Ren&amp;Kyz</title>
<!-- Preconnect Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"></noscript>
<link rel="stylesheet" href="/style.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐦</text></svg>">
</head>
<body>

<!-- Progress Bar -->
<div id="progress-bar"></div>

<!-- Ambient Background -->
<div class="bg-ambient">
  <div class="circle c1"></div>
  <div class="circle c2"></div>
  <div class="circle c3"></div>
</div>

<!-- ======== LOGIN PAGE ======== -->
<div id="login-page" class="login-page">
  <div class="login-card">
    <div class="brand-icon">🐦</div>
    <h2>DomayerHosting</h2>
    <p class="subtitle">Cpanel By Ren&amp;Kyz • Masuk untuk melanjutkan</p>
    <div id="login-error" class="login-error"></div>
    <form id="login-form">
      <div class="input-group">
        <label for="login-username">Username</label>
        <input id="login-username" type="text" placeholder="Masukkan username" required autocomplete="username">
      </div>
      <div class="input-group">
        <label for="login-password">Password</label>
        <input id="login-password" type="password" placeholder="Masukkan password" required autocomplete="current-password">
      </div>
      <button type="submit" id="login-btn" class="login-btn">🚀 Masuk ke Panel</button>
    </form>
  </div>
</div>

<!-- ======== MAIN APP ======== -->
<div id="app" style="display:none">

  <!-- Sidebar -->
  <aside id="sidebar" class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">🐦</div>
      <div class="sidebar-brand">
        <h1>DomayerHosting</h1>
        <p>Cpanel By Ren&amp;Kyz</p>
      </div>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section-title">MENU UTAMA</div>

      <div class="nav-item active" data-page="home" title="Home" onclick="navigateTo('home')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
        </div>
        <span class="nav-label">Home</span>
        <span class="nav-dot"></span>
      </div>

      <div class="nav-item" data-page="createAccount" title="Create Account" onclick="navigateTo('createAccount')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
          </svg>
        </div>
        <span class="nav-label">Create Account</span>
      </div>

      <div class="nav-item" data-page="createServer" title="Create Server" onclick="navigateTo('createServer')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
        <span class="nav-label">Create Server</span>
      </div>

      <div class="nav-section-title">MANAJEMEN</div>

      <div class="nav-item" data-page="listUsers" title="List Users" onclick="navigateTo('listUsers')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <span class="nav-label">List Users</span>
      </div>

      <div class="nav-item" data-page="listServers" title="List Servers" onclick="navigateTo('listServers')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 6h14M5 18h14"/>
          </svg>
        </div>
        <span class="nav-label">List Servers</span>
      </div>

      <div class="nav-item" data-page="listNests" title="List Nests" onclick="navigateTo('listNests')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
        </div>
        <span class="nav-label">List Nests</span>
      </div>

      <div class="nav-item" data-page="renewHosting" title="Perpanjang Hosting" onclick="navigateTo('renewHosting')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </div>
        <span class="nav-label">Perpanjang Hosting</span>
      </div>

      <div class="nav-section-title owner-only">OWNER ONLY</div>

      <div class="nav-item owner-only" data-page="addAccount" title="Add Account Panel" onclick="navigateTo('addAccount')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
        </div>
        <span class="nav-label">Add Account Panel</span>
      </div>

      <div class="nav-item owner-only" data-page="activityLog" title="Activity Log" onclick="navigateTo('activityLog')">
        <div class="nav-icon">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
        </div>
        <span class="nav-label">Activity Log</span>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="user-avatar u-initials">AD</div>
        <div class="user-info">
          <div class="u-name">Loading...</div>
          <div class="u-role">-</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- Navbar -->
  <header id="navbar" class="navbar">
    <div class="navbar-left">
      <button class="toggle-btn" onclick="toggleSidebar()" title="Toggle Sidebar">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>
      <div class="navbar-title">Cpanel <span>DomayerHosting</span></div>
    </div>
    <div class="navbar-right">
      <div id="wib-clock" style="font-size:0.78rem;color:var(--cyan);background:rgba(0,255,204,0.07);border:1px solid rgba(0,255,204,0.15);padding:5px 12px;border-radius:8px;font-weight:600;letter-spacing:0.5px;white-space:nowrap"></div>
      <div class="navbar-user">
        <div class="nb-avatar u-initials">AD</div>
        <div>
          <div class="nb-name" id="navbar-username">-</div>
          <div class="nb-role" id="navbar-role">-</div>
        </div>
      </div>
      <button class="logout-btn" onclick="logout()">
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
        Logout
      </button>
    </div>
  </header>

  <!-- Main Content -->
  <main id="main-wrapper" class="main-wrapper">

    <!-- ===== PAGE: HOME ===== -->
    <div id="page-home" class="page">
      <div class="section-header">
        <h2><div class="h-icon">🏠</div> Dashboard Overview</h2>
        <button class="btn btn-secondary" onclick="loadHome()">🔄 Refresh</button>
      </div>
      <div id="home-loading" class="page-loader"><div class="spinner"></div></div>
      <div id="home-stats" class="stats-grid" style="display:none">
        <div class="stat-card">
          <div class="stat-icon cyan">👥</div>
          <div class="stat-info">
            <div class="stat-value" id="stat-users">-</div>
            <div class="stat-label">Total Users</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon pink">🖥</div>
          <div class="stat-info">
            <div class="stat-value" id="stat-servers">-</div>
            <div class="stat-label">Total Servers</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">🥚</div>
          <div class="stat-info">
            <div class="stat-value" id="stat-nests">-</div>
            <div class="stat-label">Total Nests</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple">🔧</div>
          <div class="stat-info">
            <div class="stat-value" id="stat-eggs">-</div>
            <div class="stat-label">Total Eggs</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">🌐</div>
          <div class="stat-info">
            <div class="stat-value" id="stat-nodes">-</div>
            <div class="stat-label">Total Nodes</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon cyan">📡</div>
          <div class="stat-info">
            <div class="stat-value" id="stat-alloc">-</div>
            <div class="stat-label">Total Alokasi</div>
          </div>
        </div>
      </div>

      <!-- Quick Info Card -->
      <div class="card" style="margin-top:20px">
        <div class="card-title">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Informasi Panel
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.85rem;color:var(--text-secondary)">
          <div>🌐 Panel URL: <a href="https://domayer.septacloud.me" target="_blank" style="color:var(--cyan)">domayer.septacloud.me</a></div>
          <div>💾 phpMyAdmin: <a href="https://domayer.septacloud.me/pma" target="_blank" style="color:var(--cyan)">domayer.septacloud.me/pma</a></div>
          <div>🔗 Link Buyer: <a href="https://domayer.septacloud.me" target="_blank" style="color:var(--cyan)">domayer.septacloud.me</a></div>
          <div>📱 WhatsApp: <span style="color:var(--green)">Fonnte Connected</span></div>
        </div>
      </div>

      <!-- Server Expirations Card -->
      <div class="card" style="margin-top:20px">
        <div class="card-title" style="margin-bottom:14px">
          ⏰ Server Akan Expired
          <button class="btn btn-secondary" style="margin-left:auto;padding:5px 12px;font-size:0.78rem" onclick="loadHome()">🔄</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Server Name</th><th>Owner</th><th>Expired Pada</th><th>Sisa Waktu</th></tr>
            </thead>
            <tbody id="exp-table-body">
              <tr><td colspan="4"><div class="empty-state"><div class="empty-icon">⏰</div><p>Tidak ada server dengan expired</p></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== PAGE: CREATE ACCOUNT ===== -->
    <div id="page-createAccount" class="page">
      <div class="section-header">
        <h2><div class="h-icon">👤</div> Create Account Pterodactyl</h2>
      </div>
      <div class="card">
        <div class="form-grid">
          <div class="form-group">
            <label>Email <span style="color:var(--red)">*</span></label>
            <input id="ca-email" type="email" placeholder="contoh@gmail.com">
          </div>
          <div class="form-group">
            <label>Username <span style="color:var(--red)">*</span></label>
            <input id="ca-username" type="text" placeholder="username">
          </div>
          <div class="form-group">
            <label>First Name <span style="color:var(--red)">*</span></label>
            <input id="ca-firstname" type="text" placeholder="Nama depan">
          </div>
          <div class="form-group">
            <label>Last Name</label>
            <input id="ca-lastname" type="text" placeholder="Nama belakang">
          </div>
          <div class="form-group">
            <label>Password <span style="color:var(--red)">*</span></label>
            <input id="ca-password" type="text" placeholder="Password akun">
          </div>
          <div class="form-group">
            <label>Default Language</label>
            <select disabled><option>English</option></select>
          </div>
          <div class="form-group">
            <label>Role</label>
            <select id="ca-role">
              <option value="0">Member</option>
            </select>
          </div>
          <div class="form-actions">
            <button id="btn-create-account" class="btn btn-primary" onclick="submitCreateAccount()">🚀 Buat Akun</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== PAGE: CREATE SERVER ===== -->
    <div id="page-createServer" class="page">
      <div class="section-header">
        <h2><div class="h-icon">🖥</div> Create Server Pterodactyl</h2>
      </div>
      <div class="card">
        <div class="form-grid">

          <div class="section-label">📦 Core Details</div>

          <div class="form-group">
            <label>Server Owner <span style="color:var(--red)">*</span></label>
            <select id="cs-owner"><option value="">Loading users...</option></select>
          </div>
          <div class="form-group">
            <label>Server Name</label>
            <input id="cs-name" type="text" placeholder="Otomatis dari username(egg)">
          </div>
          <div class="form-group">
            <label>Owner Password Account</label>
            <input id="cs-owner-pass" type="text" placeholder="Password akun owner (untuk kirim WA)">
          </div>
          <div class="form-group">
            <label>Server Description</label>
            <input id="cs-desc" type="text" placeholder="Opsional">
          </div>

          <hr class="section-divider">
          <div class="section-label">🌐 Allocation Management</div>

          <div class="form-group">
            <label>Node <span style="color:var(--red)">*</span></label>
            <select id="cs-node"><option value="">Loading nodes...</option></select>
          </div>
          <div class="form-group">
            <label>Default Allocation <span style="color:var(--red)">*</span></label>
            <select id="cs-default-alloc"><option value="">-</option></select>
            <small id="cs-alloc-loading" style="color:var(--text-muted);font-size:0.72rem"></small>
          </div>

          <hr class="section-divider">
          <div class="section-label">⚙ Application Feature Limits</div>

          <div class="form-group">
            <label>Database Limit</label>
            <select id="cs-db-limit">
              <option value="0">0</option><option value="1">1</option><option value="2">2</option>
              <option value="3">3</option><option value="4">4</option><option value="5">5</option>
              <option value="6">6</option><option value="7">7</option><option value="8">8</option>
              <option value="9">9</option><option value="10">10</option>
            </select>
          </div>
          <div class="form-group">
            <label>Backup Limit</label>
            <select id="cs-backup-limit">
              <option value="0">0</option><option value="1">1</option><option value="2">2</option>
              <option value="3">3</option><option value="4">4</option><option value="5">5</option>
              <option value="6">6</option><option value="7">7</option><option value="8">8</option>
              <option value="9">9</option><option value="10">10</option>
            </select>
          </div>
          <div class="form-group">
            <label>Allocation Limit</label>
            <select id="cs-alloc-limit">
              <option value="0">0</option><option value="1">1</option><option value="2">2</option>
              <option value="3">3</option><option value="4">4</option><option value="5">5</option>
              <option value="6">6</option><option value="7">7</option><option value="8">8</option>
              <option value="9">9</option><option value="10">10</option>
            </select>
          </div>

          <hr class="section-divider">
          <div class="section-label">💾 Resource Management</div>

          <div class="form-group">
            <label>CPU Limit (100% = 1 core)</label>
            <select id="cs-cpu">
              <option value="1">100%</option><option value="2">200%</option><option value="3">300%</option>
              <option value="4">400%</option><option value="5">500%</option>
            </select>
          </div>
          <div class="form-group">
            <label>Memory (GB)</label>
            <select id="cs-memory">
              <option value="1">1 GB</option><option value="2">2 GB</option><option value="3">3 GB</option>
              <option value="4">4 GB</option><option value="5">5 GB</option><option value="6">6 GB</option>
              <option value="7">7 GB</option><option value="8">8 GB</option><option value="10">10 GB</option>
              <option value="12">12 GB</option><option value="16">16 GB</option><option value="20">20 GB</option>
              <option value="25">25 GB</option><option value="32">32 GB</option><option value="50">50 GB</option>
            </select>
          </div>
          <div class="form-group">
            <label>Disk Space (GB)</label>
            <select id="cs-disk">
              <option value="1">1 GB</option><option value="2">2 GB</option><option value="3">3 GB</option>
              <option value="4">4 GB</option><option value="5">5 GB</option><option value="6">6 GB</option>
              <option value="7">7 GB</option><option value="8">8 GB</option><option value="10">10 GB</option>
              <option value="12">12 GB</option><option value="16">16 GB</option><option value="20">20 GB</option>
              <option value="25">25 GB</option><option value="32">32 GB</option><option value="50">50 GB</option>
            </select>
          </div>

          <hr class="section-divider">
          <div class="section-label">🥚 Nest &amp; Egg</div>

          <div class="form-group">
            <label>Nest <span style="color:var(--red)">*</span></label>
            <select id="cs-nest"><option value="">Loading nests...</option></select>
          </div>
          <div class="form-group">
            <label>Egg <span style="color:var(--red)">*</span></label>
            <select id="cs-egg"><option value="">-- Pilih Nest dulu --</option></select>
          </div>

          <hr class="section-divider">
          <div class="section-label">📱 WhatsApp Buyer</div>

          <div class="form-group full">
            <label>Nomor HP Buyer (format 628xxx atau 08xxx) <span style="color:var(--red)">*</span></label>
            <input id="cs-phone" type="text" placeholder="Contoh: 6281234567890 atau 081234567890">
          </div>

          <hr class="section-divider">
          <div class="section-label">⏰ Masa Aktif Server</div>

          <div class="form-group full">
            <label>Expired Server (opsional — server otomatis terhapus saat expired)</label>
            <select id="cs-expired-days">
              <option value="0">♾ Tidak ada expired (permanen)</option>
              <option value="1">1 Hari</option>
              <option value="3">3 Hari</option>
              <option value="7">7 Hari</option>
              <option value="14">14 Hari</option>
              <option value="30">30 Hari</option>
            </select>
          </div>

          <div class="form-actions">
            <button id="btn-create-server" class="btn btn-primary" onclick="submitCreateServer()">🚀 Buat Server &amp; Kirim WA</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== PAGE: LIST USERS ===== -->
    <div id="page-listUsers" class="page">
      <div class="section-header">
        <h2><div class="h-icon">👥</div> List Users Pterodactyl</h2>
        <div style="display:flex;gap:10px;align-items:center">
          <div class="search-wrap">
            <span class="search-icon">🔍</span>
            <input id="lu-search" class="search-bar" placeholder="Cari user..." oninput="renderUsersTable(cachedUsers)">
          </div>
          <button class="btn btn-secondary" onclick="loadListUsers()">🔄 Refresh</button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Email</th><th>Username</th><th>Role</th><th>Aksi</th></tr>
            </thead>
            <tbody id="lu-table-body">
              <tr><td colspan="5"><div class="page-loader"><div class="spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== PAGE: LIST SERVERS ===== -->
    <div id="page-listServers" class="page">
      <div class="section-header">
        <h2><div class="h-icon">🖥</div> List Servers Pterodactyl</h2>
        <div style="display:flex;gap:10px;align-items:center">
          <div class="search-wrap">
            <span class="search-icon">🔍</span>
            <input id="ls-search" class="search-bar" placeholder="Cari server...">
          </div>
          <button class="btn btn-secondary" onclick="loadListServers()">🔄 Refresh</button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Server Name</th><th>Owner</th><th>Status</th><th>Aksi</th></tr>
            </thead>
            <tbody id="ls-table-body">
              <tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== PAGE: LIST NESTS ===== -->
    <div id="page-listNests" class="page">
      <div class="section-header">
        <h2><div class="h-icon">🥚</div> List Nests &amp; Eggs</h2>
        <button class="btn btn-secondary" onclick="loadListNests()">🔄 Refresh</button>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>ID</th><th>Nest</th><th>Deskripsi</th><th>Jumlah Egg</th></tr>
            </thead>
            <tbody id="ln-table-body">
              <tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== PAGE: ADD ACCOUNT PANEL ===== -->
    <div id="page-addAccount" class="page owner-only">
      <div class="section-header">
        <h2><div class="h-icon">🔐</div> Manage Account Panel</h2>
      </div>

      <!-- Add Form -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-title">➕ Tambah Akun Panel</div>
        <div class="form-grid">
          <div class="form-group">
            <label>Username <span style="color:var(--red)">*</span></label>
            <input id="pa-username" type="text" placeholder="Username baru">
          </div>
          <div class="form-group">
            <label>Password <span style="color:var(--red)">*</span></label>
            <input id="pa-password" type="text" placeholder="Password baru">
          </div>
          <div class="form-group">
            <label>Role</label>
            <select id="pa-role">
              <option value="0">Administrator</option>
              <option value="1">Owner</option>
            </select>
          </div>
          <div class="form-actions">
            <button id="btn-add-panel-acc" class="btn btn-primary" onclick="submitAddPanelAccount()">➕ Tambah Akun</button>
          </div>
        </div>
      </div>

      <!-- Existing accounts -->
      <div class="card">
        <div class="card-title">📋 Daftar Akun Panel</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Username</th><th>Password</th><th>Role</th><th>Aksi</th></tr>
            </thead>
            <tbody id="pa-table-body">
              <tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== PAGE: PERPANJANG HOSTING ===== -->
    <div id="page-renewHosting" class="page">
      <div class="section-header">
        <h2><div class="h-icon">🔄</div> Perpanjang Hosting</h2>
        <button class="btn btn-secondary" onclick="loadRenewHosting()">🔄 Refresh</button>
      </div>
      <div class="card">
        <div class="card-title">📋 Server dengan Masa Aktif</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Server Name</th><th>Owner</th><th>Expired Pada</th><th>Sisa</th><th>Aksi</th></tr>
            </thead>
            <tbody id="rh-table-body">
              <tr><td colspan="5"><div class="page-loader"><div class="spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===== PAGE: ACTIVITY LOG ===== -->
    <div id="page-activityLog" class="page owner-only">
      <div class="section-header">
        <h2><div class="h-icon">📋</div> Activity Log</h2>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" onclick="loadActivityLog()">🔄 Refresh</button>
          <button class="btn btn-danger" onclick="clearActivityLog()">🗑 Clear All Log</button>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Username</th><th>Role</th><th>Aktivitas</th><th>Waktu</th></tr>
            </thead>
            <tbody id="al-table-body">
              <tr><td colspan="4"><div class="page-loader"><div class="spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </main><!-- end main-wrapper -->
<!-- Sidebar Overlay (mobile) -->
<div id="sidebar-overlay"></div>
</div><!-- end #app -->

<!-- ======== MODALS ======== -->

<!-- Edit User Modal -->
<div id="edit-user-modal" class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <h3>✏ Edit User Pterodactyl</h3>
      <button class="modal-close" onclick="closeModal('edit-user-modal')">✕</button>
    </div>
    <div class="modal-body">
      <input id="eu-id" type="hidden">
      <div class="form-grid">
        <div class="form-group">
          <label>Email</label>
          <input id="eu-email" type="email">
        </div>
        <div class="form-group">
          <label>Username</label>
          <input id="eu-username" type="text">
        </div>
        <div class="form-group">
          <label>Password Baru (kosongkan jika tidak diubah)</label>
          <input id="eu-password" type="text" placeholder="Password baru">
        </div>
        <div class="form-group">
          <label>Role</label>
          <select id="eu-role">
            <option value="0">Member</option>
            <option value="1">Administrator</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal('edit-user-modal')">Batal</button>
        <button id="btn-edit-user" class="btn btn-primary" onclick="submitEditUser()">💾 Simpan</button>
      </div>
    </div>
  </div>
</div>

<!-- Edit Panel User Modal -->
<div id="edit-panel-user-modal" class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <h3>✏ Edit Akun Panel</h3>
      <button class="modal-close" onclick="closeModal('edit-panel-user-modal')">✕</button>
    </div>
    <div class="modal-body">
      <input id="ep-id" type="hidden">
      <div class="form-grid">
        <div class="form-group full">
          <label>Username</label>
          <input id="ep-username" type="text">
        </div>
        <div class="form-group full">
          <label>Password Baru (kosongkan jika tidak diubah)</label>
          <input id="ep-password" type="text" placeholder="Password baru">
        </div>
        <div class="form-group full">
          <label>Role</label>
          <select id="ep-role">
            <option value="0">Administrator</option>
            <option value="1">Owner</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal('edit-panel-user-modal')">Batal</button>
        <button class="btn btn-primary" onclick="submitEditPanelUser()">💾 Simpan</button>
      </div>
    </div>
  </div>
</div>

<!-- Server Detail Modal -->
<div id="server-detail-modal" class="modal-overlay">
  <div class="modal modal-wide">
    <div class="modal-header">
      <h3>🖥 Detail Server</h3>
      <button class="modal-close" onclick="closeModal('server-detail-modal')">✕</button>
    </div>
    <div class="modal-body" id="server-detail-body">
      <div class="page-loader"><div class="spinner"></div></div>
    </div>
  </div>
</div>

<!-- Renew Server Modal -->
<div id="renew-modal" class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <h3>🔄 Perpanjang Server</h3>
      <button class="modal-close" onclick="closeModal('renew-modal')">✕</button>
    </div>
    <div class="modal-body">
      <input id="renew-server-id" type="hidden">
      <div style="margin-bottom:16px">
        <div style="font-size:0.85rem;color:var(--text-secondary)">Server:</div>
        <div id="renew-server-name" style="font-weight:700;font-size:1rem;color:var(--cyan)"></div>
        <div style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px">Expired saat ini: <span id="renew-current-expire" style="color:var(--yellow)"></span></div>
      </div>
      <div class="form-group">
        <label>Tambah Durasi</label>
        <select id="renew-add-days">
          <option value="1">+ 1 Hari</option>
          <option value="3">+ 3 Hari</option>
          <option value="7">+ 7 Hari</option>
          <option value="14">+ 14 Hari</option>
          <option value="30">+ 30 Hari</option>
        </select>
      </div>
      <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:16px">
        📱 Notifikasi WA otomatis dikirim ke buyer setelah perpanjang.
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal('renew-modal')">Batal</button>
        <button id="btn-do-renew" class="btn btn-primary" onclick="submitRenew()">✅ Perpanjang</button>
      </div>
    </div>
  </div>
</div>

<!-- Confirm Modal -->
<div id="confirm-modal" class="modal-overlay">
  <div class="modal">
    <div class="modal-header">
      <h3>⚠ Konfirmasi</h3>
      <button class="modal-close" onclick="closeModal('confirm-modal')">✕</button>
    </div>
    <div class="modal-body">
      <p id="confirm-text" class="confirm-text"></p>
      <div class="confirm-actions">
        <button class="btn btn-secondary" onclick="closeModal('confirm-modal')">Batal</button>
        <button id="confirm-ok" class="btn btn-danger">Ya, Lanjutkan</button>
      </div>
    </div>
  </div>
</div>

<!-- Toast Container -->
<div id="toast-container" class="toast-container"></div>

<script src="/script.js"></script>
</body>
</html>`
}
