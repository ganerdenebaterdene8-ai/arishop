# arishop

## 360° 3D загвар (автомат)

Барааны зургаас Meshy AI-аар 3D загвар үүсгэж, сайт дээр "360°" товчоор харуулна.

- `scripts/make-3d.mjs` + `.github/workflows/make-3d.yml` — өдөр бүр шинэ бараанд загвар үүсгэнэ (өдөрт 5 хүртэл, 1 загвар ≈ 30 Meshy кредит), шахаж Vercel Blob-д хадгалаад Firestore `prices/<нэр>.model3d`-д бичнэ.
- `viewer360.js` — model3d-тэй барааны зураг дээр "360°" товч гаргаж, эргүүлж харах / AR цонх нээнэ.

Нэг удаагийн тохиргоо:
1. Vercel → Storage → Create → **Blob** (арилжааны нэр: arishop-models) → токеныг хуулна.
2. GitHub → Settings → Secrets and variables → Actions → **New repository secret**:
   `MESHY_API_KEY`, `BLOB_READ_WRITE_TOKEN` (`FIREBASE_API_KEY` аль хэдийн байгаа).
3. (Сонголт) Variables → `MESHY_MAX_PER_DAY` = өдөрт үүсгэх загварын тоо.
4. Actions → "Барааны 360° 3D загвар" → Run workflow.

Чанар муу загварыг нуух: Run workflow → `remove` талбарт барааны нэр.
