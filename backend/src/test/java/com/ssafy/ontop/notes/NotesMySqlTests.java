package com.ssafy.ontop.notes;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.notes.domain.NoteText;
import com.ssafy.ontop.notes.repository.NotesRepository;
import com.ssafy.ontop.notes.service.NotesService;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doNothing;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.notes.enabled=true",
        "ontop.notes.privacy-secret=synthetic-note-privacy-key-32-bytes-only",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class NotesMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired NotesService notes;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired WorldChannelRegistry channels;
    @MockitoSpyBean TableHub hub;
    @MockitoSpyBean NotesRepository repository;
    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private String tokenA;
    private String tokenB;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_NOTES_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_notes_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_notes_test_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_NOTES_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_NOTES_DB_PASSWORD"));
    }

    @BeforeEach
    void 격리DB의_메모와_검증회원을_준비한다() {
        jdbc.update("DELETE FROM anonymous_note_requests");
        jdbc.update("DELETE FROM anonymous_note_rates");
        jdbc.update("DELETE FROM anonymous_notes");
        for (long id : new long[]{101, 202, 909}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))"
                    + " ON DUPLICATE KEY UPDATE deleted_at=NULL", id, "notes-test-" + id, "메모회원" + id);
        }
        tokenA = token(101);
        tokenB = token(202);
        doNothing().when(hub).requireNotesAccess(anyLong(), anyString(), anyDouble(), anyDouble(), anyDouble());
    }

    @Test
    void A작성_B다른채널재조회에도_동일한_익명목록만_반환한다() throws Exception {
        var accepted = request("POST", "", body(key("one"), "  가 메모  "), tokenA);
        assertThat(accepted.statusCode()).isEqualTo(201);
        var response = request("GET", "?channelId=channel-2", null, tokenB);
        assertThat(response.statusCode()).isEqualTo(200);
        var note = mapper.readTree(response.body()).path("notes").get(0);
        assertThat(note.fieldNames()).toIterable().containsExactlyInAnyOrder("id", "text", "createdAt", "category");
        assertThat(note.path("category").asText()).isEqualTo("free");
        assertThat(note.path("text").asText()).isEqualTo("가 메모");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).contains("https://dev.on-top.world");
        assertThat(jdbc.queryForList("SHOW COLUMNS FROM anonymous_notes").stream().map(row -> row.get("Field")))
                .containsExactly("id", "body", "created_at", "category");
    }

    @Test
    void 같은요청_동시8회는_한번만_저장하고_같은결과를_준다() throws Exception {
        String key = key("parallel");
        CountDownLatch gate = new CountDownLatch(1);
        var tasks = new ArrayList<Callable<String>>();
        for (int i = 0; i < 8; i++) {
            tasks.add(() -> {
                gate.await(5, TimeUnit.SECONDS);
                var response = request("POST", "", body(key, "동시 익명 메모"), tokenA);
                assertThat(response.statusCode()).isEqualTo(201);
                return response.body();
            });
        }
        try (var pool = Executors.newFixedThreadPool(8)) {
            var futures = tasks.stream().map(pool::submit).toList();
            gate.countDown();
            var bodies = new ArrayList<String>();
            for (var future : futures) { bodies.add(future.get(15, TimeUnit.SECONDS)); }
            assertThat(bodies.stream().distinct()).hasSize(1);
        }
        assertThat(count()).isEqualTo(1);
    }

    @Test
    void 같은키_본문충돌과_쓰기15초_읽기1초를_구분한다() throws Exception {
        String key = key("cooldown");
        assertThat(request("POST", "", body(key, "첫 메모"), tokenA).statusCode()).isEqualTo(201);
        assertThat(request("POST", "", body(key, "다른 메모"), tokenA).statusCode()).isEqualTo(409);
        assertThat(request("POST", "", body(key("next"), "새 메모"), tokenA).statusCode()).isEqualTo(429);
        assertThat(request("POST", "", body(key, "첫 메모"), tokenA).statusCode()).isEqualTo(201);
        assertThat(request("GET", "?channelId=channel-1", null, tokenA).statusCode()).isEqualTo(200);
        assertThat(request("GET", "?channelId=channel-1", null, tokenA).statusCode()).isEqualTo(429);
    }

    @Test
    void 두회원_동시작성도_120장을_초과하지않고_같은시각은_ID역순이다() throws Exception {
        for (int i = 0; i < 119; i++) {
            jdbc.update("INSERT INTO anonymous_notes(body,created_at) VALUES(?,CURRENT_TIMESTAMP(3)-INTERVAL 1 DAY)", "이전" + i);
        }
        CountDownLatch gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { gate.await(); return request("POST", "", body(key("a"), "신규A"), tokenA); });
            var second = pool.submit(() -> { gate.await(); return request("POST", "", body(key("b"), "신규B"), tokenB); });
            gate.countDown();
            assertThat(first.get(15, TimeUnit.SECONDS).statusCode()).isEqualTo(201);
            assertThat(second.get(15, TimeUnit.SECONDS).statusCode()).isEqualTo(201);
        }
        assertThat(count()).isEqualTo(120);
        jdbc.update("UPDATE anonymous_notes SET created_at='2026-10-25 00:00:00.000'");
        var rows = notes.list(909, "channel-1").notes();
        assertThat(rows).hasSize(120);
        assertThat(rows.stream().map(n -> Long.parseLong(n.id()))).isSortedAccordingTo(java.util.Comparator.reverseOrder());
    }

    @Test
    void 삭제된메모와_만료키는_410이고_자동재게시하지않는다() throws Exception {
        String key = key("removed");
        assertThat(request("POST", "", body(key, "삭제될 메모"), tokenA).statusCode()).isEqualTo(201);
        jdbc.update("DELETE FROM anonymous_notes");
        assertThat(request("POST", "", body(key, "삭제될 메모"), tokenA).body()).contains("NOTE_REMOVED");
        String expired = (System.currentTimeMillis() - 86401000) + "_0123456789abcdef";
        var response = request("POST", "", body(expired, "오래된 요청"), tokenA);
        assertThat(response.statusCode()).isEqualTo(410);
        assertThat(response.body()).contains("NOTES_REQUEST_EXPIRED");
        assertThat(count()).isZero();
    }

    @Test
    void 미래시각키는_저장하지않고_정리후에도_만료키를_재게시하지않는다() throws Exception {
        String future = (System.currentTimeMillis() + 60000) + "_0123456789abcdef";
        assertThat(request("POST", "", body(future, "미래 요청"), tokenA).statusCode()).isEqualTo(400);
        assertThat(count()).isZero();
        notes.purgeMetadata();
        String expired = (System.currentTimeMillis() - 86401000) + "_0123456789abcdef";
        assertThat(request("POST", "", body(expired, "오래된 요청"), tokenA).statusCode()).isEqualTo(410);
        assertThat(count()).isZero();
    }

    @Test
    void DB저장후실패는_메모와_메타데이터를_함께롤백하고_같은키로복구한다() throws Exception {
        long revision = jdbc.queryForObject("SELECT revision FROM anonymous_note_board WHERE id=1", Long.class);
        doAnswer(call -> { call.callRealMethod(); throw new org.springframework.dao.DataAccessResourceFailureException("검증용"); })
                .when(repository).saveRequest(any());
        String key = key("failure");
        assertThat(request("POST", "", body(key, "실패 메모"), tokenA).statusCode()).isEqualTo(503);
        assertThat(count()).isZero();
        assertThat(jdbc.queryForObject("SELECT revision FROM anonymous_note_board WHERE id=1", Long.class)).isEqualTo(revision);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM anonymous_note_requests", Integer.class)).isZero();
        doCallRealMethod().when(repository).saveRequest(any());
        assertThat(request("POST", "", body(key, "실패 메모"), tokenA).statusCode()).isEqualTo(201);
    }

    @Autowired org.springframework.transaction.PlatformTransactionManager manager;

    @Test
    void 주제와_재시도비교를_저장하고_다른인스턴스도_커밋된변경만알린다() {
        var otherHub = org.mockito.Mockito.mock(TableHub.class);
        var observer = new com.ssafy.ontop.notes.service.NotesChangeNotifier(repository, manager, otherHub);
        observer.initialize();
        String request = key("category");
        var cheer = new com.ssafy.ontop.notes.domain.NoteCategory("cheer");
        var accepted = notes.submit(101, request, "channel-1", new NoteText("응원합니다"), cheer);
        assertThat(accepted.note().category()).isEqualTo("cheer");
        long revision = jdbc.queryForObject("SELECT revision FROM anonymous_note_board WHERE id=1", Long.class);
        assertThat(notes.submit(101, request, "channel-1", new NoteText("응원합니다"), cheer)).isEqualTo(accepted);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> notes.submit(101, request, "channel-1",
                new NoteText("응원합니다"), com.ssafy.ontop.notes.domain.NoteCategory.FREE))
                .isInstanceOf(com.ssafy.ontop.notes.service.NoteException.class)
                .extracting("code").isEqualTo("IDEMPOTENCY_CONFLICT");
        assertThat(jdbc.queryForObject("SELECT revision FROM anonymous_note_board WHERE id=1", Long.class)).isEqualTo(revision);
        observer.reconcile(); observer.reconcile(); observer.committed(revision - 1);
        org.mockito.Mockito.verify(otherHub).notesChanged(revision);
        org.mockito.Mockito.verifyNoMoreInteractions(otherHub);
        assertThat(jdbc.queryForObject("SELECT category FROM anonymous_notes WHERE id=?", String.class,
                Long.parseLong(accepted.note().id()))).isEqualTo("cheer");
    }

    @Test
    void 바깥트랜잭션이롤백되면_주제와변경번호와알림도확정되지않는다() {
        long before = jdbc.queryForObject("SELECT revision FROM anonymous_note_board WHERE id=1", Long.class);
        var transaction = new org.springframework.transaction.support.TransactionTemplate(manager);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            notes.submit(101, key("rollback-category"), "channel-1", new NoteText("롤백 검증"),
                    new com.ssafy.ontop.notes.domain.NoteCategory("worry"));
            status.setRollbackOnly();
            throw new IllegalStateException("의도한 검증 롤백");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(count()).isZero();
        assertThat(jdbc.queryForObject("SELECT revision FROM anonymous_note_board WHERE id=1", Long.class)).isEqualTo(before);
        org.mockito.Mockito.verify(hub, org.mockito.Mockito.never()).notesChanged(anyLong());
    }

    @Test
    void 메타데이터는_원본회원키본문없이_24시간만_유효하며_정리한다() {
        notes.submit(101, key("privacy"), "channel-1", new NoteText("익명 테스트"));
        var request = jdbc.queryForMap("SELECT * FROM anonymous_note_requests");
        assertThat(request.keySet()).containsExactlyInAnyOrder("request_digest", "body_digest", "note_id", "accepted_at", "expires_at");
        assertThat(request.get("request_digest").toString()).matches("[0-9a-f]{64}");
        assertThat(request.get("body_digest").toString()).matches("[0-9a-f]{64}");
        jdbc.update("UPDATE anonymous_note_requests SET expires_at=CURRENT_TIMESTAMP(3)-INTERVAL 1 SECOND");
        jdbc.update("UPDATE anonymous_note_rates SET expires_at=CURRENT_TIMESTAMP(3)-INTERVAL 1 SECOND");
        notes.purgeMetadata();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM anonymous_note_requests", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM anonymous_note_rates", Integer.class)).isZero();
        assertThat(count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id=909", Integer.class)).isEqualTo(1);
    }

    @Test
    void 조회실패를_빈목록으로_숨기지않고_다음_조회간격도_롤백한다() throws Exception {
        org.mockito.Mockito.doThrow(new org.springframework.dao.DataAccessResourceFailureException("검증용 조회 실패"))
                .when(repository).list();
        var response = request("GET", "?channelId=channel-1", null, tokenA);
        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(response.body()).contains("NOTES_UNAVAILABLE").doesNotContain("\"notes\":[]");
        doCallRealMethod().when(repository).list();
        assertThat(request("GET", "?channelId=channel-1", null, tokenA).statusCode()).isEqualTo(200);
    }

    @Test
    void 실제서버좌표에서_조회작성후_원거리_지상_단절을_거절한다() throws Exception {
        doCallRealMethod().when(hub).requireNotesAccess(anyLong(), anyString(), anyDouble(), anyDouble(), anyDouble());
        channels.join("101", "channel-1");
        // 서버 승인 위치 고정 대역: 실제 물리 이동·FE UI를 검증하는 테스트는 아니다.
        pose(54.5, 18.92, 48.5);
        assertThat(request("POST", "", body(key("near"), "정상 높이"), tokenA).statusCode()).isEqualTo(201);
        pose(54.5, 0.8, 48.5);
        assertThat(request("GET", "?channelId=channel-1", null, tokenA).statusCode()).isEqualTo(403);
        pose(57.11, 18.92, 48.5);
        assertThat(request("GET", "?channelId=channel-1", null, tokenA).statusCode()).isEqualTo(403);
        channels.leave("101");
        assertThat(request("GET", "?channelId=channel-1", null, tokenA).statusCode()).isEqualTo(409);
    }

    @Test
    void 다른회원의_같은키는_별도요청이고_로그아웃회원은_저장할수없다() throws Exception {
        String key = key("owners");
        assertThat(request("POST", "", body(key, "A메모"), tokenA).statusCode()).isEqualTo(201);
        assertThat(request("POST", "", body(key, "B메모"), tokenB).statusCode()).isEqualTo(201);
        assertThat(request("POST", "", body(key("none"), "미인증"), null).statusCode()).isEqualTo(401);
        assertThat(count()).isEqualTo(2);
    }

    private void pose(double x, double y, double z) {
        channels.holdFacility("101", new com.ssafy.ontop.world.service.WorldFacilityService.Pose(x, y, z, 0));
    }

    private String token(long id) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, id, null)).accessToken();
    }

    private String key(String suffix) { return System.currentTimeMillis() + "_0123456789abcdef_" + suffix; }
    private int count() { return jdbc.queryForObject("SELECT COUNT(*) FROM anonymous_notes", Integer.class); }
    private String body(String key, String text) throws Exception {
        return mapper.writeValueAsString(Map.of("operationId", key, "channelId", "channel-1", "text", text));
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/notes" + path))
                .header("Origin", "https://dev.on-top.world");
        if (token != null) { builder.header("Authorization", "Bearer " + token); }
        if (body != null) { builder.header("Content-Type", "application/json"); }
        return http.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
