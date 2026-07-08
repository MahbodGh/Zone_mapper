# نقشه‌کش زون‌ها (Zone Mapper)

پروژه تحت وب برای ترسیم زون‌ها روی نقشه، ثبت مشخصات هر زون (نام زون، نام منطقه، نام صاحب زون، رنگ) و خروجی گرفتن تجمیعی در فرمت‌های:

**KML · KMZ · PDF · DXF · GDB · GPX**

- بک‌اند: **Python (FastAPI + SQLite)**
- فرانت‌اند: **React (Vite) + Leaflet + Leaflet.Draw**

## امکانات

- ترسیم زون به‌صورت چندضلعی یا مستطیل روی نقشه OpenStreetMap
- فرم ثبت مشخصات بعد از هر ترسیم (نام زون، منطقه، صاحب زون، رنگ)
- ویرایش مشخصات و ویرایش مرز زون‌ها (جابه‌جایی گره‌ها) و حذف زون
- لیست زون‌ها با **چک‌باکس انتخاب** + گزینه «انتخاب همه»
- خروجی گرفتن از یک زون، چند زون یا همه زون‌ها — همه انتخاب‌ها **در قالب یک فایل واحد تجمیع** می‌شوند

## اجرا

### ۱) بک‌اند (پایتون ۳.۱۰ به بالا)

```bash
cd backend
python -m venv venv
source venv/bin/activate          # ویندوز: venv\Scripts\activate
pip install -r requirements.txt
pip install arabic-reshaper python-bidi   # اختیاری: نمایش درست فارسی در PDF
uvicorn main:app --reload --port 8000
```

دیتابیس SQLite به‌صورت خودکار در فایل `backend/zones.db` ساخته می‌شود.

### ۲) فرانت‌اند (Node.js 18 به بالا)

```bash
cd frontend
npm install
npm run dev
```

سپس مرورگر را باز کنید: **http://localhost:5173**
(درخواست‌های `/api` به‌صورت خودکار به بک‌اند روی پورت ۸۰۰۰ پراکسی می‌شوند.)

## API

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/zones` | لیست زون‌ها |
| POST | `/api/zones` | ایجاد زون |
| PUT | `/api/zones/{id}` | ویرایش زون |
| DELETE | `/api/zones/{id}` | حذف زون |
| POST | `/api/export` | خروجی: `{"zone_ids": [1,2,3], "format": "kml"}` |

## نکات فرمت‌های خروجی

- **KML / KMZ**: هر زون یک Polygon با نام، رنگ و توضیحات (منطقه/صاحب). قابل باز شدن در Google Earth.
- **PDF**: صفحه اول نقشه زون‌ها با برچسب و راهنما، صفحه دوم جدول مشخصات. برای نمایش صحیح متن فارسی، بسته‌های `arabic-reshaper` و `python-bidi` را نصب کنید و در صورت تمایل فونت `Vazirmatn-Regular.ttf` را در پوشه `backend/fonts/` قرار دهید.
- **DXF**: هر زون در یک لایه جداگانه با پلی‌لاین بسته و برچسب متنی. مختصات به‌صورت درجه (WGS84).
- **GDB**: ژئودیتابیس ArcGIS (FileGDB) با یک لایه `zones` شامل فیلدهای name، region، owner. چون GDB یک پوشه است، خروجی به‌صورت فایل zip دانلود می‌شود؛ آن را از حالت فشرده خارج کرده و پوشه `zones.gdb` را در ArcGIS/QGIS باز کنید. (نیازمند GDAL نسخه ۳.۶ به بالا که همراه pyogrio نصب می‌شود.)
- **GPX**: چون GPX از پلی‌گان پشتیبانی نمی‌کند، مرز هر زون به‌صورت Track بسته و مرکز آن به‌صورت Waypoint با نام زون ذخیره می‌شود.

## ساختار پروژه

```
zone-mapper/
├── backend/
│   ├── main.py              # FastAPI + CRUD + endpoint خروجی
│   ├── database.py          # مدل SQLite
│   ├── requirements.txt
│   └── exporters/           # kml_kmz.py, gpx.py, dxf.py, pdf.py, gdb.py
└── frontend/
    ├── index.html           # RTL + فونت وزیرمتن
    └── src/
        ├── App.jsx
        ├── api.js
        ├── styles.css
        └── components/      # MapView, ZoneForm, ZoneList, ExportPanel
```
