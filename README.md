# نظام الموارد البشرية الداخلي

لوحة ويب بالعربية لمديري النظام وموارد البشرية في **اللواء للخدمات القانونية**. الموظفون يستخدمون تطبيق الموبايل. الطرفان يتحدثان مع نفس الـ API.

التوثيق الكامل (المنطق التشغيلي، صفحات الويب، تطبيق الموبايل، وكل نقاط النهاية) موجود هنا:

**[docs/DOCUMENTATION.md](./docs/DOCUMENTATION.md)**

## تشغيل اللوحة محلياً

```bash
cp .env.example .env
npm install
npm run dev
```

Set `API_PROXY_TARGET` in `.env` (server-side only). Requests to `/api` are proxied to that host.

الدخول مسموح لرتبتي `ADMIN` و `HR` فقط.
