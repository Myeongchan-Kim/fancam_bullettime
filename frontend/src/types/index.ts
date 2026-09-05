export interface Song {
  id: number;
  name: string;
  order?: number | null;
  is_solo: boolean;
  member_name?: string;
  act?: string | null;
  stage_outfit?: string | null;
  visual_notes?: string | null;
  description?: string | null;
}

export interface ConcertSetlist {
  id: number;
  concert_id: number;
  song_id: number | null;
  event_name: string | null;
  start_time: number | null;
  display_order: number;
  song?: Song;
}

export interface Concert {
  id: number;
  date: string;
  city: string;
  country: string;
  venue: string;
  video_count?: number;
  setlist?: ConcertSetlist[];
}

export interface VideoSyncSegment {
  id: number;
  video_id: number;
  setlist_id?: number | null;
  video_start_time: number;
  video_end_time: number;
  master_start_time: number;
  master_end_time: number;
  sync_offset: number;
  label?: string | null;
  is_verified?: boolean;
  created_at?: string;
  setlist?: ConcertSetlist;
}

export interface Video {
  id: number;
  youtube_id: string;
  title: string;
  description?: string | null;
  thumbnail_url: string;
  url: string;
  members: string[];
  angle: string;
  coordinate_x: number | null;
  coordinate_y: number | null;
  sync_offset: number;
  duration: number;
  is_shorts: boolean;
  calibration_count?: number;
  calibration_status?: string;
  calibrated_at?: string | null;
  calibration_method?: string | null;
  view_count?: number;
  like_count?: number;
  created_at: string;
  concert_id?: number | null;
  songs?: Song[];
  concert?: Concert;
  sync_segments?: VideoSyncSegment[];
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
  suggested_event_name: string | null;
  is_processed: boolean;
  created_at: string;
}

export interface PaginatedVideos {
  total_count: number;
  videos: Video[];
}

export interface SyncGraphVideoNode {
  id: number;
  youtube_id: string;
  title: string;
  duration: number;
  sync_offset: number;
  master_start_time: number;
  master_end_time: number;
  members: string[];
  angle?: string;
  is_master: boolean;
  status: 'master' | 'verified' | 'segmented' | 'uncalibrated' | 'ai_calibrated' | 'drift_warning';
  status_reason: string;
  calibration_count?: number;
  calibration_status?: string;
  calibrated_at?: string | null;
  calibration_method?: string | null;
  view_count?: number;
  like_count?: number;
  segments: {
    id: number;
    video_start: number;
    video_end: number;
    master_start: number;
    master_end: number;
    sync_offset: number;
    label?: string | null;
    is_verified?: boolean;
  }[];
  songs: {
    id: number;
    name: string;
    is_solo: boolean;
    member_name?: string;
  }[];
}

export interface SyncGraphSetlistItem {
  id: number;
  song_id: number | null;
  name: string;
  is_solo: boolean;
  member_name?: string | null;
  act?: string | null;
  display_order: number;
  start_time: number;
  end_time: number;
}

export interface SyncGraphData {
  concert: {
    id: number;
    date: string | null;
    city: string;
    venue: string;
    total_videos: number;
  };
  master_video: {
    id: number;
    youtube_id: string;
    duration: number;
    title: string;
  } | null;
  setlist: SyncGraphSetlistItem[];
  videos: SyncGraphVideoNode[];
}

