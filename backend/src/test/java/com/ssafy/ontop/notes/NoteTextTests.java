package com.ssafy.ontop.notes;

import com.ssafy.ontop.notes.domain.NoteText;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NoteTextTests {

    @Test
    void 이모지는_FE와_같이_UTF16_두글자로_세어_300자_경계를_검사한다() {
        assertThat(new NoteText("😀".repeat(150)).value()).hasSize(300);
        assertThatThrownBy(() -> new NoteText("😀".repeat(150) + "a"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 정규화로_짧아지더라도_원문이_300자를_넘으면_거절한다() {
        assertThatThrownBy(() -> new NoteText("가".repeat(151)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 한글을_NFC로_합친_뒤_최소_한글자를_검사한다() {
        assertThat(new NoteText("가".repeat(1)).value()).isEqualTo("가");
        assertThatThrownBy(() -> new NoteText("가".repeat(0)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 제어_서식문자를_제거해도_내부_줄바꿈과_탭과_CR은_유지한다() {
        assertThat(new NoteText("\0의\u200B견\t입력\r\n내용\u007F").value()).isEqualTo("의견\t입력\r\n내용");
        assertThat(new NoteText("의견\u0085입력내용").value()).contains("\u0085");
    }

    @Test
    void 자바_strip과_다른_공백도_JavaScript_trim과_같이_정리한다() {
        assertThat(new NoteText("\u00A0\u3000\t 의견을 남깁니다 \u202F\uFEFF").value())
                .isEqualTo("의견을 남깁니다");
        assertThat(new NoteText("a\u00A0b\tc\nd").value()).isEqualTo("a\u00A0b\tc\nd");
    }

    @Test
    void 비어있거나_공백만_있거나_정리후_비면_거절한다() {
        for (String value : new String[] {null, "", "    \t\n", "\u200B\u0001"}) {
            assertThatThrownBy(() -> new NoteText(value)).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
