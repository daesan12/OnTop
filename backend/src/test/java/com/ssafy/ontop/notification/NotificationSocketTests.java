package com.ssafy.ontop.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.notification.service.PersonalNotificationChanged;
import com.ssafy.ontop.table.service.TableHub;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class NotificationSocketTests {
    @Test
    void 본문없는_변경알림은_수신자에게만_보낸다() throws Exception {
        var hub = new TableHub(new ObjectMapper(), Optional.empty(), false);
        try {
            var recipient = connect(hub, 202);
            var other = connect(hub, 303);
            hub.personalNotificationChanged(new PersonalNotificationChanged(202, "12"));
            String event = recipient.poll(5, TimeUnit.SECONDS);
            assertThat(event).contains("PERSONAL_NOTIFICATION_CHANGED", "notificationId", "12")
                    .doesNotContain("body", "feedbackText", "userId");
            assertThat(other.poll(200, TimeUnit.MILLISECONDS)).isNull();
        } finally { hub.shutdown(); }
    }

    private LinkedBlockingQueue<String> connect(TableHub hub, long userId) throws Exception {
        var messages = new LinkedBlockingQueue<String>();
        var session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(UUID.randomUUID().toString());
        doAnswer(call -> { messages.add(((TextMessage) call.getArgument(0)).getPayload()); return null; })
                .when(session).sendMessage(any(TextMessage.class));
        assertThat(hub.connectAuthenticated(session, new VerifiedWebSocketUser(userId,
                VerifiedWebSocketUser.Provider.NAVER, UUID.randomUUID().toString()))).isTrue();
        assertThat(messages.poll(5, TimeUnit.SECONDS)).contains("CONNECTED");
        return messages;
    }
}
