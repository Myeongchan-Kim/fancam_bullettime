import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import MultiAnglePlayer from './MultiAnglePlayer';
import { GlobalAudioProvider } from '../context/AudioContext';
import { Video } from '../types';

describe('MultiAnglePlayer desktop initial render', () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    (globalThis as any).localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    // Simulate PC Desktop viewport (>= 1024px) where Desktop Mosaic branch executes
    (globalThis as any).window = {
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  it('renders loading state on PC desktop when videos array is empty without throwing aspect_ratio TypeError', () => {
    expect(() =>
      renderToStaticMarkup(
        <MemoryRouter initialEntries={['/video/597']}>
          <GlobalAudioProvider>
            <MultiAnglePlayer videos={[]} isLoadingData={true} />
          </GlobalAudioProvider>
        </MemoryRouter>
      )
    ).not.toThrow();
  });

  it('renders PC desktop mosaic when master video is loaded', () => {
    const master: Video = {
      id: 597,
      youtube_id: 'yt-597',
      title: '250720 TWICE Fancam',
      thumbnail_url: 'https://img.youtube.com/vi/yt-597/0.jpg',
      url: 'https://youtube.com/watch?v=yt-597',
      members: ['Sana'],
      angle: 'North (Front)',
      coordinate_x: 0,
      coordinate_y: 0,
      sync_offset: 220,
      duration: 210,
      is_shorts: false,
      created_at: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/video/597']}>
        <GlobalAudioProvider>
          <MultiAnglePlayer videos={[master]} isLoadingData={false} />
        </GlobalAudioProvider>
      </MemoryRouter>
    );

    expect(html).toContain('250720 TWICE Fancam');
  });
});
