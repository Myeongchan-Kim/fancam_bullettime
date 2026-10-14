export interface FeaturedSyncVideo {
  id: number;
  title: string;
  subtitle: string;
  img: string;
  angleCount: number;
  extraImgs: string[];
}

export const FEATURED_SYNC_VIDEOS: FeaturedSyncVideo[] = [
  { 
    id: 1645, 
    title: 'BATTITUDE', 
    subtitle: 'Incheon 20250720 (Nayeon, Jeongyeon, Momo, Mina Unit)', 
    img: '/images/featured_cam01_battitude.jpg',
    angleCount: 9,
    extraImgs: [
      '/images/featured_cam02_battitude.jpg',
      '/images/featured_cam03_battitude.jpg',
      '/images/featured_cam04_battitude.jpg',
      '/images/featured_cam05_battitude.jpg'
    ]
  },
  { 
    id: 1640, 
    title: 'DAT AHH DAT OOH', 
    subtitle: 'Incheon 20250720 (Sana, Jihyo, Dahyun, Chaeyoung, Tzuyu Unit)', 
    img: '/images/featured_cam01_datahh.jpg',
    angleCount: 13,
    extraImgs: [
      '/images/featured_cam02_datahh.jpg',
      '/images/featured_cam03_datahh.jpg',
      '/images/featured_cam04_datahh.jpg',
      '/images/featured_cam05_datahh.jpg'
    ]
  },
  { 
    id: 43, 
    title: 'In my room', 
    subtitle: 'Incheon 20250720 (Chaeyoung Solo)', 
    img: '/images/featured_cam01_inmyroom.jpg',
    angleCount: 7,
    extraImgs: [
      '/images/featured_cam02_inmyroom.jpg',
      '/images/featured_cam03_inmyroom.jpg',
      '/images/featured_cam04_inmyroom.jpg',
      '/images/featured_cam05_inmyroom.jpg'
    ]
  },
  { 
    id: 45, 
    title: 'MAKE ME GO', 
    subtitle: 'Incheon 20250720 (360° Stage)', 
    img: '/images/featured_cam01_makemego.jpg',
    angleCount: 6,
    extraImgs: [
      '/images/featured_cam02_makemego.jpg',
      '/images/featured_cam03_makemego.jpg',
      '/images/featured_cam04_makemego.jpg'
    ]
  },
  { 
    id: 1654, 
    title: 'THIS IS FOR', 
    subtitle: 'Incheon 20250720 (Opening 360° Stage)', 
    img: '/images/featured_cam01_thisisfor.jpg',
    angleCount: 8,
    extraImgs: [
      '/images/featured_cam02_thisisfor.jpg',
      '/images/featured_cam03_thisisfor.jpg',
      '/images/featured_cam04_thisisfor.jpg'
    ]
  },
  { 
    id: 1720, 
    title: 'GONE', 
    subtitle: 'Incheon 20250720 (Band Live Ver.)', 
    img: '/images/featured_cam01_gone.jpg',
    angleCount: 5,
    extraImgs: [
      '/images/featured_cam02_gone.jpg',
      '/images/featured_cam03_gone.jpg'
    ]
  },
  { 
    id: 215, 
    title: 'MOVE LIKE THAT', 
    subtitle: 'Incheon 20250719 (Momo Solo)', 
    img: '/images/featured_cam01_movelikethat.jpg',
    angleCount: 7,
    extraImgs: [
      '/images/featured_cam02_movelikethat.jpg',
      '/images/featured_cam03_movelikethat.jpg'
    ]
  },
  { 
    id: 597, 
    title: 'CHESS', 
    subtitle: 'Incheon 20250719 (Dahyun Solo)', 
    img: '/images/featured_cam01_chess.jpg',
    angleCount: 5,
    extraImgs: [
      '/images/featured_cam02_chess.jpg',
      '/images/featured_cam03_chess.jpg'
    ]
  },
  { 
    id: 68, 
    title: 'RIGHT HAND GIRL', 
    subtitle: 'Incheon 20250720 (Tzuyu, Jihyo Focus)', 
    img: '/images/featured_cam01_righthandgirl.jpg',
    angleCount: 5,
    extraImgs: [
      '/images/featured_cam02_righthandgirl.jpg',
      '/images/featured_cam03_righthandgirl.jpg'
    ]
  },
  { 
    id: 1696, 
    title: 'CRY FOR ME', 
    subtitle: 'Incheon 20250719 (Chaeyoung, Tzuyu Focus)', 
    img: '/images/featured_cam01_cryforme.jpg',
    angleCount: 9,
    extraImgs: [
      '/images/featured_cam02_cryforme.jpg',
      '/images/featured_cam03_cryforme.jpg'
    ]
  },
];

export const MAX_FEATURED_DISPLAY = 8;
