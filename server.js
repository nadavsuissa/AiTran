const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const cors = require('cors');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');

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
const gptModel = process.env.OPENAI_GPT_MODEL || 'gpt-4.1-mini';
const ttsVoice = process.env.OPENAI_TTS_VOICE || 'alloy';
const lectureInstructions = `You are a top-tier Hebrew lecturer. Read the attached document, identify each section's core ideas, 
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

/**
 * Recursively walks the Responses API output array and extracts text + audio.
 * @param {Array} outputs
 * @returns {{ script: string, audioBase64: string | null }}
 */
function extractResponsePayload(outputs = []) {
    let script = '';
    let audioBase64 = null;

    const recurse = (node) => {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach(recurse);
            return;
        }

        if (node.type === 'output_text' && node.text) {
            script += node.text;
        } else if (node.type === 'text' && node.text) {
            script += node.text;
        } else if ((node.type === 'output_audio' || node.type === 'audio') && node.audio?.data) {
            audioBase64 = node.audio.data;
        }

        if (node.content) recurse(node.content);
    };

    recurse(outputs);

    return { script: script.trim(), audioBase64 };
}

// Routes
app.post('/api/process', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const outputFilename = `${uuidv4()}.mp3`;
    const outputPath = path.join(__dirname, 'downloads', outputFilename);
    let uploadedFileId = null;

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
            purpose: 'assistants',
        });
        uploadedFileId = uploadedFile.id;

        console.log('Creating lecture (text + audio) via Responses API...');
        const response = await openai.responses.create({
            model: gptModel,
            modalities: ['text', 'audio'],
            audio: {
                voice: ttsVoice,
                format: 'mp3',
            },
            instructions: lectureInstructions,
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'עבור על המסמך המצורף, זהה את הנושאים המרכזיים וכתוב הרצאה קולית בעברית בלבד.',
                        },
                        {
                            type: 'input_file',
                            file_id: uploadedFile.id,
                        },
                    ],
                },
            ],
        });

        const { script, audioBase64 } = extractResponsePayload(response.output);

        if (!script) {
            throw new Error('OpenAI did not return a Hebrew script.');
        }

        if (!audioBase64) {
            throw new Error('OpenAI did not return audio data.');
        }

        const audioBuffer = Buffer.from(audioBase64, 'base64');
        await fs.promises.writeFile(outputPath, audioBuffer);

        cleanupLocal();
        if (uploadedFileId) {
            openai.files.del(uploadedFileId).catch(() => {});
        }

        // Return download link + script
        const downloadUrl = `/downloads/${outputFilename}`;
        res.json({ success: true, downloadUrl, script });

    } catch (error) {
        console.error('Error processing file:', error);
        cleanupLocal();
        if (uploadedFileId) {
            openai.files.del(uploadedFileId).catch(() => {});
        }
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

