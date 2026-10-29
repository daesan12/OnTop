package com.ssafy.ontop.minigame.service;

import java.time.Instant;

/**
 * Internal transaction event for the public world activity. {@code activeUntil} is the server-issued
 * play end; null ends only this server-issued session and never a newer one.
 */
public record MinigameActivityChanged(long userId, long sessionId, Instant activeUntil) { }
