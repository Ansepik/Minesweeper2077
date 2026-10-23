# CyberSweep — киберпанк-сапёр (Android)

3D-сапёр в стиле киберпанк на Three.js + GSAP. Кампания из 100 уровней с резко
растущей сложностью (от маленькой сетки до 24×24 с плотностью мин до 30%).
Все уровни детерминированы и гарантированно решаемы без угадывания. Полностью
офлайн: сохранения через localStorage, интерфейс только на русском языке.

## Готовый APK
Скачайте `LastVersion/CyberSweep.apk` и установите на устройство (Android 7.0+).
Разрешите установку из неизвестных источников, если ставите не из Play Market.

## Сборка из исходников
Требуются JDK 17 и Android SDK (platforms;android-34, build-tools;34.0.0).

```bash
cd android-app
echo "sdk.dir=/path/to/android-sdk" > local.properties
gradle assembleRelease   # или ./gradlew assembleRelease
# результат: app/build/outputs/apk/release/app-release.apk
```

После сборки обновите бинарь в репозитории:
```bash
cp app/build/outputs/apk/release/app-release.apk ../LastVersion/CyberSweep.apk
```

## Структура
- `LastVersion/CyberSweep.apk` — последняя собранная версия игры
- `android-app/` — исходники Android-приложения (WebView-обёртка)
  - `app/src/main/assets/index.html` — сама игра (вся логика, HUD, рендер)
  - `app/src/main/assets/libs/` — Three.js и GSAP (офлайн-копии)
- `web/` — веб-версия той же игры (`index.html` + `libs/`), можно открыть в браузере
