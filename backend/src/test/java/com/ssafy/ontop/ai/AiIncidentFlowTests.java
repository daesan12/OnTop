package com.ssafy.ontop.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.assertj.core.api.Assertions.*;

/** Decision fixture tests workflow semantics, not Jev language accuracy. No external calls. */
class AiIncidentFlowTests {
    @TempDir Path directory;
    final ObjectMapper mapper=new ObjectMapper();
    final MutableClock clock=new MutableClock();
    final List<AiOperations.PoliceDispatch> dispatches=new ArrayList<>();
    AiOperations operations(LocalAiStore store,boolean conflict) {
        return new AiOperations(store,probe(conflict),AiText.fixed(),AiNotifier.local(),clock,dispatches::add);
    }
    @Test void simultaneousAbuseAndConflictProduceOneEventAndLaterConflictDoesNotDuplicateIt() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,true);
            op.chat("A","world:one","bad first fragment",4,4);
            op.chat("A","world:one","bad second fragment",4,4);
            op.chat("B","world:one","normal",4,4); op.flush();
            assertThat(store.read().messages.stream().filter(LocalAiStore.Message::hidden)).hasSize(2);
            assertThat(store.read().incidents).hasSize(1);
            var incident=store.read().incidents.getFirst();
            assertThat(incident.kind()).isEqualTo("ABUSE_AND_CONFLICT");
            assertThat(incident.policeStatus()).isEqualTo("DISPATCHED");
            assertThat(dispatches).hasSize(1);
            assertThat(dispatches.getFirst().incidentId()).isEqualTo(incident.id());
            assertThat(dispatches.getFirst().actors()).containsExactly("A","B");
            assertThat(dispatches.getFirst().speech()).isEqualTo(AiOperations.policeSpeech("ABUSE_AND_CONFLICT"));
            assertThat(store.read().notices).hasSize(1).allMatch(n -> n.status().equals("SENT"));
            assertThat(store.read().notices.getFirst().text()).contains("메시지 2개 가림","공원 1","`11/08 10:00:00 KST`","A: bad first fragment","A: bad second fragment")
                    .doesNotContain("normal", "ABUSE_AND_CONFLICT", "world:one", "Asia/Seoul", incident.id(),incident.id().substring(0,8));
            assertThat(store.read().notices.getFirst().key()).isEqualTo("case:"+incident.id());
            op.chat("B","world:one","normal followup",4,4); op.flush();
            assertThat(store.read().incidents).hasSize(1);
            assertThat(dispatches).hasSize(1); assertThat(store.read().notices).hasSize(1);
        }
    }
    @Test void conflictDoesNotMaskAndCooldownDoesNotSuppressEscalationToAbuse() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,true);
            op.chat("A","world:one","normal disagreement",4,4); op.chat("B","world:one","normal reply",4,4); op.flush();
            assertThat(store.read().messages).noneMatch(LocalAiStore.Message::hidden);
            assertThat(dispatches).hasSize(1).allMatch(d -> d.kind().equals("CONFLICT"));
            clock.add(1_000); op.chat("B","world:one","normal again",4,4); op.flush();
            assertThat(dispatches).hasSize(1);
            op.chat("A","world:one","bad escalation",4,4); op.flush();
            assertThat(store.read().messages.getLast().hidden()).as("escalation worker status: %s",op.status()).isTrue();
            assertThat(dispatches).hasSize(2);
            assertThat(store.read().incidents.getLast().kind()).isEqualTo("ABUSE_AND_CONFLICT");
            clock.add(60_000); op.chat("B","world:one","normal continued argument",4,4); op.flush();
            assertThat(dispatches).hasSize(3);
        }
    }
    @Test void repeatedAbuseIsMaskedDuringCooldownAndDifferentAuthorGetsSeparateEvent() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,false);
            op.chat("A","world:one","bad first",4,4); op.flush();
            clock.add(1_000); op.chat("A","world:one","bad second",4,4); op.flush();
            assertThat(store.read().messages).allMatch(LocalAiStore.Message::hidden);
            assertThat(dispatches).hasSize(2); assertThat(store.read().notices).hasSize(1);
            op.chat("B","world:one","bad other author",4,4); op.flush();
            assertThat(dispatches).hasSize(3);
            clock.add(60_000); op.chat("A","world:one","bad after cooldown",4,4); op.flush();
            assertThat(dispatches).hasSize(4);
        }
    }
    @Test void failedPoliceRequestSurvivesRestartAndJevOutageWithoutBlockingMmOrMask() throws Exception {
        String id;
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=new AiOperations(store,probe(false),AiText.fixed(),AiNotifier.local(),clock,c -> { throw new IllegalStateException("fixture"); });
            op.chat("A","world:one","bad",4,4); op.flush();
            assertThat(store.read().messages.getFirst().hidden()).isTrue();
            assertThat(store.read().notices.getFirst().status()).isEqualTo("SENT");
            assertThat(store.read().incidents.getFirst().policeStatus()).isEqualTo("PENDING");
            id=store.read().incidents.getFirst().id();
        }
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,false); clock.add(2_000); op.failures(true,false);
            op.chat("B","world:one","normal",4,4); op.flush();
            assertThat(dispatches).hasSize(1).allMatch(d -> d.incidentId().equals(id));
            assertThat(store.read().incidents.getFirst().policeStatus()).isEqualTo("DISPATCHED");
            assertThat(store.read().messages.getLast().processed()).isFalse();
            assertThat(store.read().notices).hasSize(1);
        }
    }
    @Test void ongoingAbuseWarnsEveryTimeButMmCooldownUsesLastActualAlert() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,false);
            op.chat("A","world:one","bad one",4,4); op.flush();
            clock.add(30_000); op.chat("A","world:one","bad two",4,4); op.flush();
            assertThat(dispatches).hasSize(2); assertThat(store.read().notices).hasSize(1);
            clock.add(30_000); op.chat("A","world:one","bad three",4,4); op.flush();
            assertThat(dispatches).hasSize(3); assertThat(store.read().notices).hasSize(2);
            assertThat(store.read().messages).allMatch(LocalAiStore.Message::hidden);
        }
    }
    @Test void mmFailureDoesNotUndoMaskOrPoliceAndRetryDoesNotRedispatchPolice() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,false); op.failures(false,true);
            op.chat("A","world:one","bad",4,4); op.flush();
            assertThat(store.read().messages.getFirst().hidden()).isTrue(); assertThat(dispatches).hasSize(1);
            assertThat(store.read().notices.getFirst().status()).isEqualTo("PENDING");
            op.failures(false,false); clock.add(2_000); op.flush();
            assertThat(store.read().notices.getFirst().status()).isEqualTo("SENT"); assertThat(dispatches).hasSize(1);
        }
    }
    @Test void uncertainNormalAndSingleSpeakerConflictTriggerNoAction() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var op=operations(store,true); op.chat("A","world:one","normal quoted compliment",4,4);
            op.chat("A","world:one","uncertain",4,4); op.flush();
            assertThat(store.read().messages).noneMatch(LocalAiStore.Message::hidden);
            assertThat(store.read().incidents).isEmpty(); assertThat(store.read().notices).isEmpty(); assertThat(dispatches).isEmpty();
        }
    }
    @Test void policeStopsAfterFiveAttemptsAndExplicitRetryCanResumeIt() throws Exception {
        try(var store=new LocalAiStore(directory,mapper)) {
            var failed=new AtomicBoolean(true);
            var op=new AiOperations(store,probe(false),AiText.fixed(),AiNotifier.local(),clock,c -> { if(failed.get()) throw new IllegalStateException("fixture"); });
            op.chat("A","world:one","bad",4,4);
            for(int i=0;i<6;i++) { op.flush(); clock.add(120_000); }
            assertThat(store.read().incidents.getFirst().policeAttempts()).isEqualTo(5);
            assertThat(store.read().incidents.getFirst().policeStatus()).isEqualTo("FAILED");
            failed.set(false); op.retryNotices(); op.flush();
            assertThat(store.read().incidents.getFirst().policeStatus()).isEqualTo("DISPATCHED"); assertThat(store.read().notices).hasSize(1);
        }
    }
    @Test void legacyFileDoesNotRedispatchOldIncidents() throws Exception {
        java.nio.file.Files.writeString(directory.resolve("state.json"),"""
                {"schema":1,"incidents":[{"id":"old","scope":"world:one","kind":"VIOLATION",
                "messageIds":[],"createdAt":1,"provider":"fixture"}]}
                """);
        try(var store=new LocalAiStore(directory,mapper)) {
            operations(store,false).flush();
            assertThat(dispatches).isEmpty(); assertThat(store.read().notices).isEmpty();
            assertThat(store.read().incidents.getFirst().policeStatus()).isEqualTo("LEGACY");
        }
    }
    private static AiDecisions probe(boolean conflict) {
        return new AiDecisions() {
            public Moderation moderate(List<Chat> context,List<Chat> targets) {
                var verdicts=new LinkedHashMap<String,Verdict>();
                context.forEach(c -> verdicts.put(c.id(),c.text().startsWith("bad")?Verdict.VIOLATION:c.text().equals("uncertain")?Verdict.UNCERTAIN:Verdict.NORMAL));
                return new Moderation(verdicts,conflict,"fixture");
            }
            public Triage triage(String text) { return new OfflineDecisions().triage(text); }
        };
    }
    private static final class MutableClock extends Clock {
        long epoch=Instant.parse("2026-11-08T01:00:00Z").toEpochMilli();
        void add(long millis) { epoch+=millis; }
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return Instant.ofEpochMilli(epoch); }
    }
}
