# Panduan lengkap (Bahasa Indonesia)

Agent pencari kerja pribadi: tiap pagi mencari lowongan, menilai kecocokan dengan CV Anda memakai AI, membuat draf CV/cover letter/email untuk yang cocok, lalu mengirim ringkasan ke Telegram. Ada bot Telegram untuk tanya-jawab, kirim PDF, dan kirim lamaran via email **setelah Anda konfirmasi**. Tidak ada auto-apply ke portal.

Cocok untuk profesi apa pun — DevOps, security, data, backend, keuangan, marketing — cukup ubah 3 file.

Waktu setup: ±30–45 menit. Biaya: GitHub & Cloudflare gratis; OpenAI ±Rp50–130 ribu/bulan.

---

## 1. Yang perlu disiapkan

| Akun | Untuk apa | Gratis? |
| --- | --- | --- |
| GitHub | menyimpan kode, data lowongan, dan menjalankan scan harian | Ya |
| OpenAI (platform.openai.com) | menilai lowongan & menulis draf | Bayar per pemakaian, isi saldo min. US$5 |
| Telegram | notifikasi & bot | Ya |
| Cloudflare (dash.cloudflare.com) | bot interaktif + dashboard web, tanpa server | Ya, tanpa kartu kredit |
| Gmail (opsional) | membaca email LinkedIn Job Alert, mengirim lamaran | Ya |

Di laptop: **Node.js 22+** (nodejs.org) dan **Git**.

---

## 2. Buat repo dari template

1. Buka halaman template ini di GitHub → tombol hijau **Use this template** → **Create a new repository**.
2. Nama: `career`. Visibility: **Private** (wajib — nanti berisi CV dan draf lamaran Anda).
3. Clone ke laptop:
   ```
   git clone https://github.com/USERNAME/career.git
   cd career
   npm install
   ```

---

## 3. Isi profil Anda (3 file)

### `profile/cv.md`
Tulis CV Anda dalam Markdown mengikuti contoh yang ada. **Penting:** AI hanya boleh memakai fakta yang tertulis di sini; jangan mengarang angka.

### `profile/preferences.yaml`
```yaml
candidate_name: Nama Lengkap Anda
target_titles: [Security Engineer, SOC Analyst, Cloud Engineer]   # ganti sesuai profesi
seniority: [mid, senior]          # junior | mid | senior | lead
countries_allowed: [Indonesia]
priority_order: [remote, wfh, hybrid, jakarta_onsite, other_indonesia_onsite]
min_salary_idr_month: 10000000
output_language: English           # bahasa CV/cover letter yang dihasilkan
```

### `sources.yaml`
- Entri **Jobstreet** dan **Kalibrr**: ganti `keywords` dengan kata kunci profesi Anda (mis. `[security engineer, soc analyst, "penetration tester"]`).
- Papan karier perusahaan: tambah/hapus baris. Provider yang didukung: `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `workable`, `workday`, `manatal`, `kalibrr` (company_code). Cari slug-nya di URL halaman karier perusahaan (mis. `boards.greenhouse.io/xendit` → slug `xendit`).
- `enabled: false` untuk mematikan sumber.

Lalu commit & push:
```
git add -A
git commit -m "my profile"
git push
```

---

## 4. Buat bot Telegram (3 menit)

1. Buka Telegram, cari **@BotFather** → kirim `/newbot` → beri nama → beri username (harus diakhiri `bot`, mis. `budi_jobscan_bot`).
2. BotFather membalas dengan **token** berbentuk `123456789:AAH...` → ini `TELEGRAM_BOT_TOKEN`. Simpan, jangan dibagikan.
3. Cari bot Anda (username tadi) → tekan **Start** → kirim `halo`. (Tanpa Start, bot tidak bisa mengirim pesan ke Anda.)
4. Cari **@userinfobot** → tekan Start → ia membalas `Id: 123456789` → ini `TELEGRAM_CHAT_ID`.

---

## 5. Key OpenAI

1. platform.openai.com → **API keys** → **Create new secret key** → salin (hanya ditampilkan sekali).
2. **Billing** → isi saldo minimal US$5. Tanpa saldo, penilaian akan error `insufficient_quota`.

---

## 6. (Opsional) LinkedIn Job Alert lewat Gmail

LinkedIn tidak bisa di-scan langsung (butuh login, melanggar ToS). Cara legalnya: LinkedIn mengirim email job alert ke Gmail, agent membaca emailnya.

1. Di LinkedIn → Jobs → buat **Job alert** untuk tiap judul posisi, lokasi Indonesia dan Remote, frekuensi harian, kirim via email.
2. Di Gmail yang menerima alert: Google Account → **Security** → aktifkan **2-Step Verification** → buka https://myaccount.google.com/apppasswords → buat App Password bernama `career-agent` → salin 16 huruf → ini `GMAIL_APP_PASSWORD`; `GMAIL_USER` = alamat Gmail.
3. Catatan: App Password memberi akses penuh ke mailbox. Lebih aman pakai Gmail khusus lamaran.

---

## 7. Masukkan secret ke GitHub

Repo `career` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, satu per satu:

| Nama | Nilai |
| --- | --- |
| `OPENAI_API_KEY` | key OpenAI |
| `TELEGRAM_BOT_TOKEN` | token dari BotFather |
| `TELEGRAM_CHAT_ID` | angka dari @userinfobot |
| `GMAIL_USER` | (opsional) alamat Gmail |
| `GMAIL_APP_PASSWORD` | (opsional) 16 huruf App Password |

---

## 8. Jalankan scan pertama

1. Repo → tab **Actions** → **daily job scan** → **Run workflow** → **Run**.
2. Tunggu 5–10 menit. Ringkasan lowongan masuk ke Telegram; draf muncul di folder `applications/` di repo.
3. Selanjutnya otomatis tiap hari 08:00 WIB (ubah jam di `.github/workflows/daily.yml`, baris `cron`, dalam UTC).

Arti lambang: 🟢 fit ≥ 4,5 sangat cocok · 🟡 4–4,4 cocok · ⚪ di bawah 4 info saja. Hanya lowongan **baru** yang dikirim setiap hari.

---

## 9. Bot interaktif + dashboard web (Cloudflare Workers)

Supaya Anda bisa bertanya ke bot ("loker remote paling cocok minggu ini?"), minta PDF, dan mengirim lamaran, botnya harus "hidup" — di sini dijalankan gratis di Cloudflare Workers, tanpa server dan tanpa kartu kredit.

1. Daftar di https://dash.cloudflare.com/sign-up (email + password).
2. Buat **GitHub token** untuk bot: https://github.com/settings/personal-access-tokens/new → *Repository access*: Only select repositories → `career` → *Permissions*: **Contents: Read-only** dan **Actions: Read and write** → Generate → salin.
3. Di terminal (PowerShell), di folder repo:
   ```
   npx wrangler login          # browser terbuka → Allow
   .\scripts\setup-worker.ps1
   ```
   Skrip menanyakan: token bot, chat ID, key OpenAI, GitHub token. Lalu deploy, memasang secret, mendaftarkan webhook Telegram, dan mencetak **link dashboard** (`https://career-bot.NAMA.workers.dev/?k=...`). Simpan link itu — kuncinya privat.
   - Kalau muncul "register a workers.dev subdomain": buka dash.cloudflare.com → Workers & Pages → pilih nama subdomain, lalu jalankan skrip lagi.
