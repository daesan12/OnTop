package com.ssafy.ontop.ai;

import java.text.Normalizer;
import java.util.regex.Pattern;

/** Only detects score claims; numbers used to explain a joke remain valid input to the safety guard. */
final class JokeReactionScoreText {
    private static final String NUMBER="[0-9]+(?:[.,][0-9]+)?";
    private static final String KOREAN_NUMBER="[영공일이삼사오육칠팔구십백]+(?:\\s*점\\s*[영공일이삼사오육칠팔구]+)?";
    private static final Pattern SCORE=Pattern.compile(
            NUMBER+"\\s*(?:점(?!프)|포인트|points?\\b)"
            +"|"+NUMBER+"\\s+out\\s+of\\s+"+NUMBER
            +"|(?:이번\\s*개그|평가\\s*결과|채점\\s*결과)(?:는|은)?\\s*"+NUMBER+"\\s*/\\s*"+NUMBER
            +"|(?:점수|총점|평점|score)\\s*(?:는|은|가|이|:|=|of|is)?\\s*(?:"+NUMBER+"|"+KOREAN_NUMBER+"(?:\\s*점))"
            +"|(?<![가-힣])[일이삼사오육칠팔구]?(?:십[일이삼사오육칠팔구]?|백)\\s*점|만점",
            Pattern.CASE_INSENSITIVE);

    private JokeReactionScoreText() { }

    static boolean containsScore(String text) {
        // Normalize a copy for matching; never rewrite the reaction sent to Jev or shown to the user.
        return SCORE.matcher(Normalizer.normalize(text,Normalizer.Form.NFKC)).find();
    }
}
