package com.ssafy.ontop.minigame.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "bungeoppang_profiles")
public class BungeoppangProfile {
    @Id
    @Column(name = "user_id")
    private long userId;
    @Column(name = "seen_tips", nullable = false, length = 128)
    private String seenTips;

    protected BungeoppangProfile() { }
    public BungeoppangProfile(long userId) { this.userId = userId; this.seenTips = ""; }
    public String seenTips() { return seenTips; }
    public void remember(String tips) { this.seenTips = tips; }
}
