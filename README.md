# TU Shooting Scoreboard

ผลการแข่งขันยิงปืน ISSF แบบสด สำหรับ TU Shooting Club — เว็บ static (GitHub Pages) + Supabase
Live ISSF shooting scoreboard for TU Shooting Club — static site (GitHub Pages) + Supabase. No build step.

| หน้า / Page | ใครใช้ / Who | ทำอะไร / What |
|---|---|---|
| `index.html` | ทุกคน (ไม่ต้องล็อกอิน) | ตารางผลสด 4 แท็บ, อ่านอย่างเดียว · `?c=<competition id>` เลือกรายการ |
| `board.html` | จอโปรเจกเตอร์ | ตัวใหญ่, สลับแท็บทุก 15 วินาที (`?every=20` เปลี่ยนเวลา), Space = หยุด/เล่นต่อ, ←/→ เปลี่ยนแท็บ |
| `staff.html` | เจ้าหน้าที่ | ล็อกอิน, สร้าง/ตั้งค่าการแข่งขัน, เพิ่มนักกีฬา, กรอกคะแนน, วางจาก Excel, คัดลอก CSV |

โครงสร้าง / Layout: `js/config.js` (URL + publishable key) · `js/supabase.js` (client + realtime) · `js/scoring.js` (logic ล้วน ไม่มี DOM) · `js/render.js` (ตารางที่ใช้ร่วมกัน) · `js/staff.js` · `css/style.css` · `supabase/migrations/*.sql` · `tests/scoring.test.js` · `prototype/` (ต้นแบบเดิม)

## ตั้งค่า Supabase / Supabase setup

1. รัน migration ตามลำดับใน SQL Editor (หรือผ่าน Supabase MCP / CLI): `001_init.sql`, `002_harden.sql`, `003_set_active.sql`
   Run the migrations in order in the SQL Editor (or via MCP / CLI).
2. ทุกคนอ่านได้ (anon `SELECT`) แต่เขียนได้เฉพาะคนที่อยู่ในตาราง `staff` (RLS + `is_staff()`). Realtime เปิดที่ `competitions` และ `athletes`.
   Everyone can read; only users in `staff` can write.
3. แนะนำ: Dashboard → Authentication → Providers/Passwords → เปิด *Leaked password protection*, และปิด *Allow new users to sign up* (Authentication → Sign In / Providers) เพื่อไม่ให้ใครสมัครบัญชีเองได้
   Recommended: enable leaked-password protection and disable public sign-ups.

## เพิ่มเจ้าหน้าที่ / Adding staff

1. Dashboard → Authentication → Users → **Add user** → ใส่อีเมล + รหัสผ่าน (ติ๊ก *Auto Confirm User*)
2. คัดลอก User UID แล้วรันใน SQL Editor:

```sql
insert into public.staff (user_id) values ('<USER UID>');
```

ลบสิทธิ์ / Remove: `delete from public.staff where user_id = '<USER UID>';`

บัญชีที่ล็อกอินได้แต่ไม่อยู่ใน `staff` จะเห็น “บัญชีนี้ไม่มีสิทธิ์กรอกคะแนน” และเขียนข้อมูลไม่ได้
A signed-in user who is not in `staff` sees “no access” and cannot write.

## รันในเครื่อง / Run locally

```bash
npx serve .
```

เปิด http://localhost:3000 (`/index.html`, `/board.html`, `/staff.html`)
ทดสอบ logic: `node tests/scoring.test.js` (เทียบผลกับ logic ของ `prototype/issf-scorer.html`)

## Deploy บน GitHub Pages

1. Push ขึ้น GitHub
2. Settings → Pages → Source: *Deploy from a branch* → branch `main`, folder `/ (root)`
3. เปิด `https://<user>.github.io/<repo>/` (ไม่ต้อง build). ใช้ publishable key ใน `js/config.js` ได้ตามปกติ — ความปลอดภัยอยู่ที่ RLS ไม่ใช่การซ่อน key. **ห้ามใส่ `service_role` / secret key**

## วิธีใช้งานสั้น ๆ / Quick use

- Staff: สร้างการแข่งขัน → เลือกรายการ + จำนวนนับทีม (2–4) → **ตั้งเป็นรายการที่แสดง** (active ได้ทีละหนึ่ง) → เพิ่มนักกีฬา / วางจาก Excel → คลิกแถวเพื่อกรอกคะแนน
- วางจาก Excel: คอลัมน์ `ชื่อ · สังกัด · ประเภท(W/M) · ผลัด · เลน · S1..Sn`
- กรอกคะแนน: *รวมชุด* (`89-1x`, `102.4`) หรือ *ทีละนัด* (0–10 / X, 0.0–10.9) · Enter/Backspace เลื่อนช่อง · บันทึกอัตโนมัติ ~0.4 วินาที สถานะแสดงมุมขวา ถ้าผิดพลาดจะมีปุ่ม “ลองบันทึกใหม่”
- ชุดที่มีการกรอกทีละนัด จะใช้ค่าทีละนัดแทนค่ารวมชุด
