# 💰 Expense Management System

A **Dynamic** multi-user Expense, Khata Ledger & Payroll Management System — works on any PC or phone with full cross-device data sync via MongoDB.

---

## ✨ Features

- 📅 **Custom Accounting Year** — Set any date range (e.g. Diwali to Diwali)
- 📒 **Rojmel (Daily Expense Book)** — Day-by-day income/expense tracking
- 📖 **Khata Ledger** — Party-wise credit/debit management
- 💼 **Pagar Book** — Monthly payroll for workers/employees
- 👥 **Multi-User** — Create separate accounts (valam, rahul, etc.)
- 🌐 **Cross-Device Sync** — Open on any PC or phone; data is the same everywhere
- 📱 **Mobile Responsive** — Fully optimized for phones
- 🌙 **Dark / Light Theme** — Auto-detects system preference

---

## 🚀 Quick Start (Dynamic Mode — Recommended)

> **Dynamic mode** stores all your data in MongoDB. Open on any PC or phone and your data is always there.

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up MongoDB

**Option A — Free MongoDB Atlas (Cloud, works from any network)**

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) → Create free cluster
2. Get your connection string (looks like `mongodb+srv://user:pass@cluster.mongodb.net/expense_management`)
3. Create a `.env` file in the project root:

```env
MONGO_URI=mongodb+srv://youruser:yourpass@yourcluster.mongodb.net/expense_management
PORT=5000
```

**Option B — Local MongoDB (same computer only)**

```env
MONGO_URI=mongodb://127.0.0.1:27017/expense_management
PORT=5000
```

### 3. Start the Server

```bash
npm start
```

### 4. Open in Browser

```
http://localhost:5000
```

From another PC or phone on the same network:
```
http://YOUR_PC_IP:5000
```
(The server prints the exact URL when it starts)

---

## 📁 Project Structure

```
├── server.js        ← Node.js + Express backend (API + file serving)
├── api.js           ← Frontend bridge for dynamic backend sync
├── package.json
├── .env             ← Your MongoDB URI (not committed to git)
│
├── index.html       ← App entry point (opens Rojmel directly)
├── dilyex.html      ← Rojmel daily expense book (with 1-Click Multi-Account & Cloud Sync)
├── khata.html       ← Khata ledger
└── pagar.html       ← Pagar payroll system
```

---

## 🗄️ API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server & DB status |
| GET | `/api/accounts` | List all user accounts |
| POST | `/api/accounts` | Create a new account |
| DELETE | `/api/accounts/:username` | Delete an account |
| GET | `/api/data/:username` | Get all data for a user |
| GET | `/api/data/:username/:key` | Get specific data key |
| POST | `/api/data/:username/:key` | Save a data key |
| POST | `/api/data/:username/batch` | Batch save multiple keys |
| DELETE | `/api/data/:username/:key` | Delete a data key |

---

## 💾 Offline / Static Mode

If you open the HTML files directly (without running `npm start`), the app works entirely with `localStorage`. Data is stored only on that device/browser.

The **status badge** in the top bar shows:
- 🟢 **Dynamic (MongoDB)** — Server connected, data syncs everywhere
- ⚪ **Local Storage** — Offline mode, data on this device only

---

## 🔒 Notes

- No passwords — accounts are identified by name (valam, rahul, etc.)
- `.env` file is **not committed** to git (keep your MongoDB URI safe)
- `node_modules/` is excluded from git — run `npm install` after cloning

---

## 📦 Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (via Mongoose)
- **Fonts**: Google Fonts (Inter, Outfit, JetBrains Mono)
