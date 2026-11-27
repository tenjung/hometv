package com.hometv.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * GitHub 릴리스(태그 app-vX.Y)에서 새 APK를 찾아 알려 주고 설치 화면까지 연다.
 * 마지막 설치 확인은 Android 정책상 사용자가 직접 누른다.
 */
final class Updater {
    static final String ACTION_INSTALL_STATUS = "com.hometv.app.INSTALL_STATUS";
    private static final String TAG_PREFIX = "app-v";

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean busy;

    Updater(Activity activity) {
        this.activity = activity;
    }

    /** manual=true면 최신일 때도 알려 준다. */
    void check(boolean manual) {
        if (busy) return;
        busy = true;
        if (manual) toast("업데이트를 확인하고 있어요…");
        new Thread(() -> {
            try {
                Release r = latestRelease();
                main.post(() -> {
                    busy = false;
                    if (r != null && newer(r.version, BuildConfig.VERSION_NAME)) offer(r);
                    else if (manual) toast("최신 버전이에요. (현재 " + BuildConfig.VERSION_NAME + ")");
                });
            } catch (Exception e) {
                main.post(() -> {
                    busy = false;
                    if (manual) toast("업데이트를 확인하지 못했어요: " + e.getMessage());
                });
            }
        }).start();
    }

    private static final class Release {
        String version, notes, apkUrl;
        long size;
    }

    private Release latestRelease() throws Exception {
        String json = new String(get("https://api.github.com/repos/" + BuildConfig.UPDATE_REPO + "/releases?per_page=15"), "UTF-8");
        JSONArray list = new JSONArray(json);
        for (int i = 0; i < list.length(); i++) {
            JSONObject rel = list.getJSONObject(i);
            String tag = rel.optString("tag_name");
            if (rel.optBoolean("draft") || rel.optBoolean("prerelease") || !tag.startsWith(TAG_PREFIX)) continue;
            JSONArray assets = rel.optJSONArray("assets");
            if (assets == null) continue;
            for (int j = 0; j < assets.length(); j++) {
                JSONObject a = assets.getJSONObject(j);
                if (a.optString("name").toLowerCase().endsWith(".apk")) {
                    Release r = new Release();
                    r.version = tag.substring(TAG_PREFIX.length());
                    r.notes = rel.optString("body", "");
                    r.apkUrl = a.getString("browser_download_url");
                    r.size = a.optLong("size", -1);
                    return r;
                }
            }
        }
        return null;
    }

    private static byte[] get(String url) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            c.disconnect();
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "HomeTV-App/" + BuildConfig.VERSION_NAME);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        int code = c.getResponseCode();
        if (code != 200) throw new Exception("HTTP " + code);
        return c;
    }

    /** "1.10" > "1.9" 처럼 점으로 나눈 숫자를 비교한다. */
    static boolean newer(String remote, String local) {
        String[] a = remote.split("\\."), b = local.split("\\.");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int x = i < a.length ? parseInt(a[i]) : 0, y = i < b.length ? parseInt(b[i]) : 0;
            if (x != y) return x > y;
        }
        return false;
    }

    private static int parseInt(String s) {
        try {
            return Integer.parseInt(s.replaceAll("[^0-9]", ""));
        } catch (Exception e) {
            return 0;
        }
    }

    private void offer(Release r) {
        if (activity.isFinishing()) return;
        String notes = r.notes.trim().isEmpty() ? "" : "\n\n" + (r.notes.length() > 600 ? r.notes.substring(0, 600) + "…" : r.notes);
        new AlertDialog.Builder(activity)
                .setTitle("새 버전이 있어요")
                .setMessage("현재 " + BuildConfig.VERSION_NAME + " → 새 버전 " + r.version + notes)
                .setPositiveButton("업데이트", (d, w) -> install(r))
                .setNegativeButton("나중에", null)
                .show();
    }

    private void install(Release r) {
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(activity)
                    .setTitle("설치 권한이 필요해요")
                    .setMessage("다음 화면에서 '이 출처 허용'을 켠 뒤, 뒤로가기로 돌아와 다시 업데이트를 눌러 주세요.")
                    .setPositiveButton("설정 열기", (d, w) -> activity.startActivity(new Intent(
                            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.getPackageName()))))
                    .setNegativeButton("취소", null)
                    .show();
            return;
        }
        ProgressBar bar = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        FrameLayout box = new FrameLayout(activity);
        int pad = Math.round(24 * activity.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(bar);
        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("새 버전 " + r.version + " 받는 중")
                .setView(box)
                .setCancelable(false)
                .show();
        new Thread(() -> {
            try {
                PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                int id = installer.createSession(params);
                try (PackageInstaller.Session session = installer.openSession(id)) {
                    HttpURLConnection c = open(r.apkUrl);
                    long total = r.size > 0 ? r.size : c.getContentLengthLong();
                    try (InputStream in = c.getInputStream(); OutputStream out = session.openWrite("hometv.apk", 0, total > 0 ? total : -1)) {
                        byte[] buf = new byte[65536];
                        long done = 0;
                        int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n);
                            done += n;
                            if (total > 0) {
                                int p = (int) (done * 100 / total);
                                main.post(() -> bar.setProgress(p));
                            }
                        }
                        session.fsync(out);
                    } finally {
                        c.disconnect();
                    }
                    Intent status = new Intent(activity, MainActivity.class).setAction(ACTION_INSTALL_STATUS)
                            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    PendingIntent pending = PendingIntent.getActivity(activity, 1, status, flags);
                    session.commit(pending.getIntentSender());
                }
                main.post(dialog::dismiss);
            } catch (Exception e) {
                main.post(() -> {
                    dialog.dismiss();
                    toast("업데이트를 받지 못했어요: " + e.getMessage());
                });
            }
        }).start();
    }

    /** PackageInstaller가 돌려준 결과를 처리한다. 확인이 필요하면 시스템 설치 화면을 띄운다. */
    void onInstallStatus(Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) activity.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            toast("설치하지 못했어요" + (msg != null ? ": " + msg : ""));
        }
    }

    private void toast(String text) {
        Toast.makeText(activity, text, Toast.LENGTH_LONG).show();
    }
}
