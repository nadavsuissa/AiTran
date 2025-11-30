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

// Removed extractResponsePayload function as it's no longer needed

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

        console.log('Creating assistant and thread for document analysis...');
        let assistantId = null;
        let threadId = null;

        try {
            const assistant = await openai.beta.assistants.create({
                name: 'Document Lecturer',
                instructions: lectureInstructions,
                model: gptModel,
                tools: [{ type: 'file_search' }],
            });
            assistantId = assistant.id;

            const thread = await openai.beta.threads.create();
            threadId = thread.id;

            await openai.beta.threads.messages.create(threadId, {
                role: 'user',
                content: 'עבור על המסמך המצורף, זהה את הנושאים המרכזיים וכתוב הרצאה קולית בעברית בלבד.',
                attachments: [
                    {
                        file_id: uploadedFile.id,
                        tools: [{ type: 'file_search' }],
                    },
                ],
            });

            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId,
            });

            // Wait for the run to complete
            let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            let attempts = 0;
            const maxAttempts = 120; // 2 minutes timeout

            while (runStatus.status !== 'completed' && attempts < maxAttempts) {
                if (runStatus.status === 'failed' || runStatus.status === 'cancelled' || runStatus.status === 'expired') {
                    throw new Error(`Assistant run ${runStatus.status}: ${runStatus.last_error?.message || 'Unknown error'}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                attempts++;
            }

            if (attempts >= maxAttempts) {
                throw new Error('Assistant run timed out after 2 minutes');
            }

            const messages = await openai.beta.threads.messages.list(threadId);
            const script = messages.data[0].content[0].text.value;

            if (!script) {
                throw new Error('OpenAI did not return a Hebrew script.');
            }

            // Clean up assistant and thread
            if (assistantId) {
                try {
                    await openai.beta.assistants.del(assistantId);
                } catch (cleanupError) {
                    console.error('Failed to cleanup assistant:', cleanupError);
                }
            }
            if (threadId) {
                try {
                    await openai.beta.threads.del(threadId);
                } catch (cleanupError) {
                    console.error('Failed to cleanup thread:', cleanupError);
                }
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
            if (uploadedFileId) {
                try {
                    await openai.files.delete(uploadedFileId);
                } catch (delError) {
                    console.error('Failed to delete OpenAI file:', delError);
                }
            }

            // Return download link + script
            const downloadUrl = `/downloads/${outputFilename}`;
            res.json({ success: true, downloadUrl, script });

        } catch (innerError) {
            // Clean up resources on error
            if (assistantId) {
                try {
                    await openai.beta.assistants.del(assistantId);
                } catch (e) { /* ignore */ }
            }
            if (threadId) {
                try {
                    await openai.beta.threads.del(threadId);
                } catch (e) { /* ignore */ }
            }
            throw innerError; // Re-throw to outer catch
        }

    } catch (error) {
        console.error('Error processing file:', error);
        cleanupLocal();
        if (uploadedFileId) {
            try {
                await openai.files.delete(uploadedFileId);
            } catch (delError) {
                console.error('Failed to delete OpenAI file:', delError);
            }
        }
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

