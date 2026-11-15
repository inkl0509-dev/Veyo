# AC Service Portal

A service platform for air-conditioning companies. **Many companies share one Firebase project and one website, and each one is completely separate:** its own address, customers, technicians, office accounts, jobs, chats, accounts, brand and settings. No company can see anything belonging to another. The database rules enforce this, not just the screens.

Each company (for example with the code `reefside`) has three portals:

| Portal | Address | Who | What they do |
|---|---|---|---|
| **Customer portal** | `/reefside` | Customers | Book a service, pin their location, approve quotations, follow the technician on a live map, pay invoices and rate the visit. |
| **Technician portal** | `/reefside/tech` | Technicians | Accept or take jobs, start a trip (the phone shares its GPS position), mark arrival, write the work report, chat with the office. |
| **Admin portal** | `/reefside/admin` | The company's office | Run the service desk, and control the other two portals. |

Plus the **platform portal** at `/platform`, for you as the platform owner: create a company, pause or reactivate it, change its owner's email before they set up, and copy its links. You never see a company's customers, jobs, chats or accounts.

### How companies are kept apart

- Everything a company owns is stored under `tenants/{company code}/…` in Firestore. Every rule checks that the person has an account **in that company**.
- **Sign-ins are separate per company.** The same person can be a customer of two companies; they get two separate profiles, and the browser keeps a separate sign-in for each company.
- Saved settings on the device (brand colours, last tab) are kept per company, so one company's colours never show for another.
- Notifications, alerts and the optional push function only ever go to people in the same company.
- A **paused** company's portals show "unavailable", and the database refuses all reads and writes for it until you reactivate it.
- The list of companies can only be read by the platform admin; a portal can only look up its own company.

The **admin portal** controls everything:

- **Service requests:** confirm appointments, send quotations, assign technicians, follow trips, send invoices, confirm payments, and take phone bookings with **New request**.
- **Customers:** add customers (with or without a portal login), book on their behalf, and pause or reactivate their login.
- **Team:** create technician logins and office staff logins, send password resets, pause or remove technicians.
- **Portal controls:** turn customer sign-up on or off, allow or block cancellations, show or hide the technician's phone number, choose the booking time windows and the earliest booking day, hide prices from technicians, and post a message at the top of the customer or technician portal. Changes reach both portals straight away.
- **Accounting** and **Company & services.**

**Every step sends a notification** to the other people on the job: a new request, appointment confirmed or changed, quotation sent, accepted or declined, technician assigned, on the way, arrived, work finished, invoice sent, payment made, receipt uploaded, payment confirmed or reversed, rating, new message and cancellation. Each portal shows them under the **bell** at the top, and as **alerts on the phone or computer** when the alert permission is turned on. See "Notifications and alerts" below.

**Location sharing stops when the technician arrives.** The route and last position are deleted from the job at that moment, and only the trip time and distance are kept. If a technician forgets to tap "I've arrived", sharing stops on its own after 4 hours and the location is deleted. The database rules refuse location updates after arrival.

**Your own brand.** In **Company & services → Brand: logo and colours**, upload your logo and pick a colour theme or your own two colours, with a live preview. After you save, all three portals use them: the sign-in pages, headers, buttons and links, quotations and invoices, the browser tab icon and title, and the icon people get when they add a portal to their phone's home screen. Very light colours are darkened automatically so text stays readable, and dark mode gets matching shades. Each device remembers the brand, so the portal opens in your colours straight away.

**Team chat between the office and technicians.** The admin portal has a **Team chat** tab with one private conversation per technician, and the technician portal has **Chat with office**. Customers never see it. A message can be linked to a job; the job number appears on the message and opens the job. Each message sends an alert to the other side, and unread conversations are marked. Job pages have a **Chat with … about this job** / **Message the office** button that opens the chat with that job already selected.

**Customers can upload a payment receipt** (photo, screenshot or PDF) when they pay by bank transfer, or add one later. The office opens it from the invoice with **View receipt**.