4. Uji: kirim `/top` ke bot Anda di Telegram.

Mac/Linux: jalankan manual `npx wrangler deploy`, lalu `npx wrangler secret put NAMA` untuk tiap secret (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, OPENAI_API_KEY, GITHUB_TOKEN, WEBHOOK_SECRET, DASH_KEY), lalu daftarkan webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<worker>/telegram&secret_token=<WEBHOOK_SECRET>`.

### Perintah bot
| Perintah | Fungsi |
| --- | --- |
| `/top [n]` | paling cocok (remote dulu, lalu skor, lalu terbaru) |
| `/baru` | ditemukan 2 hari terakhir |
| `/remote` | remote / WFH / hybrid saja |
| `/cari kata` | cari judul/perusahaan |
| `/pdf <id>` | kirim CV + cover letter PDF dari draf ke chat (±2 menit) |
| `/kirim <id> <email>` | tampilkan pratinjau; balas `/ya <id> <email>` untuk benar-benar mengirim email + 2 PDF dari Gmail Anda |
| teks bebas | dijawab AI dari daftar lowongan saat ini |

`id` ada di akhir tiap baris hasil `/top`. Fitur `/kirim` butuh `GMAIL_USER`/`GMAIL_APP_PASSWORD` di GitHub Secrets. Uji dulu ke email sendiri.

### Dashboard
Buka link dari skrip di browser: filter skor, umur lowongan, remote saja, yang sudah ada draf; klik kartu untuk melihat alasan cocok dan gap. Datanya sama dengan yang di Telegram, diperbarui tiap 10 menit.

---

## 10. Alur harian Anda

1. Pagi: baca ringkasan Telegram.
2. Pilih yang 🟢/🟡 → `/pdf <id>` → unduh → lamar lewat link lowongan (atau `/kirim` bila lamaran via email).
3. Catat status di `data/tracker.tsv` (bot mencatat otomatis untuk `/kirim`).
4. Seminggu kemudian follow-up.

---

## 11. Menyesuaikan untuk profesi lain

| Yang diubah | File |
| --- | --- |
| Judul posisi, level, kata kunci | `profile/preferences.yaml` |
| Kata kunci pencarian & papan karier | `sources.yaml` |
| Filter judul awal (regex) | `src/scan.js` → `TITLE_RE` |
| Rubrik penilaian ("apa artinya skor 5") | `src/score.js` → `SYSTEM` |
| Batas draf/hari, skor minimum, umur maksimal | env `DRAFT_LIMIT`, `MIN_FIT`, `MAX_AGE_DAYS` di workflow |

---

## 12. Masalah umum

| Gejala | Penyebab & solusi |
| --- | --- |
| Telegram tidak menerima apa pun | belum tekan Start di bot; chat ID salah; cek log Actions |
| `insufficient_quota` | saldo OpenAI kosong |
| `GMAIL_USER/GMAIL_APP_PASSWORD not set` | secret belum diisi (sumber LinkedIn dilewati, bukan error) |
| `Invalid credentials` (Gmail) | App Password salah atau 2-Step Verification belum aktif |
| `/pdf` atau `/kirim` error "Actions: write" | GitHub token belum punya izin Actions read/write |
| Halaman dashboard 404 | kunci `?k=` salah atau hilang |
| Lowongan luar negeri lolos | perketat `countries_allowed` / rubrik `in_scope` di `src/score.js` |
