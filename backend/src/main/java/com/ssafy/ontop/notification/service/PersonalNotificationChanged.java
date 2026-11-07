package com.ssafy.ontop.notification.service;

/** 본문을 넣지 않고 커밋 후 해당 회원에게 재조회 필요만 전달한다. */
public record PersonalNotificationChanged(long userId, String notificationId) { }
