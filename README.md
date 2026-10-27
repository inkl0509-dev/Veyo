# AC Service Portal

Three separate portals for an air-conditioning service business, each with its own address, sign-in and look:

| Portal | Address | Who | What they do |
|---|---|---|---|
| **Customer portal** | `/` | Customers | Book a service, pin their location, approve quotations, follow the technician on a live map, pay invoices and rate the visit. |
| **Technician portal** | `/tech` | Technicians | See assigned jobs, start a trip (the phone shares its GPS position), mark arrival and write the work report. |
| **Admin portal** | `/admin` | You and office staff | Run the service desk, and control the other two portals. |

The **admin portal** controls everything:

- **Service requests:** confirm appointments, send quotations, assign technicians, follow trips, send invoices, confirm payments, and take phone bookings with **New request**.
- **Customers:** add customers (with or without a portal login), book on their behalf, and pause or reactivate their login.
- **Team:** create technician logins and office staff logins, send password resets, pause or remove technicians.
- **Portal controls:** turn customer sign-up on or off, allow or block cancellations, show or hide the technician's phone number, choose the booking time windows and the earliest booking day, hide prices from technicians, and post a message at the top of the customer or technician portal. Changes reach both portals straight away.
- **Accounting** and **Company & services.**

Each portal keeps its own sign-in, so you can be signed in to the admin portal and test the customer portal in the same browser. Someone who signs in to the wrong portal is told which one to use. A paused account can't use its portal, and the database rules block its changes too.

Every invoice and payment is posted to a double-entry ledger automatically: sales, GST owed, money owed by customers, and cash or bank balances. The Accounting tab shows profit and loss, balances, an invoice list and the journal.

It is plain HTML, CSS and JavaScript with no build step. Data and logins are in **Firebase** (Authentication + Cloud Firestore, free Spark plan is enough to start). Hosting is on **Vercel**, deployed from **GitHub**.

```
index.html              customer portal         →  /
tech.html               technician portal       →  /tech
admin.html              admin portal            →  /admin
css/styles.css          colours (each portal has its own header colours), layout, dark mode
js/firebase-config.js   your Firebase keys and app settings  ← edit this
js/core.js              shared: sign-in, database, job screens, maps, GPS, payments
js/customer.js          customer portal screens
js/technician.js        technician portal screens
js/admin.js             admin portal screens and controls
firestore.rules         database security rules              ← publish these
firebase.json           lets the Firebase CLI deploy the rules
vercel.json             Vercel headers (location permission, caching)
```

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**. Name it (for example `ac-service-portal`). Google Analytics is optional.
2. **Add a web app.** On the project overview click the **</>** (Web) icon, give it a nickname, and click **Register app**. You don't need Firebase Hosting.
   Copy the `firebaseConfig` values it shows into `js/firebase-config.js`.
3. **Turn on sign-in.** Go to **Build → Authentication → Get started → Sign-in method**, then enable:
   - **Email/Password**
   - **Google** (choose a support email)
4. **Create the database.** Go to **Build → Firestore Database → Create database**.
   - Location: `asia-south1 (Mumbai)` or `asia-southeast1 (Singapore)` are closest to the Maldives. You can't change it later.
   - Start in **production mode**.
5. **Publish the security rules.** In Firestore, open the **Rules** tab, delete what's there, paste the whole of `firestore.rules`, and click **Publish**.
   (Or with the Firebase CLI: `npm i -g firebase-tools`, `firebase login`, `firebase use --add`, `firebase deploy --only firestore:rules`.)

## 2. Try it on your computer

Browsers block ES modules from `file://`, so serve the folder:

```bash
cd ac-service-portal
npx serve .            # or: python3 -m http.server 5500
```

Open the addresses it prints: `/` for customers, `/tech` for technicians, `/admin` for you (with `python3 -m http.server`, use `/tech.html` and `/admin.html`). `localhost` is already allowed to sign in.

## 3. Set yourself up in the admin portal

1. Open **`/admin`** and click **Set up your business**. This only appears while no office account exists, so the first account created here becomes the main office account.
2. Open **Company & services**: fill in address, GST TIN, BML / MIB account numbers, GST rate (8% general GST in the Maldives), payment terms, and pin your office on the map. Add your services and prices.
3. Open **Portal controls** and choose how the customer and technician portals behave.
4. Open **Team → Create a technician login** for each technician. Give them the email, temporary password and the `/tech` link; they can change the password with **Forgot password?**. Add office staff the same way.

**Customers** sign up on `/` (unless you turn sign-up off), or you add them in **Customers**.

## 4. Put the code on GitHub

Create an empty repository on <https://github.com/new> (no README), then:

```bash
cd ac-service-portal
git init
git add .
git commit -m "AC service portal"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ac-service-portal.git
git push -u origin main
```

The Firebase web config in `js/firebase-config.js` is not a secret; access is controlled by the Firestore rules. It's fine in a public repository.