The **customer portal** is built for phones: a home screen that shows what needs attention (approve a quotation, pay an invoice, rate a visit) and the technician's live position, a five-step booking form with a price estimate, a page per request with one clear next step, and a bottom menu. Each portal can be added to the phone's home screen like an app.

Each portal keeps its own sign-in, so you can be signed in to the admin portal and test the customer portal in the same browser. Someone who signs in to the wrong portal is told which one to use. A paused account can't use its portal, and the database rules block its changes too.

Every invoice and payment is posted to a double-entry ledger automatically: sales, GST owed, money owed by customers, and cash or bank balances. The Accounting tab shows profit and loss, balances, an invoice list and the journal.

It is plain HTML, CSS and JavaScript with no build step. Data and logins are in **Firebase** (Authentication + Cloud Firestore, free Spark plan is enough to start). Hosting is on **Vercel**, deployed from **GitHub**.

```
index.html              customer portal         →  /{company}
tech.html               technician portal       →  /{company}/tech
admin.html              admin portal            →  /{company}/admin
platform.html           platform portal         →  /platform
js/platform.js          platform portal screens
css/styles.css          colours (each portal has its own header colours), layout, dark mode
js/firebase-config.js   your Firebase keys and app settings  ← edit this
js/core.js              shared: sign-in, database, job screens, maps, GPS, payments
js/customer.js          customer portal screens
js/technician.js        technician portal screens
js/admin.js             admin portal screens and controls
sw.js                   shows alerts and opens the right page when one is tapped
manifest-*.webmanifest  lets each portal be added to a phone's home screen
functions/              optional: push alerts while every portal is closed
firestore.rules         database security rules              ← publish these
firebase.json           lets the Firebase CLI deploy the rules
vercel.json             Vercel routes (/{company}, /{company}/tech, /{company}/admin, /platform) and headers
```

---

## One company for the whole site

The site runs one company: customers open **your-site.vercel.app**, technicians **/tech**, the office **/admin**. Nobody enters a company code.

**Already have a company with data?** Nothing is reset. Sign in once at your existing office link (for example `/veyo/admin`), or as platform admin at `/platform`. The site records that company (in `platform/site`) and from then on `/`, `/tech` and `/admin` open it with all its customers, requests and invoices. Old links such as `/veyo/tech` keep working. To switch to another company later, use **Use at main address** on `/platform`.

**Brand-new site, no company yet?** Open `/admin`: it shows **Set up your business** (business name, your name, mobile, email, password). Verify your email, and you're the owner. Then fill in **Company & services**: logo and colours, address, GST TIN, phone, BML and MIB accounts, GST rate and your services. That's the company everyone sees, on every portal, quotation and invoice. Do this straight after deploying: the first account set up there becomes the owner.

Publish the latest `firestore.rules` for this to work. Optional settings in `js/firebase-config.js`: `companyCode` forces a company by its code; `multiCompany: true` brings back several separate companies (each at `/{code}`, created on `/platform`).

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

On your computer the `/reefside/tech` style addresses need Vercel's routing, so use `?c=` instead: `/platform.html`, `/index.html?c=reefside`, `/tech.html?c=reefside`, `/admin.html?c=reefside`. `localhost` is already allowed to sign in.

## 3. Set up the platform and your first company

1. Open **`/platform`**. The first time, it asks you to create the **platform admin** account. Do this straight after deploying: the first person to do it becomes the platform admin.
2. **Create a company:** company name, company code (it becomes the address, for example `reefside`; lowercase letters, numbers and hyphens) and the **owner's email**.
3. Send the owner the **Office** link (`/reefside/admin`). They create an account with that exact email (or sign in with Google), open the verification email, tap **Continue** and enter their name and phone. They are now the company's first office account. Only that verified email can claim the company.

Then, in the company's admin portal:

