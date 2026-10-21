// The N5 daily program: every day is one topic, built from an existing lesson and
// split by the seed into short steps (words, kanji, grammar, reading, listening,
// speaking, game, quiz). Stories, listening and speaking tasks are assigned to the
// day whose topic they fit; days without one get generated sentence practice.

export type DayKind = 'kana' | 'lesson' | 'review' | 'exam';
export type GameKind = 'sudoku' | 'match';

export interface ProgramDayDef {
  slug: string;
  kind?: DayKind; // default 'lesson'
  /** Lesson key the day's words, grammar, examples and dialogue come from. */
  lesson?: string;
  title?: string; // defaults to the lesson title
  titleJa?: string;
  goal: string; // "Өнөөдөр …" — what the learner can do after the day
  story?: string; // story slug
  readings?: number[]; // indexes into READINGS
  listening?: string[]; // listening exercise slugs
  speaking?: string; // speaking prompt slug
  game?: GameKind;
  /** Review days: lessons whose words/grammar are mixed into the review quiz. */
  reviewOf?: string[];
  /** Exam day: mock exam sections as separate short steps. */
  mock?: boolean;
}

export interface ProgramUnitDef {
  title: string;
  titleJa: string;
  days: ProgramDayDef[];
}

export const N5_PROGRAM: ProgramUnitDef[] = [
  {
    title: 'Хирагана', titleJa: 'ひらがな',
    days: [
      { slug: 'n5-hiragana-1', kind: 'kana', lesson: '0.1', goal: 'あ, か, さ мөрийн 15 үсгийг танина, дуудна.', game: 'match' },
      { slug: 'n5-hiragana-2', kind: 'kana', lesson: '0.2', goal: 'た, な, は мөрийн үсгүүдийг танина.', game: 'match' },
      { slug: 'n5-hiragana-3', kind: 'kana', lesson: '0.3', goal: 'ま, や, ら, わ мөр ба ん — хирагана бүрэн.', game: 'sudoku' },
      { slug: 'n5-hiragana-4', kind: 'kana', lesson: '0.4', goal: 'が, ざ, ば, ぱ гэх мэт дакүтэнтэй үсгүүд.', game: 'match' },
      { slug: 'n5-hiragana-5', kind: 'kana', lesson: '0.5', goal: 'きゃ, しゅ, っ, урт эгшгийг уншина.', game: 'sudoku' },
    ],
  },
  {
    title: 'Катакана', titleJa: 'カタカナ',
    days: [
      { slug: 'n5-katakana-1', kind: 'kana', lesson: '0.6', goal: 'ア〜ホ хүртэлх катаканаг танина.', game: 'match' },
      { slug: 'n5-katakana-2', kind: 'kana', lesson: '0.7', goal: 'マ〜ン ба дакүтэнтэй катакана.', game: 'sudoku' },
      { slug: 'n5-katakana-3', kind: 'kana', lesson: '0.8', goal: 'ー урт авиа ба гадаад үгсийг уншина.', game: 'match' },
    ],
  },
  {
    title: 'Мэндчилгээ ба танилцуулга', titleJa: 'あいさつ・じこしょうかい',
    days: [
      { slug: 'n5-greetings', lesson: '1.1', goal: 'Өглөө, өдөр, оройн мэндчилгээ, баярлалаа, уучлаарай гэж хэлнэ.', listening: ['what-to-say'], game: 'match' },
      { slug: 'n5-self-introduction', lesson: '1.2', goal: 'Нэр, улс, ажлаа хэлж өөрийгөө танилцуулна.', story: 'self-introduction', speaking: 'self-intro', game: 'match' },
      { slug: 'n5-desu-negative', lesson: '1.3', goal: '"… биш" гэж үгүйсгэж хэлнэ (じゃありません).', game: 'sudoku' },
      { slug: 'n5-question-ka', lesson: '1.4', goal: 'か-аар асуулт тавьж, 何・だれ-ээр асууна.', game: 'match' },
      { slug: 'n5-particles-no-mo', lesson: '1.5', goal: '"миний", "бас" — の ба も нөхцөл.', game: 'match' },
      { slug: 'n5-kosoado', lesson: '1.6', goal: 'これ・それ・あれ-ээр юмыг заана.', game: 'match' },
      { slug: 'n5-review-1', kind: 'review', title: 'Давталт: Танилцах', titleJa: 'ふくしゅう ①', goal: 'Нэгжийн үг, дүрмээ бататгана.', reviewOf: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6'], game: 'sudoku' },
    ],
  },
  {
    title: 'Тоо, цаг, огноо', titleJa: 'かず・じかん',
    days: [
      { slug: 'n5-numbers', lesson: '2.1', goal: '0–100 хүртэл тоолж, утасны дугаар хэлнэ.', listening: ['phone-number'], game: 'sudoku' },
      { slug: 'n5-prices', lesson: '2.2', goal: 'Том тоо, үнэ асууж хэлнэ (いくらですか).', listening: ['price'], game: 'sudoku' },
      { slug: 'n5-time', lesson: '2.3', goal: 'Цаг, минут хэлж, хэдэн цагт гэж асууна.', listening: ['meeting-time'], game: 'sudoku' },
      { slug: 'n5-days-dates', lesson: '2.4', goal: 'Гараг, сар, өдрийг хэлнэ.', game: 'sudoku' },
      { slug: 'n5-counters', lesson: '2.5', goal: '〜つ, 〜人, 〜まい гэх мэт тоолох дагавар.', game: 'sudoku' },
      { slug: 'n5-review-2', kind: 'review', title: 'Давталт: Тоо ба цаг', titleJa: 'ふくしゅう ②', goal: 'Тоо, цаг, огноогоо бататгана.', reviewOf: ['2.1', '2.2', '2.3', '2.4', '2.5'], game: 'sudoku' },
    ],
  },
  {
    title: 'Үйл үг ба нөхцөл', titleJa: 'どうし・じょし',
    days: [
      { slug: 'n5-masu-form', lesson: '3.1', goal: '〜ます / 〜ません-ээр өдөр тутмын үйлдлээ хэлнэ.', game: 'match' },
      { slug: 'n5-masu-past', lesson: '3.2', goal: 'Өчигдөр юу хийснээ хэлнэ (〜ました).', story: 'yesterday', game: 'match' },
      { slug: 'n5-particles-o-e-de', lesson: '3.3', goal: 'を, へ, で нөхцөлийг зөв хэрэглэнэ.', game: 'sudoku' },
      { slug: 'n5-particles-ni-to-de', lesson: '3.4', goal: 'に, と, で — цаг, хамт, газар.', story: 'school', game: 'match' },
      { slug: 'n5-invitations', lesson: '3.5', goal: 'Урих, санал болгох: 〜ませんか, 〜ましょう.', story: 'weekend', listening: ['weekend-plan'], speaking: 'weekend', game: 'match' },
      { slug: 'n5-review-3', kind: 'review', title: 'Давталт: Үйл үг', titleJa: 'ふくしゅう ③', goal: 'ます хэлбэр ба нөхцөлөө бататгана.', reviewOf: ['3.1', '3.2', '3.3', '3.4', '3.5'], game: 'sudoku' },
    ],
  },
  {
    title: 'Байршил ба өдөр тутам', titleJa: 'ばしょ・まいにち',
    days: [
      { slug: 'n5-arimasu-imasu', lesson: '4.1', goal: 'あります ба います — юм, хүн хаана байгааг хэлнэ.', game: 'match' },
      { slug: 'n5-positions', lesson: '4.2', goal: 'Дээр, доор, дотор, хажууд гэж байршил заана.', listening: ['where-bank'], game: 'sudoku' },
      { slug: 'n5-places', lesson: '4.3', goal: 'ここ・そこ・あそこ ба хотын газрууд.', game: 'match' },
      { slug: 'n5-daily-routine', lesson: '4.4', goal: 'Өдөр тутмын хэвшлээ ярина.', story: 'daily-routine', speaking: 'daily-life', game: 'match' },
      { slug: 'n5-family', lesson: '4.5', goal: 'Гэр бүлээ танилцуулна.', story: 'my-family', listening: ['family-photo'], speaking: 'family', game: 'match' },
      { slug: 'n5-review-4', kind: 'review', title: 'Давталт: Байршил ба гэр бүл', titleJa: 'ふくしゅう ④', goal: 'Байршил, хэвшил, гэр бүлийн үгсээ бататгана.', reviewOf: ['4.1', '4.2', '4.3', '4.4', '4.5'], game: 'sudoku' },
    ],
  },
  {
    title: 'Тэмдэг нэр', titleJa: 'けいようし',
    days: [
      { slug: 'n5-i-adjectives', lesson: '5.1', goal: 'い тэмдэг нэрээр юмыг дүрсэлнэ (たかい, やすい).', story: 'my-friend', game: 'match' },
      { slug: 'n5-na-adjectives', lesson: '5.2', goal: 'な тэмдэг нэр (きれい, しずか).', game: 'sudoku' },
      { slug: 'n5-adjectives-past', lesson: '5.3', goal: 'Тэмдэг нэрийн өнгөрсөн цаг: 〜かったです, 〜でした.', game: 'match' },
      { slug: 'n5-likes-skills', lesson: '5.4', goal: 'Дуртай, дургүй, сайн чаддаг зүйлээ хэлнэ.', story: 'hobby', speaking: 'hobby', game: 'match' },
      { slug: 'n5-comparison', lesson: '5.5', goal: 'Хоёр юмыг харьцуулна (〜より, いちばん).', speaking: 'favorite-food', game: 'sudoku' },
      { slug: 'n5-review-5', kind: 'review', title: 'Давталт: Тэмдэг нэр', titleJa: 'ふくしゅう ⑤', goal: 'Тэмдэг нэрийн хэлбэрүүдээ бататгана.', reviewOf: ['5.1', '5.2', '5.3', '5.4', '5.5'], game: 'sudoku' },
    ],
  },
  {
    title: 'Өдөр тутмын яриа', titleJa: 'にちじょうかいわ',
    days: [
      { slug: 'n5-shopping', lesson: '6.1', goal: 'Дэлгүүрээс юм асууж, худалдаж авна.', story: 'shopping', listening: ['shopping-bag'], speaking: 'shopping', game: 'sudoku' },
      { slug: 'n5-restaurant', lesson: '6.2', goal: 'Ресторанд хоол захиална.', story: 'restaurant', listening: ['restaurant-order'], speaking: 'restaurant', game: 'match' },
      { slug: 'n5-directions', lesson: '6.3', goal: 'Зам асууж, унаа хэрэглэнэ.', story: 'travel', speaking: 'directions', game: 'match' },
      { slug: 'n5-wants', lesson: '6.4', goal: 'Хүсэл илэрхийлнэ: 〜がほしい, 〜たい.', story: 'tomorrow', game: 'match' },
      { slug: 'n5-weather', lesson: '6.5', goal: 'Цаг агаар, улирлын тухай ярина.', story: 'weather', listening: ['weather-forecast'], speaking: 'weather', game: 'sudoku' },
      { slug: 'n5-review-6', kind: 'review', title: 'Давталт: Яриа', titleJa: 'ふくしゅう ⑥', goal: 'Дэлгүүр, ресторан, замын яриагаа бататгана.', reviewOf: ['6.1', '6.2', '6.3', '6.4', '6.5'], listening: ['quick-response'], game: 'sudoku' },
    ],
  },
  {
    title: 'Өгүүлбэрийн бүтэц', titleJa: 'ぶんのしくみ',
    days: [
      { slug: 'n5-wa-ga', lesson: '8.1', goal: 'は ба が-гийн ялгааг ойлгоно.', game: 'match' },
      { slug: 'n5-conjunctions', lesson: '8.2', goal: 'Өгүүлбэр холбоно: そして, でも, から.', game: 'sudoku' },
      { slug: 'n5-question-words', lesson: '8.3', goal: 'いつ, どこ, どうして гэх мэт асуух үгс.', game: 'match' },
      { slug: 'n5-sentence-endings', lesson: '8.4', goal: 'ね, よ, もう, まだ — ярианы өнгө.', game: 'match' },
      { slug: 'n5-review-7', kind: 'review', title: 'Давталт: Өгүүлбэр', titleJa: 'ふくしゅう ⑦', goal: 'Өгүүлбэрийн бүтцээ бататгана.', reviewOf: ['8.1', '8.2', '8.3', '8.4'], game: 'sudoku' },
    ],
  },
  {
    title: 'Үйл үгийн хэлбэр', titleJa: 'どうしのかたち',
    days: [
      { slug: 'n5-verb-groups', lesson: '9.1', goal: 'Үйл үгийн 3 бүлгийг ялгана.', game: 'match' },
      { slug: 'n5-te-form', lesson: '9.2', goal: 'て хэлбэр үүсгэж, 〜てください гэж хүснэ.', game: 'match' },
      { slug: 'n5-te-iru', lesson: '9.3', goal: '〜ています (одоо хийж байна), 〜てもいいです.', game: 'sudoku' },
      { slug: 'n5-nai-form', lesson: '9.4', goal: 'ない хэлбэр: 〜ないでください.', game: 'match' },
      { slug: 'n5-ta-form', lesson: '9.5', goal: 'た хэлбэр ба үйлийн дараалал.', game: 'match' },
      { slug: 'n5-plain-speech', lesson: '9.6', goal: 'Найзуудын энгийн яриа (ふつうたい).', game: 'sudoku' },
      { slug: 'n5-review-8', kind: 'review', title: 'Давталт: Хэлбэрүүд', titleJa: 'ふくしゅう ⑧', goal: 'て, ない, た хэлбэрээ бататгана.', reviewOf: ['9.1', '9.2', '9.3', '9.4', '9.5', '9.6'], game: 'sudoku' },
    ],
  },
  {
    title: 'N5 төгсгөл ба шалгалт', titleJa: 'N5 のまとめ',
    days: [
      { slug: 'n5-reading-1', lesson: '10.1', goal: 'Богино зар, мэдээлэл уншиж ойлгоно.', readings: [0, 1], listening: ['phone-number', 'meeting-time'], game: 'sudoku' },
      { slug: 'n5-reading-2', lesson: '10.2', goal: 'Өдөр тутмын тухай текст уншина.', readings: [2, 3], listening: ['shopping-bag', 'where-bank'], game: 'match' },
      { slug: 'n5-reading-3', lesson: '10.3', goal: 'Мэдэгдэл, хуваарь уншина.', readings: [4, 5], listening: ['restaurant-order', 'weekend-plan'], game: 'sudoku' },
      { slug: 'n5-review-vocab-kanji', kind: 'review', lesson: '12.1', goal: 'N5-ын үг ба ханзаа нэг дор давтана.', reviewOf: ['1.1', '2.1', '3.1', '4.1', '5.1', '6.1', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7'], game: 'sudoku' },
      { slug: 'n5-review-particles', kind: 'review', lesson: '12.2', goal: 'Бүх нөхцөлөө давтана.', reviewOf: ['1.5', '3.3', '3.4', '8.1'], game: 'match' },
      { slug: 'n5-review-forms', kind: 'review', lesson: '12.3', goal: 'Үйл үг, тэмдэг нэрийн хэлбэрүүдээ давтана.', reviewOf: ['3.1', '3.2', '5.3', '9.2', '9.4', '9.5'], game: 'sudoku' },
      { slug: 'n5-mock-exam', kind: 'exam', lesson: '13.1', title: 'JLPT N5 загвар шалгалт', titleJa: 'もぎしけん', goal: 'N5 шалгалтыг 4 богино хэсэгт хувааж өгнө.', mock: true, listening: ['exam-instructions'] },
    ],
  },
];
