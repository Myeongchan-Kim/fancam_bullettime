import os
import sys
from unittest.mock import patch, MagicMock
import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import app.services.audio_dsp as audio_dsp


def test_download_audio_slice_uses_exact_pts_yt_dlp_flags_and_rejects_bloated_cache(tmp_path, monkeypatch):
    """
    Regression test for WebM/GOP keyframe boundary bloat in remote yt-dlp slices:
    1. Pre-existing bloated cache WAV (e.g. 13.97s when 8.0s was requested) must be invalidated,
       not returned as-is.
    2. Remote yt-dlp fallback must specify '-f bestaudio/best' and '--force-keyframes-at-cuts'
       with 2-decimal section precision so slices start at exact start_s PTS.
    """
    monkeypatch.setattr(audio_dsp, "AUDIO_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(audio_dsp, "FULL_AUDIO_CACHE_DIRS", [])

    sr = 16000
    out_name = "gate_end_tgt_testyt_95_60_8_00"
    out_wav = tmp_path / f"{out_name}.wav"

    # Write a bloated 13.97s WAV (simulating untrimmed keyframe-snapped legacy cache for an 8.0s request)
    bloated_samples = np.zeros(int(13.973 * sr), dtype=np.int16)
    wavfile.write(str(out_wav), sr, bloated_samples)

    captured_cmds = []

    def fake_run(cmd, *args, **kwargs):
        captured_cmds.append(cmd)
        # Simulate yt-dlp writing an exact 8.00s WAV
        exact_samples = (np.sin(np.linspace(0, 100, int(8.0 * sr))) * 10000).astype(np.int16)
        wavfile.write(str(out_wav), sr, exact_samples)
        return MagicMock(returncode=0)

    with patch.object(audio_dsp.subprocess, "run", side_effect=fake_run):
        res_path = audio_dsp.download_audio_slice("testyt12345", 95.60, 8.0, out_name)

    assert len(captured_cmds) == 1, "Bloated 13.97s cache WAV should be rejected and re-downloaded"
    cmd = captured_cmds[0]
    assert "--force-keyframes-at-cuts" in cmd, f"Missing --force-keyframes-at-cuts in {cmd}"
    assert "-f" in cmd and "bestaudio/best" in cmd, f"Missing '-f bestaudio/best' in {cmd}"
    assert "*95.60-103.60" in cmd, f"Expected 2-decimal section range '*95.60-103.60' in {cmd}"

    sr_out, data_out = wavfile.read(res_path)
    assert abs(len(data_out) / sr_out - 8.0) <= 0.2


def test_probe_acoustic_match_preserves_fractional_timestamp_in_cache_key(monkeypatch):
    """
    Regression test: t_tgt=9.7s (e.g. dur=97s * 0.1) must not truncate to int(9) in cache key
    or collide with 9.0s slices.
    """
    seen_calls = []

    def fake_download(yt_id, start_s, dur_s, out_name):
        seen_calls.append((yt_id, start_s, dur_s, out_name))
        return f"/tmp/{out_name}.wav"

    monkeypatch.setattr(audio_dsp, "download_audio_slice", fake_download)
    monkeypatch.setattr(audio_dsp, "cross_correlate", lambda tgt_w, ref_w, ref_start: (4804.30, 0.35))

    res = audio_dsp.probe_acoustic_match(
        yt_tgt="ddfukqLO4Qc",
        yt_ref="dxY6TEGf6fM",
        t_tgt=9.7,
        est_ref_t=4795.7,
        search_radius=30.0,
        dur=8.0,
        prefix="gate_start",
    )

    assert res["success"] is True
    assert res["relative_offset"] == round(4804.30 - 9.7, 2)
    tgt_call = seen_calls[0]
    assert tgt_call[1] == 9.7
    assert "9.70" in tgt_call[3] or "9_70" in tgt_call[3], (
        f"Cache filename '{tgt_call[3]}' truncated fractional timestamp 9.7s to integer"
    )


def test_download_audio_slice_scales_timeout_for_long_remote_windows(tmp_path, monkeypatch):
    """
    Regression test: YouTube progressive audio streams (itag 251) throttle ffmpeg HTTP reads
    to ~1.5x real-time, causing 130s~220s reference windows to deterministically exceed a
    fixed 45s timeout. Timeout must scale with dur_s.
    """
    monkeypatch.setattr(audio_dsp, "AUDIO_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(audio_dsp, "FULL_AUDIO_CACHE_DIRS", [])

    sr = 16000
    out_name = "gate_start_ref_1QyILPFQ1Xo_4450_00_158_00"
    out_wav = tmp_path / f"{out_name}.wav"
    captured_timeouts = []

    def fake_run(cmd, *args, **kwargs):
        captured_timeouts.append(kwargs.get("timeout"))
        exact_samples = (np.sin(np.linspace(0, 100, int(158.0 * sr))) * 10000).astype(np.int16)
        wavfile.write(str(out_wav), sr, exact_samples)
        return MagicMock(returncode=0)

    with patch.object(audio_dsp.subprocess, "run", side_effect=fake_run):
        audio_dsp.download_audio_slice("1QyILPFQ1Xo", 4450.0, 158.0, out_name)

    assert len(captured_timeouts) == 1
    assert captured_timeouts[0] is not None and captured_timeouts[0] >= 180, (
        f"Expected scaled timeout >= 180s for a 158s remote window, got {captured_timeouts[0]}"
    )


def test_download_audio_slice_discovers_prefixed_full_audio_cache(tmp_path, monkeypatch):
    """
    Regression test: Any cached full concert file containing yt_id (e.g. master_1755_1QyILPFQ1Xo.webm)
    in FULL_AUDIO_CACHE_DIRS must be discovered via glob without hardcoding video IDs.
    """
    slice_dir = tmp_path / "slices"
    full_dir = tmp_path / "full_cache"
    slice_dir.mkdir()
    full_dir.mkdir()

    cached_master = full_dir / "master_1755_1QyILPFQ1Xo.webm"
    cached_master.write_bytes(b"x" * 20000)

    monkeypatch.setattr(audio_dsp, "AUDIO_CACHE_DIR", str(slice_dir))
    monkeypatch.setattr(audio_dsp, "FULL_AUDIO_CACHE_DIRS", [str(full_dir)])

    sr = 16000
    out_name = "gate_start_ref_1QyILPFQ1Xo_30_00_128_00"
    out_wav = slice_dir / f"{out_name}.wav"
    captured_cmds = []

    def fake_run(cmd, *args, **kwargs):
        captured_cmds.append(cmd)
        exact_samples = (np.sin(np.linspace(0, 100, int(128.0 * sr))) * 10000).astype(np.int16)
        wavfile.write(str(out_wav), sr, exact_samples)
        return MagicMock(returncode=0)

    with patch.object(audio_dsp.subprocess, "run", side_effect=fake_run):
        res = audio_dsp.download_audio_slice("1QyILPFQ1Xo", 30.0, 128.0, out_name)

    assert len(captured_cmds) == 1
    assert captured_cmds[0][0] == "ffmpeg", f"Expected local ffmpeg cache extraction, got {captured_cmds[0]}"
    assert str(cached_master) in captured_cmds[0]
    assert res == str(out_wav)

