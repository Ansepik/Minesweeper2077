# CyberSweep — киберпанк-сапёр

3D-сапёр на Three.js + GSAP с веб-версией и Android WebView-обёрткой.
Кампания содержит 100 уровней, а свободная игра — 16 готовых пресетов.
Данные уровней встроены в HTML и также хранятся в `levels.json`, поэтому игра
не зависит от сети для загрузки базы. Прогресс хранится локально в `localStorage`.

## Готовый APK

`LastVersion/CyberSweep.apk` — ранее собранный APK. Он не обновляется автоматически
при изменении исходников: после исправления кода APK нужно пересобрать.

## Проверка базы уровней

Из корня репозитория запустите:

```bash
python tools/validate_levels.py
```

Скрипт проверяет размеры полей, число мин, подсказки, безопасные стартовые клетки,
а также совпадение базы между веб-версией, Android-версией и встроенными данными.
Он **не проверяет логическую решаемость**. Отдельный прогон игрового решателя
не смог подтвердить решение без угадывания для 73 из 100 уровней кампании и
10 из 16 пресетов. Это может быть ограничением решателя, но эти поля требуют
дополнительной проверки или перепроектирования перед релизом.

## Сборка Android

Требуются JDK 17 и Android SDK с платформой API 34. Gradle Wrapper (Gradle 8.7,
совместимый с Android Gradle Plugin 8.5.2) добавлен в репозиторий, поэтому сборка
одинаково работает локально и в CI без установленного Gradle.

```bash
cd android-app
# При необходимости создайте local.properties со своим путём к Android SDK:
# sdk.dir=/path/to/android-sdk
./gradlew clean
./gradlew assembleDebug
./gradlew assembleRelease   # Windows: gradlew.bat assembleRelease
```

Результат обычно находится в `app/build/outputs/apk/release/app-release-unsigned.apk`
для неподписанной сборки либо в `app/build/outputs/apk/release/app-release.apk`
при настроенной подписи (имя зависит от версии Android Gradle Plugin).

### Подпись Release APK

Release больше не подписывается debug-ключом. Для автоматической подписи задайте
переменные окружения перед запуском Gradle:

- `CYBERSWEEP_KEYSTORE` — путь к keystore-файлу;
- `CYBERSWEEP_KEY_ALIAS` — alias ключа;
- `CYBERSWEEP_KEYSTORE_PASSWORD` — пароль keystore;
- `CYBERSWEEP_KEY_PASSWORD` — пароль ключа.

Не добавляйте keystore и пароли в Git. Если переменные не заданы, соберите APK,
а затем подпишите его отдельно средствами Android SDK (`apksigner`).

После сборки и проверки на устройстве можно заменить `LastVersion/CyberSweep.apk`
новым APK. Не перезаписывайте его до проверки установки и обновления поверх старой
версии приложения.

## Структура

- `LastVersion/CyberSweep.apk` — сохранённая сборка APK;
- `android-app/` — Android WebView-обёртка и её локальные assets;
- `web/` — веб-версия игры и её локальные assets;
- `tools/validate_levels.py` — структурная проверка базы уровней.
