// Vercel 환경 변수(VITE_API_BASE_URL)가 있으면 그걸 쓰고, 없으면 Vite proxy(/api)를 사용합니다.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const STAGE_ANGLES = [
  "North (Front)",
  "South (Back)",
  "East (Right)",
  "West (Left)",
  "Top",
  "Floor",
  "Unknown"
];

export const ANGLE_OPTIONS = STAGE_ANGLES;

export const TWICE_MEMBERS = [
  "NAYEON",
  "JEONGYEON",
  "MOMO",
  "SANA",
  "JIHYO",
  "MINA",
  "DAHYUN",
  "CHAEYOUNG",
  "TZUYU"
];

export const MEMBER_COLORS: Record<string, string> = {
  NAYEON: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  JEONGYEON: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
  MOMO: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  SANA: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  JIHYO: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  MINA: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  DAHYUN: 'bg-slate-200/20 text-slate-200 border-slate-300/30',
  CHAEYOUNG: 'bg-red-500/20 text-red-300 border-red-500/30',
  TZUYU: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
};
