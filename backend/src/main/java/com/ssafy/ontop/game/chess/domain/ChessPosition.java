package com.ssafy.ontop.game.chess.domain;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** a1=0, h8=63. 대문자는 백이며, 합법 수는 자신의 왕을 공격에 남기지 않는 수다. */
public final class ChessPosition {
    private final char[] board;
    private final boolean white;
    private final String castling;
    private final int enPassant;
    private final int halfmove;
    private final int fullmove;

    private ChessPosition(char[] board, boolean white, String castling, int enPassant, int halfmove, int fullmove) {
        this.board = board;
        this.white = white;
        this.castling = castling;
        this.enPassant = enPassant;
        this.halfmove = halfmove;
        this.fullmove = fullmove;
    }

    public static ChessPosition initial() {
        return fromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    }

    public static ChessPosition fromFen(String fen) {
        String[] fields = fen.split(" ");
        if (fields.length != 6) {
            throw new IllegalArgumentException("FEN 필드를 확인해주세요.");
        }
        char[] board = new char[64];
        Arrays.fill(board, '.');
        String[] ranks = fields[0].split("/");
        if (ranks.length != 8) {
            throw new IllegalArgumentException("FEN 보드를 확인해주세요.");
        }
        for (int row = 0; row < 8; row++) {
            int file = 0;
            for (char piece : ranks[row].toCharArray()) {
                if (piece >= '1' && piece <= '8') {
                    file += piece - '0';
                } else {
                    if (file >= 8 || "prnbqkPRNBQK".indexOf(piece) < 0) {
                        throw new IllegalArgumentException("FEN 기물을 확인해주세요.");
                    }
                    board[(7 - row) * 8 + file++] = piece;
                }
            }
            if (file != 8) {
                throw new IllegalArgumentException("FEN 행을 확인해주세요.");
            }
        }
        if (!fields[1].equals("w") && !fields[1].equals("b")) {
            throw new IllegalArgumentException("FEN 차례를 확인해주세요.");
        }
        return new ChessPosition(board, fields[1].equals("w"), fields[2].equals("-") ? "" : fields[2],
                fields[3].equals("-") ? -1 : square(fields[3]), Integer.parseInt(fields[4]),
                Integer.parseInt(fields[5]));
    }

    public static int square(String name) {
        if (name == null || !name.matches("[a-h][1-8]")) {
            throw new IllegalArgumentException("체스 좌표를 확인해주세요.");
        }
        return (name.charAt(1) - '1') * 8 + name.charAt(0) - 'a';
    }

    public static String name(int square) {
        return "" + (char) ('a' + square % 8) + (char) ('1' + square / 8);
    }

    public boolean whiteToMove() { return white; }
    public int halfmove() { return halfmove; }
    public char piece(int square) { return board[square]; }
    public String board() { return new String(board); }

    public record Move(String from, String to, String promotion) {
        public String uci() { return from + to + (promotion == null ? "" : promotion); }
    }

    public List<Move> legalMoves() {
        List<Move> result = new ArrayList<>();
        for (int from = 0; from < 64; from++) {
            char piece = board[from];
            if (piece == '.' || Character.isUpperCase(piece) != white) {
                continue;
            }
            for (int to = 0; to < 64; to++) {
                if (!pseudoLegal(from, to)) {
                    continue;
                }
                boolean promotes = Character.toUpperCase(piece) == 'P' && (to / 8 == 0 || to / 8 == 7);
                for (String promotion : promotes ? List.of("q", "r", "b", "n") : List.of("")) {
                    Move move = new Move(name(from), name(to), promotion.isEmpty() ? null : promotion);
                    if (!playUnchecked(move).inCheck(white)) {
                        result.add(move);
                    }
                }
            }
        }
        return List.copyOf(result);
    }

    public ChessPosition play(Move move) {
        if (!legalMoves().contains(move)) {
            throw new IllegalArgumentException("합법적인 수를 선택해주세요.");
        }
        return playUnchecked(move);
    }

