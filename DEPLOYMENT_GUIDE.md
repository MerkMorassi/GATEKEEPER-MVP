# GateKeeper Production Deployment Guide

GateKeeper is a full-stack Node.js + Express + React application designed for high-performance deployment on any cloud server or VPS.

---

## 🚀 Quick Deployment Options

### Option 1: Docker (Recommended - Any VPS / Cloud Host)
You can deploy GateKeeper using the included production `Dockerfile`.

```bash
# 1. Build the Docker image
docker build -t gatekeeper-app .

# 2. Run the container on port 3000 (or mapped port)
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -v gatekeeper_data:/app/data \
  -e DATA_DIR=/app/data \
  --name gatekeeper \
  gatekeeper-app
```

---

### Option 2: Linux VPS / Ubuntu / Node.js Server (PM2)

#### 1. System Requirements
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher

#### 2. Installation & Build
```bash
# Clone or unzip repository into your server directory
cd /var/www/gatekeeper

# Install production dependencies
npm install

# Build static frontend and bundled server file (dist/server.cjs)
npm run build
```

#### 3. Start with PM2
```bash
# Install PM2 globally if not installed
npm install -g pm2

# Start server using PM2
pm2 start npm --name "gatekeeper" -- start

# Save PM2 process list to auto-start on server reboot
pm2 save
pm2 startup
```

---

### Option 3: One-Click Cloud Hosting (Render / Railway / Fly.io / Heroku)

1. **Build Command**: `npm run build`
2. **Start Command**: `npm start` (or `node dist/server.cjs`)
3. **Environment Variables**:
   - `NODE_ENV`: `production`
   - `PORT`: (Auto-assigned by hosting provider, defaults to 3000)
   - `PAYPAL_CLIENT_ID`: (Your PayPal Sandbox or Live Client ID)
   - `PAYPAL_CLIENT_SECRET`: (Your PayPal Client Secret)
   - `PAYPAL_MODE`: `sandbox` or `live`

---

## 🛠️ Verification & Troubleshooting

### Test Server Build Locally Before Deploying:
Run this on your machine to verify the production bundle:
```bash
npm run build
npm start
```
Open `http://localhost:3000` in your browser.

### Common Issues & Solutions:
1. **"Cannot find module dist/server.cjs"**:
   - Run `npm run build` first to bundle `server.ts` into `dist/server.cjs`.
2. **"Port 3000 in use"**:
   - Pass `PORT=8080 npm start` or configure your host's dynamic `PORT` environment variable.
3. **Database File Location**:
   - By default, `gatekeeper_db.json` is stored in the root directory. To specify a custom persistent disk path on your server, set the `DATA_DIR=/var/data` environment variable.
