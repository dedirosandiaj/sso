# Dokumentasi Lengkap API Login SSO

## Daftar Isi

1. [Gambaran Umum](#gambaran-umum)
2. [Teknologi](#teknologi)
3. [Konfigurasi Environment](#konfigurasi-environment)
4. [Alur Autentikasi](#alur-autentikasi)
5. [Endpoint API](#endpoint-api)
   - [1. Create User (Admin Only)](#1-create-user)
   - [2. List User (Admin Only)](#2-list-user)
   - [3. Edit User (Admin Only)](#3-edit-user)
   - [4. Delete User (Admin Only)](#4-delete-user)
   - [5. Login](#5-login)
   - [6. Refresh Token](#6-refresh-token)
   - [7. Ambil Data Pengguna](#7-ambil-data-pengguna-saat-ini)
   - [8. Logout (Protected)](#8-logout)
   - [9. Verifikasi Token](#9-verifikasi-token)
   - [10. Health Check](#10-health-check)
6. [Kode Error](#kode-error)
7. [Keamanan & Fitur Ekstra](#keamanan--fitur-ekstra)
8. [Contoh Integrasi](#contoh-integrasi)
9. [Deploy ke Coolify](#deploy-ke-coolify)
10. [Troubleshooting](#troubleshooting)

---

## Gambaran Umum

API ini menyediakan sistem autentikasi berbasis JWT (JSON Web Token) yang sangat aman. Dilengkapi dengan arsitektur **Access Token + Refresh Token**, sistem **True Logout** (Blacklist), **Account Lockout**, serta **Role-Based Access Control (RBAC)** dengan sistem Hirarki Superadmin.

---

## Teknologi

| Teknologi | Fungsi |
|-----------|--------|
| Node.js + Express | Backend API |
| PostgreSQL (pg) | Database |
| JWT (jsonwebtoken) | Token autentikasi ganda (Access & Refresh) |
| bcryptjs | Hashing password |
| Helmet | Security headers |
| express-rate-limit | Rate limiting & Anti-Brute Force |
| express-validator | Validasi & Sanitasi input |

---

## Konfigurasi Environment

File `.env` yang harus disiapkan:

```env
PORT=3000

# Database PostgreSQL
DB_HOST=103.127.139.112
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=sso_auth

# JWT (Access Token)
JWT_SECRET=rahasia_utama_sangat_panjang
JWT_EXPIRES_IN=15m

# JWT (Refresh Token)
JWT_REFRESH_SECRET=rahasia_refresh_lebih_panjang_lagi
JWT_REFRESH_EXPIRES_IN=7d

# CORS (Pisahkan dengan koma, tanpa slash di akhir)
CORS_ORIGIN=http://localhost:3000,https://app.ucentric.id
```

---

## Alur Autentikasi

1. **Login:** Mengirim kredensial -> Mendapat `token` (akses) & `refreshToken`.
2. **Authorize:** Masukkan `token` ke Header `Authorization: Bearer <token>`.
3. **Expired:** Jika mendapat error 403 (expired), gunakan `refreshToken` ke endpoint `/api/auth/refresh`.
4. **Logout:** Mematikan kedua token (Blacklist & Delete DB).

---

## Endpoint API

### 1. Create User
**POST** `/api/users`
*Admin Only. Hanya Superadmin yang bisa membuat Superadmin baru.*

```json
{
  "name": "Budi Santoso",
  "username": "budi.s",
  "email": "budi@email.com",
  "password": "StrongPassword123!",
  "role": "admin"
}
```

### 2. List User
**GET** `/api/users`
*Admin Only. Menampilkan semua user.*

### 3. Edit User
**PUT** `/api/users/:id`
*Admin Only. Admin dilarang mengedit Superadmin.*

### 4. Delete User
**DELETE** `/api/users/:id`
*Admin Only. Admin dilarang menghapus Superadmin.*

### 5. Login
**POST** `/api/auth/login`
*Publik. Identifikasi via username atau email.*

### 6. Refresh Token
**POST** `/api/auth/refresh`
*Publik. Menukar refresh token dengan access token baru.*

### 7. Ambil Data Pengguna
**GET** `/api/auth/me`
*Protected. Mengambil profil user yang sedang login.*

### 8. Logout
**POST** `/api/auth/logout`
*Protected. Memutus sesi secara permanen.*

---

## Kode Error

| HTTP | Pesan | Penjelasan |
|------|-------|------------|
| 401 | Invalid credentials | Login gagal (Username/Password salah). |
| 403 | Access denied | User tidak punya izin (Hirarki RBAC). |
| 403 | Account locked | Akun terkunci 15 menit (Salah 5x). |
| 403 | Inactive account | Akun dinonaktifkan (`status: false`). |
| 429 | Too many requests | Rate limit terdeteksi. |

---

## Keamanan & Fitur Ekstra

1. **Hierarchy Protection**: Melindungi Superadmin dari perubahan oleh Admin biasa.
2. **Strong Password**: Wajib Huruf Besar, Angka, Simbol, dan Min 8 Karakter.
3. **Blacklist Table**: Token yang sudah logout tidak bisa dipakai lagi (True Logout).

---

## Contoh Integrasi (Axios Interceptors)

```javascript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response.status === 403 && !originalRequest._retry) {
      originalRequest._retry = true;
      const res = await api.post('/api/auth/refresh', { 
        refreshToken: localStorage.getItem('refreshToken') 
      });
      localStorage.setItem('token', res.data.data.token);
      return api(originalRequest);
    }
    return Promise.reject(error);
  }
);
```

---

## Deploy ke Coolify

1. Pilih **Nixpacks** atau **Dockerfile**.
2. Masukkan semua variabel dari `.env` ke bagian **Variables**.
3. Pastikan Port di Coolify sesuai dengan `PORT` di env (3000).

---

## Troubleshooting

1. **CORS Error**: Hapus garis miring `/` di akhir URL `CORS_ORIGIN`.
2. **DB Connection**: Pastikan IP Server Coolify sudah di-whitelist di firewall Database jika menggunakan DB eksternal.
