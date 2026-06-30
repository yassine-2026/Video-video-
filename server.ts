import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import youtubedl from 'youtube-dl-exec';

const execPromise = util.promisify(exec);

// Set ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegStatic as string);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const app = express();
app.use(express.json());

const PORT = 3000;
const TMP_DIR = path.join(os.tmpdir(), 'quran_video');

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

interface TaskInfo {
  status: 'processing' | 'done' | 'error';
  progress: number;
  videoPath?: string;
  thumbPath?: string;
  error?: string;
  createdAt: number;
}

const tasks: Record<string, TaskInfo> = {};

const RECITERS: Record<string, string> = {
  'عبد الباسط عبد الصمد (مجود)': 'Abdul_Basit_Mujawwad_128kbps',
  'مشاري العفاسي': 'Alafasy_128kbps',
  'ماهر المعيقلي': 'Maher_AlMuaiqly_128kbps',
  'سعد الغامدي': 'Saad_AlGhamdi_128kbps',
  'محمد صديق المنشاوي': 'Minshawi_128kbps',
  'أحمد العجمي': 'Ahmed_ibn_Ali_al-Ajamy_128kbps',
  'فارس عباد': 'Fares_Abbad_64kbps',
  'علي الحذيفي': 'Hudhaify_128kbps',
};

const BACKGROUNDS: Record<string, string> = {
  'جبال': 'mountains',
  'سماء': 'sky clouds',
  'مسجد': 'mosque',
  'بحر': 'ocean waves',
  'غابة': 'forest nature',
  'نجوم': 'stars night',
};

// --- Helper Functions ---
async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await axios.get(url, { responseType: 'stream' });
  const writer = fs.createWriteStream(dest);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function downloadAudioEveryayah(surah: number, start: number, end: number, reciterId: string, workDir: string): Promise<string | null> {
  try {
    const audioFiles: string[] = [];
    const formattedSurah = surah.toString().padStart(3, '0');
    
    for (let ayah = start; ayah <= end; ayah++) {
      const formattedAyah = ayah.toString().padStart(3, '0');
      const url = `https://www.everyayah.com/data/${reciterId}/${formattedSurah}${formattedAyah}.mp3`;
      const destPath = path.join(workDir, `${formattedSurah}${formattedAyah}.mp3`);
      
      console.log(`Downloading audio from: ${url}`);
      await downloadFile(url, destPath);
      audioFiles.push(destPath);
    }
    
    if (audioFiles.length === 1) return audioFiles[0];
    
    // Concat if multiple
    const concatFilePath = path.join(workDir, 'concat.txt');
    const concatContent = audioFiles.map(f => `file '${f}'`).join('\n');
    fs.writeFileSync(concatFilePath, concatContent);
    
    const outputPath = path.join(workDir, 'combined_audio.mp3');
    
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions('-c copy')
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => {
          console.error('Concat error:', err);
          reject(err);
        })
        .run();
    });
  } catch (err) {
    console.error('EveryAyah download failed:', err);
    return null;
  }
}

async function searchYoutubeAudio(query: string, workDir: string): Promise<string | null> {
  try {
    const cookiesPath = path.join(process.cwd(), 'cookies.txt');
    if (!fs.existsSync(cookiesPath) || fs.statSync(cookiesPath).size === 0) {
      throw new Error('cookies.txt is missing or empty. Please provide YouTube cookies for fallback.');
    }
    
    const outputPath = path.join(workDir, 'yt_audio.%(ext)s');
    console.log(`Searching YouTube: ${query}`);
    
    await youtubedl(`ytsearch1:${query}`, {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0,
      output: outputPath,
      cookies: cookiesPath,
      noWarnings: true
    });
    
    const expectedOutput = path.join(workDir, 'yt_audio.mp3');
    if (fs.existsSync(expectedOutput)) {
      return expectedOutput;
    }
    return null;
  } catch (err) {
    console.error('YouTube fallback failed:', err);
    return null;
  }
}