## 5. Deploy on Vercel

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. **Import** the `ac-service-portal` repository.
3. Settings: **Framework preset: Other**. Leave **Build command** empty and **Output directory** as the default (the repository root).
4. Click **Deploy**. You get an address like `https://ac-service-portal.vercel.app`.
5. **Allow that address to sign in:** Firebase console → **Authentication → Settings → Authorized domains → Add domain** → paste `ac-service-portal.vercel.app` (and your own domain if you add one in Vercel → Settings → Domains).

Your three portals are then:

- `https://ac-service-portal.vercel.app/` for customers
- `https://ac-service-portal.vercel.app/tech` for technicians
- `https://ac-service-portal.vercel.app/admin` for you

Vercel's `cleanUrls` setting (in `vercel.json`) serves `tech.html` at `/tech` and `admin.html` at `/admin`. If you'd rather use separate subdomains (for example `tech.yourcompany.mv`), add them as domains in Vercel and add a redirect, and add each one to Firebase's authorized domains.

From now on, every `git push` to `main` redeploys automatically.

---

## How the job flow works

| Step | Who | What happens |
|---|---|---|
| Book | Customer | Picks services, units, AC type, BTU, date and time window, pins the location. Gets a number like `SR-1001`. |
| Schedule | Office | Confirms date and time, with an optional reply message. |
| Quote | Office | Builds a quotation from the service list (`Q-2026-0001`). Customer accepts or declines with a reason. |
| Assign | Office | Picks a technician. |
| Travel | Technician | Taps **Start trip**. The phone's GPS position is saved every ~12 seconds; customer and office see it on the map with distance and arrival estimate. |
| Work | Technician | Taps **I've arrived**, then **Mark job finished** with the work report and parts used. |
| Invoice | Office | Sends the invoice (`INV-2026-0001`) and picks the allowed payment methods. Posted to the ledger: receivable / revenue / GST. |
| Pay | Customer | **BML or MIB transfer:** enters the bank reference; it's posted to the bank account immediately and flagged for the office to verify (or reverse). **Cash or card on site:** waits until the office confirms it was received. |
| Rate | Customer | 1 to 5 stars and feedback; shows on the technician's card. |

Every step writes to the job's activity log, and customer, office and technician can message each other on the job.

### Chart of accounts

| Code | Account | | Code | Account |
|---|---|---|---|---|
| 1000 | Cash on hand | | 4000 | Service revenue |
| 1010 | BML bank account | | 5000 | Parts & refrigerant |
| 1020 | MIB bank account | | 5100 | Technician wages |
| 1030 | Card settlements | | 5200 | Fuel & boat transport |
| 1100 | Accounts receivable | | 5300 | Rent & utilities |
| 2100 | GST payable | | 5900 | Other expenses |
| 3000 | Owner's equity | | | |

Edit `ACCTS` and `METHODS` at the top of `js/core.js` to change them.

## Settings

In `js/firebase-config.js`:

- `currency` — shown on all amounts (default `MVR`).
- `timeZone` — used for dates and "today" (default `Indian/Maldives`).
- `mapCenter` — where maps open before locations are pinned (default Malé).
- `avgSpeedKmh` — used for the arrival estimate.
- `gpsIntervalSec` — how often a technician's phone sends its position.

Colours are CSS variables at the top of `css/styles.css` (`--lagoon`, `--teal`, `--coral`, `--mango`, `--orchid`, and the header gradient `--hero-a` / `--hero-b`).

## Things to know before going live

- **Location sharing needs the page open.** Browsers pause GPS when the phone locks or the technician switches app. The page asks to keep the screen awake while on a trip. For tracking in the background you'd need a native app (for example wrapping this site with Capacitor).
- **Location only works over HTTPS** (Vercel and `localhost` are fine).
- **No card gateway yet.** "Card on site" means the technician's own card machine; the office confirms it. To take card payments online, add a gateway such as BML's merchant service through a small server function (for example a Vercel serverless function or Firebase Cloud Function) that marks the invoice paid from the gateway's callback.
- **Bank transfers are trusted until checked.** The customer's reference is posted straight away so the books update automatically; the office sees **Verify bank transfer** and can reverse it if the money didn't arrive.
- **Maps** use OpenStreetMap tiles, which are free for light use. For heavy traffic, switch the tile URL in `createMap()` in `js/core.js` to a provider such as MapTiler or Mapbox.
- **Backups:** turn on Firestore scheduled backups (Firestore → Disaster recovery) once you have real data.
- **Indexes:** none are needed; all queries are single-field.
- **Removing logins completely:** pausing or removing someone in the admin portal blocks them from the portals and the database. To delete the sign-in itself, use Firebase console → Authentication → Users.
- **Hidden prices are hidden on screen only.** With "Technicians see amounts" turned off, the technician portal doesn't show prices, but the job record still holds them. If that matters, split prices into a separate office-only collection.
