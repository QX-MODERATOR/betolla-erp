package com.betolla.erp;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.widget.EditText;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

public class MainActivity extends AppCompatActivity {

    public static final String DEFAULT_LOCAL_URL = "http://192.168.2.17:3000";
    public static final String DEFAULT_TUNNEL_URL = "https://identification-features-munich-inexpensive.trycloudflare.com";
    public static final String DEFAULT_URL = DEFAULT_LOCAL_URL;

    private WebView webView;
    private SwipeRefreshLayout swipeRefreshLayout;
    private ProgressBar progressBar;
    private LinearLayout layoutError;
    private TextView tvCurrentUrl;
    private ValueCallback<Uri[]> filePathCallback;

    private final ActivityResultLauncher<Intent> fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (filePathCallback != null) {
                    Uri[] results = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        if (result.getData().getClipData() != null) {
                            int count = result.getData().getClipData().getItemCount();
                            results = new Uri[count];
                            for (int i = 0; i < count; i++) {
                                results[i] = result.getData().getClipData().getItemAt(i).getUri();
                            }
                        } else if (result.getData().getData() != null) {
                            results = new Uri[]{result.getData().getData()};
                        }
                    }
                    filePathCallback.onReceiveValue(results);
                    filePathCallback = null;
                }
            }
    );

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.Theme_BetollaERP);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        swipeRefreshLayout = findViewById(R.id.swipeRefreshLayout);
        progressBar = findViewById(R.id.progressBar);
        layoutError = findViewById(R.id.layoutError);
        tvCurrentUrl = findViewById(R.id.tvCurrentUrl);

        SharedPreferences prefs = getSharedPreferences("betolla_config", MODE_PRIVATE);
        String savedUrl = prefs.getString("server_url", DEFAULT_URL);

        // AUTO-RESET: Clean any old obsolete netlify or outdated trycloudflare URLs
        if (savedUrl == null || savedUrl.contains("netlify.app") || savedUrl.contains("societies-passes")) {
            savedUrl = DEFAULT_LOCAL_URL;
            prefs.edit().putString("server_url", DEFAULT_LOCAL_URL).apply();
        }

        // Retry Button
        findViewById(R.id.btnRetry).setOnClickListener(v -> {
            layoutError.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.reload();
        });

        // Quick Connect: Local Wi-Fi (Primary PC Server)
        View btnConnectWifi = findViewById(R.id.btnConnectWifi);
        if (btnConnectWifi != null) {
            btnConnectWifi.setOnClickListener(v -> {
                String wifiUrl = prefs.getString("wifi_server_url", DEFAULT_LOCAL_URL);
                prefs.edit().putString("server_url", wifiUrl).apply();
                applyNewUrl(wifiUrl);
            });
        }

        // Quick Connect: Cloudflare Tunnel (4G / Mobile)
        View btnConnectTunnel = findViewById(R.id.btnConnectTunnel);
        if (btnConnectTunnel != null) {
            btnConnectTunnel.setOnClickListener(v -> {
                prefs.edit().putString("server_url", DEFAULT_TUNNEL_URL).apply();
                applyNewUrl(DEFAULT_TUNNEL_URL);
            });
        }

        // Manual Server Config Dialog Button
        View btnServerConfig = findViewById(R.id.btnServerConfig);
        if (btnServerConfig != null) {
            btnServerConfig.setOnClickListener(v -> showServerUrlDialog());
        }

        setupWebView();
        setupSwipeRefresh();
        setupBackPressNavigation();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(savedUrl);
        }
    }

    private void showServerUrlDialog() {
        SharedPreferences prefs = getSharedPreferences("betolla_config", MODE_PRIVATE);
        String current = prefs.getString("server_url", DEFAULT_URL);
        String wifiUrl = prefs.getString("wifi_server_url", DEFAULT_LOCAL_URL);

        final EditText input = new EditText(this);
        input.setText(current);
        input.setSelection(input.getText().length());
        input.setHint("أدخل عنوان السيرفر أو IP");

        new AlertDialog.Builder(this)
                .setTitle("عنوان سيرفر Betolla ERP")
                .setMessage("اختر طريقة الاتصال بالسيرفر أو أدخل IP يدوياً:\n\n💻 سيرفر الواي فاي المحلي: " + wifiUrl + "\n🌐 سيرفر كلاودفلير: يعمل على 4G/5G والواي فاي.")
                .setView(input)
                .setPositiveButton("اتصال بالرابط المكتوب", (dialog, which) -> {
                    String newUrl = input.getText().toString().trim();
                    if (!newUrl.isEmpty()) {
                        if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                            newUrl = "http://" + newUrl;
                        }
                        SharedPreferences.Editor editor = prefs.edit().putString("server_url", newUrl);
                        if (newUrl.contains("192.168.") || newUrl.contains("10.") || newUrl.contains("172.")) {
                            editor.putString("wifi_server_url", newUrl);
                        }
                        editor.apply();
                        applyNewUrl(newUrl);
                    }
                })
                .setNeutralButton("سيرفر محلي (WiFi)", (dialog, which) -> {
                    String targetWifiUrl = prefs.getString("wifi_server_url", DEFAULT_LOCAL_URL);
                    prefs.edit().putString("server_url", targetWifiUrl).apply();
                    applyNewUrl(targetWifiUrl);
                })
                .setNegativeButton("كلاودفلير (4G)", (dialog, which) -> {
                    prefs.edit().putString("server_url", DEFAULT_TUNNEL_URL).apply();
                    applyNewUrl(DEFAULT_TUNNEL_URL);
                })
                .show();
    }

    private void applyNewUrl(String url) {
        layoutError.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        String defaultUa = settings.getUserAgentString();
        settings.setUserAgentString(defaultUa + " BetollaERP-Android/2.5.0");

        // Enable cookie synchronization for JWT tokens and secure sessions
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new CustomWebViewClient());
        webView.setWebChromeClient(new CustomWebChromeClient());
    }

    private void setupSwipeRefresh() {
        swipeRefreshLayout.setColorSchemeResources(R.color.primary, R.color.accent);
        swipeRefreshLayout.setOnRefreshListener(() -> webView.reload());
    }

    private void setupBackPressNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    private class CustomWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            return handleUri(uri);
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUri(Uri.parse(url));
        }

        private boolean handleUri(Uri uri) {
            if (uri == null) return false;
            String scheme = uri.getScheme();
            String host = uri.getHost();

            // 1. Direct Telephony: tel:079xxxxxxx
            if ("tel".equalsIgnoreCase(scheme)) {
                try {
                    Intent intent = new Intent(Intent.ACTION_DIAL, uri);
                    startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "لا يوجد تطبيق هاتف متاح", Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            // 2. Email: mailto:info@betolla.com
            if ("mailto".equalsIgnoreCase(scheme)) {
                try {
                    Intent intent = new Intent(Intent.ACTION_SENDTO, uri);
                    startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    // Ignore
                }
                return true;
            }

            // 3. WhatsApp Direct Linking: whatsapp:// or wa.me
            if ("whatsapp".equalsIgnoreCase(scheme) || (host != null && (host.contains("wa.me") || host.contains("whatsapp.com")))) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    intent.setPackage("com.whatsapp");
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                        return true;
                    } catch (Exception ex) {
                        Toast.makeText(MainActivity.this, "تطبيق واتساب غير مثبت", Toast.LENGTH_SHORT).show();
                        return true;
                    }
                }
            }

            // 4. Google Calendar Direct Linking
            if (host != null && host.contains("calendar.google.com")) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }

            // 5. Internal ERP Navigation (Your PC IP & Cloudflare tunnel)
            SharedPreferences prefs = getSharedPreferences("betolla_config", MODE_PRIVATE);
            String savedUrl = prefs.getString("server_url", DEFAULT_URL);
            String savedHost = null;
            try {
                savedHost = Uri.parse(savedUrl).getHost();
            } catch (Exception ignored) {}

            if (host != null && (
                    (savedHost != null && host.equalsIgnoreCase(savedHost)) ||
                    host.contains("192.168.") ||
                    host.contains("10.0.2.2") ||
                    host.contains("localhost") ||
                    host.contains("127.0.0.1") ||
                    host.contains("trycloudflare.com") ||
                    host.contains("supabase.co")
            )) {
                return false; // Let WebView handle internal pages
            }

            // 6. External URLs: open in external browser
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            progressBar.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
            swipeRefreshLayout.setRefreshing(false);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                progressBar.setVisibility(View.GONE);
                swipeRefreshLayout.setRefreshing(false);
                webView.setVisibility(View.GONE);
                layoutError.setVisibility(View.VISIBLE);

                if (tvCurrentUrl != null) {
                    SharedPreferences prefs = getSharedPreferences("betolla_config", MODE_PRIVATE);
                    String current = prefs.getString("server_url", DEFAULT_URL);
                    tvCurrentUrl.setText("الرابط الذي تعذر الوصول إليه: " + current);
                }
            }
        }
    }

    private class CustomWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
            if (newProgress >= 100) {
                progressBar.setVisibility(View.GONE);
            } else {
                progressBar.setVisibility(View.VISIBLE);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
            if (MainActivity.this.filePathCallback != null) {
                MainActivity.this.filePathCallback.onReceiveValue(null);
            }
            MainActivity.this.filePathCallback = filePathCallback;

            Intent contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
            contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
            contentIntent.setType("image/*");
            contentIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            Intent chooserIntent = Intent.createChooser(contentIntent, "اختر صورة أو ملف");
            try {
                fileChooserLauncher.launch(chooserIntent);
            } catch (ActivityNotFoundException e) {
                MainActivity.this.filePathCallback = null;
                Toast.makeText(MainActivity.this, "لا يمكن فتح مدير الملفات", Toast.LENGTH_SHORT).show();
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