async function getVideoFromPexels(query: string, apiKey: string): Promise<string | null> {
  try {
    const res = await axios.get(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`, {
      headers: { Authorization: apiKey }
    });
    
    if (res.data.videos && res.data.videos.length > 0) {
      for (const video of res.data.videos) {
        const hdFile = video.video_files.find((f: any) => f.quality === 'hd' && f.width >= 1920);
        if (hdFile) return hdFile.link;
      }
      // fallback to any hd or sd
      const anyFile = res.data.videos[0].video_files[0];
      return anyFile?.link || null;
    }
    return null;
  } catch (err) {
    console.error('Pexels search failed:', err);
    return null;
  }
}

async function processVideo(taskId: string, reqData: any) {
  const { surah, startAyah, endAyah, reciter, background } = reqData;
  const workDir = path.join(TMP_DIR, taskId);
  
  try {
    fs.mkdirSync(workDir, { recursive: true });
    tasks[taskId].progress = 10;
    
    const reciterId = RECITERS[reciter];
    let audioPath = await downloadAudioEveryayah(surah, startAyah, endAyah, reciterId, workDir);
    
    if (!audioPath) {
      console.log('EveryAyah failed. Trying YouTube fallback...');
      const reciterNameForSearch = Object.keys(RECITERS).find(k => RECITERS[k] === reciterId) || reciter;
      const ytQuery = `${reciterNameForSearch} سورة ${surah} آية ${startAyah} إلى ${endAyah}`;
      audioPath = await searchYoutubeAudio(ytQuery, workDir);
    }
    
    if (!audioPath) {
      throw new Error('فشل تحميل الصوت من جميع المصادر (EveryAyah و YouTube).');
    }
    
    tasks[taskId].progress = 40;
    
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
      throw new Error('PEXELS_API_KEY is not configured in server environment.');
    }
    
    const bgQuery = BACKGROUNDS[background] || 'nature';
    const videoUrl = await getVideoFromPexels(bgQuery, apiKey);
    
    if (!videoUrl) {
      throw new Error('فشل العثور على فيديو خلفية مناسب من Pexels.');
    }
    
    const videoPath = path.join(workDir, 'bg_video.mp4');
    await downloadFile(videoUrl, videoPath);
    
    tasks[taskId].progress = 60;
    
    const outputPath = path.join(workDir, 'final_output.mp4');
    const thumbPath = path.join(workDir, 'thumb.jpg');
    
    // Merge audio and video
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .inputOptions(['-stream_loop -1'])
        .input(audioPath as string)
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-shortest',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error('فشل دمج الفيديو والصوت: ' + err.message)))
        .run();
    });
    
    tasks[taskId].progress = 90;
    
    // Generate thumbnail
    await new Promise<void>((resolve, reject) => {
      ffmpeg(outputPath)
        .screenshots({
          count: 1,
          timestamps: ['00:00:02'],
          filename: 'thumb.jpg',
          folder: workDir
        })
        .on('end', () => resolve())
        .on('error', () => {
          console.warn('Failed to generate thumbnail, proceeding anyway.');
          resolve();
        });
    });
    
    tasks[taskId].status = 'done';
    tasks[taskId].progress = 100;
    tasks[taskId].videoPath = outputPath;
    tasks[taskId].thumbPath = thumbPath;
    
  } catch (err: any) {
    tasks[taskId].status = 'error';
    tasks[taskId].error = err.message || 'Unknown error occurred.';
    console.error(`Task ${taskId} failed:`, err);
  } finally {
    // Cleanup scheduler (10 mins)
    setTimeout(() => {
      delete tasks[taskId];
      fs.rm(workDir, { recursive: true, force: true }, () => {});
    }, 10 * 60 * 1000);
  }
}

// --- API Routes ---

app.post('/api/generate', (req, res) => {
  const { surah, startAyah, endAyah, reciter, background } = req.body;
  
  if (!surah || !startAyah || !endAyah || !reciter || !background) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!RECITERS[reciter]) {
    return res.status(400).json({ error: 'Invalid reciter.' });
  }
  if (!BACKGROUNDS[background]) {
    return res.status(400).json({ error: 'Invalid background.' });
  }
  
  const taskId = uuidv4();
  tasks[taskId] = {
    status: 'processing',
    progress: 0,
    createdAt: Date.now()
  };
  
  // start processing in background
  processVideo(taskId, req.body);
  
  res.json({ taskId });
});

app.get('/api/status/:taskId', (req, res) => {
  const task = tasks[req.params.taskId];
  if (!task) {
    return res.status(404).json({ error: 'Task not found or expired.' });
  }
  res.json({ status: task.status, progress: task.progress, error: task.error });
});

app.get('/api/download/:taskId', (req, res) => {
  const task = tasks[req.params.taskId];
  if (!task || !task.videoPath || task.status !== 'done') {
    return res.status(404).send('Video not ready or not found.');
  }
  res.download(task.videoPath, `quran_recitation_${req.params.taskId}.mp4`);
});

app.get('/api/thumbnail/:taskId', (req, res) => {
  const task = tasks[req.params.taskId];
  if (!task || !task.thumbPath || !fs.existsSync(task.thumbPath)) {
    return res.status(404).send('Thumbnail not found.');
  }
  res.sendFile(task.thumbPath);
});


// Vite middleware for development or static serving for production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
