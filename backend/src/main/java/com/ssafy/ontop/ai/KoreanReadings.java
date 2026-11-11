package com.ssafy.ontop.ai;

import java.text.Normalizer;
import java.util.LinkedHashSet;
import java.util.List;

/** Bounded spelling hypotheses, never a profanity detector or a reason to hide a message. */
public final class KoreanReadings {
    private KoreanReadings() { }
    public static List<String> candidates(String original) {
        String compact=Normalizer.normalize(original,Normalizer.Form.NFKC).replaceAll("[\\p{Z}\\p{P}\\p{Cf}\\s]","");
        if(compact.length()>160) return List.of();
        var result=new LinkedHashSet<String>();
        if(!compact.equals(original)) result.add(compact);
        for(int i=0;i<compact.length() && result.size()<8;i++) {
            char syllable=compact.charAt(i);
            if(syllable<0xAC00 || syllable>0xD7A3) continue;
            int onset=(syllable-0xAC00)/588;
            int tense=switch(onset) { case 0 -> 1; case 3 -> 4; case 7 -> 8; case 9 -> 10; case 12 -> 13; default -> -1; };
            if(tense<0) continue;
            char replacement=(char)(syllable+(tense-onset)*588);
            result.add(compact.substring(0,i)+replacement+compact.substring(i+1));
        }
        return List.copyOf(result);
    }
}
