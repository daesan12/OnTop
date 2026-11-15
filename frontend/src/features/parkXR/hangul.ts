const initial = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ']
const medial = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ']
const final = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
const vowels: Record<string, string> = { 'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ' }
const clusters: Record<string, string> = { 'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ', 'ㄹㅂ': 'ㄼ',
  'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ' }
const split = new Map(Object.entries(clusters).map(([pair, value]) => [value, pair]))

/** Compose the jamo entered on the controller keyboard. Keep the key history for backspace. */
export function composeHangul(keys: readonly string[]) {
  let text = '', first = '', vowel = '', last = ''
  const flush = () => {
    text += first && vowel ? String.fromCodePoint(0xac00 + (initial.indexOf(first) * 21 + medial.indexOf(vowel)) * 28 + final.indexOf(last))
      : first || vowel
    first = vowel = last = ''
  }
  for (const key of keys) {
    if (medial.includes(key)) {
      if (last) {
        const pair = split.get(last)
        const next = pair?.[1] ?? last
        last = pair?.[0] ?? ''
        flush(); first = next; vowel = key
      } else if (!vowel) vowel = key
      else if (vowels[vowel + key]) vowel = vowels[vowel + key]!
      else { flush(); vowel = key }
    } else if (initial.includes(key)) {
      if (first && vowel && !last && final.includes(key)) last = key
      else if (last && clusters[last + key]) last = clusters[last + key]!
      else { flush(); first = key }
    } else { flush(); text += key }
  }
  flush()
  return text
}
