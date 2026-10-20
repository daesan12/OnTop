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
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import static org.assertj.core.api.Assertions.assertThat;

// 테스트 전용: 백그라운드 Pong을 끄면 소켓을 닫지 않고 무응답을 재현할 수 있다.
final class ScenarioClient implements AutoCloseable {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final Socket socket;
    private final DataInputStream input;
    private final OutputStream output;
    private final BlockingQueue<JsonNode> messages = new ArrayBlockingQueue<>(128);
    private final BlockingQueue<Integer> closes = new ArrayBlockingQueue<>(1);
    private final Thread reader;
    private volatile boolean replyToPing = true;
    private volatile Throwable failure;
    private volatile Predicate<JsonNode> forbidden = message -> false;

    ScenarioClient(int port, String login) throws Exception {
        socket = new Socket("127.0.0.1", port);
        input = new DataInputStream(socket.getInputStream());
        output = socket.getOutputStream();
        try {
            socket.setSoTimeout(5000);
            String headers = "GET /ws/tables HTTP/1.1\r\nHost: 127.0.0.1:" + port
                    + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13"
                    + "\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nX-Test-Login: " + login + "\r\n\r\n";
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
        String id = UUID.randomUUID().toString();
        send(1, MAPPER.writeValueAsBytes(Map.of("type", type, "requestId", id, "payload", payload)));
        return id;
    }

    JsonNode state(String status) throws Exception {
        return await(message -> message.path("type").asText().equals("GAME_CONNECTION_STATE")
                && message.path("payload").path("status").asText().equals(status)).path("payload");
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
                    JsonNode message = MAPPER.readTree(payload);
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
        socket.close();
        reader.join(5000);
        assertThat(reader.isAlive()).as("시나리오 수신자 정리").isFalse();
    }
}
