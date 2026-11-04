package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Assigns reusable user-facing numbers without reusing internal channel IDs. */
public final class DynamicChannelDisplayNumbers {

    private static final String NAME_PREFIX = "운영 공원 ";
    private static final Pattern NAME_PATTERN = Pattern.compile("^운영 공원 ([1-9][0-9]*)$");
    private static final int NON_DYNAMIC_CHANNEL = 0;

    private DynamicChannelDisplayNumbers() {}

    public static int nextAvailable(List<Channel> channels, int maxChannels) {
        Set<Integer> used = new HashSet<>();
        for (Channel channel : channels) {
            int number = displayNumber(channel);
            if (number > 0) {
                used.add(number);
            }
        }
        for (int number = 2; number <= maxChannels; number++) {
            if (!used.contains(number)) {
                return number;
            }
        }
        throw new IllegalStateException("사용 가능한 운영 채널 표시 번호가 없습니다.");
    }

    public static String name(int number) {
        if (number < 1) {
            throw new IllegalArgumentException("운영 채널 표시 번호는 양수여야 합니다.");
        }
        return NAME_PREFIX + number;
    }

    public static Comparator<Channel> comparator() {
        return Comparator.comparingInt(DynamicChannelDisplayNumbers::displayNumber)
                .thenComparing(Channel::name)
                .thenComparing(Channel::channelId);
    }

    static int displayNumber(Channel channel) {
        Matcher matcher = NAME_PATTERN.matcher(channel.name());
        if (!matcher.matches()) {
            return NON_DYNAMIC_CHANNEL;
        }
        try {
            return Integer.parseInt(matcher.group(1));
        } catch (NumberFormatException exception) {
            return NON_DYNAMIC_CHANNEL;
        }
    }
}