    private boolean pseudoLegal(int from, int to) {
        if (from == to || (board[to] != '.' && Character.isUpperCase(board[to]) == white)
                || Character.toUpperCase(board[to]) == 'K') {
            return false;
        }
        int dx = to % 8 - from % 8;
        int dy = to / 8 - from / 8;
        char kind = Character.toUpperCase(board[from]);
        return switch (kind) {
            case 'P' -> {
                int direction = white ? 1 : -1;
                boolean capture = Math.abs(dx) == 1 && dy == direction
                        && (board[to] != '.' || to == enPassant && board[to] == '.'
                        && board[to - direction * 8] == (white ? 'p' : 'P'));
                yield capture || dx == 0 && board[to] == '.' && (dy == direction
                        || dy == direction * 2 && from / 8 == (white ? 1 : 6)
                        && board[from + direction * 8] == '.');
            }
            case 'N' -> Math.abs(dx) * Math.abs(dy) == 2;
            case 'B' -> Math.abs(dx) == Math.abs(dy) && clearPath(from, to);
            case 'R' -> (dx == 0 || dy == 0) && clearPath(from, to);
            case 'Q' -> (dx == 0 || dy == 0 || Math.abs(dx) == Math.abs(dy)) && clearPath(from, to);
            case 'K' -> Math.max(Math.abs(dx), Math.abs(dy)) == 1 || canCastle(from, to);
            default -> false;
        };
    }

    private boolean canCastle(int from, int to) {
        int home = white ? 4 : 60;
        if (from != home || (to != home + 2 && to != home - 2) || inCheck(white)) {
            return false;
        }
        boolean kingSide = to > from;
        char right = white ? (kingSide ? 'K' : 'Q') : (kingSide ? 'k' : 'q');
        int rook = home + (kingSide ? 3 : -4);
        int step = kingSide ? 1 : -1;
        if (castling.indexOf(right) < 0 || board[rook] != (white ? 'R' : 'r')) {
            return false;
        }
        for (int square = from + step; square != rook; square += step) {
            if (board[square] != '.') {
                return false;
            }
        }
        // 통과 칸에서는 출발 칸의 왕을 제거해야 열린 공격선도 검출한다.
        char[] transit = board.clone();
        transit[from] = '.';
        transit[from + step] = white ? 'K' : 'k';
        return !new ChessPosition(transit, white, castling, -1, halfmove, fullmove)
                .attacked(from + step, !white);
    }

    private boolean clearPath(int from, int to) {
        int step = Integer.signum(to % 8 - from % 8) + 8 * Integer.signum(to / 8 - from / 8);
        for (int square = from + step; square != to; square += step) {
            if (board[square] != '.') {
                return false;
            }
        }
        return true;
    }

    public boolean inCheck(boolean whiteKing) {
        char king = whiteKing ? 'K' : 'k';
        for (int square = 0; square < 64; square++) {
            if (board[square] == king) {
                return attacked(square, !whiteKing);
            }
        }
        throw new IllegalStateException("왕이 없는 체스 상태입니다.");
    }

    private boolean attacked(int target, boolean byWhite) {
        for (int from = 0; from < 64; from++) {
            char piece = board[from];
            if (piece == '.' || Character.isUpperCase(piece) != byWhite || from == target) {
                continue;
            }
            int dx = target % 8 - from % 8;
            int dy = target / 8 - from / 8;
            boolean attacks = switch (Character.toUpperCase(piece)) {
                case 'P' -> Math.abs(dx) == 1 && dy == (byWhite ? 1 : -1);
                case 'N' -> Math.abs(dx) * Math.abs(dy) == 2;
                case 'K' -> Math.max(Math.abs(dx), Math.abs(dy)) == 1;
                case 'B' -> Math.abs(dx) == Math.abs(dy) && clearPath(from, target);
                case 'R' -> (dx == 0 || dy == 0) && clearPath(from, target);
                case 'Q' -> (dx == 0 || dy == 0 || Math.abs(dx) == Math.abs(dy)) && clearPath(from, target);
                default -> false;
            };
            if (attacks) {
                return true;
            }
        }
        return false;
    }

