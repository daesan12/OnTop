package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.List;

/** Explicitly constructed only; webhooks never come from user text. Redirects are disabled. */
public final class MattermostNotifier implements AiNotifier {
    private final URI webhook;
    private final ObjectMapper mapper;
    private final HttpClient client;
    public MattermostNotifier(String webhook,ObjectMapper mapper) {
        this(webhook,mapper,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    }
    MattermostNotifier(String webhook,ObjectMapper mapper,HttpClient client) {
        this.client=client;
        this.webhook=URI.create(webhook); this.mapper=mapper;
        if(!"https".equals(this.webhook.getScheme()) || this.webhook.getHost()==null || this.webhook.getUserInfo()!=null)
            throw new IllegalArgumentException("HTTPS Mattermost Webhook 필요");
    }
    @Override public String send(String id,String kind,String text) {
        return send(id,kind,text,null);
    }
    @Override public String send(String id,String kind,String text,Double modelScore) {
        try {
            var request=HttpRequest.newBuilder(webhook).timeout(Duration.ofSeconds(5)).header("Content-Type","application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload(id,kind,text,modelScore)))).build();
            var result=client.send(request,HttpResponse.BodyHandlers.discarding());
            if(result.statusCode()<200 || result.statusCode()>=300) throw new IllegalStateException("MM 전송 실패");
            return "MATTERMOST";
        } catch(InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException("MM 중단"); }
        catch(java.io.IOException exception) { throw new IllegalStateException("MM 연결 실패"); }
    }
    static Map<String,Object> payload(String id,String kind,String text) {
        return payload(id,kind,text,null);
    }
    static Map<String,Object> payload(String id,String kind,String text,Double modelScore) {
        String title=switch(kind) {
            case "NEGATIVE_SPEECH" -> "거친 언행 · 주의 요청";
            case "PROFANITY_RULE" -> "욕설 규칙 감지";
            case "CONFLICT_SUSPECTED" -> "갈등 의심 · 중재 요청";
            case "ABUSE", "VIOLATION" -> "모욕 감지";
            case "CONFLICT" -> "갈등 감지";
            case "ABUSE_AND_CONFLICT" -> "모욕·갈등 감지";
            case "URGENT_FEEDBACK" -> "소리함 · 빠른 확인 필요";
            case "FEEDBACK_DIGEST" -> "소리함 · 제보 요약";
            default -> "";
        };
        var metadata=Map.of("ontop_notice_id",id);
        if(title.isEmpty()) return Map.of("text",text,"props",metadata);
        String category=switch(kind) { case "NEGATIVE_SPEECH", "PROFANITY_RULE", "CONFLICT_SUSPECTED" -> "경찰 안내"; case "URGENT_FEEDBACK" -> "긴급 지원"; case "FEEDBACK_DIGEST" -> "일반 제보"; default -> "채팅 검수"; };
        String icon=switch(kind) {
            case "URGENT_FEEDBACK" -> "🚨";
            case "FEEDBACK_DIGEST" -> "📬";
            default -> "🛡️";
        };
        String color=switch(kind) { case "CONFLICT", "CONFLICT_SUSPECTED" -> "#D99A22"; case "PROFANITY_RULE" -> "#E88A32"; case "NEGATIVE_SPEECH" -> "#87929F"; case "FEEDBACK_DIGEST" -> "#4C8EDA"; default -> "#D94F4F"; };
        var card=new java.util.LinkedHashMap<String,Object>();
        if(kind.equals("NEGATIVE_SPEECH")){
            boolean scored=modelScore!=null&&Double.isFinite(modelScore)&&modelScore>=0&&modelScore<=1;
            String level=scored?(modelScore>=.85?"우선 확인":modelScore>=.7?"주의":modelScore>=.5?"안내":"기준 미만"):"점수 없음";
            if(scored)color=modelScore>=.85?"#D94F4F":modelScore>=.7?"#E88A32":modelScore>=.5?"#D6AC32":"#87929F";
            card.put("fields",List.of(Map.of("title","검토 단계","value",level,"short",true),
                    Map.of("title","모델 판단 점수 · 묶음 최댓값","value",scored?Double.toString(modelScore):"기록 없음","short",true)));
        }else if(kind.equals("PROFANITY_RULE"))card.put("fields",List.of(Map.of("title","감지 방식","value","욕설 규칙 · 모델 점수 없음","short",true)));
        // Incoming webhooks require attachments at the top level, unlike the REST posts API.
        card.put("fallback","OnTop · "+category+" · "+title);card.put("color",color);
        card.put("pretext",icon+" **"+category+"**");card.put("title","OnTop · "+title);card.put("text",text);
        return Map.of("props",metadata,"attachments",List.of(card));
    }
}
