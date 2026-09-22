import re

song_signatures = [
    ("STRATEGY", ["STRATEGY"], [384.0]),
    ("MAKE ME GO", ["MAKE ME GO"], [551.0]),
    ("SET ME FREE", ["SET ME FREE"], [771.0]),
    ("I CAN'T STOP ME", ["I CAN'T STOP ME", "ICSM"], [957.0]),
    ("OPTIONS", ["OPTIONS"], [1204.0]),
    ("MARS", ["MARS"], [1600.0]),
    ("DECAFFEINATED (Solo)", ["DECAFFEINATED"], [5923.0]),
    ("GONE", ["GONE"], [2199.0, 2231.0]),
    ("CRY FOR ME", ["CRY FOR ME"], [2438.0]),
    ("HELL IN HEAVEN", ["HELL IN HEAVEN"], [2644.0]),
    ("RIGHT HAND GIRL", ["RIGHT HAND GIRL"], [2832.0]),
    ("STONE COLD (Solo)", ["STONE COLD"], [4440.0]),
    ("MEEEEEE (Solo)", ["MEEEEEE"], [4680.0]),
    ("FIX A DRINK (Solo)", ["FIX A DRINK"], [4920.0]),
    ("DAT AHH DAT OOH", ["DAT AHH DAT OOH", "DAT AHH"], [5160.0]),
    ("BATTITUDE", ["BATTITUDE"], [5321.0]),
    ("CHESS (Solo)", ["CHESS"], [5489.0]),
    ("IN MY ROOM (Solo)", ["IN MY ROOM"], [5658.0, 5625.0]),
    ("ATM (Solo)", ["ATM"], [5822.0]),
    ("MOVE LIKE THAT (Solo)", ["MOVE LIKE THAT"], [6222.0]),
    ("FEEL SPECIAL", ["FEEL SPECIAL"], [7678.0]),
    ("ONE SPARK", ["ONE SPARK"], [7893.0]),
    ("FOUR (Intro)", ["FOUR", "INTRO", "PART 1"], [0.0, -10.0]),
    ("THIS IS FOR", ["THIS IS FOR"], [220.0, 246.0]),
]

def parse_leftmost(title):
    t_upper = title.upper()
    # Strip tour title phrase so it doesn't mask true song
    # Look for all occurrences of "THIS IS FOR"
    # If the title contains another specific song keyword (e.g. GONE, IN MY ROOM), "THIS IS FOR" in title is just the tour name!
    other_matches = []
    for sname, kws, anchors in song_signatures:
        if sname in ["THIS IS FOR", "FOUR (Intro)"]:
            continue
        for kw in kws:
            pos = t_upper.find(kw)
            if pos != -1:
                other_matches.append((pos, sname, anchors))
                break

    # If an explicit individual song exists (e.g. Gone, In My Room, Right Hand Girl):
    # check if title is a medley (+ / & / ,) vs single fancam
    is_medley = any(char in t_upper for char in ["+", "&", ","])
    if not is_medley and other_matches:
        other_matches.sort(key=lambda x: x[0])
        return other_matches[0][1], other_matches[0][2]

    # For medleys or titles without other songs, evaluate all keywords by left-most position
    # (after stripping the generic tour header)
    t_clean = re.sub(r'WORLD TOUR\s*["“\']THIS IS FOR["”\']', ' ', t_upper)
    t_clean = re.sub(r'TOUR\s*[<〈]THIS IS FOR[>〉]', ' ', t_clean)
    t_clean = re.sub(r'TWICE\s*THIS IS FOR\s*WORLD TOUR', ' ', t_clean)
    t_clean = re.sub(r'\[4K\]\s*250720\s*THIS IS FOR', ' ', t_clean)

    matches = []
    for sname, kws, anchors in song_signatures:
        for kw in kws:
            pos = t_clean.find(kw)
            if pos != -1:
                matches.append((pos, sname, anchors))
                break

    if not matches:
        return 'THIS IS FOR', [220.0, 246.0]

    matches.sort(key=lambda x: x[0])
    return matches[0][1], matches[0][2]

test_titles = [
    ("ID 1714", '250720 TWICE WORLD TOUR "THIS IS FOR" (FOUR, THIS IS FOR, STRATEGY) INCHEON'),
    ("ID 1681", '250720 "THIS IS FOR+Strategy+SET ME FREE+I CAN\'T STOP ME" 트와이스 콘서트 TWICE〈THIS IS FOR〉TOUR IN INCHEON'),
    ("ID 73",   '250720 TWICE THIS IS FOR WORLD TOUR IN INCHEON THIS IS FOR MOMO Fancam 트와이스 콘서트 월드투어 인천 모모 디스이즈포 직캠'),
    ("ID 654",  '[4k] 250720 THIS IS FOR 트와이스 채영 Gone 직캠｜ TWICE CHAEYOUNG fancam'),
    ("ID 47",   '[4k] 250720 TWICE Chaeyoung solo \'IN MY ROOM’ (FullCam) 트와이스 채영 솔로'),
]

for name, t in test_titles:
    sname, anchors = parse_leftmost(t)
    print(f"{name:<8} -> Song: {sname:<18} | Anchors: {anchors}")
