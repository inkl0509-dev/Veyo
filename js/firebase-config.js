// 1. Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config.
// 2. Paste the values below. These keys are safe to commit: access is controlled by firestore.rules, not by hiding this file.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// App settings you can change.
export const SETTINGS = {
  currency: "MVR",
  timeZone: "Indian/Maldives",
  mapCenter: [4.1755, 73.5093],   // Malé. Used until you pin your office in Company settings.
  avgSpeedKmh: 22,                // Used to estimate arrival time from the technician's GPS position.
  gpsIntervalSec: 12              // How often a technician's phone sends its position while on a trip.
};
