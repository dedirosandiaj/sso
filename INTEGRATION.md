# Panduan Integrasi API Login SSO

## Base URL

```
http://localhost:3000
```

Sesuaikan host dan port sesuai dengan tempat API di-deploy.

---

## Alur Autentikasi

1. Pengguna mengirimkan kredensial ke `POST /api/auth/login`
2. API memvalidasi kredensial dan mengembalikan **token JWT**
3. Aplikasi menyimpan token tersebut (localStorage, sessionStorage, atau penyimpanan aman di mobile)
4. Aplikasi mengirimkan token di header `Authorization: Bearer <token>` untuk setiap permintaan yang dilindungi

---

## Endpoint

### 1. Login

**POST** `/api/auth/login`

#### Body Permintaan

```json
{
  "email": "user@example.com",
  "password": "passwordAnda"
}
```

Atau login menggunakan nama:

```json
{
  "username": "John Doe",
  "password": "passwordAnda"
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
      "name": "John Doe",
      "email": "user@example.com",
      "role": "user",
      "status": true
    }
  }
}
```

#### Respons Gagal (401)

```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

### 2. Ambil Data Pengguna Saat Ini (Dilindungi)

**GET** `/api/auth/me`

#### Header

```
Authorization: Bearer <token>
```

#### Respons Sukses (200)

```json
{
  "success": true,
  "data": {
    "id": "d45b3bdc-87f2-46f5-ac3a-2966d4936a3e",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "user",
    "status": true
  }
}
```

#### Respons Gagal (401 / 403)

```json
{
  "success": false,
  "message": "Access token is required"
}
```

---

### 3. Verifikasi Token

**POST** `/api/auth/verify`

#### Body Permintaan

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
    "email": "user@example.com",
    "name": "John Doe",
    "iat": 1713792000,
    "exp": 1714396800
  }
}
```

---

## Contoh Integrasi

### Web (JavaScript / Fetch)

```javascript
// Login
async function login(email, password) {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();

  if (data.success) {
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
  }
  return data;
}

// Ambil data pengguna
async function getUser() {
  const token = localStorage.getItem('token');
  const res = await fetch('http://localhost:3000/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// Logout
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
```

### Contoh React

```jsx
import { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  const login = async (email, password) => {
    const res = await fetch('http://localhost:3000/api/auth/login', {
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
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### Aplikasi Mobile (React Native)

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';

async function login(email, password) {
  const res = await fetch('http://IP_API_ANDA:3000/api/auth/login', {
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

async function getUser() {
  const token = await AsyncStorage.getItem('token');
  const res = await fetch('http://IP_API_ANDA:3000/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
```

### Perintah cURL untuk Testing

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Ambil data pengguna saat ini
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer TOKEN_ANDA_DISINI"

# Verifikasi token
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_ANDA_DISINI"}'
```

---

## Kode Error

| Status | Pesan | Arti |
|--------|-------|------|
| 400 | Email or username is required | Identitas pengguna tidak dikirim |
| 400 | Password is required | Password tidak dikirim |
| 401 | Invalid credentials | Email/password salah atau pengguna tidak ditemukan |
| 401 | Access token is required | Header Authorization tidak ada |
| 403 | Invalid or expired token | Token tidak valid atau sudah expired |
| 404 | User not found | Token valid tetapi pengguna sudah dihapus |
| 500 | Internal server error | Masalah pada database atau server |

---

## Masa Berlaku Token

Masa berlaku token default adalah **7 hari**. Setelah expired, pengguna harus login ulang. Bisa diubah di file `.env`:

```env
JWT_EXPIRES_IN=7d
```

Format yang didukung: `60` (detik), `10h` (jam), `7d` (hari).

---

## Catatan Keamanan

- Selalu gunakan **HTTPS** di production
- Simpan token dengan aman (jangan simpan di cookie tanpa `HttpOnly`)
- Aplikasi mobile harus menggunakan penyimpanan aman (Keychain / Keystore)
- JWT secret di file `.env` harus diganti dengan string random yang kuat di production
