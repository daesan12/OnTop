package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;

// 테스트 전용: 백그라운드 Pong을 끄면 소켓을 닫지 않고 무응답을 재현할 수 있다.
final class ScenarioClient implements AutoCloseable {
    final String userId;

    private static final ObjectMapper MAPPER = new ObjectMapper();
    // 같은 서버의 열린 클라이언트. 준비 동의 전 다른 참가자가 이미 받은 TABLE_STATE version을 확인한다.
    private static final Set<ScenarioClient> LIVE = ConcurrentHashMap.newKeySet();
    private final int port;
    private final Socket socket;
    private final DataInputStream input;
    private final OutputStream output;
    private final BlockingQueue<JsonNode> messages = new ArrayBlockingQueue<>(128);
    private final BlockingQueue<Integer> closes = new ArrayBlockingQueue<>(1);
    private final Thread reader;
    private volatile boolean replyToPing = true;
    private volatile Throwable failure;
    private volatile Predicate<JsonNode> forbidden = message -> false;
    private volatile JsonNode tableState;
    // 관전 채팅·핑. await()가 다른 메시지를 버려도 남겨 여러 수신자의 도착 여부를 비파괴로 확인한다.
    private final List<JsonNode> spectatorEvents = new java.util.concurrent.CopyOnWriteArrayList<>();

    ScenarioClient(int port, String login) throws Exception {
        this(port, login, null);
    }

    ScenarioClient(int port, String login, String ticket) throws Exception {
        this(port, login, ticket, null);
    }

    ScenarioClient(int port, String login, String ticket, String origin) throws Exception {
        this(port, login, ticket, origin,
                origin == null ? "127.0.0.1:" + port : java.net.URI.create(origin).getAuthority());
    }

    // Host를 Origin에서 자동 생성하는 기존 대역과 달리 실제 교차 출처/프록시 요청을 재현한다.
    ScenarioClient(int port, String login, String ticket, String origin, String authority) throws Exception {
        userId = switch (login) { case "naver" -> "101"; case "ssafy" -> "202"; case "spectator" -> "505";
            default -> login; };
        this.port = port;
        socket = new Socket("127.0.0.1", port);
        input = new DataInputStream(socket.getInputStream());
        output = socket.getOutputStream();
        try {
            socket.setSoTimeout(5000);
            String path = ticket == null ? "/ws/tables" : "/ws/tables?ticket=" + ticket;
            String authentication = ticket == null ? "X-Test-Login: " + login + "\r\n" : "";
            String originHeader = origin == null ? "" : "Origin: " + origin + "\r\n";
            String headers = "GET " + path + " HTTP/1.1\r\nHost: " + authority
                    + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13"
                    + "\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" + authentication + originHeader + "\r\n";
            output.write(headers.getBytes(StandardCharsets.US_ASCII));
            output.flush();
            ByteArrayOutputStream response = new ByteArrayOutputStream();
            while (!response.toString(StandardCharsets.US_ASCII).endsWith("\r\n\r\n")) {
                int next = input.read();
                if (next < 0 || response.size() > 8192) {
                    throw new EOFException("upgrade 응답 없음");
                }
                response.write(next);
            }
            assertThat(response.toString(StandardCharsets.US_ASCII)).startsWith("HTTP/1.1 101");
            socket.setSoTimeout(0);
            LIVE.add(this);
            reader = Thread.ofVirtual().name("scenario-reader").start(this::readLoop);
        } catch (Exception | AssertionError exception) {
            socket.close();
            throw exception;
        }
    }

    JsonNode request(String type, Object payload) throws Exception {
        String id = sendRequest(type, payload);
        return await(message -> message.path("requestId").asText().equals(id));
    }

    String sendRequest(String type, Object payload) throws Exception {
        if (type.equals("READY_SET")) { awaitLatestTableState(payload); }
        String id = UUID.randomUUID().toString();
        send(1, MAPPER.writeValueAsBytes(Map.of("type", type, "requestId", id, "payload", ReadyConsent.payload(this, type, payload))));
        return id;
    }

