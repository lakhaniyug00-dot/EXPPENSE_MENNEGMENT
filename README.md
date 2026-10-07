# Expense Management System (MERN Stack)

A complete MERN stack (MongoDB, Express.js, React, Node.js) Expense Management Application featuring:
- **Rojmel (Daily Book)**: Daily Income/Expense entry, cascade renaming across all dates, master entries modal, date search across history.
- **Khata Book**: Multi-account ledger management with credit/debit transactions, automatic balance tracking.
- **Pagar (Payroll System)**: Daily & Fixed Karigar salary calculation across 4 views (Daily Slips, Daily Total, Fix Slips, Fix Total).

---

## 🚀 How to Run Locally

### 1. Prerequisites
- **Node.js**: v18+ installed
- **MongoDB**: Local MongoDB instance running on `mongodb://localhost:27017` OR a MongoDB Atlas cloud connection URI.

### 2. Run Backend
```bash
cd backend
npm install
npm start
```
The Express server will start at `http://localhost:5000` and connect to MongoDB.

### 3. Run Frontend
Open a second terminal window:
```bash
cd frontend
npm install
npm run dev
```
The React Vite app will run at `http://localhost:3000` (or `3001`).

---

## 🌐 Deploying Live Online

### Step 1: Set Up Cloud Database (MongoDB Atlas)
1. Go to [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas) and create a free account.
2. Create a free M0 cluster.
3. In **Network Access**, add IP `0.0.0.0/0` (allow access from anywhere).
4. In **Database Access**, create a user (e.g., `user` with a strong password).
5. Click **Connect** → **Drivers** and copy your MongoDB connection string:
   `mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/expense_management?retryWrites=true&w=majority`

### Step 2: Deploy Backend to Render.com (or Railway/Render/Cyclic)
1. Push your repository to GitHub.
2. Sign up at [render.com](https://render.com).
3. Create a **Web Service** and connect your GitHub repo.
4. Set **Root Directory**: `backend`
5. Set **Build Command**: `npm install`
6. Set **Start Command**: `npm start`
7. Under **Environment Variables**, add:
   - `MONGO_URI`: *Your MongoDB Atlas connection string from Step 1*
   - `PORT`: `5000`
8. Deploy! Render will give you a backend URL like `https://your-backend.onrender.com`.

### Step 3: Deploy Frontend to Vercel / Netlify
1. Build frontend for production or link repository to Vercel ([vercel.com](https://vercel.com)).
2. Import project, select `frontend` directory.
3. Set **Framework Preset**: Vite.
4. Under **Environment Variables**, add:
   - `VITE_API_URL`: `https://your-backend.onrender.com/api`
5. Deploy! Vercel will give you a production web URL.

---

## 📂 Project Structure

```
exppense_Managment/
├── backend/
│   ├── models/        # DayEntry, MasterEntry, Account, Config
│   ├── routes/        # API endpoints for days, masters, accounts, config
│   ├── server.js      # Express app setup & Mongo connection
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/       # Axios API client functions
│   │   ├── components/# MasterModal, SearchModal
│   │   ├── pages/     # Rojmel, Khata, Pagar
│   │   ├── utils.js   # Formatting & helper functions
│   │   ├── App.jsx    # React Router config
│   │   └── main.jsx   # Entry point
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## ✅ Verified & Bug-Free
- All data saved to MongoDB database (no reliance on local storage).
- Complete cascade update on worker/master renaming.
- Fast reactive React pages with responsive UI matching original design.
