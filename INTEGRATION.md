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
   - [4. Login](#4-login)
   - [5. Refresh Token](#5-refresh-token)
   - [6. Ambil Data Pengguna](#6-ambil-data-pengguna-saat-ini)
   - [7. Logout (Protected)](#7-logout)
   - [8. Verifikasi Token](#8-verifikasi-token)
   - [9. Health Check](#9-health-check)
6. [Kode Error](#kode-error)
7. [Keamanan & Fitur Ekstra](#keamanan--fitur-ekstra)
8. [Contoh Integrasi](#contoh-integrasi)
9. [Deploy ke Coolify](#deploy-ke-coolify)
10. [Troubleshooting](#troubleshooting)

---

## Gambaran Umum

API ini menyediakan sistem autentikasi berbasis JWT (JSON Web Token) yang sangat aman. Dilengkapi dengan arsitektur **Access Token + Refresh Token**, sistem **True Logout** (Blacklist), **Account Lockout**, serta **Role-Based Access Control (RBAC)**.

---

## Konfigurasi Environment

File `.env` yang perlu disiapkan:

```env
PORT=3000

# Database PostgreSQL
DB_HOST=103.127.139.112
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password_database_anda
DB_NAME=sso_auth

# JWT (Access Token)
JWT_SECRET=rahasia_jwt_utama
JWT_EXPIRES_IN=15m

# JWT (Refresh Token)
JWT_REFRESH_SECRET=rahasia_jwt_refresh_token
JWT_REFRESH_EXPIRES_IN=7d

# CORS (kosongkan = allow all)
CORS_ORIGIN=https://website-anda.com
```

---

## Alur Autentikasi

Sistem ini menggunakan mekanisme token ganda yang modern:
1. **Login:** User mengirim email/username & password. Server mengembalikan **Access Token (15 menit)** & **Refresh Token (7 hari)**.
2. **Akses Data:** Client mengirim *Access Token* di *header*.
3. **RBAC:** API Manajemen User hanya bisa diakses oleh user dengan role `admin` atau `superadmin`.

---

## Endpoint API

### 1. Create User

**POST** `/api/users`

Mendaftarkan user baru. Endpoint ini **hanya bisa diakses oleh Admin**.

#### Syarat Password Kuat:
- Minimal **8 karakter**.
- Wajib mengandung minimal **1 Huruf Besar**.
- Wajib mengandung minimal **1 Angka**.
- Wajib mengandung minimal **1 Simbol/Karakter Spesial**.

#### Header Wajib
```
Authorization: Bearer <access_token_admin>
```

---

### 2. List User

**GET** `/api/users`

Mengambil daftar user. **Hanya bisa diakses oleh Admin**.

#### Header Wajib
```
Authorization: Bearer <access_token_admin>
```

---

### 3. Edit User

**PUT** `/api/users/:id`

Memperbarui data user berdasarkan ID. **Hanya bisa diakses oleh Admin**.

#### Header Wajib
```
Authorization: Bearer <access_token_admin>
```

---

### 4. Login

**POST** `/api/auth/login`

Mendapatkan `token` dan `refreshToken`. `token` sekarang berisi informasi `role`.

---

### 5. Refresh Token

**POST** `/api/auth/refresh`

Menghasilkan Access Token baru menggunakan Refresh Token yang valid.

---

### 6. Ambil Data Pengguna Saat Ini

**GET** `/api/auth/me`

Mengembalikan data user yang sedang aktif login.

---

### 7. Logout

**POST** `/api/auth/logout`

Melakukan "True Logout". Mem-blacklist Access Token dan menghapus Refresh Token.

---

## Kode Error

| HTTP | Pesan | Penjelasan |
|------|-------|------------|
| 400 | Validation error | Format input salah atau field wajib kosong. |
| 401 | Invalid credentials | Username/Email atau password salah. |
| 403 | Access denied | User tidak memiliki izin (bukan admin) untuk akses API ini. |
| 403 | Account is temporarily locked | Akun terkunci akibat salah password 5 kali. |

---

## Keamanan & Fitur Ekstra

1. **Password Policy:** Mewajibkan penggunaan password yang kompleks (Uppercase, Numbers, Symbols) untuk mencegah akun mudah ditebak.
2. **HTTPS Mandatory:** Seluruh komunikasi token wajib melalui jalur terenkripsi HTTPS. Di level kode, server sudah disiapkan untuk mengenali *Proxy SSL* (`trust proxy`).
3. **Role-Based Access Control (RBAC):** Proteksi tingkat tinggi untuk endpoint sensitif.
4. **True Logout (Token Blacklist):** Menghilangkan risiko pencurian token setelah logout.
5. **Account Lockout:** Menghentikan serangan Brute Force.
