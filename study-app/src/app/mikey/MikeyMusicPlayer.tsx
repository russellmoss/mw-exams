"use client";

// Floating music player for Lil' Mikey's Wine Adventure — the same kind of widget as Pipeline
// Catcher's Playlist (collapsible card, prev / play-pause / next, a seek bar, and an expandable
// track list), backed by a single self-contained <audio> element that cycles the six menu tracks.
// It mounts when the game starts and begins playing UNMUTED on that user gesture; play/pause is the
// mute. Tracks alternate automatically (advance on `ended`) and loop round.

import { useState, useEffect, useRef, useCallback } from "react";

interface Song { id: string; file: string; artist: string; title: string }

// Same audio files as Pipeline Catcher → reuse its song titles. Ordered as the user listed them.
const PLAYLIST: Song[] = [
  { id: "menu-music-4", file: "/mikey/audio/menu-music-4.mp3", artist: "Lady Gaga", title: "Bad Romance" },
  { id: "menu-music-5", file: "/mikey/audio/menu-music-5.mp3", artist: "Shakira", title: "Hips Don't Lie" },
  { id: "menu-music-6", file: "/mikey/audio/menu-music-6.mp3", artist: "Fetty Wap", title: "Trap Queen" },
  { id: "menu-music", file: "/mikey/audio/menu-music.mp3", artist: "Gorillaz", title: "Clint Eastwood" },
  { id: "menu-music-2", file: "/mikey/audio/menu-music-2.mp3", artist: "Outkast", title: "Hey Ya" },
  { id: "menu-music-3", file: "/mikey/audio/menu-music-3.mp3", artist: "The White Stripes", title: "Seven Nation Army" },
];

function fmt(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function MikeyMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  const song = PLAYLIST[index];

  // Autostart unmuted on mount — the parent only mounts this on the START gesture, so the browser
  // autoplay policy is satisfied. If a browser still blocks it, the play/pause button recovers.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load + (re)play whenever the track changes; keep playing across track changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.load();
    if (isPlaying) a.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const next = useCallback(() => setIndex((i) => (i + 1) % PLAYLIST.length), []);
  const prev = useCallback(() => setIndex((i) => (i - 1 + PLAYLIST.length) % PLAYLIST.length), []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().then(() => setIsPlaying(true)).catch(() => {});
    else { a.pause(); setIsPlaying(false); }
  }, []);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (a) a.currentTime = t;
    setCurrentTime(t);
  }, []);

  const display = dragging ? dragTime : currentTime;
  const progress = duration > 0 ? (display / duration) * 100 : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)] select-none">
      <audio
        ref={audioRef}
        src={song.file}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={next}
        onTimeUpdate={(e) => !dragging && setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <div className="bg-fuchsia-950/90 backdrop-blur rounded-xl border border-fuchsia-500/40 shadow-2xl shadow-fuchsia-900/50 overflow-hidden">
        <div className="flex items-center gap-3 p-3">
          {/* Album-art tile (emoji — no asset needed) */}
          <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-2xl bg-gradient-to-br from-amber-400/30 via-pink-500/30 to-fuchsia-500/30 border border-white/10">
            🍷
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold text-sm truncate">{song.title}</div>
            <div className="text-fuchsia-200/70 text-xs truncate">{song.artist}</div>
            <div className="mt-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={display}
                onChange={(e) => { const t = parseFloat(e.target.value); setDragTime(t); seek(t); }}
                onMouseDown={() => { setDragging(true); setDragTime(currentTime); }}
                onMouseUp={() => setDragging(false)}
                onTouchStart={() => { setDragging(true); setDragTime(currentTime); }}
                onTouchEnd={() => setDragging(false)}
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${progress}%, rgba(255,255,255,0.18) ${progress}%, rgba(255,255,255,0.18) 100%)` }}
                aria-label="Seek"
              />
              <div className="flex justify-between text-[10px] text-fuchsia-200/60 mt-0.5 tabular-nums">
                <span>{fmt(display)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1">
            <button onClick={prev} title="Previous" className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" /></svg>
            </button>
            <button onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} className="p-2 rounded-full bg-amber-500 hover:bg-amber-400 text-fuchsia-950 transition-colors cursor-pointer">
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
              )}
            </button>
            <button onClick={next} title="Next" className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 15.707a1 1 0 010-1.414L8.586 10 4.293 5.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0zm6 0a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            </button>
          </div>
          <button onClick={() => setExpanded((e) => !e)} title={expanded ? "Collapse" : "Show playlist"} className="text-fuchsia-200/70 hover:text-white text-xs flex items-center gap-1 cursor-pointer">
            Playlist
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
        </div>

        {expanded && (
          <div className="border-t border-fuchsia-500/30 max-h-64 overflow-y-auto p-2">
            {PLAYLIST.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setIndex(i); setExpanded(false); }}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${i === index ? "bg-amber-500/15 border border-amber-400/40" : "hover:bg-white/5"}`}
              >
                <span className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-sm bg-white/5">{i === index && isPlaying ? "🎵" : "🍷"}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium truncate ${i === index ? "text-amber-300" : "text-white"}`}>{s.title}</span>
                  <span className="block text-[11px] text-fuchsia-200/60 truncate">{s.artist}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