1. Open **Company & services**: fill in address, GST TIN, BML / MIB account numbers, GST rate (8% general GST in the Maldives), payment terms, and pin your office on the map. Add your services and prices.
2. Open **Portal controls** and choose how the customer and technician portals behave.
3. Open **Team → Create a technician login** for each technician. Give them the email, temporary password and the `/reefside/tech` link; they can change the password with **Forgot password?**. Add office staff the same way.

**Customers** sign up on `/reefside` (unless you turn sign-up off), or you add them in **Customers**. Someone who opens the site without a company code is asked for one.

Repeat **Create a company** for each new company.

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

The addresses are then:

- `https://ac-service-portal.vercel.app/platform` for you
- `https://ac-service-portal.vercel.app/reefside` for Reefside's customers
- `https://ac-service-portal.vercel.app/reefside/tech` for Reefside's technicians
- `https://ac-service-portal.vercel.app/reefside/admin` for Reefside's office

The routes in `vercel.json` send `/{code}`, `/{code}/tech` and `/{code}/admin` to the right page. These codes are reserved and can't be used: tech, admin, platform, assets, css, js, functions, index, sw, api, www.

From now on, every `git push` to `main` redeploys automatically.

---

## Installing the portals on a phone (Add to Home Screen / Install)

Each portal installs as its own app: open **/customer** (or the main address), **/tech** or **/admin** in Chrome or Safari and choose **Install app** / **Add to Home Screen**. Each one only covers its own part of the site, so the Technician and Office icons always open their own portal.

**Installed before this update and an icon opens the wrong portal?** Remove those home-screen icons (long-press → Uninstall / Remove) and install again from the right address.

## Notifications and alerts

There are three levels. The first two work on the free Spark plan with no extra setup.

1. **The bell.** Every portal has a bell with an unread count. Tap a notification to open that request.
2. **Alerts on the device.** Tap **Turn on alerts** (under the bell, on the customer home screen, or in the customer Profile). The browser then shows an alert for each new notification while the portal is open, even in a background tab or with the phone's browser in the background.
   - **Android and computers:** works in Chrome, Edge and Firefox.
   - **iPhone and iPad (iOS 16.4 or later):** Apple only allows notifications for sites added to the Home Screen. The portal shows iPhone users a card with the steps: Safari → **Share → Add to Home Screen → Add**, open the new icon, sign in, tap **Turn on notifications**. The icon opens straight into that company's portal. Notifications while the app is closed need level 3 below (VAPID key + push function).
3. **Push alerts while every portal is closed** (optional). This needs a server, so it uses a Firebase Cloud Function and the **Blaze** (pay-as-you-go) plan. A small business stays well inside the free monthly allowance, but Google asks for a billing account.
   1. Firebase console → **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Paste the key into `vapidKey` in `js/firebase-config.js`.
   2. Upgrade the project to **Blaze**.
   3. Copy `functions/.env.example` to `functions/.env` and set `SITE_URL` (your Vercel address) and `REGION` (the same location as your Firestore database).
   4. Install the Firebase CLI and deploy:
      ```bash
      npm install -g firebase-tools
      firebase login
      firebase use --add            # pick your project
      cd functions && npm install && cd ..
      firebase deploy --only functions,firestore:rules
      ```
   5. Push to GitHub so Vercel redeploys with the VAPID key. Each person taps **Turn on alerts** once on each device.

## The company code is remembered

Each phone or computer remembers the last company it opened. Opening the site without a code (`/`, `/tech` or `/admin`), or the Home Screen icon, goes straight to that company's portal. To change company, sign out and tap **Use a different company** (or open `/?switch=1`). Signing out doesn't forget the company.

## Android apps (Customer, Technician, Office), with npm

The `mobile/` folder is an npm project (Capacitor 6) that builds three apps. Each has its own name, icon colour and app ID, so all three can be on the same phone:

| App | Opens | App ID | Icon | npm command |
|---|---|---|---|---|
| **ARA IRI Service** | Customer portal | `com.veyo.veyoservice` | blue | `npm run customer` |
| **ARA IRI Tech** | Technician portal, location sharing while the phone is locked | `com.veyo.veyoservice.tech` | orange | `npm run tech` |
| **ARA IRI Office** | Admin portal | `com.veyo.veyoservice.office` | navy | `npm run office` |

On first launch the app asks only for the **company code**, then opens that company's portal with its colours and logo. **Company** in the header changes it. The apps load your website, so website updates reach them at once; rebuild the apps only to change the app itself (name, icon, permissions).

### What you need once
1. **Node.js 18 or newer**: [nodejs.org](https://nodejs.org) (LTS).
2. **Java 17**: [Temurin 17](https://adoptium.net/temurin/releases/?version=17) (Windows: tick "Set JAVA_HOME").
3. **Android SDK**: easiest is to install [Android Studio](https://developer.android.com/studio) once and open it (it installs the SDK). Without Android Studio: download "Command line tools only", unzip to `C:\Android\cmdline-tools\latest`, then run `sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"` and `sdkmanager --licenses`, and set the environment variable `ANDROID_HOME=C:\Android`.

### Build and run
In a terminal (VS Code: **Terminal → New Terminal**):
```bash
cd mobile
npm install              # once, and after updates
npm run customer         # build, install on the phone (USB debugging on) and open the Customer app
npm run tech             # Technician app
npm run office           # Office app
npm run build            # test APKs of all three in mobile/dist/ (to send or install by hand)
npm run open             # open the project in Android Studio
npm run devices          # check the phone is connected
```
The first build downloads Gradle and the Android libraries, so it takes several minutes. In VS Code, **Ctrl+Shift+B** runs `npm run build`, and **Terminal → Run Task…** has all the commands.

**Your website address** is in `mobile/capacitor.config.json` → `plugins.ACService.siteUrl` (now `https://veyo-two.vercel.app`). The scripts keep `allowNavigation` in step with it.

**App names** can be changed with the environment variables `CUSTOMER_APP_NAME`, `TECH_APP_NAME`, `OFFICE_APP_NAME`, or in `mobile/android/app/build.gradle`.

### Play Store (App Bundles, .aab)
The apps target Android 16 (API 36), which Google Play requires for new apps and updates since 31 August 2026.

1. **Make your signing key once** (keep the file and passwords safe: without them you can't update the apps). In `mobile\android`:
   ```bash
   keytool -genkey -v -keystore acservice.jks -keyalg RSA -keysize 2048 -validity 10000 -alias acservice
   ```
   (`keytool` comes with Java. If it's "not recognized", use the full path, e.g. `"C:\Program Files\Eclipse Adoptium\jdk-17...\bin\keytool"`.)
2. Copy `mobile\android\keystore.properties.example` to `keystore.properties` and type the passwords you chose.
3. Before each upload, raise `VERSION_CODE` in `mobile\android\gradle.properties` by 1 (and `VERSION_NAME`, e.g. 1.0.1).
4. In `mobile`: `npm run release` → `dist\ac-customer-play-store.aab`, `ac-tech-play-store.aab`, `ac-office-play-store.aab`.
5. In Play Console create three apps (ARA IRI Service, ARA IRI Tech, ARA IRI Office) and upload each `.aab`, starting with **Testing → Internal testing**. Keep **Play App Signing** on (the default).

Play Console also asks for: a privacy policy link, the **Data safety** form (name, phone, email, address, location while a trip is shared, photos of receipts), content rating and target audience, and for **ARA IRI Tech** the **foreground service (location)** declaration: "Technicians share their live location with the customer during a service trip, shown by an ongoing notification" (Play may ask for a short video of it). New personal developer accounts may have to run a closed test with testers for some days before going to production; Play Console shows what's needed.

### Push notifications in the apps
1. Firebase console → **Project settings → Add app → Android** three times: `com.veyo.veyoservice`, `com.veyo.veyoservice.tech`, `com.veyo.veyoservice.office`.
2. Download `google-services.json` **after adding all three** and put it in `mobile/android/app/`.
3. Deploy the push function (see Notifications) and rebuild the apps.

If the file is missing one app, the build stops with "No matching client found for package name". Without the file the apps work, just without notifications while closed.

### Or let GitHub build them
**Actions → Android app → Run workflow** runs `npm install` and `npm run build` and gives `ac-customer-test.apk`, `ac-tech-test.apk`, `ac-office-test.apk` under Artifacts. Optional secrets: `GOOGLE_SERVICES_JSON` (the file's text), and for signed apps `KEYSTORE_BASE64` (`base64 -w0 acservice.jks`), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Push a tag such as `app-v1` to attach the files to a GitHub Release.

### Good to know
- Don't upload `mobile/node_modules`, `mobile/android/keystore.properties`, the `.jks` key or `google-services.json` to GitHub (git ignores them; leave them out when uploading by drag and drop).
- `npx cap sync` (run by every npm command) creates the files Gradle needs, so run an npm command before opening the project in Android Studio for the first time.
- Only the Technician app asks for location while locked. The Play Store asks why: "Technicians share their live location with the customer during a service trip, shown by an ongoing notification."
- Google sign-in is hidden in the apps (Google blocks it inside apps); people use email and password.
- Some phones (Xiaomi, Oppo, Huawei…) stop background apps to save battery. If a technician's location stops while locked, set the app's battery setting to **No restrictions**.

## Speed

The portals open from the phone's own copy first and then update live:
- **The last screen appears at once** on the second and later visits. It's shown while fresh data loads.
- Data is kept on the device (Firestore offline cache), so lists show before the network answers.
- The Firebase code and fonts are stored by the service worker, and the map loads only when a map is on screen.

Measured on a simulated mobile connection:

| | Before | Now |
|---|---|---|
| First visit, screen ready | 4.5 s | 2.8 s |
| Repeat visit, first screen | 1.8 s | 0.5 s |
| Repeat visit, live data | 2.1 s | 1.1 s |

Signing out clears the saved screen and cache from that device.

## Service reports and AC tools

**Service report.** When a technician finishes a job, they fill in the report:
- a checklist (filters, coils, drain, gas, electrical, test run)
- readings (gas, suction pressure, return and supply air, running current, voltage); the temperature drop is worked out automatically
- the condition after the service, work done, parts and advice
- when the next service is due (3, 4, 6 or 12 months)

The technician or the office taps **Send to customer**. The customer is notified, sees the report on the job page and can **Print or save as PDF** (the Android app opens Android's print screen). There is also a **WhatsApp** button that opens a message to the customer with a summary and a link. Technicians can edit a report until it's sent; the office can always edit it.

**Service reminders** (office → Tools & reminders) lists customers whose next service is due within 3 weeks or overdue, unless they have already booked again. **Send reminder** notifies them in the app. **WhatsApp** opens a ready-written message. **Book for them** creates the request. Customers also see "Your AC service is due" on their home screen.

**Tools** (office: Tools & reminders; technicians: Tools tab):
- **BTU calculator** from room size, ceiling height, sunlight, people, kitchen and roof. It uses about 600 BTU/h per m² for the Maldives climate. Customers can use it while booking ("Not sure? Work it out from the room size").
- **Pressure & superheat:** saturation temperature from suction pressure for R410A and R22, plus superheat from the suction line temperature, and a P-T table. For R32, use the gauge's R32 scale or the maker's chart.
- **Unit converter:** BTU/h, kW and tons; psi, bar, kPa and MPa; °C and °F.
- **Troubleshooting** guide and **service intervals** with healthy readings.

The calculators are guides. Technicians should follow the manufacturer's data for charging.

## Quotations and invoices for customers without the app

In **Service requests**, tap **+ Quotation / invoice**:
1. Choose **Quotation** or **Invoice**.
2. Find the customer by typing part of their name, phone or island (only matches are shown), or tap **+ New customer** to add them (saved without a portal login).
3. Add lines from your services or as custom lines, with any discount and notes, and create it.

Each one is saved as a request (marked as direct), so it appears in the list and the customer's history.
- **⤓ Save PDF** saves a real PDF file (in the Android apps: to the phone's Downloads folder).
- **Send PDF** / **Send as photo** make the file and open the phone's share screen: pick WhatsApp and the customer, and it goes as a PDF document or a picture. On a computer without a share screen, the file is saved and WhatsApp opens: attach it with 📎.
- The files are made on the device (html2canvas and jsPDF from cdnjs, loaded only when needed and then kept for offline use). Service reports have the same buttons.
- Rebuild the Android apps once (`npm run build`) to get file saving and sharing in them. Until then, the apps open the print screen instead: choose **Save as PDF** there.
- For a quotation, record the customer's answer with **Customer accepted / declined**, then create the invoice from it (the lines are copied).
- Creating an invoice posts the sale, GST and the amount owed to Accounting. When the money comes in, open **Record payment received**, choose cash, BML, MIB or card, add the reference, and it's posted to that account automatically. The invoice then shows **PAID**, ready to save or send as a receipt.

Customers who do use the portal can also save their quotations and invoices as PDF.

## Customers without an account (guests)

The customer portal opens on a welcome page: **Request a service** (no account), **Create account** or **Sign in**. A guest taps what's wrong, enters their name, mobile and address, and sends the request. Behind the scenes Firebase gives them a guest login on that phone, so they can still follow the technician, get the quotation and pay. Throughout the portal they're shown why an account is worth it, and **Create account** keeps everything they've done (same login, now with email and password). The office sees them in Customers with a **Guest** tag.

**Turn it on:** Firebase console → Authentication → Sign-in method → **Anonymous** → Enable. Without it, "Request a service" asks people to create an account instead. Guest requests follow the "Customers can sign up" switch in Portal controls. Publish the latest `firestore.rules` too.

Customers never see service prices: they choose what's wrong, and the price comes in the office's quotation.

## Office: finishing jobs and sharing links

If a technician forgets to mark a job done, the office can do it at any stage, even after the invoice is sent or paid.
Those jobs show **"Mark the job done (technician didn't)"** in *Needs you*, and the job page opens with a red box at the
top: add what was done (optional) and tap **Mark job done**. When you record or confirm a payment, the
**"Also mark the job done"** box (ticked by default) closes the job in the same step. The job then moves to
*Finished* in the technician's app, location sharing stops, and the work report shows "Marked done by Office".

- **Job done but not marked in the technician app?** Open the request: **Job done but not marked in the technician app? → Mark job done**. Fill in the checklist and work done if you know them. It records the job as finished, stops the technician's location sharing and tells the customer and technician. Then send the invoice as usual.
- **After adding a customer**, a window opens with a ready message: their portal link (and login email and password, if you made a login). Edit it if you like and tap **WhatsApp**, **Viber** or **Copy**. WhatsApp opens the chat with their number.
- **Customers → Share link** on any customer, or **Share portal link** at the top, does the same at any time.

## Updates

When you upload a new version, open portals and apps notice within a few minutes (or when they're opened again) and show **Update available → Update**, which reloads with the new version. Website-only changes reach the phone apps this way too; rebuild the apps only when the `mobile` folder changes.

## Deleting mistakes (office)

Every delete asks for a second tap, and Accounting stays balanced:
- **Delete invoice** (on the request, or in Accounting → Invoices): removes the invoice, its payment and receipt, and their journal entries. The request goes back to "Send the invoice".
- **Delete quotation**: removes the quotation (only while no invoice has been made from it).
- **Delete this request permanently**: removes the request with its quotation, invoice, payments, messages and journal entries. For test entries and mistakes; **Cancel** keeps a record instead.
- **Accounting → Journal → Delete**: removes an entry such as a wrong expense. Deleting an invoice's entry deletes that invoice; deleting a payment entry marks the invoice unpaid again.

Publish the latest `firestore.rules` (the office may now delete a request's messages).

## Deleting logins

**Delete** (Team → technicians and office staff; Customers → "Delete login") removes the person from your company **and deletes their Firebase sign-in**, so the same email can be registered again. A customer's requests, invoices and history stay. A login that's also used in another company on the platform only leaves your company; its sign-in is kept.

This needs the `manageLogin` Cloud Function (in `functions/index.js`, Blaze plan):
```bash
firebase deploy --only functions
```
Without it, **Delete** pauses the login instead and tells you to finish in Firebase console → Authentication → Users.

**Logins deleted before this update** (sign-in still exists, so "email already in use"):
- Creating a technician, staff or customer login with that email reuses the old sign-in with the new password (once the function is deployed).
- A customer who registers again with their old password is signed in and added straight away; if they forgot it, **Forgot password?** sets a new one.
- Or delete the old sign-in in Firebase console → Authentication → Users.

If your functions run in another region than `asia-south1`, set `functionsRegion` in `js/firebase-config.js` to the same value as `REGION` in `functions/.env`.

## Speed and updates

The portals open from a copy saved on the phone or computer (the service worker in `sw.js`), so after the first
visit they appear at once, even on a slow connection, and the saved data fills in straight away. Every time a
portal opens, a fresh copy is fetched in the background. When it's new, an **Update available** bar appears;
**Update** loads the new version (otherwise it's used the next time the portal opens). If a portal ever can't start
(for example a half-finished upload), it clears its saved copy and reloads once by itself.

A service request is sent once, however many times **Send request** is tapped or the network drops: the button
shows "Sending…" until it's saved, and a retry reuses the same request instead of making a second one.

## Inventory (office)

Office portal → **Inventory**. **Publish the new `firestore.rules`** first (Firebase console → Firestore → Rules),
or the tab can't load.

- **+ New item**: name, unit (pcs, kg, m…), category, selling price and the "low stock" level. If you already have
  some, enter the quantity and cost: it's added as opening stock.
- **+ Buy stock**: one supplier bill with one or more items, quantities and cost each, and where it was paid from
  (cash, BML, MIB or the owner's own money). Stock goes up, the average cost is updated, and Accounting gets
  Stock (1200) against the cash or bank account.
- **Use it on a job**: in any quotation or invoice, **+ Add from stock** adds the item at its selling price. The editor
  shows how many are left (red if not enough). **Sending the invoice** takes them out of stock and moves their cost
  from Stock to Parts & refrigerant, so profit is right. **Deleting the invoice** (or the job) puts them back.
- **Adjust**: after counting, or for damaged / lost items. Enter the real quantity; the difference is posted at average cost.
- **History**: every purchase, use and adjustment. **Undo** removes a purchase (the whole bill), an adjustment or
  opening stock, with its Accounting entry.
- Items at or below their low level show **Low** and are counted on the Inventory tab.

Costs are office-only: customers and technicians never see stock or cost prices.

## Accounts reports (PDF and Excel)

Office portal → **Accounting** → **Download accounts report**. Pick a period (This month, Last month, This year,
All time) or type your own From and To dates, then tap **PDF** or **Excel**.

Both files hold: a summary (revenue, expenses, net profit, GST, money paid by customers, unpaid invoices),
profit and loss, GST (charged, paid to MIRA, still owed), every invoice in the period with the customer's TIN and
whether it's paid, expenses, the trial balance at the end date, and the full journal.

- **PDF**: your logo and company details on top, page numbers, ready to print or send to your accountant.
- **Excel (.xlsx)**: one sheet for each part, real numbers and dates, totals as formulas, so you can filter
  and add up in Excel, Google Sheets or Numbers.

In the Android Office app the file goes to **Downloads** (rebuild the app if it only offers print).

## Payment receipts

Receipts are saved inside the Firestore database (`jobs/{id}/files/receipt`), so you don't need Cloud Storage or the Blaze plan. Photos are shrunk automatically to well under 1 MB. PDFs must be under 700 KB; for a larger PDF, the customer can upload a screenshot instead. Only the customer and the office can open a receipt.

## How the job flow works

| Step | Who | What happens |
|---|---|---|
| Book | Customer | Taps what's wrong (not cooling, leaking…) and sees the common reasons, with "Our technician will check and let you know which service is needed". Choosing a service is optional ("I already know which service I want"); without one the request is an "AC check-up". Then units, date and time window, address. Gets a number like `SR-1001`. |
| Schedule | Office | Confirms date and time, with an optional reply message. |
| Quote | Office | Builds a quotation from the service list (`Q-2026-0001`). Customer accepts or declines with a reason. |
| Assign | Office | Either **sends the job to one technician**, who gets an alert and must **accept** or **decline** (with a reason), or **offers it to every technician**: all of them get an alert, and the first to tap **Take this job** gets it. Until then, open jobs show technicians the work, area and time, but not the exact address or phone number. When a technician accepts or takes a job, the office and the customer are notified. If they decline, the office is notified and the request is flagged "Technician declined: assign again". |
| Travel | Technician | Taps **Start trip**. The phone's GPS position is saved every ~12 seconds; customer and office see it on the map with distance and arrival estimate. |
| Arrive | Technician | Taps **I've arrived** (the portal reminds them when they're within 150 m). Location sharing stops and the route is deleted; the trip time and distance are kept. |
| Work | Technician | Taps **Mark job finished** with the work report and parts used. |
| Invoice | Office | Sends the invoice (`INV-2026-0001`) and picks the allowed payment methods. Posted to the ledger: receivable / revenue / GST. |
| Pay | Customer | **BML or MIB transfer:** copies the account number, amount and reference with one tap, then enters the bank reference, uploads the receipt, or both. It's posted to the bank account immediately and flagged for the office to verify (or reverse). **Cash or card on site:** waits until the office confirms it was received. |
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

- **On the website, location sharing needs the page open.** Browsers pause GPS when the phone locks. The page asks to keep the screen awake while on a trip. Technicians who use the Android app don't have this limit.
- **Location only works over HTTPS** (Vercel and `localhost` are fine).
- **No card gateway yet.** "Card on site" means the technician's own card machine; the office confirms it. To take card payments online, add a gateway such as BML's merchant service through a small server function (for example a Vercel serverless function or Firebase Cloud Function) that marks the invoice paid from the gateway's callback.
- **Bank transfers are trusted until checked.** The customer's reference is posted straight away so the books update automatically; the office sees **Verify bank transfer** and can reverse it if the money didn't arrive.
- **Maps** use OpenStreetMap tiles, which are free for light use. For heavy traffic, switch the tile URL in `createMap()` in `js/core.js` to a provider such as MapTiler or Mapbox.
- **Backups:** turn on Firestore scheduled backups (Firestore → Disaster recovery) once you have real data.
- **Indexes:** none are needed; all queries are single-field.
- **Upgrading from the single-company version:** data saved before this version sits outside `tenants/`, and the new rules don't allow access to it. Create the company on the platform and enter its data again. If you have real data to move, ask for a one-off migration.
- **Removing a company completely:** pause it on the platform. Deleting its data permanently is done in Firebase console → Firestore → `tenants/{code}` → Delete document (choose to include subcollections).
- **Removing logins completely:** pausing or removing someone in the admin portal blocks them from the portals and the database. To delete the sign-in itself, use Firebase console → Authentication → Users.
- **Technicians never see amounts.** The technician portal shows only "Invoice raised", "To collect" (cash or card on site) and "Paid", with no quotation, invoice or amount. They're notified when the invoice is raised and when the job is paid. Prices are hidden on screen; the job record still holds them, so if that matters, split prices into a separate office-only collection.
