package com.ssafy.ontop.ai;

/** Narrow provider boundary: decisions and scores only. No generated public text or state mutations. */
public interface JokeJudge {
    String PERSONA="""
            당신은 탑골공원에서 주민들과 장기를 두고 말장난을 즐기는 나이 지긋한 아재개그 심사위원이며 이름은 김부장이다.
            따뜻하고 능청스럽지만 평가에는 솔직하다. 상대는 '자네'라 부르고 자연스러운 하게체로만 말한다.
            문장 끝은 '~했네', '~구먼', '~일세', '~겠네', '~보게'처럼 첫 만남의 '도전해 보겠는가?'와 이어져야 한다.
            '~네요', '~해요', '~습니다' 같은 상담원 존댓말이나 '귀여운 퀴즈네요', '센스가 돋보입니다' 같은 평가 보고서 말투는 쓰지 마라.
            웃음소리는 최종 점수에 맞춰 서버가 앞에 붙이니 직접 쓰지 마라. 낡은 말투를 과장하지 말고 비웃음·훈계·과도한 칭찬 없이 짧고 구체적으로 말한다.
            """;
    String SIMILAR_REASON="앞선 작품과 말장난이 닮았구먼. 새로움은 조금만 쳐주겠네.";
    /** Server-selected comparison data only; never expose other users' answers through the API. */
    record Reference(String id,String question,String answer) { }
    record Evaluation(String status,int wordplayX10,int witX10,int originalityX10,String reason,String reaction,boolean integratedReaction) {
        public Evaluation(String status,int wordplayX10,int witX10,int originalityX10,String reason){this(status,wordplayX10,witX10,originalityX10,reason,"",false);}
        public Evaluation {
            if(!java.util.Set.of("SCORED","REJECTED","REVIEW","INVALID_JOKE").contains(status)
                    ||wordplayX10<0||wordplayX10>400||witX10<0||witX10>400||originalityX10<0||originalityX10>200)
                throw new IllegalArgumentException("심사 응답 범위 오류");
        }
    }
    Evaluation evaluate(String question,String answer);
    default Evaluation evaluate(String question,String answer,java.util.List<Reference> references){return evaluate(question,answer);}
    /** Safety-only gate; a scorer must never use another provider's joke-validity decision here. */
    default Evaluation screen(String question,String answer) { throw new UnsupportedOperationException("Safety screen unavailable"); }
    boolean safeReaction(String text);
    String mode();
    default java.util.Map<String,Long> usage(){return java.util.Map.of();}
    static JokeJudge fixture() { return new JokeJudge() {
        public Evaluation screen(String q,String a) { var value=evaluate(q,a);return java.util.Set.of("REJECTED","REVIEW").contains(value.status())?value:new Evaluation("SCORED",0,0,0,"SAFE_FIXTURE"); }
        public Evaluation evaluate(String q,String a) {
            if(q.contains("검수거절")||a.contains("검수거절"))return new Evaluation("REJECTED",0,0,0,"UNSUITABLE");
            if(q.contains("검수보류"))return new Evaluation("REVIEW",0,0,0,"UNCERTAIN");
            if(q.contains("심사장애"))throw new IllegalStateException("fixture provider failure");
            if(a.contains("명령무시")||a.contains("모르겠"))return new Evaluation("INVALID_JOKE",0,0,0,"NOT_A_JOKE");
            return new Evaluation("SCORED",315,340,168, "FIXTURE_NOT_REAL_SCORE");
        }
        public boolean safeReaction(String text){return !text.contains("검수거절");}
        public String mode(){return "OFFLINE_FIXTURE_NOT_REAL_JEV";}
    }; }
}
