// Kana utilities shared by the seed script and the grader.

const DIGRAPHS: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo', びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo', ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  // extended combinations used in katakana loanwords (written here in hiragana form)
  てぃ: 'ti', でぃ: 'di', ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo', しぇ: 'she', じぇ: 'je', ちぇ: 'che',
  とぅ: 'tu', どぅ: 'du', ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
};

const MONOGRAPHS: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゔ: 'vu',
};

/** Convert katakana characters to hiragana (other characters are kept). */
export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Convert hiragana characters to katakana (other characters are kept). */
export function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

export function isKana(text: string): boolean {
  return /^[぀-ヿー]+$/.test(text);
}

export function hasKanji(text: string): boolean {
  return /[一-龯㐀-䶿々]/.test(text);
}

/**
 * Hepburn-style romanisation for learners. Long vowels are written by doubling
 * the vowel (こうこう → koukou, コーヒー → koohii) so learners can type them.
 */
export function kanaToRomaji(input: string): string {
  const text = toHiragana(input);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const pair = text.slice(i, i + 2);
    if (ch === 'っ') {
      const next = DIGRAPHS[text.slice(i + 1, i + 3)] ?? MONOGRAPHS[text[i + 1]] ?? '';
      if (next.startsWith('ch')) out += 't';
      else if (next) out += next[0];
      continue;
    }
    if (ch === 'ー') {
      const lastVowel = out.match(/[aeiou](?=[^aeiou]*$)/)?.[0];
      out += lastVowel ?? '-';
      continue;
    }
    if (DIGRAPHS[pair]) {
      out += DIGRAPHS[pair];
      i++;
      continue;
    }
    if (ch === 'ん') {
      // n' before a vowel or y to avoid ambiguity (きんえん → kin'en)
      const next = MONOGRAPHS[text[i + 1]] ?? '';
      out += /^[aeiouy]/.test(next) ? "n'" : 'n';
      continue;
    }
    out += MONOGRAPHS[ch] ?? ch;
  }
  return out;
}

/** Romaji for a sentence token — particles は/へ/を are read wa/e/o. */
export function tokenRomaji(surface: string, reading?: string): string {
  if (surface === 'は') return 'wa';
  if (surface === 'へ') return 'e';
  if (surface === 'を') return 'o';
  const source = reading || surface;
  if (!/[぀-ヿ]/.test(source)) return source;
  return kanaToRomaji(source);
}
