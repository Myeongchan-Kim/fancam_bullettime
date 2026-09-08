import pytest
import numpy as np
from app.crawler.visual_group_aligner import compute_color_histogram

def test_compute_color_histogram_nonexistent():
    res = compute_color_histogram("non_existent_file.jpg")
    assert res is None

def test_compute_color_histogram_valid(tmp_path):
    from PIL import Image
    test_img = tmp_path / "test.jpg"
    img = Image.new("RGB", (100, 100), color=(255, 0, 0))
    img.save(test_img)
    
    hist = compute_color_histogram(str(test_img), bins=4)
    assert hist is not None
    assert len(hist) == 4 * 4 * 4
    assert np.isclose(np.sum(hist), 1.0, atol=1e-3)
