import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import ytSearch from "yt-search";
import ytsr from "ytsr";
import lyricsFinder from "lyrics-finder";
import ytdl from "@distube/ytdl-core";
import crypto from "crypto";

const downloadTokens = new Map<string, any>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // YouTube Search Endpoint with Filters
  app.get("/api/search", async (req, res) => {
    try {
      const { q, type, duration, sort } = req.query;
      if (!q || typeof q !== "string") {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      // If filters are present, we use ytsr for its filtering capabilities
      if (type || duration || sort) {
        const filters1 = await ytsr.getFilters(q);
        let filter: any;
        
        // Example logic to pick filters (simplified)
        if (type === 'video') filter = filters1.get('Type').get('Video');
        if (duration === 'short') filter = (filter || filters1).get('Duration').get('Under 4 minutes');
        if (duration === 'long') filter = (filter || filters1).get('Duration').get('Over 20 minutes');
        if (sort === 'date') filter = (filter || filters1).get('Sort by').get('Upload date');
        if (sort === 'rating') filter = (filter || filters1).get('Sort by').get('Rating');

        const searchResults = await ytsr(filter ? filter.url : q, { limit: 10 });
        const videos = searchResults.items
          .filter((item: any) => item.type === 'video')
          .map((v: any) => ({
            videoId: v.id,
            title: v.title,
            author: v.author?.name || "Unknown",
            thumbnail: v.bestThumbnail?.url || v.thumbnails?.[0]?.url,
            timestamp: v.duration,
            views: v.views
          }));
        return res.json({ videos });
      }

      // Default back to yt-search for better general results if no filters
      const results = await ytSearch(q);
      const videos = results.videos.slice(0, 10).map((v) => ({
        videoId: v.videoId,
        title: v.title,
        author: v.author.name,
        thumbnail: v.thumbnail || v.image,
        timestamp: v.timestamp,
        views: v.views
      }));

      res.json({ videos });
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Failed to perform YouTube search" });
    }
  });

  // Lyrics Endpoint
  app.get("/api/lyrics", async (req, res) => {
    try {
      const { artist, title } = req.query;
      if (!title || typeof title !== "string") {
        return res.status(400).json({ error: "Title is required" });
      }
      
      const lyrics = await lyricsFinder(artist || "", title) || "No lyrics found.";
      res.json({ lyrics });
    } catch (error) {
      console.error("Lyrics error:", error);
      res.status(500).json({ error: "Failed to fetch lyrics" });
    }
  });

  // Prepare Download Endpoint
  app.post("/api/download/prepare", (req, res) => {
    const { id, type, quality, cookies, captionLang } = req.body;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Video ID is required" });
    }

    const token = crypto.randomBytes(16).toString("hex");
    downloadTokens.set(token, { id, type, quality, cookies, captionLang });
    
    // Cleanup token after 5 minutes
    setTimeout(() => downloadTokens.delete(token), 300000);
    
    res.json({ token });
  });

  // Execute Download Endpoint
  app.get("/api/download", async (req, res) => {
    try {
      const { token } = req.query;
      const config = downloadTokens.get(token as string);
      
      if (!config) {
         // Fallback for simple direct GET download
         const id = req.query.id as string;
         if (!id) return res.status(400).json({ error: "Invalid token or missing ID" });
         const info = await ytdl.getInfo(id);
         const title = info.videoDetails.title.replace(/[^\w\s-]/g, '') || "audio";
         res.header("Content-Disposition", `attachment; filename="${encodeURIComponent(title)}.mp3"`);
         res.header("Content-Type", "audio/mpeg");
         return ytdl(id, { filter: "audioonly", quality: "highestaudio" }).pipe(res);
      }

      downloadTokens.delete(token as string);
      
      const { id, type, quality, cookies, captionLang } = config;
      
      let agent;
      if (cookies) {
        try {
          const parsedCookies = JSON.parse(cookies);
          agent = ytdl.createAgent(parsedCookies);
        } catch (e) {
          console.error("Invalid cookies format", e);
        }
      }

      const info = await ytdl.getInfo(id, { agent });
      const title = info.videoDetails.title.replace(/[^\w\s-]/g, '') || "download";
      
      if (captionLang) {
        const captionTracks = info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        const track = captionTracks.find((t: any) => t.languageCode === captionLang || t.name?.simpleText === captionLang);
        if (track && track.baseUrl) {
            // Download just the subtitle track if requested, as it's separate
            res.header("Content-Disposition", `attachment; filename="${encodeURIComponent(title)}_${captionLang}.vtt"`);
            res.header("Content-Type", "text/vtt");
            const captionContent = await fetch(track.baseUrl).then(r => r.text());
            return res.send(captionContent);
        }
      }
      
      const isVideo = type === "video";
      const ext = isVideo ? "mp4" : "mp3";
      res.header("Content-Disposition", `attachment; filename="${encodeURIComponent(title)}.${ext}"`);
      res.header("Content-Type", isVideo ? "video/mp4" : "audio/mpeg");

      const ytdlOptions: any = { agent };
      if (isVideo) {
        ytdlOptions.filter = "videoandaudio"; // requires a format that has both, usually max 720p
        ytdlOptions.quality = quality === "high" ? "highest" : "lowest";
      } else {
        ytdlOptions.filter = "audioonly";
        ytdlOptions.quality = quality === "high" ? "highestaudio" : "lowestaudio";
      }

      ytdl(id, ytdlOptions).pipe(res);
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ error: "Failed to download media" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
