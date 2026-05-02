# Dokumentasi Lengkap API Login SSO

## Daftar Isi

1. [Gambaran Umum](#gambaran-umum)
2. [Teknologi](#teknologi)
3. [Konfigurasi Environment](#konfigurasi-environment)
4. [Alur Autentikasi](#alur-autentikasi)
5. [Endpoint API](#endpoint-api)
6. [Kode Error](#kode-error)
7. [Keamanan](#keamanan)
8. [Contoh Integrasi](#contoh-integrasi)
9. [Deploy ke Coolify](#deploy-ke-coolify)
10. [Troubleshooting](#troubleshooting)

---

## Gambaran Umum

API ini menyediakan sistem autentikasi berbasis JWT (JSON Web Token) yang terhubung ke database PostgreSQL. API dapat digunakan oleh website maupun aplikasi mobile untuk melakukan login dan mengelola sesi pengguna.

**Base URL Production:**
```
https://auth.ucentric.id
```

**Base URL Local:**
```
http://localhost:3000
```

---

## Teknologi

| Teknologi | Fungsi |
|-----------|--------|
| Node.js + Express | Backend API |
| PostgreSQL (pg) | Database |
| JWT (jsonwebtoken) | Token autentikasi |
| bcryptjs | Hashing password |
| Helmet | Security headers |
| express-rate-limit | Rate limiting |
| express-validator | Validasi input |
| CORS | Cross-origin resource sharing |

---

## Konfigurasi Environment

File `.env` yang perlu disiapkan:

```env
PORT=3000

# Database PostgreSQL
DB_HOST=103.127.139.112
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=2En3SaZ2vnyWgttkTWnXYR9UnSekGCMQcko8Bf4PvL5GVyFJYeGFnZBuJkDLwZ5o
DB_NAME=ucentric_apps
DB_TABLE=User

# JWT
JWT_SECRET=5dce49a2f414597c584607c3238e2b9622b9c981163192f2f0ffa1f4d95544dd33d4bf506bc03aa95ef348768ca86a5bc7fc5464dbaab236800b5b6fc32a13de
JWT_EXPIRES_IN=7d

# CORS (kosongkan = allow all)
# CORS_ORIGIN=https://website-anda.com,https://app-anda.com
CORS_ORIGIN=
```

### Cara Generate JWT Secret Baru

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Alur Autentikasi

```
┌─────────────┐     login (email + password)      ┌─────────────┐
│   Client    │ ─────────────────────────────────> │     API     │
│  (Web/App)  │                                    │             │
│             │ <───────────────────────────────── │             │
└─────────────┘         JWT Token                   └─────────────┘
       │                                                   │
       │ 2. Simpan token (localStorage / AsyncStorage)     │
       │                                                   │
       │ 3. Kirim token di header setiap request:          │
       │    Authorization: Bearer <token>                  │
       │                                                   │
       └───────────────────────────────────────────────────┘
```

---

## Endpoint API

### 1. Login

**POST** `/api/auth/login`

Digunakan untuk autentikasi pengguna dan mendapatkan token JWT.

#### Request Body

| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| email | string | Tidak* | Email pengguna |
| username | string | Tidak* | Nama pengguna (alternatif jika tidak pakai email) |
| password | string | Ya | Password pengguna |

\* Salah satu antara `email` atau `username` wajib diisi.

#### Contoh Request

```json
{
  "email": "dedirosandiid@gmail.com",
  "password": "Passw0rdPassw0rd"
}
```

Atau dengan nama:

```json
{
  "username": "Dedi Rosandi",
  "password": "Passw0rdPassw0rd"
}
```

#### Respons Sukses (200)

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": "7d",
    "user": {
      "id": "d45b3bdc-87f2-46f5-ac3a-2966d4936a3e",
      "name": "Dedi Rosandi",
      "email": "dedirosandiid@gmail.com",
      "role": "sales_afiliator",
      "status": true,
      "referral_code": "ABC123"
    }
  }
}
```

#### Respons Gagal

**400 - Validation Error**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

**401 - Invalid Credentials**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

**429 - Too Many Requests**
```json
{
  "success": false,
  "message": "Too many login attempts, please try again after 15 minutes."
}
```

---

### 2. Ambil Data Pengguna Saat Ini

**GET** `/api/auth/me`

Mengembalikan data lengkap pengguna yang sedang login. Endpoint ini dilindungi oleh JWT.

#### Header Wajib

```
Authorization: Bearer <token>
```

#### Respons Sukses (200)

```json
{
  "success": true,
  "data": {
    "id": "d45b3bdc-87f2-46f5-ac3a-2966d4936a3e",
    "name": "Dedi Rosandi",
    "email": "dedirosandiid@gmail.com",
    "image": null,
    "role": "sales_afiliator",
    "status": true,
    "referral_code": "ABC123",
    "emailVerified": null
  }
}
```

#### Respons Gagal

**401 - Token Missing**
```json
{
  "success": false,
  "message": "Access token is required"
}
```

**403 - Token Invalid/Expired**
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

---

### 3. Verifikasi Token

**POST** `/api/auth/verify`

Digunakan untuk memeriksa apakah token masih valid (berguna untuk splash screen / cek sesi saat app dibuka).

#### Request Body

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Respons Sukses (200)

```json
{
  "success": true,
  "data": {
    "user_id": "d45b3bdc-87f2-46f5-ac3a-2966d4936a3e",
    "email": "dedirosandiid@gmail.com",
    "name": "Dedi Rosandi",
    "iat": 1713792000,
    "exp": 1714396800
  }
}
```

#### Respons Gagal (403)

```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

---

### 4. Health Check

**GET** `/api/health`

Digunakan untuk monitoring status API dan koneksi database.

#### Respons Sukses (200)

```json
{
  "success": true,
  "message": "API is running",
  "database": "connected",
  "timestamp": "2026-04-22T13:28:27.467Z"
}
```

---

## Kode Error

| HTTP | Pesan | Penjelasan |
|------|-------|------------|
| 400 | Validation error | Format input tidak valid (email salah, password kosong, dll) |
| 401 | Access token is required | Header Authorization tidak dikirim |
| 401 | Invalid credentials | Email/password salah atau user tidak ditemukan |
| 403 | Invalid or expired token | Token JWT sudah expired atau tidak valid |
| 404 | User not found | Token valid tetapi user sudah dihapus dari database |
| 429 | Too many requests | Rate limit terpicu, coba lagi setelah 15 menit |
| 500 | Internal server error | Terjadi kesalahan di server/database |

---

## Keamanan

### Fitur Keamanan yang Aktif

1. **Helmet** - Menambahkan security headers:
   - `Strict-Transport-Security` (HSTS)
   - `Content-Security-Policy`
   - `X-Frame-Options: SAMEORIGIN`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: no-referrer`

2. **Rate Limiting**:
   - **General API**: 100 request per 15 menit per IP
   - **Login**: 10 percobaan per 15 menit per IP

3. **Input Validation**:
   - Email harus format valid
   - Password wajib diisi dan maksimal 128 karakter
   - Input di-sanitize (escape karakter berbahaya)

4. **Password Security**:
   - Hanya menerima password yang di-hash dengan bcrypt
   - Fallback plain text sudah dihapus
   - Password tidak pernah dikembalikan di response

5. **CORS**:
   - Bisa dibatasi ke domain tertentu via `.env`
   - Default allow all (hati-hati di production)

---

## Contoh Integrasi

### Web (Vanilla JavaScript)

```javascript
const API_URL = 'https://auth.ucentric.id';

// Login
async function login(email, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();

  if (data.success) {
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
    return { success: true, user: data.data.user };
  }
  return { success: false, message: data.message };
}

// Ambil data user yang login
async function getCurrentUser() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.success ? data.data : null;
}

// Logout
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

// Cek sesi saat aplikasi dibuka
async function checkSession() {
  const token = localStorage.getItem('token');
  if (!token) return false;

  const res = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  return data.success;
}
```

### React (dengan Context)

```jsx
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const API_URL = 'https://auth.ucentric.id';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setUser(data.data);
          else localStorage.removeItem('token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (data.success) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      setUser(data.data.user);
    }
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Cara pakai di komponen:
// const { user, login, logout } = useAuth();
```

### React Native (Mobile)

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://auth.ucentric.id';

async function login(email, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();

  if (data.success) {
    await AsyncStorage.setItem('token', data.data.token);
    await AsyncStorage.setItem('user', JSON.stringify(data.data.user));
  }
  return data;
}

async function getCurrentUser() {
  const token = await AsyncStorage.getItem('token');
  if (!token) return null;

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.success ? data.data : null;
}

async function logout() {
  await AsyncStorage.removeItem('token');
  await AsyncStorage.removeItem('user');
}
```

### Axios Interceptor (Web/Mobile)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://auth.ucentric.id',
});

// Tambahkan token ke setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token'); // atau AsyncStorage untuk RN
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expired
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Cara pakai:
// const { data } = await api.get('/api/auth/me');
```

### cURL (Testing)

```bash
# Login
curl -X POST https://auth.ucentric.id/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Ambil data user (ganti TOKEN_ANDA dengan token dari response login)
curl https://auth.ucentric.id/api/auth/me \
  -H "Authorization: Bearer TOKEN_ANDA"

# Verifikasi token
curl -X POST https://auth.ucentric.id/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_ANDA"}'

# Health check
curl https://auth.ucentric.id/api/health
```

---

## Deploy ke Coolify

### Persyaratan

- Git repository dengan Dockerfile
- Server dengan Coolify terinstall
- Domain yang sudah pointing ke server (contoh: `auth.ucentric.id`)

### Langkah Deploy

1. **Push kode ke Git**
   ```bash
   git add .
   git commit -m "Initial deploy"
   git push origin main
   ```

2. **Buat Resource Baru di Coolify**
   - Pilih **Private Repository** (GitHub/GitLab)
   - Pilih repository API ini
   - Branch: `main`
   - Build Pack: `Dockerfile`

3. **Konfigurasi Environment Variables**
   - Masuk ke menu **Environment Variables**
   - Tambahkan semua variable dari `.env`
   - Pastikan `JWT_SECRET` diisi dengan string random yang kuat

4. **Konfigurasi Domain**
   - Masuk ke menu **Settings > URLs**
   - Tambahkan domain: `auth.ucentric.id`
   - Coolify akan otomatis buatkan SSL (HTTPS)

5. **Deploy**
   - Klik **Deploy**
   - Coolify akan build Docker image dan jalankan container

### Health Check

Coolify akan otomatis cek endpoint `/api/health` untuk memastikan aplikasi berjalan.

---

## Troubleshooting

### Login selalu gagal padahal password benar

- Pastikan password di database sudah di-hash dengan bcrypt (dimulai dengan `$2`)
- Jika password masih plain text, update di database dengan hash bcrypt

### CORS Error di Browser

```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
```

- Isi `CORS_ORIGIN` di environment variable Coolify dengan domain frontend Anda
- Contoh: `https://website-anda.com`
- Jika ada multiple domain, pisahkan dengan koma: `https://a.com,https://b.com`

### Rate Limiting terlalu ketat

- General API limit: 100 request / 15 menit
- Login limit: 10 request / 15 menit
- Jika perlu diubah, edit file `server.js` dan cari konfigurasi `rateLimit`

### Database Connection Error

```json
{ "success": false, "message": "Database connection failed" }
```

- Periksa kredensial database di environment variables
- Pastikan IP server Coolify di-whitelist di firewall database
- Jika database pakai SSL, tambahkan konfigurasi SSL di `db.js`

### Token selalu expired

- Periksa `JWT_EXPIRES_IN` di environment variables
- Default: `7d` (7 hari)
- Pastikan waktu server (timezone) sudah benar
