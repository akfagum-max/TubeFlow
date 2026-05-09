/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Search, 
  ExternalLink, 
  Volume2, 
  VolumeX,
  Youtube,
  Music2,
  Settings2,
  Lock,
  Zap,
  Activity,
  Layers,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  Repeat,
  Repeat1,
  Plus,
  Trash2,
  Loader2,
  X,
  ListMusic,
  Mic2,
  Filter,
  GripVertical,
  Download,
  Timer,
  Gauge,
  History,
  Moon,
  Share2,
  Keyboard,
  Monitor,
  ToggleRight,
  ToggleLeft,
  PictureInPicture
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Track {
  id: string;
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
}

// YouTube Player state constants
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_ENDED = 0;

export default function App() {
  const [url, setUrl] = useState('');
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [player, setPlayer] = useState<any>(null);
  const [playerState, setPlayerState] = useState<number>(-1);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // New States
  const [volume, setVolume] = useState(100);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const [isDirectMode, setIsDirectMode] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isFetchingLyrics, setIsFetchingLyrics] = useState(false);
  const [searchFilters, setSearchFilters] = useState({
    type: 'video',
    duration: 'all',
    sort: 'relevance'
  });
  
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(0); // 0: None, 1: One, 2: All
  const [isOledMode, setIsOledMode] = useState(false);
  const [showVisualizer, setShowVisualizer] = useState(true);
  const [history, setHistory] = useState<Track[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [isFloating, setIsFloating] = useState(false);

  const handleNextRef = useRef<() => void>(() => {});
  const handlePrevRef = useRef<() => void>(() => {});
  const updateMediaSessionRef = useRef<(state: number) => void>(() => {});
  const autoPlayNextRef = useRef(autoPlayNext);

  useEffect(() => { autoPlayNextRef.current = autoPlayNext }, [autoPlayNext]);

  const [metadata, setMetadata] = useState<{ title: string; author: string; thumbnail: string }>({
    title: 'Ready for Stream',
    author: 'Enter a valid URL',
    thumbnail: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=400'
  });

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Restore playlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tubestream-playlist');
    const savedIndex = localStorage.getItem('tubestream-current-index');
    if (saved) {
      try {
        setPlaylist(JSON.parse(saved));
        if (savedIndex) setCurrentIndex(parseInt(savedIndex));
      } catch (err) {}
    }
  }, []);

  // Save playlist to localStorage
  useEffect(() => {
    localStorage.setItem('tubestream-playlist', JSON.stringify(playlist));
    localStorage.setItem('tubestream-current-index', currentIndex.toString());
  }, [playlist, currentIndex]);

  // Sleep Timer Tick
  useEffect(() => {
    let interval: any;
    if (sleepTimerRemaining !== null && sleepTimerRemaining > 0) {
      interval = setInterval(() => {
        setSleepTimerRemaining(prev => {
          if (prev && prev <= 1) {
            if (player) player.pauseVideo();
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [sleepTimerRemaining, player]);

  // Load YouTube IFrame API and check for deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get('v');
    if (videoId) {
       // Search for the video and add it if it's a deep link
       fetch(`/api/search?q=${videoId}`)
        .then(r => r.json())
        .then(data => {
           if (data && data.length > 0) {
              const video = data[0];
              const newTrack: Track = {
                id: Math.random().toString(36).substr(2, 9),
                videoId: video.videoId,
                title: video.title,
                author: video.author.name,
                thumbnail: video.thumbnail
              };
              setPlaylist(prev => [newTrack, ...prev]);
              setCurrentIndex(0);
           }
        });
    }

    if ((window as any).YT) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    (window as any).onYouTubeIframeAPIReady = () => {
      console.log('YT API Ready');
    };
  }, []);

  // Progress Tracker
  useEffect(() => {
    let interval: any;
    if (player && playerState === YT_PLAYING) {
      interval = setInterval(() => {
        setCurrentTime(player.getCurrentTime());
        setDuration(player.getDuration());
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [player, playerState]);

  const extractVideoId = (url: string) => {
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  };

  const initPlayer = useCallback((id: string) => {
    if (player) {
      player.loadVideoById(id);
      return;
    }

    const newPlayer = new (window as any).YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      videoId: id,
      playerVars: {
        playsinline: 1,
        autoplay: 1,
        controls: 0,
        rel: 0,
        modestbranding: 1
      },
      events: {
        onReady: (event: any) => {
          setPlayer(event.target);
          updateMediaSessionRef.current(event.target.getPlayerState());
        },
        onStateChange: (event: any) => {
          setPlayerState(event.data);
          updateMediaSessionRef.current(event.data);
          if (event.data === YT_ENDED) {
            if (autoPlayNextRef.current) {
              handleNextRef.current();
            }
          }
        }
      }
    });
  }, [player]); // Minimal dependency

  const playTrack = useCallback(async (index: number) => {
    if (index < 0 || index >= playlist.length) return;
    
    const track = playlist[index];
    setCurrentIndex(index);
    setMetadata({
      title: track.title,
      author: track.author,
      thumbnail: track.thumbnail
    });

    // Reset and fetch lyrics
    setLyrics('');
    fetchLyrics(track.author, track.title);

    // Add to history
    setHistory(prev => {
      const filtered = prev.filter(t => t.videoId !== track.videoId);
      const updated = [track, ...filtered].slice(0, 50);
      localStorage.setItem('tubestream-history', JSON.stringify(updated));
      return updated;
    });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.author,
        artwork: [
          { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' },
          { src: `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' }
        ]
      });
    }

    if (player) {
      player.loadVideoById(track.videoId);
    } else {
      initPlayer(track.videoId);
    }
  }, [playlist, player, initPlayer]);

  const handleNext = useCallback(() => {
    if (playlist.length === 0) return;

    if (repeatMode === 1) { // Repeat One
      player?.seekTo(0);
      player?.playVideo();
      return;
    }

    if (isShuffle) {
      if (playlist.length <= 1) {
        player?.seekTo(0);
        player?.playVideo();
      } else {
        let nextIdx = currentIndex;
        while (nextIdx === currentIndex) {
          nextIdx = Math.floor(Math.random() * playlist.length);
        }
        playTrack(nextIdx);
      }
      return;
    }

    if (currentIndex < playlist.length - 1) {
      playTrack(currentIndex + 1);
    } else if (repeatMode === 2) { // Repeat All
      playTrack(0);
    }
  }, [currentIndex, playlist.length, playTrack, isShuffle, repeatMode, player]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      playTrack(currentIndex - 1);
    } else {
      player?.seekTo(0);
    }
  }, [currentIndex, playTrack, player]);

  const updateMediaSession = useCallback((state: number) => {
    if (!('mediaSession' in navigator)) return;

    if (state === YT_PLAYING) {
      navigator.mediaSession.playbackState = 'playing';
    } else if (state === YT_PAUSED) {
      navigator.mediaSession.playbackState = 'paused';
    }

    navigator.mediaSession.setActionHandler('play', () => player?.playVideo());
    navigator.mediaSession.setActionHandler('pause', () => player?.pauseVideo());
    navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
    navigator.mediaSession.setActionHandler('nexttrack', handleNext);
  }, [player, handleNext, handlePrev]);

  const handleAdd = async (inputUrl?: string) => {
    const targetUrl = inputUrl || searchQuery;
    const id = extractVideoId(targetUrl);
    if (!id) return;

    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
      const data = await response.json();
      
      const newTrack: Track = {
        id: Math.random().toString(36).substr(2, 9),
        videoId: id,
        title: data.title,
        author: data.author_name,
        thumbnail: data.thumbnail_url
      };

      if (isDirectMode) {
        setPlaylist([newTrack]);
        setTimeout(() => playTrack(0), 100);
      } else {
        setPlaylist(prev => {
          const updated = [...prev, newTrack];
          if (updated.length === 1) {
            setTimeout(() => playTrack(0), 100);
          }
          return updated;
        });
      }
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to add track', err);
    }
  };

  const handleAddFromSearch = (video: any, playNow: boolean = false) => {
    const newTrack: Track = {
      id: Math.random().toString(36).substr(2, 9),
      videoId: video.videoId,
      title: video.title,
      author: video.author,
      thumbnail: video.thumbnail
    };

    if (playNow || isDirectMode) {
      setPlaylist(prev => {
        const nextPlaylist = [newTrack, ...prev];
        setTimeout(() => playTrack(0), 100);
        return nextPlaylist;
      });
    } else {
      setPlaylist(prev => {
        const updated = [...prev, newTrack];
        if (updated.length === 1) {
          setTimeout(() => playTrack(0), 100);
        }
        return updated;
      });
    }
    setIsSearchOpen(false);
  };

  const fetchLyrics = async (artist: string, title: string) => {
    setIsFetchingLyrics(true);
    try {
      const response = await fetch(`/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
      const data = await response.json();
      setLyrics(data.lyrics || 'No lyrics found.');
    } catch (err) {
      console.error('Lyrics fetch failed', err);
      setLyrics('Failed to load lyrics.');
    } finally {
      setIsFetchingLyrics(false);
    }
  };

  // Sync refs after all functions are defined
  useEffect(() => { handleNextRef.current = handleNext; }, [handleNext]);
  useEffect(() => { handlePrevRef.current = handlePrev; }, [handlePrev]);
  useEffect(() => { updateMediaSessionRef.current = updateMediaSession; }, [updateMediaSession]);

  // Load History
  useEffect(() => {
    const saved = localStorage.getItem('tubestream-history');
    if (saved) setHistory(JSON.parse(saved).slice(0, 50));
  }, []);

  const performSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setIsSearchOpen(true);
    try {
      const { type, duration, sort } = searchFilters;
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&type=${type}&duration=${duration}&sort=${sort}`);
      const data = await response.json();
      setSearchResults(data.videos || []);
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPlaylist((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const updated = arrayMove(items, oldIndex, newIndex);
        
        // Update current index if the moving track was affected
        if (currentIndex === oldIndex) {
          setCurrentIndex(newIndex);
        } else if (currentIndex > oldIndex && currentIndex <= newIndex) {
          setCurrentIndex(currentIndex - 1);
        } else if (currentIndex < oldIndex && currentIndex >= newIndex) {
          setCurrentIndex(currentIndex + 1);
        }

        return updated;
      });
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseInt(e.target.value);
    setVolume(newVol);
    if (player) {
      player.setVolume(newVol);
      if (newVol > 0 && isMuted) {
        setIsMuted(false);
        player.unMute();
      } else if (newVol === 0 && !isMuted) {
        setIsMuted(true);
        player.mute();
      }
    }
  };

  const removeTrack = (id: string) => {
    setPlaylist(prev => {
      const index = prev.findIndex(t => t.id === id);
      const updated = prev.filter(t => t.id !== id);
      
      if (index === currentIndex) {
        if (updated.length > 0) {
          playTrack(Math.min(index, updated.length - 1));
        } else {
          setCurrentIndex(-1);
          player?.stopVideo();
        }
      } else if (index < currentIndex) {
        setCurrentIndex(currentIndex - 1);
      }
      
      return updated;
    });
  };

  const moveTrack = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === playlist.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    setPlaylist(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(index, 1);
      updated.splice(newIndex, 0, moved);
      
      // Update current index if the moving track was the current one or affected it
      if (currentIndex === index) {
        setCurrentIndex(newIndex);
      } else if (currentIndex === newIndex) {
        setCurrentIndex(index);
      }
      
      return updated;
    });
  };

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState<string | null>(null); // videoId or 'playlist'
  const [downloadOptions, setDownloadOptions] = useState({
    type: 'audio', // 'audio' | 'video'
    quality: 'high', // 'high' | 'low'
    captionLang: '',
    cookies: ''
  });

  const handleDownloadTrack = async (videoId: string, simulate = false) => {
    try {
      const res = await fetch("/api/download/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: videoId,
          ...downloadOptions
        })
      });
      const data = await res.json();
      if (data.token && !simulate) {
        const a = document.createElement('a');
        a.href = `/api/download?token=${data.token}`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Failed to prepare download", err);
    }
  };

  const executeDownload = async () => {
    if (!downloadTarget) return;
    setIsDownloadModalOpen(false);
    
    if (downloadTarget === 'playlist') {
      for (const track of playlist) {
        await handleDownloadTrack(track.videoId);
        await new Promise(resolve => setTimeout(resolve, 800)); // Stagger
      }
    } else {
      await handleDownloadTrack(downloadTarget);
    }
  };

  const shareTrack = () => {
    const track = playlist[currentIndex];
    if (!track) return;
    const url = `${window.location.origin}${window.location.pathname}?v=${track.videoId}`;
    navigator.clipboard.writeText(url);
    alert('Share URL copied to clipboard!');
  };

  const openDownloadModal = (target: string) => {
    setDownloadTarget(target);
    setIsDownloadModalOpen(true);
  };

  const togglePlay = () => {
    if (!player) return;
    if (playerState === YT_PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [0.5, 1, 1.25, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (player) {
      player.setPlaybackRate(nextRate);
    }
  };

  const cycleSleepTimer = () => {
    const times = [null, 15 * 60, 30 * 60, 45 * 60, 60 * 60];
    let nextIndex = 1;
    if (sleepTimerRemaining !== null) {
      const currentMatched = times.findIndex(t => t !== null && sleepTimerRemaining <= t && sleepTimerRemaining > t - 900);
      nextIndex = currentMatched === -1 ? 0 : (currentMatched + 1) % times.length;
    }
    setSleepTimerRemaining(times[nextIndex]);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      switch(e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'n':
          handleNext();
          break;
        case 'p':
          handlePrev();
          break;
        case 'm':
          if (player) {
            if (isMuted) { player.unMute(); setIsMuted(false); }
            else { player.mute(); setIsMuted(true); }
          }
          break;
        case 'l':
          setIsLyricsOpen(prev => !prev);
          break;
        case 'h':
          setIsHistoryOpen(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [player, togglePlay, handleNext, handlePrev, isMuted]);

  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs > 0 ? hrs + ':' : ''}${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 flex flex-col font-sans overflow-hidden selection:bg-red-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-white/10 relative z-20 bg-[#050505]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/20">
            <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-1"></div>
          </div>
          <span className="text-xl font-bold tracking-tight uppercase">TubeStream <span className="text-red-600 font-black">PWA</span></span>
        </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-4">
              <button 
                onClick={() => setIsDirectMode(!isDirectMode)}
                className={`px-4 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${isDirectMode ? 'bg-blue-600/10 border-blue-600/30 text-blue-500' : 'bg-red-600/10 border-red-600/30 text-red-500'}`}
              >
                {isDirectMode ? 'Direct Mode' : 'Playlist Mode'}
              </button>
              <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                <div className={`w-2 h-2 bg-green-500 rounded-full ${playerState === YT_PLAYING ? 'animate-pulse' : ''}`}></div>
                <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Live Engine</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsOledMode(!isOledMode)}
                className={`p-2 rounded-xl transition-all ${isOledMode ? 'bg-white text-black' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                title="OLED Mode"
              >
                <Moon className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsHistoryOpen(true)}
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                title="History"
              >
                <History className="w-5 h-5" />
              </button>
              <div className="text-[10px] text-gray-500 font-mono uppercase tracking-widest hidden md:block">v1.4.0-rev</div>
              <button 
                onClick={() => setIsLyricsOpen(!isLyricsOpen)}
                className={`p-2 transition-colors ${isLyricsOpen ? 'text-red-500' : 'text-white/40 hover:text-white'}`}
                title="Lyrics"
              >
                <Mic2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

      <main className={`flex-1 flex flex-col items-center justify-center p-6 md:p-12 relative z-10 transition-colors duration-700 ${isOledMode ? 'bg-[#000]' : 'bg-[#050505]'}`}>
        <div className={`absolute inset-x-0 inset-y-[-20%] overflow-hidden pointer-events-none opacity-30 mix-blend-screen transition-opacity duration-1000 ${isOledMode ? 'opacity-0' : 'opacity-30'}`}>
          <motion.img 
            key={metadata.thumbnail}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2 }}
            src={metadata.thumbnail} 
            alt="" 
            className="w-full h-full object-cover blur-[100px] saturate-[2]" 
          />
        </div>

        {/* URL Input Section */}
        <div className="w-full max-w-2xl mb-12 relative z-20">
          <div className="relative group">
            <input 
              type="text" 
              placeholder="Search or paste YouTube URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (extractVideoId(searchQuery) ? handleAdd() : performSearch())}
              className="w-full bg-[#111] border border-white/10 rounded-2xl py-5 pl-8 pr-48 text-lg focus:outline-none focus:border-red-600/50 transition-all placeholder:text-gray-600 shadow-2xl"
            />
            <button 
              onClick={() => extractVideoId(searchQuery) ? handleAdd() : performSearch()}
              disabled={isSearching}
              className="absolute right-3 top-3 bottom-3 px-8 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all transform active:scale-95 shadow-lg shadow-red-900/30 flex items-center justify-center gap-2"
            >
              {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : (extractVideoId(searchQuery) ? 'ADD' : 'SEARCH')}
            </button>
          </div>
          <p className="mt-4 text-center text-[10px] text-gray-500 uppercase tracking-[0.2em] font-medium opacity-60">
            {playlist.length} Tracks in Playlist &bull; Media Session API Ready &bull; Background Mode Enabled
          </p>
        </div>

        {/* Search Results Panel Overlay */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-x-4 inset-y-24 md:inset-x-24 md:inset-y-32 bg-[#0A0A0A]/98 backdrop-blur-3xl z-[60] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-[40px] flex flex-col overflow-hidden"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center bg-black/40">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div>
                    <h3 className="text-xl font-bold uppercase tracking-tight">Search Results</h3>
                    <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] mt-1 font-mono">Found {searchResults.length} videos from YouTube</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <select 
                      value={searchFilters.duration} 
                      onChange={(e) => setSearchFilters(f => ({ ...f, duration: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-[10px] uppercase font-bold tracking-widest focus:outline-none"
                    >
                      <option value="all">Any Duration</option>
                      <option value="short">Short (&lt; 4m)</option>
                      <option value="long">Long (&gt; 20m)</option>
                    </select>
                    <select 
                      value={searchFilters.sort} 
                      onChange={(e) => setSearchFilters(f => ({ ...f, sort: e.target.value }))}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-[10px] uppercase font-bold tracking-widest focus:outline-none"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="date">Upload Date</option>
                      <option value="rating">Rating</option>
                    </select>
                    <button 
                      onClick={performSearch}
                      className="p-1 px-3 bg-red-600 rounded-lg text-[10px] font-bold uppercase tracking-widest"
                    >
                      Apply
                    </button>
                  </div>
                </div>
                <button onClick={() => setIsSearchOpen(false)} className="w-12 h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-red-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {searchResults.map((video) => (
                    <motion.div 
                      key={video.videoId}
                      whileHover={{ scale: 1.02 }}
                      className="group bg-white/5 border border-white/5 rounded-3xl overflow-hidden hover:border-red-600/30 transition-all relative flex flex-col"
                    >
                      <div className="aspect-video relative overflow-hidden group-hover:after:absolute group-hover:after:inset-0 group-hover:after:bg-black/60 transition-all">
                        <img src={video.thumbnail} className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all" alt="" />
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 z-10">
                          <button 
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-full uppercase tracking-widest text-xs flex items-center gap-2 transform hover:scale-105 transition-all shadow-xl"
                            onClick={() => handleAddFromSearch(video, true)}
                          >
                            <Play className="w-4 h-4" /> Play Now
                          </button>
                          <button 
                            className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white font-bold py-2 px-6 rounded-full uppercase tracking-widest text-xs flex items-center gap-2 transform hover:scale-105 transition-all outline outline-1 outline-white/30"
                            onClick={() => handleAddFromSearch(video, false)}
                          >
                            <Plus className="w-4 h-4" /> Add to Queue
                          </button>
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] font-mono text-white/80 z-20">{video.timestamp}</div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <h4 className="text-sm font-bold line-clamp-2 mb-1">{video.title}</h4>
                        <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">{video.author}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Playlist Panel Overlay */}
        <AnimatePresence>
          {isPlaylistOpen && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-[#0A0A0A]/95 backdrop-blur-2xl z-50 border-l border-white/10 shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center bg-black/40">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold uppercase tracking-tight">Up Next</h3>
                  <button onClick={() => openDownloadModal('playlist')} title="Download Playlist" className="p-1 text-gray-500 hover:text-white transition-colors bg-white/5 rounded">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => setIsPlaylistOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                  <ChevronRight className="w-8 h-8" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {playlist.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 p-12 text-center">
                    <Music2 className="w-16 h-16 mb-4" />
                    <p className="text-sm font-medium uppercase tracking-[0.2em]">Playlist empty</p>
                  </div>
                )}
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={playlist}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {playlist.map((track, index) => (
                        <SortableItem 
                          key={track.id} 
                          track={track} 
                          index={index} 
                          currentIndex={currentIndex}
                          playTrack={playTrack}
                          removeTrack={removeTrack}
                          downloadTrack={(id: string) => openDownloadModal(id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Download Options Panel Overlay */}
        <AnimatePresence>
          {isDownloadModalOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <div className="bg-[#111] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold uppercase tracking-tight">Download Advanced</h3>
                  <button onClick={() => setIsDownloadModalOpen(false)} className="p-1 hover:text-white text-gray-500 rounded-full hover:bg-white/5">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Format</label>
                    <select 
                      value={downloadOptions.type} 
                      onChange={(e) => setDownloadOptions(o => ({ ...o, type: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
                    >
                      <option value="audio">Music (Audio Only)</option>
                      <option value="video">Full Video (with Audio limit up to 720p)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Quality</label>
                    <select 
                      value={downloadOptions.quality} 
                      onChange={(e) => setDownloadOptions(o => ({ ...o, quality: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500"
                    >
                      <option value="high">High Quality</option>
                      <option value="low">Low Quality</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Captions Language (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. en, es, fr"
                      value={downloadOptions.captionLang} 
                      onChange={(e) => setDownloadOptions(o => ({ ...o, captionLang: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 placeholder-gray-600"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">If provided, this will download the subtitle file (.vtt) instead of the media.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">YouTube Cookies JSON (For Members/Premium)</label>
                    <textarea 
                      placeholder='[{"name": "...", "value": "..."}, ...]'
                      value={downloadOptions.cookies} 
                      onChange={(e) => setDownloadOptions(o => ({ ...o, cookies: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 placeholder-gray-600 font-mono resize-none h-24"
                    />
                    <p className="text-[10px] text-gray-400 mt-2 pb-2 leading-relaxed bg-blue-900/20 p-2 rounded border border-blue-500/20">
                        <span className="font-bold text-blue-400">PRO TIP:</span> You can download ANY video, including <span className="text-white font-bold">Members-Only</span> and <span className="text-white font-bold">Premium</span> videos! Just export your cookies via extensions like <span className="italic">"Get cookies.txt LOCALLY"</span> or <span className="italic">EditThisCookie</span> as JSON, and paste them here to authenticate your download request.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setIsDownloadModalOpen(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold uppercase tracking-widest text-sm bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={executeDownload}
                    className="flex-1 py-3 px-4 rounded-xl font-bold uppercase tracking-widest text-sm bg-red-600 hover:bg-red-700 transition-colors text-white"
                  >
                    Download
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lyrics Panel Overlay */}
        <AnimatePresence>
          {isLyricsOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed inset-x-4 bottom-32 md:inset-x-auto md:right-32 md:w-[380px] md:h-[500px] bg-[#0A0A0A]/95 backdrop-blur-3xl z-[55] border border-white/10 shadow-2xl rounded-[32px] flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
                <div className="flex items-center gap-2">
                  <Mic2 className="w-4 h-4 text-red-600" />
                  <h3 className="text-sm font-bold uppercase tracking-widest">Lyrics</h3>
                </div>
                <button onClick={() => setIsLyricsOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
                {isFetchingLyrics ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-red-600" />
                  </div>
                ) : (
                  <div className="text-lg font-medium leading-relaxed text-white/80 whitespace-pre-wrap text-center italic">
                    {lyrics || "No lyrics loaded."}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Panel Overlay */}
        <AnimatePresence>
          {isHistoryOpen && (
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed inset-y-0 left-0 w-full sm:w-[400px] bg-[#0A0A0A]/95 backdrop-blur-2xl z-50 border-r border-white/10 shadow-2xl flex flex-col"
            >
              <div className="p-8 border-b border-white/10 flex justify-between items-center bg-black/40">
                <h3 className="text-xl font-bold uppercase tracking-tight">Recent History</h3>
                <button onClick={() => setIsHistoryOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                  <ChevronLeft className="w-8 h-8" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                    <History className="w-12 h-12 opacity-20" />
                    <p className="text-sm font-bold uppercase tracking-widest">No history yet</p>
                  </div>
                ) : (
                  history.map((track) => (
                    <div 
                      key={track.videoId + Math.random()}
                      className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 flex gap-4 transition-all group cursor-pointer"
                      onClick={() => {
                        setPlaylist(prev => [track, ...prev.filter(t => t.videoId !== track.videoId)]);
                        setCurrentIndex(0);
                        setIsHistoryOpen(false);
                      }}
                    >
                      <img src={track.thumbnail} className="w-12 h-12 rounded-lg object-cover" alt="" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold truncate group-hover:text-red-500 transition-colors text-left">{track.title}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-left">{track.author}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Player Display */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-24 items-center relative z-20">
          {/* Album Art Container */}
          <div className="relative group">
            <div className="w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] md:w-[380px] md:h-[380px] rounded-[40px] overflow-hidden shadow-2xl shadow-red-950/40 border border-white/5 relative">
              {/* Visualizer bars */}
              {showVisualizer && (
                <div className="absolute bottom-0 inset-x-0 flex items-end justify-center gap-1 opacity-40 h-24 z-20 pointer-events-none">
                  {[...Array(16)].map((_, i) => (
                    <motion.div 
                      key={i}
                      animate={{ 
                        height: playerState === YT_PLAYING ? [10, Math.random() * 80 + 20, 10] : 10 
                      }}
                      transition={{ repeat: Infinity, duration: 0.5 + Math.random() * 0.5 }}
                      className="w-1 bg-white rounded-full mx-0.5"
                    />
                  ))}
                </div>
              )}
              <AnimatePresence mode="wait">
                <motion.div
                  key={metadata.thumbnail}
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.6 }}
                  className="w-full h-full"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-red-600/10 to-transparent z-10" />
                  <img 
                    src={metadata.thumbnail} 
                    alt="Current Track" 
                    className={`w-full h-full object-cover transition-all duration-1000 ${playerState === YT_PLAYING ? 'scale-105 grayscale-0' : 'grayscale-[0.4]'} contrast-[1.1]`}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
            
            <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-[#111] border border-white/10 rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
               <Youtube className="w-8 h-8 text-red-600" />
            </div>

            {/* YT Player Container - Hidden or Floating */}
            <div className={
              isFloating 
                ? "fixed bottom-6 right-6 w-72 md:w-96 aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-black border border-white/20 z-[100] transition-all bg-black"
                : "absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
            }>
              <div id="yt-player" className="w-full h-full" />
            </div>
          </div>

          {/* Track Info & Controls */}
          <div className="flex flex-col w-full max-w-[420px] text-center lg:text-left">
            <div className="mb-10">
              <motion.h2 
                key={metadata.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-4xl md:text-5xl font-light leading-[1.1] mb-3 tracking-tight line-clamp-2"
              >
                {metadata.title}
              </motion.h2>
              <p className="text-red-600 font-bold tracking-[0.2em] uppercase text-xs">
                {metadata.author} &bull; Remote Stream
              </p>
            </div>

            {/* Scrubber */}
            <div className="mb-12">
              <div className="w-full h-1 bg-white/10 rounded-full mb-3 cursor-pointer group relative">
                <div 
                  className="h-full bg-red-600 rounded-full relative transition-all"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                >
                  <div className="absolute right-0 -top-[5px] w-3.5 h-3.5 bg-white rounded-full shadow-lg shadow-red-600/50 scale-0 group-hover:scale-100 transition-transform" />
                </div>
              </div>
              <div className="flex justify-between text-[11px] font-mono text-gray-500 uppercase tracking-widest font-bold">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 mb-12">
              <button 
                onClick={() => {
                  if (player) {
                    if (isMuted) { player.unMute(); setIsMuted(false); setVolume(50); }
                    else { player.mute(); setIsMuted(true); setVolume(0); }
                  }
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input 
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-red-600 transition-all hover:h-1.5"
              />
              <span className="text-[10px] font-mono text-gray-500 w-8">{volume}%</span>
            </div>

            {/* Transport Controls */}
            <div className="flex items-center justify-between px-4">
              <button 
                onClick={handlePrev}
                disabled={currentIndex <= 0}
                className="text-gray-500 hover:text-white transition-colors disabled:opacity-10"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              
              <button 
                onClick={togglePlay}
                className="w-24 h-24 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl shadow-white/10"
              >
                {playerState === YT_PLAYING ? (
                  <Pause className="w-10 h-10 fill-black" />
                ) : (
                  <Play className="w-10 h-10 ml-2 fill-black" />
                )}
              </button>

              <button 
                onClick={handleNext}
                disabled={currentIndex >= playlist.length - 1}
                className="text-gray-500 hover:text-white transition-colors disabled:opacity-10"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </div>

            {/* Secondary Controls */}
            <div className="flex flex-wrap justify-between mt-12 px-2 items-center gap-2">
              <button 
                onClick={() => {
                  if (player) {
                    if (isMuted) { player.unMute(); setIsMuted(false); }
                    else { player.mute(); setIsMuted(true); }
                  }
                }}
                className="p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all text-gray-400 hover:text-white flex-1 flex justify-center"
                title="Mute/Unmute"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <button 
                onClick={() => setIsShuffle(!isShuffle)}
                className={`p-3 rounded-xl border transition-all flex-1 flex justify-center ${isShuffle ? 'bg-red-600/20 border-red-600/50 text-red-500' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                title="Shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button 
                onClick={() => setRepeatMode(prev => (prev + 1) % 3 as any)}
                className={`p-3 rounded-xl border transition-all flex-1 flex justify-center ${repeatMode !== 0 ? 'bg-red-600/20 border-red-600/50 text-red-500' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                title={repeatMode === 1 ? "Repeat One" : repeatMode === 2 ? "Repeat All" : "No Repeat"}
              >
                {repeatMode === 1 ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>

              <button 
                onClick={cyclePlaybackRate}
                className={`p-3 rounded-xl border transition-all flex-1 flex justify-center items-center gap-1 ${playbackRate !== 1 ? 'bg-blue-600/20 border-blue-600/50 text-blue-500' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                title="Playback Speed"
              >
                <Gauge className="w-5 h-5" />
                <span className="text-[10px] font-bold">{playbackRate}x</span>
              </button>

              <button 
                onClick={() => setAutoPlayNext(!autoPlayNext)}
                className={`p-3 rounded-xl border transition-all flex-1 flex justify-center items-center gap-1 ${autoPlayNext ? 'bg-green-600/20 border-green-600/50 text-green-500' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                title={autoPlayNext ? "Auto-Play Next: ON" : "Auto-Play Next: OFF"}
              >
                {autoPlayNext ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              </button>

              <button 
                onClick={() => setIsFloating(!isFloating)}
                className={`p-3 rounded-xl border transition-all flex-1 flex justify-center items-center gap-1 ${isFloating ? 'bg-pink-600/20 border-pink-600/50 text-pink-500' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                title="Picture in Picture Mode window"
              >
                <PictureInPicture className="w-5 h-5" />
              </button>

              <button 
                onClick={cycleSleepTimer}
                className={`p-3 rounded-xl border transition-all flex-1 flex justify-center items-center gap-1 ${sleepTimerRemaining !== null ? 'bg-orange-600/20 border-orange-600/50 text-orange-500' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                title="Sleep Timer"
              >
                <Timer className="w-5 h-5" />
                {sleepTimerRemaining !== null && (
                  <span className="text-[10px] font-bold">{Math.ceil(sleepTimerRemaining / 60)}m</span>
                )}
              </button>

              <button 
                onClick={() => {
                  const currentTrack = playlist[currentIndex];
                  if (currentTrack) {
                    openDownloadModal(currentTrack.videoId);
                  }
                }}
                disabled={currentIndex === -1}
                className="p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all text-gray-400 hover:text-white disabled:opacity-20 flex-1 flex justify-center"
                title="Download Track"
              >
                <Download className="w-5 h-5" />
              </button>

              <button 
                onClick={shareTrack}
                disabled={currentIndex === -1}
                className="p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all text-gray-400 hover:text-white disabled:opacity-20 flex-1 flex justify-center"
                title="Share Song"
              >
                <Share2 className="w-5 h-5" />
              </button>
              
              <button 
                onClick={() => {
                  const currentTrack = playlist[currentIndex];
                  if (currentTrack) {
                    const win = window.open(`https://www.youtube.com/watch?v=${currentTrack.videoId}`, '_blank');
                    win?.focus();
                  }
                }}
                disabled={currentIndex === -1}
                className="p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all text-gray-400 hover:text-white disabled:opacity-20 flex-1 flex justify-center"
                title="Open in YouTube"
              >
                <ExternalLink className="w-5 h-5" />
              </button>

              <button 
                onClick={() => setIsPlaylistOpen(!isPlaylistOpen)}
                className={`p-3 rounded-xl border transition-all flex-1 flex justify-center ${isPlaylistOpen ? 'bg-red-600 border-red-600 text-white' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                title="Playlist"
              >
                <Layers className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Utility Bar */}
      <footer className="grid grid-cols-2 lg:grid-cols-3 px-8 py-6 border-t border-white/10 bg-[#080808] relative z-20">
        <div className="flex flex-col justify-center">
          <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] mb-1 font-bold">Audio Profile</span>
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-red-600" />
            <span className="text-sm font-medium">192kbps / OPUS-L</span>
          </div>
        </div>

        <div className="hidden lg:flex justify-center items-center gap-4">
           <div className="flex items-center gap-2 px-4 py-2 border border-white/10 rounded-lg text-[10px] uppercase tracking-widest text-gray-400 font-bold hover:bg-white/5 cursor-pointer">
             <Layers className="w-3 h-3" /> PWA Standalone
           </div>
           <div className="flex items-center gap-2 px-4 py-2 bg-red-600/10 border border-red-600/30 rounded-lg text-[10px] uppercase tracking-widest text-red-500 font-bold">
             <Activity className="w-3 h-3" /> MediaSession
           </div>
        </div>

        <div className="flex flex-col justify-center items-end text-right">
          <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] mb-1 font-bold">Session Integrity</span>
          <span className="text-sm font-medium text-red-500 flex items-center gap-2">
            Locked <Lock className="w-3 h-3" />
          </span>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap');
        
        body {
          font-family: 'Inter', sans-serif;
          overscroll-behavior: none;
          background: #050505;
        }

        .font-mono {
            font-family: 'JetBrains Mono', monospace;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(220, 38, 38, 0.5);
        }

        ::-webkit-scrollbar {
          width: 0px;
        }
      `}} />
    </div>
  );
}

function SortableItem({ track, index, currentIndex, playTrack, removeTrack, downloadTrack }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.6 : 1
  };

  return (
    <motion.div 
      ref={setNodeRef}
      style={style}
      layout
      className={`p-3 rounded-2xl border flex gap-4 transition-all group ${
        currentIndex === index 
          ? 'bg-red-600/20 border-red-600/30' 
          : 'bg-white/5 border-white/5 hover:border-white/10'
      }`}
    >
      <div 
        {...attributes} 
        {...listeners} 
        className="flex items-center text-gray-600 hover:text-white cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="relative flex-shrink-0 cursor-pointer" onClick={() => playTrack(index)}>
        <img src={track.thumbnail} className="w-16 h-16 rounded-xl object-cover shadow-lg" alt="" />
        {currentIndex === index && (
          <div className="absolute inset-0 bg-red-600/20 flex items-center justify-center rounded-xl">
            <Activity className="w-6 h-6 text-red-500 animate-pulse" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center cursor-pointer" onClick={() => playTrack(index)}>
        <h4 className={`text-sm font-bold truncate ${currentIndex === index ? 'text-red-500' : ''}`}>{track.title}</h4>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">{track.author}</p>
      </div>
      <div className="flex flex-col gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => downloadTrack(track.videoId)} className="p-1 hover:text-blue-500 text-gray-500"><Download className="w-4 h-4" /></button>
        <button onClick={() => removeTrack(track.id)} className="p-1 hover:text-red-500 text-gray-500"><Trash2 className="w-4 h-4" /></button>
      </div>
    </motion.div>
  );
}
