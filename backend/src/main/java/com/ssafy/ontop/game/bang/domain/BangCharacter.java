package com.ssafy.ontop.game.bang.domain;

public enum BangCharacter {
    BART_CASSIDY(4), BLACK_JACK(4), CALAMITY_JANET(4), EL_GRINGO(3), JESSE_JONES(4),
    JOURDONNAIS(4), KIT_CARLSON(4), LUCKY_DUKE(4), PAUL_REGRET(3), PEDRO_RAMIREZ(4),
    ROSE_DOOLAN(4), SID_KETCHUM(4), SLAB_THE_KILLER(4), SUZY_LAFAYETTE(4), VULTURE_SAM(4), WILLY_THE_KID(4);

    private final int life;

    BangCharacter(int life) { this.life = life; }

    public int life() { return life; }
}
