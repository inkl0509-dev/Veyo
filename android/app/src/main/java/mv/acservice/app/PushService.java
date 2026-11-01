package mv.acservice.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Push notifications. The portal saves this phone's token on the signed-in account; the push function
 * in /functions sends every step (new job, technician on the way, invoice, message…) to it.
 * While the app is closed or in the background, Android shows the notification by itself and tapping
 * it opens the request. While the app is open, the portal shows the update on screen instead.
 */
public class PushService extends FirebaseMessagingService {

    /** False when the app was built without google-services.json (push not set up yet). */
    static boolean available(Context c) {
        try { return !FirebaseApp.getApps(c).isEmpty(); } catch (Throwable t) { return false; }
    }

    static void fetchToken(Context c) {
        if (!available(c)) return;
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) MainActivity.deliverPushToken(task.getResult());
        });
    }

    @Override
    public void onNewToken(String token) {
        MainActivity.deliverPushToken(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        if (MainActivity.visible) return;   // the open portal already shows it
        Map<String, String> data = message.getData();
        RemoteMessage.Notification n = message.getNotification();
        String title = n != null && n.getTitle() != null ? n.getTitle() : data.get("title");
        String body = n != null && n.getBody() != null ? n.getBody() : data.get("body");
        if (title == null) return;

        Intent open = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("url", data.get("url"));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent tap = PendingIntent.getActivity(this, (int) System.currentTimeMillis(), open, flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, "updates") : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(tap);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        String tag = data.get("itemId");
        if (nm != null) nm.notify(tag, 0, b.build());
    }
}
