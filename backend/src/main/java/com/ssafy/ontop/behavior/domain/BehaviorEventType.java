package com.ssafy.ontop.behavior.domain;

/** docs/behavior-log.md 3장의 이벤트 목록. 이름은 DB event_type 값이므로 바꾸지 않는다. */
public enum BehaviorEventType {
    AUTH_LOGIN,
    USER_ONBOARDED,
    AUTH_LOGOUT,
    USER_WITHDRAWN,
    WS_CONNECTED,
    WS_DISCONNECTED,
    CHANNEL_JOINED,
    CHANNEL_LEFT,
    CHAT_SENT,
    EMOTE_SENT,
    TABLE_JOINED,
    TABLE_LEFT,
    TABLE_READY_SET,
    GAME_SELECTED,
    TABLE_WATCHED,
    GAME_WATCHED,
    GAME_STARTED,
    GAME_ENDED,
    GAME_SETTLED,
    GAME_RECONNECTED,
    SHOP_PURCHASED,
    ITEM_EQUIPPED
}
