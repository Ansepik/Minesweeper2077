package com.cybersweep.web;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * CyberSweep — обёртка над HTML5-игрой.
 * Вся логика игры живёт в assets/index.html (Three.js + GSAP, полностью офлайн).
 * Здесь только настройка WebView: WebGL, полноэкранный режим, localStorage.
 */
public class MainActivity extends Activity {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Полноэкранный иммерсивный режим
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);          // движок игры
        s.setDomStorageEnabled(true);          // localStorage — сохранения кампании
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false); // WebAudio-звуки по тапу
        s.setTextZoom(100);                    // системный шрифт не ломает HUD

        webView.setBackgroundColor(0xFF0A0A0A); // цвет фона до загрузки ядра
        // Логируем консоль страницы в logcat (TAG=csjs) — удалённая диагностика JS.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage cm) {
                Log.d("csjs", cm.sourceId() + ":" + cm.lineNumber() + " | " + cm.message());
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(android.webkit.WebView view, String url) {
                super.onPageFinished(view, url);
                // АВАРИЙНАЯ ЗАЩИТА: если через 4 секунды после загрузки страница
                // всё ещё показывает экран «ЗАГРУЗКА ЯДРА» (boot() не завершился),
                // заменяем его кнопкой перезапуска вместо вечной прокрутки.
                view.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        view.evaluateJavascript(
                            "(function(){try{var ld=document.getElementById('loader');" +
                            "if(ld&&ld.offsetParent!==null&&!window.__booted){" +
                            "ld.innerHTML='<div class=\"t\" style=\"color:#ffee00\">ЯДРО НЕ СТАРТОВАЛО</div>'+" +
                            "'<div style=\"margin-top:16px\"><button onclick=\"location.reload()\" " +
                            "style=\"padding:12px 24px;background:#00f3ff;border:0;color:#05080a;" +
                            "font-weight:bold;cursor:pointer\">ПЕРЕЗАПУСТИТЬ</button></div>';}}catch(e){}})();",
                            null);
                    }
                }, 4000);
            }
        });
        webView.loadUrl("file:///android_asset/index.html");

        setContentView(webView);
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    /** Кнопка «Назад» Android: сначала шаг назад по истории WebView. */
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            // Прогресс кампании сохраняется в localStorage автоматически.
            finish();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.__pauseRendering && window.__pauseRendering();", null);
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            webView.evaluateJavascript(
                    "window.__resumeRendering && window.__resumeRendering();", null);
            hideSystemUi();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.__pauseRendering && window.__pauseRendering();", null);
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
