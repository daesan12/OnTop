package com.ssafy.ontop.event.minigame;

public enum MinigameAwardType {
    BUNGEOPPANG,
    JUMPMAP;

    public static MinigameAwardType fromPath(String value) {
        for (MinigameAwardType type : values()) {
            if (type.name().equalsIgnoreCase(value)) {
                return type;
            }
        }
        throw new MinigameAwardException(400, "EVENT_INVALID_TYPE", "붕어빵 또는 점프맵만 선택할 수 있습니다.");
    }

    public String prizeName() {
        return "메가커피 아메리카노";
    }
}
