# Hanamaru · はなまる — JLPT N5 сургалтын платформ

Япон хэлийг **монгол тайлбартайгаар** эхнээс нь JLPT N5 түвшин хүртэл заах веб апп.

- **Client:** React 19 + TypeScript + Vite + Tailwind CSS 4 (`client/`)
- **Server:** Node.js + Express 5 + Zod (`server/`)
- **Database:** SQLite + Prisma 6 (`server/prisma/`)

## Эхлүүлэх

Шаардлага: Node.js 20.19+ (22 зөвлөмжтэй).

```bash
npm run setup     # багц суулгах + өгөгдлийн сан үүсгэх + агуулга seed хийх
npm run dev       # API :4000, Web :5173 → http://localhost:5173
```

Туршилтын бүртгэл: `demo@hanamaru.app` / `demo12345` (эсвэл шинээр бүртгүүлнэ).

| Команд | Үйлдэл |
|---|---|
| `npm run dev` | API ба Vite dev серверийг зэрэг асаана |
| `npm run build && npm start` | Production build; сервер `client/dist`-ийг :4000 дээр үйлчилнэ |
| `npm test` | Серверийн unit + API тест (22) |
| `npm run e2e` | Playwright E2E тест (20) — эхлээд `npx playwright install chromium` |
| `npm run db:reset -w server` | Өгөгдлийн санг бүрэн шинэчилж дахин seed хийнэ |
| `npm run db:seed -w server` | Зөвхөн агуулгыг дахин оруулна (хэрэглэгчид үлдэнэ, ахиц цэвэрлэгдэнэ) |

Орчны хувьсагч: `server/.env` (жишээ — `server/.env.example`). Production дээр `JWT_SECRET`-ийг заавал солино.

## Агуулга

| | Тоо |
|---|---|
| Модуль / хичээл | 14 / 66 |
| Хирагана + катакана | 231 тэмдэгт (дакүтэн, нийлмэл үе, っ, урт эгшиг, гадаад хослол) |
| Үг | 544 (жишээ өгүүлбэр, монгол + англи утга) |
| Ханз | 104 (он/кун уншлага, зураасны тоо, жишээ) |
| Дүрэм | 67 (тайлбар, жишээ, түгээмэл алдаа, дасгал) |
| Өгүүллэг / сонсгол / ярих | 13 / 12 / 10 |
| Асуулт / шалгалт | 3,143 / 105 (хичээлийн мини шалгалт, 13 модулийн шалгалт, JLPT N5 загвар шалгалт) |

Агуулгын эх файлууд: `server/prisma/content/*.ts`. Засаад `npm run db:seed -w server`.

## Бүтэц

```
server/src/
  routes/     auth, settings, lessons, library, practice, quiz, review, progress
  lib/        srs (давталтын алгоритм), grading (хариу шалгах), kana, stats, achievements
  tests/      node:test unit + supertest API тест
server/prisma/
  schema.prisma, seed.ts, content/ (хичээл, үг, ханз, дүрэм, өгүүллэг…)
client/src/
  components/ AppShell, ui, cards, kana, writing (зураасны дараалал + canvas), charts
  components/quiz/  QuizEngine (нэг дахин ашиглагдах шалгалтын хөдөлгүүр), QuestionView, QuizResults
  pages/      Dashboard, Learn, Lesson, Kana, Kanji, Vocabulary, Grammar, Stories, Translation,
              Listening, Speaking, Review, Tests, Jlpt, Practice, Progress, Settings, Auth
client/e2e/   Playwright тест
```

## Лиценз ба эх сурвалж

Ханз, канагийн зураасны дарааллын өгөгдөл: [KanjiVG](https://kanjivg.tagaini.net) © Ulrich Apel, CC BY-SA 3.0 (`client/public/kanjivg/`, дахин татах: `npx tsx scripts/fetch-kanjivg.ts` — `server/` дотроос).
