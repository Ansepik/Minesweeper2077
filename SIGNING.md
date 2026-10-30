# Подпись и пересборка CyberSweep.apk

## История ошибок установки (краткая диагностика)
1. **Неподписанный APK** — PackageManager отклонял сборку
   (`INSTALL_PARSE_FAILED_NOT_APK`). Устранено подписью v2+v3.
2. **Base64 вместо бинарного файла** — в один из моментов в Git был залит
   ASCII-текст `UEsDBBQ...` вместо настоящего zip; на устройстве это
   выглядело как «проблема с парсингом пакета». Устранено: в репозитории
   лежит корректный двоичный APK (проверка: файл начинается с `PK\x03\x04`,
   `unzip -t` без ошибок).
3. **Смена сертификата подписи** — версия vc≤46 распространялась с ключом
   SHA-256 `97:46:...`, начиная с vc47 приложение подписывается новым ключом
   (см. ниже). Установка поверх старой версии с другим сертификатом падает с
   `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. **Последствие для пользователей:**
   перед установкой vc≥47 нужно один раз удалить старую версию приложения.
   Все будущие обновления подписываются ТОЛЬКО текущим ключом.

## Текущий ключ подписи (используется с versionCode 47 / v4.9)
- Файл: `build_tmp/cybersweep.keystore` (закоммичен в публичный репозиторий,
  пароли здесь же — ключ не является секретом, но НЕ заменяйте его без крайней
  необходимости: замена ключа ломает обновление у всех установленных версий)
- Alias: `cybersweep`, пароли keystore/key: `cybersweep2077`
- Сертификат SHA-256 (apksigner): `2edb b881 7284 6f12 5c3b 5e8a 7e28 9c8d d78c 99ce 2dd5 2b41 be27 d85a c274 44e7`
- Предыдущий (устаревший, vc≤46): `9746 102f 4168 99fa cf34 4ab4 0d4d c795 b0bc 2485 902d bfe5 206f 1731 563f 558f`

## Правильная сборка через Gradle (рекомендуется)
В `android-app/` добавлен Gradle Wrapper 8.7 (AGP 8.5.2, JDK 17, API 34).
Release подписывается автоматически при заданных переменных окружения; если
заданы только часть переменных — сборка падает с ошибкой (невозможно случайно
опубликовать неподписанный release):

```bash
export CYBERSWEEP_KEYSTORE=../build_tmp/cybersweep.keystore
export CYBERSWEEP_KEY_ALIAS=cybersweep
export CYBERSWEEP_KEYSTORE_PASSWORD=cybersweep2077
export CYBERSWEEP_KEY_PASSWORD=cybersweep2077
cd android-app
./gradlew clean assembleRelease
# результат: app/build/outputs/apk/release/app-release.apk (подписан)
```

## Быстрая пересборка без Android Studio (репак ассетов + подпись)
Применяется, когда изменился только `index.html` (web и assets синхронны):

```bash
# 1. Обновить asset внутри APK (web/index.html = android-app/app/src/main/assets/index.html)
python3 - << 'PY'
import zipfile, shutil
src='web/index.html'; apk='LastVersion/CyberSweep.apk'
shutil.copy(apk,'build_tmp/unsigned.apk')
tmp='build_tmp/repack.apk'
zin=zipfile.ZipFile('build_tmp/unsigned.apk'); zout=zipfile.ZipFile(tmp,'w',zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    if it.filename=='assets/index.html': continue
    if it.filename.startswith('META-INF/'): continue  # старая подпись сбрасывается
    zout.writestr(it, zin.read(it.filename))
zout.write(src,'assets/index.html')
zin.close(); zout.close()
PY
# 2. Выровнять
zipalign -f 4 build_tmp/repack.apk build_tmp/aligned.apk
# 3. Подписать (v2+v3 достаточно для minSdk 24)
apksigner sign --ks build_tmp/cybersweep.keystore --ks-pass pass:cybersweep2077 \
  --ks-key-alias cybersweep --key-pass pass:cybersweep2077 build_tmp/aligned.apk
# 4. Проверить
apksigner verify --verbose --print-certs build_tmp/aligned.apk
aapt dump badging build_tmp/aligned.apk | head -3
cp build_tmp/aligned.apk LastVersion/CyberSweep.apk
```

## Обязательная проверка перед публикацией
```bash
apksigner verify --verbose --print-certs LastVersion/CyberSweep.apk   # Verifies: true, SHA-256 совпадает с текущим ключом
aapt2 dump badging LastVersion/CyberSweep.apk                          # package/versionCode/versionName/minSdk/targetSdk
adb install -r LastVersion/CyberSweep.apk                              # реальная установка/обновление
```
