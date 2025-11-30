# AI Lecture Generator

This Node.js application allows users to upload documents (PDF, DOCX, PPTX, XLSX), hands the raw file to OpenAI for multimodal understanding, and returns both a Hebrew lecture script and an audio narration generated directly by the model.

## Features

-   **File Support**: PDF, Word (DOCX), PowerPoint (PPTX), Excel (XLSX).
-   **AI Analysis**: Sends the original file to OpenAI's Responses API (GPT-4.1 family) so the model can interpret the content itself—no manual parsing required.
-   **Hebrew Audio**: Requests an MP3 narration (Hebrew) from the same API call, producing both script + audio in one shot.
-   **Download**: Users can listen to or download the generated lecture.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configure Environment**:
    Create a `.env` file in the root directory and add your OpenAI credentials (Render supports these as dashboard variables too):
    ```env
    PORT=3000
    OPENAI_API_KEY=sk-your-api-key-here
    OPENAI_GPT_MODEL=gpt-4.1-mini      # optional override
    OPENAI_TTS_VOICE=alloy             # optional override
    ```

3.  **Run Locally**:
    ```bash
    npm start
    ```
    Visit `http://localhost:3000` in your browser.

## Deployment on Render

1.  Push this code to a GitHub repository.
2.  Create a new **Web Service** on [Render](https://render.com/).
3.  Connect your GitHub repository.
4.  **Settings**:
    -   **Build Command**: `npm install`
    -   **Start Command**: `npm start`
5.  **Environment Variables**:
    -   Add `OPENAI_API_KEY` with your actual OpenAI key.
    -   Add `PORT` (optional, Render usually handles this automatically, defaulting to 10000, but the app reads `process.env.PORT`).

## Requirements

-   Node.js v18+
-   OpenAI API Key with access to GPT-4.1 (or newer) multimodal + TTS output.

