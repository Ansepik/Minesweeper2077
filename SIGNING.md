# Подпись и пересборка CyberSweep.apk

## Причина ошибки «Package invalid / приложение не установлено»
Предыдущие сборки APK **не были подписаны**. Android PackageManager
отклоняет неподписанный APK (`INSTALL_PARSE_FAILED_NOT_APK`).

## Ключ подписи
- Файл: `build_tmp/cybersweep.keystore` (закоммичен в репозиторий)
- Alias: `cybersweep`, пароль keystore/key: `cybersweep2077`
- Сертификат SHA-256: `97:46:10:2F:41:68:99:FA:CF:34:4A:B4:0D:4D:C7:95:B0:BC:24:85:90:2D:BF:E5:20:6F:17:31:56:3F:55:8F`
- Все будущие обновления должны подписываться ЭТИМ ЖЕ ключом, иначе установка
  поверх существующей версии падает с INSTALL_FAILED_UPDATE_INCOMPATIBLE
  (тогда нужно сначала удалить старое приложение).

## Пересборка без Android Studio (репак ассетов + подпись)
```bash
# 1. Обновить asset внутри APK (web/index.html = android-app/app/src/main/assets/index.html)
python3 - << 'PY'
import zipfile, shutil
src='web/index.html'; apk='LastVersion/CyberSweep.apk'
shutil.copy(apk,'build_tmp/unsigned.apk')
# перезаписать assets/index.html в zip
import os
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
apksigner verify --verbose build_tmp/aligned.apk
cp build_tmp/aligned.apk LastVersion/CyberSweep.apk
```
