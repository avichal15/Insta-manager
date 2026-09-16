# Media fixtures

These synthetic fixtures contain a generated test pattern and a 440 Hz tone, not Instagram content.

Generated with FFmpeg:

```text
ffmpeg -f lavfi -i testsrc2=size=160x96:rate=12 -t 1 -an -c:v libx264 -bf 2 -movflags frag_keyframe+empty_moov+default_base_moof video-only.mp4
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000 -t 1 -vn -c:a aac -movflags frag_keyframe+empty_moov+default_base_moof audio-only.mp4
```

Tests verify both tracks, encoded sample hashes, DTS/CTS/durations, malformed input handling, and Blob cleanup. Tests do not require FFmpeg; the files are included. FFprobe was also run independently against the merged result in `work/verification/merged-fixture.mp4`.
