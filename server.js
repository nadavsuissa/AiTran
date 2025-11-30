const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const cors = require('cors');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
// Removed extractText import as we are using OpenAI Responses API for file analysis
// const { extractText } = require('./utils/textExtractor');

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
const gptModel = process.env.OPENAI_GPT_MODEL || 'gpt-5.1';
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

        console.log('Uploading file to OpenAI for direct analysis...');
        const uploadedFile = await openai.files.create({
            file: fs.createReadStream(filePath),
            purpose: 'user_data',
        });

        console.log('Creating analysis via Responses API...');
        // Note: Responses API does not yet support audio output directly, so we request text first.
        const response = await openai.responses.create({
            model: gptModel,
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: 'עבור על המסמך המצורף, זהה את הנושאים המרכזיים וכתוב הרצאה קולית בעברית בלבד. ההרצאה צריכה להיות מרתקת ומלמדת.'
                        },
                        {
                            type: 'input_file',
                            file_id: uploadedFile.id,
                        },
                    ],
                },
            ],
        });

        const script = response.output_text; // Using helper property as per docs

        if (!script) {
            throw new Error('OpenAI did not return a script from Responses API.');
        }

        console.log('Generating audio via TTS API...');
        const mp3 = await openai.audio.speech.create({
            model: 'tts-1',
            voice: ttsVoice,
            input: script,
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(outputPath, buffer);

        // Cleanup OpenAI file if possible/needed (optional but good practice)
        // Note: Responses API might persist files differently, but usually we delete user_data after use if not needed.
        // However, docs don't strictly mandate deletion for Responses API usage immediately.
        // We'll leave it for now or delete it if we want to be clean.
        // await openai.files.del(uploadedFile.id).catch(() => {}); 

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

