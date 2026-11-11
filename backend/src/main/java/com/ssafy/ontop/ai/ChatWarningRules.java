package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Pattern;

/** Same dictionary, normalization and boundaries as frontend filterChat. No independent blacklist. */
public final class ChatWarningRules {
    public static final String PROVIDER="SHARED_CHAT_FILTER:v2";
    private static final List<Pattern> RULES=load();
    private ChatWarningRules() { }
    private static List<Pattern> load() {
        try(var input=ChatWarningRules.class.getResourceAsStream("/ai/filterRules.json")){
            if(input==null)throw new IllegalStateException("채팅 필터 사전 없음");
            var data=new ObjectMapper().readTree(input);var rules=new ArrayList<Pattern>();
            String gap="[\\s\\p{P}\\p{S}\\p{Cf}0-9]{0,3}";
            for(String key:List.of("KOREAN_WORDS","INITIALS","ENGLISH_WORDS"))for(var node:data.path(key)){
                String word=node.asText();String letters=String.join(gap,Normalizer.normalize(word,Normalizer.Form.NFKC).codePoints().mapToObj(c->Pattern.quote(new String(Character.toChars(c)))).toList());
                String regex=switch(key){case "KOREAN_WORDS"->letters+(word.equals("시발")?"(?!점|역)":"");case "INITIALS"->"(?<![\\p{L}\\p{N}])"+letters+"(?![\\p{L}\\p{N}])";default->"(?<![a-z0-9])"+letters+"(?![a-z0-9])";};
                rules.add(Pattern.compile(regex,Pattern.UNICODE_CHARACTER_CLASS));
            }
            return List.copyOf(rules);
        }catch(java.io.IOException e){throw new IllegalStateException("채팅 필터 사전 오류",e);}
    }
    public static boolean matches(String text) {
        var normalized=new StringBuilder();
        Normalizer.normalize(text,Normalizer.Form.NFC).codePoints().forEach(c->normalized.append(Normalizer.normalize(new String(Character.toChars(c)),Normalizer.Form.NFKC).toLowerCase(Locale.ROOT)));
        return RULES.stream().anyMatch(rule->rule.matcher(normalized).find());
    }
}
