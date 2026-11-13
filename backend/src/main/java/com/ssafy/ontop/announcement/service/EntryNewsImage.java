package com.ssafy.ontop.announcement.service;
/** Legacy-image read limit; new uploads are verified through S3 object metadata/checksum. */
public final class EntryNewsImage {
    public static final int MAX_BYTES=2*1024*1024;
    private EntryNewsImage(){}
}
