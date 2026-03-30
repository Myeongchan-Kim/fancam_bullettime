export interface Song {
  id: number;
  name: string;
  order?: number | null;
  is_solo: boolean;
  member_name?: string;
}

export interface ConcertSetlist {
  id: number;
  concert_id: number;
  song_id: number | null;
  event_name: string | null;
  start_time: number;
  display_order: number;
  song?: Song;
}

export interface Concert {
  id: number;
  date: string;
  city: string;
  country: string;
  venue: string;
  setlist?: ConcertSetlist[];
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
  duration: number;
  is_shorts: boolean;
  created_at: string;
  songs?: Song[];
  concert?: Concert;
}

export interface Contribution {
  id: number;
  video_id: number | null;
  video_title?: string;
  suggested_url: string | null;
  suggested_title: string | null;
  suggested_song_ids: number[] | null;
  suggested_concert_id: number | null;
  suggested_members: string[] | null;
  suggested_duration: number | null;
  suggested_angle: string | null;
  suggested_coordinate_x: number | null;
  suggested_coordinate_y: number | null;
  suggested_sync_offset: number | null;
  suggested_setlist_id: number | null;
  suggested_start_time: number | null;
  is_processed: boolean;
  created_at: string;
}
