const express = require('express');
const fetch = require('node-fetch');
const cors =require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

app.use(cors());

// 创建临时文件夹
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// 获取视频信息的API
app.get('/api/bilibili', async (req, res) => {
    // SESSDATA 从前端的请求参数中获取
    const { bvid, sessdata } = req.query;
    if (!bvid) return res.status(400).json({ error: '缺少 bvid 参数' });

    const headers = {
        'Referer': 'https://www.bilibili.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    };
    // 如果前端传来了SESSDATA，就添加到请求头中
    if (sessdata) {
        headers['Cookie'] = `SESSDATA=${sessdata}`;
    }

    try {
        const viewApiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        const viewResponse = await fetch(viewApiUrl, { headers });
        const viewData = await viewResponse.json();
        if (viewData.code !== 0) throw new Error(`获取视频信息失败: ${viewData.message}`);

        const cid = viewData.data.cid;
        const videoTitle = viewData.data.title.replace(/[\\/:*?"<>|]/g, '');
        
        const playUrlApi = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=80`;
        const playUrlResponse = await fetch(playUrlApi, { headers });
        const playUrlData = await playUrlResponse.json();
        if (playUrlData.code !== 0) throw new Error(`获取播放链接失败: ${playUrlData.message}`);
        
        res.json({ success: true, title: videoTitle, biliData: playUrlData.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 合并下载的API，保持不变
app.get('/api/merge-download', async (req, res) => {
    // ... (这部分代码与上一版完全相同，此处省略)
    const { videoUrl, audioUrl, title } = req.query;
    if (!videoUrl || !audioUrl || !title) return res.status(400).send('缺少参数');
    const videoPath = path.join(TEMP_DIR, `video_${Date.now()}.m4s`);
    const audioPath = path.join(TEMP_DIR, `audio_${Date.now()}.m4s`);
    const outputPath = path.join(TEMP_DIR, `${title}.mp4`);
    try {
        await downloadFile(videoUrl, videoPath);
        await downloadFile(audioUrl, audioPath);
        await mergeFiles(videoPath, audioPath, outputPath);
        res.download(outputPath, `${title}.mp4`, () => {
            fs.unlinkSync(videoPath);
            fs.unlinkSync(audioPath);
            fs.unlinkSync(outputPath);
        });
    } catch (error) {
        console.error('处理失败:', error);
        res.status(500).send('处理文件时发生错误');
    }
});

async function downloadFile(url, dest) {
    const headers = { 'Referer': 'https://www.bilibili.com/' };
    const response = await fetch(url, { headers });
    const fileStream = fs.createWriteStream(dest);
    return new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
    });
}

function mergeFiles(videoPath, audioPath, outputPath) {
    const command = `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a copy "${outputPath}"`;
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) return reject(new Error(stderr));
            resolve(stdout);
        });
    });
}

app.listen(PORT, () => console.log(`服务器已启动，正在监听 http://localhost:${PORT}`));