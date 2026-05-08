# Dokumentasi Integrasi API SSO Login

API ini menyediakan sistem autentikasi dan manajemen pengguna berbasis JWT (JSON Web Token) dengan database PostgreSQL. Dapat digunakan oleh website, aplikasi mobile, atau API lain sebagai sistem Single Sign-On (SSO).

---

## Daftar Isi

1. [Informasi Dasar](#informasi-dasar)
2. [Alur Autentikasi](#alur-autentikasi)
3. [Panduan Cepat: Mulai Integrasi](#panduan-cepat-mulai-integrasi)
4. [Endpoint API](#endpoint-api)
   - [Autentikasi](#autentikasi)
   - [Manajemen Pengguna (Admin)](#manajemen-pengguna-admin)
5. [Contoh Implementasi](#contoh-implementasi)
   - [Vanilla JavaScript (Web)](#vanilla-javascript-web)
   - [React (Web)](#react-web)
   - [React Native (Mobile)](#react-native-mobile)
6. [Role & Permissions](#role--permissions)
7. [Keamanan & Rate Limiting](#keamanan--rate-limiting)
8. [Error Handling](#error-handling)
9. [Troubleshooting](#troubleshooting)

---

## Informasi Dasar

| Item | Nilai |
|------|-------|
| **Base URL** | `https://auth.ucentric.id` |
| **Database** | PostgreSQL |
| **Autentikasi** | JWT (Access Token + Refresh Token) |
| **Format Request/Response** | JSON |

### Header Wajib untuk Endpoint Terproteksi

Semua endpoint yang dilindungi memerlukan header:

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

## Alur Autentikasi

```
┌──────────────┐
│   Client     │
│ (Web/App)    │
└──────┬───────┘
       │
       │ 1. Login (email + password)
       ▼
┌──────────────┐
│     API      │
└──────┬───────┘
       │
       │ 2. Return: Access Token (15 menit) + Refresh Token (7 hari)
       ▼
┌──────────────┐
│   Client     │
│              │
│ Simpan:      │
│ - token      │
│ - refreshToken │
│ - user info  │
└──────┬───────┘
       │
       │ 3. Akses API terproteksi (kirim access token di header)
       │    Jika access token expired → pakai refresh token untuk dapat token baru
       │    Jika refresh token juga expired → login ulang
       ▼
┌──────────────┐
│     API      │
│              │
│ Cek:         │
│ - Token valid? │
│ - Status aktif? │
│ - Role sesuai? │
└──────────────┘
```

### Siklus Hidup Token

| Token | Masa Berlaku | Fungsi |
|-------|--------------|--------|
| **Access Token** | 15 menit | Mengakses API terproteksi |
| **Refresh Token** | 7 hari | Mendapatkan access token baru tanpa login ulang |

---

## Panduan Cepat: Mulai Integrasi

### Step 1: Lakukan Login

```javascript
const res = await fetch('https://auth.ucentric.id/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'yourpassword'
  })
});

const data = await res.json();
// Simpan token
localStorage.setItem('token', data.data.token);
localStorage.setItem('refreshToken', data.data.refreshToken);
```

### Step 2: Akses API Terproteksi

```javascript
const res = await fetch('https://auth.ucentric.id/api/auth/me', {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});
```

### Step 3: Handle Token Expired

```javascript
if (res.status === 403) {
  // Refresh access token
  const refreshRes = await fetch('https://auth.ucentric.id/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: localStorage.getItem('refreshToken')
    })
  });
  
  const refreshData = await refreshRes.json();
  localStorage.setItem('token', refreshData.data.token);
}
```

---

## Endpoint API

### Autentikasi

#### 1. Login

**POST** `/api/auth/login`

Autentikasi pengguna dan dapatkan access token + refresh token.

**Request:**

```json
{
  "email": "user@example.com",  // atau "username": "john_doe"
  "password": "yourpassword"
}
```

**Response Sukses (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": "15m",
    "user": {
      "id": "uuid-123",
      "name": "John Doe",
      "email": "user@example.com",
      "role": "user",
      "status": true,
      "image": null
    }
  }
}
```

**Response Error:**

| Status | Message | Penjelasan |
|--------|---------|------------|
| 400 | Email or username is required | Tidak mengirim identifier |
| 400 | Validation error | Format email salah |
| 401 | Invalid credentials | Email/password salah |
| 403 | Your account is inactive | Akun dinonaktifkan admin |
| 403 | Account is temporarily locked | Terlalu banyak percobaan login gagal |
| 429 | Too many login attempts | Rate limit terpicu (max 10x per 15 menit) |

---

#### 2. Refresh Token

**POST** `/api/auth/refresh`

Dapatkan access token baru menggunakan refresh token (tanpa login ulang).

**Request:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response Sukses (200):**

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": "15m"
  }
}
```

**Response Error:**

| Status | Message | Penjelasan |
|--------|---------|------------|
| 400 | Refresh token is required | Tidak mengirim refresh token |
| 403 | Invalid or expired refresh token | Token tidak valid atau expired |
| 403 | Refresh token not found or revoked | Token sudah dihapus (sudah logout) |

---

#### 3. Logout

**POST** `/api/auth/logout`

Logout pengguna dan blacklist access token.

**Header:** `Authorization: Bearer <access_token>`

**Request (opsional):**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response Sukses (200):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### 4. Get Current User

**GET** `/api/auth/me`

Ambil data pengguna yang sedang login.

**Header:** `Authorization: Bearer <access_token>`

**Response Sukses (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid-123",
    "name": "John Doe",
    "username": "john_doe",
    "email": "user@example.com",
    "role": "user",
    "status": true,
    "image": null,
    "created_at": "2024-04-22T10:00:00.000Z"
  }
}
```

*Catatan: Field `password`, `failed_login_attempts`, dan `locked_until` tidak dikembalikan demi keamanan.*

---

#### 5. Health Check

**GET** `/api/health`

Cek status API dan koneksi database. Endpoint ini **tidak memerlukan autentikasi** dan bisa digunakan untuk monitoring atau health check di Coolify/Docker.

**Response Sukses (200):**

```json
{
  "success": true,
  "message": "API is running",
  "database": "connected",
  "timestamp": "2026-05-08T12:02:07.423Z"
}
```

**Response Error (500):**

```json
{
  "success": false,
  "message": "Database connection failed",
  "error": "Connection error details"
}
```

**Penggunaan:**
- Monitoring uptime API
- Health check di Coolify/Docker
- Cek apakah database masih terhubung

---

#### 6. Verify Token

**POST** `/api/auth/verify`

Cek apakah access token masih valid (berguna untuk splash screen / cek sesi).

**Request:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response Sukses (200):**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid-123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "iat": 1713792000,
    "exp": 1713792900
  }
}
```

---

#### 7. Root Endpoint (Info API)

**GET** `/`

Mendapatkan daftar semua endpoint API yang tersedia. Berguna untuk dokumentasi cepat atau debugging.

**Response (200):**

```json
{
  "success": true,
  "message": "SSO Login API",
  "endpoints": {
    "user_create": "POST /api/users (Header: Authorization: Bearer <token>)",
    "login": "POST /api/auth/login",
    "refresh": "POST /api/auth/refresh",
    "logout": "POST /api/auth/logout (Header: Authorization: Bearer <token>)",
    "me": "GET /api/auth/me (Header: Authorization: Bearer <token>)",
    "users_list": "GET /api/users (Header: Authorization: Bearer <token>)",
    "users_edit": "PUT /api/users/:id (Header: Authorization: Bearer <token>)",
    "users_delete": "DELETE /api/users/:id (Header: Authorization: Bearer <token>)",
    "verify": "POST /api/auth/verify",
    "health": "GET /api/health"
  }
}
```

---

### Manajemen Pengguna (Admin)

#### 1. Create User

**POST** `/api/users`

Buat pengguna baru (dengan password).

**Header:** `Authorization: Bearer <access_token>` (admin/superadmin)

**Request:**

```json
{
  "name": "Jane Smith",
  "username": "jane_smith",
  "email": "jane@example.com",
  "password": "P@ssw0rd123!",
  "role": "user"
}
```

**Ketentuan Password:**
- Minimal 8 karakter
- Minimal 1 huruf besar
- Minimal 1 huruf kecil
- Minimal 1 angka
- Minimal 1 simbol

**Response Sukses (201):**

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": "uuid-456",
    "name": "Jane Smith",
    "username": "jane_smith",
    "email": "jane@example.com",
    "role": "user",
    "status": false
  }
}
```

**Catatan Role:**
- Hanya `superadmin` yang bisa membuat user dengan role `superadmin`
- User baru dibuat dengan `status: false` (perlu diaktifkan admin)

---

#### 2. List Users

**GET** `/api/users`

Ambil daftar semua pengguna.

**Header:** `Authorization: Bearer <access_token>` (admin/superadmin)

**Response Sukses (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-123",
      "name": "John Doe",
      "username": "john_doe",
      "email": "john@example.com",
      "role": "user",
      "status": true,
      "image": null,
      "created_at": "2024-04-22T10:00:00.000Z"
    }
  ]
}
```

---

#### 3. Edit User

**PUT** `/api/users/:id`

Update data pengguna.

**Header:** `Authorization: Bearer <access_token>` (admin/superadmin)

**Request:**

```json
{
  "name": "John Updated",
  "status": true,
  "role": "admin"
}
```

**Response Sukses (200):**

```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "id": "uuid-123",
    "name": "John Updated",
    "username": "john_doe",
    "email": "john@example.com",
    "role": "admin",
    "status": true,
    "image": null,
    "created_at": "2024-04-22T10:00:00.000Z"
  }
}
```

**Catatan Role:**
- Hanya `superadmin` yang bisa mengedit user dengan role `superadmin`
- Hanya `superadmin` yang bisa mempromosikan user ke role `superadmin`
- Admin tidak bisa menonaktifkan akun sendiri

---

#### 4. Delete User

**DELETE** `/api/users/:id`

Hapus pengguna.

**Header:** `Authorization: Bearer <access_token>` (admin/superadmin)

**Response Sukses (200):**

```json
{
  "success": true,
  "message": "User deleted successfully",
  "data": {
    "id": "uuid-123",
    "username": "john_doe"
  }
}
```

**Catatan:**
- User tidak bisa menghapus akun sendiri
- Hanya `superadmin` yang bisa menghapus user dengan role `superadmin`

---

## Contoh Implementasi

### Vanilla JavaScript (Web)

```javascript
const API_URL = 'https://auth.ucentric.id';

class AuthService {
  static login(email, password) {
    return fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(res => res.json()).then(data => {
      if (data.success) {
        localStorage.setItem('token', data.data.token);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.data.user));
      }
      return data;
    });
  }

  static async getProfile() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  }

  static async logout() {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refreshToken })
    });

    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  static async refreshTokenIfNeeded() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      const data = await res.json();
      
      if (data.success) {
        localStorage.setItem('token', data.data.token);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }
}

// Cara pakai:
// AuthService.login('user@example.com', 'password').then(console.log);
// AuthService.getProfile().then(console.log);
// AuthService.logout();
```

### React (Web)

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
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) setUser(data.data);
          else {
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
          }
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
      localStorage.setItem('refreshToken', data.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      setUser(data.data.user);
    }
    return data;
  };

  const logout = async () => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  };

  const refreshSession = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('token', data.data.token);
      return true;
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshSession, loading }}>
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

class AuthManager {
  static async login(email, password) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (data.success) {
      await AsyncStorage.setItem('token', data.data.token);
      await AsyncStorage.setItem('refreshToken', data.data.refreshToken);
      await AsyncStorage.setItem('user', JSON.stringify(data.data.user));
    }
    return data;
  }

  static async getProfile() {
    const token = await AsyncStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  }

  static async logout() {
    const token = await AsyncStorage.getItem('token');
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });
    } catch (err) {
      console.error('Logout error:', err);
    }

    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('user');
  }

  static async refreshToken() {
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const data = await res.json();
    
    if (data.success) {
      await AsyncStorage.setItem('token', data.data.token);
      return true;
    }
    return false;
  }
}

// Axios Interceptor untuk auto-refresh token
import axios from 'axios';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshed = await AuthManager.refreshToken();
      if (refreshed) {
        const newToken = await AsyncStorage.getItem('token');
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      }
      
      // Refresh token juga expired, redirect ke login
      await AuthManager.logout();
      // Navigate to login screen
    }

    return Promise.reject(error);
  }
);
```

---

## Role & Permissions

| Role | Login | Lihat User | Buat User | Edit User | Hapus User |
|------|-------|------------|-----------|-----------|------------|
| **user** | ✓ | ✗ | ✗ | ✗ | ✗ |
| **admin** | ✓ | ✓ | ✓ | ✓ (kecuali superadmin) | ✓ (kecuali superadmin) |
| **superadmin** | ✓ | ✓ | ✓ | ✓ | ✓ |

### Hierarki Role

- `superadmin` → Bisa mengelola semua role termasuk superadmin lain
- `admin` → Bisa mengelola user biasa saja, tidak bisa mengelola superadmin
- `user` → Hanya bisa login dan akses fitur standar

---

## Keamanan & Rate Limiting

### Fitur Keamanan

| Fitur | Detail |
|-------|--------|
| **Helmet** | Security headers (HSTS, CSP, X-Frame-Options, dll) |
| **Rate Limiting** | 100 request/15 menit (general), 10 login/15 menit (IP) |
| **Account Lockout** | Akun dikunci 15 menit setelah 5x login gagal |
| **Password Strength** | Minimal 8 karakter + uppercase + number + symbol |
| **Input Validation** | Email format check, XSS protection, max length |
| **Token Blacklist** | Token yang sudah logout tidak bisa dipakai lagi |
| **CORS** | Bisa dibatasi ke domain tertentu |

### Status Akun

| Status | Keterangan |
|--------|------------|
| `true` | Akun aktif, bisa login |
| `false` | Akun nonaktif, tidak bisa login |

---

## Error Handling

### Format Response Error

Semua error mengikuti format yang sama:

```json
{
  "success": false,
  "message": "Deskripsi error",
  "errors": [] // Opsional, untuk validation error
}
```

### Validation Error

```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "password", "message": "Password must be at least 8 characters..." }
  ]
}
```

### Implementasi Error Handling di Client

```javascript
async function safeApiCall(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const data = await res.json();

    if (!data.success) {
      // Handle specific errors
      switch (res.status) {
        case 401:
          // Token invalid atau belum login
          break;
        case 403:
          // Token expired atau tidak punya akses
          // Coba refresh token
          break;
        case 429:
          // Rate limit, tunggu beberapa menit
          alert(`Too many requests. Wait ${data.retry_after || 15} minutes`);
          break;
        default:
          console.error(data.message);
      }
      return null;
    }

    return data;
  } catch (err) {
    console.error('Network error:', err);
    return null;
  }
}
```

---

## Troubleshooting

### 1. CORS Error

**Error:**
```
Access to fetch at 'https://auth.ucentric.id/api/auth/login' from origin 
'http://localhost:3000' has been blocked by CORS policy
```

**Solusi:**
- Pastikan `CORS_ORIGIN` diisi di environment variable Coolify
- Contoh: `https://website-anda.com`
- Multiple domain: `https://a.com,https://b.com`

---

### 2. Account Locked

**Error:**
```json
{ "message": "Account is temporarily locked. Try again in 15 minutes." }
```

**Solusi:**
- Tunggu 15 menit lalu coba lagi
- Atau hubungi admin untuk unlock manual via database

---

### 3. Token Expired

**Error:**
```json
{ "message": "Invalid or expired token" }
```

**Solusi:**
- Gunakan refresh token untuk mendapatkan access token baru
- Jika refresh token juga expired, user harus login ulang

---

### 4. Insufficient Permissions

**Error:**
```json
{ "message": "Access denied: Insufficient permissions" }
```

**Solusi:**
- User tidak punya role yang cukup untuk mengakses endpoint
- Minta admin untuk mengubah role atau berikan akses

---

### 5. Password Requirement Not Met

**Error:**
```json
{
  "message": "Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one symbol"
}
```

**Solusi:**
- Gunakan password yang memenuhi syarat:
  - Minimal 8 karakter
  - Ada huruf besar (A-Z)
  - Ada huruf kecil (a-z)
  - Ada angka (0-9)
  - Ada simbol (!@#$%^&*)

---

## Kontak & Support

Jika ada pertanyaan atau butuh bantuan lebih lanjut, hubungi tim pengembang atau buat issue di repository.
