package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

class AiOperationsTests {
    @TempDir Path directory;
    private final MutableClock clock=new MutableClock();
    private final ObjectMapper mapper=new ObjectMapper();
    private AiOperations operations(LocalAiStore store,AtomicInteger police) {
        return new AiOperations(store,new OfflineDecisions(),AiText.fixed(),AiNotifier.local(),clock,c -> police.incrementAndGet());
    }
    @Test void messagesArePublishedBeforeTenSecondTriageAndOnlyViolationsAreHidden() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var police=new AtomicInteger(); var op=operations(store,police);
            String bad=op.chat("a","world:one","씨발",4,4);
            op.chat("b","world:one","안녕하세요",4,4);
            assertThat(store.read().messages).allMatch(m -> !m.hidden() && !m.processed());
            clock.add(9999); op.tick(); assertThat(store.read().incidents).isEmpty();
            clock.add(1); op.tick();
            assertThat(store.read().messages.getFirst().hidden()).isTrue();
            assertThat(store.read().messages.getLast().hidden()).isFalse();
            assertThat(police).hasValue(1); assertThat(store.read().notices).hasSize(1);
            op.flush(); assertThat(police).hasValue(1); assertThat(store.read().notices).hasSize(1);
            op.restore(bad); assertThat(store.read().messages.getFirst().version()).isEqualTo(2);
            op.flush(); assertThat(store.read().messages.getFirst().hidden()).isFalse();
        }
    }
    @Test void differentScopesDoNotCreateFalseConflictAndAmbiguousConflictDoesNotHide() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger());
            op.chat("a","world:one","너 나가",4,4); op.chat("b","world:two","왜 시비",4,4); op.flush();
            assertThat(store.read().incidents).isEmpty();
            op.chat("c","world:one","왜 그래",4,4); op.flush(); op.tick();
            assertThat(store.read().incidents).hasSize(1).allMatch(c -> c.kind().equals("CONFLICT"));
            assertThat(store.read().messages).allMatch(m -> !m.hidden());
        }
    }
    @Test void failedClassificationSurvivesRestartAndSuccessfulRetryUsesSameMessageId() throws Exception {
        String id;
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger()); op.failures(true,false);
            id=op.chat("a","world:one","병신",4,4); op.flush();
            assertThat(store.read().messages.getFirst().processed()).isFalse();
        }
        try(var store=new LocalAiStore(directory,mapper)) {
            operations(store,new AtomicInteger()).flush();
            assertThat(store.read().messages.getFirst().chat().id()).isEqualTo(id);
            assertThat(store.read().messages.getFirst().hidden()).isTrue();
            assertThat(store.read().notices).hasSize(1);
        }
    }
    @Test void reportIdempotencyAndFailedDigestDoNotLoseOrDoubleAssignReports() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger());
            var first=op.feedback("a","key","의상을 추가해주세요");
            assertThat(op.feedback("a","key","의상을 추가해주세요").id()).isEqualTo(first.id());
            assertThatThrownBy(() -> op.feedback("a","key","다른 의견입니다")).isInstanceOf(IllegalArgumentException.class);
            op.flush(); assertThat(store.read().notices).isEmpty();
            op.failures(false,true); op.digest();
            assertThat(store.read().notices).hasSize(1).allMatch(n -> n.status().equals("PENDING"));
            op.digest(); assertThat(store.read().notices).hasSize(1);
            op.failures(false,false); clock.add(3000); op.tick();
            assertThat(store.read().notices).allMatch(n -> n.status().equals("SENT"));
            assertThat(store.read().reports).hasSize(1);
            assertThat(store.read().notices.getFirst().text()).contains("새로운 제보 1건").doesNotContain("배치",first.id(),store.read().notices.getFirst().id());
            assertThat(store.read().reports.getFirst().digestId()).isEqualTo(store.read().notices.getFirst().key());
        }
    }
    @Test void urgentFeedbackIsImmediateAndNeverIncludedInGeneralDigest() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger()); op.feedback("a","urgent","전체 접속 불가입니다"); op.flush(); op.digest();
            assertThat(store.read().notices).hasSize(1).allMatch(n -> n.kind().equals("URGENT_FEEDBACK"));
            assertThat(store.read().reports.getFirst().triage().severity()).isZero();
            assertThat(store.read().notices.getFirst().text()).contains("즉시 확인","실제 장애 여부는 확인이 필요").doesNotContain("P0",store.read().reports.getFirst().id());
        }
    }
    @Test void decisionOutageDoesNotBlockExistingOutboxDelivery() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger()); op.failures(false,true);
            op.feedback("a","urgent","전체 접속 불가입니다"); op.flush();
            assertThat(store.read().notices).as("initial triage status %s",op.status()).hasSize(1);
            op.chat("a","world:one","병신",4,4);
            op.failures(true,false); clock.add(3000); op.flush();
            assertThat(store.read().notices.getFirst().status()).isEqualTo("SENT");
            assertThat(store.read().messages.getFirst().processed()).isFalse();
        }
    }
    @Test void spatiallySeparateSpeakersDoNotCreateConflictWithinSameChannel() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger());
            op.chat("a","world:one","너 나가",4,4); op.chat("b","world:one","왜 그래",28,18);
            op.flush(); op.flush();
            assertThat(store.read().incidents).isEmpty();
            assertThat(store.read().messages).allMatch(LocalAiStore.Message::processed);
        }
    }
    @Test void notificationStopsAutomaticRetriesAfterFiveFailuresAndAllowsExplicitRetry() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger()); op.failures(false,true);
            op.feedback("a","urgent","전체 접속 불가입니다");
            for(int i=0;i<6;i++) { op.flush(); clock.add(120_000); }
            assertThat(store.read().notices.getFirst().attempts()).isEqualTo(5);
            assertThat(store.read().notices.getFirst().status()).isEqualTo("FAILED");
            op.failures(false,false); op.retryNotices(); op.flush();
            assertThat(store.read().notices.getFirst().status()).isEqualTo("SENT");
        }
    }
    @Test void sameIncidentGroupsAlertsAndLocalStoreRejectsSecondWriter() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger());
            op.chat("a","world:one","병신",4,4); op.flush();
            clock.add(1000); op.chat("a","world:one","씨발",4,4); op.flush();
            assertThat(store.read().incidents).hasSize(2);
            assertThat(store.read().incidents).allMatch(i -> i.messageIds().size()==1);
            assertThat(store.read().notices).hasSize(1);
            assertThatThrownBy(() -> new LocalAiStore(directory,mapper)).isInstanceOf(java.nio.channels.OverlappingFileLockException.class);
        }
    }
    @Test void digestSlotsUseKoreanTimeAndNightBelongsToPreviousDay() {
        assertThat(AiOperations.digestSlot(Instant.parse("2026-11-08T00:00:00Z").toEpochMilli())).isEqualTo("2026-11-08T9");
        assertThat(AiOperations.digestSlot(Instant.parse("2026-11-08T03:00:00Z").toEpochMilli())).isEqualTo("2026-11-08T12");
        assertThat(AiOperations.digestSlot(Instant.parse("2026-11-08T15:01:00Z").toEpochMilli())).isEqualTo("2026-11-08T18");
    }
    @Test void tenMessageWindowsDrainBacklogWithoutDroppingPendingMessages() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var windows=new java.util.ArrayList<java.util.List<AiDecisions.Chat>>();
            AiDecisions probe=new AiDecisions() {
                public Moderation moderate(java.util.List<Chat> context,java.util.List<Chat> targets) {
                    windows.add(context); return new OfflineDecisions().moderate(context,targets);
                }
                public Triage triage(String text) { return new OfflineDecisions().triage(text); }
            };
            var op=new AiOperations(store,probe,AiText.fixed(),AiNotifier.local(),clock,c -> {});
            var ids=new java.util.ArrayList<String>();
            for(int i=0;i<25;i++) ids.add(op.chat("nickname-A","world:one","정상 메시지 "+i,4,4));
            op.flush(); assertThat(store.read().messages.stream().filter(LocalAiStore.Message::processed).count()).isEqualTo(10);
            op.tick(); op.tick();
            assertThat(store.read().messages).allMatch(LocalAiStore.Message::processed);
            assertThat(windows).hasSize(3).allMatch(w -> w.size()<=15);
            assertThat(windows.getLast().stream().map(AiDecisions.Chat::id).toList()).containsExactlyElementsOf(ids.subList(15,25));
            assertThat(windows.get(1).stream().map(AiDecisions.Chat::id).toList()).contains(ids.get(9),ids.get(10));
        }
    }
    @Test void priorMessagesRemainReadOnlyEvenWhenProviderReclassifiesThem() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var ids=new java.util.ArrayList<String>(); var joined=new java.util.concurrent.atomic.AtomicBoolean();
            AiDecisions probe=new AiDecisions() {
                public Moderation moderate(java.util.List<Chat> context,java.util.List<Chat> targets) {
                    var verdicts=new java.util.LinkedHashMap<String,Verdict>();
                    for(var c:context) verdicts.put(c.id(),joined.get() && ids.contains(c.id())?Verdict.VIOLATION:Verdict.NORMAL);
                    return new Moderation(verdicts,false,"fixture");
                }
                public Triage triage(String text) { return new OfflineDecisions().triage(text); }
            };
            var police=new AtomicInteger(); var op=new AiOperations(store,probe,AiText.fixed(),AiNotifier.local(),clock,c -> police.incrementAndGet());
            String other=op.chat("B","world:one","안녕하세요",4,4);
            ids.add(op.chat("A","world:one","도",4,4)); op.flush();
            assertThat(store.read().messages).noneMatch(LocalAiStore.Message::hidden);
            clock.add(1000); ids.add(op.chat("A","world:one","라이세요?",4,4)); joined.set(true); op.flush();
            assertThat(store.read().messages.stream().filter(m -> m.chat().id().equals(ids.getFirst()))).noneMatch(LocalAiStore.Message::hidden);
            assertThat(store.read().messages.stream().filter(m -> m.chat().id().equals(ids.getLast()))).allMatch(LocalAiStore.Message::hidden);
            assertThat(store.read().messages.stream().filter(m -> m.chat().id().equals(other))).noneMatch(LocalAiStore.Message::hidden);
            assertThat(police).hasValue(1);
            op.restore(ids.getLast()); op.chat("B","world:one","그만하세요",4,4); op.flush();
            assertThat(store.read().messages.stream().filter(m -> m.chat().id().equals(ids.getFirst()))).noneMatch(LocalAiStore.Message::hidden);
            assertThat(police).hasValue(1);
        }
    }
    @Test void fullBatchStartsEarlyAndSparseBatchWaitsFromItsOwnFirstMessage() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger());
            clock.add(30_000);
            op.chat("A","world:one","안녕하세요",4,4); op.tick();
            assertThat(op.status()).containsEntry("pending",1);
            clock.add(9999); op.tick(); assertThat(op.status()).containsEntry("pending",1);
            clock.add(1); op.tick(); assertThat(op.status()).containsEntry("pending",0);
            for(int i=0;i<10;i++) op.chat("A","world:one","안녕하세요 "+i,4,4);
            op.tick(); assertThat(op.status()).containsEntry("pending",0);
        }
    }
    @Test void failedBatchKeepsPendingAndBacksOffWithoutBlockingExistingNotice() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,new AtomicInteger());
            op.failures(false,true); op.feedback("A","urgent-backoff","전체 접속 불가입니다"); op.flush();
            clock.add(3000);
            for(int i=0;i<12;i++) op.chat("A","world:one","씨발 "+i,4,4);
            op.failures(true,false); op.tick();
            assertThat(op.status()).containsEntry("pending",12);
            assertThat(op.moderationReady()).isFalse();
            op.tick();
            assertThat(store.read().notices).anyMatch(n -> n.kind().equals("URGENT_FEEDBACK") && n.status().equals("SENT"));
            op.failures(false,false); clock.add(9999); op.tick();
            assertThat(op.status()).containsEntry("pending",12);
            clock.add(1); op.tick(); assertThat(op.status()).containsEntry("pending",2);
            assertThat(op.moderationReady()).isTrue();
            op.tick(); assertThat(op.status()).containsEntry("pending",0);
        }
    }
    private static final class MutableClock extends Clock {
        long epoch=Instant.parse("2026-11-08T01:00:00Z").toEpochMilli();
        void add(long millis) { epoch+=millis; }
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return Instant.ofEpochMilli(epoch); }
    }
}
