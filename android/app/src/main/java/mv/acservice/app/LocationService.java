package mv.acservice.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

/**
 * Shares the technician's position during a trip. Runs as a foreground service with an ongoing
 * notification, so Android keeps it going with the screen off. Each position is handed to the
 * technician portal, which saves it on the job exactly as the website does. The portal stops the
 * service when the technician taps "I've arrived" (or the trip ends any other way).
 */
public class LocationService extends Service implements LocationListener {

    static volatile boolean running;
    private static final long MAX_TRIP_MS = 4L * 60 * 60 * 1000;   // same 4-hour limit as the portal

    private LocationManager locations;
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String label = intent != null && intent.getStringExtra("label") != null ? intent.getStringExtra("label") : "";
        long interval = intent != null ? intent.getLongExtra("interval", 12000) : 12000;

        Notification n = notification(label);
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(1, n);
        running = true;

        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "acservice:trip");
            wakeLock.acquire(MAX_TRIP_MS);
        }

        locations = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            locations.removeUpdates(this);
            boolean gps = locations.isProviderEnabled(LocationManager.GPS_PROVIDER);
            boolean network = locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
            if (gps) locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, interval, 15f, this, Looper.getMainLooper());
            if (network) locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, interval, 15f, this, Looper.getMainLooper());
            if (!gps && !network) {
                MainActivity.deliverLocationError("Turn on your phone's location so the customer can follow you.");
            } else {
                Location last = locations.getLastKnownLocation(gps ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER);
                if (last != null && System.currentTimeMillis() - last.getTime() < 60000) onLocationChanged(last);
            }
        } catch (SecurityException e) {
            MainActivity.deliverLocationError("Location is off for this app. Allow it in your phone's settings.");
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private Notification notification(String label) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, piFlags);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, "trip") : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Sharing your location")
                .setContentText((label.isEmpty() ? "" : label + " · ") + "The customer can follow you on the map.")
                .setOngoing(true)
                .setContentIntent(tap)
                .build();
    }

    @Override
    public void onLocationChanged(Location l) {
        MainActivity.deliverLocation(l.getLatitude(), l.getLongitude(), l.getAccuracy());
    }

    // Older Android versions call these, so they must exist.
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) {
        if (locations != null && !locations.isProviderEnabled(LocationManager.GPS_PROVIDER) && !locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
            MainActivity.deliverLocationError("Turn on your phone's location so the customer can follow you.");
    }

    @Override
    public void onDestroy() {
        running = false;
        if (locations != null) locations.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
