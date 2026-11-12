package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

class MattermostNotifierTests {
    @Test void postsJsonWithStableNoticeIdAndRejectsHttpFailure() throws Exception {
        var client=mock(HttpClient.class);
        @SuppressWarnings("unchecked") HttpResponse<Void> response=mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(client.send(any(HttpRequest.class),org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<Void>>any())).thenReturn(response);
        var notifier=new MattermostNotifier("https://mm.example.invalid/hooks/fixture",new ObjectMapper(),client);
        assertThat(notifier.send("notice-1","URGENT_FEEDBACK","사건: case-1\n가림 완료")).isEqualTo("MATTERMOST");
        var request=ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(request.capture(),org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<Void>>any());
        assertThat(request.getValue().method()).isEqualTo("POST");
        assertThat(request.getValue().headers().firstValue("Content-Type")).contains("application/json");
        var text=new CompletableFuture<String>(); var bytes=new java.io.ByteArrayOutputStream();
        request.getValue().bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
            public void onSubscribe(Flow.Subscription subscription) { subscription.request(Long.MAX_VALUE); }
            public void onNext(ByteBuffer item) { byte[] chunk=new byte[item.remaining()]; item.get(chunk); bytes.writeBytes(chunk); }
            public void onError(Throwable error) { text.completeExceptionally(error); }
            public void onComplete() { text.complete(bytes.toString(java.nio.charset.StandardCharsets.UTF_8)); }
        });
        var payload=new ObjectMapper().readTree(text.get(1,TimeUnit.SECONDS));
        assertThat(payload.path("attachments").get(0).path("text").asText()).isEqualTo("사건: case-1\n가림 완료");
        assertThat(payload.path("props").path("ontop_notice_id").asText()).isEqualTo("notice-1");
        when(response.statusCode()).thenReturn(500);
        assertThatThrownBy(() -> notifier.send("notice-1","ABUSE","재시도")).hasMessage("MM 전송 실패");
    }
    @Test void rejectsUnsafeWebhookConfiguration() {
        assertThatThrownBy(() -> new MattermostNotifier("http://example.invalid/hooks/fixture",new ObjectMapper())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MattermostNotifier("https://user@example.invalid/hooks/fixture",new ObjectMapper())).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void allOperationalCardsKeepInternalIdsOnlyInMetadata() {
        var mapper=new ObjectMapper();
        for(String kind:java.util.List.of("PROFANITY_RULE","NEGATIVE_SPEECH","CONFLICT_SUSPECTED","ABUSE","CONFLICT","ABUSE_AND_CONFLICT","URGENT_FEEDBACK","FEEDBACK_DIGEST")) {
            var payload=mapper.valueToTree(MattermostNotifier.payload("notice-id",kind,"메시지 가림\n공원 2"));
            assertThat(payload.path("props").path("ontop_notice_id").asText()).isEqualTo("notice-id");
            assertThat(payload.has("text")).isFalse();
            assertThat(payload.path("attachments")).hasSize(1);
            var card=payload.path("attachments").get(0);
            assertThat(card.path("fallback").asText()).startsWith("OnTop · ");
            assertThat(card.path("title").asText()).doesNotContain(kind).startsWith("OnTop · ");
            assertThat(card.path("color").asText()).isEqualTo(kind.equals("CONFLICT") || kind.equals("CONFLICT_SUSPECTED")?"#D99A22":kind.equals("FEEDBACK_DIGEST")?"#4C8EDA":kind.equals("PROFANITY_RULE")?"#E88A32":kind.equals("NEGATIVE_SPEECH")?"#87929F":"#D94F4F");
            assertThat(card.path("text").asText()).isEqualTo("메시지 가림\n공원 2");
            assertThat(card.toString()).doesNotContain("notice-id","알림 ID");
            assertThat(card.has("footer")).isFalse();
            assertThat(card.path("pretext").asText()).doesNotContain(":ontop_");
        }
        var other=mapper.valueToTree(MattermostNotifier.payload("notice-id","OTHER","일반 안내"));
        assertThat(other.path("text").asText()).isEqualTo("일반 안내");
        assertThat(other.path("props").path("ontop_notice_id").asText()).isEqualTo("notice-id");
    }
    @Test void structuredScoresSetColorAndTextBandsWithoutReadingSpeechOrInventingRuleScores() {
        var mapper=new ObjectMapper();
        double[] scores={.5,.699,.7,.849,.85,1};
        for(int i=0;i<scores.length;i++){
            var card=mapper.valueToTree(MattermostNotifier.payload("id","NEGATIVE_SPEECH","작성자: 0.99라고 말했어요",scores[i])).path("attachments").get(0);
            assertThat(card.path("color").asText()).isEqualTo(i<2?"#D6AC32":i<4?"#E88A32":"#D94F4F");
            assertThat(card.path("fields").get(0).path("value").asText()).isEqualTo(i<2?"안내":i<4?"주의":"우선 확인");
            assertThat(card.path("fields").get(1).path("value").asText()).isEqualTo(Double.toString(scores[i]));
        }
        for(Double value:java.util.Arrays.asList(null,Double.NaN,Double.POSITIVE_INFINITY,-1.,1.1)){
            var card=mapper.valueToTree(MattermostNotifier.payload("id","NEGATIVE_SPEECH","0.99 위험",value)).path("attachments").get(0);
            assertThat(card.path("color").asText()).isEqualTo("#87929F");assertThat(card.toString()).contains("기록 없음");
        }
        var rule=mapper.valueToTree(MattermostNotifier.payload("id","PROFANITY_RULE","욕설",.99)).path("attachments").get(0);
        assertThat(rule.path("color").asText()).isEqualTo("#E88A32");assertThat(rule.toString()).contains("모델 점수 없음").doesNotContain("0.99");
    }
}