    private ChessPosition playUnchecked(Move move) {
        int from = square(move.from());
        int to = square(move.to());
        char moving = board[from];
        char captured = board[to];
        char[] next = board.clone();
        next[from] = '.';
        next[to] = moving;
        if (Character.toUpperCase(moving) == 'P' && to == enPassant && captured == '.' && from % 8 != to % 8) {
            next[to + (white ? -8 : 8)] = '.';
            captured = white ? 'p' : 'P';
        }
        if (Character.toUpperCase(moving) == 'K' && Math.abs(to - from) == 2) {
            int rook = to > from ? from + 3 : from - 4;
            next[(from + to) / 2] = next[rook];
            next[rook] = '.';
        }
        if (move.promotion() != null) {
            next[to] = white ? Character.toUpperCase(move.promotion().charAt(0)) : move.promotion().charAt(0);
        }
        String rights = castling;
        if (moving == 'K') { rights = rights.replace("K", "").replace("Q", ""); }
        if (moving == 'k') { rights = rights.replace("k", "").replace("q", ""); }
        int[] corners = {0, 7, 56, 63};
        String[] cornerRights = {"Q", "K", "q", "k"};
        for (int i = 0; i < corners.length; i++) {
            if (from == corners[i] || to == corners[i]) {
                rights = rights.replace(cornerRights[i], "");
            }
        }
        boolean pawn = Character.toUpperCase(moving) == 'P';
        return new ChessPosition(next, !white, rights, pawn && Math.abs(to - from) == 16 ? (from + to) / 2 : -1,
                pawn || captured != '.' ? 0 : halfmove + 1, fullmove + (white ? 0 : 1));
    }

    /** 같은 자리의 반복은 캐슬링 권리와 실제 가능한 앙파상까지 같아야 한다. */
    public String repetitionKey() {
        boolean possibleEnPassant = enPassant >= 0 && legalMoves().stream().anyMatch(move ->
                square(move.to()) == enPassant && Character.toUpperCase(board[square(move.from())]) == 'P'
                        && move.from().charAt(0) != move.to().charAt(0));
        return board() + (white ? " w " : " b ") + castling + " " + (possibleEnPassant ? name(enPassant) : "-");
    }

    /** 양쪽에 메이트가 가능한 조합이 전혀 없는 표준 기물 부족 포지션. */
    public boolean insufficientMaterial() {
        int minors = 0;
        Integer bishopColour = null;
        boolean allBishops = true;
        for (int square = 0; square < 64; square++) {
            char piece = Character.toUpperCase(board[square]);
            if (piece == '.' || piece == 'K') { continue; }
            if (piece != 'N' && piece != 'B') { return false; }
            minors++;
            if (piece == 'N') {
                allBishops = false;
            } else {
                int colour = (square % 8 + square / 8) % 2;
                if (bishopColour != null && bishopColour != colour) { allBishops = false; }
                bishopColour = colour;
            }
        }
        return minors <= 1 || allBishops;
    }

    public boolean canPossiblyMate(boolean side) {
        int knights = 0;
        int bishops = 0;
        boolean opponentNonKing = false;
        for (char piece : board) {
            if (piece == '.' || Character.toUpperCase(piece) == 'K') { continue; }
            if (Character.isUpperCase(piece) != side) { opponentNonKing = true; continue; }
            switch (Character.toUpperCase(piece)) {
                case 'P', 'R', 'Q' -> { return true; }
                case 'N' -> knights++;
                case 'B' -> bishops++;
                default -> { }
            }
        }
        if (insufficientMaterial()) { return false; }
        return knights + bishops >= 2 || knights + bishops > 0 && opponentNonKing;
    }

    public String fen() {
        StringBuilder value = new StringBuilder();
        for (int rank = 7; rank >= 0; rank--) {
            int empty = 0;
            for (int file = 0; file < 8; file++) {
                char piece = board[rank * 8 + file];
                if (piece == '.') { empty++; continue; }
                if (empty > 0) { value.append(empty); empty = 0; }
                value.append(piece);
            }
            if (empty > 0) { value.append(empty); }
            if (rank > 0) { value.append('/'); }
        }
        return value + (white ? " w " : " b ") + (castling.isEmpty() ? "-" : castling) + " "
                + (enPassant < 0 ? "-" : name(enPassant)) + " " + halfmove + " " + fullmove;
    }
}
