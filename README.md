# 📝 TaskFlow - Modern & Simple To-Do List (DevOps Ready)

Aplikasi To-Do List berbasis web yang sangat ringan, dibangun menggunakan teknologi vanilla native (HTML, CSS, JS), backend **Node.js (Express)**, dan penyimpanan database **SQLite3**. 

Aplikasi ini dirancang dengan struktur bersih dan minimalis, siap untuk diintegrasikan dengan pipeline CI/CD (seperti GitHub Actions) serta siap dideploy ke server VPS Anda.

---

## ✨ Fitur Utama
- **CRUD Penuh**: Tambah, Tampilkan, Ubah Status (Toggle Selesai), dan Hapus Tugas.
- **Filter Pintar**: Menyaring tugas berdasarkan status: Semua, Belum Selesai, atau Selesai.
- **Auto-Database-Creation**: Server akan otomatis membuat file database (`database.sqlite`) dan tabelnya saat pertama kali dijalankan. Sangat ramah untuk proses otomatisasi DevOps!
- **UI Modern & Responsif**: Tampilan modern menggunakan kartu, efek transisi halus, dan responsif di semua ukuran layar (HP hingga Desktop).

---

## 📁 Struktur Proyek
Proyek ini memiliki struktur yang sangat bersih untuk kemudahan pemeliharaan dan deployment:
```text
cloudcomp/
├── .github/              # Alur kerja GitHub Actions (opsional untuk CI/CD)
├── public/               # File Statik Frontend
│   ├── index.html        # Kerangka Halaman Utama
│   ├── style.css         # Desain Modern (Vanilla CSS)
│   └── script.js         # Logika Frontend & Konsumsi API
├── .gitignore            # Mengabaikan node_modules & database lokal
├── database.sqlite       # Database SQLite (dibuat otomatis - diabaikan oleh git)
├── init-db.js            # Skrip Inisialisasi & Data Dummy Awal
├── package.json          # File konfigurasi dependensi & skrip Node.js
└── server.js             # Aplikasi Backend Utama (Express Server)
```

---

## 🚀 Cara Menjalankan Aplikasi di Komputer Lokal

### Langkah 1: Instalasi Dependensi
Pastikan Anda sudah menginstal [Node.js](https://nodejs.org/). Buka terminal di folder proyek ini dan jalankan perintah:
```bash
npm install
```
*Ini akan mengunduh paket Express, SQLite3, dan CORS secara otomatis.*

### Langkah 2 (Opsional): Mengisi Data Dummy Awal
Jika Anda ingin memulai aplikasi dengan beberapa tugas dummy siap pakai, jalankan perintah ini terlebih dahulu:
```bash
npm run init-db
```

### Langkah 3: Menjalankan Server Utama
Jalankan server aplikasi web dengan perintah:
```bash
npm start
```
Server akan aktif di: **[http://localhost:3000](http://localhost:3000)**. Silakan buka alamat tersebut di browser kesayangan Anda!

---

## ☁️ Kesiapan DevOps (Deployment & CI/CD)

1. **Port Konfigurasi Dinamis**:
   Server menggunakan port dinamis dari environment variable (`process.env.PORT || 3000`). Ini sangat kompatibel dengan server cloud seperti AWS, Heroku, Render, Vercel, maupun custom Docker container.
   ```bash
   # Contoh menjalankan dengan port berbeda di VPS
   PORT=8080 npm start
   ```

2. **Database SQLite yang Mandiri**:
   Database disimpan di dalam file lokal tunggal (`database.sqlite`). Aplikasi tidak memerlukan setup server database eksternal yang rumit (seperti MySQL/PostgreSQL), menjadikannya sangat mudah dimasukkan ke dalam container Docker atau dideploy langsung ke VPS kecil.

3. **Pipelines CI/CD (GitHub Actions)**:
   Karena kode aplikasi ini sangat murni dan menggunakan dependensi minimal, Anda dapat membuat workflow GitHub Actions untuk menguji integrasi atau langsung me-deploy kode ke VPS menggunakan SSH secara instan saat melakukan `git push`.
