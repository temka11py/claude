# Hanamaru · はなまる — Япон хэл N5 → N2

Япон хэлийг **монгол тайлбартайгаар** эхнээс нь JLPT N2 түвшин хүртэл заах веб апп. Гол зарчим нь **өдөр бүр нэг сэдэв, түүнийг 2–5 минутын жижиг алхмуудад хуваах** явдал.

- **Client:** React 19 + TypeScript + Vite + Tailwind CSS 4 (`client/`)
- **Server:** Node.js + Express 5 + Zod (`server/`)
- **Database:** SQLite + Prisma 6 (`server/prisma/`)
- **Furigana:** kuromoji (IPADIC) — серверт ажиллана, `/api/furigana`

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
| `npm test` | Серверийн unit + API тест (27) |
| `npm run e2e` | Playwright E2E тест — эхлээд `npx playwright install chromium` |
| `npm run db:seed -w server` | Агуулгыг дахин оруулна. **Хэрэглэгчийн ахиц хадгалагдана** (доор үз) |
| `npm run db:reset -w server` | Өгөгдлийн санг бүрэн устгаж дахин үүсгэнэ — ахиц устна |

Орчны хувьсагч: `server/.env` (жишээ — `server/.env.example`). Production дээр `JWT_SECRET`-ийг заавал солино.

## Өдрийн хөтөлбөр

Нүүр хуудас (**Өнөөдөр**) нь өнөөдрийн өдрийг нэг товчтой харуулна. Өдөр бүр нэг сэдэвтэй бөгөөд дараах алхмуудаас бүрдэнэ:

| Алхам | Агуулга |
|---|---|
| Давталт | SRS флэш карт (≤10), нэмэлт |
| Шинэ үг ①② | Жагсаалт → флэш карт → үг холбох (≤8 үг/алхам) |
| Ханз | 2–3 ханз: уншлага, жишээ, зураасны дараалал, бичих, богино шалгалт |
| Дүрэм | Нэг алхамд нэг дүрэм + 3 асуулт |
| Яриа / Уншлага | Харилцан яриа, өгүүллэг эсвэл текст (furigana-тай) + асуулт |
| Сонсгол | Сонсголын дасгал эсвэл "өгүүлбэр сонсоод утгыг сонго" |
| Ярих | Сонсоод давтах (яриа таних) + чөлөөт ярих даалгавар |
| Тоглоом | Судоку (ханзан тоо, кана) эсвэл үг холбох, нэмэлт |
| Өдрийн шалгалт | Duolingo маягийн: шууд хариу, алдсан асуулт дахин гарна |

- Нэгж бүр **давталтын өдрөөр** төгсдөг. N5-ын төгсгөлд загвар шалгалтыг 4 хэсэгт (≤9 асуулт) хувааж өгнө.
- **XP**: алхам бүр +10, 90%+ авбал +5, өдөр дуусгавал +20. Өдрийн зорилго 50 XP, мөн 3 өдрийн даалгавар бий.
- **Цаг**: дээд хэсэгт өнөөдрийн идэвхтэй хугацаа секунд тутам явна. 2 минут идэвхгүй бол ⏸ зогсоно.
- **Furigana**: бүх ханзтай өгүүлбэр дээр автоматаар гарна (Тохиргоо → "Фуригана харуулах"). Ханз унших асуултад хариуг илчлэхгүйн тулд гарахгүй.
- Хичээлүүд (номын сан) бүгд нээлттэй; дараалал нь хөтөлбөрөөр удирдагдана.

## Агуулга

| | Тоо |
|---|---|
| Хөтөлбөрийн өдөр | **271, бүгд бэлэн** (N5 64 · N4 67 · N3 74 · N2 66, нэгж бүрийн давталтын өдөр орсон) |
| Хирагана + катакана | 231 тэмдэгт |
| Үг / ханз / дүрэм | 1,928 / 623 / 411 |
| Сонсгол / ярих | 185 / 183 |
| Асуулт | 11,710 |

Агуулгын эх файлууд: `server/prisma/content/`.

- `program-n5.ts`: N5-ын өдрүүд, мөн тэдгээрт ямар өгүүллэг, сонсгол, ярих даалгавар оногдсон.
- `program-outline.ts`: N4 → N2-ын нэгж, өдөр, дүрмийн бүдүүвч.
- `levels/nX-uYY.ts`: N4–N2-ын өдрүүд, нэгж тус бүр тусдаа файлд (`LevelDayContent`). Бичих дүрэм нь `levels/CONTENT_GUIDE.md`-д байна. Өдөр засах эсвэл нэмэхдээ `npx tsx prisma/validate-levels.ts` (server/ дотроос) ажиллуулаад, 0 алдаатай болсны дараа `npm run db:seed -w server` хийнэ.
- `prisma/program-build.ts`: агуулгыг богино алхмуудад хуваана (үг ≤8, ханз ≤3, нэг алхамд нэг дүрэм).

### Seed хийхэд ахиц хадгалагдана

`db:seed` нь агуулгыг шинээр үүсгэдэг тул ID-ууд өөрчлөгддөг. Тиймээс ахицыг (хичээл, өдрүүд, SRS карт, шалгалт, дуртай үг) тогтвортой түлхүүрээр (slug, тэмдэгт, үг + уншлага…) хадгалаад буцааж холбоно (`prisma/preserve.ts`). Snapshot-ыг сэргээх хүртэл `prisma/.learning-snapshot.json`-д хадгалдаг. Тиймээс seed дундаа унасан ч дахин ажиллуулахад ахиц алдагдахгүй. Нөөц DB-ээс ахиц гаргах: `npx tsx prisma/recover-snapshot.ts <backup.db>` (server/ дотроос), дараа нь `db:seed`.

## Бүтэц

```
server/src/
  routes/     auth, settings, lessons, library, practice, quiz, review, progress,
              program (хөтөлбөр, XP, флэш картын багц), furigana
  lib/        srs, grading, kana, stats, achievements, furigana (kuromoji)
  tests/      node:test unit + supertest API тест
server/prisma/
  schema.prisma, seed.ts, program-build.ts, preserve.ts, content/
client/src/
  components/day/   алхмууд (steps), DrillRunner, FlashDeck, games (судоку, үг холбох)
  components/       AppShell (цэс + цагийн тоолуур), ui (Jp — furigana), cards, kana, writing
  pages/      Today, Program, Day, Flashcards, Games + номын сангийн хуудсууд
client/e2e/   Playwright тест, screens.mts / flow.mts (гараар шалгах screenshot)
```

## Лиценз ба эх сурвалж

- Ханз, канагийн зураасны дарааллын өгөгдөл: [KanjiVG](https://kanjivg.tagaini.net) © Ulrich Apel, CC BY-SA 3.0 (`client/public/kanjivg/`, дахин татах: `npx tsx scripts/fetch-kanjivg.ts` — `server/` дотроос).
- Furigana: [kuromoji.js](https://github.com/takuyaa/kuromoji.js) (Apache-2.0), IPADIC толь бичиг.
