# TU Shooting Scoreboard

ผลการแข่งขันยิงปืน ISSF แบบสด สำหรับ TU Shooting Club — เว็บ static (GitHub Pages) + Supabase ไม่ต้อง build
Live ISSF shooting scoreboard for TU Shooting Club — static site (GitHub Pages) + Supabase. No build step.

## หน้าเว็บ / Pages

| หน้า / Page  | ใครใช้ / Who           | ทำอะไร / What                                                                                                                                                                              |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html` | ทุกคน (ไม่ต้องล็อกอิน) | ตารางผลสด 4 แท็บ (หญิง/ทีมหญิง/ชาย/ทีมชาย), ค้นหา + กรองผลัด, แตะชื่อเพื่อดูรายละเอียด, เวลาอัปเดตล่าสุด, ปุ่มพิมพ์ · `?c=<competition id>` เลือกรายการ · `?q=ชื่อ&relay=2` ลิงก์ที่กรองไว้แล้ว |
| `board.html` | จอโปรเจกเตอร์          | ตัวใหญ่ ไม่มีปุ่มควบคุม, สลับแท็บทุก 15 วินาที (`?every=20` เปลี่ยนเวลา), Space = หยุด/เล่นต่อ, ←/→ เปลี่ยนแท็บ, ป้าย LIVE และเวลาอัปเดตล่าสุด                                          |
| `results.html` | ทุกคน | รายการผลย้อนหลังทุกการแข่งขัน (ชื่อ, รายการ, จำนวนนักกีฬา, เวลาคะแนนล่าสุด) ค้นหาได้ — กด “ดูผล” เปิด `index.html?c=<id>` พร้อมแถบ “ผลย้อนหลัง”; การแข่งขันที่ไม่มีนักกีฬาจะไม่แสดง |
| `print.html` | ทุกคน / เจ้าหน้าที่    | ใบสรุปผลสำหรับพิมพ์ A4 แนวนอน ขาว-ดำ (หญิง, ทีมหญิง, ชาย, ทีมชาย + ช่องเซ็นชื่อ) · `?print=1` เปิดหน้าต่างพิมพ์อัตโนมัติ                                                                |
| `staff.html` | เจ้าหน้าที่ (ล็อกอิน)  | สร้าง/ตั้งค่าการแข่งขัน, เพิ่มนักกีฬา, กรอกคะแนน, วางจาก Excel, ประวัติการแก้ไข + ย้อนกลับ, พิมพ์ผล, คัดลอกผลไปวางใน Sheets/Excel                                                        |

ทุกหน้ามีปุ่มสลับภาษา **ไทย / English** และโหมด **สว่าง / มืด** (จำค่าที่เลือกไว้ในเครื่อง)
Every page has a **Thai / English** switch and a **light / dark** button (remembered per device).

## โครงสร้างไฟล์ / Layout

| ไฟล์ / File                              | หน้าที่ / Purpose                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `js/config.js`                           | Supabase URL + publishable key (ใส่ในเบราว์เซอร์ได้ — ความปลอดภัยอยู่ที่ RLS)    |
| `js/supabase.js`                         | client + ดึงข้อมูล/Realtime (รีเฟรชเองทุก 30 วินาทีเป็นตัวสำรอง)                  |
| `js/scoring.js`                          | logic คะแนนล้วน ๆ ไม่มี DOM: อ่านคะแนน, อันดับ, tie-break, ทีม, import, CSV/TSV |
| `js/render.js`                           | ตารางผลที่ใช้ร่วมกันทุกหน้า + การ์ดรายละเอียดนักกีฬา + เวลาอัปเดต               |
| `js/staff.js`                            | หน้า staff ทั้งหมด (ล็อกอิน, กรอกคะแนน, แป้นกดบนจอ, ประวัติ, import)            |
| `js/i18n.js`, `js/theme.js`              | สลับภาษา / สว่าง-มืด                                                           |
| `js/vendor/supabase.js`                  | supabase-js 2.49.4 (MIT) เก็บไว้ในโปรเจกต์ ไม่โหลดจาก CDN — หน้าเว็บเปิดได้แม้ CDN ถูกบล็อกที่สนาม |
| `js/xlsx.js`                             | สร้างไฟล์ Excel (.xlsx) ในเบราว์เซอร์ ไม่ใช้ไลบรารีภายนอก                       |
| `css/style.css`, `css/print.css`         | หน้าตา (แดง-ขาว สว่าง / แดง-ดำ มืด) และหน้าพิมพ์                                |
| `supabase/migrations/*.sql`              | โครงสร้างฐานข้อมูล 001–006 (รันตามลำดับ)                                       |
| `templates/athlete-import-template.xlsx` | เทมเพลต Excel สำหรับนำเข้ารายชื่อ                                              |
| `tests/scoring.test.js`, `prototype/`    | ทดสอบ logic เทียบกับต้นแบบเดิม                                                  |

## ตั้งค่า Supabase / Supabase setup

1. รัน migration ตามลำดับใน SQL Editor (หรือผ่าน Supabase MCP / CLI):
   `001_init.sql` ตาราง + RLS + realtime · `002_harden.sql` · `003_set_active.sql` ตั้งรายการที่แสดงทีละหนึ่ง · `004_patch_athlete.sql` บันทึกแบบแก้เฉพาะจุด (สองคนกรอกพร้อมกันไม่ทับกัน) · `005_athlete_log.sql` ประวัติการแก้ไข · `006_current_relay.sql` ผลัดที่กำลังยิง
   Run the migrations in order (001 → 006).
2. ทุกคนอ่านได้ (anon `SELECT`) แต่เขียนได้เฉพาะคนที่อยู่ในตาราง `staff` (RLS + `is_staff()`). ประวัติ (`athlete_log`) อ่านได้เฉพาะ staff และเขียนผ่าน trigger เท่านั้น
   Everyone can read the scoreboard; only users in `staff` can write; the history table is staff-read-only and written only by a trigger.
3. แนะนำ: Dashboard → Authentication → Sign In / Providers → ปิด _Allow new users to sign up_ และเปิด _Leaked password protection_ (ถ้าแพ็กเกจรองรับ)
   Recommended: disable public sign-ups and enable leaked-password protection.
4. ฟรีแพลนของ Supabase จะ **หยุดโปรเจกต์ชั่วคราวถ้าไม่มีการใช้งานราว 1 สัปดาห์** — เปิดเข้าดูโปรเจกต์ก่อนวันแข่ง
   Free Supabase projects pause after about a week of no activity — open the project before the event.

## เพิ่ม/ลบเจ้าหน้าที่ / Adding and removing staff

1. Dashboard → Authentication → Users → **Add user** → ใส่อีเมล + รหัสผ่าน (ติ๊ก _Auto Confirm User_)
2. รันใน SQL Editor:

```sql
insert into public.staff (user_id)
select id from auth.users where email = 'อีเมลของเขา@example.com';
```

ลบสิทธิ์ / Remove: `delete from public.staff where user_id = '<USER UID>';`

บัญชีที่ล็อกอินได้แต่ไม่อยู่ใน `staff` จะเห็น “บัญชีนี้ไม่มีสิทธิ์กรอกคะแนน” และเขียนข้อมูลไม่ได้
A signed-in user who is not in `staff` sees “not allowed” and cannot write.

## วิธีใช้งานวันแข่ง / Using it on competition day

**เตรียมการแข่งขัน / Set up** (หน้า `staff.html`)

1. **+ สร้างการแข่งขัน** → ตั้งชื่อ, เลือกรายการ (10m Air Pistol/Rifle 60/40/30, 50m Rifle 3P, 25m Pistol) และจำนวนนับทีม (2–4)
2. เพิ่มนักกีฬาทีละคน หรือ **วางจาก Excel** (ใช้เทมเพลตในหน้านั้น: `ชื่อ · สังกัด · ประเภท(W/M) · ผลัด · ลู่ · S1..Sn`) — การนำเข้า _เพิ่ม_ รายชื่อ ไม่ได้แทนที่ นำเข้าซ้ำจะได้ซ้ำ
3. กด **ตั้งเป็นรายการที่แสดง** — หน้าสาธารณะและจอใหญ่จะแสดงรายการนี้ (แสดงได้ทีละหนึ่ง)

**กรอกคะแนน / Enter scores** — คลิกแถวนักกีฬา แล้วเลือกโหมด

- **รวมชุด**: พิมพ์ `89-1x` (89 คะแนน 1 X) หรือ `89`; ปืนยาวทศนิยมพิมพ์ `102.4` แล้วกด Enter
- **ทีละนัด**: 0–10 หรือ X (ปืนสั้น), 0.0–10.9 (ปืนยาว) · Enter/Backspace เลื่อนช่อง · ชุดที่กรอกทีละนัดจะใช้ค่าทีละนัดแทนค่ารวมชุด
- **แป้นกดบนจอ (มือถือ/แท็บเล็ต)**: เปิดอัตโนมัติบนหน้าจอสัมผัส หรือกดปุ่ม ⌨ — ปืนสั้น 1 แตะ/นัด (0–10, X); ปืนยาว 2 แตะ/นัด (จำนวนเต็ม แล้วทศนิยม); ช่องรวมชุดมีปุ่ม `- x ⌫` และ **ถัดไป ▸** · แตะช่องที่มีค่าแล้วกดปุ่มแรกจะ _แทนที่_ ค่าเดิม
- บันทึกอัตโนมัติ ~0.4 วินาที สถานะที่มุมขวา (“✓ บันทึกแล้ว”) ถ้าผิดพลาดจะมีปุ่ม **ลองบันทึกใหม่** · สองคนแก้นักกีฬาคนเดียวกันพร้อมกันได้ ระบบบันทึกเฉพาะที่แก้ จึงไม่ทับกัน

**กำลังยิง / Now shooting** — เลือก “กำลังยิง” ที่แถบด้านบนของหน้า staff (รายชื่อผลัดมาจากนักกีฬาในรายการ) หน้าสาธารณะและจอใหญ่จะไฮไลต์แถวของผลัดนั้นและมีป้าย “● กำลังยิง: ผลัด N” — เลือก “— ไม่ระบุ —” เพื่อปิด

**ประวัติการแก้ไข / History** — ปุ่ม **ประวัติการแก้ไข** แสดงใคร แก้อะไร เมื่อไร (150 รายการล่าสุด, กรองเฉพาะนักกีฬาที่เลือกได้)

- **ย้อนกลับ**: คืนค่าเดิมของรายการนั้น ถ้าค่านั้นถูกแก้ไปอีกแล้วจะไม่ย้อน (กันทับงานใหม่)
- **กู้คืน**: นำนักกีฬาที่ถูกลบกลับมา (id เดิม ประวัติเดิมยังอยู่)

**ผู้ชม / Spectators** (`index.html`) — ตารางอัปเดตสด; ช่องค้นหา (ชื่อหรือสังกัด) และตัวกรองผลัด (ลำดับที่แสดงยังเป็นอันดับจริง); แตะแถวเพื่อเปิดการ์ดนักกีฬา: คะแนนแต่ละชุด และ _ผลรายนัด เฉพาะชุดที่กรอกแบบทีละนัด_ (ชุดที่กรอกเป็นคะแนนรวมจะไม่มีข้อมูลรายนัด); มี “อัปเดตล่าสุด hh:mm:ss” = เวลาที่คะแนนเปลี่ยนล่าสุด

**พิมพ์ / ส่งออก / Print and export**

- **พิมพ์ผล** → `print.html` แล้วกดพิมพ์ (กระดาษ A4 แนวนอน)
- **ดาวน์โหลด Excel (.xlsx)** → ไฟล์ Excel จริง (แผ่นข้อมูล, บุคคลหญิง, ทีมหญิง, บุคคลชาย, ทีมชาย) ตัวเลขเป็นตัวเลขจริง เรียง/รวมได้ · มีที่หน้า staff และหน้า `print.html`
- **คัดลอกผล (วางใน Sheets)** → วางใน Google Sheets/Excel แล้วแยกเป็นคอลัมน์ให้เอง
- หลังจบรอบ แนะนำให้คัดลอกผลเก็บไว้เป็นไฟล์สำรอง
  Tip: after each round, copy the results into a spreadsheet as a backup.

## กติกาคะแนน / Scoring rules

- 1 ชุด = 10 นัด; คะแนนเต็มหน่วย + X (ปืนสั้น/3P) หรือทศนิยม สูงสุด 10.9 ต่อนัด (ปืนยาวลม)
- **Tie-break** (เต็มหน่วย): รวม → จำนวน X → ชุดสุดท้ายย้อนหลัง → นัดสุดท้ายย้อนหลัง; (ทศนิยม): เหมือนกันแต่ไม่มี X · ผลเท่ากันทุกอย่างได้อันดับเท่ากัน
- **ทีม**: จัดกลุ่มตาม “สังกัด” ภายในประเภทเดียวกัน คะแนนทีม = สมาชิกที่ดีที่สุด N คน (N ตั้งไว้ต่อการแข่งขัน) จัดอันดับด้วยรวม แล้ว X · แถวสีจางคือไม่นับเข้าทีม
- **ชื่อสังกัดเทียบแบบไม่สนตัวพิมพ์ใหญ่-เล็กและช่องว่างเกิน** (`TU`, `tu`, ` TU ` = ทีมเดียวกัน; แสดงด้วยการสะกดที่พบมากที่สุด) แต่ `T U` หรือ `T.U.` คือทีมอื่น — ควรสะกดให้เหมือนกัน
  Team names match ignoring case and extra spaces; `T U` / `T.U.` are different teams — spell them consistently.

## โลโก้ ไอคอน และภาพตัวอย่างเมื่อแชร์ลิงก์ / Branding and share preview

- ไฟล์อยู่ในโฟลเดอร์ `img/` (ใช้โลโก้ Thammasat Shooting Club จริง): `logo.png` (ป้ายโลโก้พื้นดำในหัวทุกหน้า), `logo-print.png` (โลโก้พื้นโปร่งใสสำหรับใบพิมพ์ผลและโปสเตอร์ QR บนกระดาษขาว), `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` (ไอคอนแท็บ/หน้าจอโฮม), `og-image.png` (1200×630 ภาพที่ LINE/Facebook แสดงตอนแชร์ลิงก์; ต้นฉบับ `og-source.html`) และ `logo-source.jpg` (โลโก้เต็มพร้อมชื่อชมรม)
- **เปลี่ยนโลโก้**: เตรียมไฟล์โลโก้ใหม่ แล้วสร้าง `logo.png` (สี่เหลี่ยมโค้งมน 256px), `favicon-32.png`, `apple-touch-icon.png`, `icon-192/512.png` และ `og-image.png` ใหม่ (เรนเดอร์ `og-source.html` ด้วยเบราว์เซอร์)
- ภาพตัวอย่างเป็นแบบเดียวกันทุกครั้ง (เว็บ static ทำภาพแยกตามการแข่งขันไม่ได้) แท็กอยู่ใน `<head>` ของ `index.html`, `board.html`, `results.html` — ที่อยู่ใน `og:url`/`og:image`/`twitter:image` ใช้โดเมน `https://shooting.lnynano.com` (ต้องตรงกับไฟล์ `CNAME`; `node tests/domain.test.js` ตรวจให้) **ถ้าเปลี่ยนโดเมน ให้แก้ `CNAME` และที่อยู่เหล่านี้พร้อมกัน**
LINE/Facebook จดจำภาพตัวอย่างไว้ (cache): ถ้าเปลี่ยนภาพแล้วยังเห็นของเดิม ให้ใช้ Facebook Sharing Debugger กด “Scrape Again” หรือรอสักพัก
  The real club logo is used (`img/logo.png` etc.); regenerate the PNGs if you change it. The share tags use `https://shooting.lnynano.com`; keep them in sync with the `CNAME` file (checked by `tests/domain.test.js`).

## รันในเครื่อง / Run locally

```bash
npx serve .
```

เปิด http://localhost:3000 (`/index.html`, `/board.html`, `/staff.html`, `/print.html`)

## ทดสอบ / Tests

```bash
node tests/scoring.test.js
node tests/xlsx.test.js
node tests/render.test.js          # ข้อความอันตรายถูก escape (XSS)
node tests/import.test.js          # อ่านข้อมูลที่วางจาก Excel
node tests/patch.test.js           # ตัวช่วยบันทึก (สองคนกรอกพร้อมกันไม่ทับกัน)
node tests/athlete-events.test.js  # Realtime รวมถึงการลบนักกีฬา
node tests/domain.test.js          # CNAME ตรงกับที่อยู่ในแท็กแชร์
node tests/anon-security.test.js   # ต่อ API จริง: ผู้ชมทั่วไปอ่านผลได้อย่างเดียว (SKIP_NETWORK_TESTS=1 เพื่อข้าม)
```

เทียบ `js/scoring.js` กับ logic ของ `prototype/issf-scorer.html` (อ่านคะแนน, อันดับ, tie-break, ทีม — ข้อมูลสุ่ม ~9,700 รายการ) และมีเคสทีม/ชื่อสังกัดเพิ่ม
GitHub Actions รันชุดทดสอบนี้อัตโนมัติทุก pull request และทุกครั้งที่ push เข้า `main` (`.github/workflows/test.yml`)
GitHub Actions runs these tests on every pull request and every push to `main`.

## Deploy บน GitHub Pages + โดเมน shooting.lnynano.com

1. Push ขึ้น GitHub
2. Settings → Pages → Source: _Deploy from a branch_ → branch `main`, folder `/ (root)` ไฟล์ `CNAME` ที่ราก (`shooting.lnynano.com`) ตั้งโดเมนให้
3. **DNS** (ที่ผู้ให้บริการโดเมน `lnynano.com`): เพิ่มเรคคอร์ด `CNAME` ชื่อ `shooting` ชี้ไปที่ `lnynano.github.io` (ห้ามใส่ชื่อ repo) รอ DNS อัปเดตแล้วใน Settings → Pages ติ๊ก **Enforce HTTPS** (ใบรับรองออกให้อัตโนมัติภายในไม่กี่นาที)
4. เปิด `https://shooting.lnynano.com/` (ไม่ต้อง build; deploy ใหม่ประมาณ 1 นาทีหลัง merge เข้า `main`) ลิงก์เดิม `lnynano.github.io/tu-shooting-scoreboard/` และ QR ที่พิมพ์ไปแล้วจะถูก redirect มาโดเมนใหม่อัตโนมัติ
5. ใช้ publishable key ใน `js/config.js` ได้ตามปกติ — ความปลอดภัยอยู่ที่ RLS ไม่ใช่การซ่อน key. **ห้ามใส่ `service_role` / secret key**
6. ผู้ใช้ staff ต้องล็อกอินใหม่หนึ่งครั้งบนโดเมนใหม่ (เซสชันเก็บแยกตามโดเมน) ไม่ต้องตั้งค่า CORS/Redirect ใน Supabase สำหรับการล็อกอินด้วยอีเมล+รหัสผ่าน แต่ถ้าใช้อีเมลรีเซ็ตรหัสผ่าน ให้ตั้ง Authentication → URL Configuration → Site URL เป็น `https://shooting.lnynano.com`

## แก้ปัญหา / Troubleshooting

| อาการ / Symptom                          | ทำอย่างไร / What to do                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| หน้าเว็บขึ้น “OFFLINE”                   | ตรวจอินเทอร์เน็ต; หน้าจะต่อใหม่เองและรีเฟรชข้อมูลทุก 30 วินาที                                   |
| “ยังไม่มีการแข่งขันที่เปิดแสดงอยู่”      | เข้า `staff.html` แล้วกด **ตั้งเป็นรายการที่แสดง**                                             |
| หน้า staff บอก “ไม่มีสิทธิ์”             | ยังไม่ได้เพิ่มบัญชีใน `staff` (ดูหัวข้อเพิ่มเจ้าหน้าที่)                                        |
| บันทึกไม่สำเร็จ / ไม่ขึ้น ✓              | กด **ลองบันทึกใหม่**; ถ้ายังไม่ได้ ตรวจเน็ตหรือว่าโปรเจกต์ Supabase ถูกหยุดชั่วคราวหรือไม่       |
| ทีมแยกเป็นสองทีมทั้งที่เป็นสังกัดเดียวกัน | ตรวจการสะกดชื่อสังกัด (ดู กติกาคะแนน → ทีม)                                                     |
| ลืมรหัสผ่าน                              | Dashboard → Authentication → Users → ส่งรีเซ็ตรหัสผ่าน                                          |
