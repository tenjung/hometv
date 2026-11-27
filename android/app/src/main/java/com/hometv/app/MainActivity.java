package com.hometv.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.os.SystemClock;
import android.text.InputType;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;

/**
 * 집TV 브라우저: 홈은 집TV, 주소창으로 어떤 사이트든 여는 개인용 웹 브라우저.
 * TV에서는 리모컨 방향키로 움직이는 마우스 커서를, 폰에서는 터치를 쓴다.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "hometv";
    private static final String KEY_HOME = "server_url";
    private static final String KEY_BOOKMARKS = "bookmarks";
    private static final String KEY_DESKTOP = "desktop_mode";
    /** 집TV 운영 주소(Vercel). 집 밖·PC가 꺼져 있어도 접속된다. */
    private static final String DEFAULT_HOME = "https://hometv-kappa.vercel.app/";
    /** 예전 기본값(집 PC 서버). 이 값으로 저장된 기기는 운영 주소로 옮긴다. */
    private static final String OLD_LAN_HOME = "http://172.30.1.46:4317/";

    private SharedPreferences prefs;
    private FrameLayout root;
    private LinearLayout chrome;
    private LinearLayout toolbar;
    private EditText address;
    private ProgressBar progress;
    private FrameLayout holder;
    private WebView web;
    private View cursor;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private String defaultUserAgent;
    private Updater updater;

    private boolean tv;
    private boolean cursorOn;
    /** 리모컨 방식: 끔(집TV 홈·폰) / 자동 이동(링크·버튼 사이 이동) / 커서. */
    private static final int NAV_OFF = 0, NAV_FOCUS = 1, NAV_CURSOR = 2;
    private int nav = NAV_OFF;
    private boolean pageEditing;
    private boolean backLongPressed;
    private String navScript = "";
    private float cx, cy;
    private long touchDownTime;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        tv = isTv();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        chrome = new LinearLayout(this);
        chrome.setOrientation(LinearLayout.VERTICAL);
        root.addView(chrome, match());

        buildToolbar();
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(ColorStateList.valueOf(0xFFE45A3C));
        chrome.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        holder = new FrameLayout(this);
        web = new WebView(this);
        holder.addView(web, match());
        cursor = buildCursor();
        holder.addView(cursor, new FrameLayout.LayoutParams(dp(22), dp(22)));
        chrome.addView(holder, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);
        setupWebView();
        hideSystemBars();
        holder.post(() -> { cx = holder.getWidth() / 2f; cy = holder.getHeight() / 2f; placeCursor(); });

        // 처음 실행이거나 예전 기본값(집 PC 서버)을 쓰던 기기는 운영 주소로 맞춘다.
        // 직접 다른 주소를 넣은 경우는 그대로 둔다(메뉴 → 집TV 홈 주소 변경).
        String home = prefs.getString(KEY_HOME, null);
        if (home == null || home.equals(OLD_LAN_HOME)) {
            home = DEFAULT_HOME;
            prefs.edit().putString(KEY_HOME, home).apply();
        }
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(home);
        }
        web.requestFocus();

        updater = new Updater(this);
        if (Updater.ACTION_INSTALL_STATUS.equals(getIntent().getAction())) updater.onInstallStatus(getIntent());
        else root.postDelayed(() -> updater.check(false), 3000);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (Updater.ACTION_INSTALL_STATUS.equals(intent.getAction())) updater.onInstallStatus(intent);
    }

    // ---------- 화면 구성 ----------

    private FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private StateListDrawable focusBackground(float radius) {
        GradientDrawable on = new GradientDrawable();
        on.setColor(0xFFF1F1F4);
        on.setCornerRadius(dp(radius));
        GradientDrawable off = new GradientDrawable();
        off.setColor(Color.TRANSPARENT);
        off.setCornerRadius(dp(radius));
        StateListDrawable s = new StateListDrawable();
        s.addState(new int[]{android.R.attr.state_focused}, on);
        s.addState(new int[]{android.R.attr.state_pressed}, on);
        s.addState(new int[]{}, off);
        return s;
    }

    private TextView toolButton(String label, String description, View.OnClickListener click) {
        TextView b = new TextView(this);
        b.setText(label);
        b.setContentDescription(description);
        b.setTextSize(20);
        b.setGravity(Gravity.CENTER);
        b.setTextColor(new ColorStateList(
                new int[][]{{android.R.attr.state_focused}, {}},
                new int[]{0xFF15161C, 0xFFE4E5EA}));
        b.setBackground(focusBackground(22));
        b.setFocusable(true);
        b.setClickable(true);
        b.setOnClickListener(click);
        b.setOnKeyListener((v, code, e) -> {
            if (code == KeyEvent.KEYCODE_DPAD_DOWN && e.getAction() == KeyEvent.ACTION_DOWN) {
                web.requestFocus();
                return true;
            }
            return false;
        });
        toolbar.addView(b, new LinearLayout.LayoutParams(dp(46), dp(44)));
        return b;
    }

    private void buildToolbar() {
        toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), dp(6), dp(8), dp(6));
        toolbar.setBackgroundColor(0xFF16171D);

        toolButton("‹", "뒤로", v -> { if (web.canGoBack()) web.goBack(); });
        toolButton("›", "앞으로", v -> { if (web.canGoForward()) web.goForward(); });
        toolButton("⟳", "새로고침", v -> web.reload());
        toolButton("⌂", "집TV 홈", v -> goHome());

        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(15);
        address.setTextColor(0xFFF1F1F4);
        address.setHintTextColor(0xFF7D808C);
        address.setHint("주소 또는 검색어 입력");
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setSelectAllOnFocus(true);
        address.setPadding(dp(14), 0, dp(14), 0);
        GradientDrawable field = new GradientDrawable();
        field.setColor(0xFF262832);
        field.setCornerRadius(dp(22));
        GradientDrawable fieldFocus = new GradientDrawable();
        fieldFocus.setColor(0xFF30323D);
        fieldFocus.setCornerRadius(dp(22));
        fieldFocus.setStroke(dp(2), Color.WHITE);
        StateListDrawable fieldBg = new StateListDrawable();
        fieldBg.addState(new int[]{android.R.attr.state_focused}, fieldFocus);
        fieldBg.addState(new int[]{}, field);
        address.setBackground(fieldBg);
        address.setOnFocusChangeListener((v, has) -> { if (has) address.post(address::selectAll); });
        address.setOnEditorActionListener((v, actionId, e) -> {
            boolean go = actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE
                    || (e != null && e.getKeyCode() == KeyEvent.KEYCODE_ENTER && e.getAction() == KeyEvent.ACTION_DOWN);
            if (go) { openInput(address.getText().toString()); return true; }
            return false;
        });
        address.setOnKeyListener((v, code, e) -> {
            if (code == KeyEvent.KEYCODE_DPAD_DOWN && e.getAction() == KeyEvent.ACTION_DOWN) {
                web.requestFocus();
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(44), 1f);
        lp.setMargins(dp(8), 0, dp(8), 0);
        toolbar.addView(address, lp);

        toolButton("☆", "즐겨찾기", v -> showBookmarks());
        toolButton("☰", "메뉴", v -> showMenu());
        chrome.addView(toolbar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private View buildCursor() {
        View c = new View(this);
        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(0x66FFFFFF);
        dot.setStroke(dp(3), 0xFFE45A3C);
        c.setBackground(dot);
        c.setElevation(dp(8));
        c.setVisibility(View.GONE);
        return c;
    }

    // ---------- 웹뷰 ----------

    private void setupWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // 일반 브라우저처럼 사용자가 누르지 않은 새 창(자동 팝업)은 열지 않는다.
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(true);
        defaultUserAgent = s.getUserAgentString();
        applyUserAgent();

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                String scheme = target.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) return false;
                // intent://, market:// 등은 설치된 앱으로 넘기고, 없으면 무시한다.
                try {
                    Intent intent = "intent".equals(scheme)
                            ? Intent.parseUri(target.toString(), Intent.URI_INTENT_SCHEME)
                            : new Intent(Intent.ACTION_VIEW, target);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    intent.setComponent(null);
                    startActivity(intent);
                } catch (Exception ignored) {
                    // 처리할 앱이 없으면 그대로 둔다.
                }
                return true;
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                // 집TV 웹이 #watch(시청 화면)로 바뀌면 툴바를 숨겨 전체화면으로 본다.
                updateWatchMode(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                updateWatchMode(url);
                if (!address.hasFocus()) address.setText(url);
                pageEditing = false;
                setNav(tv && !isHome(url) ? NAV_FOCUS : NAV_OFF);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!address.hasFocus()) address.setText(url);
                injectNav();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && isHome(request.getUrl().toString())) {
                    showHomeError(String.valueOf(error.getDescription()));
                }
            }
        });

        try (java.io.InputStream in = getAssets().open("tvnav.js")) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            navScript = out.toString("UTF-8");
        } catch (Exception e) {
            navScript = "";
        }
        // 페이지 스크립트가 앱에 알려 주는 통로. 위험한 기능은 넣지 않는다(입력 상태·가장자리·커서 전환만).
        web.addJavascriptInterface(new NavBridge(), "HomeTVNative");

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                progress.setProgress(p);
                if (toolbar.getVisibility() == View.VISIBLE) progress.setVisibility(p >= 100 ? View.INVISIBLE : View.VISIBLE);
                if (p >= 70) injectNav();
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                if (!isUserGesture) return false; // 자동 팝업 차단
                // 사용자가 누른 새 창 링크는 현재 화면에서 연다.
                WebView temp = new WebView(MainActivity.this);
                temp.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                        web.loadUrl(r.getUrl().toString());
                        v.destroy();
                        return true;
                    }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(temp);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customCallback = callback;
                root.addView(view, match());
                chrome.setVisibility(View.GONE);
                hideSystemBars();
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }
        });
    }

    private void applyUserAgent() {
        boolean desktop = prefs.getBoolean(KEY_DESKTOP, false);
        String ua = desktop
                ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
                : defaultUserAgent + (tv ? " HomeTVApp/1.1 AndroidTV" : " HomeTVApp/1.1");
        web.getSettings().setUserAgentString(ua);
    }

    // 집TV 시청 화면(#watch, #watch-panel)에서는 주소창·툴바·진행 막대를 숨긴다. 목록으로 돌아오면 다시 보인다.
    private void updateWatchMode(String url) {
        Uri u = Uri.parse(String.valueOf(url));
        String fragment = u.getFragment();
        boolean watching = isHome(String.valueOf(url)) && fragment != null && fragment.startsWith("watch");
        int visibility = watching ? View.GONE : View.VISIBLE;
        if (toolbar.getVisibility() == visibility) return;
        toolbar.setVisibility(visibility);
        progress.setVisibility(visibility);
        if (watching) {
            hideKeyboard();
            web.requestFocus();
            hideSystemBars();
        }
    }

    private void exitFullscreen() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        chrome.setVisibility(View.VISIBLE);
        if (customCallback != null) customCallback.onCustomViewHidden();
        customCallback = null;
        web.requestFocus();
        hideSystemBars();
    }

    // ---------- 주소 / 홈 ----------

    private String home() {
        return prefs.getString(KEY_HOME, DEFAULT_HOME);
    }

    private boolean isHome(String url) {
        Uri h = Uri.parse(home()), u = Uri.parse(url);
        return h.getHost() != null && h.getHost().equalsIgnoreCase(u.getHost()) && h.getPort() == u.getPort();
    }

    private void goHome() {
        web.loadUrl(home());
        web.requestFocus();
    }

    private void openInput(String input) {
        String text = input.trim();
        if (text.isEmpty()) return;
        String url;
        if (text.matches("(?i)^https?://.*")) {
            url = text;
        } else if (!text.contains(" ") && (text.contains(".") || text.startsWith("localhost")) ) {
            url = (text.matches("^[0-9.]+(:\\d+)?(/.*)?$") ? "http://" : "https://") + text;
        } else {
            try {
                url = "https://www.google.com/search?q=" + URLEncoder.encode(text, "UTF-8");
            } catch (Exception e) {
                return;
            }
        }
        hideKeyboard();
        web.loadUrl(url);
        web.requestFocus();
    }

    private void hideKeyboard() {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(address.getWindowToken(), 0);
    }

    private static String normalizeHome(String input) {
        String url = input.trim();
        if (url.isEmpty()) return null;
        if (!url.matches("(?i)^https?://.*")) url = "http://" + url;
        Uri uri = Uri.parse(url);
        if (uri.getHost() == null || uri.getHost().isEmpty()) return null;
        if (uri.getPath() == null || uri.getPath().isEmpty()) url += "/";
        return url;
    }

    private void showHomeDialog(boolean firstRun) {
        EditText field = new EditText(this);
        field.setSingleLine(true);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        field.setText(home());
        field.setSelectAllOnFocus(true);
        FrameLayout box = new FrameLayout(this);
        box.setPadding(dp(20), dp(10), dp(20), 0);
        box.addView(field);
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("집TV 홈 주소")
                .setMessage("⌂ 버튼을 누르면 열리는 집TV 주소입니다.\n기본) https://hometv-kappa.vercel.app\n집 PC 서버) http://172.30.1.46:4317")
                .setView(box)
                .setPositiveButton("저장", (d, w) -> {
                    String url = normalizeHome(field.getText().toString());
                    if (url == null) {
                        Toast.makeText(this, "주소를 확인해 주세요.", Toast.LENGTH_LONG).show();
                        showHomeDialog(firstRun);
                        return;
                    }
                    prefs.edit().putString(KEY_HOME, url).apply();
                    goHome();
                });
        if (firstRun) b.setCancelable(false).setNegativeButton("종료", (d, w) -> finish());
        else b.setNegativeButton("취소", null);
        AlertDialog dialog = b.create();
        if (tv) {
            // TV: 키보드를 바로 띄우지 않고 '저장'에 포커스. 주소를 고치려면 위로 가서 확인.
            dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
            dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).requestFocus());
        }
        dialog.show();
    }

    private void showHomeError(String detail) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
                .setTitle("집TV에 연결할 수 없어요")
                .setMessage("인터넷 연결을 확인해 주세요. 집 PC 서버 주소를 쓰는 경우 PC가 켜져 있고 같은 와이파이여야 해요.\n\n주소: " + home() + "\n오류: " + detail)
                .setPositiveButton("다시 시도", (d, w) -> web.reload())
                .setNeutralButton("홈 주소 변경", (d, w) -> showHomeDialog(false))
                .setNegativeButton("닫기", null)
                .show();
    }

    // ---------- 즐겨찾기 ----------

    private List<String[]> bookmarks() {
        List<String[]> list = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs.getString(KEY_BOOKMARKS, "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                list.add(new String[]{o.getString("title"), o.getString("url")});
            }
        } catch (Exception ignored) {
        }
        return list;
    }

    private void saveBookmarks(List<String[]> list) {
        JSONArray a = new JSONArray();
        try {
            for (String[] b : list) a.put(new JSONObject().put("title", b[0]).put("url", b[1]));
        } catch (Exception ignored) {
        }
        prefs.edit().putString(KEY_BOOKMARKS, a.toString()).apply();
    }

    private void addBookmark() {
        String url = web.getUrl();
        if (url == null) return;
        String title = web.getTitle() == null || web.getTitle().isEmpty() ? url : web.getTitle();
        List<String[]> list = bookmarks();
        for (String[] b : list) if (b[1].equals(url)) {
            Toast.makeText(this, "이미 즐겨찾기에 있어요.", Toast.LENGTH_SHORT).show();
            return;
        }
        list.add(0, new String[]{title, url});
        saveBookmarks(list);
        Toast.makeText(this, "즐겨찾기에 추가했어요.", Toast.LENGTH_SHORT).show();
    }

    private void showBookmarks() {
        List<String[]> list = bookmarks();
        List<String> names = new ArrayList<>();
        names.add("＋ 이 페이지 추가");
        for (String[] b : list) names.add(b[0]);
        new AlertDialog.Builder(this)
                .setTitle("즐겨찾기")
                .setItems(names.toArray(new String[0]), (d, which) -> {
                    if (which == 0) addBookmark();
                    else { web.loadUrl(list.get(which - 1)[1]); web.requestFocus(); }
                })
                .setNeutralButton("삭제", (d, w) -> showDeleteBookmarks())
                .setNegativeButton("닫기", null)
                .show();
    }

    private void showDeleteBookmarks() {
        List<String[]> list = bookmarks();
        if (list.isEmpty()) return;
        String[] names = new String[list.size()];
        for (int i = 0; i < list.size(); i++) names[i] = list.get(i)[0];
        new AlertDialog.Builder(this)
                .setTitle("삭제할 즐겨찾기")
                .setItems(names, (d, which) -> { list.remove(which); saveBookmarks(list); })
                .setNegativeButton("닫기", null)
                .show();
    }

    // ---------- 메뉴 ----------

    private void showMenu() {
        boolean desktop = prefs.getBoolean(KEY_DESKTOP, false);
        String[] items = {
                "주소창으로 이동",
                "리모컨 방식: " + (nav == NAV_FOCUS ? "자동 이동" : nav == NAV_CURSOR ? "커서" : "끔") + " → 바꾸기",
                desktop ? "모바일 버전으로 보기" : "PC 버전으로 보기",
                "집TV 홈 주소 변경",
                "업데이트 확인 (현재 " + BuildConfig.VERSION_NAME + ")",
                "앱 종료"
        };
        new AlertDialog.Builder(this)
                .setTitle("집TV 브라우저")
                .setItems(items, (d, which) -> {
                    if (which == 0) focusAddress();
                    else if (which == 1) {
                        setNav(nav == NAV_FOCUS ? NAV_CURSOR : nav == NAV_CURSOR ? NAV_OFF : NAV_FOCUS);
                        Toast.makeText(this, nav == NAV_FOCUS ? "자동 이동: 방향키로 링크·버튼 사이를 이동해요."
                                : nav == NAV_CURSOR ? "커서: 방향키로 커서를 움직이고 확인으로 클릭해요."
                                : "리모컨 방식을 껐어요.", Toast.LENGTH_LONG).show();
                    }
                    else if (which == 2) {
                        prefs.edit().putBoolean(KEY_DESKTOP, !desktop).apply();
                        applyUserAgent();
                        web.reload();
                    } else if (which == 3) showHomeDialog(false);
                    else if (which == 4) updater.check(true);
                    else finish();
                })
                .setNegativeButton("닫기", null)
                .show();
    }

    private void focusAddress() {
        address.requestFocus();
        // 메뉴 창이 닫히며 선택이 풀리지 않도록 한 박자 뒤에 전체 선택한다(입력하면 기존 주소가 바뀜).
        address.post(address::selectAll);
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.showSoftInput(address, InputMethodManager.SHOW_IMPLICIT);
    }

    // ---------- 리모컨 커서 ----------

    private void setCursor(boolean on) {
        cursorOn = on;
        cursor.setVisibility(on ? View.VISIBLE : View.GONE);
        placeCursor();
    }

    private void setNav(int mode) {
        nav = mode;
        setCursor(mode == NAV_CURSOR);
        if (mode == NAV_FOCUS) injectNav();
        else web.evaluateJavascript("window.__tvnav&&window.__tvnav.off()", null);
    }

    private void injectNav() {
        if (nav == NAV_FOCUS && !navScript.isEmpty()) web.evaluateJavascript(navScript, null);
    }

    /** 자동 이동 모드: 방향키·확인을 페이지 스크립트로 보내고 결과에 따라 처리한다. */
    private void navKey(String name) {
        web.evaluateJavascript("window.__tvnav?window.__tvnav.key('" + name + "'):'none'", result -> {
            String r = result == null ? "" : result.replace("\"", "");
            if (r.equals("none")) {
                injectNav(); // 아직 스크립트가 없으면 넣고 다시 시도
                web.postDelayed(() -> web.evaluateJavascript("window.__tvnav&&window.__tvnav.key('" + name + "')", null), 120);
            } else if (r.equals("edge") && name.equals("up")) {
                focusToolbar();
            } else if (r.startsWith("iframe:")) {
                String[] p = r.substring(7).split(",");
                try {
                    cursorAt(Float.parseFloat(p[0]), Float.parseFloat(p[1]));
                } catch (NumberFormatException ignored) {
                }
            }
        });
    }

    /** 다른 사이트 플레이어(iframe) 위에 커서를 올려 커서 모드로 바꾼다. 뒤로 버튼으로 돌아온다. */
    private void cursorAt(float fx, float fy) {
        cx = Math.max(0, Math.min(web.getWidth() - 1, fx * web.getWidth()));
        cy = Math.max(0, Math.min(web.getHeight() - 1, fy * web.getHeight()));
        setNav(NAV_CURSOR);
        Toast.makeText(this, "플레이어 조작은 커서로 해요. 끝나면 뒤로 버튼을 누르세요.", Toast.LENGTH_LONG).show();
    }

    private final class NavBridge {
        @android.webkit.JavascriptInterface
        public void editing(boolean on) {
            runOnUiThread(() -> pageEditing = on);
        }
    }

    private void placeCursor() {
        int r = dp(11);
        cursor.setX(cx - r);
        cursor.setY(cy - r);
    }

    private void moveCursor(int dx, int dy, int repeat) {
        float step = dp(10 + Math.min(repeat, 12) * 4);
        float w = holder.getWidth(), h = holder.getHeight();
        float nx = cx + dx * step, ny = cy + dy * step;
        boolean edgeX = nx < 0 || nx > w - 1, edgeY = ny < 0 || ny > h - 1;
        cx = Math.max(0, Math.min(w - 1, nx));
        cy = Math.max(0, Math.min(h - 1, ny));
        placeCursor();
        if (edgeY && dy < 0 && !web.canScrollVertically(-1)) {
            focusToolbar();
            return;
        }
        if (edgeX || edgeY) wheel(edgeY ? -dy : 0, edgeX ? -dx : 0);
    }

    private void focusToolbar() {
        View first = toolbar.getChildAt(0);
        if (first != null) first.requestFocus();
    }

    /** 커서가 화면 끝에 닿으면 마우스 휠처럼 커서 아래 영역을 스크롤한다. */
    private void wheel(float vertical, float horizontal) {
        long t = SystemClock.uptimeMillis();
        MotionEvent.PointerProperties[] pp = {new MotionEvent.PointerProperties()};
        pp[0].id = 0;
        pp[0].toolType = MotionEvent.TOOL_TYPE_MOUSE;
        MotionEvent.PointerCoords[] pc = {new MotionEvent.PointerCoords()};
        pc[0].x = cx;
        pc[0].y = cy;
        pc[0].setAxisValue(MotionEvent.AXIS_VSCROLL, vertical * 2);
        pc[0].setAxisValue(MotionEvent.AXIS_HSCROLL, horizontal * 2);
        MotionEvent ev = MotionEvent.obtain(t, t, MotionEvent.ACTION_SCROLL, 1, pp, pc, 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_MOUSE, 0);
        web.dispatchGenericMotionEvent(ev);
        ev.recycle();
    }

    private void touch(int action) {
        long t = SystemClock.uptimeMillis();
        if (action == MotionEvent.ACTION_DOWN) touchDownTime = t;
        MotionEvent ev = MotionEvent.obtain(touchDownTime, t, action, cx, cy, 0);
        ev.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        web.dispatchTouchEvent(ev);
        ev.recycle();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        // 뒤로 길게 누르기 = 메뉴(주소창·리모컨 방식·업데이트). 메뉴 버튼 없는 리모컨용.
        if (k == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 1 && customView == null) {
                backLongPressed = true;
                showMenu();
                return true;
            }
            if (backLongPressed) {
                if (e.getAction() == KeyEvent.ACTION_UP) backLongPressed = false;
                return true;
            }
            if (e.getAction() == KeyEvent.ACTION_DOWN) return true; // 짧게 누름은 손을 뗄 때 처리
            if (e.getAction() == KeyEvent.ACTION_UP && !e.isCanceled()) { onBackPressed(); return true; }
        }
        // 키보드(PC 에뮬레이터·키보드 리모컨): 백스페이스·Esc = 뒤로. 글자 입력 중의 백스페이스는 그대로 지우기.
        boolean typing = pageEditing || address.hasFocus();
        if (k == KeyEvent.KEYCODE_ESCAPE || (k == KeyEvent.KEYCODE_DEL && !typing)) {
            if (e.getAction() == KeyEvent.ACTION_UP) onBackPressed();
            return true;
        }
        if (nav == NAV_FOCUS && customView == null && web.hasFocus()) {
            int code = e.getKeyCode();
            boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
            boolean center = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_NUMPAD_ENTER;
            boolean horizontal = code == KeyEvent.KEYCODE_DPAD_LEFT || code == KeyEvent.KEYCODE_DPAD_RIGHT;
            // 페이지의 입력칸에 글을 쓰는 중이면 좌우·확인은 입력칸이 쓴다(커서 이동·전송).
            if (pageEditing && (center || horizontal)) return super.dispatchKeyEvent(e);
            String name = code == KeyEvent.KEYCODE_DPAD_UP ? "up" : code == KeyEvent.KEYCODE_DPAD_DOWN ? "down"
                    : code == KeyEvent.KEYCODE_DPAD_LEFT ? "left" : code == KeyEvent.KEYCODE_DPAD_RIGHT ? "right"
                    : center ? "enter" : null;
            if (name != null) {
                if (down && (!center || e.getRepeatCount() == 0)) navKey(name);
                return true;
            }
        }
        if (cursorOn && customView == null && web.hasFocus()) {
            int code = e.getKeyCode();
            boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if (down) moveCursor(-1, 0, e.getRepeatCount());
                    return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if (down) moveCursor(1, 0, e.getRepeatCount());
                    return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                    if (down) moveCursor(0, -1, e.getRepeatCount());
                    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if (down) moveCursor(0, 1, e.getRepeatCount());
                    return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    if (down && e.getRepeatCount() == 0) touch(MotionEvent.ACTION_DOWN);
                    else if (!down) touch(MotionEvent.ACTION_UP);
                    return true;
                default:
                    break;
            }
        }
        if (e.getAction() == KeyEvent.ACTION_DOWN
                && (e.getKeyCode() == KeyEvent.KEYCODE_MENU || e.getKeyCode() == KeyEvent.KEYCODE_SETTINGS)) {
            showMenu();
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            exitFullscreen();
        } else if (address.hasFocus() || (toolbar.hasFocus() && !web.hasFocus())) {
            hideKeyboard();
            web.requestFocus();
        } else if (nav == NAV_CURSOR && tv && !isHome(String.valueOf(web.getUrl()))) {
            // 커서 모드(플레이어 조작 등)에서 뒤로 = 자동 이동으로 복귀
            setNav(NAV_FOCUS);
        } else if (pageEditing) {
            pageEditing = false;
            hideKeyboard();
            web.evaluateJavascript("window.__tvnav&&window.__tvnav.back()", null);
        } else {
            goBackOrMenu();
        }
    }

    private void goBackOrMenu() {
        if (web.canGoBack()) web.goBack();
        else showMenu();
    }

    // ---------- 시스템 ----------

    private boolean isTv() {
        UiModeManager ui = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        return ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
