const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const cors = require('cors');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const { extractText } = require('./utils/textExtractor');

// Ensure upload and download directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const downloadsDir = path.join(__dirname, 'downloads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const gptModel = process.env.OPENAI_GPT_MODEL || 'gpt-4o-mini';
const ttsVoice = process.env.OPENAI_TTS_VOICE || 'alloy';
const lectureInstructions = `You are a top-tier Hebrew lecturer. Read the provided document text, identify each section's core ideas,
and craft a concise yet rich lecture script entirely in Hebrew. Use clear pedagogy, smooth transitions,
and mention practical examples when the source allows it. Output ONLY the Hebrew lecture text without introductions in other languages.`;

// OpenAI Setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Multer Setup for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Routes
app.post('/api/process', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const outputFilename = `${uuidv4()}.mp3`;
    const outputPath = path.join(__dirname, 'downloads', outputFilename);

    const cleanupLocal = () => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (cleanupError) {
            console.error('Failed to cleanup local file:', cleanupError);
        }
    };

    try {
        // Verify file exists before processing
        if (!fs.existsSync(filePath)) {
            throw new Error(`Uploaded file not found at: ${filePath}`);
        }

        console.log('Extracting text from uploaded document...');
        const extractedText = await extractText(filePath);

        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('Could not extract text from file.');
        }

        console.log('Creating Hebrew lecture script via ChatGPT...');
        const completion = await openai.chat.completions.create({
            model: gptModel,
            messages: [
                {
                    role: 'system',
                    content: lectureInstructions,
                },
                {
                    role: 'user',
                    content: extractedText.substring(0, 120000), // safety limit
                },
            ],
        });

        const script = completion.choices[0].message.content;

        if (!script) {
            throw new Error('OpenAI did not return a Hebrew script.');
        }

        console.log('Generating audio via TTS API...');
        const mp3 = await openai.audio.speech.create({
            model: 'tts-1',
            voice: ttsVoice,
            input: script,
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(outputPath, buffer);

        cleanupLocal();

        // Return download link + script
        const downloadUrl = `/downloads/${outputFilename}`;
        res.json({ success: true, downloadUrl, script });

    } catch (error) {
        console.error('Error processing file:', error);
        cleanupLocal();
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

