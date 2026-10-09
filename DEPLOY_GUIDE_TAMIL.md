# 🚀 GST Billing Pro — Cloudflare Pages & Supabase Deployment Guide
### 100% Free Hosting + Multi-tenant SaaS + Razorpay Payments

இந்த project-ஐ **Cloudflare Pages** மற்றும் **Supabase** மூலம் முற்றிலும் இலவசமாக deploy செய்து பணம் சம்பாதிக்க தொடங்குங்கள்.

---

## 📌 படி 1: Supabase Setup (Database & Auth)

1. [https://supabase.com](https://supabase.com) -க்கு சென்று **Free Account** create செய்யவும்.
2. **New Project** உருவாக்கவும்:
   - Name: `gst-billing-pro`
   - Database Password: ஒரு வலுவான password கொடுக்கவும்.
   - Region: `South Asia (Mumbai)` தேர்ந்தெடுக்கவும்.
3. **Database Schema Setup**:
   - இடதுபக்க மெனுவில் **SQL Editor** செல்லவும்.
   - இந்த project-ல் உள்ள `supabase-setup.sql` கோப்பின் அனைத்து வரிகளையும் நகலெடுத்து (copy), SQL Editor-ல் paste செய்து **Run** கிளிக் செய்யவும்.
   - இது தேவையான அனைத்து அட்டவணைகள் (Tables), RLS Policies, Functions, Triggers ஆகியவற்றை தானாக அமைக்கும்.
4. **API Keys எடுக்கவும்**:
   - **Project Settings** → **API** பகுதிக்கு செல்லவும்:
     - `Project URL` (VITE_SUPABASE_URL)
     - `anon public` key (VITE_SUPABASE_ANON_KEY)
     - `service_role` secret key (Server Functions-க்கு மட்டும்)
5. **Auth Configuration**:
   - **Authentication** → **URL Configuration** செல்லவும்:
     - Site URL: உங்கள் Cloudflare Pages URL (உதா: `https://gst-billing-pro.pages.dev`)

---

## 📌 படி 2: Razorpay Setup (₹99 Subscription)

1. [https://dashboard.razorpay.com](https://dashboard.razorpay.com) சென்று Log in செய்யவும்.
2. **Settings** → **API Keys** சென்று **Generate Key** கொடுக்கவும்:
   - `Key ID` (உதா: `rzp_live_...` அல்லது test-க்கு `rzp_test_...`)
   - `Key Secret`
3. **Webhooks Setup** (Optional, auto-renewals-க்கு):
   - **Settings** → **Webhooks** → **Add New Webhook**:
     - Webhook URL: `https://your-domain.pages.dev/api/razorpay-webhook`
     - Secret: ஒரு ரகசிய வார்த்தை அமைக்கவும் (RAZORPAY_WEBHOOK_SECRET)
     - Alert Events: `payment.captured`

---

## 📌 படி 3: Cloudflare Pages Deployment (Free Hosting)

### முறை 1: GitHub வழியாக (பரிந்துரைக்கப்படுகிறது)
1. இந்த code-ஐ உங்கள் GitHub-ல் புதிய Private/Public repo-வாக push செய்யவும்:
   ```bash
   git init
   git add .
   git commit -m "GST Billing Pro SaaS setup"
   git remote add origin https://github.com/YOUR_USERNAME/gst-billing-pro.git
   git push -u origin main
   ```
2. [https://dash.cloudflare.com](https://dash.cloudflare.com) சென்று:
   - **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
   - உங்கள் GitHub repo-வை தேர்ந்தெடுக்கவும்.
3. **Build settings**:
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
4. **Environment Variables** (Cloudflare Dashboard → Settings → Environment variables):
   | Variable | Value | குறிப்பு |
   |---|---|---|
   | `VITE_SUPABASE_URL` | `https://xyz.supabase.co` | Frontend |
   | `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Frontend |
   | `VITE_RAZORPAY_KEY_ID` | `rzp_live_...` | Frontend |
   | `SUPABASE_URL` | `https://xyz.supabase.co` | Cloudflare Function |
   | `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Cloudflare Function |
   | `RAZORPAY_KEY_ID` | `rzp_live_...` | Cloudflare Function |
   | `RAZORPAY_KEY_SECRET` | உங்கள் Secret | Cloudflare Function |
   | `RAZORPAY_WEBHOOK_SECRET` | உங்கள் Webhook Secret | Cloudflare Function |
5. **Save and Deploy** கிளிக் செய்யவும்! 2 நிமிடத்தில் உங்கள் தளம் நேரலையில் வரும்! 🎉

---

## 📌 படி 4: உங்கள் தளத்தில் பயனர்கள் எப்படி பயன்படுத்துவார்கள்?

1. பயனர்கள் உங்கள் இணையதளத்திற்கு வருவார்கள் (`https://your-app.pages.dev`).
2. **Register Free** மூலம் மின்னஞ்சல் கொடுத்து கணக்கு தொடங்குவார்கள்.
3. உடனடியாக **30 நாட்கள் இலவச சோதனை காலம் (Free Trial)** தொடங்கும்.
4. அவர்கள் தங்கள் நிறுவனப் பெயர், லோகோ, GSTIN போன்றவற்றை உள்ளிட்டு இன்வாய்ஸ்களை உருவாக்கலாம்.
5. 30 நாட்கள் முடிந்தவுடன், **₹99/மாத சந்தா** திரை தோன்றும். Razorpay (UPI, Google Pay, Cards) மூலம் செலுத்தியதும் கணக்கு அடுத்த 30 நாட்களுக்கு நீட்டிக்கப்படும்.

---

## 💻 Desktop .EXE App தயார் செய்வது எப்படி? (Electron)

பயனர்களுக்கு Windows-ல் Install செய்ய .EXE setup கொடுக்க:
1. `npm install -D electron electron-builder concurrently`
2. உங்கள் Cloudflare Pages URL-ஐ `mainWindow.loadURL('https://your-app.pages.dev')` என Electron window-ல் load செய்தால், ஒரு நிமிடத்தில் Windows .EXE தயாராகிவிடும்! எந்த புதிய அப்டேட்டும் பயனர்கள் மீண்டும் டவுன்லோட் செய்யாமல் தானாகவே இணையதளத்திலிருந்து நேரலையாக கிடைக்கும்!
