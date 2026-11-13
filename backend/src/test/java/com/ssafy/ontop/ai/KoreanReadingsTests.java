package com.ssafy.ontop.ai;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class KoreanReadingsTests {
    @Test void restoresSeparatedAndInvisibleKoreanSpellingWithoutAProfanityList() {
        assertThat(KoreanReadings.candidates("님도라이세요?")).contains("님또라이세요");
        assertThat(KoreanReadings.candidates("도\u200b.라.이")).contains("도라이","또라이");
        assertThat(KoreanReadings.candidates("시 발")).contains("시발","씨발");
    }
    @Test void hypothesesAreAlsoProducedForHarmlessWordsAndDoNotDeclareThemAbusive() {
        assertThat(KoreanReadings.candidates("도라지 차")).contains("도라지차","또라지차");
        assertThat(KoreanReadings.candidates("오늘도 좋은 하루")).contains("오늘또좋은하루");
        assertThat(KoreanReadings.candidates("hello")).isEmpty();
    }
    @Test void candidateCountAndTextLengthAreBounded() {
        assertThat(KoreanReadings.candidates("가나다바사자".repeat(15))).hasSizeLessThanOrEqualTo(8)
                .allMatch(text -> text.length()<=160);
        assertThat(KoreanReadings.candidates("가".repeat(161))).isEmpty();
    }
}
