package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.service.WalletReadyBalanceGateway;
import com.ssafy.ontop.wallet.dto.WalletBalanceResponse;
import com.ssafy.ontop.wallet.service.WalletQueryService;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Real Hub/parser/async delivery, read-only wallet boundary replaced by a controlled gateway. */
class ReadyBalanceFlowTests {
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false);
    @AfterEach void close() { hub.shutdown(); }

    @Test void 부족하면_준비를_거절하고_금액을_안내하며_동액은_허용한다() throws Exception {
        AtomicLong available = new AtomicLong(80);
        hub.configureReadyBalances(Optional.of(user -> { assertThat(user).isEqualTo(101); return available.get(); }));
        Peer peer = peer(); select(peer,100);
        JsonNode rejected = peer.request("READY_SET",Map.of("ready",true));
        assertThat(rejected.path("type").asText()).isEqualTo("ERROR");
        assertThat(rejected.path("payload").path("code").asText()).isEqualTo("INSUFFICIENT_BALANCE");
        assertThat(rejected.path("payload").path("message").asText()).contains("100냥","80냥","20냥 부족");
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        available.set(100);
        assertThat(peer.request("READY_SET",Map.of("ready",true)).path("type").asText()).isEqualTo("TABLE_STATE");
        assertThat(hub.listTables().tables().getFirst().readyCount()).isEqualTo(1);
    }

    @Test void 조회장애는_실패로_막고_준비취소는_지갑조회없이_허용한다() throws Exception {
        var reads = new java.util.concurrent.atomic.AtomicInteger();
        hub.configureReadyBalances(Optional.of(user -> { reads.incrementAndGet(); throw new IllegalStateException("private DB detail"); }));
        Peer peer=peer();select(peer,0);
        var rejected=peer.request("READY_SET",Map.of("ready",true));
        assertThat(rejected.path("payload").path("code").asText()).isEqualTo("READY_BALANCE_UNAVAILABLE");
        assertThat(rejected.toString()).doesNotContain("private DB detail");
        assertThat(peer.request("READY_SET",Map.of("ready",false)).path("type").asText()).isEqualTo("TABLE_STATE");
        assertThat(reads).hasValue(1);
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
    }

    @Test void DB조회중에도_다른요청은_처리하고_변경된설정에_낡은준비를_적용하지않는다() throws Exception {
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        hub.configureReadyBalances(Optional.of(user -> {
            entered.countDown();
            try { if (!release.await(3,TimeUnit.SECONDS)) throw new IllegalStateException("test timeout"); }
            catch (InterruptedException e) { Thread.currentThread().interrupt();throw new IllegalStateException(e); }
            return 200;
        }));
        Peer peer=peer();select(peer,100);
        String pending=peer.send("READY_SET",Map.of("ready",true));
        assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();
        try {
            assertThat(peer.request("READY_SET",Map.of("ready",true)).path("payload").path("code").asText()).isEqualTo("READY_CHECK_PENDING");
            assertThat(peer.request("GAME_SELECT",Map.of("gameCode","OMOK","betAmountPerPlayer",150)).path("type").asText()).isEqualTo("TABLE_STATE");
        } finally { release.countDown(); }
        assertThat(peer.await(pending).path("payload").path("code").asText()).isEqualTo("GAME_BET_CHANGED");
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
    }

    @Test void 지갑어댑터는_전체잔액이_아니라_예약을뺀_사용가능잔액만_읽는다() {
        WalletQueryService wallets=mock(WalletQueryService.class);
        when(wallets.findBalance(101)).thenReturn(new WalletBalanceResponse(100,20,80));
        assertThat(new WalletReadyBalanceGateway(wallets).availableBalance(101)).isEqualTo(80);
        verify(wallets).findBalance(101);verifyNoMoreInteractions(wallets);
    }

    @Test void 조회중_퇴장후_같은테이블_재착석해도_이전준비는_취소된다() throws Exception {
        CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        hub.configureReadyBalances(Optional.of(user -> {
            entered.countDown();
            try { release.await(3,TimeUnit.SECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            return 200;
        }));
        Peer peer=peer();select(peer,100);
        String pending=peer.send("READY_SET",Map.of("ready",true));
        assertThat(entered.await(2,TimeUnit.SECONDS)).isTrue();
        try {
            // Drain the cancellation first; request() deliberately ignores unrelated broadcasts.
            String leave=peer.send("TABLE_LEAVE",Map.of());
            assertThat(peer.await(pending).path("payload").path("code").asText()).isEqualTo("READY_CHECK_CANCELLED");
            peer.await(leave);
            select(peer,100);
            assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
        } finally { release.countDown(); }
        // A subsequent explicit cancellation provides an ordered Hub barrier after the old result.
        peer.request("READY_SET",Map.of("ready",false));
        assertThat(hub.listTables().tables().getFirst().readyCount()).isZero();
    }

    private void select(Peer peer,long bet) throws Exception {
        peer.request("TABLE_JOIN",Map.of("tableId","table-1"));
        peer.request("GAME_SELECT",Map.of("gameCode","OMOK","betAmountPerPlayer",bet));
    }
    private Peer peer() throws Exception {
        Peer peer=new Peer();WebSocketSession socket=mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(peer.id);
        doAnswer(call -> { peer.messages.add(ReadyConsent.received(peer,mapper.readTree(((TextMessage)call.getArgument(0)).getPayload())));return null; })
                .when(socket).sendMessage(any(TextMessage.class));
        hub.connectAuthenticated(socket,new VerifiedWebSocketUser(101,VerifiedWebSocketUser.Provider.NAVER,"00000000-0000-0000-0000-000000000001"));
        return peer;
    }
    private class Peer {
        final String id=UUID.randomUUID().toString();final BlockingQueue<JsonNode> messages=new LinkedBlockingQueue<>();
        String send(String type,Map<String,?> payload) throws Exception {
            String request=UUID.randomUUID().toString();
            hub.receive(id,mapper.writeValueAsString(Map.of("requestId",request,"type",type,"payload",ReadyConsent.payload(this,type,payload))));
            return request;
        }
        JsonNode request(String type,Map<String,?> payload) throws Exception { return await(send(type,payload)); }
        JsonNode await(String request) throws Exception {
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5),remaining;
            while((remaining=deadline-System.nanoTime())>0){var message=messages.poll(remaining,TimeUnit.NANOSECONDS);
                if(message==null)break;if(request.equals(message.path("requestId").asText()))return message;}
            throw new AssertionError("No response for "+request);
        }
    }
}
