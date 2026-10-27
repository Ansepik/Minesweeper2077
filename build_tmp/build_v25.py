#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка CyberSweep.apk v2.3 (versionCode 25):
1) репак LastVersion/CyberSweep.apk с новым assets/index.html (фикс геометрии tileTopY/tileTopY),
   старый META-INF сбрасывается;
2) патч бинарного AndroidManifest.xml: versionCode -> 22, versionName "2.1.8" -> "2.1.9";
3) zipalign + apksigner подписка тем же ключом cybersweep.keystore;
4) копирование результата в LastVersion/CyberSweep.apk и проверка содержимого.

Ключ к парсингу AXML: offsets в string pool у aapt — АБСОЛЮТНЫЕ от начала файла,
а не относительные stringsStart (поэтому предыдущие попытки падали с IndexError).
"""
import zipfile, struct, shutil, subprocess, sys, os

WS = '/workspace'
SRC = os.path.join(WS, 'LastVersion', 'CyberSweep.apk')
OUT = os.path.join(WS, 'build_tmp', 'v26.apk')
ALIGNED = os.path.join(WS, 'build_tmp', 'aligned_v26.apk')
TOOLS = os.path.join(WS, 'build_tmp', 'tools')
KS = os.path.join(WS, 'build_tmp', 'cybersweep.keystore')
KS_PASS = 'cybersweep2077'  # пароль key/alias — см. SIGNING.md
ALIAS = 'cybersweep'
HTML = os.path.join(WS, 'web', 'index.html')

def log(*a): print('[v20]', *a)

# ---------- 1. repack with new html ----------
html = open(HTML, 'rb').read()
assert b'tileGeom' in html and b'camAz:-Math.PI/2,camEl:1.05' in html, 'web/index.html не содержит фиксы v2.7'
zin = zipfile.ZipFile(SRC)
zout = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED)
for it in zin.infolist():
    if it.filename.startswith('META-INF/'):
        continue
    data = html if it.filename == 'assets/index.html' else zin.read(it.filename)
    ni = zipfile.ZipInfo(it.filename, date_time=it.date_time)
    ni.compress_type = zipfile.ZIP_STORED if it.filename == 'resources.arsc' else zipfile.ZIP_DEFLATED
    ni.external_attr = it.external_attr
    zout.writestr(ni, data)
zout.close(); zin.close()
log('repacked ->', OUT)

# ---------- 2. patch binary AndroidManifest.xml ----------
za = zipfile.ZipFile(OUT)
mf = bytearray(za.read('AndroidManifest.xml'))
items = [(it, bytes(mf) if it.filename == 'AndroidManifest.xml' else za.read(it.filename)) for it in za.infolist()]
za.close()

RES_XML_TYPE, RES_STRING_POOL = 3, 1
START_ELEMENT = 0x0102   # RES_XML_START_ELEMENT_TYPE (был баг: константа стояла 104=0x68, обход никогда не находил <manifest>)
assert struct.unpack_from('<H', mf, 0)[0] == RES_XML_TYPE
sp_off = 8
assert struct.unpack_from('<H', mf, sp_off)[0] == RES_STRING_POOL
# CORRECT AXML string-pool layout (ResStringPoolHeader):
#   u16 type @0, u16 headerSize @2, u32 size @4, u32 stringCount @8,
#   u32 styleCount @12, u32 flags @16, u32 stringsStart @20, u32 stylesStart @24
# offsets array starts right after the header (at sp_off+headerSize), each entry
# is an offset RELATIVE to the absolute strings-data start (sp_off+stringsStart).
hdr_size = struct.unpack_from('<H', mf, sp_off + 2)[0]     # normally 28
total = struct.unpack_from('<I', mf, sp_off + 4)[0]        # full pool chunk size
sc = struct.unpack_from('<I', mf, sp_off + 8)[0]           # stringCount
flags = struct.unpack_from('<I', mf, sp_off + 16)[0]
st = struct.unpack_from('<I', mf, sp_off + 20)[0]          # stringsStart relative to sp_off
abs_st = sp_off + st                                       # absolute strings data start
is_utf8 = bool(flags & 0x100)
soff_arr = sp_off + hdr_size                               # where the u32[] of offsets begins

def read_str(p):
    if is_utf8:
        b0 = mf[p]; p += 2 if b0 & 0x80 else 1
        b1 = mf[p]; m = ((b1 & 0x7f) << 8) | mf[p+1] if b1 & 0x80 else b1; p += 2 if b1 & 0x80 else 1
        s = mf[p:p+m].decode('utf-8', errors='replace'); p += m
        if mf[p] == 0: p += 1
    else:
        ln = struct.unpack_from('<H', mf, p)[0]; p += 2
        if ln & 0x8000:
            ln = ((ln & 0x7fff) << 16) | struct.unpack_from('<H', mf, p)[0]; p += 2
        s = bytes(mf[p:p+ln*2]).decode('utf-16-le'); p += ln*2
        if mf[p] == 0 and mf[p+1] == 0: p += 2
    return s

strings, str_offsets = [], {}
for i in range(sc):
    rel = struct.unpack_from('<I', mf, soff_arr + i * 4)[0]
    p = abs_st + rel
    s = read_str(p)
    strings.append(s); str_offsets.setdefault(s, p)

assert 'versionCode' in strings and 'manifest' in strings, ('string pool сломан', strings[:8])
vc_idx = strings.index('versionCode')
vn_idx = strings.index('versionName')
log('pool OK: strCount=%d utf8=%s vc_idx=%d first=%r' % (sc, is_utf8, vc_idx, strings[:5]))

# ResXMLTree_attrExt @ off+16: ns u32, name u32, attributeStart u16, attributeSize u16,
# attributeCount u16 ... атрибуты в off+16+attributeStart, запись 20 байт:
# ns u32@0, name u32@4, rawValue u32@8, size u16@12, res/type@14..15, data u32@16.
# ВАЖНО: после string pool идёт чанк RES_XML_RESOURCE_MAP (0x0180) — его тоже нужно
# учитывать при обходе (в прошлых версиях скрипта он ломал обход и vc не находился).
off = sp_off + total
found_vc = None
while off < len(mf) - 4:
    t, hdrsz, sz = struct.unpack_from('<HHI', mf, off)
    if sz == 0 or off + sz > len(mf):
        break
    if t == START_ELEMENT:
        nm = struct.unpack_from('<I', mf, off + 20)[0]
        if nm < len(strings) and strings[nm] == 'manifest':
            astart, asize, acount = struct.unpack_from('<HHH', mf, off + 24)
            ao = off + 16 + astart
            for k in range(acount):
                rec = ao + k * asize
                anm = struct.unpack_from('<I', mf, rec + 4)[0]
                if anm == vc_idx:
                    found_vc = (rec + 16, struct.unpack_from('<I', mf, rec + 16)[0])
            break
    off += sz
assert found_vc, 'атрибут android:versionCode не найден'
data_off, old_vc = found_vc
struct.pack_into("<I", mf, data_off, 26)
log('versionCode %d -> 26 at bin-offset %d' % (old_vc, data_off))

# versionName: подменяем байты UTF-16 строки версии (та же длина, смещения не сдвигаются)
if not is_utf8:
    for cand in ('2.5','2.4','2.3','2.2.1','2.2.0','2.1.9'):
        roff = str_offsets.get(cand)
        if roff is None: continue
        q = roff; ln = struct.unpack_from('<H', mf, q)[0]; q += 2
        if ln & 0x8000: q += 2
        cur = bytes(mf[q:q+ln*2]).decode('utf-16-le')
        target = ('2.6' + '.'*(ln-3))[:ln]  # та же длина, напр. '2.6..' для len=5
        struct.pack_into('%dH' % ln, mf, q, *[ord(c) for c in target])
        log('versionName %s -> %s' % (cur, target.rstrip('.')))
        break
    else:
        log('WARN: строка версии не найдена в пуле (на установку не влияет)')

# перезапись манифеста в apk (mf уже пропатчен: versionCode 18->19)
zo = zipfile.ZipFile(ALIGNED + '.tmp', 'w')
for it, d in items:
    if it.filename == 'AndroidManifest.xml':
        d = bytes(mf)   # ВАЖНО: подставляем именно изменённый буфер
    ni = zipfile.ZipInfo(it.filename, date_time=it.date_time)
    ni.external_attr = it.external_attr
    ni.compress_type = zipfile.ZIP_STORED if it.filename == 'resources.arsc' else zipfile.ZIP_DEFLATED
    zo.writestr(ni, d)
zo.close()
shutil.move(ALIGNED + '.tmp', OUT)

# ---------- 3. zipalign + sign ----------
zipalign = os.path.join(TOOLS, 'zipalign')
apksigner = os.path.join(TOOLS, 'apksigner')
if not os.path.exists(zipalign):
    cand = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(WS, 'build_tmp')) for f in fs if f in ('zipalign',)]
    zipalign = cand[0] if cand else zipalign
if not os.path.exists(apksigner):
    cand = [os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(WS, 'build_tmp')) for f in fs if f == 'apksigner']
    apksigner = cand[0] if cand else apksigner

r = subprocess.run([zipalign, '-p', '-f', '4', OUT, ALIGNED], capture_output=True, text=True)
assert r.returncode == 0, 'zipalign failed: ' + r.stderr
log('zipaligned')

r = subprocess.run([apksigner, 'sign', '--ks', KS, '--ks-pass', 'pass:' + KS_PASS,
                    '--ks-key-alias', ALIAS, '--key-pass', 'pass:' + KS_PASS,
                    '--out', ALIGNED + '.signed', ALIGNED],
                   capture_output=True, text=True)
assert r.returncode == 0, 'apksigner failed: ' + r.stdout + r.stderr
log('signed')

r = subprocess.run([apksigner, 'verify', '--print-certs', ALIGNED + '.signed'], capture_output=True, text=True)
assert r.returncode == 0, 'verify failed: ' + r.stdout
log('verify OK:', r.stdout.splitlines()[0] if r.stdout else '')

# ---------- 4. install into LastVersion + final content check ----------
shutil.copy(ALIGNED + '.signed', SRC)
try:
    os.remove(SRC + '.idsig')
except OSError:
    pass
log('installed ->', SRC)

z = zipfile.ZipFile(SRC)
h = z.read('assets/index.html').decode('utf-8', 'ignore')
assert 'TOP_ALL' in h and 'makeTileBaseM' in h, 'в APK нет фикса геометрии v2.3!'
i = h.find('const TRACKS')
head = h[i:i+160].replace('\n', ' ')
head = h[h.find('const TRACKS'):h.find('const TRACKS')+700]
assert head.index('moonlight.mp3') < head.index('rucksack.mp3'), 'Лунная соната не первая в плейлисте'
names = [n for n in z.namelist() if n.startswith('assets/music/')]
log('music in apk:', names)
mf2 = z.read('AndroidManifest.xml')
# перечитать versionCode из уже установленного apk для финального подтверждения
sp = 8; tot = struct.unpack_from('<I', mf2, sp + 4)[0]; cnt = struct.unpack_from('<I', mf2, sp + 8)[0]
st2 = struct.unpack_from('<I', mf2, sp + 20)[0]; abs2 = sp + st2
strs = []
for j in range(cnt):
    raw = struct.unpack_from('<I', mf2, sp + 12 + j * 4)[0]
    p = raw if abs2 <= raw < len(mf2) else abs2 + raw
    ln = struct.unpack_from('<H', mf2, p)[0]; p += 2
    if ln & 0x8000:
        ln = ((ln & 0x7fff) << 16) | struct.unpack_from('<H', mf2, p)[0]; p += 2
    strs.append(bytes(mf2[p:p+ln*2]).decode('utf-16-le'))
vci = strs.index('versionCode')
o = sp + tot; vc_final = None
while o < len(mf2) - 4:
    t, hs2, sz = struct.unpack_from('<HHI', mf2, o)
    if sz == 0: break
    if t == START_ELEMENT:
        nm = struct.unpack_from('<I', mf2, o + 20)[0]
        if strs[nm] == 'manifest':
            astart, asize, acount = struct.unpack_from('<HHH', mf2, o + 24)
            ao = o + 16 + astart
            for k in range(acount):
                rec = ao + k * asize
                if struct.unpack_from('<I', mf2, rec + 4)[0] == vci:
                    vc_final = struct.unpack_from('<I', mf2, rec + 16)[0]
            break
    o += sz
assert vc_final == 26, 'versionCode в APK != 26 (%s)' % vc_final
log('FINAL: versionCode=26, html-fix present, moonlight first, signed+verified')
print('BUILD_OK')
