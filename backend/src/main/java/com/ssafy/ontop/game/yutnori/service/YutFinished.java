package com.ssafy.ontop.game.yutnori.service;

import com.ssafy.ontop.game.result.GameFinished;

/** 공통 종료 형식을 재사용하되 무료 경기를 판돈 정산 소비자에 전달하지 않는다. */
public record YutFinished(GameFinished outcome) { }
