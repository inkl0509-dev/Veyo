package mv.acservice.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * The whole app is one screen: the AC Service portals in a web view, plus the phone features a website
 * can't use on its own — location sharing with the screen off, push notifications, the camera for
 * receipts, phone calls and maps. The portals talk to the app through window.AndroidApp (see Bridge).
 */
public class MainActivity extends Activity {

    static final String PREFS = "app";
    private static final int REQ_LOCATION_PAGE = 1, REQ_LOCATION_TRIP = 2, REQ_NOTIFY = 3, REQ_FILE = 10;

    /** The activity on screen, so the location and push services can hand data to the page. */
    static volatile MainActivity current;
    static volatile boolean visible;

    WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private String pendingTripLabel = "";
    private long pendingTripInterval = 12000;
    private String lastUrl;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        current = this;
        createChannels();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // saved settings, instant screen, brand
        s.setDatabaseEnabled(true);            // Firestore keeps its copy of the data here
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " ACServiceApp/" + BuildConfig.VERSION_NAME + " ACRole/" + BuildConfig.ROLE);
        // Keep the page running at normal priority while a trip is shared with the screen off.
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (saved != null && web.restoreState(saved) != null) return;
        load(startUrl(getIntent()));
    }

    private String site() { return BuildConfig.SITE_URL; }

    private String absolute(String u) {
        if (u == null || u.isEmpty()) return null;
        return u.startsWith("/") ? site() + u : u;
    }

    /** A tapped notification opens its request or chat; otherwise the portal chosen last time, or the start page. */
    private String startUrl(Intent i) {
        String fromNotification = i != null ? absolute(i.getStringExtra("url")) : null;
        if (fromNotification != null) return fromNotification;
        String home = getSharedPreferences(PREFS, MODE_PRIVATE).getString("home", "");
        return site() + (home.isEmpty() ? "/app.html?role=" + BuildConfig.ROLE : home);
    }

    private void load(String url) {
        lastUrl = url;
        web.loadUrl(url);
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        String u = absolute(i.getStringExtra("url"));
        if (u != null) load(u);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        current = this;
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onPause() {
        super.onPause();
        visible = false;
        CookieManager.getInstance().flush();
        // While a trip is being shared the page must keep running in the background.
        if (!LocationService.running) web.onPause();
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // ---------------------------------------------------------------- notifications

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel updates = new NotificationChannel("updates", "Updates", NotificationManager.IMPORTANCE_HIGH);
        updates.setDescription("Bookings, quotations, technician on the way, invoices, payments and messages");
        nm.createNotificationChannel(updates);
        NotificationChannel trip = new NotificationChannel("trip", "Trip sharing", NotificationManager.IMPORTANCE_LOW);
        trip.setDescription("Shown while your location is shared with a customer");
        nm.createNotificationChannel(trip);
    }

    private boolean granted(String permission) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS))
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
    }

    // ---------------------------------------------------------------- calls from the services into the page

    private static void runInPage(String js) {
        MainActivity a = current;
        if (a == null) return;
        a.runOnUiThread(() -> { if (a.web != null) a.web.evaluateJavascript(js, null); });
    }

    static void deliverLocation(double lat, double lng, float accuracy) {
        runInPage("window.__nativeLocation&&window.__nativeLocation(" + lat + "," + lng + "," + accuracy + ")");
    }

    static void deliverLocationError(String message) {
        runInPage("window.__nativeLocationError&&window.__nativeLocationError(" + JSONObject.quote(message) + ")");
    }

    static void deliverPushToken(String token) {
        runInPage("window.__nativePushToken&&window.__nativePushToken(" + JSONObject.quote(token) + ")");
    }

    // ---------------------------------------------------------------- trips

    void startTrip(String label, long intervalMs) {
        if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
            pendingTripLabel = label;
            pendingTripInterval = intervalMs;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION_TRIP);
            return;
        }
        askNotifications();   // so the "sharing your location" notice is visible
        Intent i = new Intent(this, LocationService.class)
                .putExtra("label", label == null ? "" : label)
                .putExtra("interval", Math.max(5000, intervalMs));
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
        else startService(i);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == REQ_LOCATION_PAGE && geoCallback != null) {
            geoCallback.invoke(geoOrigin, ok, false);
            geoCallback = null;
        } else if (code == REQ_LOCATION_TRIP) {
            if (ok) startTrip(pendingTripLabel, pendingTripInterval);
            else deliverLocationError("Location is off for this app. Allow it in your phone's Settings → Apps → " + getString(R.string.app_name) + " → Permissions.");
        } else if (code == REQ_NOTIFY) {
            PushService.fetchToken(this);
        }
    }

    // ---------------------------------------------------------------- file uploads (receipts, logos)

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != REQ_FILE || fileCallback == null) return;
        Uri[] picked = null;
        if (result == RESULT_OK) {
            if (data != null && (data.getData() != null || data.getClipData() != null)) {
                picked = WebChromeClient.FileChooserParams.parseResult(result, data);
            } else if (cameraUri != null) {
                picked = new Uri[]{cameraUri};   // photo taken with the camera
            }
        }
        fileCallback.onReceiveValue(picked);
        fileCallback = null;
        cameraUri = null;
    }

    private Intent fileIntent(WebChromeClient.FileChooserParams params) {
        List<String> types = new ArrayList<>();
        boolean images = false;
        for (String t : params.getAcceptTypes()) {
            for (String part : t.split(",")) {
                part = part.trim();
                if (part.isEmpty()) continue;
                if (part.startsWith(".")) part = part.equals(".pdf") ? "application/pdf" : "image/*";
                types.add(part);
                if (part.startsWith("image")) images = true;
            }
        }
        if (types.isEmpty()) { types.add("*/*"); images = true; }

        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType(types.size() == 1 ? types.get(0) : "*/*");
        if (types.size() > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));

        Intent chooser = Intent.createChooser(pick, "Add a file");
        if (images) {
            try {
                File dir = new File(getCacheDir(), "captures");
                if (!dir.exists()) dir.mkdirs();
                File photo = new File(dir, "photo-" + System.currentTimeMillis() + ".jpg");
                cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", photo);
                Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            } catch (Exception e) {
                cameraUri = null;
            }
        }
        return chooser;
    }

    // ---------------------------------------------------------------- offline

    private boolean online() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        NetworkInfo n = cm != null ? cm.getActiveNetworkInfo() : null;
        return n != null && n.isConnected();
    }

    private void showOffline() {
        String retry = lastUrl != null ? lastUrl : site() + "/app.html";
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:90vh;text-align:center;padding:24px;color:#0C2233;background:#F1F6FA'>"
                + "<h2 style='margin:0 0 8px'>You're offline</h2><p style='color:#526C80;max-width:300px'>Check your internet connection, then try again.</p>"
                + "<a href=" + JSONObject.quote(retry) + " style='margin-top:12px;padding:12px 22px;border-radius:10px;background:#0077B6;color:#fff;text-decoration:none;font-weight:bold'>Try again</a></body>";
        web.loadDataWithBaseURL(site(), html, "text/html", "utf-8", retry);
    }

    // ---------------------------------------------------------------- web view

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            String host = Uri.parse(site()).getHost();
            // The portals themselves stay in the app.
            if ((scheme.equals("https") || scheme.equals("http")) && host != null && host.equalsIgnoreCase(u.getHost())) return false;
            if (scheme.equals("blob") || scheme.equals("data") || scheme.equals("about")) return false;
            // Calls, email, Google Maps directions and other websites open in the phone's own apps.
            try {
                Intent i = scheme.equals("tel") ? new Intent(Intent.ACTION_DIAL, u) : new Intent(Intent.ACTION_VIEW, u);
                startActivity(i);
            } catch (ActivityNotFoundException e) {
                // nothing on the phone can open it
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (url != null && url.startsWith("http")) lastUrl = url;
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame() && !online()) showOffline();
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (granted(Manifest.permission.ACCESS_FINE_LOCATION)) {
                callback.invoke(origin, true, false);
                return;
            }
            geoOrigin = origin;
            geoCallback = callback;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION_PAGE);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(fileIntent(params), REQ_FILE);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
        }
    }

    // ---------------------------------------------------------------- window.AndroidApp

    /** Called by the portals' JavaScript (js/core.js, js/app.js). */
    private class Bridge {
        /** Remember the portal chosen on the start page, so the app opens it directly next time. */
        /** Which app this is: "customer", "technician" or "admin" (office). */
        @JavascriptInterface
        public String role() { return BuildConfig.ROLE; }

        @JavascriptInterface
        public void setHome(String path) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("home", path == null ? "" : path).apply();
        }

        /** Match the status bar to the company's brand colour. */
        @JavascriptInterface
        public void setStatusBarColor(String hex) {
            runOnUiThread(() -> {
                try { getWindow().setStatusBarColor(Color.parseColor(hex)); } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public boolean notificationsEnabled() {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            return nm != null && nm.areNotificationsEnabled() && PushService.available(MainActivity.this);
        }

        /** Ask to show notifications (Android 13+) and hand this phone's push token to the page. */
        @JavascriptInterface
        public void requestPushToken() {
            runOnUiThread(() -> {
                askNotifications();
                PushService.fetchToken(MainActivity.this);
            });
        }

        /** Start sharing the technician's location; keeps going with the screen off until stopTracking. */
        @JavascriptInterface
        public void startTracking(String label, long intervalMs) {
            if (!"technician".equals(BuildConfig.ROLE)) return;   // only the Technician app has the location service
            runOnUiThread(() -> startTrip(label, intervalMs));
        }

        @JavascriptInterface
        public void stopTracking() {
            runOnUiThread(() -> stopService(new Intent(MainActivity.this, LocationService.class)));
        }

        /** Service reports: Android's print screen, which can also save a PDF. */
        @JavascriptInterface
        public void print(String name) {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                if (pm == null) return;
                String job = name == null || name.isEmpty() ? "Service report" : name;
                pm.print(job, web.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
            });
        }
    }
}