    // ReadyConsent가 참가비/version을 채울 때만, 비동기 송신으로 늦은 같은 테이블의 최신 TABLE_STATE를 기다린다.
    // 수신 큐를 소비하지 않으므로 먼저 도착한 시작 알림도 보존된다. 명시 값을 보내는 거절 테스트는 그대로 전송한다.
    private void awaitLatestTableState(Object payload) throws InterruptedException {
        if (!(payload instanceof Map<?, ?> supplied) || !Boolean.TRUE.equals(supplied.get("ready"))
                || supplied.containsKey("betAmountPerPlayer") && supplied.containsKey("expectedVersion")) {
            return;
        }
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            JsonNode own = tableState;
            if (own == null || own.path("version").asLong() >= latestVersion(own.path("tableId").asText())) {
                return;
            }
            Thread.sleep(10);
        }
    }

    private long latestVersion(String tableId) {
        return LIVE.stream().filter(client -> client.port == port).map(client -> client.tableState)
                .filter(state -> state != null && state.path("tableId").asText().equals(tableId))
                .mapToLong(state -> state.path("version").asLong()).max().orElse(0);
    }

    JsonNode state(String status) throws Exception {
        List<String> observed = new ArrayList<>();
        try {
            return await(message -> {
                if (!message.path("type").asText().equals("GAME_CONNECTION_STATE")) { return false; }
                String actual = message.path("payload").path("status").asText();
                observed.add(actual);
                return actual.equals(status);
            }).path("payload");
        } catch (AssertionError exception) {
            // 토큰/사용자 payload 없이 누락된 상태와 실제 Close Code를 진단한다.
            throw new AssertionError("기대 복구 상태=" + status + ", 수신 상태=" + observed + ", Close Code=" + closes.peek(), exception);
        }
    }

    JsonNode awaitSpectatorEvent(String eventId) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            List<JsonNode> received = spectatorEvents(eventId);
            if (!received.isEmpty()) {
                return received.getFirst();
            }
            if (failure != null) {
                throw new AssertionError("시나리오 소켓 수신 실패", failure);
            }
            Thread.sleep(10);
        }
        throw new AssertionError("5초 안에 관전 이벤트를 받지 못함: " + eventId);
    }

    List<JsonNode> spectatorEvents(String eventId) {
        return spectatorEvents.stream().filter(message -> message.at("/payload/eventId").asText().equals(eventId))
                .toList();
    }

    JsonNode await(Predicate<JsonNode> predicate) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            JsonNode message = messages.poll(50, TimeUnit.MILLISECONDS);
            if (message != null && predicate.test(message)) {
                return message;
            }
            if (failure != null) {
                throw new AssertionError("시나리오 소켓 수신 실패", failure);
            }
        }
        throw new AssertionError("5초 안에 기대한 메시지를 받지 못함");
    }

    void stopPong() {
        replyToPing = false;
    }

    void assertNoMessage(Predicate<JsonNode> predicate) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(300);
        while (System.nanoTime() < deadline) {
            JsonNode message = messages.poll(20, TimeUnit.MILLISECONDS);
            if (message != null) {
                assertThat(predicate.test(message)).as("수신하면 안 되는 메시지: %s", message).isFalse();
            }
            if (failure != null) {
                throw new AssertionError("시나리오 소켓 수신 실패", failure);
            }
        }
    }

    <T> T assertNoMessageDuring(Predicate<JsonNode> predicate, Callable<T> action) throws Exception {
        forbidden = predicate;
        try {
            T result = action.call();
            assertNoMessage(predicate);
            return result;
        } finally {
            forbidden = message -> false;
        }
    }

    int awaitClose() throws Exception {
        Integer code = closes.poll(5, TimeUnit.SECONDS);
        assertThat(code).as("서버가 연결을 종료해야 함; 수신 오류=%s", failure).isNotNull();
        return code;
    }

    private void readLoop() {
        try {
            while (!socket.isClosed()) {
                int first = input.readUnsignedByte();
                assertThat(first & 128).as("테스트 서버는 완성 프레임을 전송함").isEqualTo(128);
                int opcode = first & 15;
                int length = input.readUnsignedByte();
                assertThat(length & 128).isZero();
                if (length == 126) {
                    length = input.readUnsignedShort();
                } else if (length == 127) {
                    length = Math.toIntExact(input.readLong());
                }
                assertThat(length).isBetween(0, 65536);
                byte[] payload = new byte[length];
                input.readFully(payload);
                if (opcode == 1) {
                    JsonNode message = ReadyConsent.received(this, MAPPER.readTree(payload));
                    String type = message.path("type").asText();
                    if (type.equals("TABLE_STATE")) { tableState = message.path("payload"); }
                    if (type.equals("TABLE_LEFT")) { tableState = null; }
                    if (type.equals("GAME_SPECTATOR_CHAT_MESSAGE") || type.equals("OMOK_SPECTATOR_PING")
                            || type.equals("DICE_LEDGER_SPECTATOR_PING")) {
                        spectatorEvents.add(message);
                    }
                    assertThat(forbidden.test(message)).as("동작 중 수신 금지 메시지: %s", message).isFalse();
                    assertThat(messages.offer(message)).as("시나리오 수신 큐 초과").isTrue();
                } else if (opcode == 9 && replyToPing) {
                    send(10, payload);
                } else if (opcode == 8) {
                    int code = length < 2 ? 1005 : (payload[0] & 255) * 256 + (payload[1] & 255);
                    closes.offer(code);
                    send(8, payload);
                    return;
                }
            }
        } catch (Exception | AssertionError exception) {
            if (!socket.isClosed()) {
                failure = exception;
            }
        } finally {
            LIVE.remove(this);
            try {
                socket.close();
            } catch (IOException ignored) {
                // 테스트 종료 후 추가 작업 없음.
            }
        }
    }

    private synchronized void send(int opcode, byte[] payload) throws IOException {
        output.write(128 | opcode);
        if (payload.length < 126) {
            output.write(128 | payload.length);
        } else {
            output.write(128 | 126);
            output.write(payload.length >> 8);
            output.write(payload.length & 255);
        }
        byte[] mask = {11, 22, 33, 44};
        output.write(mask);
        for (int index = 0; index < payload.length; index++) {
            output.write(payload[index] ^ mask[index % 4]);
        }
        output.flush();
    }

    @Override
    public void close() throws Exception {
        LIVE.remove(this);
        socket.close();
        reader.join(5000);
        assertThat(reader.isAlive()).as("시나리오 수신자 정리").isFalse();
    }
}
