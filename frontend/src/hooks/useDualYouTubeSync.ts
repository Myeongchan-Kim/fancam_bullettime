import { useState, useRef, useEffect, useCallback } from 'react';
import { YouTubePlayer } from 'react-youtube';
import { SyncGraphVideoNode } from '../types';
import {
  calculateLocalSeekTime,
  calculateMasterTimeFromLocal,
  isCursorInsideVideoRange,
} from '../utils/syncGraphCalculations';

interface UseDualYouTubeSyncOptions {
  videoA: SyncGraphVideoNode | null;
  videoB: SyncGraphVideoNode | null;
  selectedTimeCursor: number;
  setSelectedTimeCursor: (time: number) => void;
  fineTuneDelta: number;
  minMasterTime: number;
  maxMasterTime: number;
  totalDuration: number;
  isDraggingTimelineRef?: React.MutableRefObject<boolean>;
}

export function useDualYouTubeSync({
  videoA,
  videoB,
  selectedTimeCursor,
  setSelectedTimeCursor,
  fineTuneDelta,
  minMasterTime,
  maxMasterTime,
  totalDuration,
  isDraggingTimelineRef,
}: UseDualYouTubeSyncOptions) {
  const [playerA, setPlayerA] = useState<YouTubePlayer | null>(null);
  const [playerB, setPlayerB] = useState<YouTubePlayer | null>(null);
  const lastTimeRefA = useRef<number>(0);
  const lastTimeRefB = useRef<number>(0);
  const lastSeekTimeARef = useRef<number>(0);
  const lastSeekTimeBRef = useRef<number>(0);
  const isPlaybackTickRef = useRef<boolean>(false);

  const seekToMasterTimeline = useCallback(
    (masterSec: number) => {
      const clamped = Math.max(minMasterTime, Math.min(maxMasterTime, masterSec));
      isPlaybackTickRef.current = false;
      setSelectedTimeCursor(clamped);

      const stateA = typeof playerA?.getPlayerState === 'function' ? playerA.getPlayerState() : -1;
      const stateB = typeof playerB?.getPlayerState === 'function' ? playerB.getPlayerState() : -1;
      const isPlaying = stateA === 1 || stateB === 1;

      if (videoA && playerA) {
        const insideA = isCursorInsideVideoRange(videoA, clamped);
        const targetA = calculateLocalSeekTime(videoA, clamped);
        try {
          if (insideA) {
            playerA.seekTo?.(targetA, true);
            if (isPlaying && stateA !== 1) {
              playerA.playVideo?.();
            }
            lastTimeRefA.current = targetA;
          } else {
            playerA.pauseVideo?.();
            playerA.seekTo?.(targetA, true);
            lastTimeRefA.current = targetA;
          }
        } catch {}
      }

      if (videoB && playerB) {
        const insideB = isCursorInsideVideoRange(videoB, clamped);
        const targetB = calculateLocalSeekTime(videoB, clamped, fineTuneDelta);
        try {
          if (insideB) {
            playerB.seekTo?.(targetB, true);
            if (isPlaying && stateB !== 1) {
              playerB.playVideo?.();
            }
            lastTimeRefB.current = targetB;
          } else {
            playerB.pauseVideo?.();
            playerB.seekTo?.(targetB, true);
            lastTimeRefB.current = targetB;
          }
        } catch {}
      }

      lastSeekTimeARef.current = Date.now();
      lastSeekTimeBRef.current = Date.now();
    },
    [minMasterTime, maxMasterTime, setSelectedTimeCursor, playerA, playerB, videoA, videoB, fineTuneDelta]
  );

  // Sync Deck B when fineTuneDelta changes
  useEffect(() => {
    if (!videoB || !playerB) return;
    const targetB = calculateLocalSeekTime(videoB, selectedTimeCursor, fineTuneDelta);
    try {
      playerB.seekTo(targetB, true);
    } catch {}
  }, [fineTuneDelta, videoB, playerB]);

  // Bidirectional Pairwise Sync Loop
  useEffect(() => {
    const interval = setInterval(() => {
      if (!playerA && !playerB) return;
      if (isDraggingTimelineRef?.current) return;

      try {
        const stateA = typeof playerA?.getPlayerState === 'function' ? playerA.getPlayerState() : -1;
        const stateB = typeof playerB?.getPlayerState === 'function' ? playerB.getPlayerState() : -1;
        const timeA = typeof playerA?.getCurrentTime === 'function' ? playerA.getCurrentTime() : 0;
        const timeB = typeof playerB?.getCurrentTime === 'function' ? playerB.getCurrentTime() : 0;

        if (stateA === 1 && videoA) {
          isPlaybackTickRef.current = true;
          const masterTime = calculateMasterTimeFromLocal(videoA, timeA, totalDuration);

          if (Math.abs(masterTime - selectedTimeCursor) >= 0.2) {
            setSelectedTimeCursor(masterTime);
          }

          if (playerB && videoB) {
            const expB = calculateLocalSeekTime(videoB, masterTime, fineTuneDelta);
            const durB = videoB.duration || 300;
            if (expB >= 0 && expB <= durB) {
              if (stateB !== 1 && stateB !== 3) {
                playerB.seekTo(expB, true);
                playerB.playVideo();
                lastSeekTimeBRef.current = Date.now();
              } else if (stateB === 1 && Math.abs(timeB - expB) > 0.9 && Date.now() - lastSeekTimeBRef.current > 2000) {
                playerB.seekTo(expB, true);
                lastSeekTimeBRef.current = Date.now();
              }
            } else if (stateB === 1) {
              playerB.pauseVideo();
            }
          }
          setTimeout(() => {
            isPlaybackTickRef.current = false;
          }, 80);
          lastTimeRefA.current = timeA;
          lastTimeRefB.current = timeB;
          return;
        }

        if (stateB === 1 && videoB && stateA !== 1) {
          isPlaybackTickRef.current = true;
          const masterTime = calculateMasterTimeFromLocal(videoB, timeB, totalDuration, fineTuneDelta, minMasterTime);

          if (Math.abs(masterTime - selectedTimeCursor) >= 0.2) {
            setSelectedTimeCursor(masterTime);
          }

          if (playerA && videoA) {
            const expA = calculateLocalSeekTime(videoA, masterTime);
            const durA = videoA.duration || 300;
            if (expA >= 0 && expA <= durA) {
              if (stateA !== 1 && stateA !== 3) {
                playerA.seekTo(expA, true);
                playerA.playVideo();
                lastSeekTimeARef.current = Date.now();
              } else if (stateA === 1 && Math.abs(timeA - expA) > 0.9 && Date.now() - lastSeekTimeARef.current > 2000) {
                playerA.seekTo(expA, true);
                lastSeekTimeARef.current = Date.now();
              }
            } else if (stateA === 1) {
              playerA.pauseVideo();
            }
          }
          setTimeout(() => {
            isPlaybackTickRef.current = false;
          }, 80);
          lastTimeRefA.current = timeA;
          lastTimeRefB.current = timeB;
          return;
        }

        if (stateA !== 1 && stateB !== 1) {
          if (
            videoA &&
            isCursorInsideVideoRange(videoA, selectedTimeCursor) &&
            Math.abs(timeA - lastTimeRefA.current) > 1.5
          ) {
            isPlaybackTickRef.current = true;
            const masterTime = calculateMasterTimeFromLocal(videoA, timeA, totalDuration, 0, minMasterTime);
            setSelectedTimeCursor(masterTime);
            if (playerB && videoB) {
              const expB = calculateLocalSeekTime(videoB, masterTime, fineTuneDelta);
              playerB.seekTo(expB, true);
            }
            setTimeout(() => {
              isPlaybackTickRef.current = false;
            }, 80);
          } else if (
            videoB &&
            isCursorInsideVideoRange(videoB, selectedTimeCursor) &&
            Math.abs(timeB - lastTimeRefB.current) > 1.5
          ) {
            isPlaybackTickRef.current = true;
            const masterTime = calculateMasterTimeFromLocal(videoB, timeB, totalDuration, fineTuneDelta, minMasterTime);
            setSelectedTimeCursor(masterTime);
            if (playerA && videoA) {
              const expA = calculateLocalSeekTime(videoA, masterTime);
              playerA.seekTo(expA, true);
            }
            setTimeout(() => {
              isPlaybackTickRef.current = false;
            }, 80);
          }
          lastTimeRefA.current = timeA;
          lastTimeRefB.current = timeB;
        }
      } catch {}
    }, 250);

    return () => clearInterval(interval);
  }, [playerA, playerB, videoA, videoB, selectedTimeCursor, fineTuneDelta, totalDuration, minMasterTime]);

  return {
    playerA,
    setPlayerA,
    playerB,
    setPlayerB,
    lastTimeRefA,
    lastTimeRefB,
    lastSeekTimeARef,
    lastSeekTimeBRef,
    isPlaybackTickRef,
    seekToMasterTimeline,
  };
}
