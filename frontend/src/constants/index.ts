// Vercel 환경 변수(VITE_API_BASE_URL)가 있으면 그걸 쓰고, 없으면 Vite proxy(/api)를 사용합니다.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';


export const TWICE_MEMBERS = [
  "Nayeon",
  "Jeongyeon",
  "Momo",
  "Sana",
  "Jihyo",
  "Mina",
  "Dahyun",
  "Chaeyoung",
  "Tzuyu"
];

export const STAGE_ANGLES = [
  "North (Front)",
  "South (Back)",
  "East (Right)",
  "West (Left)",
  "Top",
  "Floor",
  "Unknown"
];
