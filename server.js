import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import axios from 'axios';
import ytdl from '@distube/ytdl-core';
import instagramGetUrl from 'instagram-url-direct';

const igGet = typeof instagramGetUrl === 'function' ? instagramGetUrl : (instagramGetUrl).default || instagramGetUrl;

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors({
    origin: "*"
  }));
  app.use(express.json());

  // Download Proxy Route
  app.get('/api/download', async (req, res) => {
    const { url, filename } = req.query;
    if (!url) return res.status(400).send('URL is required');

    try {
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://www.youtube.com/'
        }
      });

      const cleanFilename = (filename || 'download').replace(/[^a-z0-9.]/gi, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
      res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
      
      response.data.pipe(res);
    } catch (error) {
      console.error('Download proxy error:', error.message);
      res.status(500).send('Failed to proxy download');
    }
  });

  // API Routes
  app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const info = await ytdl.getInfo(url);
        res.json({
          title: info.videoDetails.title,
          thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
          duration: parseInt(info.videoDetails.lengthSeconds),
          uploader: info.videoDetails.author.name,
          formats: info.formats
            .filter((f) => f.hasVideo && f.hasAudio)
            .map((f) => ({
              formatId: f.itag,
              extension: 'mp4',
              resolution: f.qualityLabel,
              filesize: f.contentLength ? parseInt(f.contentLength) : 0,
              url: f.url,
              vcodec: f.videoCodec,
              acodec: f.audioCodec,
            }))
            .concat(
              info.formats
                .filter((f) => !f.hasVideo && f.hasAudio)
                .map((f) => ({
                  formatId: f.itag,
                  extension: 'mp3',
                  resolution: 'Audio Only',
                  filesize: f.contentLength ? parseInt(f.contentLength) : 0,
                  url: f.url,
                  vcodec: 'none',
                  acodec: f.audioCodec,
                }))
            ),
        });
      } else if (url.includes('instagram.com')) {
        const info = await igGet(url);
        if (info && info.url_list && info.url_list.length > 0) {
          res.json({
            title: 'Instagram Video',
            thumbnail: 'https://picsum.photos/seed/instagram/400/400',
            duration: 0,
            uploader: 'Instagram User',
            formats: info.url_list.map((u, idx) => ({
              formatId: `ig-${idx}`,
              extension: 'mp4',
              resolution: 'Original',
              filesize: 0,
              url: u,
              vcodec: 'h264',
              acodec: 'aac',
            })),
          });
        } else {
          throw new Error('Failed to extract Instagram video URL');
        }
      } else {
        // Generic fallback or other platforms
        res.status(400).json({ error: 'Unsupported platform. Currently supports YouTube and Instagram.' });
      }
    } catch (error) {
      console.error('Extraction error:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch video info. Make sure the URL is valid.' });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
