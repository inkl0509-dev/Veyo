// 1. Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config.
// 2. Paste the values below. These keys are safe to commit: access is controlled by firestore.rules, not by hiding this file.
export const firebaseConfig = {
  apiKey: "AIzaSyD3EcfZ9Sjo4M19_bZDQNajHQf2Jdk9X-M",
  authDomain: "veyo-36dbc.firebaseapp.com",
  projectId: "veyo-36dbc",
  storageBucket: "veyo-36dbc.firebasestorage.app",
  messagingSenderId: "1077941044759",
  appId: "1:1077941044759:web:8c8609130d2234dfc9fe52",
  measurementId: "G-9CF89VLC5M"
};
// App settings you can change.
export const SETTINGS = {
  currency: "MVR",
  timeZone: "Indian/Maldives",
  mapCenter: [4.1755, 73.5093],   // Malé. Used until you pin your office in Company settings.
  avgSpeedKmh: 22,                // Used to estimate arrival time from the technician's GPS position.
  gpsIntervalSec: 12,             // How often a technician's phone sends its position while on a trip.
  // Optional, for alerts while every portal is closed: Firebase console → Project settings → Cloud Messaging
  // → Web Push certificates → Generate key pair, and paste the key here. Also deploy the function in /functions.
  vapidKey: ""
};

