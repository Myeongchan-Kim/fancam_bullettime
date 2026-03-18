export interface Song {
  id: number;
  name: string;
  order: number;
  is_solo: boolean;
  member_name?: string;
}

export interface Concert {
  id: number;
  date: string;
  city: string;
  country: string;
  venue: string;
}

export interface Video {
  id: number;
  youtube_id: string;
  title: string;
  thumbnail_url: string;
  url: string;
  members: string[];
  angle: string;
  coordinate_x: number | null;
  coordinate_y: number | null;
  sync_offset: number;
  created_at: string;
  song?: Song;
  concert?: Concert;
}

export interface Contribution {
  id: number;
  video_id: number;
  suggested_title: string | null;
  suggested_song_id: number | null;
  suggested_concert_id: number | null;
  suggested_members: string[] | null;
  suggested_angle: string | null;
  suggested_coordinate_x: number | null;
  suggested_coordinate_y: number | null;
  suggested_sync_offset: number | null;
  is_processed: boolean;
  created_at: string;
}
